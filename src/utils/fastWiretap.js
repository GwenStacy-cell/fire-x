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
  rawDeleteInvite,
  rawDeleteSoundboardSound,
  rawDeleteSticker,
  rawClearTimeout,
  isCondemned, 
  condemn, 
  setGuildUnderAttack, 
  isGuildUnderAttack,
  canFetchRestAudit,
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
  isPendingSelfCreate,
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
  dispatcher,
  resolveBanFailureFallback,
  combatTelemetry
} from './antinuke.js';
import { initRawTlsLane } from './rawTlsBanLane.js';
import db from '../database.js';

const DESTRUCTIVE_EVENTS = new Set([
  'GUILD_AUDIT_LOG_ENTRY_CREATE',
  'CHANNEL_DELETE',
  'CHANNEL_CREATE',
  'THREAD_CREATE',
  'THREAD_DELETE',
  'GUILD_ROLE_DELETE',
  'GUILD_ROLE_CREATE',
  'GUILD_BAN_ADD',
  'GUILD_BAN_REMOVE',
  'GUILD_MEMBER_ADD',
  'INVITE_CREATE',
  'GUILD_UPDATE',
  'WEBHOOKS_UPDATE'
]);

// Helper: Resolves with the FIRST truthy non-null value (unlike Promise.race which aborts on early null timeout)
function raceFirstTruthy(promises) {
  return new Promise((resolve) => {
    if (!Array.isArray(promises) || promises.length === 0) return resolve(null);
    let settled = false;
    let remaining = promises.length;
    for (const p of promises) {
      Promise.resolve(p)
        .then((val) => {
          if (!settled && val) {
            settled = true;
            resolve(val);
          }
        })
        .catch(() => null)
        .finally(() => {
          remaining--;
          if (!settled && remaining <= 0) {
            settled = true;
            resolve(null);
          }
        });
    }
  });
}

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
  AuditLogEvent.MemberUpdate,                       // 24 (timeouts filtered dynamically)
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
  AuditLogEvent.StageInstanceCreate,                // 83
  AuditLogEvent.StageInstanceUpdate,                // 84
  AuditLogEvent.StageInstanceDelete,                // 85
  AuditLogEvent.GuildScheduledEventCreate,          // 100
  AuditLogEvent.GuildScheduledEventUpdate,          // 101
  AuditLogEvent.GuildScheduledEventDelete,          // 102
  AuditLogEvent.ThreadCreate,                       // 110
  AuditLogEvent.ThreadUpdate,                       // 111
  AuditLogEvent.ThreadDelete,                       // 112
  AuditLogEvent.ApplicationCommandPermissionUpdate, // 121
  AuditLogEvent.SoundboardSoundCreate,              // 130
  AuditLogEvent.SoundboardSoundUpdate,              // 131
  AuditLogEvent.SoundboardSoundDelete,              // 132
  AuditLogEvent.AutoModerationRuleCreate,           // 140
  AuditLogEvent.AutoModerationRuleUpdate,           // 141
  AuditLogEvent.AutoModerationRuleDelete,           // 142
  AuditLogEvent.StickerCreate,                      // 90
  AuditLogEvent.StickerUpdate,                      // 91
  AuditLogEvent.StickerDelete                       // 92
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
  [AuditLogEvent.ThreadCreate]:                     'antiChannelCreate',
  [AuditLogEvent.ThreadUpdate]:                     'antiChannelUpdate',
  [AuditLogEvent.ThreadDelete]:                     'antiChannelDelete',
  [AuditLogEvent.StageInstanceCreate]:              'antiServerUpdate',
  [AuditLogEvent.StageInstanceUpdate]:              'antiServerUpdate',
  [AuditLogEvent.StageInstanceDelete]:              'antiServerUpdate',
  [AuditLogEvent.MemberKick]:                       'antiKick',
  [AuditLogEvent.MemberPrune]:                      'antiMemberPurge',
  [AuditLogEvent.MemberBanAdd]:                     'antiBan',
  [AuditLogEvent.MemberBanRemove]:                  'antiUnban',
  [AuditLogEvent.MemberUpdate]:                     'antiMemberPurge',
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
  [AuditLogEvent.SoundboardSoundUpdate]:            'antiSoundboardCreate',
  [AuditLogEvent.SoundboardSoundDelete]:            'antiSoundboardDelete',
  [AuditLogEvent.AutoModerationRuleCreate]:         'antiAutomodUpdate',
  [AuditLogEvent.AutoModerationRuleUpdate]:         'antiAutomodUpdate',
  [AuditLogEvent.AutoModerationRuleDelete]:         'antiAutomodUpdate',
  [AuditLogEvent.StickerCreate]:                    'antiEmojiCreate',
  [AuditLogEvent.StickerUpdate]:                    'antiEmojiUpdate',
  [AuditLogEvent.StickerDelete]:                    'antiEmojiDelete'
};

// Actions whose fast rollback is handled directly by wiretap post-ban barrier
const WIRETAP_ROLLBACK_ACTIONS = new Set([
  AuditLogEvent.WebhookCreate,
  AuditLogEvent.ChannelCreate,
  AuditLogEvent.ThreadCreate,
  AuditLogEvent.RoleCreate,
  AuditLogEvent.SoundboardSoundCreate,
  AuditLogEvent.StickerCreate,
  AuditLogEvent.MemberBanRemove,
  AuditLogEvent.MemberBanAdd,
  AuditLogEvent.MemberUpdate,
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
  'THREAD_CREATE',
  'THREAD_DELETE',
  'GUILD_ROLE_DELETE',
  'GUILD_ROLE_CREATE',
  'GUILD_BAN_ADD',
  'GUILD_BAN_REMOVE',
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

      const executorObj = {
        id: executorId,
        tag: cachedUser?.tag || cachedMember?.user?.tag || `User (${executorId})`,
        username: cachedUser?.username || cachedMember?.user?.username || `User_${executorId}`,
        bot: isBotUser
      };

      const now = Date.now();
      const rawEntry = {
        id: d.id,
        action: actionType,
        executorId,
        targetId,
        executor: executorObj,
        createdAt: now,
        reason: d.reason
      };

      recordAuditEntry(guildId, rawEntry);

      const config = db.getGuildConfig(guildId);
      if (!config || !config.securityEnabled || !config.antiNukeEnabled) return;
      if (!executorId || executorId === client.user.id) return;

      const mods = config.antinukeModules || {};

      // Respect scoped ModMode (authorized actor only), JTC/burn rooms, and Athena's own in-flight self-restorations
      // Note: Do NOT block ChannelDelete/RoleDelete on isRestorationHandled here — channelDelete/roleDelete mark queued
      // synchronously and might fire 1ms BEFORE GUILD_AUDIT_LOG_ENTRY_CREATE arrives!
      if (
        db.isModModeBypassed?.(guild, executorId) &&
        (
          actionType === AuditLogEvent.ChannelDelete ||
          actionType === AuditLogEvent.RoleDelete ||
          actionType === AuditLogEvent.ChannelUpdate ||
          actionType === AuditLogEvent.EmojiDelete
        )
      ) {
        return;
      }
      if ((actionType === AuditLogEvent.ChannelDelete || actionType === AuditLogEvent.ChannelCreate || actionType === AuditLogEvent.ChannelUpdate) &&
          (db.isJtcChannel(targetId) || db.isJtcInfrastructure(guildId, targetId) || db.cache.burnRooms?.[targetId])) {
        return;
      }
      if ((actionType === AuditLogEvent.ChannelCreate || actionType === AuditLogEvent.RoleCreate || actionType === AuditLogEvent.ThreadCreate) && isRestorationHandled(targetId)) {
        return;
      }
      if (actionType === AuditLogEvent.ChannelUpdate && isChannelRestoring(targetId)) {
        return;
      }

      // Synchronous 0ms Root-Authority Check BEFORE any changes mapping or async role fetches
      const isServerOwner = guild.ownerId === executorId;
      const isExtraOwner = db.isExtraOwner(guildId, executorId);
      const isBotOwner = isBotOwnerSync(executorId);
      if (isServerOwner || isBotOwner || (isExtraOwner && actionType !== AuditLogEvent.BotAdd)) {
        if (actionType === AuditLogEvent.MemberRoleUpdate && targetId) {
          db.removeExploitTaint(guildId, targetId);
        }
        return;
      }
      if (actionType === AuditLogEvent.BotAdd && targetId && isBotAuthorized(guild, targetId, { consume: false })) {
        return;
      }

      const rawChanges = d.changes;
      const mappedChanges = (Array.isArray(rawChanges) && rawChanges.length > 0)
        ? rawChanges.map(c => ({
            key: c.key,
            old: c.old_value ?? c.old,
            new: c.new_value ?? c.new
          }))
        : [];
      rawEntry.changes = mappedChanges;

      // Module gate & precision change filtering BEFORE banning
      let modKey = ACTION_TO_MODULE[actionType];
      if (actionType === AuditLogEvent.GuildUpdate) {
        const isVanity = mappedChanges.some(c => c.key === 'vanity_url_code');
        if (isVanity) modKey = 'antiVanitySteal';
      }

      if (actionType === AuditLogEvent.MemberBanAdd) {
        if (mods.antiBan === false && mods.antiMassBan === false) return;
        modKey = mods.antiBan !== false ? 'antiBan' : 'antiMassBan';
      } else if (actionType === AuditLogEvent.MemberKick) {
        if (mods.antiKick === false && mods.antiMemberPurge === false) return;
        modKey = mods.antiKick !== false ? 'antiKick' : 'antiMemberPurge';
      } else if (actionType === AuditLogEvent.RoleUpdate) {
        const pChange = mappedChanges.find(c => c.key === 'permissions');
        const nChange = mappedChanges.find(c => c.key === 'name');
        const posChange = mappedChanges.find(c => c.key === 'position');
        let matched = false;
        const isSentinelOrBotRole = targetId && (
          targetId === config.firewallRoleId ||
          targetId === config.unbypassableRoleId ||
          targetId === config.athenFirewallRoleId ||
          targetId === config.athenaUnbypassableRoleId ||
          targetId === guild.members.me?.roles?.botRole?.id
        );
        if (pChange && (mods.antiRolePermUpdate !== false || mods.antiRoleUpdate !== false || isSentinelOrBotRole)) {
          const oldPerms = new PermissionsBitField(BigInt(pChange.old || 0));
          const newPerms = new PermissionsBitField(BigInt(pChange.new || 0));
          const escalated = DANGEROUS_PERMS.some(p => !oldPerms.has(p) && newPerms.has(p));
          const strippedBotAdmin = isSentinelOrBotRole && oldPerms.has(PermissionsBitField.Flags.Administrator) && !newPerms.has(PermissionsBitField.Flags.Administrator);
          if (escalated || strippedBotAdmin) {
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
        const uncachedRoleIds = [];

        // Zero-await synchronous cache scan FIRST
        for (const rObj of roleAdds) {
          const role = guild.roles.cache.get(rObj.id);
          if (!role) {
            uncachedRoleIds.push(rObj.id);
            continue;
          }
          if (hasDangerousPerms(role.permissions) || (authRoles?.admin && authRoles.admin.includes(role.id))) {
            hasDangerousRoleAdded = true;
            break;
          }
          if (mods.antiLinkedRole !== false && role.tags?.guildConnections) {
            hasLinkedRoleAdded = true;
          }
        }

        // Only fetch missing roles in parallel if cache scan didn't already trigger
        if (!hasDangerousRoleAdded && uncachedRoleIds.length > 0) {
          const fetched = await Promise.all(uncachedRoleIds.map(rid => guild.roles.fetch(rid).catch(() => null)));
          for (const role of fetched) {
            if (!role) continue;
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
      } else if (actionType === AuditLogEvent.MemberUpdate) {
        if (mods.antiMemberPurge === false && mods.antiKick === false) return;
        const timeoutChange = mappedChanges.find(c => c.key === 'communication_disabled_until');
        if (!timeoutChange || !timeoutChange.new) return;
        modKey = mods.antiMemberPurge !== false ? 'antiMemberPurge' : 'antiKick';
      } else if (actionType === AuditLogEvent.SoundboardSoundUpdate) {
        if (mods.antiSoundboardCreate === false && mods.antiSoundboardDelete === false) return;
        modKey = mods.antiSoundboardCreate !== false ? 'antiSoundboardCreate' : 'antiSoundboardDelete';
      } else if (modKey && mods[modKey] === false) {
        return;
      }

      // Synchronous 0ms Whitelist Check (native Administrator does NOT exempt here!)
      const isAuthorizedUser = isAuthorized(guild, cachedMember || executorObj, modKey || 'antinuke', {
        dedupeKey: rawEntry.id || `${actionType}:${targetId || executorId}`
      });

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
          let banResultText = 'Eliminated (Direct Raw WebSocket Ban — Instant)';
          if (banStrikePromise) {
            const rawBanSucceeded = await banStrikePromise.catch(() => false);
            if (!rawBanSucceeded) {
              banResultText = await resolveBanFailureFallback(
                guild,
                executorId,
                `[ATHENA WIRETAP] Fallback strike for action ${actionType}`
              );
            }
          }

          let wiretapReclaimedVanity = false;
          if (banStrikePromise) {
            let executorIsBot = Boolean(executorObj.bot);
            if (!executorIsBot && !cachedUser && !cachedMember && typeof client.users?.fetch === 'function') {
              const fetchedUser = await client.users.fetch(executorId).catch(() => null);
              executorIsBot = Boolean(fetchedUser?.bot);
            }
            if (executorIsBot) {
              cascadeToInviter(guild, executorId).catch(() => null);
            }
          }
          if (actionType === AuditLogEvent.WebhookCreate && targetId) {
            rawDeleteWebhook(targetId, client.token).catch(() => null);
          } else if (actionType === AuditLogEvent.ChannelCreate && targetId) {
            rawChannelDelete(targetId, client.token, '[ATHENA WIRETAP] Rogue Spam Channel Vaporized').catch(() => null);
          } else if (actionType === AuditLogEvent.ThreadCreate && targetId) {
            rawChannelDelete(targetId, client.token, '[ATHENA WIRETAP] Rogue Spam Thread Vaporized').catch(() => null);
          } else if (actionType === AuditLogEvent.RoleCreate && targetId) {
            rawRoleDelete(guildId, targetId, client.token, '[ATHENA WIRETAP] Rogue Spam Role Vaporized').catch(() => null);
          } else if (actionType === AuditLogEvent.SoundboardSoundCreate && targetId) {
            rawDeleteSoundboardSound(guildId, targetId, client.token).catch(() => null);
          } else if (actionType === AuditLogEvent.StickerCreate && targetId) {
            rawDeleteSticker(guildId, targetId, client.token).catch(() => null);
          } else if (actionType === AuditLogEvent.MemberUpdate && targetId) {
            rawClearTimeout(guildId, targetId, client.token).catch(() => null);
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
              preExecutedPunishResult: banResultText,
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

    // ⚡ ZERO-DAY FAST-PATH 2: Unauthorized Bot Elimination On Join (0ms)
    if (packet.t === 'GUILD_MEMBER_ADD' && packet.d?.user?.bot) {
      const botId = packet.d.user.id;
      if (botId !== client.user.id && config.antinukeModules?.antiBotAdd !== false) {
        const guild = client.guilds.cache.get(guildId);
        if (guild && !isBotAuthorized(guild, botId)) {
          const strikeBotAndInviter = (invId) => {
            if (invId && (invId === guild.ownerId || isBotOwnerSync(invId))) return;
            if (!isCondemned(guildId, botId)) {
              condemn(guildId, botId);
              setGuildUnderAttack(guildId, invId || botId, 60_000);
              const botStrike = rawBan(guildId, botId, client.token, '[ATHENA WIRETAP] ⚡ Rogue Bot Banned On Join (0ms Pre-Emption)', { actionType: 'GUILD_MEMBER_ADD (0ms Join)' });
              trackInFlightPunishment(guildId, botStrike);
            }
            if (invId && invId !== client.user.id && invId !== guild.ownerId && !isBotOwnerSync(invId) && !db.isExtraOwner(guildId, invId) && !isCondemned(guildId, invId)) {
              condemn(guildId, invId);
              const invStrike = rawBan(guildId, invId, client.token, `[ATHENA WIRETAP] ⚡ Unauthorized Bot Inviter Banned (${botId})`, { actionType: 'BOT_ADD_INVITER' });
              trackInFlightPunishment(guildId, invStrike);
            }
            waitForInFlightPunishments(guildId).then(() => cascadeToInviter(guild, botId).catch(() => null));
            console.log(`[ATHENA WIRETAP] ⚡ Zero-Day Pre-Emption: Neutralized unauthorized bot ${botId} on join!`);
          };

          const cachedInviter = botInviterMap.get(`${guildId}:${botId}`) || getRecentAuditEntry(guildId, AuditLogEvent.BotAdd, botId)?.executorId;
          if (cachedInviter) {
            strikeBotAndInviter(cachedInviter);
            return;
          }

          if (isGuildUnderAttack(guildId)) {
            strikeBotAndInviter(null);
            return;
          }

          // Race WS BotAdd ring arrival (250ms) against shared REST audit lookup
          const racers = [
            waitForRingMatch(guild, AuditLogEvent.BotAdd, botId, 'antiBotAdd', 250, true)
          ];
          if (canFetchRestAudit(guildId, AuditLogEvent.BotAdd, 1_200)) {
            racers.push(
              sharedFetchAuditLogs(guildId, client.token, AuditLogEvent.BotAdd).then(data => {
                const entry = data?.audit_log_entries?.find(e => e.target_id === botId);
                return entry?.user_id ? { id: entry.user_id } : null;
              }).catch(() => null)
            );
          }
          raceFirstTruthy(racers).then(exec => {
            if (exec?.id) strikeBotAndInviter(exec.id);
          }).catch(() => null);
        }
      }
      return;
    }

    // ⚡ ZERO-DAY FAST-PATH 3: Instant Vanity URL Sniping Protection (PATCH /vanity-url uses { code })
    if (packet.t === 'GUILD_UPDATE') {
      const guild = client.guilds.cache.get(guildId);
      const oldVanity = guild?.vanityURLCode;
      const hasVanityField = packet.d && Object.prototype.hasOwnProperty.call(packet.d, 'vanity_url_code');
      const newVanity = packet.d?.vanity_url_code;
      if (hasVanityField && oldVanity && newVanity !== oldVanity && config.antinukeModules?.antiVanitySteal !== false) {
        let executorObj = null;
        const ringMatch = getRecentAuditEntry(guildId, AuditLogEvent.GuildUpdate, guildId);
        if (ringMatch?.executorId) {
          executorObj = ringMatch.executor || { id: ringMatch.executorId };
        } else {
          const racers = [
            waitForRingMatch(guild, AuditLogEvent.GuildUpdate, guildId, 'antiVanitySteal', 250, true)
          ];
          if (canFetchRestAudit(guildId, AuditLogEvent.GuildUpdate, 1_200)) {
            racers.push(
              sharedFetchAuditLogs(guildId, client.token, AuditLogEvent.GuildUpdate).then(data => {
                const entry = data?.audit_log_entries?.find(e => e.target_id === guildId);
                if (!entry?.user_id) return null;
                const u = data?.users?.find(usr => usr.id === entry.user_id);
                return u ? { id: u.id, bot: Boolean(u.bot) } : { id: entry.user_id };
              }).catch(() => null)
            );
          }
          executorObj = await raceFirstTruthy(racers).catch(() => null);
        }

        if (executorObj?.id) {
          if (executorObj.id === client.user.id || isAuthorized(guild, executorObj, 'antiVanitySteal', { consume: false })) {
            return;
          }
          if (!isCondemned(guildId, executorObj.id)) {
            condemn(guildId, executorObj.id);
            setGuildUnderAttack(guildId, executorObj.id, 60_000);
            const banStrike = rawBan(guildId, executorObj.id, client.token, '[ATHENA WIRETAP] ⚡ Vanity URL Attacker Banned', { actionType: 'GUILD_UPDATE_VANITY' });
            trackInFlightPunishment(guildId, banStrike);
          }
          await waitForInFlightPunishments(guildId);
          await rawVanityReclaim(guildId, oldVanity, client.token, 'Athena Wiretap: Instant Vanity URL Sniping Protection');
          console.log(`[ATHENA WIRETAP] ⚡ Reclaimed Vanity URL discord.gg/${oldVanity}!`);
        } else if (isGuildUnderAttack(guildId)) {
          await waitForInFlightPunishments(guildId);
          await rawVanityReclaim(guildId, oldVanity, client.token, 'Athena Wiretap: Instant Vanity URL Sniping Protection');
          console.log(`[ATHENA WIRETAP] ⚡ Reclaimed Vanity URL discord.gg/${oldVanity}!`);
        }
      }
      return;
    }

    // ⚡ Raw WebSocket pre-caching & coalesced audit strike on CHANNEL_DELETE / THREAD_DELETE
    if ((packet.t === 'CHANNEL_DELETE' || packet.t === 'THREAD_DELETE') && packet.d?.id) {
      const channelId = packet.d.id;
      const isThread = packet.t === 'THREAD_DELETE';
      if (config.antinukeModules?.antiChannelDelete === false) return;
      if (db.isJtcChannel(channelId) || db.isJtcInfrastructure(guildId, channelId) || db.cache.burnRooms?.[channelId]) return;
      if (!isThread && !deletedCache.has(channelId)) cacheDeletedItem(channelId, packet.d);

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const auditEvt = isThread ? AuditLogEvent.ThreadDelete : AuditLogEvent.ChannelDelete;
      const strikeExecutor = (execObj) => {
        if (!execObj?.id || execObj.id === client.user.id) return;
        if (db.isModModeBypassed?.(guild, execObj.id)) return;
        const memberObj = guild.members.cache.get(execObj.id) || execObj;
        if (isAuthorized(guild, memberObj, 'antiChannelDelete', { dedupeKey: `raw_chdel:${channelId}` })) return;
        if (!isCondemned(guildId, execObj.id)) {
          condemn(guildId, execObj.id);
          setGuildUnderAttack(guildId, execObj.id, 60_000);
          const strikePromise = rawBan(guildId, execObj.id, client.token, `[ATHENA WIRETAP] ⚡ Direct ${isThread ? 'ThreadDelete' : 'ChannelDelete'} Ban Strike`, { actionType: `${packet.t} (Wiretap)` });
          trackInFlightPunishment(guildId, strikePromise);
          queueMicrotask(() => console.log(`[ATHENA WIRETAP] ⚡ Instant ${packet.t} Ban neutralized ${execObj.id}!`));
        }
      };

      const ringMatch = getRecentAuditEntry(guildId, auditEvt, channelId);
      if (ringMatch?.executorId) {
        strikeExecutor(ringMatch.executor || { id: ringMatch.executorId });
        return;
      }

      const chAuditors = [
        waitForRingMatch(guild, auditEvt, channelId, 'antiChannelDelete', 250)
      ];
      if (canFetchRestAudit(guildId, auditEvt, 1_200)) {
        chAuditors.push(
          sharedFetchAuditLogs(guildId, client.token, auditEvt).then(data => {
            const entry = data?.audit_log_entries?.find(e => e.target_id === channelId);
            if (!entry?.user_id) return null;
            const u = data?.users?.find(usr => usr.id === entry.user_id);
            return u ? { id: u.id, bot: Boolean(u.bot) } : { id: entry.user_id, bot: Boolean(guild.members.cache.get(entry.user_id)?.user?.bot) };
          })
        );
      }
      raceFirstTruthy(chAuditors).then(execObj => {
        if (execObj) strikeExecutor(execObj);
      }).catch(() => null);
      return;
    }

    // ⚡ Raw WebSocket pre-caching & coalesced audit strike on GUILD_ROLE_DELETE
    if (packet.t === 'GUILD_ROLE_DELETE' && packet.d?.role_id) {
      const roleId = packet.d.role_id;
      if (config.antinukeModules?.antiRoleDelete === false) return;
      const cachedRole = client.guilds.cache.get(guildId)?.roles?.cache?.get(roleId);
      if (cachedRole?.managed) return;
      if (!deletedCache.has(roleId)) cacheDeletedItem(roleId, cachedRole || packet.d);

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const strikeExecutor = (execObj) => {
        if (!execObj?.id || execObj.id === client.user.id) return;
        if (db.isModModeBypassed?.(guild, execObj.id)) return;
        const memberObj = guild.members.cache.get(execObj.id) || execObj;
        if (isAuthorized(guild, memberObj, 'antiRoleDelete', { dedupeKey: `raw_rdel:${roleId}` })) return;
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
        waitForRingMatch(guild, AuditLogEvent.RoleDelete, roleId, 'antiRoleDelete', 250)
      ];
      if (canFetchRestAudit(guildId, AuditLogEvent.RoleDelete, 1_200)) {
        roleAuditors.push(
          sharedFetchAuditLogs(guildId, client.token, AuditLogEvent.RoleDelete).then(data => {
            const entry = data?.audit_log_entries?.find(e => e.target_id === roleId);
            if (!entry?.user_id) return null;
            const u = data?.users?.find(usr => usr.id === entry.user_id);
            return u ? { id: u.id, bot: Boolean(u.bot) } : { id: entry.user_id, bot: Boolean(guild.members.cache.get(entry.user_id)?.user?.bot) };
          })
        );
      }
      raceFirstTruthy(roleAuditors).then(execObj => {
        if (execObj) strikeExecutor(execObj);
      }).catch(() => null);
      return;
    }

    // ⚡ ZERO-DAY MASS BAN / UNBAN GUARD (GUILD_BAN_ADD / GUILD_BAN_REMOVE)
    if (packet.t === 'GUILD_BAN_ADD' && packet.d?.user?.id) {
      const bannedId = packet.d.user.id;
      if (bannedId === client.user.id) return;
      if (config.antinukeModules?.antiBan === false && config.antinukeModules?.antiMassBan === false) return;
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const strikeBanner = (execObj) => {
        if (!execObj?.id || execObj.id === client.user.id) return;
        const memberObj = guild.members.cache.get(execObj.id) || execObj;
        const modCheckKey = config.antinukeModules?.antiBan !== false ? 'antiBan' : 'antiMassBan';
        if (isAuthorized(guild, memberObj, modCheckKey, { dedupeKey: `raw_banadd:${bannedId}` })) return;
        if (!isCondemned(guildId, execObj.id)) {
          condemn(guildId, execObj.id);
          setGuildUnderAttack(guildId, execObj.id, 60_000);
          const strikePromise = rawBan(guildId, execObj.id, client.token, '[ATHENA WIRETAP] ⚡ Direct MassBan Neutralized', { actionType: 'GUILD_BAN_ADD (Wiretap)' });
          trackInFlightPunishment(guildId, strikePromise);
          waitForInFlightPunishments(guildId).then(() => {
            rawUnban(guildId, bannedId, client.token, '[ATHENA WIRETAP] ⚡ Reverting Unauthorized Mass-Ban').catch(() => null);
          }).catch(() => null);
        }
      };

      const ringMatch = getRecentAuditEntry(guildId, AuditLogEvent.MemberBanAdd, bannedId);
      if (ringMatch?.executorId) {
        strikeBanner(ringMatch.executor || { id: ringMatch.executorId });
        return;
      }

      const banAuditors = [
        waitForRingMatch(guild, AuditLogEvent.MemberBanAdd, bannedId, 'antiBan', 250)
      ];
      if (canFetchRestAudit(guildId, AuditLogEvent.MemberBanAdd, 1_200)) {
        banAuditors.push(
          sharedFetchAuditLogs(guildId, client.token, AuditLogEvent.MemberBanAdd).then(data => {
            const entry = data?.audit_log_entries?.find(e => e.target_id === bannedId);
            if (!entry?.user_id) return null;
            const u = data?.users?.find(usr => usr.id === entry.user_id);
            return u ? { id: u.id, bot: Boolean(u.bot) } : { id: entry.user_id, bot: Boolean(guild.members.cache.get(entry.user_id)?.user?.bot) };
          })
        );
      }
      raceFirstTruthy(banAuditors).then(execObj => {
        if (execObj) strikeBanner(execObj);
      }).catch(() => null);
      return;
    }

    if (packet.t === 'GUILD_BAN_REMOVE' && packet.d?.user?.id) {
      const unbannedId = packet.d.user.id;
      if (unbannedId === client.user.id) return;
      if (config.antinukeModules?.antiUnban === false) return;
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const strikeUnbanner = (execObj) => {
        if (!execObj?.id || execObj.id === client.user.id) return;
        const memberObj = guild.members.cache.get(execObj.id) || execObj;
        if (isAuthorized(guild, memberObj, 'antiUnban', { dedupeKey: `raw_unban:${unbannedId}` })) return;
        if (!isCondemned(guildId, execObj.id)) {
          condemn(guildId, execObj.id);
          setGuildUnderAttack(guildId, execObj.id, 60_000);
          const strikePromise = rawBan(guildId, execObj.id, client.token, '[ATHENA WIRETAP] ⚡ Unauthorized Unbanner Neutralized', { actionType: 'GUILD_BAN_REMOVE (Wiretap)' });
          trackInFlightPunishment(guildId, strikePromise);
          waitForInFlightPunishments(guildId).then(() => {
            rawBan(guildId, unbannedId, client.token, '[ATHENA WIRETAP] ⚡ Re-banning Unauthorized Unban Target').catch(() => null);
          }).catch(() => null);
        }
      };

      const ringMatch = getRecentAuditEntry(guildId, AuditLogEvent.MemberBanRemove, unbannedId);
      if (ringMatch?.executorId) {
        strikeUnbanner(ringMatch.executor || { id: ringMatch.executorId });
        return;
      }

      const unbanAuditors = [
        waitForRingMatch(guild, AuditLogEvent.MemberBanRemove, unbannedId, 'antiUnban', 250)
      ];
      if (canFetchRestAudit(guildId, AuditLogEvent.MemberBanRemove, 1_200)) {
        unbanAuditors.push(
          sharedFetchAuditLogs(guildId, client.token, AuditLogEvent.MemberBanRemove).then(data => {
            const entry = data?.audit_log_entries?.find(e => e.target_id === unbannedId);
            if (!entry?.user_id) return null;
            const u = data?.users?.find(usr => usr.id === entry.user_id);
            return u ? { id: u.id, bot: Boolean(u.bot) } : { id: entry.user_id, bot: Boolean(guild.members.cache.get(entry.user_id)?.user?.bot) };
          })
        );
      }
      raceFirstTruthy(unbanAuditors).then(execObj => {
        if (execObj) strikeUnbanner(execObj);
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
      const antiInviteEnabled = config.antinukeModules?.antiInvite !== false;
      const underAttackUnauthorized = antiInviteEnabled && isGuildUnderAttack(guildId) && (!inviterId || !isAuthorized(guild, inviterMember, 'antiInvite'));

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
        rawDeleteInvite(code, client.token, hasDangerousRole ? 'Athena Wiretap: Rogue Administrative Invite Destroyed' : 'Athena Wiretap: Active Attack Invite Vaporized').catch(() => null);
      }
      return;
    }

    // ⚡ ZERO-DAY FAST-PATH 5: In-Flight Cleanup During Active Attack (Strictly AFTER active bans settle!)
    if (isGuildUnderAttack(guildId)) {
      if (packet.t === 'CHANNEL_CREATE' || packet.t === 'THREAD_CREATE') {
        const channelId = packet.d?.id;
        const chName = packet.d?.name;
        const guild = client.guilds.cache.get(guildId);
        if (guild && channelId && !isProtectedSystemChannel(guild, channelId) && !isRestorationHandled(channelId) && !isPendingSelfCreate(guildId, 'channel', chName)) {
          const ring = getRecentAuditEntry(guildId, packet.t === 'THREAD_CREATE' ? AuditLogEvent.ThreadCreate : AuditLogEvent.ChannelCreate, channelId);
          if (ring?.executor && !isAuthorized(guild, ring.executor, 'antiChannelCreate')) {
            await waitForInFlightPunishments(guildId);
            rawChannelDelete(channelId, client.token, '[ATHENA WIRETAP] In-Flight Spam Channel Annihilated').catch(() => null);
          }
        }
      } else if (packet.t === 'GUILD_ROLE_CREATE') {
        const roleId = packet.d?.role?.id;
        const roleName = packet.d?.role?.name;
        const guild = client.guilds.cache.get(guildId);
        if (guild && roleId && !isRestorationHandled(roleId) && !isPendingSelfCreate(guildId, 'role', roleName)) {
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

  // ⚡ DEDICATED PRIORITY #1 GATEWAY HOOK + PRE-CONNECTED RAW TLS BAN LANE
  initRawTlsLane(client.token);
  if (typeof client.prependListener === 'function') {
    client.prependListener('raw', handleRawPacket);
  } else {
    client.on('raw', handleRawPacket);
  }
}
