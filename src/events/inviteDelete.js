import { buildServerLogEmbed, logServerEvent } from '../utils/serverLogger.js';
import { formatChannelLink } from '../utils/helpers.js';

export default {
  name: 'inviteDelete',
  async execute(invite) {
    const client = invite.client;
    if (client.invites) {
      const guildInvites = client.invites.get(invite.guild?.id);
      if (guildInvites) {
        guildInvites.delete(invite.code);
      }
    }

    if (!invite.guild) return;

    // Non-blocking server log entry for deleted invites
    (async () => {
      try {
        const channelStr = invite.channel 
          ? formatChannelLink(invite.channel.id, invite.guild) 
          : 'Unknown';

        const invEmbed = buildServerLogEmbed({
          title: 'Invite deleted',
          color: '#F04747',
          attributes: {
            'Code': `\`${invite.code}\``,
            'Channel': channelStr
          },
          client: invite.guild.client
        });
        await logServerEvent(invite.guild, 'invites', invEmbed);
      } catch {}
    })().catch(() => null);
  }
};

