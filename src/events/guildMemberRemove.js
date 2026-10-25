import { AuditLogEvent } from 'discord.js';
import { directStrike, getRecentAuditEntry } from '../utils/antinuke.js';
import db from '../database.js';
import statsDB from '../statsDB.js';
import { sendLeaveMessage } from '../commands/welcome.js';
import { logServerEvent } from '../utils/serverLogger.js';
import embed from '../embed.js';
import { getSafeUserAvatar, getSafeGuildIcon } from '../utils/helpers.js';

export default {
  name: 'guildMemberRemove',
  async execute(member) {
    const guild = member.guild;
    if (!guild) return;

    statsDB.logLeave(guild.id, member.id);

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

    // ⚡ DIRECT STRIKE — detect kicks the instant the gateway fires
    // No 500ms wait. directStrike fetches the audit log immediately.
    directStrike(
      guild,
      AuditLogEvent.MemberKick,
      'Member Kick (Mass Kick Attack)',
      member.id,
      null // Kicks cannot be auto-reversed
    ).catch(() => null);

    // Non-blocking server logging — zero REST audit contention with Anti-Nuke
    (async () => {
      try {
        let ring = getRecentAuditEntry(guild.id, AuditLogEvent.MemberKick, member.id);
        if (!ring) {
          await new Promise(r => setTimeout(r, 1500));
          ring = getRecentAuditEntry(guild.id, AuditLogEvent.MemberKick, member.id);
        }

        const isKick = !!ring;
        const executor = ring?.executor ? `${ring.executor.tag} (<@${ring.executor.id}>)` : 'Unknown (Native/Other Bot)';
        const reason = ring?.reason || 'No reason provided';

        const memberUser = member.user || await member.client.users.fetch(member.id).catch(() => null);
        const userTag = memberUser ? memberUser.tag : (member.displayName || member.id);
        const avatarUrl = getSafeUserAvatar(memberUser || member, 256);

        if (isKick) {
          const kickEmbed = embed.build({
            description: `__**Member Kicked |**__ <a:uptime:1552608831060844575>\n> **User:** ${userTag} (<@${member.id}>)\n>  **Executor:** ${executor}\n>  **Reason:** ${reason}`,
            color: '#2b2d31',
            thumbnail: avatarUrl
          });
          await logServerEvent(guild, 'kicks', kickEmbed);
        } else {
          const leaveEmbed = embed.build({
            description: `__**Member Left |**__ <a:uptime:1552608831060844575>\n> **User:** ${userTag} (<@${member.id}>)`,
            color: '#2b2d31',
            thumbnail: avatarUrl
          });
          await logServerEvent(guild, 'leaves', leaveEmbed);
        }
      } catch {}
    })().catch(() => null);
  }
};
