import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits
} from 'discord.js';
import cv2, { sanitizeCV2Payload } from '../cv2.js';
import db, { ALL_ANTINUKE_MODULE_KEYS } from '../database.js';
import {
  TICK_EMOJI,
  WRONG_EMOJI,
  WARN_EMOJI,
  BULLET_EMOJI,
  UPTIME_EMOJI,
  NAV_EMOJI_IDS,
  getRandomHeadingGlyph
} from '../utils/emojis.js';
import {
  formatChannelLink,
  formatUserLink,
  isExtraOwnerOrHigher
} from '../utils/helpers.js';
import { getRawTlsLaneStatus } from '../utils/rawTlsBanLane.js';
import { getSecurityTrackingSnapshot } from '../utils/antinuke.js';
import { getAntiStripTelemetry } from '../utils/antiStrip.js';

const ON_EMOJI = '<:on:1533844867191406672>';
const OFF_EMOJI = '<:off:1533844858983157851>';

const VIEW_ALIASES = {
  overview: 'overview',
  home: 'overview',
  all: 'overview',
  summary: 'overview',
  transport: 'transport',
  tls: 'transport',
  socket: 'transport',
  sockets: 'transport',
  ratelimit: 'transport',
  rate: 'transport',
  buckets: 'transport',
  bucket: 'transport',
  http: 'transport',
  wiretap: 'wiretap',
  ring: 'wiretap',
  audit: 'wiretap',
  combat: 'wiretap',
  strike: 'wiretap',
  strikes: 'wiretap',
  burst: 'wiretap',
  condemned: 'wiretap',
  auth: 'auth',
  whitelist: 'auth',
  wl: 'auth',
  bot: 'auth',
  bots: 'auth',
  botadd: 'auth',
  inviter: 'auth',
  o1: 'auth',
  recovery: 'recovery',
  restore: 'recovery',
  restoration: 'recovery',
  snapshot: 'recovery',
  snapshots: 'recovery',
  selfcreate: 'recovery',
  queue: 'recovery',
  cache: 'recovery',
  shields: 'shields',
  shield: 'shields',
  modules: 'shields',
  '32': 'shields',
  sentinel: 'shields',
  sentinels: 'shields',
  antistrip: 'shields',
  '2fa': 'shields'
};

const SHIELD_LABELS = {
  antiRoleCreate: 'Anti Role Create',
  antiRoleDelete: 'Anti Role Delete',
  antiRoleUpdate: 'Anti Role Update',
  antiRolePermUpdate: 'Anti Role Perm Escalation',
  antiMemberRoleUpdate: 'Anti Dangerous Role Grant',
  antiRoleReorder: 'Anti Role Reorder',
  antiLinkedRole: 'Anti Linked Role Exploit',
  antiChannelCreate: 'Anti Channel Create',
  antiChannelDelete: 'Anti Channel Delete',
  antiChannelUpdate: 'Anti Channel Settings',
  antiChannelPermUpdate: 'Anti Channel Perm Tamper',
  antiChannelReorder: 'Anti Channel Reorder',
  antiChannelNameMod: 'Anti Channel Rename',
  antiEmojiCreate: 'Anti Emoji Create',
  antiEmojiDelete: 'Anti Emoji Delete',
  antiEmojiUpdate: 'Anti Emoji Update',
  antiWebhooks: 'Anti Webhook Spammer',
  antiBotAdd: 'Anti Bot Add (Owner Only)',
  antiServerUpdate: 'Anti Server Settings',
  antiVanitySteal: 'Anti Vanity URL Hijack',
  antiScheduledEvents: 'Anti Scheduled Events',
  antiBan: 'Anti Member Ban',
  antiKick: 'Anti Member Kick',
  antiUnban: 'Anti Rogue Unban',
  antiMemberPurge: 'Anti Member Purge',
  antiMassBan: 'Anti Mass Ban',
  antiInvite: 'Anti Invite Leak',
  antiInviteDelete: 'Anti Invite Deletion',
  antiAutomodUpdate: 'Anti AutoMod Tamper',
  antiAppCommands: 'Anti App / Integration',
  antiSoundboardCreate: 'Anti Soundboard Create',
  antiSoundboardDelete: 'Anti Soundboard Delete'
};

const VALID_VIEWS = ['overview', 'transport', 'wiretap', 'auth', 'recovery', 'shields'];

function normalizeView(input) {
  const key = String(input || 'overview').toLowerCase().trim();
  return VIEW_ALIASES[key] || (VALID_VIEWS.includes(key) ? key : 'overview');
}

function collectSectrackData(guild) {
  const guildId = guild.id;
  const cfg = db.getGuildConfig(guildId) || {};
  const isSecured = Boolean(cfg.securityEnabled && cfg.antiNukeEnabled);
  const mods = cfg.antinukeModules || {};
  const armedCount = isSecured
    ? ALL_ANTINUKE_MODULE_KEYS.filter(k => mods[k] !== false).length
    : 0;

  const tls = getRawTlsLaneStatus();
  const track = getSecurityTrackingSnapshot(guildId);
  const wl = db.getWhitelistStats(guildId);
  const antiStrip = getAntiStripTelemetry(guildId);
  const extraOwners = db.getExtraOwners(guildId) || [];
  const quarantined = db.getQuarantinedInGuild(guildId) || [];
  const liveRecords = db.getSecurityLiveRecords(guildId) || [];
  const rawSignatures = db.cache?.nukeSignatures?.[guildId];
  const signaturesCount = Array.isArray(rawSignatures) ? rawSignatures.length : 0;
  const taintsMap = db.cache?.exploitTaints?.[guildId] || {};
  const taintCount = Object.keys(taintsMap).length;

  const fwRoleId = cfg.firewallRoleId || cfg.athenFirewallRoleId || null;
  const unbRoleId = cfg.unbypassableRoleId || cfg.athenaUnbypassableRoleId || null;
  const fwRole = fwRoleId ? (guild.roles?.cache?.get?.(fwRoleId) || null) : null;
  const unbRole = unbRoleId ? (guild.roles?.cache?.get?.(unbRoleId) || null) : null;

  const hpChannelId = cfg.honeypotChannelId || null;
  const secLogChannelId = cfg.securityLogChannelId || cfg.logChannel || null;

  return {
    guild,
    cfg,
    isSecured,
    armedCount,
    totalShields: ALL_ANTINUKE_MODULE_KEYS.length,
    mods,
    tls,
    track,
    wl,
    antiStrip,
    extraOwners,
    quarantinedCount: quarantined.length,
    liveRecords,
    signaturesCount,
    taintCount,
    fwRoleId,
    unbRoleId,
    hasFwRole: Boolean(fwRole),
    hasUnbRole: Boolean(unbRole),
    hpChannelId,
    secLogChannelId,
    has2FAEmail: Boolean(cfg.twoFactorEmail)
  };
}

function buildOverviewSections(d) {
  const { guild, tls, track, wl, antiStrip } = d;
  const c = track.combat;
  const rttStr = c.hasLiveLatency
    ? `${c.avgLatency}ms avg (${c.minLatency}-${c.maxLatency}ms)`
    : 'Armed (0 strikes this boot)';

  const ownerLink = formatUserLink(guild.ownerId, guild);
  const hpText = d.hpChannelId ? formatChannelLink(d.hpChannelId, guild) : '`Not Deployed`';

  return [
    {
      type: 10,
      content:
        `### **I. Raw TLS Fast-Lane & Rate-Limit Tracker**\n` +
        `> -# ${BULLET_EMOJI} **Warm Socket Pool:** \`${tls.warmIdleSockets}/${tls.poolCapacity} TCP_NODELAY TLS\` (${tls.initialized ? 'Hot' : 'Standby'} \u00b7 IP: \`${tls.cachedIpv4 || 'resolving'}\`)\n` +
        `> -# ${BULLET_EMOJI} **Dispatches:** \`${tls.strikesServed} raw bans\` \u00b7 \`${tls.auxRequestsServed} aux\` \u00b7 **429s:** \`${tls.rateLimitHits}\` \u00b7 **Buckets:** \`${tls.trackedBuckets}\` (${tls.globalRateLimited ? '**GLOBAL COOLDOWN**' : '`Clear`'})\n` +
        `> -# **Why & How:** Pre-warmed keep-alive TLS sockets + single-copy buffers skip ~50ms handshakes; \`X-RateLimit\` buckets throttle aux calls before 429s.`
    },
    { type: 14, divider: true },
    {
      type: 10,
      content:
        `### **II. Wiretap Audit Ring, Combat & Burst Tracker**\n` +
        `> -# ${BULLET_EMOJI} **Audit Ring Buffer:** \`${track.ring.size}/${track.ring.maxCapacity}\` (\`${track.ring.ttlMs / 1000}s TTL\` \u00b7 \`${track.ring.resolversActive} resolvers\` \u00b7 \`${track.ring.handledAuditCount} deduped\`)\n` +
        `> -# ${BULLET_EMOJI} **Strike Engine:** \`${c.totalStrikes} total\` (\`${c.successfulStrikes} hits\` / \`${c.failedStrikes} fail\`) \u00b7 RTT: \`${rttStr}\`\n` +
        `> -# ${BULLET_EMOJI} **Attack & Burst:** Condemned: \`${track.condemned.inGuild}\` \u00b7 Burst (2s): \`${track.burstTracker.eventsInWindow}/${track.burstTracker.threshold}\` \u00b7 REST Cooldowns: \`${track.restCooldowns.activeForGuild}\`\n` +
        `> -# **Why & How:** Captures raw \`GUILD_AUDIT_LOG_ENTRY_CREATE\` at 0ms, waits via \`raceFirstTruthy\`, and fires single-shot \`rawBan\` with zero role-strip overhead.`
    },
    { type: 14, divider: true },
    {
      type: 10,
      content:
        `### **III. Strict Owner Bot-Add & O(1) Whitelist Tracker**\n` +
        `> -# ${BULLET_EMOJI} **O(1) Whitelist Index:** \`${wl.indexed ? 'HOT IN RAM' : 'Built'}\` \u00b7 Users: \`${wl.totalUsers}\` \u00b7 Roles: \`${wl.totalRoles}\` \u00b7 Extra Owners: \`${d.extraOwners.length}\`\n` +
        `> -# ${BULLET_EMOJI} **Bot Whitelist & Inviters:** \`${wl.botWhitelistCount}\` immune bots (\`_botWhitelistSets\`) \u00b7 Inviters Mapped: \`${track.botInviters.trackedInGuild}\`\n` +
        `> -# ${BULLET_EMOJI} **BotAdd Owners:** ${ownerLink} & Bot Owners only (unwhitelisted owner-added bots run at **0 Immunity**)\n` +
        `> -# **Why & How:** O(1) \`Set\`/\`Map\` lookups eliminate array scans. Only Server Owner & Bot Owner may add unwhitelisted bots — and unwhitelisted bots hold **0 immunity** across all 32 shields.`
    },
    { type: 14, divider: true },
    {
      type: 10,
      content:
        `### **IV. Recovery, Self-Create Guard & 32-Shield Sentinels**\n` +
        `> -# ${BULLET_EMOJI} **RAM Snapshots:** \`${track.infrastructure.channelsCount} ch\` \u00b7 \`${track.infrastructure.rolesCount} roles\` \u00b7 Self-Creates: \`${track.selfCreates.activeForGuild}\` \u00b7 Queue: \`${track.restorations.queueForGuild} / ${track.restorations.queuedLocks} locks\`\n` +
        `> -# ${BULLET_EMOJI} **Armor Matrix:** ${d.isSecured ? `${ON_EMOJI} **ARMED**` : `${OFF_EMOJI} **IDLE**`} (\`${d.armedCount}/${d.totalShields} shields\`) \u00b7 Sentinels: ${d.hasFwRole && d.hasUnbRole ? '`Active`' : '`Idle`'} \u00b7 AntiStrip: \`${antiStrip.alignedWindowMs}ms\`\n` +
        `> -# ${BULLET_EMOJI} **Trap & 2FA:** Honeypot: ${hpText} \u00b7 2FA Disarm: \`${d.has2FAEmail ? 'Email Armed' : 'Off'}\` \u00b7 Quarantined: \`${d.quarantinedCount}\`\n` +
        `> -# **Why & How:** \`markPendingSelfCreate\` stops WS restore races before REST resolves; strict \`&&\` gating closes bypasses; \`antiStrip\` uses a tight 3.5s aligned window.`
    }
  ];
}

function buildTransportSection(d) {
  const { tls } = d;
  const bucketLines = tls.sampleBuckets && tls.sampleBuckets.length > 0
    ? tls.sampleBuckets.map(b =>
        `> -# ${BULLET_EMOJI} \`${b.routeKey}\` \u2014 Remaining: \`${b.remaining}\` \u2022 Resets in \`${(b.resetInMs / 1000).toFixed(2)}s\``
      ).join('\n')
    : `> -# ${BULLET_EMOJI} No exhausted or active per-route buckets currently throttling (\`0ms wait\`).`;

  return [
    {
      type: 10,
      content:
        `### **I. 12-Socket Raw TLS Fast-Lane Telemetry**\n` +
        `> -# ${BULLET_EMOJI} **Lane State:** ${tls.initialized ? `${ON_EMOJI} **WARM & ARMED**` : `${OFF_EMOJI} **Initializing**`} \u2022 Target: \`${tls.target}\` (\`IPv4: ${tls.cachedIpv4 || 'resolving'}\`)\n` +
        `> -# ${BULLET_EMOJI} **Socket Capacity:** \`${tls.warmIdleSockets} idle / ${tls.totalSockets} open / ${tls.poolCapacity} target pool\` (\`TCP_NODELAY\` disabled Nagle buffering)\n` +
        `> -# ${BULLET_EMOJI} **Keep-Alive Heartbeat:** \`Every ${(tls.heartbeatMs / 1000).toFixed(0)}s\` (\`GET /api/v10/gateway\`) \u2022 DNS Refresh: \`${(tls.dnsRefreshMs / 1000).toFixed(0)}s\` \u2022 Timeout: \`${tls.requestTimeoutMs}ms\`\n` +
        `> -# ${BULLET_EMOJI} **Single-Shot Ban Payloads Served:** \`${tls.strikesServed}\` strikes \u2022 **Auxiliary Fast-Lane Ops:** \`${tls.auxRequestsServed}\` calls\n\n` +
        `### **II. Live Discord X-RateLimit Bucket & Global 429 Tracker**\n` +
        `> -# ${BULLET_EMOJI} **Global Rate-Limit Lock:** ${tls.globalRateLimited ? `**ENGAGED (\`${tls.globalRateLimitRemainingMs}ms\` remaining)**` : `${ON_EMOJI} \`Clear (0ms delay)\``}\n` +
        `> -# ${BULLET_EMOJI} **Total HTTP 429 Collisions Caught:** \`${tls.rateLimitHits}\` \u2022 **Live Route Buckets Tracked:** \`${tls.trackedBuckets}\`\n` +
        `${bucketLines}\n\n` +
        `### **III. Architectural Explanations — Why This Saves Critical Milliseconds**\n` +
        `> -# ${BULLET_EMOJI} **Pre-Connected Raw TLS Sockets:** Holding 12 persistent TLS 1.3 sessions open skips TCP SYN/ACK and TLS handshakes (~50ms+ saved on first nuke event).\n` +
        `> -# ${BULLET_EMOJI} **Zero-Allocation Single-Copy Ban Frame:** \`rawTlsSendBan\` compiles one \`Buffer.allocUnsafe\` HTTP \`PUT /bans/:id\` frame with \`{"delete_message_seconds":0}\` and cached Auth headers.\n` +
        `> -# ${BULLET_EMOJI} **Unified Raw Helpers + Rate-Limit Sharing:** Vanity reclaim (\`rawTlsSendVanity\`), webhook wipe, spam channel/role delete, and unban share \`routeBuckets\` so restoration traffic yields immediately to bans.`
    }
  ];
}

function buildWiretapSection(d) {
  const { guild, track } = d;
  const c = track.combat;
  const attackActor = track.attackState.attackerId
    ? formatUserLink(track.attackState.attackerId, guild)
    : '`None`';

  const ringLines = track.ring.recentSample.length > 0
    ? track.ring.recentSample.map(r =>
        `> -# ${BULLET_EMOJI} Action \`${r.action}\` \u2022 Exec: ${r.executorId !== 'Unknown' ? formatUserLink(r.executorId, guild) : '`Unknown`'} \u2022 Target: \`${r.targetId}\` (\`${r.ageMs}ms ago\`)`
      ).join('\n')
    : `> -# ${BULLET_EMOJI} Ring buffer clean — no recent destructive audit entries queued.`;

  const strikeLines = c.recentStrikes.length > 0
    ? c.recentStrikes.slice(0, 4).map(s =>
        `> -# ${BULLET_EMOJI} ${formatUserLink(s.userId, guild)} \u2022 \`${s.actionType}\` \u2022 \`${s.latencyMs}ms\` \u2022 \`${s.status}\` (<t:${Math.floor(s.timestamp / 1000)}:R>)`
      ).join('\n')
    : `> -# ${BULLET_EMOJI} No hostile raw bans executed in current process uptime.`;

  return [
    {
      type: 10,
      content:
        `### **I. 0ms Gateway Audit Ring & REST Fallback Tracker**\n` +
        `> -# ${BULLET_EMOJI} **Gateway Ring Occupancy:** \`${track.ring.size} / ${track.ring.maxCapacity} entries\` (TTL: \`${track.ring.ttlMs / 1000}s\` \u2022 \`${track.ring.resolversActive} active resolvers\`)\n` +
        `> -# ${BULLET_EMOJI} **Duplicate Audit Deduplicator:** \`${track.ring.handledAuditCount} / 3000\` handled entry IDs in RAM\n` +
        `> -# ${BULLET_EMOJI} **REST Audit Cooldowns (\`canFetchRestAudit\`):** \`${track.restCooldowns.activeForGuild} active\` in guild (\`${track.restCooldowns.minIntervalMs}ms\` per-action throttle under raid)\n` +
        `${ringLines}\n\n` +
        `### **II. Single-Shot Raw Ban Combat & Burst Tracker**\n` +
        `> -# ${BULLET_EMOJI} **Attack Status:** ${track.attackState.underAttack ? `**UNDER ATTACK** (Primary Actor: ${attackActor})` : '`Standby / Perimeter Clean`'} (\`${track.attackState.totalActiveGuildAttacks} global guild locks\`)\n` +
        `> -# ${BULLET_EMOJI} **2-Second Burst Velocity:** \`${track.burstTracker.eventsInWindow} / ${track.burstTracker.threshold}\` destructive ops (\`GLOBAL_BURST_WINDOW_MS = ${track.burstTracker.windowMs}ms\`)\n` +
        `> -# ${BULLET_EMOJI} **RAM Condemned Attackers:** \`${track.condemned.inGuild}\` \u2022 **In-Flight Ban Locks:** \`${track.condemned.inFlightBans}\`\n` +
        `> -# ${BULLET_EMOJI} **Single-Shot Raw Ban Record:** \`${c.successfulStrikes} hits / ${c.failedStrikes} fail\` (Avg: \`${c.hasLiveLatency ? c.avgLatency + 'ms' : 'Armed'}\`)\n` +
        `${strikeLines}\n\n` +
        `### **III. Architectural Explanations**\n` +
        `> -# ${BULLET_EMOJI} **\`raceFirstTruthy\` Wiretap:** Unlike \`Promise.race\`, if the 250ms ring timeout finishes with \`null\`, Athena waits for the in-flight REST audit fetch instead of dropping attribution.\n` +
        `> -# ${BULLET_EMOJI} **1.2s Cooldown Replaces 60s Blackout:** Even mid-raid, REST audit attribution refreshes every 1.2s per action type so secondary nuke accounts cannot hide.\n` +
        `> -# ${BULLET_EMOJI} **Single-Shot Direct Ban:** Zero \`rawRoleStrip\` call precedes \`rawBan\`, cutting HTTP traffic in half so the attacker is terminated before request #2 arrives.`
    }
  ];
}

function buildAuthSection(d) {
  const { guild, wl, track } = d;
  const ownerLink = formatUserLink(guild.ownerId, guild);
  const eoLinks = d.extraOwners.length > 0
    ? d.extraOwners.slice(0, 5).map(id => formatUserLink(id, guild)).join(', ') + (d.extraOwners.length > 5 ? ` (+${d.extraOwners.length - 5} more)` : '')
    : '`None Configured`';

  const botLinks = wl.botWhitelistIds.length > 0
    ? wl.botWhitelistIds.slice(0, 6).map(id => `${formatUserLink(id, guild)} (\`${id}\`)`).join('\n> -# ' + BULLET_EMOJI + ' ')
    : '`None` (All external bots stay at **Zero Immunity**)';

  const inviterLines = track.botInviters.recent.length > 0
    ? track.botInviters.recent.map(b =>
        `> -# ${BULLET_EMOJI} Bot ${formatUserLink(b.botId, guild)} \u2190 Invited by ${formatUserLink(b.inviterId, guild)}`
      ).join('\n')
    : `> -# ${BULLET_EMOJI} No recent external bot additions tracked in RAM during this session.`;

  return [
    {
      type: 10,
      content:
        `### **I. O(1) Pre-Indexed Whitelist & Exemption Tracker**\n` +
        `> -# ${BULLET_EMOJI} **Index Cache State (\`_whitelistIndex\`):** ${wl.indexed ? `${ON_EMOJI} **Pre-Indexed in RAM**` : `${ON_EMOJI} **Ready**`} (\`hasLimited = ${wl.hasLimited}\`)\n` +
        `> -# ${BULLET_EMOJI} **Whitelisted Users:** \`${wl.totalUsers}\` total (\`${wl.usersAllCount} all-module Sets\` \u2022 \`${wl.usersModCount} granular Maps\`)\n` +
        `> -# ${BULLET_EMOJI} **Whitelisted Roles:** \`${wl.totalRoles}\` total (\`${wl.rolesAllCount} all-module Sets\` \u2022 \`${wl.rolesModCount} granular Maps\`)\n` +
        `> -# ${BULLET_EMOJI} **Server Owner:** ${ownerLink} \u2022 **Extra Owners (${d.extraOwners.length}):** ${eoLinks}\n\n` +
        `### **II. Strict Owner Bot-Add & Bot Inviter Cascade Tracker**\n` +
        `> -# ${BULLET_EMOJI} **Bot Whitelist Index (\`_botWhitelistSets\`):** \`${wl.botWhitelistCount} immune bots\` (Indexed: \`${wl.botWhitelistIndexed}\`)\n` +
        `> -# ${BULLET_EMOJI} ${botLinks}\n` +
        `> -# ${BULLET_EMOJI} **Tracked Bot Inviters (\`botInviterMap\`):** \`${track.botInviters.trackedInGuild} bots mapped\`\n` +
        `${inviterLines}\n\n` +
        `### **III. Architectural Explanations — Bot-Add & Zero-Immunity Rules**\n` +
        `> -# ${BULLET_EMOJI} **Who Can Invite Bots:** Strictly the **Server Owner** and **Bot Owners**. Even Extra Owners are blocked from adding unwhitelisted bots (\`antiBotAdd\`).\n` +
        `> -# ${BULLET_EMOJI} **Owner Mistake Safety Net (Zero Immunity):** If the Server Owner or Bot Owner accidentally adds a nuke bot that is NOT in \`!botwhitelist\`, that bot receives **zero bypass immunity** and is raw-banned immediately on its first unauthorized channel/role/ban/webhook action.\n` +
        `> -# ${BULLET_EMOJI} **Cascade Inviter Defense:** \`botInviterMap\` binds every joining bot to its inviter ID in RAM so rogue inviters and rogue bots are both neutralized immediately.`
    }
  ];
}

function buildRecoverySection(d) {
  const { guild, track } = d;
  const lastSnap = track.infrastructure.lastUpdated
    ? `<t:${Math.floor(track.infrastructure.lastUpdated / 1000)}:R>`
    : '`Awaiting Sync`';

  const recordLines = d.liveRecords.length > 0
    ? d.liveRecords.slice(0, 4).map(r => {
        const actor = r.executorId ? formatUserLink(r.executorId, guild) : '`Unknown`';
        const ts = r.timestamp ? `<t:${Math.floor(r.timestamp / 1000)}:R>` : '';
        return `> -# ${BULLET_EMOJI} **${r.action || r.module || 'Strike'}** \u2022 Actor: ${actor} \u2022 \`${r.outcome || 'Neutralized'}\` ${ts}`;
      }).join('\n')
    : `> -# ${BULLET_EMOJI} No recent security incidents logged in persistent storage.`;

  return [
    {
      type: 10,
      content:
        `### **I. Infrastructure Snapshots & Create-Before-Mark WS Tracker**\n` +
        `> -# ${BULLET_EMOJI} **RAM Ground-Truth Cache:** \`${track.infrastructure.channelsCount} channels\` \u2022 \`${track.infrastructure.rolesCount} roles\` \u2022 Updated: ${lastSnap}\n` +
        `> -# ${BULLET_EMOJI} **Pending Self-Creates (\`markPendingSelfCreate\`):** \`${track.selfCreates.activeForGuild} active in guild\` (\`${track.selfCreates.totalGlobal} global\`, 10s TTL)\n` +
        `> -# ${BULLET_EMOJI} **In-Flight Object Locks:** \`${track.restorations.inFlightChannels} channels\` \u2022 \`${track.restorations.inFlightRoles} roles restoring\`\n\n` +
        `### **II. Restoration Queue, Deleted Cache & Incident Ledger**\n` +
        `> -# ${BULLET_EMOJI} **Restoration Queue Depth:** \`${track.restorations.queueForGuild} guild pending\` (\`${track.restorations.queueTotal} global\` \u2022 \`${track.restorations.queuedLocks} registry locks\`)\n` +
        `> -# ${BULLET_EMOJI} **Pre-Attack Deleted Snapshots (\`deletedCache\`):** \`${track.restorations.deletedCached} cached items\` (60s window)\n` +
        `> -# ${BULLET_EMOJI} **Threat Forensics:** \`${d.quarantinedCount} quarantined\` \u2022 \`${d.taintCount} exploit taints\` \u2022 \`${d.signaturesCount} learned signatures\`\n` +
        `> -# ${BULLET_EMOJI} **Recent Security Live Records (${d.liveRecords.length}):**\n` +
        `${recordLines}\n\n` +
        `### **III. Architectural Explanations — Zero Race-Condition Recovery**\n` +
        `> -# ${BULLET_EMOJI} **Pre-Marking Before REST:** Every self-created JTC room, sentinel role, or restored channel is registered via \`markPendingSelfCreate\` BEFORE the REST call completes so Gateway \`CREATE\` packets never self-trigger.\n` +
        `> -# ${BULLET_EMOJI} **Priority Yielding & Clean Lock Release:** Restorations pause 250ms and wait for active \`inFlightPunishments\` so \`rawBan\` always gets 100% socket priority, and early exits cleanly release \`restorationRegistry.queued\` locks.`
    }
  ];
}

function buildShieldsSection(d) {
  const { guild, antiStrip } = d;
  const rows = [];
  for (let i = 0; i < ALL_ANTINUKE_MODULE_KEYS.length; i += 2) {
    const k1 = ALL_ANTINUKE_MODULE_KEYS[i];
    const k2 = ALL_ANTINUKE_MODULE_KEYS[i + 1];
    const on1 = d.isSecured && d.mods[k1] !== false;
    const on2 = k2 ? (d.isSecured && d.mods[k2] !== false) : false;
    rows.push(
      `> -# ${on1 ? ON_EMOJI : OFF_EMOJI} ${SHIELD_LABELS[k1] || k1}` +
      (k2 ? ` \u2800|\u2800 ${on2 ? ON_EMOJI : OFF_EMOJI} ${SHIELD_LABELS[k2] || k2}` : '')
    );
  }

  const fwText = d.fwRoleId ? `<@&${d.fwRoleId}> (${d.hasFwRole ? ON_EMOJI + ' Active' : OFF_EMOJI + ' Missing'})` : '`Idle`';
  const unbText = d.unbRoleId ? `<@&${d.unbRoleId}> (${d.hasUnbRole ? ON_EMOJI + ' Active' : OFF_EMOJI + ' Missing'})` : '`Idle`';
  const logChText = d.secLogChannelId ? formatChannelLink(d.secLogChannelId, guild) : '`Unbound`';
  const hpText = d.hpChannelId ? formatChannelLink(d.hpChannelId, guild) : '`Off`';

  return [
    {
      type: 10,
      content:
        `### **I. All ${d.totalShields} Anti-Nuke Shields (${d.armedCount}/${d.totalShields} Armed)**\n` +
        rows.join('\n')
    },
    { type: 14, divider: true },
    {
      type: 10,
      content:
        `### **II. Persistence Sentinels, 2FA Lock & Intent Trackers**\n` +
        `> -# ${BULLET_EMOJI} **Sentinel Roles:** Firewall: ${fwText} \u2022 Unbypassable: ${unbText}\n` +
        `> -# ${BULLET_EMOJI} **AntiStrip Sync Window:** \`${antiStrip.alignedWindowMs}ms\` (${antiStrip.syncingNow ? 'Syncing' : `Cooldown left: ${antiStrip.remainingWindowMs}ms`}) — **0ms 15s-gap elimination**\n` +
        `> -# ${BULLET_EMOJI} **Security Logs:** ${logChText} \u2022 **Honeypot:** ${hpText} \u2022 **2FA Disarm:** \`${d.has2FAEmail ? 'Email Required' : 'Configure via !config'}\`\n` +
        `> -# **Why & How:** Strict \`securityEnabled && antiNukeEnabled\` gating closes OR-bypass holes; \`DANGEROUS_PERMS_MASK\` catches 16 privilege flags in O(1); webhook \`@everyone\`/embed pings and \`ManageMessages\` bypasses are blocked.`
    }
  ];
}

export async function buildSectrackPayload(guild, client, activeView = 'overview') {
  const view = normalizeView(activeView);
  const d = collectSectrackData(guild);
  const nowSec = Math.floor(Date.now() / 1000);

  let sections;
  if (view === 'transport') sections = buildTransportSection(d);
  else if (view === 'wiretap') sections = buildWiretapSection(d);
  else if (view === 'auth') sections = buildAuthSection(d);
  else if (view === 'recovery') sections = buildRecoverySection(d);
  else if (view === 'shields') sections = buildShieldsSection(d);
  else sections = buildOverviewSections(d);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sectrack:view:overview').setLabel('All Trackers').setStyle(view === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sectrack:view:transport').setLabel('TLS & RateLimits').setStyle(view === 'transport' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sectrack:view:wiretap').setLabel('Ring & Combat').setStyle(view === 'wiretap' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sectrack:view:auth').setLabel('O(1) WL & BotAdd').setStyle(view === 'auth' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sectrack:view:recovery').setLabel('Recovery & Snap').setStyle(view === 'recovery' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sectrack:view:shields').setLabel('32 Shields & 2FA').setStyle(view === 'shields' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`sectrack:refresh:${view}`).setLabel('Live Refresh').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('sectrack:close').setEmoji(NAV_EMOJI_IDS.DELETE).setStyle(ButtonStyle.Secondary)
  );

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content:
          `# ${getRandomHeadingGlyph()} Security Telemetry & Tracking Matrix | ${TICK_EMOJI}\n` +
          `> -# ${UPTIME_EMOJI} **Active View:** \`${view.toUpperCase()}\` \u2022 **Posture:** ${d.isSecured ? '`ARMED (32 Modules + Zero-Immunity Bots)`' : '`IDLE`'} \u2022 **Synced:** <t:${nowSec}:R>`
      },
      { type: 14, divider: true },
      ...sections,
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# **Athena Prime Military-Grade Security Tracker \u2022 Single-Shot Direct Raw Ban Engine**`
      }
    ]
  };

  return sanitizeCV2Payload({
    components: [container, row1, row2],
    flags: MessageFlags.IsComponentsV2
  });
}

export async function handleSectrackInteraction(interaction) {
  const customId = interaction.customId;
  if (!customId || !customId.startsWith('sectrack:')) return false;

  if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
    return interaction.reply({
      ...cv2.danger(
        `Access Denied | ${WRONG_EMOJI}`,
        'Only the **Server Owner**, **Extra Owners**, or **Bot Owner** can inspect internal Security Tracking telemetry.'
      ),
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
  }

  if (customId === 'sectrack:close') {
    return interaction.message?.delete().catch(() => null);
  }

  const parts = customId.split(':'); // ['sectrack', 'view'|'refresh', targetView]
  const targetView = normalizeView(parts[2] || 'overview');
  await interaction.deferUpdate().catch(() => null);
  const payload = await buildSectrackPayload(interaction.guild, interaction.client, targetView);
  return interaction.editReply(payload).catch(() => null);
}

export const commands = [
  {
    name: 'sectrack',
    aliases: [
      'securitytrack',
      'tracksec',
      'antinuketrack',
      'threattrack',
      'shieldtrack',
      'trackshield',
      'secwatch',
      'secradar',
      'threatradar',
      'secmonitor',
      'guardtrack',
      'trackops'
    ],
    description: 'Unified Security & Anti-Nuke tracker with live telemetry and explanations across all defense systems',
    category: 'security',
    permissions: [PermissionFlagsBits.Administrator],
    options: [
      {
        name: 'view',
        description: 'Select specific security tracking subsystem & explanation view',
        type: 3,
        required: false,
        choices: [
          { name: 'All Trackers + Explanations (Overview)', value: 'overview' },
          { name: '12-Socket Raw TLS & X-RateLimit Buckets', value: 'transport' },
          { name: '0ms Audit Ring, Combat & Burst Tracker', value: 'wiretap' },
          { name: 'O(1) Whitelist, BotAdd & Inviter Cascade', value: 'auth' },
          { name: 'RAM Snapshots, Self-Creates & Restoration', value: 'recovery' },
          { name: 'All 32 Shields, Sentinels & 2FA Lock', value: 'shields' }
        ]
      }
    ],

    async executePrefix(message, args) {
      if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
        return message.reply(cv2.danger(
          `Access Denied | ${WRONG_EMOJI}`,
          'Only the **Server Owner**, authorized **Extra Owners**, or **Bot Owner** can inspect Security Telemetry & Tracking.'
        )).catch(() => null);
      }

      const view = normalizeView(args[0]);
      const payload = await buildSectrackPayload(message.guild, message.client, view);
      return message.reply(payload);
    },

    async executeSlash(interaction) {
      if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
        return interaction.reply({
          ...cv2.danger(
            `Access Denied | ${WRONG_EMOJI}`,
            'Only the **Server Owner**, authorized **Extra Owners**, or **Bot Owner** can inspect Security Telemetry & Tracking.'
          ),
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply();
      const view = normalizeView(interaction.options.getString('view') || 'overview');
      const payload = await buildSectrackPayload(interaction.guild, interaction.client, view);
      return interaction.editReply(payload);
    }
  }
];
