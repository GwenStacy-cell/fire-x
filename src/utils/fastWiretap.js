import { AuditLogEvent, ChannelType, PermissionsBitField } from 'discord.js';
import { isBotOwnerSync } from './helpers.js';
import { 
  hasDangerousPerms,
  DANGEROUS_PERMS,
  rawBan, 
  rawChannelDelete, 
  rawRoleDelete,
  rawDeleteWebhook,
  rawUnban,
  rawVanityReclaim,
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
  isChannelRestoring,
  isRestorationHandled,
  markRestorationQueued,
  restorationQueue,
  processRestorationQueue,
  executeIntelligentChannelRepair,
  executeIntelligentRoleRepair,
  trackInFlightPunishment,
  waitForInFlightPunishments,
  getRecentAuditEntry,
  waitForRingMatch,
  sharedFetchAuditLogs,
  handleAuditLogEntry,
  markAuditEntryHandled,
  botInviterMap,
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
  'GUILD_UPDATE',
  'WEBHOOKS_UPDATE'
]);

// Action types covering ALL 32 Anti-Nuke security modules
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
  AuditLogEvent.InviteDelete,                       // 42
  AuditLogEvent.WebhookCreate,                      // 50
  AuditLogEvent.WebhookUpdate,                      // 51
  AuditLogEvent.WebhookDelete,                      // 52
  AuditLogEvent.EmojiCreate,                        // 60
  AuditLogEvent.EmojiUpdate,                        // 61
  AuditLogEvent.EmojiDelete,                        // 62
  AuditLogEvent.IntegrationCreate,                  // 80
  AuditLogEvent.IntegrationUpdate,                  // 81
  AuditLogEvent.IntegrationDelete,                  // 82
  AuditLogEvent.GuildScheduledEventCreate,          // 100
  AuditLogEvent.GuildScheduledEventUpdate,          // 101
  AuditLogEvent.GuildScheduledEventDelete,          // 102
  AuditLogEvent.ApplicationCommandPermissionUpdate, // 121
  AuditLogEvent.SoundboardSoundCreate,              // 130
  AuditLogEvent.SoundboardSoundDelete,              // 132
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
  [AuditLogEvent.InviteDelete]:                     'antiInviteDelete',
  [AuditLogEvent.WebhookCreate]:                    'antiWebhooks',
  [AuditLogEvent.WebhookUpdate]:                    'antiWebhooks',
  [AuditLogEvent.WebhookDelete]:                    'antiWebhooks',
  [AuditLogEvent.EmojiCreate]:                      'antiEmojiCreate',
  [AuditLogEvent.EmojiUpdate]:                      'antiEmojiUpdate',
  [AuditLogEvent.EmojiDelete]:                      'antiEmojiDelete',
  [AuditLogEvent.IntegrationCreate]:                'antiAppCommands',
  [AuditLogEvent.IntegrationUpdate]:                'antiAppCommands',
  [AuditLogEvent.IntegrationDelete]:                'antiAppCommands',
  [AuditLogEvent.GuildScheduledEventCreate]:        'antiScheduledEvents',
  [AuditLogEvent.GuildScheduledEventUpdate]:        'antiScheduledEvents',
  [AuditLogEvent.GuildScheduledEventDelete]:        'antiScheduledEvents',
  [AuditLogEvent.ApplicationCommandPermissionUpdate]: 'antiAppCommands',
  [AuditLogEvent.SoundboardSoundCreate]:            'antiSoundboardCreate',
  [AuditLogEvent.SoundboardSoundDelete]:            'antiSoundboardDelete',
  [AuditLogEvent.AutoModerationRuleCreate]:         'antiAutomodUpdate',
  [AuditLogEvent.AutoModerationRuleUpdate]:         'antiAutomodUpdate',
  [AuditLogEvent.AutoModerationRuleDelete]:         'antiAutomodUpdate'
};

// Actions whose fast rollback is handled directly by wiretap post-ban barrier
const WIRETAP_ROLLBACK_ACTIONS = new Set([
  AuditLogEvent.WebhookCreate,
  AuditLogEvent.ChannelCreate,
  AuditLogEvent.RoleCreate,
  AuditLogEvent.SoundboardSoundCreate,
  AuditLogEvent.MemberBanRemove,
  AuditLogEvent.MemberBanAdd,
  AuditLogEvent.BotAdd,
  AuditLogEvent.MemberRoleUpdate,
  AuditLogEvent.ChannelDelete,
  AuditLogEvent.RoleDelete
]);

const processedAuditIds = new Set();
const processedPacketKeys = new Map(); // pKey -> expiryTimestamp
const PACKET_DEDUPE_EVENTS = new Set([
  'CHANNEL_DELETE',
  'CHANNEL_CREATE',
  'GUILD_ROLE_DELETE',
  'GUILD_ROLE_CREATE',
  'INVITE_CREATE'
]);

export function attachWiretap(client) {
  const handleRawPacket = async (packet) => {
    if (!packet || !packet.t || !DESTRUCTIVE_EVENTS.has(packet.t)) return;

    const guildId = packet.d?.guild_id || packet.d?.id;
    if (!guildId) return;

    // Normalize & record audit log entries into 0ms ring FIRST (even before active-security early exit, for ServerLogs zero-REST lookup)
    if (packet.t === 'GUILD_AUDIT_LOG_ENTRY_CREATE') {
      const d = packet.d;
      if (d?.id) {
        if (processedAuditIds.has(d.id)) return;
        processedAuditIds.add(d.id);
        if (processedAuditIds.size > 3000) {
          const oldest = processedAuditIds.values().next().value;
          processedAuditIds.delete(oldest);
        }
      }

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const executorId = d.user_id;
      const actionType = d.action_type;
      const targetId = d.target_id;
      const cachedMember = executorId ? guild.members.cache.get(executorId) : null;
      const cachedUser = executorId ? client.users.cache.get(executorId) : null;
      const isBotUser = Boolean(cachedUser?.bot ?? cachedMember?.user?.bot);

      const mappedChanges = (d.changes || []).map(c => ({
        key: c.key,
        old: c.old_value ?? c.old,
        new: c.new_value ?? c.new
      }));

      const executorObj = {
        id: executorId,
        tag: cachedUser?.tag || cachedMember?.user?.tag || `User (${executorId})`,
        username: cachedUser?.username || cachedMember?.user?.username || `User_${executorId}`,
        bot: isBotUser
      };

      const rawEntry = {
        id: d.id,
        action: actionType,
        executorId,
        targetId,
        executor: executorObj,
        changes: mappedChanges,
        createdAt: new Date(),
        reason: d.reason
      };

      recordAuditEntry(guildId, rawEntry);

      const config = db.getGuildConfig(guildId);
      if (!config || !config.securityEnabled || !config.antiNukeEnabled) return;
      if (!executorId || executorId === client.user.id) return;

      const mods = config.antinukeModules || {};

      // Respect ModMode, JTC/burn rooms, and Athena's own in-flight self-restorations
      // Note: Do NOT block ChannelDelete/RoleDelete on isRestorationHandled here — channelDelete/roleDelete mark queued
      // synchronously and might fire 1ms BEFORE GUILD_AUDIT_LOG_ENTRY_CREATE arrives!
      if (db.isModModeActive(guildId) && (actionType === AuditLogEvent.ChannelDelete || actionType === AuditLogEvent.RoleDelete || actionType === AuditLogEvent.ChannelUpdate)) {
        return;
      }
      if ((actionType === AuditLogEvent.ChannelDelete || actionType === AuditLogEvent.ChannelCreate || actionType === AuditLogEvent.ChannelUpdate) &&
          (db.isJtcChannel(targetId) || db.isJtcInfrastructure(guildId, targetId) || db.cache.burnRooms?.[targetId])) {
        return;
      }
      if ((actionType === AuditLogEvent.ChannelCreate || actionType === AuditLogEvent.RoleCreate) && isRestorationHandled(targetId)) {
        return;
      }
      if (actionType === AuditLogEvent.ChannelUpdate && isChannelRestoring(targetId)) {
        return;
      }

      // Synchronous 0ms Root-Authority Check BEFORE any async role fetches or precision loops
      const isServerOwner = guild.ownerId === executorId;
      const isExtraOwner = db.isExtraOwner(guildId, executorId);
      const isBotOwner = isBotOwnerSync(executorId);
      if (isServerOwner || isExtraOwner || isBotOwner) {
        if (actionType === AuditLogEvent.MemberRoleUpdate && targetId) {
          db.removeExploitTaint(guildId, targetId);
        }
        return;
      }

      // Module gate & precision change filtering BEFORE banning
      let modKey = ACTION_TO_MODULE[actionType];
      if (actionType === AuditLogEvent.GuildUpdate) {
        const isVanity = mappedChanges.some(c => c.key === 'vanity_url_code');
        if (isVanity) modKey = 'antiVanitySteal';
      }

      if (actionType === AuditLogEvent.RoleUpdate) {
        const pChange = mappedChanges.find(c => c.key === 'permissions');
        const nChange = mappedChanges.find(c => c.key === 'name');
        const posChange = mappedChanges.find(c => c.key === 'position');
        let matched = false;
        if (pChange && (mods.antiRolePermUpdate !== false || mods.antiRoleUpdate !== false)) {
          const oldPerms = new PermissionsBitField(BigInt(pChange.old || 0));
          const newPerms = new PermissionsBitField(BigInt(pChange.new || 0));
          if (DANGEROUS_PERMS.some(p => !oldPerms.has(p) && newPerms.has(p))) {
            modKey = 'antiRolePermUpdate';
            matched = true;
          }
        }
        if (!matched && posChange && mods.antiRoleReorder !== false) {
          modKey = 'antiRoleReorder';
          matched = true;
        }
        if (!matched && nChange && mods.antiRoleUpdate !== false) {
          modKey = 'antiRoleUpdate';
          matched = true;
        }
        if (!matched) return;
      } else if (actionType === AuditLogEvent.ChannelUpdate) {
        const cpChange = mappedChanges.find(c => c.key === 'permission_overwrites');
        const cnChange = mappedChanges.find(c => c.key === 'name');
        const cposChange = mappedChanges.find(c => c.key === 'position');
        if (cpChange && (mods.antiChannelPermUpdate !== false || mods.antiChannelUpdate !== false)) {
          modKey = 'antiChannelPermUpdate';
        } else if (cnChange && (mods.antiChannelNameMod !== false || mods.antiChannelUpdate !== false)) {
          modKey = 'antiChannelNameMod';
        } else if (cposChange && (mods.antiChannelReorder !== false || mods.antiChannelUpdate !== false)) {
          modKey = 'antiChannelReorder';
        } else if (mods.antiChannelUpdate === false) {
          return;
        }
      } else if (actionType === AuditLogEvent.MemberRoleUpdate) {
        if (mods.antiMemberRoleUpdate === false) return;
        const roleAdds = mappedChanges.find(c => c.key === '$add')?.new || [];
        if (!Array.isArray(roleAdds) || !roleAdds.length) return;

        const authRoles = db.getAuthRoles(guildId);
        let hasDangerousRoleAdded = false;
        let hasLinkedRoleAdded = false;

        for (const rObj of roleAdds) {
          const role = guild.roles.cache.get(rObj.id) || await guild.roles.fetch(rObj.id).catch(() => null);
          if (role) {
            if (hasDangerousPerms(role.permissions) || (authRoles?.admin && authRoles.admin.includes(role.id))) {
              hasDangerousRoleAdded = true;
              break;
            }
            if (mods.antiLinkedRole !== false && role.tags?.guildConnections) {
              hasLinkedRoleAdded = true;
            }
          }
        }

        const isTainted = targetId ? db.isExploitTainted(guildId, targetId) : false;
        if (!hasDangerousRoleAdded && !hasLinkedRoleAdded && !isTainted) return;
      } else if (modKey && mods[modKey] === false) {
        return;
      }

      // Synchronous 0ms Whitelist Check (native Administrator does NOT exempt here!)
      const isAuthorizedUser = isAuthorized(guild, cachedMember || executorObj, modKey || 'antinuke');

      if (isAuthorizedUser) {
        if (actionType === AuditLogEvent.MemberRoleUpdate && targetId) {
          db.removeExploitTaint(guildId, targetId);
        }
        return;
      }

      if (DESTRUCTIVE_AUDIT_ACTIONS.has(actionType)) {
        if (rawEntry.id) markAuditEntryHandled(rawEntry.id);

        // ⚡ PHASE 1: HOSTILE ELIMINATION FIRST (0ms, zero parallel repair/log calls)
        let banStrikePromise = null;
        if (!isCondemned(guildId, executorId)) {
          condemn(guildId, executorId);
          setGuildUnderAttack(guildId, executorId, 60_000);

          const reason = `[ATHENA WIRETAP] ⚡ RAW WebSocket Ban Strike: Neutralized Action ${actionType}`;
          banStrikePromise = rawBan(guildId, executorId, client.token, reason, { actionType: `GUILD_AUDIT_LOG (${actionType})` });
          trackInFlightPunishment(guildId, banStrikePromise);

          queueMicrotask(() => console.log(`[ATHENA WIRETAP] ⚡ Zero-Day Intercepted GUILD_AUDIT_LOG_ENTRY_CREATE (${actionType})! Neutralized ${executorId} in 0ms!`));
        }

        // Always ban newly introduced rogue bots / privilege-escalation recipients in Phase 1 (even on condemned packets 2..N)
        if (actionType === AuditLogEvent.BotAdd && targetId && targetId !== client.user.id && !isCondemned(guildId, targetId)) {
          condemn(guildId, targetId);
          const botStrike = rawBan(guildId, targetId, client.token, '[ATHENA WIRETAP] ⚡ Rogue Bot Banned', { actionType: 'BOT_ADD_REVERSAL' });
          trackInFlightPunishment(guildId, botStrike);
        } else if (actionType === AuditLogEvent.MemberRoleUpdate && targetId && targetId !== client.user.id && !isCondemned(guildId, targetId)) {
          const targetMem = guild.members.cache.get(targetId) || { id: targetId };
          if (!isAuthorized(guild, targetMem, 'antiMemberRoleUpdate')) {
            condemn(guildId, targetId);
            const privStrike = rawBan(guildId, targetId, client.token, '[ATHENA WIRETAP] ⚡ Privilege Escalation Recipient Banned', { actionType: 'PRIVILEGE_ESCALATION' });
            trackInFlightPunishment(guildId, privStrike);
          }
        }

        checkGlobalBurst(guild, actionType, executorId);

        // ⚡ PHASE 2 & 3: STRICT BAN-FIRST BARRIER
        // Wait for ALL in-flight bans for this guild to settle over the wire before ANY repair/rollback/log leaves!
        const hasWiretapRollback = WIRETAP_ROLLBACK_ACTIONS.has(actionType);
        waitForInFlightPunishments(guildId).then(async () => {
          let wiretapReclaimedVanity = false;
          if (banStrikePromise && executorObj.bot) {
            cascadeToInviter(guild, executorId).catch(() => null);
          }
          if (actionType === AuditLogEvent.WebhookCreate && targetId) {
            rawDeleteWebhook(targetId, client.token).catch(() => null);
          } else if (actionType === AuditLogEvent.ChannelCreate && targetId) {
            rawChannelDelete(targetId, client.token, '[ATHENA WIRETAP] Rogue Spam Channel Vaporized').catch(() => null);
          } else if (actionType === AuditLogEvent.RoleCreate && targetId) {
            rawRoleDelete(guildId, targetId, client.token, '[ATHENA WIRETAP] Rogue Spam Role Vaporized').catch(() => null);
          } else if (actionType === AuditLogEvent.SoundboardSoundCreate && targetId) {
            dispatcher.request({
              origin: 'https://discord.com',
              path: `/api/v10/guilds/${guildId}/soundboard-sounds/${targetId}`,
              method: 'DELETE',
              headers: { 'authorization': `Bot ${client.token}`, 'user-agent': 'DiscordBot (Athena, 4.0.0)' }
            }).then(r => r.body.dump()).catch(() => null);
          } else if (actionType === AuditLogEvent.GuildUpdate) {
            const vanityChange = mappedChanges.find(c => c.key === 'vanity_url_code');
            if (vanityChange?.old) {
              wiretapReclaimedVanity = true;
              rawVanityReclaim(guildId, vanityChange.old, client.token, '[ATHENA WIRETAP] Vanity URL Reclaimed').catch(() => null);
            }
          } else if (actionType === AuditLogEvent.MemberBanRemove && targetId) {
            rawBan(guildId, targetId, client.token, '[ATHENA WIRETAP] ⚡ Re-banning victim of unauthorized unban', { actionType: 'UNBAN_REVERSAL' }).catch(() => null);
          } else if (actionType === AuditLogEvent.MemberBanAdd && targetId) {
            rawUnban(guildId, targetId, client.token, '[ATHENA WIRETAP] ⚡ Restoring innocent member banned by nuke bot').catch(() => null);
          } else if (actionType === AuditLogEvent.ChannelDelete && targetId) {
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
              processRestorationQueue(guildId);
            }
          } else if (actionType === AuditLogEvent.RoleDelete && targetId) {
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
              processRestorationQueue(guildId);
            }
          }

          // Run remaining non-wiretap smart rollbacks (role hierarchy, channel perms, guild settings) + logging strictly AFTER ban settles
          if (banStrikePromise || !hasWiretapRollback) {
            await handleAuditLogEntry(guild, rawEntry, {
              skipStrike: true,
              fromWiretap: true,
              suppressLogs: !banStrikePromise,
              preExecutedPunishResult: 'Eliminated (Direct Raw WebSocket Ban — Instant)',
              wiretapHandledRollback: hasWiretapRollback,
              wiretapHandledVanity: wiretapReclaimedVanity
            }).catch(() => null);
          }
        }).catch(() => null);
      }
      return;
    }

    // ⚡ Bounded TTL Deduplication ONLY for immutable single-event object packets (NEVER GUILD_UPDATE / WEBHOOKS_UPDATE!)
    if (PACKET_DEDUPE_EVENTS.has(packet.t)) {
      const rawUniqueId = packet.d?.id || packet.d?.role_id || packet.d?.role?.id || packet.d?.code;
      if (rawUniqueId) {
        const pKey = `${packet.t}:${rawUniqueId}`;
        const now = Date.now();
        const expiry = processedPacketKeys.get(pKey);
        if (expiry && now < expiry) return;
        processedPacketKeys.set(pKey, now + 3000);
        if (processedPacketKeys.size > 2000) {
          const oldest = processedPacketKeys.keys().next().value;
          if (oldest) processedPacketKeys.delete(oldest);
        }
      }
    }

    // Sync cache check (0ms latency)
    const config = db.getGuildConfig(guildId);
    if (!config || !config.securityEnabled || !config.antiNukeEnabled) return;

    // ⚡ ZERO-DAY FAST-PATH 2: Unauthorized Bot Elimination On Join (<1ms)
    if (packet.t === 'GUILD_MEMBER_ADD' && packet.d?.user?.bot) {
      const botId = packet.d.user.id;
      if (botId !== client.user.id && config.antinukeModules?.antiBotAdd !== false) {
        const guild = client.guilds.cache.get(guildId);
        if (guild && !isBotAuthorized(guild, botId)) {
          const cachedInviter = botInviterMap.get(`${guildId}:${botId}`) || getRecentAuditEntry(guildId, AuditLogEvent.BotAdd, botId)?.executorId;
          if (cachedInviter && (cachedInviter === guild.ownerId || isBotOwnerSync(cachedInviter))) {
            return;
          }
          if (cachedInviter && cachedInviter !== guild.ownerId && !isBotOwnerSync(cachedInviter)) {
            condemn(guildId, botId);
            setGuildUnderAttack(guildId, botId, 60_000);
            const botStrike = rawBan(guildId, botId, client.token, '[ATHENA WIRETAP] ⚡ Rogue Bot Banned On Join (0ms Pre-Emption)', { actionType: 'GUILD_MEMBER_ADD (0ms Join)' });
            trackInFlightPunishment(guildId, botStrike);
            waitForInFlightPunishments(guildId).then(() => cascadeToInviter(guild, botId).catch(() => null));
            console.log(`[ATHENA WIRETAP] ⚡ Zero-Day Pre-Emption: Neutralized unauthorized bot ${botId} on join!`);
            return;
          }
        }
      }
      return;
    }

    // ⚡ ZERO-DAY FAST-PATH 3: Instant Vanity URL Sniping Protection (PATCH /vanity-url uses { code })
    if (packet.t === 'GUILD_UPDATE') {
      const guild = client.guilds.cache.get(guildId);
      const oldVanity = guild?.vanityURLCode;
      const newVanity = packet.d?.vanity_url_code;
      if (oldVanity && newVanity !== oldVanity && config.antinukeModules?.antiVanitySteal !== false) {
        const ringMatch = getRecentAuditEntry(guildId, AuditLogEvent.GuildUpdate, guildId);
        if (ringMatch?.executorId && ringMatch.executorId !== client.user.id && !isAuthorized(guild, ringMatch.executor || { id: ringMatch.executorId }, 'antiVanitySteal')) {
          if (!isCondemned(guildId, ringMatch.executorId)) {
            condemn(guildId, ringMatch.executorId);
            setGuildUnderAttack(guildId, ringMatch.executorId, 60_000);
            const banStrike = rawBan(guildId, ringMatch.executorId, client.token, '[ATHENA WIRETAP] ⚡ Vanity URL Attacker Banned', { actionType: 'GUILD_UPDATE_VANITY' });
            trackInFlightPunishment(guildId, banStrike);
          }
        }
        await waitForInFlightPunishments(guildId);
        await rawVanityReclaim(guildId, oldVanity, client.token, 'Athena Wiretap: Instant Vanity URL Sniping Protection');
        console.log(`[ATHENA WIRETAP] ⚡ Reclaimed Vanity URL discord.gg/${oldVanity}!`);
      }
      return;
    }

    // ⚡ Raw WebSocket pre-caching & coalesced audit strike on CHANNEL_DELETE
    if (packet.t === 'CHANNEL_DELETE' && packet.d?.id) {
      const channelId = packet.d.id;
      if (config.antinukeModules?.antiChannelDelete === false) return;
      if (db.isModModeActive(guildId) || db.isJtcChannel(channelId) || db.isJtcInfrastructure(guildId, channelId) || db.cache.burnRooms?.[channelId]) return;
      if (!deletedCache.has(channelId)) cacheDeletedItem(channelId, packet.d);

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const strikeExecutor = (execObj) => {
        if (!execObj?.id || execObj.id === client.user.id) return;
        const memberObj = guild.members.cache.get(execObj.id) || execObj;
        if (isAuthorized(guild, memberObj, 'antiChannelDelete')) return;
        if (!isCondemned(guildId, execObj.id)) {
          condemn(guildId, execObj.id);
          setGuildUnderAttack(guildId, execObj.id, 60_000);
          const strikePromise = rawBan(guildId, execObj.id, client.token, '[ATHENA WIRETAP] ⚡ Direct ChannelDelete Ban Strike', { actionType: 'CHANNEL_DELETE (Wiretap)' });
          trackInFlightPunishment(guildId, strikePromise);
          queueMicrotask(() => console.log(`[ATHENA WIRETAP] ⚡ Instant ChannelDelete Ban neutralized ${execObj.id}!`));
        }
      };

      const ringMatch = getRecentAuditEntry(guildId, AuditLogEvent.ChannelDelete, channelId);
      if (ringMatch?.executorId) {
        strikeExecutor(ringMatch.executor || { id: ringMatch.executorId });
        return;
      }

      // Race WS ring push vs single-flight coalesced audit fetch (skip REST audit fetch if already under active attack)
      const chAuditors = [
        waitForRingMatch(guild, AuditLogEvent.ChannelDelete, channelId, 'antiChannelDelete', 20)
      ];
      if (!isGuildUnderAttack(guildId)) {
        chAuditors.push(
          sharedFetchAuditLogs(guildId, client.token, AuditLogEvent.ChannelDelete).then(data => {
            const entry = data?.audit_log_entries?.find(e => e.target_id === channelId);
            if (!entry?.user_id) return null;
            const u = data?.users?.find(usr => usr.id === entry.user_id);
            return u ? { id: u.id, bot: Boolean(u.bot) } : { id: entry.user_id, bot: Boolean(guild.members.cache.get(entry.user_id)?.user?.bot) };
          })
        );
      }
      Promise.race(chAuditors).then(execObj => {
        if (execObj) strikeExecutor(execObj);
      }).catch(() => null);
      return;
    }

    // ⚡ Raw WebSocket pre-caching & coalesced audit strike on GUILD_ROLE_DELETE
    if (packet.t === 'GUILD_ROLE_DELETE' && packet.d?.role_id) {
      const roleId = packet.d.role_id;
      if (config.antinukeModules?.antiRoleDelete === false) return;
      if (db.isModModeActive(guildId)) return;
      const cachedRole = client.guilds.cache.get(guildId)?.roles?.cache?.get(roleId);
      if (cachedRole?.managed) return;
      if (!deletedCache.has(roleId)) cacheDeletedItem(roleId, cachedRole || packet.d);

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const strikeExecutor = (execObj) => {
        if (!execObj?.id || execObj.id === client.user.id) return;
        const memberObj = guild.members.cache.get(execObj.id) || execObj;
        if (isAuthorized(guild, memberObj, 'antiRoleDelete')) return;
        if (!isCondemned(guildId, execObj.id)) {
          condemn(guildId, execObj.id);
          setGuildUnderAttack(guildId, execObj.id, 60_000);
          const strikePromise = rawBan(guildId, execObj.id, client.token, '[ATHENA WIRETAP] ⚡ Direct RoleDelete Ban Strike', { actionType: 'GUILD_ROLE_DELETE (Wiretap)' });
          trackInFlightPunishment(guildId, strikePromise);
          queueMicrotask(() => console.log(`[ATHENA WIRETAP] ⚡ Instant RoleDelete Ban neutralized ${execObj.id}!`));
        }
      };

      const ringMatch = getRecentAuditEntry(guildId, AuditLogEvent.RoleDelete, roleId);
      if (ringMatch?.executorId) {
        strikeExecutor(ringMatch.executor || { id: ringMatch.executorId });
        return;
      }

      const roleAuditors = [
        waitForRingMatch(guild, AuditLogEvent.RoleDelete, roleId, 'antiRoleDelete', 20)
      ];
      if (!isGuildUnderAttack(guildId)) {
        roleAuditors.push(
          sharedFetchAuditLogs(guildId, client.token, AuditLogEvent.RoleDelete).then(data => {
            const entry = data?.audit_log_entries?.find(e => e.target_id === roleId);
            if (!entry?.user_id) return null;
            const u = data?.users?.find(usr => usr.id === entry.user_id);
            return u ? { id: u.id, bot: Boolean(u.bot) } : { id: entry.user_id, bot: Boolean(guild.members.cache.get(entry.user_id)?.user?.bot) };
          })
        );
      }
      Promise.race(roleAuditors).then(execObj => {
        if (execObj) strikeExecutor(execObj);
      }).catch(() => null);
      return;
    }

    // ⚡ ZERO-DAY FAST-PATH 4: Rogue Invite Destruction (<1ms) + Active Attack Invite Guard
    if (packet.t === 'INVITE_CREATE') {
      const code = packet.d?.code;
      const inviterId = packet.d?.inviter?.id;
      const roleIds = packet.d?.role_ids || (Array.isArray(packet.d?.roles) ? packet.d.roles.map(r => r.id || r) : []);
      const guild = client.guilds.cache.get(guildId);
      if (!code || !guild) return;

      let hasDangerousRole = false;
      if (Array.isArray(roleIds) && roleIds.length > 0) {
        const authRoles = db.getAuthRoles(guildId);
        hasDangerousRole = roleIds.some(rid => {
          const r = guild.roles.cache.get(rid);
          return r && (hasDangerousPerms(r.permissions) || (authRoles?.admin && authRoles.admin.includes(rid)));
        });
      }

      const inviterMember = inviterId ? (guild.members.cache.get(inviterId) || { id: inviterId, bot: Boolean(packet.d?.inviter?.bot) }) : null;
      const underAttackUnauthorized = isGuildUnderAttack(guildId) && (!inviterId || !isAuthorized(guild, inviterMember, 'antiInvite'));

      if (hasDangerousRole || underAttackUnauthorized) {
        if (inviterId && inviterId !== client.user.id && !isAuthorized(guild, inviterMember, 'antiInvite')) {
          condemn(guildId, inviterId);
          setGuildUnderAttack(guildId, inviterId, 60_000);
          const strike = rawBan(
            guildId,
            inviterId,
            client.token,
            hasDangerousRole ? '[ATHENA WIRETAP] ⚡ Rogue Administrative Invite Creator Banned' : '[ATHENA WIRETAP] ⚡ Rogue Invite Creator Banned During Active Attack',
            { actionType: hasDangerousRole ? 'ROGUE_INVITE_CREATOR' : 'ACTIVE_ATTACK_INVITE' }
          );
          trackInFlightPunishment(guildId, strike);
        }

        await waitForInFlightPunishments(guildId);
        dispatcher.request({
          origin: 'https://discord.com',
          path: `/api/v10/invites/${code}`,
          method: 'DELETE',
          headers: {
            'authorization': `Bot ${client.token}`,
            'x-audit-log-reason': encodeURIComponent(hasDangerousRole ? 'Athena Wiretap: Rogue Administrative Invite Destroyed' : 'Athena Wiretap: Active Attack Invite Vaporized')
          }
        }).then(r => r.body.dump()).catch(() => null);
      }
      return;
    }

    // ⚡ ZERO-DAY FAST-PATH 5: In-Flight Cleanup During Active Attack (Strictly AFTER active bans settle!)
    if (isGuildUnderAttack(guildId)) {
      if (packet.t === 'CHANNEL_CREATE') {
        const channelId = packet.d?.id;
        const guild = client.guilds.cache.get(guildId);
        if (guild && channelId && !isProtectedSystemChannel(guild, channelId) && !isRestorationHandled(channelId)) {
          const ring = getRecentAuditEntry(guildId, AuditLogEvent.ChannelCreate, channelId);
          if (ring?.executor && !isAuthorized(guild, ring.executor, 'antiChannelCreate')) {
            await waitForInFlightPunishments(guildId);
            rawChannelDelete(channelId, client.token, '[ATHENA WIRETAP] In-Flight Spam Channel Annihilated').catch(() => null);
          }
        }
      } else if (packet.t === 'GUILD_ROLE_CREATE') {
        const roleId = packet.d?.role?.id;
        const guild = client.guilds.cache.get(guildId);
        if (guild && roleId && !isRestorationHandled(roleId)) {
          const ring = getRecentAuditEntry(guildId, AuditLogEvent.RoleCreate, roleId);
          if (ring?.executor && !isAuthorized(guild, ring.executor, 'antiRoleCreate')) {
            await waitForInFlightPunishments(guildId);
            rawRoleDelete(guildId, roleId, client.token, '[ATHENA WIRETAP] In-Flight Spam Role Annihilated').catch(() => null);
          }
        }
      } else if (packet.t === 'WEBHOOKS_UPDATE' && config.antinukeModules?.antiWebhooks !== false) {
        const channelId = packet.d?.channel_id;
        if (channelId) {
          dispatcher.request({
            origin: 'https://discord.com',
            path: `/api/v10/channels/${channelId}/webhooks`,
            method: 'GET',
            headers: {
              'authorization': `Bot ${client.token}`,
              'user-agent': 'DiscordBot (Athena, 4.0.0)'
            }
          }).then(async res => {
            if (res.statusCode !== 200) {
              await res.body?.dump?.().catch(() => null);
              return null;
            }
            return res.body.json();
          }).then(async hooks => {
            if (!Array.isArray(hooks)) return;
            const guild = client.guilds.cache.get(guildId);
            const maliciousWebhookIds = [];
            for (const h of hooks) {
              if (h.user?.id && h.user.id !== client.user.id) {
                const mem = guild ? (guild.members.cache.get(h.user.id) || { id: h.user.id, bot: Boolean(h.user.bot) }) : { id: h.user.id };
                if (guild && !isAuthorized(guild, mem, 'antiwebhooks')) {
                  maliciousWebhookIds.push(h.id);
                  if (!isCondemned(guildId, h.user.id)) {
                    condemn(guildId, h.user.id);
                    const strike = rawBan(guildId, h.user.id, client.token, '[ATHENA WIRETAP] ⚡ Rogue Webhook Creator Banned During Active Attack', { actionType: 'ACTIVE_ATTACK_WEBHOOK' });
                    trackInFlightPunishment(guildId, strike);
                  }
                }
              }
            }
            if (maliciousWebhookIds.length > 0) {
              await waitForInFlightPunishments(guildId);
              for (const whId of maliciousWebhookIds) {
                rawDeleteWebhook(whId, client.token, '[ATHENA WIRETAP] In-Flight Rogue Webhook Vaporized During Active Attack').catch(() => null);
              }
            }
          }).catch(() => null);
        }
      }
    }
  };

  // ⚡ DEDICATED SINGLE-PIPELINE GATEWAY HOOK
  client.on('raw', handleRawPacket);
}
