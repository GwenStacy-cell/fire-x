import { ChannelType, PermissionFlagsBits, MessageFlags } from 'discord.js';
import db from '../database.js';
import { isBotOwnerSync } from '../utils/helpers.js';
import cv2 from '../cv2.js';
import { startRecording, stopRecording } from '../utils/audioRecorder.js';

export const commands = [
  {
    name: 'record',
    slashHidden: true,
    description: 'Setup the voice logging channel or start a real voice recording',
    aliases: ['voicelog', 'vclogs', 'setuplogs'],
    async executePrefix(message, args) {
      const isOwner = isBotOwnerSync(message.author.id);
      if (message.guild && !message.member.permissions.has(PermissionFlagsBits.Administrator) && !isOwner) {
        return message.channel.send(cv2.error('Permission Denied', 'You need Administrator permissions to use this command.'));
      }
      if (!message.guild && !isOwner) {
        return message.channel.send(cv2.error('Permission Denied', 'This command can only be used remotely by the Bot Owner.'));
      }

      const sub = args[0] ? args[0].toLowerCase() : '';

      if (sub === 'start') {
        let vc = message.member?.voice?.channel;
        const target = args[1];
        if (target) {
            // Check if it's a channel
            const targetId = target.replace(/<#|@!|@|>/g, '');
            const channel = message.client.channels.cache.get(targetId);
            if (channel && channel.isVoiceBased()) {
                vc = channel;
            } else {
                // Check if it's a user
                let globalVc = null;
                message.client.guilds.cache.forEach(g => {
                    const mem = g.members.cache.get(targetId);
                    if (mem && mem.voice.channel) globalVc = mem.voice.channel;
                });
                if (globalVc) vc = globalVc;
            }
        }
        
        if (!vc) return message.reply(cv2.error('<:off:1533844858983157851> Failed', 'You must be in a Voice Channel to start a recording session, or provide a valid Channel ID / User ID as a target.'));
        
        const targetGuild = vc.guild;
        try {
          await startRecording(vc);
          const container = {
            type: 17,
            components: [
              { type: 10, content: `## Voice Recording Started | <a:03_tick_circle:1565665642084827206>\n\n-# Channel: 🔊 **${vc.name}** | Initiated By: ${message.author}\n\n-# Live multi-user audio capture is active.\n-# When finished, run \`!record stop\` or click **Stop & Export** below.\n-# Audio recording will be delivered directly via DM (with channel fallback).` },
              {
                type: 1,
                components: [
                  { type: 2, custom_id: 'record_stop_' + targetGuild.id, label: 'Stop & Export', style: 2 },
                  { type: 2, custom_id: 'record_status_' + targetGuild.id, label: 'Check Status', style: 2 }
                ]
              },
              { type: 14, divider: true },
              { type: 10, content: '-# Athena Bulletproof Security' }
            ]
          };
          return message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
          return message.reply(cv2.error('<:off:1533844858983157851> Failed', err.message));
        }
      }

      if (sub === 'stop') {
        const vc = message.member?.voice?.channel;
        const vcName = vc ? vc.name : 'Voice Channel';
        
        const container = {
          type: 17,
          components: [
            { type: 10, content: `## Voice Recording Stopped | <a:03_tick_circle:1565665642084827206>\n\n-# Channel: 🔊 **${vcName}**\n\n-# Processing and exporting the audio file, please wait...` },
            { type: 14, divider: true },
            { type: 10, content: '-# Athena Bulletproof Security' }
          ]
        };
        const msg = await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
        
        try {
          let targetGuildId = message.guild ? message.guild.id : (args[1] ? args[1] : null);
          if (targetGuildId) {
             const channel = message.client.channels.cache.get(targetGuildId);
             if (channel && channel.guild) targetGuildId = channel.guild.id;
             else {
                 let globalVc = null;
                 message.client.guilds.cache.forEach(g => {
                     const mem = g.members.cache.get(targetGuildId);
                     if (mem && mem.voice.channel) globalVc = mem.voice.channel;
                 });
                 if (globalVc) targetGuildId = globalVc.guild.id;
             }
          }
          if (!targetGuildId) return message.reply("You must specify a valid target (Server ID, Channel ID, or User ID) when stopping remotely from DMs: `!record stop <ID>`");
          const targetGuild = message.client.guilds.cache.get(targetGuildId) || message.guild;
          const result = await stopRecording(targetGuildId);
          if (!result) {
             return msg.edit({ components: [{ type: 17, components: [{ type: 10, content: '-# <:off:1533844858983157851> No active recording found for this server.' }] }] });
          }
          const { mp3Path, startTime, durationMs, userCount } = result;
          
          const durSec = Math.floor(durationMs / 1000);
          const durationStr = `${Math.floor(durSec/60)}m ${durSec%60}s`;
          const startDate = new Date(startTime).toLocaleString('en-US', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
          
          const dmContainer = {
             type: 17,
             components: [
                { type: 10, content: `## Athena Voice Export | <a:03_tick_circle:1565665642084827206>` },
                {
                   type: 9,
                   components: [{ type: 10, content: `-# **Server :** **${targetGuild ? targetGuild.name : 'Unknown'}**\n-# **Channel :** **${vcName}**\n-# **Started At :** **${startDate}**\n-# **Duration :** **${durationStr}**\n-# **Speakers Detected :** **${userCount || 1}**` }],
                   accessory: { type: 11, media: { url: (targetGuild ? targetGuild.iconURL({ dynamic: true }) : null) || 'https://i.imgur.com/8Qj85vP.png' } }
                },
                { type: 14, divider: true },
                { type: 10, content: `-# **Audio file is attached below.**` }
             ]
          };
          
          const fs = await import('fs');
          const { AttachmentBuilder } = await import('discord.js');
          const audioBuffer = fs.readFileSync(mp3Path);
          const cleanServerName = (targetGuild ? targetGuild.name : 'Server').replace(/[^a-zA-Z0-9_-]/g, '_');
          const cleanVcName = vcName.replace(/[^a-zA-Z0-9_-]/g, '_');
          const fileName = `${cleanServerName}_${cleanVcName}.mp3`;
          const audioAttachment = new AttachmentBuilder(audioBuffer, { name: fileName });

          let dmDelivered = false;
          try {
            await message.author.send({ components: [dmContainer], flags: MessageFlags.IsComponentsV2 });
            await message.author.send({ content: `-# 🔊 **Playable Voice Recording** (${durationStr})`, files: [audioAttachment] });
            dmDelivered = true;
          } catch (e) {
            dmDelivered = false;
          }

          if (dmDelivered) {
            await msg.edit({ components: [{ type: 17, components: [{ type: 10, content: `-# **Audio Export Successful | <a:03_tick_circle:1565665642084827206>**\n-# Delivered securely to your DMs.` }] }] });
          } else {
            // Deliver in channel when DMs are closed
            const channelExportContainer = {
              type: 17,
              components: [
                { type: 10, content: `## Athena Voice Export | <a:03_tick_circle:1565665642084827206>` },
                {
                  type: 9,
                  components: [{ type: 10, content: `-# **Server :** **${targetGuild ? targetGuild.name : 'Unknown'}**\n-# **Channel :** **${vcName}**\n-# **Started At :** **${startDate}**\n-# **Duration :** **${durationStr}**\n-# **Note :** Your DMs are closed, so the audio was delivered here.` }],
                  accessory: { type: 11, media: { url: (targetGuild ? targetGuild.iconURL({ dynamic: true }) : null) || 'https://i.imgur.com/8Qj85vP.png' } }
                },
                { type: 14, divider: true },
                { type: 10, content: `-# **Audio file is attached below.**` }
              ]
            };
            await message.channel.send({ components: [channelExportContainer], flags: MessageFlags.IsComponentsV2 });
            await message.channel.send({ content: `${message.author}, here is your voice recording:`, files: [audioAttachment] });
            await msg.edit({ components: [{ type: 17, components: [{ type: 10, content: `-# **Audio Export Successful | <a:03_tick_circle:1565665642084827206>**\n-# Delivered in this channel (DMs closed).` }] }] });
          }
          
          try { fs.unlinkSync(mp3Path); } catch(e) {}
        } catch (err) {
          await msg.edit({ components: [{ type: 17, components: [{ type: 10, content: `-# <:off:1533844858983157851> **Recording Failed:** ${err.message}` }] }] });
        }
        return;
      }

      // Default behavior: Setup Voice Logs
      if (!message.guild) return message.reply("Setup can only be run inside a server.");
      try {
        const cfg = db.getGuildConfig(message.guild.id);
        let channel = cfg?.voiceLogChannel
          ? (message.guild.channels.cache.get(cfg.voiceLogChannel) || await message.guild.channels.fetch(cfg.voiceLogChannel).catch(() => null))
          : null;
        if (!channel) {
          channel = await message.guild.channels.create({
            name: 'voice-records',
            type: ChannelType.GuildText,
            topic: 'Automated Voice Join/Leave Records',
            permissionOverwrites: [
              {
                id: message.guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
              }
            ]
          });
          db.updateGuildConfig(message.guild.id, { voiceLogChannel: channel.id });
        }
        message.channel.send(cv2.success('Voice Records Setup', `Successfully setup voice logging in <#${channel.id}>.\nAll VC joins and leaves will be recorded there.`));
      } catch (error) {
        console.error(error);
        message.channel.send(cv2.error('<:off:1533844858983157851> Failed', 'Failed to create the voice records channel. Check my permissions.'));
      }
    }
  }
];
