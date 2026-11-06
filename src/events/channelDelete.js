import { AuditLogEvent } from 'discord.js';
import { 
  cacheDeletedItem, 
  directStrike, 
  isRestorationHandled, 
  markRestorationQueued, 
  executeIntelligentChannelRepair,
  getRecentAuditEntry
} from '../utils/antinuke.js';
import db from '../database.js';
import embed from '../embed.js';
import { logServerEvent } from '../utils/serverLogger.js';

export default {
  name: 'channelDelete',
  async execute(channel) {
    if (!channel.guild) return;
    if (db.isModModeActive(channel.guild.id)) return;

    // Honeypot Canary Sync
    const cfg = db.getGuildConfig(channel.guild.id);
    if (cfg?.honeypotChannelId && channel.id === cfg.honeypotChannelId) {
      cfg.honeypotChannelId = null;
      db.save();
    }

    // ⚡ STEP 1: Synchronous Deduplication Lock
    // Prevents duplicate restorations between gateway channelDelete and auditLogEntryCreate
    if (isRestorationHandled(channel.id)) return;
    markRestorationQueued(channel.id);

    // ⚡ STEP 2: Cache channel metadata immediately
    cacheDeletedItem(channel.id, channel);

    const isCategory = channel.type === 4 || channel.type === 'GuildCategory';

    // ⚡ STEP 3: Sub-1ms Direct Strike & Intelligent Category/Position Repair
    directStrike(
      channel.guild,
      AuditLogEvent.ChannelDelete,
      isCategory ? 'Category Deletion' : 'Channel Deletion',
      channel.id,
      () => executeIntelligentChannelRepair(channel.guild, channel.id, channel)
    ).catch(() => null);

    // Non-blocking server log entry
    (async () => {
      try {
        const ring = getRecentAuditEntry(channel.guild.id, AuditLogEvent.ChannelDelete, channel.id);
        let executor = ring?.executor ? `${ring.executor.tag} (<@${ring.executor.id}>)` : 'Unknown';

        if (executor === 'Unknown') {
          await new Promise(r => setTimeout(r, 2000));
          const lateRing = getRecentAuditEntry(channel.guild.id, AuditLogEvent.ChannelDelete, channel.id);
          if (lateRing?.executor) {
            executor = `${lateRing.executor.tag} (<@${lateRing.executor.id}>)`;
          }
        }

        const delEmbed = embed.build({
          description: `__**Channel Deleted |**__ <a:uptime:1552608831060844575>\n> **Channel Name:** ${channel.name}\n>  **Type:** ${channel.type}\n>  **Executor:** ${executor}`,
          color: '#2b2d31'
        });
        await logServerEvent(channel.guild, 'channels', delEmbed);
      } catch {}
    })().catch(() => null);
  }
};
