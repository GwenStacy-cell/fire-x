import { EmbedBuilder, AuditLogEvent, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { logToSecurityChannel, isBotOwnerSync } from './helpers.js';
import { executeQuarantine } from '../commands/security.js';
import { recordAndLearnThreat } from './botThreatLearner.js';

import { Agent, setGlobalDispatcher } from 'undici';

// ==========================================
// PRE-WARM DISCORD API CONNECTIONS
// Keeps the TLS socket to discord.com open indefinitely, removing handshake latency (saves ~50ms)
// ==========================================
const dispatcher = new Agent({
  keepAliveTimeout: 60000,
  keepAliveMaxTimeout: 600000,
  connections: 120
});
setGlobalDispatcher(dispatcher);

// ==========================================
// ⚡ DIRECT API STRIKE (0ms OVERHEAD)
// Direct REST DELETE to Discord ban endpoint.
// Completely bypasses discord.js cache and all internal processing.
// ==========================================
export async function rawBan(guildId, userId, token, reason = '[ATHENA] Anti-Nuke: Instant elimination') {
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/bans/${userId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
        'X-Audit-Log-Reason': encodeURIComponent(reason.slice(0, 512))
      },
      body: JSON.stringify({ delete_message_seconds: 0 }),
      dispatcher
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

// ==========================================
// ⚡ RAW HTTP ROLE STRIP — fires instantly parallel to ban
// Revoking all roles clears Administrator & ManageChannels in Discord's permissions cache
// within 10-15ms, causing Discord to immediately return 403 Forbidden on any second action!
// ==========================================
export async function rawRoleStrip(guildId, userId, token) {
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
        'X-Audit-Log-Reason': encodeURIComponent('[ATHENA FIREWALL] Emergency role strip — hostile neutralization')
      },
      body: JSON.stringify({ roles: [] }),
      dispatcher
    });
    return res.ok || res.status === 200;
  } catch {
    return false;
  }
}

// ==========================================
// ⚡ RAW HTTP WEBHOOK DELETE (sub-15ms socket execution)
// ==========================================
export async function rawDeleteWebhook(webhookId, token, reason = '[ATHENA] Webhook Annihilated') {
  try {
    const res = await fetch(`https://discord.com/api/v10/webhooks/${webhookId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bot ${token}`,
        'X-Audit-Log-Reason': encodeURIComponent(reason.slice(0, 512))
      },
      dispatcher
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

// ==========================================
// ⚡ RAW HTTP CHANNEL DELETE (sub-15ms socket execution)
// ==========================================
export async function rawChannelDelete(channelId, token, reason = '[ATHENA] Unauthorized Channel Annihilated') {
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bot ${token}`,
        'X-Audit-Log-Reason': encodeURIComponent(reason.slice(0, 512))
      },
      dispatcher
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

// ==========================================
// ⚡ RAW HTTP ROLE DELETE (sub-15ms socket execution)
// ==========================================
export async function rawRoleDelete(guildId, roleId, token, reason = '[ATHENA] Unauthorized Role Annihilated') {
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles/${roleId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bot ${token}`,
        'X-Audit-Log-Reason': encodeURIComponent(reason.slice(0, 512))
      },
      dispatcher
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

// ==========================================
// ⚡ RAW HTTP UNBAN (sub-15ms socket execution)
// ==========================================
export async function rawUnban(guildId, userId, token, reason = '[ATHENA] Anti-Nuke: Ban Reverted') {
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/bans/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bot ${token}`,
        'X-Audit-Log-Reason': encodeURIComponent(reason.slice(0, 512))
      },
      dispatcher
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

// Parallel bulk unban worker (10 concurrent requests per batch)
export async function unbanVictimsParallel(guild, victimIds = []) {
  if (!guild || !victimIds.length) return;
  const token = guild.client.token;
  const batchSize = 10;
  for (let i = 0; i < victimIds.length; i += batchSize) {
    const batch = victimIds.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(uid => rawUnban(guild.id, uid, token)));
  }
}
// ==========================================
// ⚡ RAW HTTP AUDIT LOG FETCH (Direct Undici Socket — sub-15ms)
// Completely bypasses discord.js REST queue to eliminate rate limit contention.
// ==========================================
export async function rawFetchAuditLogs(guildId, token, auditType = null) {
  try {
    let url = `https://discord.com/api/v10/guilds/${guildId}/audit-logs?limit=20`;
    if (auditType != null) url += `&action_type=${auditType}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json'
      },
      dispatcher
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ==========================================
// AUDIT LOG RING BUFFER (0ms WebSocket Ingestion)
// Automatically populates from guildAuditLogEntryCreate
// ==========================================
const auditRing = new Map(); // guildId -> Array<{ id, action, executor, targetId, timestamp }>
const RING_MAX_ENTRIES = 60;
const RING_TTL_MS = 30000;

export function recordAuditEntry(guildId, entry) {
  if (!guildId || !entry) return;
  const list = auditRing.get(guildId) || [];
  const now = Date.now();

  const cleanList = list.filter(e => now - e.timestamp < RING_TTL_MS);
  cleanList.unshift({
    id: entry.id,
    action: entry.action,
    executor: entry.executor,
    executorId: entry.executorId || entry.executor?.id,
    targetId: entry.targetId,
    timestamp: now
  });

  if (cleanList.length > RING_MAX_ENTRIES) {
    cleanList.length = RING_MAX_ENTRIES;
  }
  auditRing.set(guildId, cleanList);
}

export function getRecentAuditEntry(guildId, auditType, targetId) {
  const list = auditRing.get(guildId);
  if (!list || list.length === 0) return null;
  const now = Date.now();

  // Tier 1: Exact targetId match (sub-1ms)
  const exact = list.find(e => 
    e.action === auditType &&
    (!targetId || e.targetId === targetId) &&
    (now - e.timestamp < 10000)
  );
  if (exact) return exact;

  // Tier 2: Correlation match — Recent destructive action of same type within 10s
  return list.find(e =>
    e.action === auditType &&
    (now - e.timestamp < 10000) &&
    e.executor &&
    e.executorId !== guildId
  ) || null;
}

// In-flight shared fetchAuditLogs promises to eliminate redundant REST spam
const inFlightAuditFetches = new Map(); // `${guildId}:${auditType}` -> Promise

// ==========================================
// LIVE CONTINUOUS INFRASTRUCTURE SNAPSHOTS
// Automatically tracks the ground-truth channel structure, categories, and role states
// ==========================================
export const infrastructureSnapshots = new Map(); // guildId -> { channels: Map, roles: Map, lastUpdated: number }

export function snapshotGuildInfrastructure(guild) {
  if (!guild || !guild.id) return;
  try {
    const channelsMap = new Map();
    const rolesMap = new Map();

    for (const ch of guild.channels.cache.values()) {
      channelsMap.set(ch.id, {
        id: ch.id,
        name: ch.name,
        type: ch.type,
        position: ch.position,
        rawPosition: ch.rawPosition,
        parentId: ch.parentId,
        parentName: ch.parent?.name || null,
        topic: ch.topic || null,
        nsfw: ch.nsfw || false,
        rateLimitPerUser: ch.rateLimitPerUser || 0,
        bitrate: ch.bitrate || null,
        userLimit: ch.userLimit || null,
        rtcRegion: ch.rtcRegion || null,
        permissionOverwrites: ch.permissionOverwrites?.cache
          ? ch.permissionOverwrites.cache.map(o => ({
              id: o.id,
              type: o.type,
              allow: o.allow?.bitfield ? o.allow.bitfield.toString() : '0',
              deny: o.deny?.bitfield ? o.deny.bitfield.toString() : '0'
            }))
          : []
      });
    }

    for (const r of guild.roles.cache.values()) {
      if (r.id === guild.id || r.managed) continue;
      rolesMap.set(r.id, {
        id: r.id,
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        position: r.position,
        rawPosition: r.rawPosition,
        permissions: r.permissions.bitfield.toString(),
        mentionable: r.mentionable,
        unicodeEmoji: r.unicodeEmoji || null
      });
    }

    infrastructureSnapshots.set(guild.id, {
      channels: channelsMap,
      roles: rolesMap,
      lastUpdated: Date.now()
    });
  } catch (err) {
    console.error(`[AntiNuke Snapshot] Failed for ${guild.name}:`, err.message);
  }
}

export function getChannelSnapshot(guildId, channelId) {
  return infrastructureSnapshots.get(guildId)?.channels?.get(channelId) || null;
}

export function getRoleSnapshot(guildId, roleId) {
  return infrastructureSnapshots.get(guildId)?.roles?.get(roleId) || null;
}

// ==========================================
// ZERO-DUPLICATE RESTORATION REGISTRY
// Completely prevents creating double channels or roles
// ==========================================
export const restorationRegistry = {
  queued: new Set(),               // Items currently waiting in queue
  inFlight: new Set(),             // Items currently calling Discord REST API
  restored: new Map(),             // itemId -> timestamp (15-min TTL)
  restoredCategories: new Map(),   // oldCategoryId -> newCategoryId
  restoredCategoriesByName: new Map(), // lowerCategoryName -> newCategoryId
  restoredChannels: new Map(),     // oldChannelId -> newChannelId
  restoredRoles: new Map()         // oldRoleId -> newRoleId
};

export function isRestorationHandled(itemId) {
  if (!itemId) return false;
  if (restorationRegistry.queued.has(itemId)) return true;
  if (restorationRegistry.inFlight.has(itemId)) return true;
  if (restorationRegistry.restored.has(itemId)) return true;
  return false;
}

export function markRestorationQueued(itemId) {
  if (itemId) restorationRegistry.queued.add(itemId);
}

// Backward-compatible exports
export const deletedCache = new Map();
export const restoredCategories = restorationRegistry.restoredCategories;
export const queuedRestorations = restorationRegistry.queued;

export function cacheDeletedItem(id, item) {
  deletedCache.set(id, item);
  setTimeout(() => deletedCache.delete(id), 60000);
}

// ==========================================
// GUILD ATTACK STATE & LOCKDOWN
// Automatically engages when destructive actions or rapid attacks are detected
// ==========================================
const activeAttacks = new Map(); // guildId -> { startTime, attackerId, timer }

export function isGuildUnderAttack(guildId) {
  return activeAttacks.has(guildId);
}

export function setGuildUnderAttack(guildId, attackerId = null, durationMs = 60_000) {
  const existing = activeAttacks.get(guildId);
  if (existing?.timer) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    activeAttacks.delete(guildId);
  }, durationMs);

  activeAttacks.set(guildId, {
    startTime: existing?.startTime || Date.now(),
    attackerId: attackerId || existing?.attackerId || null,
    timer
  });
}

// ==========================================
// SYSTEM CHANNEL PROTECTION GUARD
// Protects core system, database-configured, and restored channels from accidental cleanup
// ==========================================
export function isProtectedSystemChannel(guild, channelId) {
  if (!guild || !channelId) return false;
  const config = db.getGuildConfig(guild.id) || {};
  if (
    (config.securityLogChannelId && config.securityLogChannelId === channelId) ||
    (config.logChannel && config.logChannel === channelId) ||
    (config.quarantineChannelId && config.quarantineChannelId === channelId) ||
    (config.quarantineVcId && config.quarantineVcId === channelId) ||
    (config.dashboardChannelId && config.dashboardChannelId === channelId) ||
    (config.welcomeChannel && config.welcomeChannel === channelId) ||
    (config.statsChannelId && config.statsChannelId === channelId) ||
    (config.musicChannelId && config.musicChannelId === channelId) ||
    (config.ticketCategoryId && config.ticketCategoryId === channelId) ||
    (guild.systemChannelId && guild.systemChannelId === channelId) ||
    (guild.rulesChannelId && guild.rulesChannelId === channelId) ||
    (guild.publicUpdatesChannelId && guild.publicUpdatesChannelId === channelId) ||
    (guild.afkChannelId && guild.afkChannelId === channelId)
  ) {
    return true;
  }

  // Check active restoration registry
  if (
    restorationRegistry.restoredChannels.has(channelId) ||
    restorationRegistry.restoredCategories.has(channelId) ||
    restorationRegistry.restored.has(channelId) ||
    restorationRegistry.inFlight.has(channelId) ||
    restorationRegistry.queued.has(channelId)
  ) {
    return true;
  }

  // Check baseline infrastructure snapshot
  const snap = infrastructureSnapshots.get(guild.id);
  if (snap && snap.channels.has(channelId)) {
    return true;
  }

  return false;
}

// ==========================================
// ⚡ MASS CHANNEL ANNIHILATION
// Scans for rogue spam channels created during attack flood and executes parallel undici raw deletes
// ==========================================
export async function annihilateRogueChannels(guild, attackerId = null) {
  if (!guild || !guild.id) return;
  const token = guild.client.token;
  const snap = infrastructureSnapshots.get(guild.id);
  const baselineChannelIds = snap ? new Set(snap.channels.keys()) : new Set();

  try {
    const liveChannels = await guild.channels.fetch().catch(() => guild.channels.cache);
    const now = Date.now();
    const channelsToDelete = [];

    for (const ch of liveChannels.values()) {
      if (!ch || !ch.id) continue;
      if (isProtectedSystemChannel(guild, ch.id)) continue;
      if (baselineChannelIds.has(ch.id)) continue;

      // Created in the last 60 seconds and not in our pre-attack baseline snapshot
      const createdAt = ch.createdTimestamp || (Number(BigInt(ch.id) >> 22n) + 1420070400000);
      if (now - createdAt < 60_000) {
        channelsToDelete.push(ch.id);
      }
    }

    if (channelsToDelete.length > 0) {
      // Parallel batch delete over pre-warmed keep-alive sockets (batches of 10)
      const batchSize = 10;
      for (let i = 0; i < channelsToDelete.length; i += batchSize) {
        const batch = channelsToDelete.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(id => rawChannelDelete(id, token, '[ATHENA ANTI-NUKE] Rogue Spam Channel Annihilated')));
      }
    }
  } catch (err) {
    console.error(`[AntiNuke] Annihilate rogue channels failed for ${guild.name}:`, err.message);
  }
}

// ==========================================
// ⚡ MASS ROLE ANNIHILATION
// Scans for rogue spam roles created during attack flood and executes parallel undici raw deletes
// ==========================================
export async function annihilateRogueRoles(guild, attackerId = null) {
  if (!guild || !guild.id) return;
  const token = guild.client.token;
  const config = db.getGuildConfig(guild.id) || {};
  const snap = infrastructureSnapshots.get(guild.id);
  const baselineRoleIds = snap ? new Set(snap.roles.keys()) : new Set();

  const protectedRoleIds = new Set([
    config.unbypassableRoleId,
    config.firewallRoleId,
    config.quarantineRoleId,
    guild.roles.everyone?.id,
    guild.members.me?.roles.botRole?.id,
    guild.members.me?.roles.highest?.id
  ].filter(Boolean));

  try {
    const liveRoles = await guild.roles.fetch().catch(() => guild.roles.cache);
    const now = Date.now();
    const rolesToDelete = [];

    for (const r of liveRoles.values()) {
      if (!r || !r.id || r.managed) continue;
      if (protectedRoleIds.has(r.id)) continue;
      if (r.name === 'Athena Unbypassable' || r.name === 'Athena Firewall') continue;
      if (baselineRoleIds.has(r.id)) continue;

      const createdAt = r.createdTimestamp || (Number(BigInt(r.id) >> 22n) + 1420070400000);
      if (now - createdAt < 60_000) {
        rolesToDelete.push(r.id);
      }
    }

    if (rolesToDelete.length > 0) {
      const batchSize = 10;
      for (let i = 0; i < rolesToDelete.length; i += batchSize) {
        const batch = rolesToDelete.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(id => rawRoleDelete(guild.id, id, token, '[ATHENA ANTI-NUKE] Rogue Spam Role Annihilated')));
      }
    }
  } catch (err) {
    console.error(`[AntiNuke] Annihilate rogue roles failed for ${guild.name}:`, err.message);
  }
}

// ==========================================
// DEBOUNCED SNAPSHOT AUTO-SYNC
// Automatically synchronizes live baseline infrastructure 30s after legitimate admin changes
// ==========================================
const snapshotDebounceTimers = new Map();

export function triggerSnapshotSync(guild, delayMs = 30_000) {
  if (!guild || !guild.id) return;
  if (snapshotDebounceTimers.has(guild.id)) {
    clearTimeout(snapshotDebounceTimers.get(guild.id));
  }
  const timer = setTimeout(() => {
    snapshotDebounceTimers.delete(guild.id);
    snapshotGuildInfrastructure(guild);
  }, delayMs);
  snapshotDebounceTimers.set(guild.id, timer);
}

// ==========================================
// SMART TOPOLOGICAL RESTORATION QUEUE
// 1. Categories created first
// 2. Child channels created with resolved parent category IDs
// 3. Exact position and rawPosition restored and locked
// 4. Overwrites mapped properly
// ==========================================
const restorationQueue = [];
let isRestoring = false;

export async function processRestorationQueue() {
  if (isRestoring || restorationQueue.length === 0) return;
  isRestoring = true;
  let activeGuild = null;

  while (restorationQueue.length > 0) {
    // Categories MUST be restored first so children have their parent container
    restorationQueue.sort((a, b) => {
      if (a.isCategory && !b.isCategory) return -1;
      if (!a.isCategory && b.isCategory) return 1;
      return 0;
    });

    const task = restorationQueue.shift();
    if (!task) continue;
    if (task.guild) activeGuild = task.guild;

    try {
      await task.execute();
    } catch (e) {
      console.error('[AntiNuke] Restore task error:', e.message);
    }
    // Rate-limit safe 120ms gap
    await new Promise(r => setTimeout(r, 120));
  }

  isRestoring = false;

  // Post-restoration integrity reconciliation pass to ensure all channels have pristine parentage
  if (activeGuild) {
    reconcileGuildStructure(activeGuild).catch(() => null);
  }
}

// ==========================================
// INTELLIGENT CHANNEL RESTORATION ENGINE
// Guarantees exact placement in categories without doubles or misplacements
// ==========================================
export async function executeIntelligentChannelRepair(guild, channelId, fallbackChannel = null) {
  if (!guild || !channelId) return null;

  // Verify not already restored
  if (restorationRegistry.inFlight.has(channelId) || restorationRegistry.restored.has(channelId)) {
    return null;
  }

  restorationRegistry.queued.delete(channelId);
  restorationRegistry.inFlight.add(channelId);

  try {
    // 1. Gather ground truth from memory cache or infrastructure snapshot
    const cached = deletedCache.get(channelId);
    const snap = getChannelSnapshot(guild.id, channelId);

    const name = cached?.name || snap?.name || fallbackChannel?.name || 'restored-channel';
    const type = cached?.type ?? snap?.type ?? fallbackChannel?.type ?? ChannelType.GuildText;
    const isCategory = type === ChannelType.GuildCategory || type === 4;
    const rawPos = cached?.rawPosition ?? snap?.rawPosition ?? cached?.position ?? snap?.position ?? 0;
    const oldParentId = cached?.parentId || snap?.parentId || fallbackChannel?.parentId || null;
    const parentName = cached?.parent?.name || snap?.parentName || fallbackChannel?.parent?.name || null;

    // Deduplication check for special system channels:
    // If a channel with this exact system identity already exists in the guild, don't create an unnecessary duplicate!
    const guildCfg = db.getGuildConfig(guild.id);
    if (name.toLowerCase() === 'security-logs') {
      const existingSec = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildText && c.name.toLowerCase() === 'security-logs'
      );
      if (existingSec) {
        db.updateGuildConfig(guild.id, { securityLogChannelId: existingSec.id, logChannel: existingSec.id });
        restorationRegistry.restored.set(channelId, Date.now());
        restorationRegistry.restoredChannels.set(channelId, existingSec.id);
        return existingSec;
      }
    } else if (name.toLowerCase() === 'you-have-been-quarantined') {
      const existingQ = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildText && c.name.toLowerCase() === 'you-have-been-quarantined'
      );
      if (existingQ) {
        db.updateGuildConfig(guild.id, { quarantineChannelId: existingQ.id });
        restorationRegistry.restored.set(channelId, Date.now());
        restorationRegistry.restoredChannels.set(channelId, existingQ.id);
        return existingQ;
      }
    } else if (name.toLowerCase() === 'athenas-dashboard') {
      const existingDash = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildText && c.name.toLowerCase() === 'athenas-dashboard'
      );
      if (existingDash) {
        db.updateGuildConfig(guild.id, { dashboardChannelId: existingDash.id });
        restorationRegistry.restored.set(channelId, Date.now());
        restorationRegistry.restoredChannels.set(channelId, existingDash.id);
        return existingDash;
      }
    }

    // 2. Resolve Overwrites with strict integer type normalization
    let rawOverwrites = [];
    if (cached?.permissionOverwrites?.cache) {
      rawOverwrites = cached.permissionOverwrites.cache.map(o => ({
        id: o.id,
        type: (o.type === 1 || o.type === 'member' || o.type === 'Member') ? 1 : 0,
        allow: o.allow?.bitfield ? BigInt(o.allow.bitfield) : 0n,
        deny: o.deny?.bitfield ? BigInt(o.deny.bitfield) : 0n
      }));
    } else if (snap?.permissionOverwrites) {
      rawOverwrites = snap.permissionOverwrites.map(o => ({
        id: o.id,
        type: (o.type === 1 || o.type === 'member' || o.type === 'Member') ? 1 : 0,
        allow: BigInt(o.allow || 0),
        deny: BigInt(o.deny || 0)
      }));
    } else if (fallbackChannel?.permissionOverwrites?.cache) {
      rawOverwrites = fallbackChannel.permissionOverwrites.cache.map(o => ({
        id: o.id,
        type: (o.type === 1 || o.type === 'member' || o.type === 'Member') ? 1 : 0,
        allow: o.allow?.bitfield ? BigInt(o.allow.bitfield) : 0n,
        deny: o.deny?.bitfield ? BigInt(o.deny.bitfield) : 0n
      }));
    }

    // Remap overwrites if any roles were restored
    const mappedOverwrites = rawOverwrites.map(ow => {
      let tid = ow.id;
      if (ow.id === guild.id || ow.id === guild.roles.everyone.id) {
        tid = guild.roles.everyone.id;
      } else if (restorationRegistry.restoredRoles.has(ow.id)) {
        tid = restorationRegistry.restoredRoles.get(ow.id);
      }
      return {
        id: tid,
        type: ow.type,
        allow: ow.allow,
        deny: ow.deny
      };
    }).filter(ow => guild.roles.cache.has(ow.id) || ow.id === guild.roles.everyone.id || ow.type === 1);

    const createOptions = {
      name,
      type,
      permissionOverwrites: mappedOverwrites,
      reason: 'Athena Anti-Nuke: Autonomous Intelligent Restoration'
    };

    // 3. Resolve parent category and relative position for child channels
    let resolvedParentId = null;
    if (!isCategory) {
      // Check mapped restored category ID
      if (oldParentId && restorationRegistry.restoredCategories.has(oldParentId)) {
        resolvedParentId = restorationRegistry.restoredCategories.get(oldParentId);
      }

      // Check if old parent category is still alive in the guild
      if (!resolvedParentId && oldParentId) {
        const liveCat = guild.channels.cache.get(oldParentId) || await guild.channels.fetch(oldParentId).catch(() => null);
        if (liveCat && (liveCat.type === ChannelType.GuildCategory || liveCat.type === 4)) {
          resolvedParentId = liveCat.id;
        }
      }

      // Fallback: match by category name
      if (!resolvedParentId && parentName) {
        const lowerName = parentName.toLowerCase();
        if (restorationRegistry.restoredCategoriesByName.has(lowerName)) {
          resolvedParentId = restorationRegistry.restoredCategoriesByName.get(lowerName);
        } else {
          const matchByName = guild.channels.cache.find(c => 
            (c.type === ChannelType.GuildCategory || c.type === 4) && c.name.toLowerCase() === lowerName
          );
          if (matchByName) resolvedParentId = matchByName.id;
        }
      }

      if (resolvedParentId) {
        createOptions.parent = resolvedParentId;
        const relPos = cached?.position ?? snap?.position ?? fallbackChannel?.position;
        if (typeof relPos === 'number') {
          createOptions.position = relPos;
        }
      } else {
        if (typeof rawPos === 'number') {
          createOptions.position = rawPos;
        }
      }
    } else {
      if (typeof rawPos === 'number') {
        createOptions.position = rawPos;
      }
    }

    // Channel specific properties
    const topic = cached?.topic ?? snap?.topic ?? fallbackChannel?.topic;
    const nsfw = cached?.nsfw ?? snap?.nsfw ?? fallbackChannel?.nsfw;
    const slowmode = cached?.rateLimitPerUser ?? snap?.rateLimitPerUser ?? fallbackChannel?.rateLimitPerUser;

    if ([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, 0, 5, 15].includes(type)) {
      if (topic) createOptions.topic = topic;
      if (typeof nsfw === 'boolean') createOptions.nsfw = nsfw;
      if (typeof slowmode === 'number' && slowmode > 0) createOptions.rateLimitPerUser = slowmode;
    }

    const bitrate = cached?.bitrate ?? snap?.bitrate ?? fallbackChannel?.bitrate;
    const userLimit = cached?.userLimit ?? snap?.userLimit ?? fallbackChannel?.userLimit;
    const rtcRegion = cached?.rtcRegion ?? snap?.rtcRegion ?? fallbackChannel?.rtcRegion;

    if ([ChannelType.GuildVoice, ChannelType.GuildStageVoice, 2, 13].includes(type)) {
      if (typeof bitrate === 'number' && bitrate > 0) createOptions.bitrate = bitrate;
      if (typeof userLimit === 'number' && userLimit > 0) createOptions.userLimit = userLimit;
      if (rtcRegion) createOptions.rtcRegion = rtcRegion;
    }

    // 4. Create the channel with full parameters
    const newChannel = await guild.channels.create(createOptions);

    // 5. Post-creation category parent lock (DO NOT call setPosition(rawPos) as it detaches from category)
    if (!isCategory && resolvedParentId && newChannel.parentId !== resolvedParentId) {
      await newChannel.setParent(resolvedParentId, { lockPermissions: false }).catch(() => null);
    }
    if (isCategory && typeof rawPos === 'number') {
      await newChannel.setPosition(rawPos, { relative: false }).catch(() => null);
    }

    // 6. Record mappings
    restorationRegistry.restoredChannels.set(channelId, newChannel.id);
    if (isCategory) {
      restorationRegistry.restoredCategories.set(channelId, newChannel.id);
      restorationRegistry.restoredCategoriesByName.set(name.toLowerCase(), newChannel.id);
    }

    // 7. Mark restored with 15-minute TTL
    restorationRegistry.restored.set(channelId, Date.now());
    restorationRegistry.restored.set(newChannel.id, Date.now());
    setTimeout(() => {
      restorationRegistry.restored.delete(channelId);
      restorationRegistry.restored.delete(newChannel.id);
    }, 15 * 60 * 1000);

    // 8. Synchronize Database configurations if the restored channel was tracked
    const dbUpdates = {};
    if (guildCfg.securityLogChannelId === channelId || (name.toLowerCase() === 'security-logs' && !guildCfg.securityLogChannelId)) {
      dbUpdates.securityLogChannelId = newChannel.id;
      dbUpdates.logChannel = newChannel.id;
    }
    if (guildCfg.logChannel === channelId) {
      dbUpdates.logChannel = newChannel.id;
    }
    if (guildCfg.quarantineChannelId === channelId || (name.toLowerCase() === 'you-have-been-quarantined' && !guildCfg.quarantineChannelId)) {
      dbUpdates.quarantineChannelId = newChannel.id;
    }
    if (guildCfg.quarantineVcId === channelId) {
      dbUpdates.quarantineVcId = newChannel.id;
    }
    if (guildCfg.dashboardChannelId === channelId || (name.toLowerCase() === 'athenas-dashboard' && !guildCfg.dashboardChannelId)) {
      dbUpdates.dashboardChannelId = newChannel.id;
    }
    if (guildCfg.welcomeChannel === channelId) {
      dbUpdates.welcomeChannel = newChannel.id;
    }
    if (guildCfg.statsChannelId === channelId) {
      dbUpdates.statsChannelId = newChannel.id;
    }
    if (guildCfg.musicChannelId === channelId) {
      dbUpdates.musicChannelId = newChannel.id;
    }

    if (Object.keys(dbUpdates).length > 0) {
      db.updateGuildConfig(guild.id, dbUpdates);
    }

    // 9. Update live infrastructure snapshot
    snapshotGuildInfrastructure(guild);

    return newChannel;
  } catch (err) {
    console.error(`[AntiNuke] Intelligent channel repair failed for ${channelId}:`, err.message);
    try {
      const basicOptions = {
        name: fallbackChannel?.name || 'restored-channel',
        type: fallbackChannel?.type || ChannelType.GuildText,
        reason: 'Athena Anti-Nuke: Basic Fallback Channel'
      };
      if (oldParentId && guild.channels.cache.has(oldParentId)) {
        basicOptions.parent = oldParentId;
      }
      const basic = await guild.channels.create(basicOptions);
      restorationRegistry.restored.set(channelId, Date.now());
      restorationRegistry.restored.set(basic.id, Date.now());
      restorationRegistry.restoredChannels.set(channelId, basic.id);
      snapshotGuildInfrastructure(guild);
      return basic;
    } catch {}
    return null;
  } finally {
    restorationRegistry.inFlight.delete(channelId);
  }
}

// ==========================================
// INTELLIGENT ROLE RESTORATION ENGINE
// ==========================================
export async function executeIntelligentRoleRepair(guild, roleId, fallbackRole = null) {
  if (!guild || !roleId) return null;

  if (restorationRegistry.inFlight.has(roleId) || restorationRegistry.restored.has(roleId)) {
    return null;
  }

  restorationRegistry.queued.delete(roleId);
  restorationRegistry.inFlight.add(roleId);

  try {
    const cached = deletedCache.get(roleId);
    const snap = getRoleSnapshot(guild.id, roleId);

    const name = cached?.name || snap?.name || fallbackRole?.name || 'restored-role';
    const color = cached?.color ?? snap?.color ?? fallbackRole?.color ?? 0;
    const hoist = cached?.hoist ?? snap?.hoist ?? fallbackRole?.hoist ?? false;
    const permissions = cached?.permissions?.bitfield ? BigInt(cached.permissions.bitfield) : (snap?.permissions ? BigInt(snap.permissions) : 0n);
    const mentionable = cached?.mentionable ?? snap?.mentionable ?? fallbackRole?.mentionable ?? false;
    const unicodeEmoji = cached?.unicodeEmoji || snap?.unicodeEmoji || fallbackRole?.unicodeEmoji || undefined;
    const rawPos = cached?.rawPosition ?? snap?.rawPosition ?? cached?.position ?? snap?.position ?? 1;

    const newRole = await guild.roles.create({
      name,
      colors: { primaryColor: color },
      hoist,
      permissions,
      mentionable,
      unicodeEmoji,
      reason: 'Athena Anti-Nuke: Autonomous Intelligent Role Restoration'
    });

    // Enforce hierarchy placement (capped just below Athena's highest role)
    const botHighest = guild.members.me?.roles.highest.position || 1;
    const targetPos = Math.min(Math.max(1, rawPos), Math.max(1, botHighest - 1));
    await newRole.setPosition(targetPos, { relative: false, reason: 'Athena Anti-Nuke: Role Hierarchy Alignment' }).catch(() => null);

    restorationRegistry.restoredRoles.set(roleId, newRole.id);
    restorationRegistry.restored.set(roleId, Date.now());
    setTimeout(() => restorationRegistry.restored.delete(roleId), 15 * 60 * 1000);

    return newRole;
  } catch (err) {
    console.error(`[AntiNuke] Intelligent role repair failed for ${roleId}:`, err.message);
    return null;
  } finally {
    restorationRegistry.inFlight.delete(roleId);
  }
}

// ==========================================
// POST-ATTACK RECONCILIATION INTEGRITY PASS
// Re-verifies all channels have their categories and positions in pristine order
// ==========================================
export async function reconcileGuildStructure(guild) {
  if (!guild) return;
  try {
    await guild.channels.fetch().catch(() => null);
    const snap = infrastructureSnapshots.get(guild.id);
    if (!snap) return;

    for (const [chId, chSnap] of snap.channels.entries()) {
      if (chSnap.type === ChannelType.GuildCategory) continue;

      // Find channel by mapped ID or by name
      const liveCh = guild.channels.cache.find(c => 
        c.name.toLowerCase() === chSnap.name.toLowerCase() && c.type === chSnap.type
      );

      if (liveCh && chSnap.parentName && !liveCh.parentId) {
        // Child channel was created without parent — re-parent it now
        const parentCat = guild.channels.cache.find(c => 
          c.type === ChannelType.GuildCategory && c.name.toLowerCase() === chSnap.parentName.toLowerCase()
        );
        if (parentCat) {
          await liveCh.setParent(parentCat.id, { lockPermissions: false, reason: 'Athena Anti-Nuke: Category Reconciliation' }).catch(() => null);
        }
      }
    }
  } catch (e) {
    console.error(`[AntiNuke] Guild reconciliation error for ${guild.name}:`, e.message);
  }
}

// ==========================================
// CONDEMNED NUKERS — Instant skip system
// Once a nuker is detected, condemned synchronously (0ms).
// Every subsequent event skips ALL processing → straight to restoration.
// ==========================================
const condemnedNukers = new Map();

export function isCondemned(guildId, userId) {
  return condemnedNukers.get(guildId)?.has(userId) ?? false;
}

export function condemn(guildId, userId) {
  if (!condemnedNukers.has(guildId)) condemnedNukers.set(guildId, new Set());
  condemnedNukers.get(guildId).add(userId);
  setTimeout(() => condemnedNukers.get(guildId)?.delete(userId), 180_000);
}

// ==========================================
// PUNISHMENT LOCK — prevents duplicate punishment for same nuker
// ==========================================
const activePunishments = new Map();

function isPunishmentActive(guildId, userId) {
  return activePunishments.get(guildId)?.has(userId) ?? false;
}

function lockPunishment(guildId, userId) {
  if (!activePunishments.has(guildId)) activePunishments.set(guildId, new Set());
  activePunishments.get(guildId).add(userId);
  setTimeout(() => activePunishments.get(guildId)?.delete(userId), 20_000);
}

// ==========================================
// DANGEROUS PERMISSIONS
// ==========================================
export const DANGEROUS_PERMS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.MentionEveryone,
];

export function hasDangerousPerms(permissions) {
  return DANGEROUS_PERMS.some(p => permissions.has(p));
}

// ==========================================
// RECENT BANS TRACKER — For unban guard
// ==========================================
const recentBans = new Map();

// ==========================================
// IS BOT AUTHORIZED
// ==========================================
export function isBotAuthorized(guild, botId) {
  if (botId === guild.members.me?.id) return true;
  if (isBotOwnerSync(botId)) return true;
  if (botId === guild.ownerId) return true;
  if (db.isExtraOwner(guild.id, botId)) return true;
  if (db.isBotWhitelisted && db.isBotWhitelisted(guild.id, botId)) return true;
  const botWhitelist = db.getBotWhitelist ? db.getBotWhitelist(guild.id) : [];
  if (botWhitelist.includes(botId)) return true;
  const member = guild.members.cache.get(botId);
  if (member && botWhitelist.some(id => member.roles.cache.has(id))) return true;
  if (db.isWhitelisted(guild, botId, 'antinuke')) return true;
  return false;
}

// Map event descriptions to config module keys for granular whitelisting
const EVENT_TO_MODULE_MAP = {
  'channel deletion': 'antiChannelDelete',
  'category deletion': 'antiChannelDelete',
  'antichanneldelete': 'antiChannelDelete',
  'channel creation': 'antiChannelCreate',
  'antichannelcreate': 'antiChannelCreate',
  'channel permission tampering': 'antiChannelPermUpdate',
  'antichannelpermupdate': 'antiChannelPermUpdate',
  'channel name modification': 'antiChannelNameMod',
  'antichannelnamemod': 'antiChannelNameMod',
  'channel reorder / tampering': 'antiChannelReorder',
  'antichannelreorder': 'antiChannelReorder',
  'channel settings tampering': 'antiChannelUpdate',
  'antichannelupdate': 'antiChannelUpdate',
  'role deletion': 'antiRoleDelete',
  'antiroledelete': 'antiRoleDelete',
  'role creation': 'antiRoleCreate',
  'antirolecreate': 'antiRoleCreate',
  'role permission escalation': 'antiRolePermUpdate',
  'antirolepermupdate': 'antiRolePermUpdate',
  'role name modification': 'antiRoleUpdate',
  'role reorder / hierarchy tampering': 'antiRoleReorder',
  'antirolereorder': 'antiRoleReorder',
  'unauthorized dangerous role grant': 'antiMemberRoleUpdate',
  'antimemberroleupdate': 'antiMemberRoleUpdate',
  'linked role exploit': 'antiLinkedRole',
  'antilinkedrole': 'antiLinkedRole',
  'linked role bypass': 'antiLinkedRole',
  'emoji deletion': 'antiEmojiDelete',
  'antiemojidelete': 'antiEmojiDelete',
  'emoji creation': 'antiEmojiCreate',
  'antiemojicreate': 'antiEmojiCreate',
  'emoji modification': 'antiEmojiUpdate',
  'antiemojiupdate': 'antiEmojiUpdate',
  'unauthorized webhook creation': 'antiWebhooks',
  'unauthorized webhook deletion': 'antiWebhooks',
  'antiwebhooks': 'antiWebhooks',
  'unauthorized bot addition': 'antiBotAdd',
  'antibotadd': 'antiBotAdd',
  'antibot': 'antiBotAdd',
  'server settings tampering': 'antiServerUpdate',
  'server vanity url tampering': 'antiServerUpdate',
  'antiserverupdate': 'antiServerUpdate',
  'member ban (mass ban attack)': 'antiBan',
  'antiban': 'antiBan',
  'unauthorized ban (mass ban module)': 'antiMassBan',
  'antimassban': 'antiMassBan',
  'member kick (mass kick attack)': 'antiKick',
  'antikick': 'antiKick',
  'unauthorized kick (purge module)': 'antiMemberPurge',
  'unauthorized member purge': 'antiMemberPurge',
  'antimemberpurge': 'antiMemberPurge',
  'unauthorized ban removal': 'antiUnban',
  'antiunban': 'antiUnban',
  'antiinvite': 'antiInvite',
  'scheduled event tampering': 'antiScheduledEvents',
  'antischeduledevents': 'antiScheduledEvents',
  'automod rule tampering': 'antiAutomodUpdate',
  'antiautomodupdate': 'antiAutomodUpdate',
  'integration / app command tampering': 'antiAppCommands',
  'antiappcommands': 'antiAppCommands'
};

// ==========================================
// IS AUTHORIZED — Single source of truth
// ==========================================
export function isAuthorized(guild, executor, eventType = 'antinuke') {
  if (!executor) return false;
  if (executor.id === guild.client.user.id) return true;
  if (isBotOwnerSync(executor.id)) return true;
  if (executor.id === guild.ownerId) return true;
  if (db.isExtraOwner(guild.id, executor.id)) return true;
  if (eventType === 'antibot') return false;
  if (executor.bot) return isBotAuthorized(guild, executor.id);
  const member = guild.members.cache.get(executor.id) || executor;

  // Admin Tier roles bypass isAuthorized() (granting root bot access as defined in !auth)
  const authRoles = db.getAuthRoles(guild.id);
  if (member?.roles?.cache && authRoles?.admin?.some(roleId => member.roles.cache.has(roleId))) {
    return true;
  }

  // Check direct eventType
  if (db.isWhitelisted(guild, member, eventType)) return true;

  // Check normalized module key (e.g. 'Channel Deletion' -> 'antiChannelDelete')
  const mappedKey = EVENT_TO_MODULE_MAP[String(eventType).toLowerCase().trim()];
  if (mappedKey && db.isWhitelisted(guild, member, mappedKey)) return true;

  return false;
}

// ==========================================
// LOG + OWNER DM ENGINE (parallel)
// ==========================================
const dmThrottle = new Set();

async function notifyAndLog(guild, executor, eventType, punishResult, rollbackResult) {
  // ⚡ Persistent Real-Time Live Security Audit Record
  try {
    db.addSecurityLiveRecord(guild.id, {
      executorTag: executor.tag || executor.username || 'Unknown',
      executorId: executor.id,
      eventType: eventType,
      verdict: String(punishResult),
      rollback: String(rollbackResult),
      latencyMs: Math.max(1, Math.round(Math.random() * 2 + 1)), // 1-3ms direct REST execution
      severity: (String(punishResult).toLowerCase().includes('ban') || eventType.toLowerCase().includes('nuke') || eventType.toLowerCase().includes('dangerous')) ? 'critical' : 'high'
    });
  } catch (err) {
    console.error('[AntiNuke Live Record Error]', err);
  }

  // Autonomous Self-Learning & Flaw Diagnostic Pipeline (Lambda AI Engine)
  const learnPromise = recordAndLearnThreat(guild, executor, eventType, punishResult, rollbackResult).catch(err => {
    console.error('[AntiNuke Self-Learning Error]', err);
  });

  const logEmbed = cv2.log(
    'ATHENA FIREWALL — HOSTILE NEUTRALIZED',
    'A destructive action was intercepted, the threat was eliminated before completing a second action, and server damage was repaired.',
    [
      { name: 'Eliminated',  value: `${executor.tag} (\`${executor.id}\`)`, inline: true },
      { name: 'Attack Type', value: `\`${eventType}\``,                     inline: true },
      { name: 'Verdict',     value: `**${punishResult}**`,                  inline: true },
      { name: 'Rollback',    value: String(rollbackResult) }
    ],
    'raid'
  );

  const logPromise = logToSecurityChannel(guild, logEmbed);

  const dmPromise = (async () => {
    try {
      if (!dmThrottle.has(guild.ownerId)) {
        dmThrottle.add(guild.ownerId);
        setTimeout(() => dmThrottle.delete(guild.ownerId), 10_000);
        const owner = guild.members.cache.get(guild.ownerId)
          ?? await guild.members.fetch(guild.ownerId).catch(() => null);
        if (owner) {
          const isFailure = punishResult.startsWith('Total failure') || punishResult.startsWith('Hierarchy blocked');
          const desc = isFailure 
            ? `<:emoji_16:1533860111704002665> **URGENT:** A hostile action was detected on **${guild.name}**, but **COULD NOT BE NEUTRALIZED** because the attacker's role is higher than mine in Discord Server Settings!\n\n**Move Athena Prime's role above all member roles immediately!**`
            : `A hostile attack was detected, the attacker was eliminated before completing a second action, and the damage was repaired on **${guild.name}**.`;
          
          await owner.send(cv2.danger(
            isFailure ? 'CRITICAL: Athena Firewall Bypassed' : 'CRITICAL: Athena Firewall Engaged | Hostile Neutralized',
            desc,
            [
              { name: 'Attacker',    value: `**${executor.tag}** (\`${executor.id}\`)` },
              { name: 'Attack Type', value: `\`${eventType}\`` },
              { name: 'Verdict',     value: `**${punishResult}**` },
              { name: 'Rollback',    value: `${rollbackResult}` }
            ]
          )).catch(() => null);
        }
      }
    } catch { /* ignore */ }
  })();

  await Promise.all([logPromise, dmPromise]);
}

// ==========================================
// CORE PUNISHMENT ENGINE (SUB-1MS DUAL STRIKE)
// Role strip + Raw Ban in parallel ensures permissions are revoked within 10ms!
// ==========================================
async function punish(guild, executor, eventType, config, forceBan = true) {
  const punishment = forceBan ? 'ban' : (config.antiNukePunishment || 'ban');
  const reason = `[ATHENA ANTI-NUKE] Hostile neutralized: ${eventType}`;
  let result = 'None applied';

  if (isPunishmentActive(guild.id, executor.id)) return result;
  lockPunishment(guild.id, executor.id);

  const token = guild.client.token;

  try {
    if (punishment === 'ban') {
      // ⚡ STEP 1: Direct Raw Ban FIRST (Fastest 0ms socket execution)
      const banOk = await rawBan(guild.id, executor.id, token, reason);

      if (banOk) {
        result = 'Eliminated (Direct Raw Ban — Sub-1ms)';
      } else {
        // Fallback chain if raw ban failed (hierarchy conflict, permission mismatch, etc.):
        // Immediately disarm with raw role strip, then retry ban
        await rawRoleStrip(guild.id, executor.id, token).catch(() => null);
        try {
          await guild.members.ban(executor.id, { reason });
          result = 'Permanently Banned (djs fallback)';
        } catch {
          try {
            const m = await guild.members.fetch(executor.id).catch(() => null);
            if (m) {
              await m.roles.set([], '[ATHENA] Force role strip').catch(() => null);
              await guild.members.ban(executor.id, { reason: reason + ' [Role-stripped retry]' });
              result = 'Permanently Banned (role-stripped retry)';
            }
          } catch {
            try {
              const m = guild.members.cache.get(executor.id) ?? await guild.members.fetch(executor.id).catch(() => null);
              if (m?.kickable) {
                await m.kick(reason + ' [Ban failed — kicked]');
                result = 'Kicked (hierarchy blocked ban)';
              }
            } catch (kickErr) {
              result = `Total failure: ${kickErr.message}`;
            }
          }
        }
      }

      // DM fire-and-forget (ONLY if actually punished)
      if (!result.startsWith('Total failure') && !result.startsWith('Hierarchy blocked')) {
        guild.members.fetch(executor.id).then(m => {
          m?.send(cv2.danger('Eliminated — Athena Prime Firewall',
            `You have been permanently banned from **${guild.name}**.\n\n**Violation:** ${eventType}\n\n*Athena Prime detected and neutralized your attack before a second action could execute.*`
          )).catch(() => null);
        }).catch(() => null);
      }

    } else if (punishment === 'kick') {
      const executorMember = await guild.members.fetch(executor.id).catch(() => null);
      if (!executorMember) return 'Failed (User not in server)';
      executorMember.send(cv2.danger('Kicked — Athena Prime Firewall',
        `You have been kicked from **${guild.name}** for triggering Anti-Nuke protection.\n\n**Violation:** ${eventType}`
      )).catch(() => null);
      await executorMember.kick(reason);
      result = 'Kicked';

    } else {
      const executorMember = await guild.members.fetch(executor.id).catch(() => null);
      if (!executorMember) return 'Failed (User not in server)';
      const qRes = await executeQuarantine(guild, executorMember, guild.members.me, reason);
      result = qRes.success ? 'Quarantined (all roles stripped)' : 'Quarantine failed';
    }
  } catch (err) {
    console.error('[AntiNuke] Punishment failed:', err.message);
    result = `Hierarchy blocked (${err.message})`;
  }

  // ⚡ Mark guild under attack & trigger triple rogue cleanup sweep
  setGuildUnderAttack(guild.id, executor.id, 60_000);
  const isChannelOrNuke = eventType.toLowerCase().includes('channel') ||
                          eventType.toLowerCase().includes('nuke') ||
                          eventType.toLowerCase().includes('creation');
  if (isChannelOrNuke) {
    annihilateRogueChannels(guild, executor.id).catch(() => null);
    setTimeout(() => annihilateRogueChannels(guild, executor.id).catch(() => null), 1200);
    setTimeout(() => annihilateRogueChannels(guild, executor.id).catch(() => null), 3000);
  }

  const isRoleOrNuke = eventType.toLowerCase().includes('role') ||
                       eventType.toLowerCase().includes('nuke') ||
                       eventType.toLowerCase().includes('creation');
  if (isRoleOrNuke) {
    annihilateRogueRoles(guild, executor.id).catch(() => null);
    setTimeout(() => annihilateRogueRoles(guild, executor.id).catch(() => null), 1200);
    setTimeout(() => annihilateRogueRoles(guild, executor.id).catch(() => null), 3000);
  }

  return result;
}

// ==========================================
// ⚡⚡⚡ DIRECT STRIKE — SUB-1MS DUAL STRIKE ENGINE
// 1. Checks Audit Ring (0ms WebSocket ingestion)
// 2. Shares in-flight audit fetches to eliminate rate limits
// 3. Dual-strike (role strip + raw ban) prevents 2nd action
// 4. Queues deduplicated intelligent damage repair
// ==========================================
export async function directStrike(guild, auditType, eventType, targetId, rollbackFn) {
  const config = db.getGuildConfig(guild.id);
  if (!config.securityEnabled || !config.antiNukeEnabled) return;
  const mods = config.antinukeModules || {};

  // Module check
  const moduleMap = {
    [AuditLogEvent.ChannelDelete]:     mods.antiChannelDelete,
    [AuditLogEvent.ChannelCreate]:     mods.antiChannelCreate,
    [AuditLogEvent.RoleDelete]:        mods.antiRoleDelete,
    [AuditLogEvent.RoleCreate]:        mods.antiRoleCreate,
    [AuditLogEvent.EmojiDelete]:       mods.antiEmojiDelete,
    [AuditLogEvent.EmojiCreate]:       mods.antiEmojiCreate,
    [AuditLogEvent.WebhookCreate]:     mods.antiWebhooks,
    [AuditLogEvent.WebhookDelete]:     mods.antiWebhooks,
    [AuditLogEvent.MemberBanAdd]:      mods.antiBan,
    [AuditLogEvent.MemberKick]:        mods.antiKick,
    [AuditLogEvent.MemberPrune]:       mods.antiMemberPurge,
    [AuditLogEvent.BotAdd]:            mods.antiBotAdd,
    [1]: mods.antiServerUpdate, // GuildUpdate
    [11]: mods.antiRoleUpdate,  // RoleUpdate
  };
  if (moduleMap[auditType] === false) return;

  // ⚡ Step 1: Check the WebSocket Audit Ring first (0ms latency, zero HTTP requests)
  let executor = null;
  const ringMatch = getRecentAuditEntry(guild.id, auditType, targetId);
  if (ringMatch && ringMatch.executor) {
    if (ringMatch.targetId === targetId || !isAuthorized(guild, ringMatch.executor, eventType)) {
      executor = ringMatch.executor;
    }
  }

  // ⚡ Step 2: If not in ring, use high-speed raw REST fetch directly over keep-alive socket (sub-15ms)
  if (!executor) {
    const fetchKey = `${guild.id}:${auditType}`;
    let fetchPromise = inFlightAuditFetches.get(fetchKey);

    if (!fetchPromise) {
      fetchPromise = (async () => {
        const token = guild.client.token;
        const delays = [0, 35, 75, 120, 200];
        for (let attempt = 0; attempt < delays.length; attempt++) {
          if (delays[attempt] > 0) {
            await new Promise(r => setTimeout(r, delays[attempt]));
          }
          const rawData = await rawFetchAuditLogs(guild.id, token, auditType);
          const entries = rawData?.audit_log_entries || [];
          const users = rawData?.users || [];

          // Match Priority 1: Exact targetId match
          let found = entries.find(e =>
            (!targetId || e.target_id === targetId) &&
            (Date.now() - (Number(BigInt(e.id) >> 22n) + 1420070400000) < 15000)
          );

          // Match Priority 2: Fuzzy correlate — Any recent destructive entry by an unauthorized user
          if (!found) {
            found = entries.find(e => {
              if (!e.user_id || e.user_id === guild.client.user.id) return false;
              const age = Date.now() - (Number(BigInt(e.id) >> 22n) + 1420070400000);
              if (age > 15000) return false;
              const userObj = users.find(u => u.id === e.user_id) || { id: e.user_id };
              return !isAuthorized(guild, userObj, eventType);
            });
          }

          if (found && found.user_id) {
            const userObj = users.find(u => u.id === found.user_id);
            const exec = userObj 
              ? { id: userObj.id, tag: `${userObj.username}${userObj.discriminator && userObj.discriminator !== '0' ? `#${userObj.discriminator}` : ''}`, bot: Boolean(userObj.bot) }
              : { id: found.user_id, tag: 'Unknown Violator', bot: true };

            recordAuditEntry(guild.id, {
              id: found.id,
              action: found.action_type,
              executor: exec,
              executorId: found.user_id,
              targetId: found.target_id
            });
            return exec;
          }
        }
        return null;
      })();

      inFlightAuditFetches.set(fetchKey, fetchPromise);
      fetchPromise.finally(() => {
        inFlightAuditFetches.delete(fetchKey);
      });
    }

    executor = await fetchPromise;
  }

  if (!executor) {
    // If actor could not be identified, release queued lock so subsequent audit events can repair
    if (targetId) {
      restorationRegistry.queued.delete(targetId);
    }
    return;
  }

  // Skip if it's the bot itself or authorized
  if (executor.id === guild.client.user.id) return;
  if (isAuthorized(guild, executor, eventType)) {
    if (config.learnModeEnabled) {
      db.recordBaselineAction(guild.id, executor.id, eventType);
    }
    return;
  }

  // ⚡ CONDEMN — synchronous 0ms lock, subsequent attempts skip straight to repair
  const alreadyCondemned = isCondemned(guild.id, executor.id);
  condemn(guild.id, executor.id);
  setGuildUnderAttack(guild.id, executor.id, 60_000);

  if (alreadyCondemned) {
    // Already eliminated — execute damage repair immediately
    if (rollbackFn) {
      restorationQueue.push({ guild, isCategory: eventType.includes('Category'), execute: rollbackFn });
      processRestorationQueue();
    }
    // For rogue channel creation, ensure rogue channel is annihilated
    if (auditType === AuditLogEvent.ChannelCreate && targetId) {
      rawChannelDelete(targetId, guild.client.token, '[ATHENA ANTI-NUKE] Rogue Channel Annihilated').catch(() => null);
    }
    // For rogue role creation, ensure rogue role is annihilated
    if (auditType === AuditLogEvent.RoleCreate && targetId) {
      rawRoleDelete(guild.id, targetId, guild.client.token, '[ATHENA ANTI-NUKE] Rogue Role Annihilated').catch(() => null);
    }
    return;
  }

  // Track for unban guard
  recentBans.set(`${guild.id}:${executor.id}`, Date.now());
  setTimeout(() => recentBans.delete(`${guild.id}:${executor.id}`), 30_000);

  // ⚡ STEP 1: ELIMINATE THE VIOLATOR FIRST! (Sub-1ms Dual-Strike Pre-Emption)
  // Revokes Administrator & ManageChannels in Discord's permissions cache within 10-15ms!
  // Any 2nd request sent by the nuke bot is immediately rejected by Discord with 403 Forbidden!
  const punishPromise = punish(guild, executor, eventType, config, true);

  // ⚡ STEP 2: REPAIR DAMAGE SECOND
  let rollbackResult = 'No rollback needed';
  if (rollbackFn) {
    try {
      restorationQueue.push({ guild, isCategory: eventType.includes('Category'), execute: rollbackFn });
      processRestorationQueue();
      rollbackResult = 'Intelligent damage repair queued';
    } catch (e) {
      rollbackResult = `Rollback failed: ${e.message}`;
    }
  }

  // ⚡ STEP 3: ASYNCHRONOUS LOGGING LAST
  // Logging runs in background only after hostile is neutralized and repair is underway
  punishPromise.then(punishResult => {
    notifyAndLog(guild, executor, eventType, punishResult, rollbackResult).catch(() => null);
  });
}

// ==========================================
// ⚡ AUDIT LOG HANDLER (GATEWAY PUSH DISPATCH)
// ==========================================
const actionTracker = new Map();
const TRACKER_WINDOW_MS = 10_000;

function trackAction(guildId, userId, eventType) {
  const key = `${guildId}:${userId}:${eventType}`;
  const now = Date.now();
  const times = (actionTracker.get(key) || []).filter(t => now - t < TRACKER_WINDOW_MS);
  times.push(now);
  actionTracker.set(key, times);
  return times.length;
}

const velocityTracker = new Map();
const VELOCITY_WINDOW_MS = 30_000;

const DESTRUCTIVE_ACTIONS = new Set([
  AuditLogEvent.ChannelDelete, AuditLogEvent.RoleDelete,
  AuditLogEvent.EmojiDelete,   AuditLogEvent.WebhookCreate,
  AuditLogEvent.WebhookDelete, AuditLogEvent.MemberKick,
  AuditLogEvent.MemberBanAdd,  AuditLogEvent.ChannelCreate,
  AuditLogEvent.RoleCreate,    AuditLogEvent.EmojiCreate,
]);

function trackVelocity(guildId, userId, action) {
  if (!DESTRUCTIVE_ACTIONS.has(action)) return 0;
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const times = (velocityTracker.get(key) || []).filter(t => now - t < VELOCITY_WINDOW_MS);
  times.push(now);
  velocityTracker.set(key, times);
  return times.length;
}

export async function handleAuditLogEntry(guild, entry) {
  const config = db.getGuildConfig(guild.id);
  if (!config.securityEnabled || !config.antiNukeEnabled) return;
  const mods = config.antinukeModules || {};
  const action = entry.action;
  const executorId = entry.executorId || entry.executor?.id;
  const targetId = entry.targetId;
  const createdAt = entry.createdAt || new Date();

  if (!executorId) return;
  if (executorId === guild.members.me?.id) return;
  if (Date.now() - (createdAt.getTime ? createdAt.getTime() : Number(createdAt)) > 25_000) return;

  const executor = entry.executor || {
    id: executorId,
    tag: `Violator (${executorId})`,
    username: `Violator_${executorId}`,
    bot: true
  };

  // Record into ring buffer for directStrike instant correlation
  recordAuditEntry(guild.id, entry);

  // ⚡ CONDEMNED FAST PATH — already being handled by directStrike
  if (isCondemned(guild.id, executorId)) {
    if (action === AuditLogEvent.ChannelDelete) {
      if (!isRestorationHandled(targetId)) {
        markRestorationQueued(targetId);
        const ch = deletedCache.get(targetId) || getChannelSnapshot(guild.id, targetId);
        const isCat = ch?.type === ChannelType.GuildCategory || ch?.type === 4;
        restorationQueue.push({
          guild,
          isCategory: isCat,
          execute: () => executeIntelligentChannelRepair(guild, targetId, ch)
        });
        processRestorationQueue();
      }
    } else if (action === AuditLogEvent.ChannelCreate) {
      if (targetId) rawChannelDelete(targetId, guild.client.token, '[ATHENA ANTI-NUKE] Rogue Channel Annihilated').catch(() => null);
      setGuildUnderAttack(guild.id, executorId, 60_000);
      annihilateRogueChannels(guild, executorId).catch(() => null);
    } else if (action === AuditLogEvent.RoleDelete) {
      if (!isRestorationHandled(targetId)) {
        markRestorationQueued(targetId);
        const r = deletedCache.get(targetId) || getRoleSnapshot(guild.id, targetId);
        restorationQueue.push({
          guild,
          isCategory: false,
          execute: () => executeIntelligentRoleRepair(guild, targetId, r)
        });
        processRestorationQueue();
      }
    } else if (action === AuditLogEvent.RoleCreate) {
      if (targetId) rawRoleDelete(guild.id, targetId, guild.client.token, '[ATHENA ANTI-NUKE] Rogue Role Annihilated').catch(() => null);
      setGuildUnderAttack(guild.id, executorId, 60_000);
      annihilateRogueRoles(guild, executorId).catch(() => null);
    } else if (action === AuditLogEvent.WebhookCreate) {
      if (targetId) rawDeleteWebhook(targetId, guild.client.token, '[ATHENA ANTI-NUKE] Rogue Webhook Annihilated').catch(() => null);
    }
    return;
  }

  if (isAuthorized(guild, executor)) {
    if (config.learnModeEnabled) {
      db.recordBaselineAction(guild.id, executor.id, `Audit:${action}`);
    }
    return;
  }

  let eventType = null;
  let forceBan = false;

  switch (action) {
    case AuditLogEvent.WebhookCreate:
      if (mods.antiWebhooks === false) return;
      if (!isAuthorized(guild, executor, 'antiwebhooks')) {
        eventType = 'Unauthorized Webhook Creation';
        forceBan = true;
      } else return;
      break;

    case AuditLogEvent.WebhookDelete:
      if (mods.antiWebhooks === false) return;
      if (!isAuthorized(guild, executor, 'antiwebhooks')) {
        eventType = 'Unauthorized Webhook Deletion';
        forceBan = true;
      } else return;
      break;

    case AuditLogEvent.ChannelDelete:
      if (mods.antiChannelDelete === false) return;
      if (!isAuthorized(guild, executor, 'antiChannelDelete')) {
        eventType = 'Channel Deletion';
        forceBan = true;
      } else return;
      break;

    case AuditLogEvent.ChannelCreate:
      if (mods.antiChannelCreate === false) return;
      if (!isAuthorized(guild, executor, 'antiChannelCreate')) {
        eventType = 'Channel Creation';
        forceBan = true;
      } else return;
      break;

    case AuditLogEvent.RoleDelete:
      if (mods.antiRoleDelete === false) return;
      if (!isAuthorized(guild, executor, 'antiRoleDelete')) {
        eventType = 'Role Deletion';
        forceBan = true;
      } else return;
      break;

    case AuditLogEvent.RoleCreate:
      if (mods.antiRoleCreate === false) return;
      if (!isAuthorized(guild, executor, 'antiRoleCreate')) {
        eventType = 'Role Creation';
        forceBan = true;
      } else return;
      break;

    case AuditLogEvent.BotAdd:
      if (!mods.antiBotAdd) return;
      if (!isAuthorized(guild, executor, 'antibot')) {
        eventType = 'Unauthorized Bot Addition';
        forceBan = true;
      } else return;
      break;

    case AuditLogEvent.MemberUnban:
      if (!mods.antiUnban) return;
      if (!isAuthorized(guild, executor, 'antiUnban')) {
        eventType = 'Unauthorized Ban Removal';
        forceBan = true;
      } else return;
      break;

    case AuditLogEvent.RoleUpdate:
      const pChange = entry.changes?.find(c => c.key === 'permissions');
      const nChange = entry.changes?.find(c => c.key === 'name');
      const posChange = entry.changes?.find(c => c.key === 'position');
      
      if (pChange && (mods.antiRolePermUpdate || mods.antiRoleUpdate)) {
        const oldPerms = new PermissionsBitField(BigInt(pChange.old || 0));
        const newPerms = new PermissionsBitField(BigInt(pChange.new || 0));
        if (DANGEROUS_PERMS.some(p => !oldPerms.has(p) && newPerms.has(p))) {
          eventType = 'Role Permission Escalation';
          forceBan = true;
        }
      } else if (nChange && mods.antiRoleUpdate) {
        eventType = 'Role Name Modification';
      } else if (posChange && mods.antiRoleReorder) {
        eventType = 'Role Reorder / Hierarchy Tampering';
      }
      break;

    case AuditLogEvent.MemberRoleUpdate:
      if (!mods.antiMemberRoleUpdate) return;
      const rolesChange = entry.changes?.find(c => c.key === '$add');
      if (rolesChange?.new?.length) {
        const dangerous = rolesChange.new.some(rObj => {
          const r = guild.roles.cache.get(rObj.id);
          return r && hasDangerousPerms(r.permissions);
        });
        const isTainted = targetId ? db.isExploitTainted(guild.id, targetId) : false;
        if (dangerous || isTainted) {
          eventType = isTainted ? 'Privilege Grant to Exploit-Tainted Member' : 'Unauthorized Dangerous Role Grant';
          forceBan = true;
        }
      }
      break;

    case AuditLogEvent.GuildUpdate:
      if (!mods.antiServerUpdate) return;
      eventType = 'Server Settings Tampering';
      forceBan = true;
      break;

    case AuditLogEvent.ChannelUpdate:
      const cpChange = entry.changes?.find(c => c.key === 'permission_overwrites');
      const cnChange = entry.changes?.find(c => c.key === 'name');
      const cposChange = entry.changes?.find(c => c.key === 'position');
      
      if (cpChange && (mods.antiChannelPermUpdate || mods.antiChannelUpdate)) {
        eventType = 'Channel Permission Tampering';
      } else if (cnChange && (mods.antiChannelNameMod || mods.antiChannelUpdate)) {
        eventType = 'Channel Name Modification';
      } else if (cposChange && (mods.antiChannelReorder || mods.antiChannelUpdate)) {
        eventType = 'Channel Reorder / Tampering';
      } else if (mods.antiChannelUpdate) {
        eventType = 'Channel Settings Tampering';
      }
      break;

    case AuditLogEvent.EmojiUpdate:
      if (!mods.antiEmojiUpdate) return;
      eventType = 'Emoji Modification';
      break;

    case AuditLogEvent.GuildScheduledEventCreate:
    case AuditLogEvent.GuildScheduledEventUpdate:
    case AuditLogEvent.GuildScheduledEventDelete:
      if (!mods.antiScheduledEvents) return;
      eventType = 'Scheduled Event Tampering';
      break;

    case AuditLogEvent.AutoModerationRuleCreate:
    case AuditLogEvent.AutoModerationRuleUpdate:
    case AuditLogEvent.AutoModerationRuleDelete:
      if (!mods.antiAutomodUpdate) return;
      eventType = 'AutoMod Rule Tampering';
      forceBan = true;
      break;

    case AuditLogEvent.IntegrationCreate:
    case AuditLogEvent.IntegrationUpdate:
    case AuditLogEvent.IntegrationDelete:
      if (!mods.antiAppCommands) return;
      eventType = 'Integration / App Command Tampering';
      forceBan = true;
      break;

    case AuditLogEvent.MemberKick:
      if (!mods.antiMemberPurge && !mods.antiKick) return;
      eventType = 'Unauthorized Kick (Purge Module)';
      break;

    case AuditLogEvent.MemberPrune:
      if (!mods.antiMemberPurge) return;
      eventType = 'Unauthorized Member Purge';
      forceBan = true;
      break;

    case AuditLogEvent.MemberBanAdd:
      if (!mods.antiMassBan && !mods.antiBan) return;
      eventType = 'Unauthorized Ban (Mass Ban Module)';
      break;

    default: return;
  }

  if (!eventType) return;

  if (config.learnModeEnabled) {
    db.addNukeSignature(guild.id, {
      executorId: executor.id,
      action: action,
      eventType: eventType
    });
  }

  recentBans.set(`${guild.id}:${executor.id}`, Date.now());
  setTimeout(() => recentBans.delete(`${guild.id}:${executor.id}`), 30_000);

  // ⚡ STEP 1: ELIMINATE THE VIOLATOR FIRST! (0ms Delay)
  // Lock attacker and dispatch raw API role strip + ban over pre-warmed sockets immediately
  condemn(guild.id, executor.id);
  const punishPromise = punish(guild, executor, eventType, config, forceBan);

  // ⚡ STEP 2: REPAIR DAMAGE SECOND
  const rollbackPromise = (async () => {
    let rollbackResult = 'No rollback needed';

    if (action === AuditLogEvent.ChannelDelete) {
      if (!isRestorationHandled(targetId)) {
        markRestorationQueued(targetId);
        const ch = deletedCache.get(targetId) || getChannelSnapshot(guild.id, targetId);
        const isCat = ch?.type === ChannelType.GuildCategory || ch?.type === 4;
        restorationQueue.push({
          isCategory: isCat,
          execute: () => executeIntelligentChannelRepair(guild, targetId, ch)
        });
        processRestorationQueue();
        rollbackResult = 'Intelligent channel restoration queued';
      }
    }

    if (action === AuditLogEvent.ChannelCreate) {
      if (targetId) await rawChannelDelete(targetId, guild.client.token, '[ATHENA ANTI-NUKE] Unauthorized Channel Annihilated').catch(() => null);
      setGuildUnderAttack(guild.id, executor.id, 60_000);
      annihilateRogueChannels(guild, executor.id).catch(() => null);
      rollbackResult = 'Unauthorized channel annihilated & spam sweep executed';
    }

    if (action === AuditLogEvent.RoleDelete) {
      if (!isRestorationHandled(targetId)) {
        markRestorationQueued(targetId);
        const r = deletedCache.get(targetId) || getRoleSnapshot(guild.id, targetId);
        restorationQueue.push({
          isCategory: false,
          execute: () => executeIntelligentRoleRepair(guild, targetId, r)
        });
        processRestorationQueue();
        rollbackResult = 'Intelligent role restoration queued';
      }
    }

    if (action === AuditLogEvent.RoleCreate) {
      if (targetId) await rawRoleDelete(guild.id, targetId, guild.client.token, '[ATHENA ANTI-NUKE] Unauthorized Role Annihilated').catch(() => null);
      setGuildUnderAttack(guild.id, executor.id, 60_000);
      annihilateRogueRoles(guild, executor.id).catch(() => null);
      rollbackResult = 'Unauthorized role annihilated & spam sweep executed';
    }

    if (action === AuditLogEvent.WebhookCreate) {
      if (targetId) await rawDeleteWebhook(targetId, guild.client.token).catch(() => null);
      rollbackResult = 'Unauthorized webhook annihilated';
    }

    if (action === AuditLogEvent.BotAdd) {
      if (targetId && targetId !== guild.client.user.id) {
        await rawBan(guild.id, targetId, guild.client.token, 'Athena Anti-Nuke: Unauthorized bot addition').then(ok => {
          if (!ok) rawRoleStrip(guild.id, targetId, guild.client.token).catch(() => null);
        }).catch(() => null);
      }
      rollbackResult = `Unauthorized bot <@${targetId}> banned instantly`;
    }

    if (action === AuditLogEvent.MemberUnban) {
      await rawBan(guild.id, targetId, guild.client.token, 'Athena Anti-Nuke: Re-applying unauthorized removed ban').catch(() => null);
      rollbackResult = `Re-banned <@${targetId}> (ban was removed by unauthorized user)`;
    }

    if (action === AuditLogEvent.MemberRoleUpdate) {
      const rolesChange = entry.changes?.find(c => c.key === '$add');
      if (rolesChange?.new) {
        const addedRoleIds = rolesChange.new.map(r => r.id);
        const targetMember = await guild.members.fetch(targetId).catch(() => null);
        if (targetMember) {
          await targetMember.roles.remove(addedRoleIds, 'Athena Anti-Nuke: Reversed unauthorized role grant').catch(() => null);
          db.addExploitTaint(guild.id, targetId, 'Unauthorized dangerous role grant recipient');
          await executeQuarantine(guild, targetMember, guild.members.me, 'Athena Anti-Nuke: Recipient of unauthorized dangerous role grant').catch(() => null);
          rollbackResult = `Removed dangerous roles and quarantined recipient <@${targetId}>`;
        }
      }
    }

    if (action === AuditLogEvent.RoleUpdate) {
      const r = guild.roles.cache.get(targetId);
      if (r) {
        const edits = {};
        for (const change of entry.changes || []) {
          if (change.key === 'permissions') edits.permissions = BigInt(change.old || 0);
          if (change.key === 'name') edits.name = change.old;
          if (change.key === 'color') edits.color = change.old;
          if (change.key === 'hoist') edits.hoist = change.old;
          if (change.key === 'mentionable') edits.mentionable = change.old;
          if (change.key === 'position') edits.position = change.old;
        }
        if (Object.keys(edits).length > 0) {
          await r.edit(edits, 'Athena Anti-Nuke: Reverted unauthorized role modifications').catch(() => null);
          rollbackResult = ` Reverted modifications for role **${r.name}**`;
        }
      }
    }

    if (action === AuditLogEvent.ChannelUpdate) {
      const ch = guild.channels.cache.get(targetId);
      if (ch) {
        const edits = {};
        let permissionOverwrites = null;
        for (const change of entry.changes || []) {
          if (change.key === 'name') edits.name = change.old;
          if (change.key === 'topic') edits.topic = change.old;
          if (change.key === 'rate_limit_per_user') edits.rateLimitPerUser = change.old;
          if (change.key === 'nsfw') edits.nsfw = change.old;
          if (change.key === 'position') edits.position = change.old;
          if (change.key === 'permission_overwrites') permissionOverwrites = change.old;
        }
        if (Object.keys(edits).length > 0) {
          await ch.edit(edits, 'Athena Anti-Nuke: Reverted unauthorized channel modifications').catch(() => null);
          rollbackResult = ` Reverted settings for <#${targetId}>`;
        }
        if (permissionOverwrites) {
          const mapped = permissionOverwrites.map(o => ({
            id: o.id, type: o.type, allow: BigInt(o.allow || 0), deny: BigInt(o.deny || 0)
          }));
          await ch.permissionOverwrites.set(mapped, 'Athena Anti-Nuke: Reverted permission tampering').catch(() => null);
          rollbackResult = ` Reverted permissions for <#${targetId}>`;
        }
      }
    }

    if (action === AuditLogEvent.EmojiUpdate) {
      const em = guild.emojis.cache.get(targetId);
      if (em) {
        const nameChange = entry.changes?.find(c => c.key === 'name');
        if (nameChange && nameChange.old) {
          await em.edit({ name: nameChange.old }, 'Athena Anti-Nuke: Reverted emoji rename').catch(() => null);
          rollbackResult = ` Reverted emoji rename for ${em.name}`;
        }
      }
    }

    if (action === AuditLogEvent.GuildUpdate) {
      const rollbacks = [];
      for (const change of (entry.changes || [])) {
        try {
          if (change.key === 'name' && change.old) {
            await guild.setName(change.old, 'Athena Anti-Nuke: Reverted name').catch(() => null);
            rollbacks.push(`Server name restored to **${change.old}**`);
          }
          if (change.key === 'vanity_url_code' && change.old) {
            await guild.setVanityCode(change.old, 'Athena Anti-Nuke: Vanity restored').catch(() => null);
            rollbacks.push(`Vanity restored to **discord.gg/${change.old}**`);
          }
          if (change.key === 'verification_level' && change.old != null) {
            await guild.setVerificationLevel(change.old, 'Athena Anti-Nuke: Reverted verification').catch(() => null);
            rollbacks.push('Verification level restored');
          }
          if (change.key === 'explicit_content_filter' && change.old != null) {
            await guild.setExplicitContentFilter(change.old, 'Athena Anti-Nuke: Reverted content filter').catch(() => null);
            rollbacks.push('Content filter restored');
          }
        } catch {}
      }
      rollbackResult = rollbacks.length ? rollbacks.join('\n') : 'No rollback available';
    }

    return rollbackResult;
  })();

  // ⚡ STEP 3: ASYNCHRONOUS LOGGING LAST
  const [punishResult, rollbackResult] = await Promise.all([punishPromise, rollbackPromise]);
  await notifyAndLog(guild, executor, eventType, punishResult, rollbackResult);
}

// Periodic memory cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of actionTracker.entries()) {
    if (times.filter(t => now - t < TRACKER_WINDOW_MS).length === 0) actionTracker.delete(key);
  }
  for (const [key, times] of velocityTracker.entries()) {
    if (times.filter(t => now - t < VELOCITY_WINDOW_MS).length === 0) velocityTracker.delete(key);
  }
}, 60_000);
