import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  ComponentType,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} from 'discord.js';

import { isBotOwnerSync, isExtraOwner } from '../utils/helpers.js';

export const commands = [
  {
    name: 'vcpanel',
    description: 'Server Owner Voice Control Panel',
    category: 'moderation',
    async executePrefix(message, args) {
      // 1. Permission Check (Guild Owner or Bot Owner only)
      if (message.author.id !== message.guild.ownerId && !isBotOwnerSync(message.author.id) && !isExtraOwner(message.guild.id, message.author.id)) {
        return message.reply({ content: 'Only the Server Owner, Bot Owner, and Extra Owners can use this panel.' }).catch(()=>{});
      }

      // 2. VC Check
      const voiceChannel = message.member.voice.channel;
      if (!voiceChannel) {
        return message.reply("You must be connected to a voice channel to use the Control Panel.");
      }

      // 3. Build UI Function
      const generatePayload = () => {
        const currentMembers = voiceChannel.members;
        const connectedTags = currentMembers.size > 0 ? currentMembers.map(m => `<@${m.id}>`).join(', ') : 'None';
        const guildIconUrl = message.guild.iconURL({ dynamic: true, size: 128 }) || null;

        const headerSection = {
          type: 9,
          components: [{ type: 10, content: `# ${getRandomHeadingGlyph()} **Server Owner Voice | Control Panel**\n` +
            `-# **Server Owner:** <@${message.guild.ownerId}> | **Channel:** <#${voiceChannel.id}>\n` +
            `-# **Connected Members (${currentMembers.size}):** ${connectedTags}`
          }],
          ...(guildIconUrl ? { accessory: { type: 11, media: { url: guildIconUrl } } } : {})
        };

        const controlsText =
          `-# **Button Controls:**\n` +
          `-# \`Mute All\` \`Unmute All\` \`VMute 1\` \`VUnmute 1\`\n` +
          `-# \`VC Kick\` \`VC Ban\` \`VC Kick All\` \`VC Ban All\`\n` +
          `-# \`VC Unban\` \`VC Unban All\`\n` +
          `-# \`Deafen 1\` \`Undeafen 1\` \`Deafen All\` \`Undeafen All\`\n` +
          `-# \`Lock VC\` \`Unlock VC\` \`Hide VC\` \`Unhide VC\``;

        const container = {
          type: 17,
          components: [
            headerSection,
            { type: 14, divider: true },
            { type: 10, content: controlsText },
            { type: 14, divider: true },
            { type: 1, components: [
              { type: 2, custom_id: 'vcp_mute_all', label: 'Mute All', style: 2 },
              { type: 2, custom_id: 'vcp_unmute_all', label: 'Unmute All', style: 2 },
              { type: 2, custom_id: 'vcp_mute_1', label: 'VMute 1', style: 2 },
              { type: 2, custom_id: 'vcp_unmute_1', label: 'VUnmute 1', style: 2 }
            ]},
            { type: 1, components: [
              { type: 2, custom_id: 'vcp_kick_1', label: 'VC Kick', style: 2 },
              { type: 2, custom_id: 'vcp_ban_1', label: 'VC Ban', style: 2 },
              { type: 2, custom_id: 'vcp_kick_all', label: 'VC Kick All', style: 2 },
              { type: 2, custom_id: 'vcp_ban_all', label: 'VC Ban All', style: 2 }
            ]},
            { type: 1, components: [
              { type: 2, custom_id: 'vcp_unban_1', label: 'VC Unban', style: 2 },
              { type: 2, custom_id: 'vcp_unban_all', label: 'VC Unban All', style: 2 }
            ]},
            { type: 1, components: [
              { type: 2, custom_id: 'vcp_deafen_1', label: 'Deafen 1', style: 2 },
              { type: 2, custom_id: 'vcp_undeafen_1', label: 'Undeafen 1', style: 2 },
              { type: 2, custom_id: 'vcp_deafen_all', label: 'Deafen All', style: 2 },
              { type: 2, custom_id: 'vcp_undeafen_all', label: 'Undeafen All', style: 2 }
            ]},
            { type: 1, components: [
              { type: 2, custom_id: 'vcp_lock', label: 'Lock VC', style: 2 },
              { type: 2, custom_id: 'vcp_unlock', label: 'Unlock VC', style: 2 },
              { type: 2, custom_id: 'vcp_hide', label: 'Hide VC', style: 2 },
              { type: 2, custom_id: 'vcp_unhide', label: 'Unhide VC', style: 2 }
            ]},
            { type: 14, divider: true },
            { type: 10, content: '-# **Athena Bulletproof Security !!!**' }
          ]
        };

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
      };

      const panelMsg = await message.channel.send(generatePayload());

      // Live Updater for Connected Members
      const voiceUpdateListener = async (oldState, newState) => {
        if (oldState.channelId === voiceChannel.id || newState.channelId === voiceChannel.id) {
          try {
            await panelMsg.edit(generatePayload());
          } catch (err) {
            // Message might be deleted
          }
        }
      };

      message.client.on('voiceStateUpdate', voiceUpdateListener);

          }
  }
];
