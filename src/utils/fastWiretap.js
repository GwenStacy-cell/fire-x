import { isBotOwnerSync, isServerAdmin } from './helpers.js';
import { 
  hasDangerousPerms, 
  rawBan, 
  rawRoleStrip, 
  rawChannelDelete, 
  isCondemned, 
  condemn, 
  setGuildUnderAttack, 
  isGuildUnderAttack,
  recordAuditEntry,
  isProtectedSystemChannel,
  isAuthorized
} from './antinuke.js';
import { PermissionFlagsBits } from 'discord.js';
import db from '../database.js';

const DESTRUCTIVE_EVENTS = new Set([
  'GUILD_AUDIT_LOG_ENTRY_CREATE',
  'CHANNEL_DELETE',
  'CHANNEL_CREATE',
  'GUILD_ROLE_DELETE',
  'GUILD_ROLE_CREATE',
  'GUILD_BAN_ADD',
  'INVITE_CREATE'
]);

// Action types that indicate aggressive destructive nuking
const DESTRUCTIVE_AUDIT_ACTIONS = new Set([
  10, // Channel Create
  12, // Channel Delete
  20, // Member Kick
  22, // Member Ban Add
  28, // Bot Add
  30, // Role Create
  32, // Role Delete
  40, // Webhook Create
  42  // Webhook Delete
]);

export function attachWiretap(client) {
  client.ws.on('RAW', async (packet) => {
    if (!packet.t || !DESTRUCTIVE_EVENTS.has(packet.t)) return;

    const guildId = packet.d.guild_id;
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

      // Action to module mapping
      const ACTION_TO_MODULE = {
        10: 'antiChannelCreate',
        12: 'antiChannelDelete',
        20: 'antiKick',
        22: 'antiBan',
        28: 'antiBotAdd',
        30: 'antiRoleCreate',
        32: 'antiRoleDelete',
        40: 'antiWebhooks',
        42: 'antiWebhooks'
      };

      const modKey = ACTION_TO_MODULE[actionType];
      const mods = config.antinukeModules || {};
      if (modKey && mods[modKey] === false) {
        return;
      }

      const member = guild.members.cache.get(executorId);
      const isAuthorizedAdmin = isServerOwner || 
                                isExtraOwner || 
                                isBotOwner || 
                                isAuthorized(guild, member || { id: executorId }, modKey || 'antinuke') ||
                                (member?.permissions?.has && member.permissions.has(PermissionFlagsBits.Administrator)) ||
                                (member?.roles?.cache && member.roles.cache.some(r => r.permissions?.has && r.permissions.has(PermissionFlagsBits.Administrator))) ||
                                isServerAdmin(member, guildId);

      if (!isAuthorizedAdmin) {
        if (DESTRUCTIVE_AUDIT_ACTIONS.has(actionType)) {
          if (!isCondemned(guildId, executorId)) {
            condemn(guildId, executorId);
            setGuildUnderAttack(guildId, executorId, 60_000);

            // ⚡ DIRECT BAN FIRST: Send PUT /bans over pre-warmed socket at 0ms
            const reason = `[ATHENA WIRETAP] ⚡ RAW WebSocket Strike: Neutralized Action ${actionType}`;
            rawBan(guildId, executorId, client.token, reason).then(ok => {
              if (!ok) rawRoleStrip(guildId, executorId, client.token).catch(() => null);
            }).catch(() => {
              rawRoleStrip(guildId, executorId, client.token).catch(() => null);
            });

            console.log(`[ATHENA WIRETAP] ⚡ Zero-Day Intercepted GUILD_AUDIT_LOG_ENTRY_CREATE (${actionType})! Neutralized ${executorId} in 0ms!`);
          }
        }
      }
      return;
    }

    // ⚡ ZERO-DAY FAST-PATH 2: Rogue Invite Destruction (<1ms)
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
              }
            }).catch(() => null);
            console.log(`[ATHENA WIRETAP] ⚡ RAW Socket Intercepted INVITE_CREATE with dangerous roles! Destroyed invite ${code} in <1ms!`);
          }
        }
      }
      return;
    }

    // ⚡ ZERO-DAY FAST-PATH 3: In-Flight Rogue Channel Annihilation During Active Attack
    // If server is actively under attack, instantly delete new arriving spam channels at 0ms
    if (packet.t === 'CHANNEL_CREATE' && isGuildUnderAttack(guildId)) {
      const channelId = packet.d.id;
      const guild = client.guilds.cache.get(guildId);
      if (guild && !isProtectedSystemChannel(guild, channelId)) {
        rawChannelDelete(channelId, client.token, '[ATHENA WIRETAP] In-Flight Spam Channel Annihilated').catch(() => null);
      }
    }
  });
}
