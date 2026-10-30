import { PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import cv2 from '../cv2.js';
import { isBotOwnerSync, isExtraOwner, isAuthorized } from '../utils/helpers.js';
import db from '../database.js';

// ============================================================
// ACTIVE DRAG SESSIONS — keyed by `${guildId}:${targetUserId}`
// Holds the interval reference so it can be cleared by /vcdragstop
// ============================================================
const activeDrags = new Map();

export function isUserInDragSession(guildId, userId) {
  return activeDrags.has(`${guildId}:${userId}`);
}

export const commands = [
  // ─────────────────────────────────────────────
  // /vcdrag  —  Start dragging a user across VCs
  // ─────────────────────────────────────────────
  {
    name: 'vcdrag',
    aliases: ['loopdrag', 'vcloop'],
    description: 'Drags a user across every voice channel in an endless loop until /vcdragstop.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.MoveMembers],
    options: [
      { name: 'target', description: 'The user to drag', type: 6, required: true },
      { name: 'interval', description: 'Interval in seconds (default 2)', type: 4, required: false }
    ],

    async executePrefix(message, args) {
      if (!(await isAuthorized(message.author, message.guild))) return message.reply(cv2.danger('Permission Denied', `${message.author} Only owners can use this command.`));
      const target = message.mentions.members.first();
      if (!target) {
        return message.reply({
          ...cv2.warn('Command Error',
            `${message.author} Please mention a valid member.\n\n**Usage:** \`!vcdrag <@user> [interval_seconds]\``)
        });
      }
      const intervalSec = parseInt(args[1]) || 2;
      const result = await handleVcDrag(message.guild, message.member, target, intervalSec);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) return interaction.reply(cv2.danger('Permission Denied', `${interaction.user} Only owners can use this command.`));
      const target = interaction.options.getMember('target');
      const intervalSec = interaction.options.getInteger('interval') || 2;
      const result = await handleVcDrag(interaction.guild, interaction.member, target, intervalSec);
      await interaction.reply(result);
    }
  },

  // ─────────────────────────────────────────────
  // /vcdragstop  —  Stop an active drag session
  // ─────────────────────────────────────────────
  {
    name: 'vcdragstop',
    aliases: ['dragstop', 'stopdrag'],
    description: 'Stops an active /vcdrag session for a user.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.MoveMembers],
    options: [
      { name: 'target', description: 'The user to stop dragging', type: 6, required: true }
    ],

    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return message.reply(cv2.danger('Permission Denied', `${message.author} Only owners can use this command.`));
      const target = message.mentions.members.first();
      if (!target) {
        return message.reply({
          ...cv2.warn('Command Error',
            `${message.author} Please mention the member whose drag session you want to stop.\n\n**Usage:** \`!vcdragstop <@user>\``)
        });
      }
      const result = handleVcDragStop(message.guild, message.member, target);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) return interaction.reply(cv2.danger('Permission Denied', `${interaction.user} Only owners can use this command.`));
      const target = interaction.options.getMember('target');
      const result = handleVcDragStop(interaction.guild, interaction.member, target);
      await interaction.reply(result);
    }
  },

  // ─────────────────────────────────────────────
  // /vcdraglist  —  See all active drag sessions
  // ─────────────────────────────────────────────
  {
    name: 'vcdraglist',
    description: 'Lists all currently active VC drag sessions in this server.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.MoveMembers],
    options: [],

    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return message.reply(cv2.danger('Permission Denied', `${message.author} Only owners can use this command.`));
      const result = handleVcDragList(message.guild);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) return interaction.reply(cv2.danger('Permission Denied', `${interaction.user} Only owners can use this command.`));
      const result = handleVcDragList(interaction.guild);
      await interaction.reply(result);
    }
  },

  // ─────────────────────────────────────────────
  // /massdc  —  Mass Disconnect users from a VC
  // ─────────────────────────────────────────────
  {
    name: 'massdc',
    aliases: ['vcdc', 'massdisconnect', 'dcall'],
    description: '[OWNER ONLY] Disconnects all users from a voice channel (you are immune).',
    category: 'security',
    permissions: [],
    options: [
      { name: 'channel', description: 'The voice channel to disconnect users from', type: 7, channel_types: [2, 13], required: false }
    ],
    async executePrefix(message, args) {
      if (!(await isAuthorized(message.author, message.guild))) {
        return message.reply(cv2.danger('Permission Denied', `${message.author} Only the **Bot Owner**, **Server Owner**, and **Extra Owners** can use mass commands.`));
      }

      let targetVc;
      if (args[0]) {
        targetVc = message.guild.channels.cache.get(args[0].replace(/[<#>]/g, '')) || 
                   message.guild.channels.cache.find(c => (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) && c.name.toLowerCase().includes(args.join(' ').toLowerCase()));
      } else {
        targetVc = message.member.voice.channel;
      }

      if (!targetVc || (targetVc.type !== ChannelType.GuildVoice && targetVc.type !== ChannelType.GuildStageVoice)) {
        return message.reply(cv2.warn('Channel Not Found', 'Please specify a valid voice channel, or join one first.'));
      }

      const result = await handleMassDisconnect(targetVc, message.member);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Permission Denied', `${interaction.user} Only the **Bot Owner**, **Server Owner**, and **Extra Owners** can use mass commands.`));
      }

      let targetVc = interaction.options.getChannel('channel') || interaction.member.voice.channel;

      if (!targetVc || (targetVc.type !== ChannelType.GuildVoice && targetVc.type !== ChannelType.GuildStageVoice)) {
        return interaction.reply(cv2.warn('Channel Not Found', 'Please specify a valid voice channel, or join one first.'));
      }

      const result = await handleMassDisconnect(targetVc, interaction.member);
      await interaction.reply(result);
    }
  },

  // ─────────────────────────────────────────────
  // /massmove  —  Mass Move users to another VC
  // ─────────────────────────────────────────────
  {
    name: 'massmove',
    aliases: ['vcmove', 'moveall'],
    description: '[OWNER ONLY] Moves all users from one voice channel to another.',
    category: 'security',
    permissions: [],
    options: [
      { name: 'destination', description: 'The voice channel to move users TO', type: 7, channel_types: [2, 13], required: true },
      { name: 'source', description: 'The voice channel to move users FROM (defaults to your VC)', type: 7, channel_types: [2, 13], required: false }
    ],
    async executePrefix(message, args) {
      if (!(await isAuthorized(message.author, message.guild))) {
        return message.reply(cv2.danger('Permission Denied', `${message.author} Only the **Bot Owner**, **Server Owner**, and **Extra Owners** can use mass commands.`));
      }

      if (!args[0]) {
        return message.reply(cv2.warn('Command Error', 'Usage: `!massmove <destination>` or `!massmove <source> <destination>`'));
      }

      let sourceVc = message.member.voice.channel;
      let destVc;

      // If two args provided, try to resolve both
      if (args.length >= 2) {
        const potentialSource = message.guild.channels.cache.get(args[0].replace(/[<#>]/g, ''));
        if (potentialSource && (potentialSource.type === ChannelType.GuildVoice || potentialSource.type === ChannelType.GuildStageVoice)) {
          sourceVc = potentialSource;
          const destQuery = args.slice(1).join(' ').toLowerCase();
          destVc = message.guild.channels.cache.get(destQuery.replace(/[<#>]/g, '')) || 
                   message.guild.channels.cache.find(c => (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) && c.name.toLowerCase().includes(destQuery));
        } else {
          // Just one arg technically, resolving destination
          const destQuery = args.join(' ').toLowerCase();
          destVc = message.guild.channels.cache.get(destQuery.replace(/[<#>]/g, '')) || 
                   message.guild.channels.cache.find(c => (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) && c.name.toLowerCase().includes(destQuery));
        }
      } else {
        const destQuery = args.join(' ').toLowerCase();
        destVc = message.guild.channels.cache.get(destQuery.replace(/[<#>]/g, '')) || 
                 message.guild.channels.cache.find(c => (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) && c.name.toLowerCase().includes(destQuery));
      }

      if (!sourceVc) return message.reply(cv2.warn('Source Not Found', 'You must be in a voice channel, or specify a source channel.'));
      if (!destVc) return message.reply(cv2.warn('Destination Not Found', 'Could not find the destination voice channel.'));

      const result = await handleMassMove(sourceVc, destVc, message.member);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Permission Denied', `${interaction.user} Only the **Bot Owner**, **Server Owner**, and **Extra Owners** can use mass commands.`));
      }

      const destVc = interaction.options.getChannel('destination');
      const sourceVc = interaction.options.getChannel('source') || interaction.member.voice.channel;

      if (!sourceVc) return interaction.reply(cv2.warn('Source Not Found', 'You must be in a voice channel, or specify a source channel.'));
      if (!destVc) return interaction.reply(cv2.warn('Destination Not Found', 'Could not find the destination voice channel.'));
      if (sourceVc.type !== ChannelType.GuildVoice && sourceVc.type !== ChannelType.GuildStageVoice) return interaction.reply(cv2.warn('Invalid Source', 'Source must be a voice channel.'));
      if (destVc.type !== ChannelType.GuildVoice && destVc.type !== ChannelType.GuildStageVoice) return interaction.reply(cv2.warn('Invalid Destination', 'Destination must be a voice channel.'));

      const result = await handleMassMove(sourceVc, destVc, interaction.member);
      await interaction.reply(result);
    }
  }
];

// =============================================================
// CORE LOGIC
// =============================================================

async function handleVcDrag(guild, moderator, target, intervalSec) {
  // — Permission & safety checks ——————————————————————————

  // Bot owner & extra owners are immune
  if (!isBotOwnerSync(moderator.id) && (isBotOwnerSync(target.id) || isExtraOwner(guild.id, target.id))) {
    return cv2.danger('Untouchable', `**${target.user.tag}** is protected by Athena Prime and cannot be dragged.`);
  }

  // Move Protected users are immune
  if (db.isMoveProtected(guild.id, target.id)) {
    return cv2.danger(
        ' Move Protected',
        `**${target.user.tag}** is currently enrolled in Move Protection. They cannot be targeted by VC drag sessions.`
      );
  }

  // (We no longer fail if they aren't in a VC initially, the drag will just wait for them to join)

  // Bot needs Move Members permission
  const botMember = guild.members.me;
  if (!botMember.permissions.has(PermissionFlagsBits.MoveMembers)) {
    return cv2.danger(
        'Missing Permission',
        'I need the **Move Members** permission to drag users between voice channels.'
      );
  }

  const sessionKey = `${guild.id}:${target.id}`;

  // Kill any pre-existing session for this user
  if (activeDrags.has(sessionKey)) {
    clearInterval(activeDrags.get(sessionKey).timer);
    activeDrags.delete(sessionKey);
  }

  // — Collect all usable VCs ————————————————————————————————
  const getVoiceChannels = () =>
    guild.channels.cache
      .filter(c =>
        c.type === ChannelType.GuildVoice &&
        c.permissionsFor(botMember).has(PermissionFlagsBits.MoveMembers) &&
        c.permissionsFor(botMember).has(PermissionFlagsBits.Connect)
      )
      .map(c => c);

  let vcList = getVoiceChannels();

  if (vcList.length < 2) {
    return cv2.warn(
        'Not Enough VCs',
        'There must be at least **2 voice channels** accessible to the bot to start dragging.'
      );
  }

  let index = 0;
  const intervalMs = Math.max(1, intervalSec) * 1000;
  let wasInVc = !!target.voice.channelId;

  // The drag function — runs on every tick
  const drag = async () => {
    try {
      // Refresh VC list and re-fetch member each tick to stay up-to-date
      vcList = getVoiceChannels();
      if (vcList.length === 0) return;

      // Re-fetch target member state
      const freshMember = await guild.members.fetch(target.id).catch(() => null);
      if (!freshMember || !freshMember.voice.channelId) {
        // User left all VCs or left the server completely
        // Do NOT clear the timer! We wait silently until they join again.
        wasInVc = false;
        return;
      }

      if (!wasInVc) {
        wasInVc = true;
        const currentVc = guild.channels.cache.get(freshMember.voice.channelId);
        if (currentVc && currentVc.isTextBased()) {
          const cv2Payload = cv2.warn('<a:AnyaYay:1537513785718476850> Drag Resumed', `${freshMember}\n**${freshMember.user.tag}** has rejoined voice. The endless drag session has instantly resumed!`);
          currentVc.send(cv2Payload).catch(() => null);
        }
      }

      // Cycle through VCs in order (wraps around)
      index = index % vcList.length;
      const dest = vcList[index];
      index++;

      // Skip if already there
      if (freshMember.voice.channelId !== dest.id) {
        await freshMember.voice.setChannel(dest, `VCDrag — initiated by ${moderator.user.tag}`).catch(() => null);
      } else {
        // Pick next to avoid being stuck
        index = index % vcList.length;
        const altDest = vcList[index];
        index++;
        if (altDest && freshMember.voice.channelId !== altDest.id) {
          await freshMember.voice.setChannel(altDest, `VCDrag — initiated by ${moderator.user.tag}`).catch(() => null);
        }
      }
    } catch {
      // Silently absorb errors to keep the loop alive
    }
  };

  // Kick off the loop immediately then repeat
  await drag();
  const timer = setInterval(drag, intervalMs);

  activeDrags.set(sessionKey, {
    timer,
    initiatorId: moderator.id,
    targetId: target.id,
    targetTag: target.user.tag,
    startedAt: Date.now(),
    intervalSec
  });

  // Persist session to database for 100% survival across restarts and host migrations
  db.saveActiveVcDrag(guild.id, target.id, {
    initiatorId: moderator.id,
    targetTag: target.user.tag,
    startedAt: Date.now(),
    intervalSec
  });

  return cv2.danger(
      'VC Drag Activated',
      `${target} is now being dragged through every voice channel every **${intervalSec}s**.\n\nUse \`/vcdragstop\` or \`!vcdragstop @${target.user.username}\` to stop.`,
      [
        { name: 'Target', value: `${target.user.tag} (${target.id})`, inline: true },
        { name: 'Interval', value: `${intervalSec} second(s)`, inline: true },
        { name: 'Voice Channels', value: `${vcList.length} channels in rotation`, inline: true }
      ]
    );
}

// ─────────────────────────────────────────────────────────────
function handleVcDragStop(guild, moderator, target) {
  const sessionKey = `${guild.id}:${target.id}`;

  if (!activeDrags.has(sessionKey)) {
    return cv2.warn(
        'No Active Session',
        `There is no active VC drag session for ${target}.`
      );
  }

  const session = activeDrags.get(sessionKey);
  clearInterval(session.timer);
  activeDrags.delete(sessionKey);
  db.removeActiveVcDrag(guild.id, target.id);

  const durationSec = Math.round((Date.now() - session.startedAt) / 1000);

  return cv2.success(
      `VC Drag Stopped | <a:03_tick_circle:1565665642084827206>`,
      `The VC drag session for **${session.targetTag}** has been terminated.`,
      [
        { name: 'Target', value: session.targetTag, inline: true },
        { name: 'Session Duration', value: `${durationSec}s`, inline: true },
        { name: 'Stopped By', value: moderator.user.tag, inline: true }
      ]
    );
}

/**
 * Automatically restores and restarts any unended VC drag sessions on bot boot
 */
export async function restoreActiveVcDrags(client) {
  try {
    const allDrags = db.getActiveVcDrags();
    let resumed = 0;
    for (const [guildId, guildDrags] of Object.entries(allDrags)) {
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;
      for (const [targetId, dragInfo] of Object.entries(guildDrags || {})) {
        const target = await guild.members.fetch(targetId).catch(() => null);
        if (!target) continue;
        const initiator = await guild.members.fetch(dragInfo.initiatorId).catch(() => null);
        const moderator = initiator || { id: dragInfo.initiatorId, user: { tag: 'Owner' } };
        await handleVcDrag(guild, moderator, target, dragInfo.intervalSec || 2);
        resumed++;
      }
    }
    if (resumed > 0) {
      console.log(`[VCDrag] Successfully resumed ${resumed} unended VC drag session(s) from database.`);
    }
  } catch (err) {
    console.warn('[VCDrag] Error restoring active VC drag sessions:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
function handleVcDragList(guild) {
  const sessions = [];

  for (const [key, session] of activeDrags.entries()) {
    if (key.startsWith(guild.id + ':')) {
      const durationSec = Math.round((Date.now() - session.startedAt) / 1000);
      sessions.push({
        name: `Session: ${session.targetTag}`,
        value: `ID: \`${session.targetId}\` | Interval: **${session.intervalSec}s** | Running: **${durationSec}s**`,
        inline: false
      });
    }
  }

  if (sessions.length === 0) {
    return cv2.info('No Active Drags', 'There are no ongoing VC drag sessions in this server.');
  }

  return cv2.info(
      ` Active VC Drag Sessions (${sessions.length})`,
      `Use \`/vcdragstop <@user>\` to stop any session.`,
      sessions
    );
}

// ─────────────────────────────────────────────────────────────
async function handleMassDisconnect(targetVc, moderator, interaction = null) {
  let count = 0;
  let skipped = 0;
  const promises = [];
  targetVc.members.forEach(member => {
    if (member.id === moderator.id) return; // Command executor is immune
    if (isBotOwnerSync(member.id)) return; // Bot owner immune
    if (isExtraOwner(targetVc.guild.id, member.id)) return; // Extra owners immune
    
    // Skip move-protected users
    if (db.isMoveProtected(targetVc.guild.id, member.id)) {
      skipped++;
      return;
    }

    promises.push(
      member.voice.disconnect()
        .then(() => {
          count++;
          if (interaction && count % 15 === 0) {
            interaction.editReply(cv2.info('Mass Disconnect', `Disconnecting in progress...\n\n Disconnected: **${count}**\n Skipped (Protected): **${skipped}**`)).catch(() => null);
          }
        })
        .catch(() => null)
    );
  });

  await Promise.all(promises);
  let msg = `Successfully disconnected **${count}** users from ${targetVc}.`;
  if (skipped > 0) msg += `\n\n>  **${skipped}** users were skipped due to active **Move Protection**.`;
  return cv2.success('Mass Disconnect', msg);
}

// ─────────────────────────────────────────────────────────────
async function handleMassMove(sourceVc, destVc, moderator, interaction = null) {
  if (sourceVc.id === destVc.id) {
    return cv2.warn('Invalid Destination', 'Source and destination channels cannot be the same.');
  }

  let count = 0;
  let skipped = 0;
  const promises = [];
  sourceVc.members.forEach(member => {
    // Skip move-protected users
    if (db.isMoveProtected(sourceVc.guild.id, member.id)) {
      skipped++;
      return;
    }

    promises.push(
      member.voice.setChannel(destVc)
        .then(() => {
          count++;
          if (interaction && count % 15 === 0) {
            interaction.editReply(cv2.info('Mass Move', `Moving in progress...\n\n Moved: **${count}**\n Skipped (Protected): **${skipped}**`)).catch(() => null);
          }
        })
        .catch(() => null)
    );
  });

  await Promise.all(promises);
  let msg = `Successfully moved **${count}** users from ${sourceVc} to ${destVc}.`;
  if (skipped > 0) msg += `\n\n>  **${skipped}** users were skipped due to active **Move Protection**.`;
  return cv2.success('Mass Move', msg);
}
