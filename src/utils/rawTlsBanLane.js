import tls from 'node:tls';
import dns from 'node:dns';

const DEFAULT_HOST = 'discord.com';
const DEFAULT_PORT = 443;
const POOL_SIZE = 12;
const HEARTBEAT_MS = 10_000;
const DNS_REFRESH_MS = 60_000;
const REQUEST_TIMEOUT_MS = 1_500;

const REQ_PREFIX = Buffer.from('PUT /api/v10/guilds/', 'ascii');
const REQ_BANS = Buffer.from('/bans/', 'ascii');
const REQ_VER_HOST = Buffer.from(' HTTP/1.1\r\nHost: discord.com\r\nAuthorization: ', 'ascii');
const REQ_HEADERS = Buffer.from('\r\nContent-Type: application/json\r\nContent-Length: 29\r\nX-Audit-Log-Reason: ', 'ascii');
const REQ_TAIL = Buffer.from('\r\nConnection: keep-alive\r\n\r\n{"delete_message_seconds":0}', 'ascii');
const PING_FRAME = Buffer.from('GET /api/v10/gateway HTTP/1.1\r\nHost: discord.com\r\nConnection: keep-alive\r\n\r\n', 'ascii');
const CRLF_CRLF = Buffer.from('\r\n\r\n', 'ascii');
const CHUNK_END = Buffer.from('0\r\n\r\n', 'ascii');
const REASON_MAX_AGE_CACHE_MS = 60_000;

// Shared per-route & global Discord REST rate-limit bucket tracker
const routeBuckets = new Map(); // routeKey -> { remaining, resetAtMs, bucket }
let globalRateLimitUntilMs = 0;
let rateLimitHits = 0;
let auxRequestsServed = 0;

function pruneRouteBuckets(now) {
  if (routeBuckets.size < 400) return;
  for (const [key, entry] of routeBuckets.entries()) {
    if (!entry || entry.resetAtMs <= now || routeBuckets.size > 450) {
      routeBuckets.delete(key);
    }
    if (routeBuckets.size <= 300) break;
  }
}

export function getRouteWaitMs(routeKey) {
  const now = Date.now();
  let waitMs = 0;
  if (globalRateLimitUntilMs > now) {
    waitMs = Math.max(waitMs, globalRateLimitUntilMs - now);
  }
  if (routeKey) {
    const state = routeBuckets.get(routeKey);
    if (state) {
      if (state.resetAtMs <= now) {
        routeBuckets.delete(routeKey);
      } else if (state.remaining <= 0) {
        waitMs = Math.max(waitMs, state.resetAtMs - now);
      }
    }
  }
  return Math.min(waitMs, 5_000);
}

export function recordRateLimitState(routeKey, statusCode, headersLowerStrOrObj, retryAfterSec = null) {
  const now = Date.now();
  let remaining = null;
  let resetAfterSec = null;
  let bucket = null;
  let isGlobal = false;
  let retryHdrSec = null;

  if (typeof headersLowerStrOrObj === 'string') {
    const remM = headersLowerStrOrObj.match(/\r\nx-ratelimit-remaining:\s*(\d+)/);
    if (remM) remaining = parseInt(remM[1], 10);
    const rstM = headersLowerStrOrObj.match(/\r\nx-ratelimit-reset-after:\s*([0-9.]+)/);
    if (rstM) resetAfterSec = Number(rstM[1]);
    const bktM = headersLowerStrOrObj.match(/\r\nx-ratelimit-bucket:\s*([^\r\n]+)/);
    if (bktM) bucket = bktM[1].trim();
    if (headersLowerStrOrObj.includes('\r\nx-ratelimit-global: true')) isGlobal = true;
    const raM = headersLowerStrOrObj.match(/\r\nretry-after:\s*([0-9.]+)/);
    if (raM) retryHdrSec = Number(raM[1]);
  } else if (headersLowerStrOrObj && typeof headersLowerStrOrObj === 'object') {
    const getH = (k) => {
      const v = headersLowerStrOrObj[k];
      return Array.isArray(v) ? v[0] : v;
    };
    const remV = getH('x-ratelimit-remaining');
    if (remV !== undefined) remaining = parseInt(String(remV), 10);
    const rstV = getH('x-ratelimit-reset-after');
    if (rstV !== undefined) resetAfterSec = Number(rstV);
    const bktV = getH('x-ratelimit-bucket');
    if (bktV) bucket = String(bktV).trim();
    if (String(getH('x-ratelimit-global')).toLowerCase() === 'true') isGlobal = true;
    const raV = getH('retry-after');
    if (raV !== undefined) retryHdrSec = Number(raV);
  }

  const effectiveRetrySec = Number.isFinite(retryAfterSec) && retryAfterSec > 0
    ? retryAfterSec
    : (Number.isFinite(retryHdrSec) && retryHdrSec > 0 ? retryHdrSec : resetAfterSec);

  if (statusCode === 429) {
    rateLimitHits++;
    const waitMs = Math.min(5_000, Math.max(50, Math.ceil((Number(effectiveRetrySec) || 0.25) * 1000)));
    if (isGlobal) {
      globalRateLimitUntilMs = Math.max(globalRateLimitUntilMs, now + waitMs);
    }
    if (routeKey) {
      routeBuckets.set(routeKey, { remaining: 0, resetAtMs: now + waitMs, bucket });
    }
    return waitMs;
  }

  if (routeKey && Number.isFinite(remaining) && Number.isFinite(resetAfterSec)) {
    pruneRouteBuckets(now);
    routeBuckets.set(routeKey, {
      remaining,
      resetAtMs: now + Math.max(50, Math.ceil(resetAfterSec * 1000)),
      bucket
    });
  }
  return 0;
}

const authBufCache = new Map();
function getAuthBuffer(authHeader) {
  let b = authBufCache.get(authHeader);
  if (!b) {
    if (authBufCache.size > 4) authBufCache.clear();
    b = Buffer.from(authHeader, 'ascii');
    authBufCache.set(authHeader, b);
  }
  return b;
}

let targetConfig = {
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  servername: DEFAULT_HOST,
  rejectUnauthorized: true
};

let initialized = false;
let shuttingDown = false;
let testMode = false;
let cachedIpv4 = null;
let cachedTlsSession = null;
let dnsTimer = null;
let heartbeatTimer = null;
let consecutiveErrors = 0;
let connectingCount = 0;
let strikesServed = 0;

const allSockets = new Set();
const idleSockets = [];

function resolveTargetIp() {
  if (targetConfig.host === '127.0.0.1' || targetConfig.host === 'localhost') {
    cachedIpv4 = '127.0.0.1';
    return;
  }
  dns.lookup(targetConfig.host, { family: 4 }, (err, address) => {
    if (!err && address) cachedIpv4 = address;
  });
}

function removeFromIdle(sock) {
  const idx = idleSockets.indexOf(sock);
  if (idx !== -1) idleSockets.splice(idx, 1);
}

function finalizeRequest(sock, result, keepSocket) {
  const st = sock._active;
  if (!st || st.settled) return;
  st.settled = true;
  if (st.timer) {
    clearTimeout(st.timer);
    st.timer = null;
  }
  sock._active = null;

  if (keepSocket && !sock.destroyed && sock.writable) {
    sock.unref?.();
    idleSockets.push(sock);
  } else {
    try { sock.destroy(); } catch {}
  }

  st.resolve(result);
}

function handleSocketData(sock, chunk) {
  const st = sock._active;
  if (!st || st.settled) {
    // Unexpected bytes while idle — drop socket cleanly to avoid corrupt framing
    removeFromIdle(sock);
    try { sock.destroy(); } catch {}
    return;
  }

  st.buf = st.buf.length === 0 ? chunk : Buffer.concat([st.buf, chunk]);

  if (st.headerEnd === -1) {
    const idx = st.buf.indexOf(CRLF_CRLF);
    if (idx === -1) return;
    st.headerEnd = idx;
    const headerStr = st.buf.subarray(0, idx).toString('latin1');
    st.statusCode = parseInt(headerStr.slice(9, 12), 10) || 0;

    const lower = headerStr.toLowerCase();
    st.headersLower = lower;
    if (lower.includes('\r\nconnection: close')) st.closeAfter = true;
    if (lower.includes('transfer-encoding: chunked')) st.isChunked = true;
    const clMatch = lower.match(/\r\ncontent-length:\s*(\d+)/);
    if (clMatch) st.contentLength = parseInt(clMatch[1], 10);

    // HTTP 204 No Content MUST NOT include a body per RFC 9110
    if (st.statusCode === 204) {
      recordRateLimitState(st.routeKey, 204, lower, null);
      const exactFrame = !st.closeAfter && st.buf.length === idx + 4;
      finalizeRequest(sock, { handled: true, statusCode: 204, ok: true }, exactFrame);
      return;
    }
  }

  const bodyStart = st.headerEnd + 4;
  const bodyLen = st.buf.length - bodyStart;

  let bodyComplete = false;
  let bodyEndIdx = st.buf.length;
  if (st.contentLength >= 0) {
    if (bodyLen >= st.contentLength) {
      bodyComplete = true;
      bodyEndIdx = bodyStart + st.contentLength;
    }
  } else if (st.isChunked) {
    const cEnd = st.buf.indexOf(CHUNK_END, bodyStart);
    if (cEnd !== -1) {
      bodyComplete = true;
      bodyEndIdx = cEnd + CHUNK_END.length;
    }
  }

  if (!bodyComplete) return;

  let retryAfterMs = 0;
  let retryAfterSec = null;
  if (st.statusCode === 429) {
    const bodyText = st.buf.subarray(bodyStart, bodyEndIdx).toString('utf8');
    const match = bodyText.match(/"retry_after"\s*:\s*([0-9.]+)/);
    const sec = match ? Number(match[1]) : 0.25;
    if (Number.isFinite(sec) && sec > 0) retryAfterSec = sec;
    retryAfterMs = Math.min(5000, Math.max(50, Math.ceil((Number.isFinite(sec) ? sec : 0.25) * 1000)));
  }

  const trackedWaitMs = recordRateLimitState(st.routeKey, st.statusCode, st.headersLower, retryAfterSec);
  if (trackedWaitMs > retryAfterMs) retryAfterMs = trackedWaitMs;

  const exactFrame = !st.closeAfter && st.buf.length === bodyEndIdx;
  finalizeRequest(
    sock,
    {
      handled: true,
      statusCode: st.statusCode,
      ok: st.statusCode === 200 || st.statusCode === 204,
      retryAfterMs
    },
    exactFrame
  );
}

function spawnSocket() {
  if (testMode || !initialized || shuttingDown) return;
  if (allSockets.size + connectingCount >= POOL_SIZE) return;

  connectingCount++;
  const connectOpts = {
    host: cachedIpv4 || targetConfig.host,
    port: targetConfig.port,
    servername: targetConfig.servername,
    rejectUnauthorized: targetConfig.rejectUnauthorized,
    ALPNProtocols: ['http/1.1'],
    ...(cachedTlsSession ? { session: cachedTlsSession } : {})
  };

  let sock;
  try {
    sock = tls.connect(connectOpts);
  } catch {
    connectingCount--;
    return;
  }

  let connected = false;
  allSockets.add(sock);
  sock.unref?.();

  sock.setNoDelay(true);
  sock.setKeepAlive(true, 0);

  sock.once('secureConnect', () => {
    connected = true;
    connectingCount--;
    consecutiveErrors = 0;
    if (shuttingDown || !initialized) {
      try { sock.destroy(); } catch {}
      return;
    }
    sock.setNoDelay(true);
    sock.unref?.();
    idleSockets.push(sock);
  });

  sock.on('session', (session) => {
    if (session) cachedTlsSession = session;
  });

  sock.on('data', (chunk) => handleSocketData(sock, chunk));

  sock.on('error', (err) => {
    removeFromIdle(sock);
    if (sock._active && !sock._active.settled) {
      finalizeRequest(sock, { handled: false, error: err?.message || 'tls_error' }, false);
    }
  });

  sock.once('close', () => {
    if (!connected) connectingCount = Math.max(0, connectingCount - 1);
    allSockets.delete(sock);
    removeFromIdle(sock);
    if (sock._active && !sock._active.settled) {
      if (sock._active.closeAfter && sock._active.headerEnd !== -1 && sock._active.statusCode > 0) {
        const sc = sock._active.statusCode;
        finalizeRequest(sock, { handled: true, statusCode: sc, ok: sc === 200 || sc === 204 }, false);
      } else {
        finalizeRequest(sock, { handled: false, error: 'socket_closed' }, false);
      }
    }
    if (initialized && !shuttingDown) {
      consecutiveErrors = Math.min(consecutiveErrors + 1, 6);
      const delayMs = consecutiveErrors <= 1 ? 100 : Math.min(5000, 250 * (1 << (consecutiveErrors - 2)));
      setTimeout(() => spawnSocket(), delayMs).unref();
    }
  });
}

function sendHeartbeatPing(sock) {
  if (!sock || sock.destroyed || !sock.writable || sock._active) return;
  sock.ref?.();
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (sock._active && !sock._active.settled) {
        finalizeRequest(sock, { handled: false }, false);
      }
    }, REQUEST_TIMEOUT_MS);
    timer.unref?.();
    sock._active = {
      buf: Buffer.alloc(0),
      headerEnd: -1,
      statusCode: 0,
      contentLength: -1,
      isChunked: false,
      closeAfter: false,
      settled: false,
      timer,
      resolve
    };
    try {
      sock.write(PING_FRAME);
    } catch {
      finalizeRequest(sock, { handled: false }, false);
    }
  }).catch(() => null);
}

function ensurePoolWarm() {
  if (testMode || !initialized || shuttingDown) return;
  while (allSockets.size + connectingCount < POOL_SIZE) {
    spawnSocket();
  }
}

export function initRawTlsLane(token) {
  if (testMode) return true;
  if (!token || token === 'FAKE_TOKEN') return false;
  shuttingDown = false;
  if (!initialized) {
    initialized = true;
    resolveTargetIp();
    dnsTimer = setInterval(resolveTargetIp, DNS_REFRESH_MS);
    dnsTimer.unref?.();

    heartbeatTimer = setInterval(() => {
      ensurePoolWarm();
      // Round-robin keep-alive: ping only 1 oldest idle socket every ~833ms so >= 11/12 sockets remain instant-ready
      const oldest = idleSockets.shift();
      if (oldest) {
        sendHeartbeatPing(oldest);
      }
    }, Math.max(800, Math.floor(HEARTBEAT_MS / POOL_SIZE)));
    heartbeatTimer.unref?.();
  }
  ensurePoolWarm();
  return true;
}

function acquireWarmSocket() {
  if (!initialized || shuttingDown || idleSockets.length === 0) {
    return null;
  }
  let sock = null;
  while (idleSockets.length > 0) {
    const candidate = idleSockets.pop();
    if (candidate && !candidate.destroyed && candidate.writable && !candidate._active) {
      sock = candidate;
      break;
    }
  }
  if (sock && allSockets.size + connectingCount < POOL_SIZE) spawnSocket();
  return sock;
}

function dispatchRawFrame(sock, frame, routeKey = null) {
  sock.ref?.();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (sock._active && !sock._active.settled) {
        finalizeRequest(sock, { handled: false, error: 'timeout' }, false);
      }
    }, REQUEST_TIMEOUT_MS);
    timer.unref?.();

    sock._active = {
      buf: Buffer.alloc(0),
      headerEnd: -1,
      statusCode: 0,
      contentLength: -1,
      isChunked: false,
      closeAfter: false,
      headersLower: '',
      routeKey,
      settled: false,
      timer,
      resolve
    };

    try {
      sock.write(frame);
    } catch (err) {
      finalizeRequest(sock, { handled: false, error: err?.message || 'write_error' }, false);
    }
  });
}

export async function rawTlsSendBan(guildId, userId, authHeader, encodedReason) {
  const sock = acquireWarmSocket();
  if (!sock) return { handled: false };

  const gStr = String(guildId);
  const uStr = String(userId);
  const rStr = String(encodedReason || '');
  const authBuf = getAuthBuffer(authHeader);

  const gLen = Buffer.byteLength(gStr, 'ascii');
  const uLen = Buffer.byteLength(uStr, 'ascii');
  const rLen = Buffer.byteLength(rStr, 'ascii');
  const totalLen =
    REQ_PREFIX.length + gLen + REQ_BANS.length + uLen +
    REQ_VER_HOST.length + authBuf.length + REQ_HEADERS.length + rLen + REQ_TAIL.length;

  const frame = Buffer.allocUnsafe(totalLen);
  let off = 0;
  REQ_PREFIX.copy(frame, off); off += REQ_PREFIX.length;
  off += frame.write(gStr, off, 'ascii');
  REQ_BANS.copy(frame, off); off += REQ_BANS.length;
  off += frame.write(uStr, off, 'ascii');
  REQ_VER_HOST.copy(frame, off); off += REQ_VER_HOST.length;
  authBuf.copy(frame, off); off += authBuf.length;
  REQ_HEADERS.copy(frame, off); off += REQ_HEADERS.length;
  if (rLen > 0) off += frame.write(rStr, off, 'ascii');
  REQ_TAIL.copy(frame, off);

  strikesServed++;
  return await dispatchRawFrame(sock, frame, `ban:${gStr}`);
}

export async function rawTlsRequest({ method, path, body = null, authHeader, encodedReason = '', routeKey = null }) {
  const sock = acquireWarmSocket();
  if (!sock) return { handled: false };

  const bodyStr = body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  const bodyLen = bodyStr ? Buffer.byteLength(bodyStr, 'utf8') : 0;
  let head = `${method} ${path} HTTP/1.1\r\nHost: ${targetConfig.host}\r\nAuthorization: ${authHeader}\r\n`;
  if (bodyLen > 0) {
    head += `Content-Type: application/json\r\nContent-Length: ${bodyLen}\r\n`;
  }
  if (encodedReason) {
    head += `X-Audit-Log-Reason: ${encodedReason}\r\n`;
  }
  head += 'Connection: keep-alive\r\n\r\n';
  if (bodyLen > 0) {
    head += bodyStr;
  }

  auxRequestsServed++;
  const frame = Buffer.from(head, 'utf8');
  return await dispatchRawFrame(sock, frame, routeKey);
}

export function rawTlsSendVanity(guildId, code, authHeader, encodedReason) {
  return rawTlsRequest({
    method: 'PATCH',
    path: `/api/v10/guilds/${guildId}/vanity-url`,
    body: JSON.stringify({ code }),
    authHeader,
    encodedReason,
    routeKey: `vanity:${guildId}`
  });
}

export function rawTlsSendDeleteWebhook(webhookId, authHeader, encodedReason) {
  return rawTlsRequest({
    method: 'DELETE',
    path: `/api/v10/webhooks/${webhookId}`,
    authHeader,
    encodedReason,
    routeKey: `webhook:${webhookId}`
  });
}

export function rawTlsSendDeleteChannel(channelId, authHeader, encodedReason) {
  return rawTlsRequest({
    method: 'DELETE',
    path: `/api/v10/channels/${channelId}`,
    authHeader,
    encodedReason,
    routeKey: `channel:${channelId}`
  });
}

export function rawTlsSendDeleteRole(guildId, roleId, authHeader, encodedReason) {
  return rawTlsRequest({
    method: 'DELETE',
    path: `/api/v10/guilds/${guildId}/roles/${roleId}`,
    authHeader,
    encodedReason,
    routeKey: `role:${guildId}`
  });
}

export function rawTlsSendUnban(guildId, userId, authHeader, encodedReason) {
  return rawTlsRequest({
    method: 'DELETE',
    path: `/api/v10/guilds/${guildId}/bans/${userId}`,
    authHeader,
    encodedReason,
    routeKey: `unban:${guildId}`
  });
}

export function getRawTlsLaneStatus() {
  const now = Date.now();
  const sampleBuckets = [];
  for (const [routeKey, entry] of routeBuckets.entries()) {
    if (!entry || entry.resetAtMs <= now) {
      routeBuckets.delete(routeKey);
      continue;
    }
    if (sampleBuckets.length < 5) {
      sampleBuckets.push({
        routeKey,
        remaining: entry.remaining,
        resetInMs: Math.max(0, entry.resetAtMs - now),
        bucket: entry.bucket || null
      });
    }
  }

  return {
    initialized,
    target: `${targetConfig.host}:${targetConfig.port}`,
    cachedIpv4,
    totalSockets: allSockets.size,
    warmIdleSockets: idleSockets.length,
    poolCapacity: POOL_SIZE,
    heartbeatMs: HEARTBEAT_MS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    dnsRefreshMs: DNS_REFRESH_MS,
    strikesServed,
    auxRequestsServed,
    rateLimitHits,
    trackedBuckets: routeBuckets.size,
    globalRateLimited: globalRateLimitUntilMs > now,
    globalRateLimitRemainingMs: Math.max(0, globalRateLimitUntilMs - now),
    sampleBuckets
  };
}

export function _injectRawSocketForTest(sock) {
  testMode = true;
  shuttingDown = false;
  initialized = true;
  allSockets.add(sock);
  sock.on('data', (chunk) => handleSocketData(sock, chunk));
  sock.once('close', () => {
    allSockets.delete(sock);
    removeFromIdle(sock);
  });
  idleSockets.push(sock);
}

export function _setRawTlsTestTarget(opts = {}) {
  shutdownRawTlsLane();
  targetConfig = {
    host: opts.host || DEFAULT_HOST,
    port: opts.port || DEFAULT_PORT,
    servername: opts.servername || opts.host || DEFAULT_HOST,
    rejectUnauthorized: opts.rejectUnauthorized !== undefined ? opts.rejectUnauthorized : true
  };
}

export function shutdownRawTlsLane() {
  shuttingDown = true;
  initialized = false;
  testMode = false;
  if (dnsTimer) {
    clearInterval(dnsTimer);
    dnsTimer = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  cachedTlsSession = null;
  idleSockets.length = 0;
  for (const s of allSockets) {
    try { s.destroy(); } catch {}
  }
  allSockets.clear();
  connectingCount = 0;
}
