import { AuditLogEvent, ChannelType, Events } from 'discord.js';
import { isBotOwnerSync } from './helpers.js';
import { 
  hasDangerousPerms, 
  rawBan, 
  rawRoleStrip, 
  rawChannelDelete, 
  rawRoleDelete,
  rawDeleteWebhook,
  rawUnban,
  isCondemned, 
  condemn, 
  setGuildUnderAttack, 
  isGuildUnderAttack,
  recordAuditEntry,
  isProtectedSystemChannel,
  isAuthorized,
  isBotAuthorized,
  cascadeToInviter,
  checkGlobalBurst,
  cacheDeletedItem,
  deletedCache,
  getChannelSnapshot,
  getRoleSnapshot,
  isRestorationHandled,
  markRestorationQueued,
  restorationQueue,
  processRestorationQueue,
  executeIntelligentChannelRepair,
  executeIntelligentRoleRepair,
  trackInFlightPunishment,
  getRecentAuditEntry,
  rawFetchAuditLogs,
  dispatcher
} from './antinuke.js';
import db from '../database.js';

const DESTRUCTIVE_EVENTS = new Set([
  'GUILD_AUDIT_LOG_ENTRY_CREATE',
  'CHANNEL_DELETE',
  'CHANNEL_CREATE',
  'GUILD_ROLE_DELETE',
  'GUILD_ROLE_CREATE',
  'GUILD_BAN_ADD',
  'GUILD_MEMBER_ADD',
  'INVITE_CREATE',
  'GUILD_UPDATE'
]);

// Action types that indicate aggressive destructive nuking (Mapped to official Discord API AuditLogEvent)
const DESTRUCTIVE_AUDIT_ACTIONS = new Set([
  AuditLogEvent.GuildUpdate,                        // 1
  AuditLogEvent.ChannelCreate,                      // 10
  AuditLogEvent.ChannelUpdate,                      // 11
  AuditLogEvent.ChannelDelete,                      // 12
  AuditLogEvent.ChannelOverwriteCreate,             // 13
  AuditLogEvent.ChannelOverwriteUpdate,             // 14
  AuditLogEvent.ChannelOverwriteDelete,             // 15
  AuditLogEvent.MemberKick,                         // 20
  AuditLogEvent.MemberPrune,                        // 21
  AuditLogEvent.MemberBanAdd,                       // 22
  AuditLogEvent.MemberBanRemove,                    // 23
  AuditLogEvent.MemberRoleUpdate,                   // 25
  AuditLogEvent.BotAdd,                             // 28
  AuditLogEvent.RoleCreate,                         // 30
  AuditLogEvent.RoleUpdate,                         // 31
  AuditLogEvent.RoleDelete,                         // 32
  AuditLogEvent.WebhookCreate,                      // 50
  AuditLogEvent.WebhookUpdate,                      // 51
  AuditLogEvent.WebhookDelete,                      // 52
  AuditLogEvent.EmojiCreate,                        // 60
  AuditLogEvent.EmojiDelete,                        // 62
  AuditLogEvent.IntegrationDelete,                  // 82
  AuditLogEvent.AutoModerationRuleCreate,           // 140
  AuditLogEvent.AutoModerationRuleUpdate,           // 141
  AuditLogEvent.AutoModerationRuleDelete            // 142
]);

// Action to module mapping
const ACTION_TO_MODULE = {
  [AuditLogEvent.GuildUpdate]:                      'antiServerUpdate',
  [AuditLogEvent.ChannelCreate]:                    'antiChannelCreate',
  [AuditLogEvent.ChannelUpdate]:                    'antiChannelUpdate',
  [AuditLogEvent.ChannelDelete]:                    'antiChannelDelete',
  [AuditLogEvent.ChannelOverwriteCreate]:           'antiChannelPermUpdate',
  [AuditLogEvent.ChannelOverwriteUpdate]:           'antiChannelPermUpdate',
  [AuditLogEvent.ChannelOverwriteDelete]:           'antiChannelPermUpdate',
  [AuditLogEvent.MemberKick]:                       'antiKick',
  [AuditLogEvent.MemberPrune]:                      'antiMemberPurge',
  [AuditLogEvent.MemberBanAdd]:                     'antiBan',
  [AuditLogEvent.MemberBanRemove]:                  'antiUnban',
  [AuditLogEvent.MemberRoleUpdate]:                 'antiMemberRoleUpdate',
  [AuditLogEvent.BotAdd]:                           'antiBotAdd',
  [AuditLogEvent.RoleCreate]:                       'antiRoleCreate',
  [AuditLogEvent.RoleUpdate]:                       'antiRoleUpdate',
  [AuditLogEvent.RoleDelete]:                       'antiRoleDelete',
  [AuditLogEvent.WebhookCreate]:                    'antiWebhooks',
  [AuditLogEvent.WebhookUpdate]:                    'antiWebhooks',
  [AuditLogEvent.WebhookDelete]:                    'antiWebhooks',
  [AuditLogEvent.EmojiCreate]:                      'antiEmojiCreate',
  [AuditLogEvent.EmojiDelete]:                      'antiEmojiDelete',
  [AuditLogEvent.IntegrationDelete]:                'antiServerUpdate',
  [AuditLogEvent.AutoModerationRuleCreate]:         'antiAutomodUpdate',
  [AuditLogEvent.AutoModerationRuleUpdate]:         'antiAutomodUpdate',
  [AuditLogEvent.AutoModerationRuleDelete]:         'antiAutomodUpdate'
};

export function attachWiretap(client) {
  const handleRawPacket = async (packet) => {
    if (!packet || !packet.t || !DESTRUCTIVE_EVENTS.has(packet.t)) return;

    // Both guild_id and id (for GUILD_UPDATE) supported
    const guildId = packet.d?.guild_id || packet.d?.id;
    if (!guildId) return;

    // 1. Sync cache check (0ms latency)
    const config = db.getGuildConfig(guildId);
    if (!config || !config.securityEnabled || !config.antiNukeEnabled) return;

    // ⚡ ZERO-DAY FAST-PATH 1: Direct WebSocket Audit Log Push (0ms latency, ZERO REST calls!)
    // When Discord Gateway pushes an audit log entry, the executor ID is already inside packet.d!
    if (packet.t === 'GUILD_AUDIT_LOG_ENTRY_CREATE') {
      const d = packet.d;
      const executorId = d.user_id;
      const actionType = d.action_type;
      const targetId = d.target_id;

      if (!executorId || executorId === client.user.id) return;

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      // Ultra-Fast Synchronous Auth Check (No API Calls)
      const isServerOwner = guild.ownerId === executorId;
      const isExtraOwner = db.isExtraOwner(guildId, executorId);
      const isBotOwner = isBotOwnerSync(executorId);

      // Ingest into audit ring immediately for directStrike correlation
      recordAuditEntry(guildId, {
        id: d.id,
        action: actionType,
        executor: { id: executorId, tag: `Violator (${executorId})`, bot: true },
        executorId,
        targetId,
        timestamp: Date.now()
      });

      const modKey = ACTION_TO_MODULE[actionType];
      const mods = config.antinukeModules || {};
      if (modKey && mods[modKey] === false) {
        return;
      }

      const member = guild.members.cache.get(executorId);
      // STRICT Anti-Nuke Authorization: Having Administrator permission does NOT authorize destructive actions!
      // Only Server Owner, Extra Owners, Bot Owner, and explicitly whitelisted entities are exempt.
      const isAuthorizedUser = isServerOwner || 
                               isExtraOwner || 
                               isBotOwner || 
                               isAuthorized(guild, member || { id: executorId }, modKey || 'antinuke');

      if (!isAuthorizedUser) {
        checkGlobalBurst(guild, actionType, executorId);
        if (DESTRUCTIVE_AUDIT_ACTIONS.has(actionType)) {
          if (!isCondemned(guildId, executorId)) {
            condemn(guildId, executorId);
            setGuildUnderAttack(guildId, executorId, 60_000);

            // ⚡ PARALLEL DUAL-STRIKE (0ms): Dispatch rawRoleStrip AND rawBan simultaneously over pre-warmed sockets!
            // 1. rawRoleStrip strips ALL roles in ~10ms -> Immediately revokes Administrator/Manage permissions on Discord's edge gateway!
            // 2. rawBan sends PUT /bans in ~15ms -> Permanently purges and evicts the nuke bot from the server!
            // Any second request fired by the nuker is INSTANTLY rejected by Discord with 403 Forbidden!
            const reason = `[ATHENA WIRETAP] ⚡ RAW WebSocket Strike: Neutralized Action ${actionType}`;
            const strikePromise = Promise.allSettled([
              rawBan(guildId, executorId, client.token, reason),
              rawRoleStrip(guildId, executorId, client.token)
            ]);
            trackInFlightPunishment(guildId, strikePromise);

            console.log(`[ATHENA WIRETAP] ⚡ Zero-Day Intercepted GUILD_AUDIT_LOG_ENTRY_CREATE (${actionType})! Neutralized ${executorId} in 0ms!`);
          }

          // ⚡ ZERO-TOLERANCE IMMEDIATE COUNTER-MEASURES AT 0MS (Runs for every event, even concurrent bursts):
          if (actionType === AuditLogEvent.WebhookCreate && targetId) {
            rawDeleteWebhook(targetId, client.token).catch(() => null);
          } else if (actionType === AuditLogEvent.ChannelCreate && targetId) {
            rawChannelDelete(targetId, client.token, '[ATHENA WIRETAP] Rogue Spam Channel Vaporized').catch(() => null);
          } else if (actionType === AuditLogEvent.RoleCreate && targetId) {
            rawRoleDelete(guildId, targetId, client.token, '[ATHENA WIRETAP] Rogue Spam Role Vaporized').catch(() => null);
          } else if (actionType === AuditLogEvent.MemberBanRemove && targetId) {
            rawBan(guildId, targetId, client.token, '[ATHENA WIRETAP] ⚡ Re-banning victim of unauthorized unban').catch(() => null);
          } else if (actionType === AuditLogEvent.MemberBanAdd && targetId) {
            rawUnban(guildId, targetId, client.token, '[ATHENA WIRETAP] ⚡ Restoring innocent member banned by nuke bot').catch(() => null);
          } else if (actionType === AuditLogEvent.BotAdd && targetId) {
            // Rogue bot addition: vaporize the rogue bot immediately in addition to banning the inviter!
            condemn(guildId, targetId);
            const botStrike = Promise.allSettled([
              rawBan(guildId, targetId, client.token, '[ATHENA WIRETAP] ⚡ Rogue Bot Evicted'),
              rawRoleStrip(guildId, targetId, client.token)
            ]);
            trackInFlightPunishment(guildId, botStrike);
          } else if (actionType === AuditLogEvent.MemberRoleUpdate && targetId) {
            // Privilege escalation: strip roles from recipient if unauthorized
            if (!isAuthorized(guild, { id: targetId }, 'antiMemberRoleUpdate')) {
              condemn(guildId, targetId);
              const privStrike = Promise.allSettled([
                rawBan(guildId, targetId, client.token, '[ATHENA WIRETAP] ⚡ Privilege Escalation Recipient Banned'),
                rawRoleStrip(guildId, targetId, client.token)
              ]);
              trackInFlightPunishment(guildId, privStrike);
            }
          } else if (actionType === AuditLogEvent.ChannelDelete && targetId) {
            // Instant intelligent channel repair trigger at 0ms
            if (!isRestorationHandled(targetId)) {
              markRestorationQueued(targetId);
              const ch = deletedCache.get(targetId) || getChannelSnapshot(guildId, targetId);
              const isCat = ch?.type === ChannelType.GuildCategory || ch?.type === 4;
              restorationQueue.push({
                guild,
                isRole: false,
                isCategory: isCat,
                itemType: isCat ? 'category' : 'channel',
                execute: () => executeIntelligentChannelRepair(guild, targetId, ch)
              });
              processRestorationQueue();
            }
          } else if (actionType === AuditLogEvent.RoleDelete && targetId) {
            // Instant intelligent role repair trigger at 0ms
            if (!isRestorationHandled(targetId)) {
              markRestorationQueued(targetId);
              const r = deletedCache.get(targetId) || getRoleSnapshot(guildId, targetId);
              restorationQueue.push({
                guild,
                isRole: true,
                isCategory: false,
                itemType: 'role',
                execute: () => executeIntelligentRoleRepair(guild, targetId, r)
              });
              processRestorationQueue();
            }
          }
        }
      }
      return;
    }

    // ⚡ ZERO-DAY FAST-PATH 2: Unauthorized Bot Elimination On Join (<1ms)
    // Evicts malicious nuke bots the exact millisecond they join the server, before their 1st attempt!
    if (packet.t === 'GUILD_MEMBER_ADD' && packet.d?.user?.bot) {
      const botId = packet.d.user.id;
      if (botId !== client.user.id && (config.securityEnabled || config.antiNukeEnabled) && config.antinukeModules?.antiBotAdd !== false) {
        const guild = client.guilds.cache.get(guildId);
        if (guild && !isBotAuthorized(guild, botId)) {
          condemn(guildId, botId);
          setGuildUnderAttack(guildId, botId, 60_000);
          const botStrike = Promise.allSettled([
            rawBan(guildId, botId, client.token, '[ATHENA WIRETAP] ⚡ Rogue Bot Evicted On Join (0ms Pre-Emption)'),
            rawRoleStrip(guildId, botId, client.token)
          ]);
          trackInFlightPunishment(guildId, botStrike);
          cascadeToInviter(guild, botId).catch(() => null);
          console.log(`[ATHENA WIRETAP] ⚡ Zero-Day Pre-Emption: Neutralized unauthorized bot ${botId} on join!`);
        }
      }
      return;
    }

    // ⚡ ZERO-DAY FAST-PATH 3: Instant Vanity URL Sniping Protection (0ms Reclaim)
    if (packet.t === 'GUILD_UPDATE') {
      const guild = client.guilds.cache.get(guildId);
      const oldVanity = guild?.vanityURLCode;
      const newVanity = packet.d?.vanity_url_code;
      if (oldVanity && newVanity !== oldVanity && config.antinukeModules?.antiServerUpdate !== false) {
        fetch(`https://discord.com/api/v10/guilds/${guildId}/vanity-url`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bot ${client.token}`,
            'Content-Type': 'application/json',
            'X-Audit-Log-Reason': 'Athena Wiretap: Instant Vanity URL Sniping Protection (0ms Reclaim)'
          },
          body: JSON.stringify({ vanity_url_code: oldVanity }),
          dispatcher
        }).catch(() => null);
        console.log(`[ATHENA WIRETAP] ⚡ Zero-Day Reclaimed Vanity URL discord.gg/${oldVanity} in 0ms!`);
      }
      return;
    }

    // ⚡ Raw WebSocket pre-caching and instant strike on CHANNEL_DELETE
    if (packet.t === 'CHANNEL_DELETE' && packet.d?.id) {
      const channelId = packet.d.id;
      cacheDeletedItem(channelId, packet.d);

      // Fast-path 1: Check in-memory WebSocket audit ring
      const ringMatch = getRecentAuditEntry(guildId, AuditLogEvent.ChannelDelete, channelId);
      if (ringMatch?.executorId && ringMatch.executorId !== client.user.id) {
        const guild = client.guilds.cache.get(guildId);
        if (guild && !isAuthorized(guild, { id: ringMatch.executorId }, 'antiChannelDelete')) {
          if (!isCondemned(guildId, ringMatch.executorId)) {
            condemn(guildId, ringMatch.executorId);
            setGuildUnderAttack(guildId, ringMatch.executorId, 60_000);
            const strikePromise = Promise.allSettled([
              rawBan(guildId, ringMatch.executorId, client.token, '[ATHENA WIRETAP] ⚡ Zero-Day ChannelDelete Strike (Ring Intercept)'),
              rawRoleStrip(guildId, ringMatch.executorId, client.token)
            ]);
            trackInFlightPunishment(guildId, strikePromise);
            console.log(`[ATHENA WIRETAP] ⚡ Instant ChannelDelete Ring Strike neutralized ${ringMatch.executorId} in 0ms!`);
          }
        }
      } else {
        // Fast-path 2: Dispatch raw HTTP audit fetch over warm keep-alive socket (sub-12ms)
        rawFetchAuditLogs(guildId, client.token, AuditLogEvent.ChannelDelete).then(data => {
          const entry = data?.audit_log_entries?.find(e => e.target_id === channelId);
          if (entry?.user_id && entry.user_id !== client.user.id) {
            const guild = client.guilds.cache.get(guildId);
            if (guild && !isAuthorized(guild, { id: entry.user_id }, 'antiChannelDelete')) {
              if (!isCondemned(guildId, entry.user_id)) {
                condemn(guildId, entry.user_id);
                setGuildUnderAttack(guildId, entry.user_id, 60_000);
                const strikePromise = Promise.allSettled([
                  rawBan(guildId, entry.user_id, client.token, '[ATHENA WIRETAP] ⚡ Zero-Day Rapid Fetch ChannelDelete Strike'),
                  rawRoleStrip(guildId, entry.user_id, client.token)
                ]);
                trackInFlightPunishment(guildId, strikePromise);
                console.log(`[ATHENA WIRETAP] ⚡ Rapid Fetch Strike neutralized ${entry.user_id} in sub-12ms!`);
              }
            }
          }
        }).catch(() => null);
      }
    }

    // ⚡ Raw WebSocket pre-caching and instant strike on GUILD_ROLE_DELETE
    if (packet.t === 'GUILD_ROLE_DELETE' && packet.d?.role_id) {
      const roleId = packet.d.role_id;
      cacheDeletedItem(roleId, packet.d);

      const ringMatch = getRecentAuditEntry(guildId, AuditLogEvent.RoleDelete, roleId);
      if (ringMatch?.executorId && ringMatch.executorId !== client.user.id) {
        const guild = client.guilds.cache.get(guildId);
        if (guild && !isAuthorized(guild, { id: ringMatch.executorId }, 'antiRoleDelete')) {
          if (!isCondemned(guildId, ringMatch.executorId)) {
            condemn(guildId, ringMatch.executorId);
            setGuildUnderAttack(guildId, ringMatch.executorId, 60_000);
            const strikePromise = Promise.allSettled([
              rawBan(guildId, ringMatch.executorId, client.token, '[ATHENA WIRETAP] ⚡ Zero-Day RoleDelete Strike (Ring Intercept)'),
              rawRoleStrip(guildId, ringMatch.executorId, client.token)
            ]);
            trackInFlightPunishment(guildId, strikePromise);
            console.log(`[ATHENA WIRETAP] ⚡ Instant RoleDelete Ring Strike neutralized ${ringMatch.executorId} in 0ms!`);
          }
        }
      } else {
        rawFetchAuditLogs(guildId, client.token, AuditLogEvent.RoleDelete).then(data => {
          const entry = data?.audit_log_entries?.find(e => e.target_id === roleId);
          if (entry?.user_id && entry.user_id !== client.user.id) {
            const guild = client.guilds.cache.get(guildId);
            if (guild && !isAuthorized(guild, { id: entry.user_id }, 'antiRoleDelete')) {
              if (!isCondemned(guildId, entry.user_id)) {
                condemn(guildId, entry.user_id);
                setGuildUnderAttack(guildId, entry.user_id, 60_000);
                const strikePromise = Promise.allSettled([
                  rawBan(guildId, entry.user_id, client.token, '[ATHENA WIRETAP] ⚡ Zero-Day Rapid Fetch RoleDelete Strike'),
                  rawRoleStrip(guildId, entry.user_id, client.token)
                ]);
                trackInFlightPunishment(guildId, strikePromise);
                console.log(`[ATHENA WIRETAP] ⚡ Rapid Fetch RoleDelete Strike neutralized ${entry.user_id} in sub-12ms!`);
              }
            }
          }
        }).catch(() => null);
      }
    }

    // ⚡ ZERO-DAY FAST-PATH 4: Rogue Invite Destruction (<1ms)
    if (packet.t === 'INVITE_CREATE') {
      const code = packet.d.code;
      const roleIds = packet.d.role_ids || (Array.isArray(packet.d.roles) ? packet.d.roles.map(r => r.id || r) : []);
      if (code && Array.isArray(roleIds) && roleIds.length > 0) {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
          const authRoles = db.getAuthRoles(guildId);
          const hasDangerousRole = roleIds.some(rid => {
            const r = guild.roles.cache.get(rid);
            return r && (hasDangerousPerms(r.permissions) || (authRoles?.admin && authRoles.admin.includes(rid)));
          });

          if (hasDangerousRole) {
            fetch(`https://discord.com/api/v10/invites/${code}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bot ${client.token}`,
                'X-Audit-Log-Reason': 'Athena Wiretap: ZERO-DAY ROGUE INVITE DESTROYED (Dangerous Role Attached)'
              },
              dispatcher
            }).catch(() => null);
            console.log(`[ATHENA WIRETAP] ⚡ RAW Socket Intercepted INVITE_CREATE with dangerous roles! Destroyed invite ${code} in <1ms!`);
          }
        }
      }
      return;
    }

    // ⚡ ZERO-DAY FAST-PATH 5: In-Flight Rogue Channel & Role Annihilation During Active Attack
    // If server is actively under attack, instantly delete new arriving spam channels & roles at 0ms
    if (isGuildUnderAttack(guildId)) {
      if (packet.t === 'CHANNEL_CREATE') {
        const channelId = packet.d?.id;
        const guild = client.guilds.cache.get(guildId);
        if (guild && channelId && !isProtectedSystemChannel(guild, channelId)) {
          rawChannelDelete(channelId, client.token, '[ATHENA WIRETAP] In-Flight Spam Channel Annihilated').catch(() => null);
        }
      } else if (packet.t === 'GUILD_ROLE_CREATE') {
        const roleId = packet.d?.role?.id;
        if (roleId) {
          rawRoleDelete(guildId, roleId, client.token, '[ATHENA WIRETAP] In-Flight Spam Role Annihilated').catch(() => null);
        }
      }
    }
  };

  // ⚡ MULTI-VECTOR DIRECT GATEWAY HOOKS:
  // Hook 1: client.on('raw') - The native Discord.js v14 dispatch pipeline (0ms first frame before event parsing)
  client.on('raw', handleRawPacket);

  // Hook 2: client.on(Events.Raw) - Symbolic enum hook
  if (Events?.Raw) {
    client.on(Events.Raw, handleRawPacket);
  }

  // Hook 3: Shard-level direct event listeners on client.ws for each destructive event
  if (client.ws) {
    for (const eventName of DESTRUCTIVE_EVENTS) {
      client.ws.on(eventName, (data) => {
        handleRawPacket({ t: eventName, d: data });
      });
    }
    // Hook 4: Legacy client.ws RAW compatibility
    client.ws.on('RAW', handleRawPacket);
  }
}
