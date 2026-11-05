import db from '../database.js';
import { AuditLogEvent } from 'discord.js';
import { 
  directStrike, 
  getRecentAuditEntry, 
  triggerSnapshotSync,
  isGuildUnderAttack,
  isProtectedSystemChannel,
  rawChannelDelete
} from '../utils/antinuke.js';
import embed from '../embed.js';
import { logServerEvent } from '../utils/serverLogger.js';

export default {
  name: 'channelCreate',
  async execute(channel) {
    if (!channel.guild) return;

    // ⚡ INTERCEPT IN-FLIGHT ROGUE SPAM CHANNELS (Sub-5ms Raw API Intercept)
    // If the server is actively under attack, eliminate any newly arriving spam channel immediately
    if (isGuildUnderAttack(channel.guild.id)) {
      if (!isProtectedSystemChannel(channel.guild, channel.id)) {
        await rawChannelDelete(channel.id, channel.guild.client.token, '[ATHENA ANTI-NUKE] In-Flight Rogue Channel Intercepted').catch(() => null);
        return;
      }
    }

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

    // Debounced baseline infrastructure sync (non-blocking)
    triggerSnapshotSync(channel.guild, 15_000);

    // Auto VC Status for newly created voice channels
    if (channel.type === 2) { // 2 = GuildVoice
      const cfg = db.getGuildConfig(channel.guild.id);
      if (cfg && cfg.autoVcStatus) {
        import('../commands/autovcstatus.js').then(mod => {
          const status = mod.getRandomStatus(channel.guild, cfg.customVcStatuses || []);
          channel.setVoiceStatus(status).catch(() => null);
        }).catch(() => null);
      }
    }

    // Auto-hide new channels from quarantined users (immediate execution)
    try {
      const config = db.getGuildConfig(channel.guild.id);
      
      if (config.quarantineRoleId) {
        const qRole = await channel.guild.roles.fetch(config.quarantineRoleId).catch(() => null);
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

    // Non-blocking server log entry — zero REST audit contention with Anti-Nuke
    (async () => {
      try {
        const ring = getRecentAuditEntry(channel.guild.id, AuditLogEvent.ChannelCreate, channel.id);
        let executor = ring?.executor ? `${ring.executor.tag} (<@${ring.executor.id}>)` : 'Unknown';

        if (executor === 'Unknown') {
          await new Promise(r => setTimeout(r, 2000));
          const lateRing = getRecentAuditEntry(channel.guild.id, AuditLogEvent.ChannelCreate, channel.id);
          if (lateRing?.executor) {
            executor = `${lateRing.executor.tag} (<@${lateRing.executor.id}>)`;
          }
        }

        const createEmbed = embed.build({
          description: `__**Channel Created |**__ <a:uptime:1552608831060844575>\n> **Channel:** ${channel.name} (<#${channel.id}>)\n>  **Type:** ${channel.type}\n>  **Executor:** ${executor}`,
          color: '#2b2d31'
        });
        await logServerEvent(channel.guild, 'channels', createEmbed);
      } catch {}
    })().catch(() => null);
  }
};
