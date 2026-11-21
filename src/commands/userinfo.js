import { EmbedBuilder } from 'discord.js';
import cv2 from '../cv2.js';

export const commands = [
  {
    name: 'avatar',
    aliases: ['av', 'pfp', 'icon'],
    slashHidden: true,
    description: 'Displays the global and server avatar of a user.',
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
      const member = message.guild.members.cache.get(target.id);
      await sendAvatar(message, target, member);
    },
    async executeSlash(interaction) {
      const target = interaction.options.getUser('user') || interaction.user;
      const member = interaction.guild.members.cache.get(target.id);
      await sendAvatar(interaction, target, member);
    }
  },
  {
    name: 'banner',
    aliases: ['ubanner', 'userbanner'],
    slashHidden: true,
    description: 'Displays the banner of a user.',
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
  const e = new EmbedBuilder()
    .setColor('#2B2D31')
    .setTitle(`${user.username}'s Avatar`)
    .setImage(globalAvatar)
    .setFooter({ text: `Requested by ${context.author ? context.author.tag : context.user.tag}` });

  if (member && member.avatar) {
    const serverAvatar = member.displayAvatarURL({ dynamic: true, size: 4096 });
    e.setDescription(`[Global Avatar](${globalAvatar}) | [Server Avatar](${serverAvatar})`);
    e.setThumbnail(serverAvatar);
  } else {
    e.setDescription(`[Global Avatar](${globalAvatar})`);
  }

  if (context.reply) {
    await context.reply({ embeds: [e] });
  }
}

async function sendBanner(context, user) {
  // We must fetch the user to get the banner
  const fetchedUser = await user.fetch(true);
  const bannerUrl = fetchedUser.bannerURL({ dynamic: true, size: 4096 });

  if (!bannerUrl) {
    const err = cv2.warn('No Banner', `${fetchedUser.username} does not have a custom profile banner.`);
    if (context.reply) return context.reply(err);
  }

  const e = new EmbedBuilder()
    .setColor(fetchedUser.hexAccentColor || '#2B2D31')
    .setTitle(`${fetchedUser.username}'s Banner`)
    .setDescription(`[Banner Link](${bannerUrl})`)
    .setImage(bannerUrl)
    .setFooter({ text: `Requested by ${context.author ? context.author.tag : context.user.tag}` });

  if (context.reply) {
    await context.reply({ embeds: [e] });
  }
}
