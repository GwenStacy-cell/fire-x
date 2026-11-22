import { MessageFlags } from 'discord.js';
import cv2, { sanitizeCV2Payload } from '../cv2.js';
import { NINJA_BULLET, NINJA_BULLET_RTL, BULLET_EMOJI, UPTIME_EMOJI } from '../utils/emojis.js';
import { cleanDisplayName } from '../utils/helpers.js';

export const commands = [
  {
    name: 'avatar',
    aliases: ['av', 'pfp', 'icon'],
    slashHidden: true,
    description: 'Displays the high-resolution global and server avatar of a user.',
    category: 'utility',
    options: [
      {
        name: 'user',
        description: 'The user to get the avatar of',
        type: 6, // USER
        required: false
      }
    ],
    async executePrefix(message) {
      const target = message.mentions.users.first() || message.author;
      const member = message.guild?.members.cache.get(target.id) || await message.guild?.members.fetch(target.id).catch(() => null);
      await sendAvatar(message, target, member);
    },
    async executeSlash(interaction) {
      const target = interaction.options.getUser('user') || interaction.user;
      const member = interaction.guild?.members.cache.get(target.id) || await interaction.guild?.members.fetch(target.id).catch(() => null);
      await sendAvatar(interaction, target, member);
    }
  },
  {
    name: 'banner',
    aliases: ['ubanner', 'userbanner'],
    slashHidden: true,
    description: 'Displays the high-resolution profile banner of a user.',
    category: 'utility',
    options: [
      {
        name: 'user',
        description: 'The user to get the banner of',
        type: 6, // USER
        required: false
      }
    ],
    async executePrefix(message) {
      const target = message.mentions.users.first() || message.author;
      await sendBanner(message, target);
    },
    async executeSlash(interaction) {
      const target = interaction.options.getUser('user') || interaction.user;
      await sendBanner(interaction, target);
    }
  }
];

async function sendAvatar(context, user, member) {
  const globalAvatar = user.displayAvatarURL({ dynamic: true, size: 4096 });
  const serverAvatar = (member && member.avatar) ? member.displayAvatarURL({ dynamic: true, size: 4096 }) : null;
  const cleanName = cleanDisplayName(member?.displayName || user.displayName || user.username);

  const links = [`[Global HD](${globalAvatar})`];
  if (serverAvatar) links.push(`[Server HD](${serverAvatar})`);
  links.push(`[PNG](${user.displayAvatarURL({ format: 'png', size: 4096 })})`);
  links.push(`[WEBP](${user.displayAvatarURL({ format: 'webp', size: 4096 })})`);

  const container = {
    type: 17,
    accent_color: 0x2B2D31,
    components: [
      {
        type: 10,
        content: `# ${NINJA_BULLET} ${cleanName} · Avatar Gallery ${NINJA_BULLET_RTL}\n` +
                 `> -# <a:uptime:1552608831060844575> **User:** <@${user.id}> (\`${user.tag}\`) · **ID:** \`${user.id}\`\n` +
                 `> -# <a:target_blink:1565667466984554588> **Direct Assets:** ${links.join(' · ')}`
      },
      {
        type: 12,
        items: [{ media: { url: serverAvatar || globalAvatar } }]
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# **Athena Prime · High-Resolution Media Resolver**`
      }
    ]
  };

  const payload = sanitizeCV2Payload({
    components: [container],
    flags: MessageFlags.IsComponentsV2
  });

  if (context.reply) {
    await context.reply(payload);
  }
}

async function sendBanner(context, user) {
  const fetchedUser = await user.fetch(true).catch(() => user);
  const bannerUrl = fetchedUser.bannerURL ? fetchedUser.bannerURL({ dynamic: true, size: 4096 }) : null;
  const cleanName = cleanDisplayName(fetchedUser.displayName || fetchedUser.username);

  if (!bannerUrl) {
    const err = cv2.warn('No Banner Found', `${fetchedUser} does not have a custom profile banner set.`);
    if (context.reply) return context.reply(err);
  }

  const links = [
    `[Direct Banner](${bannerUrl})`,
    `[PNG](${fetchedUser.bannerURL({ format: 'png', size: 4096 })})`,
    `[WEBP](${fetchedUser.bannerURL({ format: 'webp', size: 4096 })})`
  ];

  const container = {
    type: 17,
    accent_color: fetchedUser.accentColor || 0x2B2D31,
    components: [
      {
        type: 10,
        content: `# ${NINJA_BULLET} ${cleanName} · Profile Banner ${NINJA_BULLET_RTL}\n` +
                 `> -# <a:uptime:1552608831060844575> **User:** <@${fetchedUser.id}> (\`${fetchedUser.tag}\`) · **ID:** \`${fetchedUser.id}\`\n` +
                 `> -# <a:target_blink:1565667466984554588> **Direct Assets:** ${links.join(' · ')}`
      },
      {
        type: 12,
        items: [{ media: { url: bannerUrl } }]
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# **Athena Prime · High-Resolution Media Resolver**`
      }
    ]
  };

  const payload = sanitizeCV2Payload({
    components: [container],
    flags: MessageFlags.IsComponentsV2
  });

  if (context.reply) {
    await context.reply(payload);
  }
}
