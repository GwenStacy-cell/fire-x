import { AttachmentBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import cv2 from '../cv2.js';
import { generateShipImage } from '../utils/shipCanvas.js';

function calculateShipPercentage(id1, id2) {
    // Sort IDs to ensure consistency regardless of who mentions who
    const sortedIds = [id1, id2].sort();
    
    // Combine and hash
    let hash = 0;
    const str = sortedIds[0] + sortedIds[1];
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
    }
    
    // Map to 0-100
    // Math.abs handles negative hashes
    return Math.abs(hash) % 101;
}

export const commands = [
  {
    name: 'ship',
    aliases: ['match', 'lovecalc'],
    description: 'Calculate love compatibility between two users.',
    category: 'engagement',
    async executePrefix(message, args) {
      const mentions = Array.from(message.mentions.users.values());
      
      let user1, user2;
      
      if (mentions.length >= 2) {
          user1 = mentions[0];
          user2 = mentions[1];
      } else if (mentions.length === 1) {
          user1 = message.author;
          user2 = mentions[0];
      } else {
          return message.reply(cv2.warn('Ship Error', 'Please mention one or two users to ship! Example: `!ship @user`'));
      }
      
      if (user1.id === user2.id) {
          return message.reply(cv2.warn('Ship Error', 'You cannot ship a user with themselves!'));
      }
      
      const percentage = calculateShipPercentage(user1.id, user2.id);
      
      let title, subText;
      if (percentage <= 20) {
          title = 'Terrible Match'; subText = '[ RISK ZONE ]';
      } else if (percentage <= 40) {
          title = 'Poor Match'; subText = '[ LOW COMPATIBILITY ]';
      } else if (percentage <= 60) {
          title = 'Fair Match'; subText = '[ AVERAGE ]';
      } else if (percentage <= 80) {
          title = 'Good Match!'; subText = '[ HIGH MATCH ]';
      } else {
          title = 'Perfect Match!'; subText = '[ SOULMATES ]';
      }
      
      const u1Data = {
          username: user1.displayName || user1.username,
          avatarURL: user1.displayAvatarURL({ extension: 'png', size: 256 })
      };
      const u2Data = {
          username: user2.displayName || user2.username,
          avatarURL: user2.displayAvatarURL({ extension: 'png', size: 256 })
      };
      
      const buffer = await generateShipImage(u1Data, u2Data, percentage);
      const attachment = new AttachmentBuilder(buffer, { name: 'ship.png' });
      
      // We return an EmbedBuilder since our global CV2 interceptor will automatically convert it to a borderless CV2 container!
      const embed = new EmbedBuilder()
          .setTitle('<a:ArrowHeart:1544688958196158525> Ship Result')
          .setDescription(`**<@${user1.id}> x <@${user2.id}>** <a:redrose:1539251705579966557> = **${percentage}% Love**\n\n<a:a_fheartSpinWhite:1533844790314143955> **${title}**`)
          .setImage('attachment://ship.png');
          
      return message.reply({ embeds: [embed], files: [attachment] });
    },
    async executeSlash(interaction) {
      const u1 = interaction.options.getUser('user1');
      const u2 = interaction.options.getUser('user2') || interaction.user;
      
      let user1 = u2 === interaction.user ? interaction.user : u1;
      let user2 = u2 === interaction.user ? u1 : u2;
      
      if (user1.id === user2.id) {
          return interaction.reply({ content: 'You cannot ship someone with themselves.', flags: MessageFlags.Ephemeral });
      }
      
      const percentage = calculateShipPercentage(user1.id, user2.id);
      
      let title;
      if (percentage <= 20) title = 'Terrible Match';
      else if (percentage <= 40) title = 'Poor Match';
      else if (percentage <= 60) title = 'Fair Match';
      else if (percentage <= 80) title = 'Good Match!';
      else title = 'Perfect Match!';
      
      const u1Data = {
          username: user1.displayName || user1.username,
          avatarURL: user1.displayAvatarURL({ extension: 'png', size: 256 })
      };
      const u2Data = {
          username: user2.displayName || user2.username,
          avatarURL: user2.displayAvatarURL({ extension: 'png', size: 256 })
      };
      
      const buffer = await generateShipImage(u1Data, u2Data, percentage);
      const attachment = new AttachmentBuilder(buffer, { name: 'ship.png' });
      
      const embed = new EmbedBuilder()
          .setTitle('<a:ArrowHeart:1544688958196158525> Ship Result')
          .setDescription(`**<@${user1.id}> x <@${user2.id}>** <a:redrose:1539251705579966557> = **${percentage}% Love**\n\n<a:a_fheartSpinWhite:1533844790314143955> **${title}**`)
          .setImage('attachment://ship.png');
          
      return interaction.reply({ embeds: [embed], files: [attachment] });
    }
  }
];
