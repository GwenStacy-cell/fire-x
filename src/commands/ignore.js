import { PermissionFlagsBits } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';

export const commands = [
  {
    name: 'ignore',
    aliases: ['ign'],
    description: 'Manage the Command & Channel Ignore System.',
    category: 'security',
    permissions: [PermissionFlagsBits.Administrator],
    options: [],
    async executePrefix(message, args) {
      const type = args[0]?.toLowerCase();
      
      if (!type) {
        return message.reply(cv2.warn('Ignore System Usage', `\`!ignore channel #channel\`\n\`!ignore channel remove #channel\`\n\`!ignore channel list\`\n\`!ignore category <id>\`\n\`!ignore category remove <id>\`\n\`!ignoreall\`\n\`!unignoreall\``));
      }

      const guildId = message.guild.id;

      if (type === 'channel') {
        const action = args[1]?.toLowerCase();
        let targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1] || args[2]);
        
        if (action === 'list') {
          const channels = db.getIgnoredChannels(guildId);
          if (channels.length === 0) return message.reply(cv2.info('Ignored Channels', 'There are no ignored channels in this server.'));
          if (channels.includes('ALL')) return message.reply(cv2.info('Ignored Channels', 'All text channels are currently ignored (`!ignoreall`).'));
          
          const listStr = channels.map(id => `<#${id}>`).join('\n');
          return message.reply(cv2.info('Ignored Channels', listStr));
        }
        
        if (action === 'remove') {
          targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[2]);
          if (!targetChannel) return message.reply(cv2.warn('Error', 'Please mention a channel to unignore.'));
          
          let channels = db.getIgnoredChannels(guildId);
          if (!channels.includes(targetChannel.id)) return message.reply(cv2.warn('Error', `Channel <#${targetChannel.id}> is not in the ignore list.`));
          
          channels = channels.filter(id => id !== targetChannel.id);
          db.updateIgnoredChannels(guildId, channels);
          return message.reply(cv2.success('Channel Unignored', `Bot commands are now enabled in <#${targetChannel.id}>.`));
        }

        // Add
        if (!targetChannel) return message.reply(cv2.warn('Error', 'Please mention a channel to ignore.'));
        let channels = db.getIgnoredChannels(guildId);
        if (channels.includes(targetChannel.id)) return message.reply(cv2.warn('Error', `Channel <#${targetChannel.id}> is already ignored.`));
        
        channels.push(targetChannel.id);
        db.updateIgnoredChannels(guildId, channels);
        return message.reply(cv2.success('Channel Ignored', `Bot commands will now be ignored in <#${targetChannel.id}>.`));
      }
      
      if (type === 'category') {
        const action = args[1]?.toLowerCase();
        
        if (action === 'remove') {
          const catId = args[2];
          if (!catId) return message.reply(cv2.warn('Error', 'Please provide a category ID to unignore.'));
          
          let cats = db.getIgnoredCategories(guildId);
          if (!cats.includes(catId)) return message.reply(cv2.warn('Error', `Category \`${catId}\` is not in the ignore list.`));
          
          cats = cats.filter(id => id !== catId);
          db.updateIgnoredCategories(guildId, cats);
          return message.reply(cv2.success('Category Unignored', `Bot commands are now enabled in category \`${catId}\`.`));
        }

        const catId = args[1];
        if (!catId) return message.reply(cv2.warn('Error', 'Please provide a category ID to ignore.'));
        
        let cats = db.getIgnoredCategories(guildId);
        if (cats.includes(catId)) return message.reply(cv2.warn('Error', `Category \`${catId}\` is already ignored.`));
        
        cats.push(catId);
        db.updateIgnoredCategories(guildId, cats);
        return message.reply(cv2.success('Category Ignored', `Bot commands will now be ignored in category \`${catId}\`.`));
      }

      return message.reply(cv2.warn('Invalid Option', 'Valid options: `channel`, `category`.'));
    },
    async executeSlash(interaction) {
      await interaction.reply(cv2.warn('Command Error', 'This command is prefix-only.'));
    }
  },
  {
    name: 'ignorechan',
    aliases: ['ignchan', 'ignorechannel'],
    category: 'security',
    permissions: [PermissionFlagsBits.Administrator],
    async executePrefix(message, args) {
      // route to ignore channel
      args.unshift('channel');
      const cmd = (await import('./ignore.js')).commands.find(c => c.name === 'ignore');
      await cmd.executePrefix(message, args);
    }
  },
  {
    name: 'ignorecat',
    aliases: ['igncat', 'ignorecategory'],
    category: 'security',
    permissions: [PermissionFlagsBits.Administrator],
    async executePrefix(message, args) {
      // route to ignore category
      args.unshift('category');
      const cmd = (await import('./ignore.js')).commands.find(c => c.name === 'ignore');
      await cmd.executePrefix(message, args);
    }
  },
  {
    name: 'ignoreall',
    aliases: ['ignall'],
    description: 'Ignore all text channels server-wide.',
    category: 'security',
    permissions: [PermissionFlagsBits.Administrator],
    async executePrefix(message) {
      const guildId = message.guild.id;
      let channels = db.getIgnoredChannels(guildId);
      if (channels.includes('ALL')) return message.reply(cv2.warn('Error', 'All channels are already ignored.'));
      channels.push('ALL');
      db.updateIgnoredChannels(guildId, channels);
      return message.reply(cv2.success('Ignore All Enabled', 'Bot commands will now be ignored in ALL channels server-wide.\n-# <:emoji_16:1533860111704002665> **Note:** Admins are immune.'));
    }
  },
  {
    name: 'unignoreall',
    aliases: ['unignall'],
    description: 'Unignore all text channels server-wide.',
    category: 'security',
    permissions: [PermissionFlagsBits.Administrator],
    async executePrefix(message) {
      const guildId = message.guild.id;
      db.updateIgnoredChannels(guildId, []);
      db.updateIgnoredCategories(guildId, []);
      return message.reply(cv2.success('Ignore All Disabled', 'Bot commands are now enabled in all channels and categories.'));
    }
  }
];
