import { EmbedBuilder, AuditLogEvent, PermissionFlagsBits } from 'discord.js';
import db from '../database.js';
import { isGuildUnderAttack, getRecentAuditEntry } from './antinuke.js';
import { formatUserLink, formatChannelLink } from './helpers.js';

// In-memory cache to prevent duplicate voice channel status log bursts
const voiceStatusCache = new Map();

/**
 * Format key-value pairs into a clean, aligned log description
 * matching the user reference layout.
 */
export function formatLogDescription(attributes = {}) {
  return Object.entries(attributes)
    .filter(([_, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `**${k}:** ${v}`)
    .join('\n');
}

/**
 * Build a standardized, high-contrast server log embed.
 */
export function buildServerLogEmbed({
  title,
  color = '#5865F2',
  description = '',
  attributes = null,
  client = null,
  timestamp = new Date()
}) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp(timestamp);

  const descContent = attributes ? formatLogDescription(attributes) : description;
  if (descContent) {
    embed.setDescription(descContent);
  }

  if (client?.user) {
    const avatar = client.user.displayAvatarURL?.();
    const footerObj = { text: client.user.tag || 'Athena Prime' };
    if (avatar && typeof avatar === 'string' && avatar.startsWith('http')) {
      footerObj.iconURL = avatar;
    }
    embed.setFooter(footerObj);
  }

  return embed;
}

/**
 * Query executor and reason with 0ms ring buffer lookup and safe fallback.
 */
export async function getAuditExecutorAndReason(guild, actionType, targetId) {
  if (!guild) return { executor: null, reason: null };
  try {
    // 1. Ring buffer lookup (sub-1ms, zero REST contention)
    const ring = getRecentAuditEntry(guild.id, actionType, targetId);
    if (ring?.executor) {
      return { 
        executor: ring.executor, 
        reason: ring.reason || null 
      };
    }

    // 2. Safe REST fallback if guild is quiet and bot has permission
    if (!isGuildUnderAttack(guild.id) && guild.members?.me?.permissions?.has(PermissionFlagsBits.ViewAuditLog)) {
      const audit = await guild.fetchAuditLogs({ type: actionType, limit: 1 }).catch(() => null);
      const entry = audit?.entries?.first();
      if (entry && (!targetId || entry.targetId === targetId)) {
        const diff = Date.now() - entry.createdTimestamp;
        if (diff < 10000) {
          return {
            executor: entry.executor,
            reason: entry.reason || null
          };
        }
      }
    }
  } catch {}
  return { executor: null, reason: null };
}

/**
 * Fast synchronous check for whether server logging is active for a given module.
 * Prevents wasted REST audit-log fetches when logging is disabled.
 */
export function isServerLogModuleEnabled(guildId, moduleName) {
  if (!guildId) return false;
  if (isGuildUnderAttack(guildId)) return false;
  const config = db.getGuildConfig(guildId);
  const serverLogs = config?.serverLogs;
  if (!serverLogs) return false;
  const moduleConfig = serverLogs.modules?.[moduleName];
  if (moduleConfig && moduleConfig.enabled === false) return false;
  const targetChannelId = moduleConfig?.channelId || (serverLogs.enabled ? serverLogs.defaultChannelId : null);
  return Boolean(targetChannelId);
}

/**
 * Core logging engine for Server Logs.
 * 
 * @param {Guild} guild - The Discord guild object
 * @param {string} moduleName - e.g., 'channels', 'roles', 'server', 'voice', 'emojis', 'webhooks', 'invites'
 * @param {EmbedBuilder|Object} embedData - The EmbedBuilder or payload
 */
export async function logServerEvent(guild, moduleName, embedData) {
  try {
    if (!guild?.id) return;
    // ⚡ Combat Rate-Limit Shield: Silence routine logging during active attacks
    if (isGuildUnderAttack(guild.id)) return;
    
    const config = db.getGuildConfig(guild.id);
    const serverLogs = config.serverLogs;
    if (!serverLogs) return;

    // Fast fail if module is explicitly disabled
    const moduleConfig = serverLogs.modules?.[moduleName];
    if (moduleConfig && moduleConfig.enabled === false) return;

    // Resolve target channel: module-specific override OR master default channel
    const targetChannelId = moduleConfig?.channelId || (serverLogs.enabled ? serverLogs.defaultChannelId : null);
    if (!targetChannelId) return;

    // Fetch and validate channel
    const channel = guild.channels.cache.get(targetChannelId) || await guild.channels.fetch(targetChannelId).catch(() => null);
    if (!channel) {
      if (moduleConfig?.channelId === targetChannelId) {
        moduleConfig.channelId = null;
        db.updateGuildConfig(guild.id, { serverLogs });
      } else if (serverLogs.defaultChannelId === targetChannelId) {
        serverLogs.defaultChannelId = null;
        db.updateGuildConfig(guild.id, { serverLogs });
      }
      return;
    }
    if (!channel.isTextBased()) return;

    // Dispatch the log payload
    const payload = (embedData.components || embedData.content) ? embedData : { embeds: [embedData] };
    await channel.send(payload).catch(err => {
      console.log(`[ServerLogger] Failed to dispatch log to ${targetChannelId}:`, err.message);
    });
  } catch (error) {
    console.error(`[ServerLogger] Failed to log ${moduleName} event in guild ${guild.id}:`, error);
  }
}

/**
 * Log voice channel status update with in-memory deduplication.
 */
export async function logVoiceChannelStatusUpdate(guild, channelId, newStatus) {
  if (!guild || !channelId) return;
  const prevStatus = voiceStatusCache.get(channelId);
  if (prevStatus === newStatus) return; // Deduplicate identical status pulses
  voiceStatusCache.set(channelId, newStatus || '');

  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  const channelName = channel ? channel.name : 'Unknown Voice Channel';
  const channelLink = channel 
    ? formatChannelLink(channel, guild) 
    : `\`${channelId}\``;

  const embed = buildServerLogEmbed({
    title: 'Voice channel status updated',
    color: '#5865F2',
    attributes: {
      'Name': `${channelName} (${channelLink})`,
      'ID': `\`${channelId}\``,
      'Status': newStatus || '*Status cleared*'
    },
    client: guild.client
  });

  await logServerEvent(guild, 'voice', embed);
}
