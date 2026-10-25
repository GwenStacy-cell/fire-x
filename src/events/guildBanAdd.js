import { AuditLogEvent } from 'discord.js';
import { postGlobalActionLog } from '../utils/globalLog.js';
import { directStrike, getRecentAuditEntry } from '../utils/antinuke.js';
import { logServerEvent } from '../utils/serverLogger.js';
import embed from '../embed.js';
import { getSafeUserAvatar, getSafeGuildIcon } from '../utils/helpers.js';

export default {
  name: 'guildBanAdd',
  async execute(ban) {
    if (!ban.guild) return;

    // Athena never processes bans targeting itself
    if (ban.user.id === ban.guild.client.user.id) return;

    // ⚡ DIRECT STRIKE — fire the moment guildBanAdd hits the gateway
    directStrike(
      ban.guild,
      AuditLogEvent.MemberBanAdd,
      'Member Ban (Mass Ban Attack)',
      ban.user.id,
      async () => {
        // Rollback: unban the victim
        await ban.guild.members.unban(ban.user.id, 'Athena Anti-Nuke: Unauthorized Ban Reverted').catch(() => null);
      }
    ).catch(() => null);

    // Non-blocking server logging & global action broadcast
    (async () => {
      try {
        const ring = getRecentAuditEntry(ban.guild.id, AuditLogEvent.MemberBanAdd, ban.user.id);
        let executor = ring?.executor ? `${ring.executor.tag} (<@${ring.executor.id}>)` : 'Unknown (Native/Other Bot)';
        let reason = ban.reason || 'No reason provided';
        let executorId = ring?.executor?.id || null;
        let executorTag = ring?.executor?.tag || null;

        if (executor === 'Unknown (Native/Other Bot)') {
          await new Promise(r => setTimeout(r, 2000));
          const lateRing = getRecentAuditEntry(ban.guild.id, AuditLogEvent.MemberBanAdd, ban.user.id);
          if (lateRing?.executor) {
            executor = `${lateRing.executor.tag} (<@${lateRing.executor.id}>)`;
            executorId = lateRing.executor.id;
            executorTag = lateRing.executor.tag;
            if (lateRing.reason) reason = lateRing.reason;
          }
        }

        const logEmbed = embed.build({
          description: `__**Member Banned |**__ <a:uptime:1552608831060844575>\n> **User:** ${ban.user.tag} (<@${ban.user.id}>)\n>  **Executor:** ${executor}\n>  **Reason:** ${reason}`,
          color: '#2b2d31',
          thumbnail: getSafeUserAvatar(ban.user, 256)
        });
        await logServerEvent(ban.guild, 'bans', logEmbed);

        // Global Action Log — cross-server broadcast
        postGlobalActionLog(ban.guild.client, {
          action: 'BAN',
          guildId: ban.guild.id,
          guildName: ban.guild.name,
          guildIconUrl: getSafeGuildIcon(ban.guild, 256),
          targetId: ban.user.id,
          targetTag: ban.user.tag,
          executorId: executorId || ban.guild.client.user.id,
          executorTag: executorTag || 'Anti-Nuke / Bot',
          reason: reason
        }).catch(() => null);
      } catch {}
    })().catch(() => null);
  }
};
