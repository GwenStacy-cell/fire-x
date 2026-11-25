import { AuditLogEvent } from 'discord.js';
import { getRecentAuditEntry } from '../utils/antinuke.js';
import db from '../database.js';
import statsDB from '../statsDB.js';
import { sendLeaveMessage } from '../commands/welcome.js';
import { logServerEvent, isServerLogModuleEnabled } from '../utils/serverLogger.js';
import embed from '../embed.js';
import { getSafeUserAvatar, getSafeGuildIcon, formatUserLink } from '../utils/helpers.js';

export default {
  name: 'guildMemberRemove',
  async execute(member) {
    const guild = member.guild;
    if (!guild) return;

    statsDB.logLeave(guild.id, member.id);
    db.deletePendingEntryApp(guild.id, member.id);

    // Send leave message and DM concurrently
    sendLeaveMessage(member).catch(() => null);
    try {
      const config = db.getGuildConfig(guild.id);
      const guildIcon = getSafeGuildIcon(guild);
      const leaveDm = embed.build({
        title: `Goodbye from ${guild.name}!`,
        description: `We're sorry to see you go from **${guild.name}**. We will miss you! <a:uptime:1552608831060844575>`,
        color: config.accentColor || '#2b2d31',
        ...(guildIcon ? { thumbnail: guildIcon } : {})
      });
      member.send({ embeds: [leaveDm] }).catch(() => null);
    } catch {}

    // Kicks are intercepted at 0ms directly via Gateway GUILD_AUDIT_LOG_ENTRY_CREATE in fastWiretap.js.
    // Do NOT poll REST GET /audit-logs on normal voluntary member leaves!

    // Non-blocking server logging — skips completely if neither kicks nor leaves logging is active
    (async () => {
      try {
        const kickLogOn = isServerLogModuleEnabled(guild.id, 'kicks');
        const leaveLogOn = isServerLogModuleEnabled(guild.id, 'leaves');
        if (!kickLogOn && !leaveLogOn) return;

        let ring = getRecentAuditEntry(guild.id, AuditLogEvent.MemberKick, member.id);
        if (!ring || ring.targetId !== member.id) {
          await new Promise(r => setTimeout(r, 1500));
          ring = getRecentAuditEntry(guild.id, AuditLogEvent.MemberKick, member.id);
        }

        const isKick = Boolean(ring && ring.targetId === member.id);
        if (isKick && !kickLogOn) return;
        if (!isKick && !leaveLogOn) return;

        const executor = ring?.executor ? `${formatUserLink(ring.executor, guild)} (\`${ring.executor.id}\`)` : 'Unknown (Native/Other Bot)';
        const reason = ring?.reason || 'No reason provided';

        const memberUser = member.user || await member.client.users.fetch(member.id).catch(() => null);
        const userLink = formatUserLink(memberUser || member, guild);
        const avatarUrl = getSafeUserAvatar(memberUser || member, 256);

        if (isKick) {
          const kickEmbed = embed.build({
            description: `__**Member Kicked |**__ <a:uptime:1552608831060844575>\n> **User:** ${userLink} (\`${member.id}\`)\n>  **Executor:** ${executor}\n>  **Reason:** ${reason}`,
            color: '#2b2d31',
            thumbnail: avatarUrl
          });
          await logServerEvent(guild, 'kicks', kickEmbed);
        } else {
          const leaveEmbed = embed.build({
            description: `__**Member Left |**__ <a:uptime:1552608831060844575>\n> **User:** ${userLink} (\`${member.id}\`)`,
            color: '#2b2d31',
            thumbnail: avatarUrl
          });
          await logServerEvent(guild, 'leaves', leaveEmbed);
        }
      } catch {}
    })().catch(() => null);

    // Auto-update server stats counters (Online & Total Members)
    import('../commands/serverstats.js').then(m => {
      m.scheduleServerStatsUpdate(guild, 'guildMemberRemove');
    }).catch(() => null);
  }
};
