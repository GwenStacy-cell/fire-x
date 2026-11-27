import { PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import cv2 from '../cv2.js';
import { isBotOwnerSync, isExtraOwner, isAuthorized, isExtraOwnerOrHigher, formatUserLink } from '../utils/helpers.js';
import { TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI, BULLET_EMOJI, UPTIME_EMOJI } from '../utils/emojis.js';
import db from '../database.js';

// ============================================================
// ACTIVE DRAG SESSIONS — keyed by `${guildId}:${targetUserId}`
// Holds the interval reference so it can be cleared by /vcdragstop
// ============================================================
const activeDrags = new Map();

// Live cache of Discord primaryGuild (Server Tag) state updated in 0ms by userUpdate
const primaryGuildCache = new Map();

export function isUserInDragSession(guildId, userId) {
  return activeDrags.has(`${guildId}:${userId}`);
}

function normalizePrimaryGuild(user) {
  const pg = user?.primaryGuild || user?.primary_guild || null;
  if (!pg) {
    return { identityGuildId: null, identityEnabled: false, tag: null };
  }
  return {
    identityGuildId: pg.identityGuildId ?? pg.identity_guild_id ?? null,
    identityEnabled: Boolean(pg.identityEnabled ?? pg.identity_enabled),
    tag: (pg.tag ? String(pg.tag).trim().toUpperCase() : null)
  };
}

export function updateUserPrimaryGuildCache(user) {
  if (!user?.id) return null;
  const normalized = normalizePrimaryGuild(user);
  const entry = { ...normalized, fetchedAt: Date.now() };
  primaryGuildCache.set(user.id, entry);
  return entry;
}

async function resolveFreshPrimaryGuild(client, userOrId, maxAgeMs = 45_000, forceRefresh = false) {
  const userObj = typeof userOrId === 'object' ? userOrId : null;
  const userId = userObj?.id || (typeof userOrId === 'string' ? userOrId : null);
  if (!userId) return { identityGuildId: null, identityEnabled: false, tag: null };

  const cached = primaryGuildCache.get(userId);
  if (!forceRefresh && cached && (Date.now() - cached.fetchedAt) < maxAgeMs) {
    return cached;
  }

  // If object already carries primaryGuild data and no explicit force requested, update cache if absent
  if (!forceRefresh && userObj?.primaryGuild && !cached) {
    return updateUserPrimaryGuildCache(userObj);
  }

  if (client?.users && typeof client.users.fetch === 'function') {
    const fetched = await client.users.fetch(userId, { force: true }).catch(() => null);
    if (fetched) {
      return updateUserPrimaryGuildCache(fetched);
    }
  }

  if (userObj) {
    return updateUserPrimaryGuildCache(userObj);
  }
  return cached || { identityGuildId: null, identityEnabled: false, tag: null };
}

function findMatchingTagDragRule(guildId, pg) {
  if (!guildId || !pg || !pg.identityEnabled) return null;
  const cfg = db.getTagDragConfig(guildId);
  const userGuildId = pg.identityGuildId ? String(pg.identityGuildId) : null;
  const userTag = pg.tag ? String(pg.tag).trim().toUpperCase() : null;

  for (const rule of cfg.rules) {
    if (!rule.enabled) continue;
    if (rule.identityGuildId) {
      if (userGuildId && userGuildId === rule.identityGuildId) return rule;
    } else if (rule.tag && userTag) {
      if (userTag === rule.tag.toUpperCase()) return rule;
    }
  }
  return null;
}

function stopActiveDragSession(guildId, userId) {
  const sessionKey = `${guildId}:${userId}`;
  const session = activeDrags.get(sessionKey);
  if (session) {
    clearInterval(session.timer);
    activeDrags.delete(sessionKey);
  }
  db.removeActiveVcDrag(guildId, userId);
  return session || null;
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
    aliases: ['draglist', 'vcdragusers'],
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
  },

  // ─────────────────────────────────────────────
  // /tagdrag  —  Auto VC Drag by Discord Server Tag
  // ─────────────────────────────────────────────
  {
    name: 'tagdrag',
    aliases: [
      'tdrag', 'servertagdrag', 'dragtag', 'vcdragtag', 'tagvcdrag',
      'autotagdrag', 'tagloop', 'clandrag', 'dragbytag', 'vctagdrag',
      'stdrag', 'tagvc', 'servertag', 'stagdrag'
    ],
    description: 'Auto VC drag users wearing a watched Server Tag until removed or stopped/resumed by Extra Owner.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.MoveMembers],
    options: [
      {
        name: 'add',
        description: 'Watch a Server Tag (mention wearer, tag text, server ID, or invite)',
        type: 1,
        options: [
          { name: 'target', description: 'User wearing tag, 1-4 char tag, server ID, or discord.gg invite', type: 3, required: true },
          { name: 'interval', description: 'Drag loop interval in seconds (1-60, default 2)', type: 4, required: false }
        ]
      },
      {
        name: 'remove',
        description: 'Remove a Server Tag drag rule',
        type: 1,
        options: [
          { name: 'target', description: 'Tag text, server ID, or user wearing the tag', type: 3, required: true }
        ]
      },
      {
        name: 'stop',
        description: 'Manually stop & pause Server Tag VC drag for a user (until resumed)',
        type: 1,
        options: [
          { name: 'user', description: 'User to stop dragging', type: 6, required: true }
        ]
      },
      {
        name: 'resume',
        description: 'Resume Server Tag VC drag for a paused user (or all paused users)',
        type: 1,
        options: [
          { name: 'user', description: 'User to resume dragging (omit for all)', type: 6, required: false }
        ]
      },
      {
        name: 'toggle',
        description: 'Enable or pause an existing Server Tag rule',
        type: 1,
        options: [
          { name: 'target', description: 'Tag text or server ID', type: 3, required: true }
        ]
      },
      {
        name: 'list',
        description: 'View watched Server Tags, live tag drags, and paused users',
        type: 1
      },
      {
        name: 'clear',
        description: 'Clear all Server Tag drag rules and stop active tag drags',
        type: 1
      }
    ],
    async executePrefix(message, args) {
      if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
        return message.reply(cv2.danger(
          `Unauthorized | ${WRONG_EMOJI}`,
          `${formatUserLink(message.author, message.guild)} Only the **Server Owner** or designated **Extra Owners** can configure Server Tag VC Drag.`
        ));
      }

      const sub = (args[0] || 'list').toLowerCase();
      if (sub === 'add' || sub === 'watch' || sub === 'set') {
        const rawInput = args[1] || (message.mentions.users.first()?.id || null);
        const intervalSec = parseInt(args[2], 10) || 2;
        const result = await handleTagDragAdd(message.guild, message.member, rawInput, intervalSec, message.mentions.users.first());
        return message.reply(result);
      }
      if (sub === 'remove' || sub === 'del' || sub === 'delete' || sub === 'rm') {
        const rawInput = args[1] || message.mentions.users.first()?.id;
        const result = await handleTagDragRemove(message.guild, rawInput, message.mentions.users.first());
        return message.reply(result);
      }
      if (sub === 'stop' || sub === 'pause') {
        if ((args[1] || '').toLowerCase() === 'all') {
          return message.reply(handleTagDragStopUser(message.guild, message.member, 'all'));
        }
        const target = await resolveGuildMemberArg(message.guild, args[1], message.mentions.members.first());
        if (!target) {
          return message.reply(cv2.warn(`Missing Target | ${WARN_EMOJI}`, `Mention a user or specify \`all\`: \`!tagdrag stop @user\` or \`!tagdrag stop all\``));
        }
        return message.reply(handleTagDragStopUser(message.guild, message.member, target));
      }
      if (sub === 'resume' || sub === 'unpause' || sub === 'start') {
        if ((args[1] || '').toLowerCase() === 'all') {
          return message.reply(await handleTagDragResume(message.guild, message.member, 'all'));
        }
        const target = await resolveGuildMemberArg(message.guild, args[1], message.mentions.members.first());
        if (!target) {
          return message.reply(cv2.warn(`Missing Target | ${WARN_EMOJI}`, `Mention a user or specify \`all\`: \`!tagdrag resume @user\` or \`!tagdrag resume all\``));
        }
        return message.reply(await handleTagDragResume(message.guild, message.member, target));
      }
      if (sub === 'toggle' || sub === 'enable' || sub === 'disable') {
        const rawInput = args[1] || message.mentions.users.first()?.id;
        return message.reply(await handleTagDragToggle(message.guild, rawInput, message.mentions.users.first()));
      }
      if (sub === 'clear' || sub === 'reset') {
        return message.reply(handleTagDragClear(message.guild));
      }
      if (
        /^<@!?\d{17,20}>$/.test(args[0] || '') ||
        /^\d{17,20}$/.test(args[0] || '') ||
        /(?:discord\.gg|discord(?:app)?\.com\/invite)\//i.test(args[0] || '')
      ) {
        const intervalSec = parseInt(args[1], 10) || 2;
        const result = await handleTagDragAdd(message.guild, message.member, args[0], intervalSec, message.mentions.users.first());
        return message.reply(result);
      }
      return message.reply(buildTagDragListPayload(message.guild));
    },
    async executeSlash(interaction) {
      if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
        return interaction.reply(cv2.danger(
          `Unauthorized | ${WRONG_EMOJI}`,
          `${formatUserLink(interaction.user, interaction.guild)} Only the **Server Owner** or designated **Extra Owners** can configure Server Tag VC Drag.`
        ));
      }

      const sub = interaction.options.getSubcommand();
      if (sub === 'add') {
        const targetInput = interaction.options.getString('target');
        const intervalSec = interaction.options.getInteger('interval') || 2;
        return interaction.reply(await handleTagDragAdd(interaction.guild, interaction.member, targetInput, intervalSec));
      }
      if (sub === 'remove') {
        const targetInput = interaction.options.getString('target');
        return interaction.reply(await handleTagDragRemove(interaction.guild, targetInput));
      }
      if (sub === 'stop') {
        const target = interaction.options.getMember('user');
        if (!target) return interaction.reply(cv2.warn(`Not Found | ${WARN_EMOJI}`, `Target member is not in this server.`));
        return interaction.reply(handleTagDragStopUser(interaction.guild, interaction.member, target));
      }
      if (sub === 'resume') {
        const target = interaction.options.getMember('user');
        return interaction.reply(await handleTagDragResume(interaction.guild, interaction.member, target || 'all'));
      }
      if (sub === 'toggle') {
        const targetInput = interaction.options.getString('target');
        return interaction.reply(await handleTagDragToggle(interaction.guild, targetInput));
      }
      if (sub === 'clear') {
        return interaction.reply(handleTagDragClear(interaction.guild));
      }
      return interaction.reply(buildTagDragListPayload(interaction.guild));
    }
  },

  // ─────────────────────────────────────────────
  // Quick shortcuts for Extra Owner Stop & Resume on Server Tag Drag
  // ─────────────────────────────────────────────
  {
    name: 'tagdragstop',
    aliases: ['tdragstop', 'stoptagdrag', 'pausetagdrag', 'tagstop'],
    description: 'Stop and pause Server Tag VC drag for a user until an Extra Owner resumes it.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.MoveMembers],
    options: [
      { name: 'user', description: 'User whose Server Tag drag should be stopped', type: 6, required: true }
    ],
    async executePrefix(message, args) {
      if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
        return message.reply(cv2.danger(`Unauthorized | ${WRONG_EMOJI}`, `Only Extra Owners or higher can stop Server Tag VC Drag.`));
      }
      if ((args[0] || '').toLowerCase() === 'all') {
        return message.reply(handleTagDragStopUser(message.guild, message.member, 'all'));
      }
      const target = await resolveGuildMemberArg(message.guild, args[0], message.mentions.members.first());
      if (!target) {
        return message.reply(cv2.warn(`Missing User | ${WARN_EMOJI}`, `Provide a user or \`all\`: \`!tagdragstop @user\` or \`!tagdragstop all\``));
      }
      return message.reply(handleTagDragStopUser(message.guild, message.member, target));
    },
    async executeSlash(interaction) {
      if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
        return interaction.reply(cv2.danger(`Unauthorized | ${WRONG_EMOJI}`, `Only Extra Owners or higher can stop Server Tag VC Drag.`));
      }
      const target = interaction.options.getMember('user');
      if (!target) return interaction.reply(cv2.warn(`Not Found | ${WARN_EMOJI}`, `Member not found in this server.`));
      return interaction.reply(handleTagDragStopUser(interaction.guild, interaction.member, target));
    }
  },
  {
    name: 'tagdragresume',
    aliases: ['tdragresume', 'resumetagdrag', 'unpausetagdrag', 'tagresume'],
    description: 'Resume Server Tag VC drag for a paused user (or all users) immediately.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.MoveMembers],
    options: [
      { name: 'user', description: 'User to resume (omit to resume all paused users)', type: 6, required: false }
    ],
    async executePrefix(message, args) {
      if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
        return message.reply(cv2.danger(`Unauthorized | ${WRONG_EMOJI}`, `Only Extra Owners or higher can resume Server Tag VC Drag.`));
      }
      if (!args[0] || args[0].toLowerCase() === 'all') {
        return message.reply(await handleTagDragResume(message.guild, message.member, 'all'));
      }
      const target = await resolveGuildMemberArg(message.guild, args[0], message.mentions.members.first());
      if (!target) {
        return message.reply(cv2.warn(`Missing User | ${WARN_EMOJI}`, `Provide a user or \`all\`: \`!tagdragresume @user\``));
      }
      return message.reply(await handleTagDragResume(message.guild, message.member, target));
    },
    async executeSlash(interaction) {
      if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
        return interaction.reply(cv2.danger(`Unauthorized | ${WRONG_EMOJI}`, `Only Extra Owners or higher can resume Server Tag VC Drag.`));
      }
      const target = interaction.options.getMember('user');
      return interaction.reply(await handleTagDragResume(interaction.guild, interaction.member, target || 'all'));
    }
  }
];

// =============================================================
// CORE LOGIC
// =============================================================

async function resolveGuildMemberArg(guild, rawArg, fallbackMentionMember = null) {
  if (fallbackMentionMember) return fallbackMentionMember;
  if (!guild || !rawArg) return null;
  const cleanedId = String(rawArg).replace(/[<@!>]/g, '').trim();
  if (/^\d{17,20}$/.test(cleanedId)) {
    return guild.members.cache.get(cleanedId) || await guild.members.fetch(cleanedId).catch(() => null);
  }
  const lower = String(rawArg).toLowerCase().trim();
  return guild.members.cache.find(
    (m) => m.user?.username?.toLowerCase() === lower || m.displayName?.toLowerCase() === lower
  ) || null;
}

async function resolveTargetTagSpec(guild, rawInput, mentionedUser = null) {
  const client = guild?.client;

  // 1. User mention or explicit user object -> extract live primaryGuild
  if (mentionedUser) {
    const pg = await resolveFreshPrimaryGuild(client, mentionedUser, 0, true);
    if (!pg.identityEnabled || (!pg.identityGuildId && !pg.tag)) {
      return { error: `${formatUserLink(mentionedUser, guild)} does not currently have an active Server Tag displayed on Discord.` };
    }
    const sourceGuildName = pg.identityGuildId
      ? (client?.guilds?.cache?.get(pg.identityGuildId)?.name || (await client?.fetchGuildPreview?.(pg.identityGuildId).catch(() => null))?.name || null)
      : null;
    return { identityGuildId: pg.identityGuildId, tag: pg.tag, guildName: sourceGuildName };
  }

  const input = String(rawInput || '').trim();
  if (!input) {
    return { error: 'Provide a `@user`, 1–4 character Server Tag, server invite link, or Server ID.' };
  }

  // 2. Discord Invite link/code
  const inviteMatch = input.match(/(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9-]+)/i);
  if (inviteMatch) {
    const code = inviteMatch[1];
    const invite = await client?.fetchInvite?.(code).catch(() => null);
    if (!invite?.guild?.id) {
      return { error: `Could not resolve a server from invite \`${code}\`. Verify the invite is valid.` };
    }
    return {
      identityGuildId: invite.guild.id,
      tag: invite.guild?.profile?.tag ? String(invite.guild.profile.tag).trim().toUpperCase().slice(0, 4) : null,
      guildName: invite.guild.name || null
    };
  }

  // 3. Mention syntax <@123> or Snowflake ID (check user first, then guild ID)
  const idMatch = input.match(/^<@!?(\d{17,20})>$/) || input.match(/^(\d{17,20})$/);
  if (idMatch) {
    const snowflake = idMatch[1];
    const isExplicitMention = input.startsWith('<@');
    if (isExplicitMention || !client?.guilds?.cache?.has(snowflake)) {
      const usr = await client?.users?.fetch?.(snowflake, { force: true }).catch(() => null);
      if (usr) {
        const pg = updateUserPrimaryGuildCache(usr);
        if (pg?.identityEnabled && (pg.identityGuildId || pg.tag)) {
          const gName = pg.identityGuildId ? client?.guilds?.cache?.get(pg.identityGuildId)?.name || null : null;
          return { identityGuildId: pg.identityGuildId, tag: pg.tag, guildName: gName };
        }
        if (isExplicitMention) {
          return { error: `${formatUserLink(usr, guild)} does not currently have an active Server Tag displayed on Discord.` };
        }
      }
    }
    const knownGuild = client?.guilds?.cache?.get(snowflake) || await client?.fetchGuildPreview?.(snowflake).catch(() => null);
    return {
      identityGuildId: snowflake,
      tag: null,
      guildName: knownGuild?.name || null
    };
  }

  // 4. Plain Server Tag string (strip optional [ ] wrapper)
  const cleanTag = input.replace(/^\[|\]$/g, '').trim().toUpperCase();
  if (!cleanTag || cleanTag.length > 4) {
    return { error: 'Discord Server Tags are 1–4 characters (or pass `@user`, Server ID, or `discord.gg/invite`).' };
  }
  return { identityGuildId: null, tag: cleanTag, guildName: null };
}

function formatTagRuleLabel(rule) {
  if (!rule) return 'Unknown Tag';
  const tagPart = rule.tag ? `\`[${rule.tag}]\`` : '`[Server Tag]`';
  if (rule.guildName) return `${tagPart} (${rule.guildName} · \`${rule.identityGuildId}\`)`;
  if (rule.identityGuildId) return `${tagPart} (Server \`${rule.identityGuildId}\`)`;
  return tagPart;
}

async function handleVcDrag(guild, moderator, target, intervalSec, options = {}) {
  // — Permission & safety checks ——————————————————————————

  // Bot owner & extra owners are immune
  if (!isBotOwnerSync(moderator.id) && (isBotOwnerSync(target.id) || isExtraOwner(guild.id, target.id))) {
    return cv2.danger('Untouchable', `${formatUserLink(target, guild)} is protected by Athena Prime and cannot be dragged.`);
  }

  // Move Protected users are immune
  if (db.isMoveProtected(guild.id, target.id)) {
    return cv2.danger(
        'Move Protected',
        `${formatUserLink(target, guild)} is currently enrolled in Move Protection. They cannot be targeted by VC drag sessions.`
      );
  }

  // Bot needs Move Members permission
  const botMember = guild.members.me;
  if (!botMember?.permissions?.has(PermissionFlagsBits.MoveMembers)) {
    return cv2.danger(
        'Missing Permission',
        'I need the **Move Members** permission to drag users between voice channels.'
      );
  }

  const sessionKey = `${guild.id}:${target.id}`;
  const isTagMode = options.source === 'server_tag';

  const existingSession = activeDrags.get(sessionKey);
  if (existingSession) {
    if (isTagMode) {
      // Keep an existing manual or tag-driven drag session running without interval churn
      return null;
    }
    clearInterval(existingSession.timer);
    activeDrags.delete(sessionKey);
  }

  // — Collect all usable regular VCs (exclude JTC generator lobbies, Home VC, Quarantine VC, and Stats VCs) —
  const guildCfgForDrag = db.getGuildConfig(guild.id) || {};
  const statsCfgForDrag = db.getServerStats(guild.id) || {};
  const excludedVcIds = new Set(
    [
      guildCfgForDrag.homeVcId,
      guildCfgForDrag.quarantineVcId,
      statsCfgForDrag.serverStatsId,
      statsCfgForDrag.voiceStatsId,
      statsCfgForDrag.totalId,
      statsCfgForDrag.humansId,
      statsCfgForDrag.botsId,
      statsCfgForDrag.boosterId
    ].filter(Boolean)
  );

  const getVoiceChannels = () =>
    guild.channels.cache
      .filter(c =>
        c.type === ChannelType.GuildVoice &&
        !excludedVcIds.has(c.id) &&
        !db.isJtcLobbyChannel(guild.id, c.id) &&
        c.permissionsFor?.(botMember)?.has(PermissionFlagsBits.MoveMembers) &&
        c.permissionsFor?.(botMember)?.has(PermissionFlagsBits.Connect)
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
  let wasInVc = !!target.voice?.channelId;
  const sessionMeta = {
    source: options.source || 'manual',
    ruleId: options.ruleId || null,
    lastRestVerifyAt: Date.now()
  };

  // The drag function — runs on every tick
  const drag = async () => {
    try {
      // Re-fetch target member state cleanly
      const freshMember = await guild.members.fetch(target.id).catch(() => null);

      // For Server Tag-triggered drags, verify tag & manual pause state continuously
      if (sessionMeta.source === 'server_tag') {
        if (!freshMember || db.isTagDragUserPaused(guild.id, target.id)) {
          stopActiveDragSession(guild.id, target.id);
          return;
        }
        const nowMs = Date.now();
        const needsRestFallback = nowMs - sessionMeta.lastRestVerifyAt >= 10_000;
        const freshPg = await resolveFreshPrimaryGuild(guild.client, freshMember.user, 10_000, needsRestFallback);
        if (needsRestFallback) sessionMeta.lastRestVerifyAt = nowMs;

        if (!findMatchingTagDragRule(guild.id, freshPg)) {
          stopActiveDragSession(guild.id, target.id);
          return;
        }
      }

      // Refresh VC list each tick
      vcList = getVoiceChannels();
      if (vcList.length === 0) return;

      if (!freshMember || !freshMember.voice?.channelId) {
        // Wait until they join again (while still matching rule or manual drag)
        wasInVc = false;
        return;
      }

      if (!wasInVc) {
        wasInVc = true;
        if (!options.silent) {
          const currentVc = guild.channels.cache.get(freshMember.voice.channelId);
          if (currentVc && currentVc.isTextBased()) {
            const cv2Payload = cv2.warn(
              'Drag Resumed',
              `${formatUserLink(freshMember, guild)} rejoined voice. The VC drag session has instantly resumed.`
            );
            currentVc.send(cv2Payload).catch(() => null);
          }
        }
      }

      index = index % vcList.length;
      const dest = vcList[index];
      index++;

      const dragReason = isTagMode
        ? `Athena TagDrag — Matched Server Tag (${options.matchedRuleLabel || sessionMeta.ruleId || 'tag'})`
        : `VCDrag — initiated by ${moderator.user?.tag || 'Owner'}`;

      if (freshMember.voice.channelId !== dest.id) {
        await freshMember.voice.setChannel(dest, dragReason).catch(() => null);
      } else {
        index = index % vcList.length;
        const altDest = vcList[index];
        index++;
        if (altDest && freshMember.voice.channelId !== altDest.id) {
          await freshMember.voice.setChannel(altDest, dragReason).catch(() => null);
        }
      }
    } catch {
      // Absorb transient errors to keep the loop resilient
    }
  };

  // Kick off immediately (`0ms` wait) then repeat every intervalMs
  await drag();
  // Do not persist timer if initial tick already detected tag mismatch/pause
  if (isTagMode && db.isTagDragUserPaused(guild.id, target.id)) {
    return null;
  }

  const timer = setInterval(drag, intervalMs);
  timer.unref?.();

  activeDrags.set(sessionKey, {
    timer,
    initiatorId: moderator.id,
    targetId: target.id,
    targetTag: target.user?.tag || target.displayName || target.id,
    startedAt: Date.now(),
    intervalSec,
    source: sessionMeta.source,
    ruleId: sessionMeta.ruleId,
    matchedRuleLabel: options.matchedRuleLabel || null
  });

  // Persist session to database for continuity across restarts
  db.saveActiveVcDrag(guild.id, target.id, {
    initiatorId: moderator.id,
    targetTag: target.user?.tag || target.id,
    startedAt: Date.now(),
    intervalSec,
    source: sessionMeta.source,
    ruleId: sessionMeta.ruleId,
    matchedRuleLabel: options.matchedRuleLabel || null
  });

  if (options.silent) return { started: true };

  return cv2.danger(
      'VC Drag Activated',
      `${formatUserLink(target, guild)} is now being dragged across voice channels every **${intervalSec}s**.\n\nUse \`/vcdragstop\` or \`!vcdragstop\` to stop.`,
      [
        { name: 'Target', value: `${formatUserLink(target, guild)} (\`${target.id}\`)`, inline: true },
        { name: 'Interval', value: `${intervalSec} second(s)`, inline: true },
        { name: 'Voice Channels', value: `${vcList.length} channels in rotation`, inline: true }
      ]
    );
}

// ─────────────────────────────────────────────────────────────
function handleVcDragStop(guild, moderator, target) {
  const sessionKey = `${guild.id}:${target.id}`;
  const hadSession = activeDrags.get(sessionKey);
  const stoppedSession = stopActiveDragSession(guild.id, target.id);

  // Also pause any Server Tag auto-drag for this user so Extra Owner stop stays enforced until resumed
  const tagCfg = db.getTagDragConfig(guild.id);
  const hasWatchedTags = tagCfg.rules.some((r) => r.enabled);
  const isTagMatched = stoppedSession?.source === 'server_tag' || hasWatchedTags;
  if (hasWatchedTags) {
    db.pauseTagDragUser(guild.id, target.id, moderator.id, 'Manually stopped via !vcdragstop');
  }

  if (!hadSession && !stoppedSession) {
    if (isTagMatched && hasWatchedTags) {
      return cv2.success(
        `Server Tag Drag Paused | ${TICK_EMOJI}`,
        `Server Tag VC drag is now paused for ${formatUserLink(target, guild)}.\n` +
        `-# ${BULLET_EMOJI} Rejoining VC while keeping the tag will **not** restart dragging until an Extra Owner runs \`!tagdrag resume\`.`
      );
    }
    return cv2.warn(
        `No Active Session | ${WARN_EMOJI}`,
        `There is no active VC drag session for ${formatUserLink(target, guild)}.`
      );
  }

  const session = stoppedSession || hadSession;
  const durationSec = Math.round((Date.now() - session.startedAt) / 1000);
  const pauseNote = session.source === 'server_tag' || hasWatchedTags
    ? `\n-# ${BULLET_EMOJI} **Override Active:** Auto tag-drag is paused until an Extra Owner runs \`!tagdrag resume\`.`
    : '';

  return cv2.success(
      `VC Drag Stopped | ${TICK_EMOJI}`,
      `The VC drag session for ${formatUserLink(target, guild)} has been terminated.${pauseNote}`,
      [
        { name: 'Target', value: formatUserLink(target, guild), inline: true },
        { name: 'Session Duration', value: `${durationSec}s`, inline: true },
        { name: 'Stopped By', value: formatUserLink(moderator, guild), inline: true }
      ]
    );
}

// =============================================================
// SERVER TAG VC DRAG LIFECYCLE & COMMAND HANDLERS
// =============================================================

export async function evaluateTagDragForMember(member, options = {}) {
  if (!member?.guild || !member.user || member.user.bot) return false;
  if (!member.voice?.channelId) return false;

  const guild = member.guild;
  const cfg = db.getTagDragConfig(guild.id);
  if (!cfg.rules.some((r) => r.enabled)) return false;

  if (db.isTagDragUserPaused(guild.id, member.id)) return false;
  if (isBotOwnerSync(member.id) || isExtraOwner(guild.id, member.id)) return false;
  if (db.isMoveProtected(guild.id, member.id)) return false;

  const pg = await resolveFreshPrimaryGuild(member.client, member.user, 45_000, Boolean(options.forceRefresh));
  const match = findMatchingTagDragRule(guild.id, pg);
  if (!match) return false;

  const existing = activeDrags.get(`${guild.id}:${member.id}`);
  if (existing) return false;

  const moderator = options.moderator || guild.members.me || { id: member.client?.user?.id || 'bot', user: { tag: 'Athena TagDrag' } };
  await handleVcDrag(guild, moderator, member, match.intervalSec || 2, {
    source: 'server_tag',
    ruleId: match.id,
    matchedRuleLabel: match.tag || match.guildName || match.identityGuildId,
    silent: true
  });
  return true;
}

export async function evaluateTagDragOnUserUpdate(client, oldUser, newUser) {
  if (!client || !newUser?.id || newUser.bot) return;

  const prevPg = oldUser ? normalizePrimaryGuild(oldUser) : null;
  const nextPg = updateUserPrimaryGuildCache(newUser);
  if (
    prevPg &&
    prevPg.identityGuildId === nextPg.identityGuildId &&
    prevPg.identityEnabled === nextPg.identityEnabled &&
    prevPg.tag === nextPg.tag
  ) {
    return;
  }

  for (const guild of client.guilds.cache.values()) {
    const cfg = db.getTagDragConfig(guild.id);
    if (!cfg.rules || cfg.rules.length === 0) continue;

    const sessionKey = `${guild.id}:${newUser.id}`;
    const existing = activeDrags.get(sessionKey);
    const match = findMatchingTagDragRule(guild.id, nextPg);

    if (existing?.source === 'server_tag') {
      if (!match || db.isTagDragUserPaused(guild.id, newUser.id)) {
        stopActiveDragSession(guild.id, newUser.id);
      }
      continue;
    }

    if (!match || db.isTagDragUserPaused(guild.id, newUser.id)) continue;

    const member = guild.members.cache.get(newUser.id) || await guild.members.fetch(newUser.id).catch(() => null);
    if (member && member.voice?.channelId) {
      await evaluateTagDragForMember(member, { forceRefresh: false });
    }
  }
}

async function sweepVoiceMembersForTagDrag(guild) {
  let triggered = 0;
  if (!guild?.channels?.cache) return 0;

  for (const ch of guild.channels.cache.values()) {
    if (!ch || typeof ch.isVoiceBased !== 'function' || !ch.isVoiceBased()) continue;
    for (const member of ch.members?.values?.() || []) {
      const started = await evaluateTagDragForMember(member).catch(() => false);
      if (started) triggered++;
    }
  }
  return triggered;
}

async function handleTagDragAdd(guild, moderator, rawInput, intervalSec, mentionedUser = null) {
  const spec = await resolveTargetTagSpec(guild, rawInput, mentionedUser);
  if (spec.error) {
    return cv2.warn(`Invalid Server / Tag | ${WARN_EMOJI}`, spec.error);
  }

  const { created, rule } = db.addTagDragRule(guild.id, {
    identityGuildId: spec.identityGuildId,
    tag: spec.tag,
    guildName: spec.guildName,
    intervalSec,
    addedBy: moderator.id
  });

  const startedCount = await sweepVoiceMembersForTagDrag(guild);
  const label = formatTagRuleLabel(rule);

  return cv2.success(
    `${created ? 'Server Tag Watch Added' : 'Server Tag Watch Updated'} | ${TICK_EMOJI}`,
    `Users displaying ${label} will be **VC dragged immediately** until they remove/change the tag or an Extra Owner stops it.\n\n` +
    `-# ${BULLET_EMOJI} **Rule ID:** \`${rule.id}\` · **Interval:** \`${rule.intervalSec}s\`\n` +
    `-# ${BULLET_EMOJI} **Live VC Matches Triggered:** \`${startedCount}\` member(s)\n` +
    `-# ${BULLET_EMOJI} **Controls:** \`!tagdrag stop @user\` to pause · \`!tagdrag resume @user\` to resume`
  );
}

async function handleTagDragRemove(guild, rawInput, mentionedUser = null) {
  if (!rawInput && !mentionedUser) {
    return cv2.warn(`Missing Target | ${WARN_EMOJI}`, `Provide a tag, server ID, invite, or \`@user\`: \`!tagdrag remove LEAF\``);
  }

  let lookup = rawInput;
  if (mentionedUser) {
    const pg = await resolveFreshPrimaryGuild(guild.client, mentionedUser, 0, true);
    lookup = pg.identityGuildId || pg.tag || mentionedUser.id;
  }

  const removed = db.removeTagDragRule(guild.id, lookup);
  if (!removed) {
    return cv2.warn(`Not Found | ${WARN_EMOJI}`, `No watched Server Tag rule matched \`${rawInput || lookup}\`. Run \`!tagdrag list\` to view IDs.`);
  }

  // Stop any running server_tag drag sessions tied to the removed rule if no other rule matches
  let stopped = 0;
  for (const [key, session] of activeDrags.entries()) {
    if (!key.startsWith(guild.id + ':') || session.source !== 'server_tag') continue;
    const mem = guild.members.cache.get(session.targetId);
    const pg = mem ? await resolveFreshPrimaryGuild(guild.client, mem.user, 60_000) : null;
    if (!pg || !findMatchingTagDragRule(guild.id, pg)) {
      stopActiveDragSession(guild.id, session.targetId);
      stopped++;
    }
  }

  return cv2.success(
    `Server Tag Rule Removed | ${TICK_EMOJI}`,
    `Removed ${formatTagRuleLabel(removed)} from Server Tag VC Drag.\n` +
    `-# ${BULLET_EMOJI} Stopped **${stopped}** active tag-drag session(s).`
  );
}

function handleTagDragStopUser(guild, moderator, targetOrAll) {
  if (targetOrAll === 'all') {
    let stoppedCount = 0;
    for (const [key, session] of activeDrags.entries()) {
      if (!key.startsWith(guild.id + ':') || session.source !== 'server_tag') continue;
      db.pauseTagDragUser(guild.id, session.targetId, moderator.id, 'Manually stopped all by Extra Owner');
      stopActiveDragSession(guild.id, session.targetId);
      stoppedCount++;
    }
    return cv2.success(
      `All Tag VC Drags Stopped | ${TICK_EMOJI}`,
      `Stopped and paused **${stoppedCount}** active Server Tag VC drag session(s).\n` +
      `-# ${BULLET_EMOJI} Paused users will not be dragged again until an Extra Owner runs \`!tagdrag resume\`.`
    );
  }

  db.pauseTagDragUser(guild.id, targetOrAll.id, moderator.id, 'Manually stopped by Extra Owner');
  const stopped = stopActiveDragSession(guild.id, targetOrAll.id);

  return cv2.success(
    `Tag VC Drag Stopped | ${TICK_EMOJI}`,
    `${formatUserLink(targetOrAll, guild)} is now **stopped & paused** from Server Tag VC Drag${stopped ? ' (running loop terminated)' : ''}.\n` +
    `-# ${BULLET_EMOJI} Even if they stay in or rejoin VC with that tag, Athena will leave them alone until an Extra Owner runs \`!tagdrag resume\`.`
  );
}

async function handleTagDragResume(guild, moderator, targetOrAll) {
  const cfg = db.getTagDragConfig(guild.id);
  if (cfg.rules.length === 0) {
    return cv2.warn(`No Tag Rules Configured | ${WARN_EMOJI}`, `Add a watched Server Tag first using \`!tagdrag add <tag|@user|serverId|invite>\`.`);
  }

  if (targetOrAll === 'all') {
    const resumedIds = db.resumeTagDragUser(guild.id, 'all');
    const startedNow = await sweepVoiceMembersForTagDrag(guild);
    return cv2.success(
      `All Tag VC Drags Resumed | ${TICK_EMOJI}`,
      `Cleared pause overrides for **${resumedIds.length}** user(s).\n` +
      `-# ${BULLET_EMOJI} **Immediately Resumed in VC:** \`${startedNow}\` active user(s)`
    );
  }

  const target = targetOrAll;
  const cleared = db.resumeTagDragUser(guild.id, target.id);
  const startedNow = await evaluateTagDragForMember(target, { moderator, forceRefresh: true });

  return cv2.success(
    `Tag VC Drag Resumed | ${TICK_EMOJI}`,
    `Server Tag VC Drag override ${cleared.length ? 'removed' : 'verified active'} for ${formatUserLink(target, guild)}.\n` +
    `-# ${BULLET_EMOJI} **Status:** ${startedNow ? 'Currently in VC wearing watched tag — dragging resumed immediately!' : 'Armed — will drag immediately if/when they display a watched tag in VC.'}`
  );
}

async function handleTagDragToggle(guild, rawInput, mentionedUser = null) {
  if (!rawInput && !mentionedUser) {
    return cv2.warn(`Missing Target | ${WARN_EMOJI}`, `Specify a tag or rule ID: \`!tagdrag toggle LEAF\``);
  }
  let lookup = rawInput;
  if (mentionedUser) {
    const pg = await resolveFreshPrimaryGuild(guild.client, mentionedUser, 0, true);
    lookup = pg.identityGuildId || pg.tag || mentionedUser.id;
  }

  const rule = db.toggleTagDragRule(guild.id, lookup);
  if (!rule) {
    return cv2.warn(`Not Found | ${WARN_EMOJI}`, `No Server Tag rule matched \`${rawInput || lookup}\`.`);
  }

  if (!rule.enabled) {
    for (const [key, session] of activeDrags.entries()) {
      if (key.startsWith(guild.id + ':') && session.source === 'server_tag' && session.ruleId === rule.id) {
        stopActiveDragSession(guild.id, session.targetId);
      }
    }
    return cv2.warn(
      `Tag Rule Paused | ${WARN_EMOJI}`,
      `Disabled Server Tag rule ${formatTagRuleLabel(rule)}. Use \`!tagdrag toggle\` again to re-enable.`
    );
  }

  const startedCount = await sweepVoiceMembersForTagDrag(guild);
  return cv2.success(
    `Tag Rule Enabled | ${TICK_EMOJI}`,
    `Enabled Server Tag rule ${formatTagRuleLabel(rule)}. Triggered **${startedCount}** live match(es) in VC.`
  );
}

function handleTagDragClear(guild) {
  const count = db.clearTagDragRules(guild.id);
  let stopped = 0;
  for (const [key, session] of activeDrags.entries()) {
    if (key.startsWith(guild.id + ':') && session.source === 'server_tag') {
      stopActiveDragSession(guild.id, session.targetId);
      stopped++;
    }
  }
  return cv2.success(
    `Server Tag Rules Cleared | ${TICK_EMOJI}`,
    `Removed **${count}** watched Server Tag rule(s) and stopped **${stopped}** active tag-drag session(s).`
  );
}

function buildTagDragListPayload(guild) {
  const cfg = db.getTagDragConfig(guild.id);
  const rulesText = cfg.rules.length > 0
    ? cfg.rules.map((r, i) => `> -# ${BULLET_EMOJI} **#${i + 1}** ${formatTagRuleLabel(r)} · \`${r.intervalSec}s\` · ${r.enabled ? TICK_EMOJI + ' Armed' : WARN_EMOJI + ' Paused'}`).join('\n')
    : `> -# ${BULLET_EMOJI} No watched Server Tags configured yet. Add one with \`!tagdrag add <tag|@user|serverId|invite>\`.`;

  const liveSessions = [];
  for (const [key, session] of activeDrags.entries()) {
    if (key.startsWith(guild.id + ':') && session.source === 'server_tag') {
      const dur = Math.round((Date.now() - session.startedAt) / 1000);
      liveSessions.push(`> -# ${BULLET_EMOJI} ${formatUserLink(session.targetId, guild)} · Tag \`${session.matchedRuleLabel || session.ruleId}\` · \`${dur}s\``);
    }
  }

  const pausedEntries = Object.entries(cfg.pausedUsers || {});
  const pausedText = pausedEntries.length > 0
    ? pausedEntries.map(([uid, info]) => `> -# ${BULLET_EMOJI} ${formatUserLink(uid, guild)} (stopped by ${info.stoppedBy ? formatUserLink(info.stoppedBy, guild) : 'Extra Owner'})`).join('\n')
    : `> -# ${BULLET_EMOJI} None`;

  return cv2.info(
    `Server Tag VC Drag Matrix | ${UPTIME_EMOJI}`,
    `-# **Watched Server Tags (${cfg.rules.length})**\n${rulesText}\n\n` +
    `-# **Active Tag Drag Sessions (${liveSessions.length})**\n${liveSessions.length > 0 ? liveSessions.join('\n') : `> -# ${BULLET_EMOJI} None active`}\n\n` +
    `-# **Manually Stopped / Paused Users (${pausedEntries.length})**\n${pausedText}\n\n` +
    `-# **Aliases:** \`!tagdrag\`, \`!tdrag\`, \`!servertagdrag\`, \`!clandrag\`, \`!dragbytag\`, \`!tagloop\`, \`!tagdragstop\`, \`!tagdragresume\``
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
        if (!target) {
          db.removeActiveVcDrag(guildId, targetId);
          continue;
        }
        if (dragInfo.source === 'server_tag') {
          const started = await evaluateTagDragForMember(target, { forceRefresh: true }).catch(() => false);
          if (!started) db.removeActiveVcDrag(guildId, targetId);
          else resumed++;
          continue;
        }
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
      const modeLabel = session.source === 'server_tag' ? ` · Tag: ${session.matchedRuleLabel || session.ruleId}` : '';
      sessions.push({
        name: `Session: ${session.targetTag}${modeLabel}`,
        value: `User: ${formatUserLink(session.targetId, guild)} (\`${session.targetId}\`) | Interval: **${session.intervalSec}s** | Running: **${durationSec}s**`,
        inline: false
      });
    }
  }

  if (sessions.length === 0) {
    return cv2.info('No Active Drags', 'There are no ongoing VC drag sessions in this server.');
  }

  return cv2.info(
      `Active VC Drag Sessions (${sessions.length})`,
      `Use \`/vcdragstop <@user>\` or \`!tagdrag stop @user\` to terminate any session.`,
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
