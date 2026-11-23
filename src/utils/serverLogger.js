import { ChannelType } from 'discord.js';
import db from '../database.js';
import { isGuildUnderAttack } from './antinuke.js';

/**
 * Core logging engine for Server Logs.
 * 
 * @param {Guild} guild - The Discord guild object
 * @param {string} moduleName - e.g., 'bans', 'kicks', 'msgDeletes'
 * @param {EmbedBuilder} embedData - The EmbedBuilder payload
 */
export async function logServerEvent(guild, moduleName, embedData) {
  try {
    if (!guild?.id) return;
    // ⚡ Combat Rate-Limit Shield: Silence routine logging during active attacks
    if (isGuildUnderAttack(guild.id)) return;
    const config = db.getGuildConfig(guild.id);
    const serverLogs = config.serverLogs;

    if (!serverLogs) return;

    const moduleConfig = serverLogs.modules[moduleName];
    // Fast fail if module doesn't exist or is disabled
    if (!moduleConfig || !moduleConfig.enabled) return;

    // Resolve channel: Use explicitly bound channel, or fallback ONLY IF master switch is enabled
    const targetChannelId = moduleConfig.channelId || (serverLogs.enabled ? serverLogs.defaultChannelId : null);
    if (!targetChannelId) return;

    // Ensure we can access the channel
    const channel = await guild.channels.fetch(targetChannelId).catch(() => null);
    if (!channel) {
      if (moduleConfig.channelId === targetChannelId) {
        moduleConfig.channelId = null;
        db.updateGuildConfig(guild.id, { serverLogs });
      } else if (serverLogs.defaultChannelId === targetChannelId) {
        serverLogs.defaultChannelId = null;
        db.updateGuildConfig(guild.id, { serverLogs });
      }
      return;
    }
    if (!channel.isTextBased()) return;

    // Send the log
    let payload = (embedData.components || embedData.content) ? embedData : { embeds: [embedData] };
    await channel.send(payload).catch(err => {
      console.log(`[ServerLogger] Failed to send embed to ${targetChannelId}:`, err.message);
    });
  } catch (error) {
    console.error(`[ServerLogger] Failed to log ${moduleName} event in guild ${guild.id}:`, error);
  }
}
