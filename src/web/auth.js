import crypto from 'node:crypto';
import db, { isRootBotOwnerId } from '../database.js';

export const SESSION_COOKIE_NAME = 'athena_dash_session';
const MAGIC_TOKEN_TTL_MS = 5 * 60 * 1000;       // 5 minutes single-use
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;     // 24 hours
const MAX_MAGIC_TOKENS = 5000;

// In-memory store keyed by SHA-256 hex digest of raw token
const magicTokens = new Map();

let lastKnownOrigin = null;

/**
 * Resolves the unified HTTP port used by Athena's Express web server.
 * Prioritizes Pterodactyl's SERVER_PORT allocation alongside explicit PORT/WEBSUB_PORT overrides.
 */
export function resolveWebPort() {
  const candidates = [
    process.env.DASHBOARD_PORT,
    process.env.SERVER_PORT,
    process.env.PORT,
    process.env.WEBSUB_PORT
  ];
  for (const val of candidates) {
    const parsed = Number.parseInt(String(val || '').trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }
  return 3000;
}

/**
 * Records a validated request origin (scheme + host[:port]) as fallback base URL
 * when DASHBOARD_BASE_URL / PUBLIC_URL is not explicitly configured in .env.
 */
export function recordOriginFromRequest(req) {
  if (!req || typeof req.get !== 'function') return;
  const host = String(req.get('host') || '').trim();
  // Validate host[:port] strictly to guard against malformed Host headers
  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return;
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  const proto = (req.secure || forwardedProto === 'https') ? 'https' : 'http';
  lastKnownOrigin = `${proto}://${host}`;
}

/**
 * Returns the public base URL used when issuing !weblogin magic links.
 */
export function getDashboardBaseUrl() {
  const configured =
    process.env.DASHBOARD_BASE_URL ||
    process.env.PUBLIC_URL ||
    process.env.TUNNEL_URL ||
    process.env.CINEMA_BASE_URL ||
    process.env.WEBSUB_URL;
  if (configured && /^https?:\/\//i.test(String(configured).trim())) {
    return String(configured).trim().replace(/\/+$/, '');
  }
  if (lastKnownOrigin) {
    return lastKnownOrigin;
  }
  return `http://localhost:${resolveWebPort()}`;
}

function getSessionSecret() {
  const envSecret = process.env.DASHBOARD_SESSION_SECRET || process.env.SESSION_SECRET;
  if (envSecret && String(envSecret).trim().length >= 16) {
    return String(envSecret).trim();
  }
  if (!db.cache.webDashboardSecret) {
    db.cache.webDashboardSecret = crypto.randomBytes(32).toString('hex');
    db.save();
  }
  return db.cache.webDashboardSecret;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function signHmac(payloadB64) {
  return crypto.createHmac('sha256', getSessionSecret()).update(payloadB64).digest('base64url');
}

function pruneExpiredMagicTokens(now = Date.now()) {
  for (const [hash, entry] of magicTokens.entries()) {
    if (!entry || entry.expiresAt <= now) {
      magicTokens.delete(hash);
    }
  }
  while (magicTokens.size > MAX_MAGIC_TOKENS) {
    const oldestKey = magicTokens.keys().next().value;
    if (!oldestKey) break;
    magicTokens.delete(oldestKey);
  }
}

/**
 * Issues a single-use cryptographic login token for a Discord user.
 */
export function createMagicLoginToken(userId, guildId = null) {
  const now = Date.now();
  pruneExpiredMagicTokens(now);

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = now + MAGIC_TOKEN_TTL_MS;

  magicTokens.set(tokenHash, {
    userId: String(userId),
    guildId: guildId ? String(guildId) : null,
    createdAt: now,
    expiresAt
  });

  const baseUrl = getDashboardBaseUrl();
  return {
    token: rawToken,
    url: `${baseUrl}/auth/magic?token=${encodeURIComponent(rawToken)}`,
    expiresAt,
    ttlSeconds: Math.floor(MAGIC_TOKEN_TTL_MS / 1000)
  };
}

/**
 * Extracts a raw token from either a raw token string or a full pasted magic URL.
 */
export function extractMagicTokenInput(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return '';
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      return String(parsed.searchParams.get('token') || '').trim();
    }
  } catch {
    // Fall back to direct string parsing below
  }
  const match = trimmed.match(/(?:^|[?&])token=([^&\s]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]).trim();
    } catch {
      return match[1].trim();
    }
  }
  return trimmed;
}

/**
 * Validates and immediately consumes a single-use magic token.
 */
export function consumeMagicLoginToken(rawInput) {
  const token = extractMagicTokenInput(rawInput);
  if (!token || token.length < 16) return null;

  const now = Date.now();
  pruneExpiredMagicTokens(now);

  const tokenHash = sha256Hex(token);
  const entry = magicTokens.get(tokenHash);
  if (!entry) return null;

  // Enforce strict single-use consumption before returning
  magicTokens.delete(tokenHash);
  if (entry.expiresAt <= now) return null;

  return {
    userId: entry.userId,
    guildId: entry.guildId
  };
}

export function createSessionCookieToken(userId, defaultGuildId = null) {
  const payload = {
    uid: String(userId),
    gid: defaultGuildId ? String(defaultGuildId) : null,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = signHmac(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function verifySessionCookieToken(cookieValue) {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, providedSig] = parts;
  if (!payloadB64 || !providedSig) return null;

  const expectedSig = signHmac(payloadB64);
  const bufA = Buffer.from(providedSig, 'utf8');
  const bufB = Buffer.from(expectedSig, 'utf8');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!parsed?.uid || !parsed?.exp || parsed.exp <= Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const header = req?.headers?.cookie;
  const out = Object.create(null);
  if (!header || typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function setSessionCookie(res, req, token) {
  const forwardedProto = String(req?.get?.('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  const isHttps = Boolean(req?.secure || forwardedProto === 'https');
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (isHttps) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function clearSessionCookie(res, req) {
  const forwardedProto = String(req?.get?.('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  const isHttps = Boolean(req?.secure || forwardedProto === 'https');
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (isHttps) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function getRequestSession(req) {
  const cookies = parseCookies(req);
  const raw = cookies[SESSION_COOKIE_NAME];
  return verifySessionCookieToken(raw);
}

/**
 * Determines exact permission clearance for a user inside a specific Discord guild.
 * Strictly enforces Athena Prime's Ownership Model:
 * - Bot Owner: Absolute access across mutual guilds
 * - Server Owner: Full guild control (Extra Owners, Security Disarm, Snapshot Restore + Extra Owner powers)
 * - Extra Owner: Extra Owner controls only (arm shields, whitelists, bot whitelist, AutoMod, blacklist, honeypot, tagdrag, snapshots, incidents)
 * Native Discord 'Administrator' or role permissions NEVER grant access.
 */
export async function getGuildClearance(guild, userId) {
  if (!guild || !userId) return null;
  const uid = String(userId);
  const isGlobalRoot = isRootBotOwnerId(uid);

  if (isGlobalRoot || guild.ownerId === uid) {
    return {
      tier: 'root',
      tierNumber: 0,
      roleLabel: isGlobalRoot ? 'BOT OWNER' : 'SERVER OWNER',
      canArm: true,
      canDisarm: true,
      canToggleModules: true,
      canManageWhitelist: true,
      canManageExtraOwners: true,
      canManageControls: true,
      canCreateSnapshot: true,
      canRestoreSnapshot: true,
      canClearIncidents: true
    };
  }

  if (db.isExtraOwner(guild.id, uid)) {
    return {
      tier: 'deputy',
      tierNumber: 1,
      roleLabel: 'EXTRA OWNER',
      canArm: true,
      canDisarm: false,
      canToggleModules: true, // Extra Owners can arm/enable shields; disabling shields requires Server Owner / Bot Owner
      canManageWhitelist: true,
      canManageExtraOwners: false,
      canManageControls: true,
      canCreateSnapshot: true,
      canRestoreSnapshot: false,
      canClearIncidents: true
    };
  }

  return null;
}

/**
 * Lists all mutual guilds where the authenticated user is Bot Owner, Server Owner, or Extra Owner.
 */
export async function getAccessibleGuilds(client, userId) {
  if (!client?.guilds?.cache) return [];
  const results = [];
  for (const guild of client.guilds.cache.values()) {
    const clearance = await getGuildClearance(guild, userId);
    if (!clearance) continue;
    const cfg = db.getGuildConfig(guild.id);
    results.push({
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconURL({ size: 128 }) || null,
      memberCount: guild.memberCount || 0,
      isSecured: Boolean(cfg.securityEnabled && cfg.antiNukeEnabled),
      tier: clearance.tier,
      tierNumber: clearance.tierNumber,
      roleLabel: clearance.roleLabel
    });
  }
  // Sort by ownership tier then member count descending
  results.sort((a, b) => (a.tierNumber - b.tierNumber) || (b.memberCount - a.memberCount));
  return results;
}
