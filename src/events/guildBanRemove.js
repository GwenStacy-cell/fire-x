import { AuditLogEvent } from 'discord.js';
import { directStrike, rawBan } from '../utils/antinuke.js';

export default {
  name: 'guildBanRemove',
  async execute(ban) {
    if (!ban?.guild || !ban?.user?.id) return;
    if (ban.user.id === ban.guild.client.user.id) return;

    directStrike(
      ban.guild,
      AuditLogEvent.MemberBanRemove,
      'Unauthorized Ban Removal',
      ban.user.id,
      async () => {
        await rawBan(ban.guild.id, ban.user.id, ban.guild.client.token, '[ATHENA ANTI-NUKE] Re-applying unauthorized removed ban').catch(() => null);
      }
    ).catch(() => null);
  }
};
