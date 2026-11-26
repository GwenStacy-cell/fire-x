import tls from 'node:tls';
import dns from 'node:dns';

const DEFAULT_HOST = 'discord.com';
const DEFAULT_PORT = 443;
const POOL_SIZE = 4;
const HEARTBEAT_MS = 8_000;
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
    if (lower.includes('\r\nconnection: close')) st.closeAfter = true;
    if (lower.includes('transfer-encoding: chunked')) st.isChunked = true;
    const clMatch = lower.match(/\r\ncontent-length:\s*(\d+)/);
    if (clMatch) st.contentLength = parseInt(clMatch[1], 10);

    // HTTP 204 No Content MUST NOT include a body per RFC 9110
    if (st.statusCode === 204) {
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
  if (st.statusCode === 429) {
    const bodyText = st.buf.subarray(bodyStart, bodyEndIdx).toString('utf8');
    const match = bodyText.match(/"retry_after"\s*:\s*([0-9.]+)/);
    const sec = match ? Number(match[1]) : 0.25;
    retryAfterMs = Math.min(5000, Math.max(50, Math.ceil((Number.isFinite(sec) ? sec : 0.25) * 1000)));
  }

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
      // Round-robin keep-alive: ping only 1 oldest idle socket every 2s so >= 3/4 sockets remain instant-ready
      const oldest = idleSockets.shift();
      if (oldest) {
        sendHeartbeatPing(oldest);
      }
    }, Math.max(1_000, Math.floor(HEARTBEAT_MS / POOL_SIZE)));
    heartbeatTimer.unref?.();
  }
  ensurePoolWarm();
  return true;
}

export async function rawTlsSendBan(guildId, userId, authHeader, encodedReason) {
  if (!initialized || shuttingDown || idleSockets.length === 0) {
    return { handled: false };
  }

  let sock = null;
  while (idleSockets.length > 0) {
    const candidate = idleSockets.pop();
    if (candidate && !candidate.destroyed && candidate.writable && !candidate._active) {
      sock = candidate;
      break;
    }
  }
  if (!sock) return { handled: false };

  // Ensure replacement socket is available if needed after burst
  if (allSockets.size + connectingCount < POOL_SIZE) spawnSocket();

  const frame = Buffer.concat([
    REQ_PREFIX,
    Buffer.from(String(guildId), 'ascii'),
    REQ_BANS,
    Buffer.from(String(userId), 'ascii'),
    REQ_VER_HOST,
    getAuthBuffer(authHeader),
    REQ_HEADERS,
    Buffer.from(String(encodedReason || ''), 'ascii'),
    REQ_TAIL
  ]);

  sock.ref?.();
  strikesServed++;

  return await new Promise((resolve) => {
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

export function getRawTlsLaneStatus() {
  return {
    initialized,
    target: `${targetConfig.host}:${targetConfig.port}`,
    cachedIpv4,
    totalSockets: allSockets.size,
    warmIdleSockets: idleSockets.length,
    strikesServed
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
