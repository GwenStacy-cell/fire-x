import db from '../database.js';
import cv2 from '../cv2.js';
import commandMap from './loader.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { isExtraOwnerOrHigher } from '../utils/helpers.js';

export const commands = [
  {
    name: 'ccmd',
    aliases: ['customcmd', 'alias', 'short'],
    description: 'Create shortcuts for existing commands and manage access.',
    category: 'utilities',
    options: [],
    async executePrefix(message, args) {
    const e = message.client.emojis.cache.find(emoji => emoji.name === 'customcmds');
    const customcmdsEmoji = e ? `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>` : '<:config:1533844853048209489>';

      const config = db.getGuildConfig(message.guild.id);
      const managers = config.ccmdManagers || [];
      const isExtraOwner = isExtraOwnerOrHigher(message.author.id, message.guild);
      const isManager = isExtraOwner || managers.includes(message.author.id);
      
      if (!isManager && args[0]?.toLowerCase() !== 'list') {
        return message.reply(cv2.danger('Access Denied', 'Only Extra Owners, Server Owner, or Granted Users can manage custom commands.'));
      }
      
      if (args.length === 0) {
        return message.reply(cv2.warn('Custom Commands', 'Usage:\n`!ccmd create <short> <command>`\n`!ccmd delete <short>`\n`!ccmd list`\n`!ccmd grant @user`\n`!ccmd revoke @user`\n`!ccmd access`'));
      }
      
      const action = args[0].toLowerCase();
      const ccmds = config.customCommands || {};

      if (action === 'create' || action === 'add') {
        if (args.length < 3) return message.reply(cv2.warn('Invalid Usage', 'Usage: `!ccmd create <short> <actual_command>`'));
        const alias = args[1].toLowerCase();
        const actual = args.slice(2).join(' ').toLowerCase();
        
        if (!commandMap.has(actual.split(' ')[0])) {
          return message.reply(cv2.danger('Command Not Found', `The command \`${actual.split(' ')[0]}\` does not exist in Athena.`));
        }
        if (commandMap.has(alias)) {
          return message.reply(cv2.danger('Alias Conflict', `The alias \`${alias}\` is already a built-in Athena command.`));
        }
        
        ccmds[alias] = actual;
        db.updateGuildConfig(message.guild.id, { customCommands: ccmds });
        return message.reply(cv2.success('Shortcut Created', `Typing \`!${alias}\` will now execute \`!${actual}\`.`));
      }
      else if (action === 'delete' || action === 'remove') {
        if (args.length < 2) return message.reply(cv2.warn('Invalid Usage', 'Usage: `!ccmd delete <short>`'));
        const alias = args[1].toLowerCase();
        if (!ccmds[alias]) return message.reply(cv2.danger('Shortcut Not Found', `The shortcut \`${alias}\` does not exist.`));
        
        delete ccmds[alias];
        db.updateGuildConfig(message.guild.id, { customCommands: ccmds });
        return message.reply(cv2.success('Shortcut Deleted', `\`!${alias}\` shortcut removed.`));
      }
      else if (action === 'grant') {
        if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
             return message.reply(cv2.danger('Access Denied', 'Only Extra Owners or the Server Owner can grant access to custom commands.'));
        }
        const target = message.mentions.users.first();
        if (!target) return message.reply(cv2.warn('Missing User', 'Please mention a user to grant access.'));
        if (managers.includes(target.id)) return message.reply(cv2.info('Already Granted', 'This user already has access.'));
        
        managers.push(target.id);
        db.updateGuildConfig(message.guild.id, { ccmdManagers: managers });
        
        const container = {
            type: 17,
            components: [
                { type: 10, content: `# ${customcmdsEmoji} Ccmd\n\n> -# **Granted custom command access to <@${target.id}> .**` }
            ]
        };
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }
      else if (action === 'revoke') {
        if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
             return message.reply(cv2.danger('Access Denied', 'Only Extra Owners or the Server Owner can revoke access to custom commands.'));
        }
        const target = message.mentions.users.first();
        if (!target) return message.reply(cv2.warn('Missing User', 'Please mention a user to revoke access.'));
        if (!managers.includes(target.id)) return message.reply(cv2.info('Not Granted', 'This user does not have access.'));
        
        const newManagers = managers.filter(id => id !== target.id);
        db.updateGuildConfig(message.guild.id, { ccmdManagers: newManagers });
        return message.reply(cv2.success('Access Revoked', `<@${target.id}> no longer has access to custom commands.`));
      }
      else if (action === 'access') {
        let text = `# ${customcmdsEmoji} Custom Commands | Granted Access List\n\n`;
        if (managers.length === 0) {
            text += `> -# **No users have been granted special access.**`;
        } else {
            for (const id of managers) {
                text += `> -# • <@${id}> (Highly Dangerous (HD))\n`;
            }
        }
        
        const container = {
            type: 17,
            components: [
                { type: 10, content: text.trim() },
                { type: 14, divider: true },
                { type: 10, content: `-# **Athena Custom Command Manager**` }
            ]
        };
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }
      else if (action === 'list') {
        const keys = Object.keys(ccmds);
        
        let text = `# ${customcmdsEmoji} Custom Commands | Server Shortcuts\n\n`;
        text += `> -# **Server:** ${message.guild.name} ( \`${message.guild.id}\` ) | **Total:** \`${keys.length}\` Shortcuts\n> \n`;
        
        if (keys.length === 0) {
            text += `> -# **No custom command shortcuts have been set for this server.**`;
        } else {
            let i = 1;
            for (const k of keys) {
                text += `> -# **${i}.** \`${k}\` \u2192 **${ccmds[k]}**\n`;
                i++;
            }
        }
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ccmd_prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('ccmd_close').setLabel('Close').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('ccmd_next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        
        const container = {
            type: 17,
            components: [
                { type: 10, content: text.trim() },
                { type: 14, divider: true },
                { type: 10, content: `-# **Athena Custom Command Manager**` },
                { type: 14, divider: true },
                row.toJSON()
            ]
        };
        
        const reply = await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        const collector = reply.createMessageComponentCollector({ time: 60000 });
        collector.on('collect', async i => {
            if (i.customId === 'ccmd_close') {
                if (i.user.id !== message.author.id) return i.reply({ content: 'Not your menu', ephemeral: true });
                await reply.delete().catch(() => null);
            }
        });
      }
    }
  }
];
