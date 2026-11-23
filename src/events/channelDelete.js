import { AuditLogEvent } from 'discord.js';
import { 
  cacheDeletedItem, 
  directStrike, 
  isRestorationHandled, 
  markRestorationQueued, 
  executeIntelligentChannelRepair,
  getRecentAuditEntry,
  isGuildUnderAttack
} from '../utils/antinuke.js';
import db from '../database.js';
import embed from '../embed.js';
import { buildServerLogEmbed, logServerEvent, getAuditExecutorAndReason } from '../utils/serverLogger.js';
import { formatUserLink } from '../utils/helpers.js';

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

    // Ephemeral Burn Room Sync - Clean up and prevent antinuke restore
    if (db.cache.burnRooms?.[channel.id]) {
      db.removeBurnRoom(channel.id);
      return;
    }

    // ⚡ JTC Temporary Channel & Infrastructure Sync - Prevent Anti-Nuke false alarms & direct strikes
    if (db.isJtcChannel(channel.id) || db.isJtcInfrastructure(channel.guild.id, channel.id)) {
      const isJtc = db.isJtcChannel(channel.id);
      if (isJtc) db.removeJtcChannel(channel.id);

      // Log JTC deletion directly matching live server logs layout
      const jtcEmbed = buildServerLogEmbed({
        title: 'Voice channel deleted',
        color: '#F04747',
        attributes: {
          'Name': channel.name,
          'ID': `\`${channel.id}\``,
          'Category': channel.parent?.name || 'Athena Voice Hub',
          'Reason': 'JTC: All members left, auto-cleanup'
        },
        client: channel.guild.client
      });
      logServerEvent(channel.guild, 'channels', jtcEmbed).catch(() => null);
      return;
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

    // Non-blocking server log entry (Silenced during attacks to reserve 100% API throughput for ban)
    (async () => {
      try {
        if (isGuildUnderAttack(channel.guild.id)) return;
        const { executor, reason } = await getAuditExecutorAndReason(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
        const executorStr = executor ? `${formatUserLink(executor, channel.guild)} (\`${executor.id}\`)` : 'Unknown';

        const isVoice = channel.type === 2 || channel.type === 'GuildVoice';
        const isCat = channel.type === 4 || channel.type === 'GuildCategory';
        const title = isVoice ? 'Voice channel deleted' : (isCat ? 'Category deleted' : 'Text channel deleted');

        const delEmbed = buildServerLogEmbed({
          title,
          color: '#F04747',
          attributes: {
            'Name': channel.name,
            'ID': `\`${channel.id}\``,
            'Category': channel.parent?.name || 'None',
            'Executor': executorStr,
            'Reason': reason
          },
          client: channel.guild.client
        });
        await logServerEvent(channel.guild, 'channels', delEmbed);
      } catch {}
    })().catch(() => null);
  }
};
