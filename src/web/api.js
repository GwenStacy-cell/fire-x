import express from 'express';
import crypto from 'node:crypto';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import db, { ALL_ANTINUKE_MODULE_KEYS, isRootBotOwnerId } from '../database.js';
import cv2 from '../cv2.js';
import { TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI, BULLET_EMOJI } from '../utils/emojis.js';
import { cleanDisplayName, formatUserLink, logToSecurityChannel } from '../utils/helpers.js';
import { getRawTlsLaneStatus } from '../utils/rawTlsBanLane.js';
import {
  getSecurityTrackingSnapshot,
  snapshotGuildInfrastructure,
  isGuildUnderAttack
} from '../utils/antinuke.js';
import { getAntiStripTelemetry } from '../utils/antiStrip.js';
import { fetchDashboardStats } from '../utils/dashboardManager.js';
import { CHANGELOG_ENTRIES } from '../utils/changelogData.js';
import { setupHoneypot, removeHoneypot } from '../commands/honeypot.js';
import { takeGuildSnapshot, restoreFromSnapshot } from '../commands/timemachine.js';
import {
  handleSecurityToggleAll,
  runSecurityEnableSequence,
  executeUnquarantine
} from '../commands/security.js';
import {
  consumeMagicLoginToken,
  createSessionCookieToken,
  setSessionCookie,
  clearSessionCookie,
  getRequestSession,
  getGuildClearance,
  getAccessibleGuilds,
  recordOriginFromRequest
} from './auth.js';

const SHIELD_METADATA = {
  antiRoleCreate: { label: 'Anti-Role Create Flood', category: 'authority', code: 'MOD_ROLE_CRT', desc: 'Blocks unauthorized mass role creation bursts.' },
  antiRoleDelete: { label: 'Anti-Role Delete Wipe', category: 'authority', code: 'MOD_ROLE_DEL', desc: 'Neutralizes rogue role deletions and restores role state.' },
  antiRoleUpdate: { label: 'Anti-Role Name Mutation', category: 'authority', code: 'MOD_ROLE_UPD', desc: 'Reverts unauthorized role edits and name/color tampering.' },
  antiRolePermUpdate: { label: 'Anti-Role Perm Escalation', category: 'authority', code: 'MOD_ROLE_PRM', desc: 'Strips unauthorized Admin or dangerous bitfield escalations.' },
  antiMemberRoleUpdate: { label: 'Anti-Dangerous Role Grant', category: 'authority', code: 'MOD_MBR_ROLE', desc: 'Blocks unauthorized granting of Admin/Ban/Manage roles.' },
  antiRoleReorder: { label: 'Anti-Role Hoist / Reorder', category: 'authority', code: 'MOD_ROLE_ORD', desc: 'Guards role hierarchy ordering against privilege climbing.' },
  antiLinkedRole: { label: 'Anti-Linked Role Exploit', category: 'authority', code: 'MOD_LNK_ROLE', desc: 'Prevents malicious linked-role bypass injections.' },

  antiChannelCreate: { label: 'Anti-Channel Create Flood', category: 'channels', code: 'MOD_CH_CRT', desc: 'Deletes spam channels and bans rogue creators.' },
  antiChannelDelete: { label: 'Anti-Channel Delete Purge', category: 'channels', code: 'MOD_CH_DEL', desc: 'Restores wiped channels & overwrites from RAM snapshot.' },
  antiChannelUpdate: { label: 'Anti-Channel Settings Tamper', category: 'channels', code: 'MOD_CH_UPD', desc: 'Reverts unauthorized topic, bitrate, or NSFW toggles.' },
  antiChannelPermUpdate: { label: 'Anti-Channel Perm Override', category: 'channels', code: 'MOD_CH_PRM', desc: 'Protects channel @everyone and staff permission overwrites.' },
  antiChannelReorder: { label: 'Anti-Channel Reorder', category: 'channels', code: 'MOD_CH_ORD', desc: 'Reverts bulk category/channel drag shuffling.' },
  antiChannelNameMod: { label: 'Anti-Channel Rename', category: 'channels', code: 'MOD_CH_NAM', desc: 'Restores original channel names on tampering.' },

  antiBan: { label: 'Anti-Member Ban Flood', category: 'eviction', code: 'MOD_MBR_BAN', desc: 'Single-shot bans attackers executing mass ban cascades.' },
  antiKick: { label: 'Anti-Member Kick Purge', category: 'eviction', code: 'MOD_MBR_KCK', desc: 'Intercepts mass moderator kick sequences.' },
  antiUnban: { label: 'Anti-Rogue Unban', category: 'eviction', code: 'MOD_MBR_UNB', desc: 'Re-bans unwhitelisted unban reversals.' },
  antiMemberPurge: { label: 'Anti-Member Prune / Purge', category: 'eviction', code: 'MOD_MBR_PRG', desc: 'Blocks destructive server member prune sweeps.' },
  antiMassBan: { label: 'Anti-Mass Ban Cascade', category: 'eviction', code: 'MOD_MASS_BAN', desc: 'Zero-tolerance velocity kill-switch for mass ban bursts.' },

  antiEmojiCreate: { label: 'Anti-Emoji Create Flood', category: 'vectors', code: 'MOD_EMJ_CRT', desc: 'Removes unauthorized emoji spam injections.' },
  antiEmojiDelete: { label: 'Anti-Emoji Delete Wipe', category: 'vectors', code: 'MOD_EMJ_DEL', desc: 'Recreates wiped server emojis from snapshot.' },
  antiEmojiUpdate: { label: 'Anti-Emoji Rename Tamper', category: 'vectors', code: 'MOD_EMJ_UPD', desc: 'Reverts unauthorized emoji renames.' },
  antiWebhooks: { label: 'Anti-Webhook Spammer', category: 'vectors', code: 'MOD_WEBHOOK', desc: 'Vaporizes rogue webhooks via Raw TLS and blocks spam.' },
  antiBotAdd: { label: 'Anti-Bot Add (Owner Only)', category: 'vectors', code: 'MOD_BOT_ADD', desc: 'Bans unwhitelisted bots and cascades to non-exempt inviters.' },
  antiServerUpdate: { label: 'Anti-Server Settings', category: 'vectors', code: 'MOD_SRV_UPD', desc: 'Protects server name, verification level, and icon state.' },
  antiVanitySteal: { label: 'Anti-Vanity URL Hijack', category: 'vectors', code: 'MOD_VANITY', desc: 'Reclaims hijacked vanity invite codes via Raw TLS lane.' },
  antiScheduledEvents: { label: 'Anti-Scheduled Events', category: 'vectors', code: 'MOD_EVENTS', desc: 'Blocks unauthorized event creation, edits, or deletion.' },
  antiInvite: { label: 'Anti-Invite Leak', category: 'vectors', code: 'MOD_INV_CRT', desc: 'Purges unauthorized server invite links on creation.' },
  antiInviteDelete: { label: 'Anti-Invite Deletion', category: 'vectors', code: 'MOD_INV_DEL', desc: 'Intercepts intentional wiping of existing server invites.' },
  antiAutomodUpdate: { label: 'Anti-AutoMod Tamper', category: 'vectors', code: 'MOD_AUTOMOD', desc: 'Protects native Discord AutoMod rules from tampering.' },
  antiAppCommands: { label: 'Anti-Integration / Apps', category: 'vectors', code: 'MOD_APP_CMD', desc: 'Guards guild integrations and application command scopes.' },
  antiSoundboardCreate: { label: 'Anti-Soundboard Create', category: 'vectors', code: 'MOD_SND_CRT', desc: 'Removes unauthorized soundboard uploads.' },
  antiSoundboardDelete: { label: 'Anti-Soundboard Delete', category: 'vectors', code: 'MOD_SND_DEL', desc: 'Intercepts mass soundboard asset deletion.' }
};

// Lightweight cache for audit-heavy dashboard stats (30s TTL) so frequent UI polls never hammer REST
const guildStatsCache = new Map();
const STATS_CACHE_TTL_MS = 30_000;

function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  if (!local) return `***@${domain}`;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

async function getCachedStats(guild) {
  const cached = guildStatsCache.get(guild.id);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < STATS_CACHE_TTL_MS) {
    return cached.data;
  }
  const fresh = await fetchDashboardStats(guild).catch(() => null);
  if (fresh) {
    guildStatsCache.set(guild.id, { fetchedAt: now, data: fresh });
  }
  return fresh || cached?.data || null;
}

async function resolveUserMeta(client, guild, userId) {
  const uid = String(userId);
  const member = guild?.members?.cache?.get(uid) || null;
  let user = member?.user || client?.users?.cache?.get(uid) || null;
  if (!user && client?.users?.fetch) {
    user = await client.users.fetch(uid).catch(() => null);
  }
  const rawName = member?.displayName || user?.globalName || user?.username || `User ${uid.slice(-4)}`;
  return {
    id: uid,
    displayName: cleanDisplayName(rawName),
    username: user?.username || uid,
    bot: Boolean(user?.bot),
    avatarUrl: (member || user)?.displayAvatarURL?.({ size: 64 }) || null
  };
}

function resolveGuildChannelSummary(guild, channelId) {
  if (!channelId) return { id: null, name: null, exists: false };
  const ch = guild.channels.cache.get(channelId);
  return {
    id: channelId,
    name: ch ? ch.name : null,
    exists: Boolean(ch)
  };
}

function requireAuth(client) {
  return async (req, res, next) => {
    const session = getRequestSession(req);
    if (!session) {
      return res.status(401).json({ ok: false, error: 'Not authenticated. Run !weblogin in Discord for a login link.' });
    }
    const user = client.users.cache.get(session.uid) || await client.users.fetch(session.uid).catch(() => null);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Discord user session expired or unreachable.' });
    }
    req.dashSession = session;
    req.dashUser = user;
    next();
  };
}

function requireGuildAccess(client, capabilityFlag = null) {
  return async (req, res, next) => {
    const guildId = String(req.params.guildId || '').trim();
    if (!/^\d{15,22}$/.test(guildId)) {
      return res.status(400).json({ ok: false, error: 'Invalid guild ID format.' });
    }
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ ok: false, error: 'Athena Prime is not active in this guild.' });
    }
    const clearance = await getGuildClearance(guild, req.dashUser.id);
    if (!clearance) {
      return res.status(403).json({ ok: false, error: 'Insufficient guild clearance.' });
    }
    if (capabilityFlag && !clearance[capabilityFlag]) {
      return res.status(403).json({
        ok: false,
        error: `Clearance denied: ${clearance.roleLabel} cannot perform this action.`
      });
    }
    req.targetGuild = guild;
    req.clearance = clearance;
    next();
  };
}

export function registerDashboardRoutes(app, client) {
  // Capture valid Host origin for automatic !weblogin base URL resolution
  app.use((req, _res, next) => {
    recordOriginFromRequest(req);
    next();
  });

  // Magic Link Landing Handler (Option 1 Passwordless Auth)
  app.get('/auth/magic', (req, res) => {
    const rawToken = String(req.query?.token || '').trim();
    const consumed = consumeMagicLoginToken(rawToken);
    if (!consumed) {
      return res.redirect('/#auth-expired');
    }
    const cookieVal = createSessionCookieToken(consumed.userId, consumed.guildId);
    setSessionCookie(res, req, cookieVal);
    return res.redirect(consumed.guildId ? `/#dashboard?guild=${encodeURIComponent(consumed.guildId)}` : '/#dashboard');
  });

  const api = express.Router();
  api.use(express.json({ limit: '1mb' }));

  // ---------------------------------------------------------------------------
  // PUBLIC TELEMETRY & AUTH ENDPOINTS
  // ---------------------------------------------------------------------------
  api.get('/public/overview', (_req, res) => {
    const tls = getRawTlsLaneStatus();
    const latestChangelog = CHANGELOG_ENTRIES[0] || { version: 'v4.0.21', headline: 'Athena Web Control Plane', date: '' };
    const guilds = Array.from(client?.guilds?.cache?.values?.() || []);
    let securedCount = 0;
    for (const g of guilds) {
      const cfg = db.getGuildConfig(g.id);
      if (cfg.securityEnabled && cfg.antiNukeEnabled) securedCount++;
    }

    res.json({
      ok: true,
      botReady: Boolean(client?.isReady?.()),
      botTag: client?.user?.tag || 'Athena Prime',
      botAvatar: client?.user?.displayAvatarURL?.({ size: 128 }) || null,
      version: latestChangelog.version,
      changelog: CHANGELOG_ENTRIES.slice(0, 5).map(e => ({
        version: e.version,
        date: e.date,
        headline: e.headline,
        summary: e.summary
      })),
      guildsCount: guilds.length,
      securedGuildsCount: securedCount,
      wsPingMs: client?.ws?.ping > 0 ? Math.round(client.ws.ping) : 0,
      uptimeSec: Math.floor(process.uptime()),
      shieldCount: ALL_ANTINUKE_MODULE_KEYS.length,
      authMode: 'magic_link',
      tls: {
        initialized: tls.initialized,
        totalSockets: tls.totalSockets,
        warmIdleSockets: tls.warmIdleSockets,
        poolCapacity: tls.poolCapacity,
        strikesServed: tls.strikesServed,
        auxRequestsServed: tls.auxRequestsServed,
        rateLimitHits: tls.rateLimitHits
      }
    });
  });

  api.post('/auth/exchange', (req, res) => {
    const tokenInput = req.body?.token || req.body?.url || '';
    const consumed = consumeMagicLoginToken(tokenInput);
    if (!consumed) {
      return res.status(401).json({
        ok: false,
        error: 'Invalid or expired !weblogin token. Run !weblogin in Discord for a fresh 5-minute link.'
      });
    }
    const cookieVal = createSessionCookieToken(consumed.userId, consumed.guildId);
    setSessionCookie(res, req, cookieVal);
    return res.json({ ok: true, defaultGuildId: consumed.guildId || null });
  });

  api.post('/auth/logout', (req, res) => {
    clearSessionCookie(res, req);
    res.json({ ok: true });
  });

  api.get('/me', requireAuth(client), async (req, res) => {
    const guilds = await getAccessibleGuilds(client, req.dashUser.id);
    res.json({
      ok: true,
      defaultGuildId: req.dashSession.gid || guilds[0]?.id || null,
      user: {
        id: req.dashUser.id,
        username: req.dashUser.username,
        displayName: cleanDisplayName(req.dashUser.globalName || req.dashUser.username),
        avatarUrl: req.dashUser.displayAvatarURL({ size: 128 }),
        isBotOwner: isRootBotOwnerId(req.dashUser.id)
      },
      botAvatar: client?.user?.displayAvatarURL?.({ size: 64, extension: 'png', forceStatic: false }) || null,
      botName: client?.user?.displayName || client?.user?.username || 'Athena Prime',
      guilds
    });
  });

  // ---------------------------------------------------------------------------
  // GUILD FULL STATE & TELEMETRY SNAPSHOT
  // ---------------------------------------------------------------------------
  api.get('/guilds/:guildId/state', requireAuth(client), requireGuildAccess(client), async (req, res) => {
    const guild = req.targetGuild;
    const cfg = db.getGuildConfig(guild.id);
    const isSecured = Boolean(cfg.securityEnabled && cfg.antiNukeEnabled);

    const botMe = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const allRolePos = guild.roles.cache.map(r => r.position);
    const maxPos = allRolePos.length ? Math.max(...allRolePos) : 0;
    const botPos = botMe?.roles?.highest?.position ?? 0;
    const hasManageRoles = Boolean(
      botMe?.permissions?.has(PermissionFlagsBits.ManageRoles) ||
      botMe?.permissions?.has(PermissionFlagsBits.Administrator)
    );

    const tls = getRawTlsLaneStatus();
    const track = getSecurityTrackingSnapshot(guild.id);
    const antiStrip = getAntiStripTelemetry(guild.id);
    const dashStats = await getCachedStats(guild);
    const shardId = Number.isInteger(guild.shardId) ? guild.shardId : 0;

    // Resolve Shields (all 32)
    const modsMap = cfg.antinukeModules || {};
    const shields = ALL_ANTINUKE_MODULE_KEYS.map(key => {
      const meta = SHIELD_METADATA[key] || { label: key, category: 'vectors', code: key.toUpperCase(), desc: '' };
      return {
        key,
        label: meta.label,
        category: meta.category,
        code: meta.code,
        desc: meta.desc,
        enabled: isSecured ? modsMap[key] !== false : false
      };
    });
    const armedCount = shields.filter(s => s.enabled).length;

    // Resolve Whitelist users & roles + Extra Owners + Bot Whitelist
    const rawWl = db.getAllWhitelists(guild.id);
    const userWlEntries = await Promise.all(
      Object.entries(rawWl.users || {}).map(async ([uid, entry]) => {
        const meta = await resolveUserMeta(client, guild, uid);
        return {
          ...meta,
          modules: Array.isArray(entry?.modules) ? entry.modules : ['all'],
          triggerLimit: Number(entry?.triggerLimit || 0),
          currentUsage: Number(entry?.currentUsage || 0)
        };
      })
    );

    const roleWlEntries = Object.entries(rawWl.roles || {}).map(([rid, entry]) => {
      const role = guild.roles.cache.get(rid);
      return {
        id: rid,
        name: role ? role.name : `Deleted Role (${rid.slice(-4)})`,
        colorHex: role?.hexColor && role.hexColor !== '#000000' ? role.hexColor : '#00f0ff',
        modules: Array.isArray(entry?.modules) ? entry.modules : ['all'],
        triggerLimit: Number(entry?.triggerLimit || 0),
        currentUsage: Number(entry?.currentUsage || 0)
      };
    });

    const extraOwnerIds = db.getExtraOwners(guild.id) || [];
    const extraOwners = await Promise.all(extraOwnerIds.map(uid => resolveUserMeta(client, guild, uid)));

    const botWlIds = db.getBotWhitelist(guild.id) || [];
    const botWhitelist = await Promise.all(botWlIds.map(bid => resolveUserMeta(client, guild, bid)));

    // Searchable picklists (safe cached subset up to 150) for quick modal dropdowns
    const availableRoles = guild.roles.cache
      .filter(r => r.id !== guild.roles.everyone.id && !r.managed)
      .sort((a, b) => b.position - a.position)
      .first(100)
      .map(r => ({ id: r.id, name: r.name, position: r.position }));

    const cachedMembers = guild.members.cache
      .first(120)
      .map(m => ({
        id: m.id,
        displayName: cleanDisplayName(m.displayName || m.user?.username || m.id),
        username: m.user?.username || m.id,
        bot: Boolean(m.user?.bot)
      }));

    // Honeypot state
    const incidents = db.getIncidents(guild.id, 50);
    const honeypotChannel = resolveGuildChannelSummary(guild, cfg.honeypotChannelId);
    const honeypotRole = cfg.honeypotRoleId ? guild.roles.cache.get(cfg.honeypotRoleId) : null;
    const honeypotTriggers = incidents.filter(i => i.type === 'HONEYPOT_TRIGGER').length;

    // Quarantined members
    const rawQuarantines = db.getQuarantinedInGuild(guild.id) || [];
    const quarantined = await Promise.all(rawQuarantines.map(async q => {
      const meta = await resolveUserMeta(client, guild, q.userId);
      return { ...meta, ...q };
    }));

    // TagDrag rules
    const tagDragCfg = db.getTagDragConfig(guild.id);

    // Time Machine & Infra snapshots
    const tmSnapshots = (db.getTimeMachineSnapshots(guild.id) || []).slice(0, 15).map(s => ({
      id: s.id,
      timestamp: s.timestamp,
      label: s.label,
      creatorId: s.creatorId,
      creatorTag: s.creatorTag,
      channelsCount: s.channelsCount,
      rolesCount: s.rolesCount
    }));
    const infraSnap = db.cache?.infraSnapshots?.[guild.id] || null;
    const rollingSnaps = db.cache?.serverSnapshots?.[guild.id] || [];

    // Synced feature channels visibility (Database ID verification parity)
    const countingCfg = db.getCounting(guild.id);
    const welcomeCfg = db.getWelcomeConfig(guild.id);
    const leaveCfg = db.getLeaveConfig(guild.id);
    const rateChId = db.getRateChannel(guild.id);
    const syncSummary = {
      welcome: { enabled: Boolean(welcomeCfg?.enabled), channel: resolveGuildChannelSummary(guild, welcomeCfg?.channelId) },
      leave: { enabled: Boolean(leaveCfg?.enabled), channel: resolveGuildChannelSummary(guild, leaveCfg?.channelId) },
      serverLogs: { enabled: Boolean(cfg.serverLogs?.enabled), channel: resolveGuildChannelSummary(guild, cfg.serverLogs?.defaultChannelId) },
      deleteLog: { enabled: Boolean(cfg.serverLogs?.modules?.msgDeletes?.enabled), channel: resolveGuildChannelSummary(guild, cfg.serverLogs?.modules?.msgDeletes?.channelId) },
      securityLog: { enabled: Boolean(cfg.securityLogChannelId || cfg.logChannel), channel: resolveGuildChannelSummary(guild, cfg.securityLogChannelId || cfg.logChannel) },
      inviteLog: { enabled: Boolean(cfg.inviteChannelId), channel: resolveGuildChannelSummary(guild, cfg.inviteChannelId) },
      rate: { enabled: Boolean(rateChId), channel: resolveGuildChannelSummary(guild, rateChId) },
      quote: { enabled: Boolean(cfg.quoteChannelId), channel: resolveGuildChannelSummary(guild, cfg.quoteChannelId) },
      counting: { enabled: Boolean(countingCfg?.channelId), currentCount: countingCfg?.currentCount || 0, channel: resolveGuildChannelSummary(guild, countingCfg?.channelId) },
      homeVc: { enabled: Boolean(cfg.homeVcId), channel: resolveGuildChannelSummary(guild, cfg.homeVcId) },
      dashboardChannel: { enabled: Boolean(cfg.dashboardChannelId), channel: resolveGuildChannelSummary(guild, cfg.dashboardChannelId) }
    };

    res.json({
      ok: true,
      guild: {
        id: guild.id,
        name: guild.name,
        iconUrl: guild.iconURL({ size: 128 }) || null,
        memberCount: guild.memberCount || 0,
        channelCount: guild.channels.cache.size,
        roleCount: guild.roles.cache.size,
        ownerId: guild.ownerId,
        shardId,
        // Guild-specific bot avatar (server profile pic if set, else global avatar)
        botGuildAvatar: botMe?.displayAvatarURL({ size: 64, forceStatic: false }) || client?.user?.displayAvatarURL?.({ size: 64 }) || null,
        hierarchy: {
          botPos,
          maxPos,
          meetsTop3: botPos >= maxPos - 2,
          meetsMemberCount: (guild.memberCount || 0) >= 200,
          hasManageRoles,
          hasBotBypass: Boolean(cfg.botOwnerBypass)
        }
      },
      clearance: req.clearance,
      security: {
        securityEnabled: Boolean(cfg.securityEnabled),
        antiNukeEnabled: Boolean(cfg.antiNukeEnabled),
        isSecured,
        underAttack: isGuildUnderAttack(guild.id),
        armedCount,
        totalModules: ALL_ANTINUKE_MODULE_KEYS.length,
        antiNukePunishment: cfg.antiNukePunishment || 'ban',
        antiNukeThreshold: cfg.antiNukeThreshold || 1,
        twoFactorVerified: Boolean(cfg.twoFactorVerified),
        twoFactorEmailMasked: maskEmail(cfg.twoFactorEmail),
        pendingDisarmChallenge: Boolean(
          cfg.pendingAction === 'disable_all' &&
          cfg.pendingTwoFactorExpiresAt &&
          cfg.pendingTwoFactorExpiresAt > Date.now()
        ),
        integrity: dashStats?.integrity ?? (isSecured ? 100 : 70),
        metrics: dashStats?.metrics || null,
        shields
      },
      telemetry: {
        wsPingMs: client.ws.ping > 0 ? Math.round(client.ws.ping) : 0,
        uptimeSec: Math.floor(process.uptime()),
        tls,
        track,
        antiStrip,
        liveRecords: db.getSecurityLiveRecords(guild.id, 30),
        auditDigest: dashStats?.logs || []
      },
      access: {
        whitelists: {
          users: userWlEntries,
          roles: roleWlEntries
        },
        extraOwners,
        botWhitelist,
        availableRoles,
        cachedMembers
      },
      controls: {
        automod: {
          antiLinkEnabled: Boolean(cfg.antiLinkEnabled),
          allowAllLinks: Boolean(cfg.allowAllLinks),
          antiInviteEnabled: Boolean(cfg.antiInviteEnabled),
          allowInvitesGlobally: Boolean(cfg.allowInvitesGlobally),
          antiSpamEnabled: Boolean(cfg.antiSpamEnabled),
          antiSpamMentionEnabled: Boolean(cfg.antiSpamMentionEnabled),
          antiFloodEnabled: Boolean(cfg.antiFloodEnabled),
          wordFilterEnabled: Boolean(cfg.wordFilterEnabled),
          bigFontsEnabled: Boolean(cfg.bigFontsEnabled),
          aiToxicityEnabled: Boolean(cfg.aiToxicityEnabled),
          blacklistWords: Array.isArray(cfg.blacklistWords) ? cfg.blacklistWords : []
        },
        honeypot: {
          armed: honeypotChannel.exists,
          channelId: honeypotChannel.id,
          channelName: honeypotChannel.name,
          roleId: honeypotRole?.id || cfg.honeypotRoleId || null,
          roleName: honeypotRole?.name || null,
          punishment: (cfg.honeypotPunishment || 'ban').toLowerCase(),
          triggersCount: honeypotTriggers
        },
        tagdrag: {
          rules: tagDragCfg.rules || []
        },
        backups: {
          snapshots: tmSnapshots,
          rollingSnapshotsCount: Array.isArray(rollingSnaps) ? rollingSnaps.length : 0,
          infraLastUpdated: infraSnap?.lastUpdated || rollingSnaps?.[0]?.timestamp || null,
          channelsTracked: infraSnap?.channels?.length || guild.channels.cache.size,
          rolesTracked: infraSnap?.roles?.length || guild.roles.cache.size,
          overridesTracked: guild.channels.cache.reduce((acc, c) => acc + (c.permissionOverwrites?.cache?.size || 0), 0),
          vanityCode: guild.vanityURLCode || null
        }
      },
      incidents,
      quarantined,
      syncSummary
    });
  });

  // ---------------------------------------------------------------------------
  // SECURITY ARM / DISARM (WITH 2FA CHALLENGE GATE FOR TIER 0)
  // ---------------------------------------------------------------------------
  api.post('/guilds/:guildId/security/arm', requireAuth(client), requireGuildAccess(client, 'canArm'), async (req, res) => {
    const guild = req.targetGuild;
    const isBotOwner = isRootBotOwnerId(req.dashUser.id);
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const maxPos = Math.max(...guild.roles.cache.map(r => r.position), 0);
    const botPos = botMember?.roles?.highest?.position ?? 0;

    if (!isBotOwner) {
      if ((guild.memberCount || 0) < 200) {
        return res.status(400).json({
          ok: false,
          error: 'Requirement not met: Guild must have at least 200 members to arm unbypassable security.'
        });
      }
      if (botPos < maxPos - 2) {
        return res.status(400).json({
          ok: false,
          error: `Hierarchy error: Athena's highest role (pos ${botPos}) must be within the Top 3 roles (highest is ${maxPos}).`
        });
      }
    }

    const hasManageRoles = Boolean(
      botMember?.permissions?.has(PermissionFlagsBits.ManageRoles) ||
      botMember?.permissions?.has(PermissionFlagsBits.Administrator)
    );
    if (!hasManageRoles) {
      return res.status(400).json({
        ok: false,
        error: 'Athena lacks Manage Roles / Administrator permission required for persistence sentinels.'
      });
    }

    const ok = await runSecurityEnableSequence(guild, async () => {}, req.dashUser).catch(err => {
      console.error('[WebDash Arm Error]', err);
      return false;
    });
    if (!ok) {
      return res.status(500).json({ ok: false, error: 'Failed to arm security sequence. Check bot permissions and role position.' });
    }

    snapshotGuildInfrastructure(guild);
    guildStatsCache.delete(guild.id);
    logToSecurityChannel(
      guild,
      cv2.log(
        `Web Dashboard Security Armed | ${TICK_EMOJI}`,
        `${formatUserLink(req.dashUser, guild)} armed all **32 Anti-Nuke Shields** via Web Dashboard.`
      )
    );

    res.json({ ok: true, message: 'All 32 Anti-Nuke Shields & persistence sentinels armed.' });
  });

  api.post('/guilds/:guildId/security/disarm/challenge', requireAuth(client), requireGuildAccess(client, 'canDisarm'), async (req, res) => {
    const guild = req.targetGuild;
    const cfg = db.getGuildConfig(guild.id);

    if (cfg.twoFactorVerified && cfg.twoFactorEmail) {
      const code2fa = crypto.randomInt(100000, 1000000).toString();
      db.updateGuildConfig(guild.id, {
        pendingTwoFactorCode: code2fa,
        pendingTwoFactorExpiresAt: Date.now() + 10 * 60 * 1000,
        pendingTwoFactorAttempts: 0,
        pendingAction: 'disable_all'
      });

      let emailDispatched = true;
      let mailNote = '';
      try {
        const { send2FACode } = await import('../utils/mailer.js');
        await send2FACode(cfg.twoFactorEmail, code2fa, guild.name);
      } catch (err) {
        emailDispatched = false;
        mailNote = err?.message || 'SMTP dispatch error';
        console.log('[WebDash 2FA SMTP Blocked]', mailNote);
      }

      return res.json({
        ok: true,
        requiresOtp: true,
        emailDispatched,
        emailMasked: maskEmail(cfg.twoFactorEmail),
        message: emailDispatched
          ? `6-digit OTP dispatched to ${maskEmail(cfg.twoFactorEmail)}. Enter within 10 minutes.`
          : `SMTP failed (${mailNote}). Check server console for the active 6-digit OTP.`
      });
    }

    return res.json({
      ok: true,
      requiresOtp: false,
      requiresConfirmPhrase: true,
      message: 'Gmail 2FA is not bound on this server. Confirm with DISARM to disengage shields.'
    });
  });

  api.post('/guilds/:guildId/security/disarm/confirm', requireAuth(client), requireGuildAccess(client, 'canDisarm'), async (req, res) => {
    const guild = req.targetGuild;
    const cfg = db.getGuildConfig(guild.id);
    const has2FA = Boolean(cfg.twoFactorVerified && cfg.twoFactorEmail);

    if (has2FA) {
      const inputCode = String(req.body?.code || '').trim();
      if (!/^\d{6}$/.test(inputCode)) {
        return res.status(400).json({ ok: false, error: 'Enter the 6-digit verification OTP.' });
      }
      if (!cfg.pendingTwoFactorCode || !cfg.pendingTwoFactorExpiresAt || Date.now() > cfg.pendingTwoFactorExpiresAt) {
        db.updateGuildConfig(guild.id, { pendingTwoFactorCode: null, pendingTwoFactorExpiresAt: null, pendingTwoFactorAttempts: 0, pendingAction: null });
        return res.status(400).json({ ok: false, error: '2FA challenge expired. Request a new OTP code.' });
      }
      if (String(cfg.pendingTwoFactorCode).trim() !== inputCode) {
        const attempts = (cfg.pendingTwoFactorAttempts || 0) + 1;
        if (attempts >= 5) {
          db.updateGuildConfig(guild.id, { pendingTwoFactorCode: null, pendingTwoFactorExpiresAt: null, pendingTwoFactorAttempts: 0, pendingAction: null });
          return res.status(403).json({ ok: false, error: 'Too many failed OTP attempts. Challenge invalidated.' });
        }
        db.updateGuildConfig(guild.id, { pendingTwoFactorAttempts: attempts });
        return res.status(403).json({ ok: false, error: `Incorrect 2FA OTP (${attempts}/5 attempts).` });
      }

      db.updateGuildConfig(guild.id, {
        pendingTwoFactorCode: null,
        pendingTwoFactorExpiresAt: null,
        pendingTwoFactorAttempts: 0,
        pendingAction: null
      });
    } else {
      const phrase = String(req.body?.confirmPhrase || '').trim().toUpperCase();
      if (phrase !== 'DISARM') {
        return res.status(400).json({ ok: false, error: 'Type DISARM to confirm disengaging all security shields.' });
      }
    }

    const member = guild.members.cache.get(req.dashUser.id) || req.dashUser;
    await handleSecurityToggleAll(guild, member, false);
    guildStatsCache.delete(guild.id);
    logToSecurityChannel(
      guild,
      cv2.log(
        `Web Dashboard Security Disarmed | ${WARN_EMOJI}`,
        `${formatUserLink(req.dashUser, guild)} disengaged all **32 Anti-Nuke Shields** via Web Dashboard 2FA Gate.`
      )
    );

    res.json({ ok: true, message: 'All 32 shields disengaged and persistence roles removed.' });
  });

  api.post('/guilds/:guildId/modules/toggle', requireAuth(client), requireGuildAccess(client, 'canToggleModules'), (req, res) => {
    const guild = req.targetGuild;
    const moduleKey = String(req.body?.moduleKey || '').trim();
    const enabled = Boolean(req.body?.enabled);

    if (!enabled && !req.clearance.canDisarm) {
      return res.status(403).json({
        ok: false,
        error: 'Only the Server Owner or Bot Owner can disable active Anti-Nuke shields.'
      });
    }

    if (!ALL_ANTINUKE_MODULE_KEYS.includes(moduleKey)) {
      return res.status(400).json({ ok: false, error: 'Unknown Anti-Nuke module key.' });
    }

    const cfg = db.getGuildConfig(guild.id);
    if (!cfg.securityEnabled || !cfg.antiNukeEnabled) {
      return res.status(400).json({ ok: false, error: 'Arm Master Security first before toggling individual modules.' });
    }

    const nextMods = { ...(cfg.antinukeModules || {}), [moduleKey]: enabled };
    db.updateGuildConfig(guild.id, { antinukeModules: nextMods });

    logToSecurityChannel(
      guild,
      cv2.log(
        `Web Shield Module Toggle | ${enabled ? TICK_EMOJI : WARN_EMOJI}`,
        `${formatUserLink(req.dashUser, guild)} set \`${moduleKey}\` to **${enabled ? 'ARMED' : 'DISABLED'}** via Web Dashboard.`
      )
    );

    res.json({ ok: true, moduleKey, enabled });
  });

  // ---------------------------------------------------------------------------
  // WHITELIST, EXTRA OWNERS, & BOT WHITELIST ACCESS CONTROL
  // ---------------------------------------------------------------------------
  api.post('/guilds/:guildId/whitelist/save', requireAuth(client), requireGuildAccess(client, 'canManageWhitelist'), async (req, res) => {
    const guild = req.targetGuild;
    const type = req.body?.type === 'roles' ? 'roles' : 'users';
    const targetId = String(req.body?.targetId || '').replace(/[<@!&>]/g, '').trim();
    if (!/^\d{15,22}$/.test(targetId)) {
      return res.status(400).json({ ok: false, error: 'Provide a valid Discord User or Role ID.' });
    }

    let rawMods = Array.isArray(req.body?.modules) ? req.body.modules.map(m => String(m).trim()).filter(Boolean) : ['all'];
    if (rawMods.length === 0 || rawMods.includes('all')) rawMods = ['all'];
    const triggerLimit = Math.max(0, Math.min(1000, Number.parseInt(req.body?.triggerLimit || '0', 10) || 0));

    if (type === 'roles' && !guild.roles.cache.has(targetId)) {
      return res.status(404).json({ ok: false, error: 'Role ID not found in this server.' });
    }

    db.updateWhitelist(guild.id, targetId, type, {
      modules: rawMods,
      triggerLimit,
      currentUsage: 0
    });

    logToSecurityChannel(
      guild,
      cv2.log(
        `Web Whitelist Updated | ${TICK_EMOJI}`,
        `${formatUserLink(req.dashUser, guild)} whitelisted **${type === 'roles' ? `Role ${targetId}` : formatUserLink(targetId, guild)}** (${rawMods.join(', ')}, limit: ${triggerLimit === 0 ? 'Unlimited' : triggerLimit}).`
      )
    );

    res.json({ ok: true, message: 'Whitelist entry saved into O(1) security table.' });
  });

  api.post('/guilds/:guildId/whitelist/remove', requireAuth(client), requireGuildAccess(client, 'canManageWhitelist'), (req, res) => {
    const guild = req.targetGuild;
    const type = req.body?.type === 'roles' ? 'roles' : 'users';
    const targetId = String(req.body?.targetId || '').trim();
    if (!/^\d{15,22}$/.test(targetId)) {
      return res.status(400).json({ ok: false, error: 'Invalid target ID.' });
    }
    db.updateWhitelist(guild.id, targetId, type, null);
    logToSecurityChannel(
      guild,
      cv2.log(
        `Web Whitelist Revoked | ${WARN_EMOJI}`,
        `${formatUserLink(req.dashUser, guild)} revoked whitelist clearance for \`${targetId}\` (${type}).`
      )
    );
    res.json({ ok: true, message: 'Whitelist clearance revoked.' });
  });

  api.post('/guilds/:guildId/extra-owners/add', requireAuth(client), requireGuildAccess(client, 'canManageExtraOwners'), async (req, res) => {
    const guild = req.targetGuild;
    const targetId = String(req.body?.userId || '').replace(/[<@!>]/g, '').trim();
    if (!/^\d{15,22}$/.test(targetId)) {
      return res.status(400).json({ ok: false, error: 'Provide a valid Discord User ID.' });
    }
    if (targetId === guild.ownerId) {
      return res.status(400).json({ ok: false, error: 'The Server Owner already holds Tier-0 Root clearance.' });
    }
    const targetUser = await client.users.fetch(targetId).catch(() => null);
    if (!targetUser) {
      return res.status(404).json({ ok: false, error: 'Could not resolve Discord user ID.' });
    }
    if (targetUser.bot) {
      return res.status(400).json({ ok: false, error: 'Bots cannot be granted Extra Owner status. Use Bot Whitelist instead.' });
    }

    const added = db.addExtraOwner(guild.id, targetId);
    if (added) {
      logToSecurityChannel(
        guild,
        cv2.log(
          `Extra Owner Granted (Web) | ${TICK_EMOJI}`,
          `${formatUserLink(req.dashUser, guild)} granted **Tier-1 Extra Owner** status to ${formatUserLink(targetUser, guild)}.`
        )
      );
    }
    res.json({ ok: true, added, message: added ? 'Extra Owner authorized.' : 'User is already an Extra Owner.' });
  });

  api.post('/guilds/:guildId/extra-owners/remove', requireAuth(client), requireGuildAccess(client, 'canManageExtraOwners'), (req, res) => {
    const guild = req.targetGuild;
    const targetId = String(req.body?.userId || '').trim();
    if (!/^\d{15,22}$/.test(targetId)) {
      return res.status(400).json({ ok: false, error: 'Invalid User ID.' });
    }
    const removed = db.removeExtraOwner(guild.id, targetId);
    if (removed) {
      logToSecurityChannel(
        guild,
        cv2.log(
          `Extra Owner Revoked (Web) | ${WARN_EMOJI}`,
          `${formatUserLink(req.dashUser, guild)} revoked Extra Owner status from ${formatUserLink(targetId, guild)}.`
        )
      );
    }
    res.json({ ok: true, removed, message: removed ? 'Extra Owner revoked.' : 'User was not listed as Extra Owner.' });
  });

  api.post('/guilds/:guildId/bot-whitelist/add', requireAuth(client), requireGuildAccess(client, 'canManageWhitelist'), async (req, res) => {
    const guild = req.targetGuild;
    const botId = String(req.body?.botId || '').replace(/[<@!>]/g, '').trim();
    if (!/^\d{15,22}$/.test(botId)) {
      return res.status(400).json({ ok: false, error: 'Provide a valid Discord Bot Application/User ID.' });
    }
    const botUser = await client.users.fetch(botId).catch(() => null);
    if (!botUser) {
      return res.status(404).json({ ok: false, error: 'Bot user ID could not be resolved.' });
    }
    if (!botUser.bot) {
      return res.status(400).json({ ok: false, error: 'That ID belongs to a human user, not a bot application.' });
    }
    db.addBotToWhitelist(guild.id, botId);
    logToSecurityChannel(
      guild,
      cv2.log(
        `Bot Whitelisted (Web) | ${TICK_EMOJI}`,
        `${formatUserLink(req.dashUser, guild)} added bot ${formatUserLink(botUser, guild)} (\`${botId}\`) to the guild Bot Whitelist.`
      )
    );
    res.json({ ok: true, message: `Added ${botUser.username} to Bot Whitelist.` });
  });

  api.post('/guilds/:guildId/bot-whitelist/remove', requireAuth(client), requireGuildAccess(client, 'canManageWhitelist'), (req, res) => {
    const guild = req.targetGuild;
    const botId = String(req.body?.botId || '').trim();
    if (!/^\d{15,22}$/.test(botId)) {
      return res.status(400).json({ ok: false, error: 'Invalid Bot ID.' });
    }
    const removed = db.removeBotFromWhitelist(guild.id, botId);
    logToSecurityChannel(
      guild,
      cv2.log(
        `Bot WhitelistRemoved (Web) | ${WARN_EMOJI}`,
        `${formatUserLink(req.dashUser, guild)} removed bot \`${botId}\` from the Bot Whitelist (Zero Immunity active).`
      )
    );
    res.json({ ok: true, removed, message: 'Bot removed from whitelist.' });
  });

  // ---------------------------------------------------------------------------
  // EXTRA CONTROLS: AUTOMOD, BLACKLIST WORDS, HONEYPOT, TAGDRAG, SNAPSHOTS
  // ---------------------------------------------------------------------------
  api.post('/guilds/:guildId/automod', requireAuth(client), requireGuildAccess(client, 'canManageControls'), (req, res) => {
    const guild = req.targetGuild;
    const cfg = db.getGuildConfig(guild.id);
    const { action, word, toggles } = req.body || {};

    if (action === 'add_word') {
      const clean = String(word || '').trim().toLowerCase();
      if (!clean || clean.length > 64) {
        return res.status(400).json({ ok: false, error: 'Enter a valid blacklisted word or phrase (1-64 chars).' });
      }
      const added = db.addBlacklistWord(guild.id, clean);
      return res.json({ ok: true, added, blacklistWords: db.getGuildConfig(guild.id).blacklistWords });
    }

    if (action === 'remove_word') {
      const clean = String(word || '').trim().toLowerCase();
      const removed = db.removeBlacklistWord(guild.id, clean);
      return res.json({ ok: true, removed, blacklistWords: db.getGuildConfig(guild.id).blacklistWords });
    }

    if (toggles && typeof toggles === 'object') {
      const updates = {};
      const allowedBoolKeys = [
        'antiLinkEnabled',
        'antiInviteEnabled',
        'antiSpamEnabled',
        'antiSpamMentionEnabled',
        'antiFloodEnabled',
        'wordFilterEnabled',
        'bigFontsEnabled',
        'aiToxicityEnabled'
      ];
      for (const k of allowedBoolKeys) {
        if (typeof toggles[k] === 'boolean') {
          updates[k] = toggles[k];
        }
      }
      const isSecured = Boolean(cfg.securityEnabled && cfg.antiNukeEnabled);
      if (!isSecured && (updates.antiLinkEnabled || updates.antiInviteEnabled || updates.antiSpamEnabled || updates.antiFloodEnabled)) {
        return res.status(400).json({
          ok: false,
          error: 'Arm Master Security on the Overview tab first to activate anti-link/invite/spam/flood interceptors.'
        });
      }
      db.updateGuildConfig(guild.id, updates);
      logToSecurityChannel(
        guild,
        cv2.log(
          `AutoMod Matrix Updated (Web) | ${TICK_EMOJI}`,
          `${formatUserLink(req.dashUser, guild)} updated AutoMod & Heuristic settings via Web Dashboard.`
        )
      );
      return res.json({ ok: true, message: 'AutoMod matrix updated.' });
    }

    res.status(400).json({ ok: false, error: 'Unsupported automod payload.' });
  });

  api.post('/guilds/:guildId/honeypot', requireAuth(client), requireGuildAccess(client, 'canManageControls'), async (req, res) => {
    const guild = req.targetGuild;
    const action = String(req.body?.action || '').trim();
    const punishment = String(req.body?.punishment || '').toLowerCase().trim();

    if (action === 'deploy') {
      const result = await setupHoneypot(guild, req.dashUser, punishment || null);
      if (!result.success) {
        return res.status(400).json({ ok: false, error: result.error });
      }
      return res.json({ ok: true, ...result, message: 'Honeypot canary channel & decoy role deployed.' });
    }

    if (action === 'remove') {
      await removeHoneypot(guild);
      return res.json({ ok: true, message: 'Honeypot tripwire disarmed and cleaned up.' });
    }

    if (action === 'punishment') {
      if (!['ban', 'timeout', 'kick'].includes(punishment)) {
        return res.status(400).json({ ok: false, error: 'Punishment must be ban, timeout, or kick.' });
      }
      db.updateGuildConfig(guild.id, { honeypotPunishment: punishment });
      return res.json({ ok: true, punishment, message: `Honeypot punishment set to ${punishment.toUpperCase()}.` });
    }

    res.status(400).json({ ok: false, error: 'Invalid honeypot action.' });
  });

  api.post('/guilds/:guildId/tagdrag', requireAuth(client), requireGuildAccess(client, 'canManageControls'), (req, res) => {
    const guild = req.targetGuild;
    const { action, tag, identityGuildId, intervalSec, query } = req.body || {};

    if (action === 'add') {
      const cleanTag = tag ? String(tag).trim().toUpperCase().slice(0, 4) : null;
      const cleanId = identityGuildId ? String(identityGuildId).trim() : null;
      if (!cleanTag && !cleanId) {
        return res.status(400).json({ ok: false, error: 'Provide a Discord Server Tag (e.g. ATN) or Target Identity Guild ID.' });
      }
      if (cleanId && !/^\d{15,22}$/.test(cleanId)) {
        return res.status(400).json({ ok: false, error: 'Identity Guild ID must be a numeric Snowflake.' });
      }
      const resAdd = db.addTagDragRule(guild.id, {
        identityGuildId: cleanId,
        tag: cleanTag,
        intervalSec: intervalSec || 2,
        addedBy: req.dashUser.id
      });
      return res.json({ ok: true, rule: resAdd.rule, message: 'TagDrag inference rule saved.' });
    }

    if (action === 'toggle') {
      const toggled = db.toggleTagDragRule(guild.id, query);
      if (!toggled) return res.status(404).json({ ok: false, error: 'TagDrag rule not found.' });
      return res.json({ ok: true, rule: toggled, message: `Rule ${toggled.enabled ? 'enabled' : 'paused'}.` });
    }

    if (action === 'remove') {
      const removed = db.removeTagDragRule(guild.id, query);
      if (!removed) return res.status(404).json({ ok: false, error: 'TagDrag rule not found.' });
      return res.json({ ok: true, message: 'TagDrag rule removed.' });
    }

    res.status(400).json({ ok: false, error: 'Unsupported TagDrag action.' });
  });

  api.post('/guilds/:guildId/snapshots/create', requireAuth(client), requireGuildAccess(client, 'canCreateSnapshot'), (req, res) => {
    const guild = req.targetGuild;
    const label = String(req.body?.label || 'Web Dashboard Snapshot').trim().slice(0, 50);
    const snap = takeGuildSnapshot(guild, req.dashUser, label);
    snapshotGuildInfrastructure(guild);
    logToSecurityChannel(
      guild,
      cv2.log(
        `Manual Server Snapshot Created (Web) | ${TICK_EMOJI}`,
        `${formatUserLink(req.dashUser, guild)} captured Time-Machine snapshot \`${snap.id}\` (${snap.channelsCount} channels, ${snap.rolesCount} roles).`
      )
    );
    res.json({
      ok: true,
      snapshot: {
        id: snap.id,
        timestamp: snap.timestamp,
        label: snap.label,
        channelsCount: snap.channelsCount,
        rolesCount: snap.rolesCount
      },
      message: `Manual snapshot ${snap.id} sealed.`
    });
  });

  api.post('/guilds/:guildId/snapshots/restore', requireAuth(client), requireGuildAccess(client, 'canRestoreSnapshot'), async (req, res) => {
    const guild = req.targetGuild;
    const snapshotId = String(req.body?.snapshotId || '').trim();
    const snap = db.getTimeMachineSnapshot(guild.id, snapshotId);
    if (!snap) {
      return res.status(404).json({ ok: false, error: 'Snapshot ID not found.' });
    }
    const result = await restoreFromSnapshot(guild, snap);
    if (!result.success) {
      return res.status(400).json({ ok: false, error: result.error });
    }
    logToSecurityChannel(
      guild,
      cv2.log(
        `Time-Machine Snapshot Restored (Web) | ${TICK_EMOJI}`,
        `${formatUserLink(req.dashUser, guild)} restored missing structure from \`${snapshotId}\` (+${result.restoredRoles} roles, +${result.restoredChannels} channels).`
      )
    );
    res.json({ ok: true, ...result, message: `Restored ${result.restoredChannels} channels & ${result.restoredRoles} roles.` });
  });

  api.get('/guilds/:guildId/snapshots/export', requireAuth(client), requireGuildAccess(client), (req, res) => {
    const guild = req.targetGuild;
    const cfg = db.getGuildConfig(guild.id);
    // Explicitly strip internal auth/2FA secrets before JSON export
    const { pendingTwoFactorCode, twoFactorEmail, ...safeConfig } = cfg;
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount },
      config: {
        ...safeConfig,
        twoFactorEmailMasked: maskEmail(twoFactorEmail)
      },
      extraOwners: db.getExtraOwners(guild.id),
      botWhitelist: db.getBotWhitelist(guild.id),
      snapshots: db.getTimeMachineSnapshots(guild.id).slice(0, 10)
    };
    const filename = `athena_state_${guild.id}_${Date.now()}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(exportPayload, null, 2));
  });

  // ---------------------------------------------------------------------------
  // INCIDENTS & QUARANTINE RELEASE
  // ---------------------------------------------------------------------------
  api.post('/guilds/:guildId/incidents/clear', requireAuth(client), requireGuildAccess(client, 'canClearIncidents'), (req, res) => {
    const guild = req.targetGuild;
    db.clearIncidents(guild.id);
    logToSecurityChannel(
      guild,
      cv2.log(
        `Incident History Cleared (Web) | ${WARN_EMOJI}`,
        `${formatUserLink(req.dashUser, guild)} purged forensic incident logs via Web Dashboard.`
      )
    );
    res.json({ ok: true, message: 'Incident history purged.' });
  });

  api.post('/guilds/:guildId/quarantine/release', requireAuth(client), requireGuildAccess(client, 'canManageWhitelist'), async (req, res) => {
    const guild = req.targetGuild;
    const userId = String(req.body?.userId || '').trim();
    if (!/^\d{15,22}$/.test(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID.' });
    }
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      db.removeQuarantine(guild.id, userId);
      db.removeExploitTaint?.(guild.id, userId);
      return res.json({ ok: true, message: 'User left guild; quarantine DB record cleared.' });
    }
    const actor = guild.members.cache.get(req.dashUser.id) || { id: req.dashUser.id, user: req.dashUser, displayName: req.dashUser.username };
    const result = await executeUnquarantine(guild, member, actor, 'web-dashboard');
    if (result && result.success === false) {
      return res.status(400).json({ ok: false, error: result.message || 'Could not release quarantine.' });
    }
    logToSecurityChannel(
      guild,
      cv2.log(
        `Quarantine Released (Web) | ${TICK_EMOJI}`,
        `${formatUserLink(req.dashUser, guild)} released ${formatUserLink(member, guild)} from quarantine via Web Dashboard.`
      )
    );
    res.json({ ok: true, message: 'Member released from quarantine.' });
  });

  app.use('/api', api);
}
