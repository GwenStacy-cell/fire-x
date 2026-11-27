import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} from 'discord.js';
import cv2 from '../cv2.js';
import {
  TICK_EMOJI,
  WRONG_EMOJI,
  WARN_EMOJI,
  BULLET_EMOJI,
  UPTIME_EMOJI
} from '../utils/emojis.js';
import { formatUserLink, cleanDisplayName } from '../utils/helpers.js';
import {
  createMagicLoginToken,
  getGuildClearance,
  getAccessibleGuilds
} from '../web/auth.js';

function buildPrivateMagicCard(user, guild, magic, clearance) {
  const guildLabel = guild ? `**${cleanDisplayName(guild.name)}**` : 'All Accessible Servers';
  const roleBadge = clearance?.roleLabel || 'AUTHORIZED OPERATOR';
  const expUnix = Math.floor(magic.expiresAt / 1000);
  const isLocalFallback = /^http:\/\/localhost:/i.test(magic.url);

  const lines = [
    `> -# ${UPTIME_EMOJI} **Athena Prime Web Control Plane • Passwordless Auth**`,
    `> -# ${BULLET_EMOJI} **Operator:** ${formatUserLink(user, guild)} (\`${roleBadge}\`)`,
    `> -# ${BULLET_EMOJI} **Default Guild:** ${guildLabel}`,
    `> -# ${BULLET_EMOJI} **Expires:** <t:${expUnix}:R> (**Single-Use Link**)`,
    ``,
    `> -# ${BULLET_EMOJI} **Manual Fallback Token** *(if pasting inside the web login modal)*:`,
    `> -# \`${magic.token}\``
  ];

  if (isLocalFallback) {
    lines.push(
      ``,
      `> -# ${WARN_EMOJI} *Base URL note:* Open your hosted dashboard URL once in browser or set \`DASHBOARD_BASE_URL\` in environment variables so this button points directly to your host domain/port.`
    );
  }

  lines.push(
    ``,
    `> -# ${WARN_EMOJI} **Security Advisory:** Never share or forward this URL/token — it grants authenticated web dashboard access matching your Discord clearance tier.`
  );

  const card = cv2.card(
    `Athena Web Control Plane Login | ${TICK_EMOJI}`,
    lines.join('\n'),
    [],
    'Athena Prime Security Suite • Zero-Secret Magic Auth'
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Open Athena Web Dashboard')
      .setStyle(ButtonStyle.Link)
      .setURL(magic.url)
  );

  return {
    ...card,
    components: [...card.components, row.toJSON()]
  };
}

export const commands = [
  {
    name: 'weblogin',
    aliases: ['webpanel', 'dashboardlogin', 'weblink', 'magiclink', 'weblog', 'panelauth'],
    description: 'Generate a single-use 5-minute passwordless login link for the Athena Web Control Plane.',
    category: 'security',
    options: [],

    async executePrefix(message) {
      const user = message.author;
      const guild = message.guild || null;

      let clearance = null;
      if (guild) {
        clearance = await getGuildClearance(guild, user.id, { fetchMember: true });
      } else {
        const guilds = await getAccessibleGuilds(message.client, user.id);
        if (guilds.length > 0) {
          clearance = { roleLabel: guilds[0].roleLabel };
        }
      }

      if (!clearance) {
        return message.reply(cv2.danger(
          `Access Denied | ${WRONG_EMOJI}`,
          `${formatUserLink(user, guild)} Web Dashboard login is restricted to **Server Owners**, **Extra Owners**, **Server Admins** (\`Manage Server\` / \`Administrator\`), and **Bot Owners**.`
        )).catch(() => null);
      }

      const magic = createMagicLoginToken(user.id, guild?.id || null);
      const dmPayload = buildPrivateMagicCard(user, guild, magic, clearance);

      try {
        await user.send(dmPayload);
        return message.reply(cv2.success(
          `Web Dashboard Magic Link Sent | ${TICK_EMOJI}`,
          `> -# ${UPTIME_EMOJI} Dispatched a single-use login link privately to ${formatUserLink(user, guild)}'s **Direct Messages**.\n` +
          `> -# ${BULLET_EMOJI} **Clearance:** \`${clearance.roleLabel}\`\n` +
          `> -# ${BULLET_EMOJI} **Expires:** <t:${Math.floor(magic.expiresAt / 1000)}:R>\n\n` +
          `> -# ${WARN_EMOJI} *Never forward your DM link to anyone. Use \`/weblogin\` if you prefer an in-channel private message.*`
        )).catch(() => null);
      } catch {
        return message.reply(cv2.warn(
          `Direct Messages Closed | ${WARN_EMOJI}`,
          `${formatUserLink(user, guild)} could not receive a private DM from Athena Prime.\n\n` +
          `> -# ${BULLET_EMOJI} Enable **Direct Messages** for this server in Privacy Settings, **OR** run \`/weblogin\` directly in this channel to receive an **ephemeral** login button visible only to you.`
        )).catch(() => null);
      }
    },

    async executeSlash(interaction) {
      const user = interaction.user;
      const guild = interaction.guild || null;

      let clearance = null;
      if (guild) {
        clearance = await getGuildClearance(guild, user.id, { fetchMember: true });
      } else {
        const guilds = await getAccessibleGuilds(interaction.client, user.id);
        if (guilds.length > 0) {
          clearance = { roleLabel: guilds[0].roleLabel };
        }
      }

      if (!clearance) {
        return interaction.reply({
          ...cv2.danger(
            `Access Denied | ${WRONG_EMOJI}`,
            `${formatUserLink(user, guild)} Web Dashboard login is restricted to **Server Owners**, **Extra Owners**, **Server Admins** (\`Manage Server\` / \`Administrator\`), and **Bot Owners**.`
          ),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        }).catch(() => null);
      }

      const magic = createMagicLoginToken(user.id, guild?.id || null);
      const privatePayload = buildPrivateMagicCard(user, guild, magic, clearance);

      return interaction.reply({
        ...privatePayload,
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      }).catch(() => null);
    }
  }
];
