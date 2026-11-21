import { PermissionFlagsBits } from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { isAuthorized } from '../utils/helpers.js';

export const commands = [
  {
    name: 'theatermode',
    aliases: ['theater', 'tm'],
    description: 'Toggles Theater Mode in the current VC (Auto-mutes/deafens all members).',
    category: 'moderation',
    permissions: [PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers],
    options: [
      {
        name: 'status',
        description: 'Enable or disable Theater Mode',
        type: 3,
        required: true,
        choices: [
          { name: 'Enable', value: 'on' },
          { name: 'Disable', value: 'off' }
        ]
      }
    ],
    async executePrefix(message, args) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      const status = args[0]?.toLowerCase();
      if (status !== 'on' && status !== 'off') {
        return message.reply(cv2.warn('Command Error', `Usage: \`!theatermode <on|off>\``));
      }
      const result = await handleTheaterMode(message.guild, message.member, status, message.client);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.error('Unauthorized', 'You do not have permission to use this command.'));
      }
      await interaction.deferReply();
      const status = interaction.options.getString('status');
      const result = await handleTheaterMode(interaction.guild, interaction.member, status, interaction.client);
      await interaction.editReply(result);
    }
  }
];

async function handleTheaterMode(guild, moderator, status, client) {
  const userId = moderator?.user?.id || moderator?.id;
  const fullModerator = await guild.members.fetch(userId).catch(() => moderator);
  const vc = fullModerator?.voice?.channel;
  if (!vc && status === 'on') {
    return cv2.error('Error', 'You must be in a Voice Channel to activate Theater Mode.');
  }

  const enabled = status === 'on';
  let cfg = db.getGuildConfig(guild.id);

  if (enabled) {
    db.updateGuildConfig(guild.id, { theaterModeVcId: vc.id });
    
    // Auto-mute and deafen everyone currently in the VC (except authorized users)
    let affectedCount = 0;
    for (const [id, member] of vc.members) {
      if (await isAuthorized(member.user, guild)) continue; // Don't mute other admins
      try {
        await member.edit({ mute: true, deaf: true });
        affectedCount++;
      } catch(e) {
        console.error(`Failed to mute/deafen ${member.user.tag}:`, e);
      }
    }

    return cv2.success('Theater Mode Activated', `**${vc.name}** is now in Theater Mode.\n\nAll current and new members will be server-muted and server-deafened. Anyone caught attempting to evade this restriction will be stripped of privileges and quarantined. Muted **${affectedCount}** existing members.`);
  } else {
    const currentVcId = cfg.theaterModeVcId;
    db.updateGuildConfig(guild.id, { theaterModeVcId: null });
    
    // Clear strikes
    import('../events/voiceStateUpdate.js').then(module => {
      if (module.clearTheaterStrikes) module.clearTheaterStrikes(guild.id);
    }).catch(() => null);

    if (currentVcId) {
      const channel = guild.channels.cache.get(currentVcId);
      if (channel) {
        let count = 0;
        for (const [id, member] of channel.members) {
           try {
             const updates = {};
             if (member.voice.serverMute) updates.mute = false;
             if (member.voice.serverDeaf) updates.deaf = false;
             if (Object.keys(updates).length > 0) {
               await member.edit(updates);
             }
             count++;
           } catch(e) {
             console.error(`Failed to unmute/undeafen ${member.user.tag}:`, e);
           }
        }
        return cv2.success('Theater Mode Deactivated', `Theater Mode disabled. Restored voice privileges for **${count}** members in **${channel.name}**.`);
      }
    }
    
    return cv2.success('Theater Mode Deactivated', 'Theater Mode disabled.');
  }
}
