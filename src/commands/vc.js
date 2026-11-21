import { PermissionFlagsBits } from 'discord.js';
import cv2 from '../cv2.js';
import { isAuthorized } from '../utils/helpers.js';

export const commands = [
  {
    name: 'vclock',
    aliases: ['lockvc', 'vclockdown', 'vcl'],
    description: 'Locks a voice channel by denying Connect and text permissions to @everyone.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageChannels],
    options: [
      {
        name: 'channel',
        description: 'The voice channel to lock (defaults to your current VC)',
        type: 7,
        required: false
      }
    ],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) {
        return message.reply(cv2.error('Unauthorized', 'You do not have permission to use this command.'));
      }
      
      const args = message.content.trim().split(/ +/).slice(1);
      let vc = message.member.voice.channel;
      
      if (args[0]) {
        const parsedId = args[0].replace(/<#|>/g, '');
        const targetChannel = message.guild.channels.cache.get(parsedId);
        if (targetChannel && targetChannel.isVoiceBased()) {
          vc = targetChannel;
        } else {
          return message.reply(cv2.error('Error', 'Invalid voice channel provided.'));
        }
      }
      
      if (!vc) return message.reply(cv2.error('Error', 'You must be in a voice channel or provide a valid voice channel ID.'));
      
      try {
        await vc.permissionOverwrites.edit(message.guild.roles.everyone, {
          Connect: false,
          SendMessages: false,
          ReadMessageHistory: false
        });
        await message.reply(cv2.success('VC Locked', `**${vc.name}** has been locked.`));
      } catch (err) {
        await message.reply(cv2.error('Error', 'Failed to lock the voice channel. Check my permissions.'));
      }
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.error('Unauthorized', 'You do not have permission.')).catch(() => null);
      }
      
      const targetChannel = interaction.options.getChannel('channel');
      const vc = targetChannel && targetChannel.isVoiceBased() ? targetChannel : interaction.member?.voice?.channel;
      
      if (!vc) return interaction.reply(cv2.error('Error', 'You must be in a voice channel or select one.'));
      
      try {
        await vc.permissionOverwrites.edit(interaction.guild.roles.everyone, {
          Connect: false,
          SendMessages: false,
          ReadMessageHistory: false
        });
        await interaction.reply(cv2.success('VC Locked', `**${vc.name}** has been locked.`));
      } catch (err) {
        await interaction.reply(cv2.error('Error', 'Failed to lock.'));
      }
    }
  },
  {
    name: 'vcunlock',
    aliases: ['unlockvc', 'vcunl'],
    description: 'Unlocks a voice channel for @everyone.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageChannels],
    options: [
      {
        name: 'channel',
        description: 'The voice channel to unlock (defaults to your current VC)',
        type: 7,
        required: false
      }
    ],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      
      const args = message.content.trim().split(/ +/).slice(1);
      let vc = message.member.voice.channel;
      
      if (args[0]) {
        const parsedId = args[0].replace(/<#|>/g, '');
        const targetChannel = message.guild.channels.cache.get(parsedId);
        if (targetChannel && targetChannel.isVoiceBased()) {
          vc = targetChannel;
        } else {
          return message.reply(cv2.error('Error', 'Invalid voice channel provided.'));
        }
      }
      
      if (!vc) return message.reply(cv2.error('Error', 'You must be in a voice channel or provide a valid voice channel ID.'));
      
      try {
        await vc.permissionOverwrites.edit(message.guild.roles.everyone, {
          Connect: null,
          SendMessages: null,
          ReadMessageHistory: null
        });
        await message.reply(cv2.success('VC Unlocked', `**${vc.name}** has been unlocked.`));
      } catch (err) {
        await message.reply(cv2.error('Error', 'Failed to unlock.'));
      }
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.error('Unauthorized', 'You do not have permission.')).catch(() => null);
      }
      
      const targetChannel = interaction.options.getChannel('channel');
      const vc = targetChannel && targetChannel.isVoiceBased() ? targetChannel : interaction.member?.voice?.channel;
      
      if (!vc) return interaction.reply(cv2.error('Error', 'You must be in a voice channel or select one.'));
      
      try {
        await vc.permissionOverwrites.edit(interaction.guild.roles.everyone, {
          Connect: null,
          SendMessages: null,
          ReadMessageHistory: null
        });
        await interaction.reply(cv2.success('VC Unlocked', `**${vc.name}** has been unlocked.`));
      } catch (err) {
        await interaction.reply(cv2.error('Error', 'Failed to unlock.'));
      }
    }
  },
  {
    name: 'deafenall',
    aliases: ['vcdeafenall', 'serverdeafenall'],
    description: 'Deafens all members in your current voice channel.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.DeafenMembers],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      const vc = message.member.voice.channel;
      if (!vc) return message.reply(cv2.error('Error', 'You must be in a voice channel.'));
      
      let count = 0;
      for (const [id, member] of vc.members) {
        if (!member.voice.serverDeaf && !member.user.bot) {
          try {
            await member.voice.setDeaf(true);
            count++;
          } catch(e) {}
        }
      }
      await message.reply(cv2.success('Success', `Deafened **${count}** members in **${vc.name}**.`));
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.error('Unauthorized', 'You do not have permission.')).catch(() => null);
      }
      const vc = interaction.member?.voice?.channel;
      if (!vc) return interaction.reply(cv2.error('Error', 'You must be in a voice channel.'));
      
      await interaction.deferReply({ ephemeral: false });
      await interaction.editReply(cv2.info('Deafen All', 'Initiating mass deafen...')).catch(() => null);

      let count = 0;
      const promises = [];
      vc.members.forEach(member => {
        if (!member.voice.serverDeaf && !member.user.bot) {
          promises.push(
            member.voice.setDeaf(true)
              .then(() => {
                count++;
                if (count % 15 === 0) {
                  interaction.editReply(cv2.info('Deafen All', `Deafening in progress...\n\n Deafened: **${count}**`)).catch(() => null);
                }
              })
              .catch(() => null)
          );
        }
      });
      
      await Promise.all(promises);
      await interaction.editReply(cv2.success('Success', `Deafened **${count}** members in **${vc.name}**.`)).catch(() => null);
    }
  },
  {
    name: 'undeafenall',
    aliases: ['vcundeafenall', 'serverundeafenall'],
    description: 'Undeafens all members in your current voice channel.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.DeafenMembers],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      const vc = message.member.voice.channel;
      if (!vc) return message.reply(cv2.error('Error', 'You must be in a voice channel.'));
      
      let count = 0;
      for (const [id, member] of vc.members) {
        if (member.voice.serverDeaf) {
          try {
            await member.voice.setDeaf(false);
            count++;
          } catch(e) {}
        }
      }
      await message.reply(cv2.success('Success', `Undeafened **${count}** members in **${vc.name}**.`));
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.error('Unauthorized', 'You do not have permission.')).catch(() => null);
      }
      const vc = interaction.member?.voice?.channel;
      if (!vc) return interaction.reply(cv2.error('Error', 'You must be in a voice channel.'));
      
      await interaction.deferReply({ ephemeral: false });
      await interaction.editReply(cv2.info('Undeafen All', 'Initiating mass undeafen...')).catch(() => null);

      let count = 0;
      const promises = [];
      vc.members.forEach(member => {
        if (member.voice.serverDeaf) {
          promises.push(
            member.voice.setDeaf(false)
              .then(() => {
                count++;
                if (count % 15 === 0) {
                  interaction.editReply(cv2.info('Undeafen All', `Undeafening in progress...\n\n Undeafened: **${count}**`)).catch(() => null);
                }
              })
              .catch(() => null)
          );
        }
      });
      
      await Promise.all(promises);
      await interaction.editReply(cv2.success('Success', `Undeafened **${count}** members in **${vc.name}**.`)).catch(() => null);
    }
  }
];
