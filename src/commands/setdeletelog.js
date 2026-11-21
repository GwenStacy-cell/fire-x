import { PermissionFlagsBits } from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';

export const commands = [
  {
    name: 'setdeletelog',
    aliases: ['deletelog', 'msgdeletelog'],
    description: 'Set a channel to log deleted messages.',
    category: 'utility',
    permissions: [PermissionFlagsBits.Administrator],
    async executePrefix(message, args) {
      try {
        const channel = message.mentions.channels.first();
        if (!channel) {
          return await message.reply(cv2.warn('Error', 'Please mention a valid channel.')).catch(() => null);
        }

        const guild = message.guild;
        const config = db.getGuildConfig(guild.id);
        const sl = config.serverLogs;
        
        sl.modules.msgDeletes.channelId = channel.id;
        sl.modules.msgDeletes.enabled = true;
        sl.enabled = true; // Auto-enable master switch
        
        db.updateGuildConfig(guild.id, { serverLogs: sl });
        
        const res = cv2.success('Ghost Ping & Sniper Logs Set', `<:Dark4luvontop:1533860091818803242> **Ghost Pings** and **Deleted Messages** will now be routed to <#${channel.id}>.`);
        await message.reply(res).catch(() => null);
      } catch (error) {
        console.error('Error in setdeletelog:', error);
      }
    }
  }
];
