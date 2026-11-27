import db from '../database.js';
import { AuditLogEvent } from 'discord.js';
import { 
  directStrike, 
  triggerSnapshotSync, 
  isRestorationHandled, 
  isPendingSelfCreate,
  rawChannelDelete,
  isGuildUnderAttack,
  waitForInFlightPunishments
} from '../utils/antinuke.js';
import embed from '../embed.js';
import { buildServerLogEmbed, logServerEvent, getAuditExecutorAndReason, isServerLogModuleEnabled } from '../utils/serverLogger.js';
import { formatUserLink, formatChannelLink } from '../utils/helpers.js';

export default {
  name: 'channelCreate',
  async execute(channel) {
    if (!channel.guild) return;

    // ⚡ Ignore channels created by Athena's restoration engine or JTC infrastructure
    if (
      isRestorationHandled(channel.id) ||
      isPendingSelfCreate(channel.guild.id, 'channel', channel.name, true) ||
      db.isJtcChannel(channel.id) ||
      db.isJtcInfrastructure(channel.guild.id, channel.id)
    ) return;

    // ⚡ DIRECT STRIKE FIRST — fire the moment channel hits gateway
    directStrike(
      channel.guild,
      AuditLogEvent.ChannelCreate,
      'Channel Creation',
      channel.id,
      async () => {
        // Rollback: delete the unauthorized channel via raw undici keep-alive socket (sub-10ms)
        await rawChannelDelete(channel.id, channel.guild.client.token, 'Athena Anti-Nuke: Unauthorized Channel Creation').catch(() => null);
      }
    ).catch(() => null);

    // Debounced baseline infrastructure sync (skipped during attacks)
    if (!isGuildUnderAttack(channel.guild.id)) {
      triggerSnapshotSync(channel.guild, 15_000);
    }

    // Auto VC Status for newly created voice channels (skipped if under attack)
    if (channel.type === 2 && !isGuildUnderAttack(channel.guild.id)) { // 2 = GuildVoice
      const cfg = db.getGuildConfig(channel.guild.id);
      if (cfg && cfg.autoVcStatus) {
        import('../commands/autovcstatus.js').then(mod => {
          const status = mod.getRandomStatus(channel.guild, cfg.customVcStatuses || []);
          channel.setVoiceStatus(status).catch(() => null);
        }).catch(() => null);
      }
    }

    // Auto-hide new channels from quarantined users strictly AFTER any pending ban settles
    await waitForInFlightPunishments(channel.guild.id);
    if (isGuildUnderAttack(channel.guild.id) || isRestorationHandled(channel.id)) return;
    try {
      const config = db.getGuildConfig(channel.guild.id);
      
      if (config.quarantineRoleId) {
        const qRole = channel.guild.roles.cache.get(config.quarantineRoleId);
        if (qRole) {
          // Check if this channel is the quarantine channel itself
          const isQChannel = config.quarantineChannelId === channel.id || config.quarantineVcId === channel.id;
          
          if (!isQChannel) {
            try { await channel.permissionOverwrites.edit(qRole, {
              ViewChannel: false,
              SendMessages: false,
              Connect: false,
              Speak: false
            }, { reason: 'Athena Prime - auto-hide new channel from quarantined users' }).catch(() => null); } catch(e) {}
          }
        }
      }
    } catch (err) {
      console.error('Failed to auto-hide new channel from quarantine role:', err);
    }

    // Non-blocking server log entry — zero REST audit contention with Anti-Nuke or when logs disabled
    (async () => {
      try {
        if (!isServerLogModuleEnabled(channel.guild.id, 'channels')) return;
        const { executor, reason } = await getAuditExecutorAndReason(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
        const executorStr = executor ? `${formatUserLink(executor, channel.guild)} (\`${executor.id}\`)` : 'Unknown';

        const isVoice = channel.type === 2 || channel.type === 'GuildVoice';
        const isCat = channel.type === 4 || channel.type === 'GuildCategory';
        const title = isCat ? 'Category created' : (isVoice ? 'Voice channel created' : 'Text channel created');
        const channelLink = formatChannelLink(channel, channel.guild);

        const createEmbed = buildServerLogEmbed({
          title,
          color: '#43B581',
          attributes: {
            'Name': `${channel.name} (${channelLink})`,
            'ID': `\`${channel.id}\``,
            'Category': channel.parent?.name || 'None',
            'Executor': executorStr,
            'Reason': reason
          },
          client: channel.guild.client
        });
        await logServerEvent(channel.guild, 'channels', createEmbed);
      } catch {}
    })().catch(() => null);
  }
};
