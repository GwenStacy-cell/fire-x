import { EmbedBuilder } from 'discord.js';
import { getCachedGif } from '../utils/roleplayEngine.js';

const DATE_MESSAGES = [
  "are enjoying a beautiful, intimate evening together <:emoji_120:1525088728840802304>",
  "escaped the world for a perfect, intimate date <:emoji_120:1525088728840802304>",
  "are sharing a deeply intimate and lovely moment... <:emoji_120:1525088728840802304>",
  "look absolutely adorable on their intimate date tonight <:emoji_120:1525088728840802304>",
  "are having a magical, intimate moment just between the two of them <:emoji_120:1525088728840802304>"
];

export const commands = [
  {
    name: 'date',
    slashHidden: true,
    description: 'Go on a special date with someone!',
    aliases: ['go-on-date'],
    hidden: true, // Makes it a prefix-only command

    async executePrefix(message, args) {
      if (!args.length && !message.mentions.users.size) {
        return message.reply("Please mention a user you want to go on a date with!");
      }

      let targetUser = message.mentions.users.first();
      
      if (!targetUser) {
        // Try to fetch by ID
        const targetId = args[0].replace(/[^0-9]/g, '');
        if (targetId) {
          targetUser = await message.client.users.fetch(targetId).catch(() => null);
        }
      }

      if (!targetUser) {
        return message.reply("Could not find that user! Make sure to mention them or provide a valid ID.");
      }

      const targetMember = await message.guild?.members.fetch(targetUser.id).catch(() => null);
      const authorName = message.member?.nickname || message.author.displayName;
      const targetName = targetMember?.nickname || targetUser.displayName;

      const randomMsg = DATE_MESSAGES[Math.floor(Math.random() * DATE_MESSAGES.length)];
      const text = `**${authorName}** and **${targetName}** ${randomMsg}`;

      const gifUrl = await getCachedGif('date');

      const embed = new EmbedBuilder()
        .setColor(0xFF1493) // Brighter neon DeepPink
        .setTitle('<a:redrose:1539251705579966557> A Romantic Date')
        .setDescription(text)
        .setFooter({ text: `Sparks are flying between ${authorName} and ${targetName}...` });

      if (gifUrl) {
        embed.setImage(gifUrl);
      }

      await message.reply({ embeds: [embed] });
    }
  }
];
