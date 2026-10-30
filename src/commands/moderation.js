import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { parseDuration, canModerate, logToSecurityChannel, isBotOwnerSync, isExtraOwner, getUserTierName, cleanDisplayName, renderSleekProgressBar } from '../utils/helpers.js';
import { executeQuarantine } from './security.js';
import { logServerEvent } from '../utils/serverLogger.js'; // We will implement security.js next
import { generateCommandStatusBanner } from '../utils/canvasCards.js';

export const commands = [
  // --- MUTEALL COMMAND ---
  {
    name: 'muteall',
    aliases: ['vcmuteall', 'servermuteall'],
    description: 'Voice-mutes all members in your current voice channel.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.MuteMembers],
    options: [],
    async executePrefix(message) {
      const result = await handleMuteAll(message.guild, message.member);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const result = await handleMuteAll(interaction.guild, interaction.member);
      await interaction.reply(result);
    }
  },

  // --- UNMUTEALL COMMAND ---
  {
    name: 'unmuteall',
    aliases: ['vcunmuteall', 'serverunmuteall'],
    description: 'Voice-unmutes all members in your current voice channel.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.MuteMembers],
    options: [],
    async executePrefix(message) {
      const result = await handleUnmuteAll(message.guild, message.member);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const result = await handleUnmuteAll(interaction.guild, interaction.member);
      await interaction.reply(result);
    }
  },

  // --- MUTE COMMAND ---
  {
    name: 'mute',
    aliases: ['m', 'silence'],
    description: 'Server-mutes one or more members in voice channels.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.MuteMembers],
    options: [
      { name: 'user', description: 'The member to mute', type: 6, required: true },
      { name: 'user2', description: 'Additional member', type: 6, required: false },
      { name: 'user3', description: 'Additional member', type: 6, required: false }
    ],
    async executePrefix(message) {
      const targets = message.mentions.members;
      if (!targets.size) return message.reply(cv2.warn('Usage', `${message.author} Mention members to mute: \`!mute @user1\``));
      const result = await handleVcAction(message.guild, message.member, targets, 'mute');
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const targets = new Map();
      for (let i = 1; i <= 3; i++) {
        const u = interaction.options.getUser(i === 1 ? 'user' : `user${i}`);
        if (u) {
          const m = await interaction.guild.members.fetch(u.id).catch(() => null);
          if (m) targets.set(m.id, m);
        }
      }
      const result = await handleVcAction(interaction.guild, interaction.member, targets, 'mute');
      await interaction.reply(result);
    }
  },

  // --- UNMUTE COMMAND ---
  {
    name: 'unmute',
    description: 'Server-unmutes one or more members in voice channels.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.MuteMembers],
    options: [
      { name: 'user', description: 'The member to unmute', type: 6, required: true },
      { name: 'user2', description: 'Additional member', type: 6, required: false },
      { name: 'user3', description: 'Additional member', type: 6, required: false }
    ],
    async executePrefix(message) {
      const targets = message.mentions.members;
      if (!targets.size) return message.reply(cv2.warn('Usage', `${message.author} Mention members to unmute: \`!unmute @user1\``));
      const result = await handleVcAction(message.guild, message.member, targets, 'unmute');
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const targets = new Map();
      for (let i = 1; i <= 3; i++) {
        const u = interaction.options.getUser(i === 1 ? 'user' : `user${i}`);
        if (u) {
          const m = await interaction.guild.members.fetch(u.id).catch(() => null);
          if (m) targets.set(m.id, m);
        }
      }
      const result = await handleVcAction(interaction.guild, interaction.member, targets, 'unmute');
      await interaction.reply(result);
    }
  },

  // --- DEAFEN COMMAND ---
  {
    name: 'deafen',
    description: 'Server-deafens one or more members in voice channels.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.DeafenMembers],
    options: [
      { name: 'user', description: 'The member to deafen', type: 6, required: true },
      { name: 'user2', description: 'Additional member', type: 6, required: false },
      { name: 'user3', description: 'Additional member', type: 6, required: false }
    ],
    async executePrefix(message) {
      const targets = message.mentions.members;
      if (!targets.size) return message.reply(cv2.warn('Usage', `${message.author} Mention members to deafen: \`!deafen @user1\``));
      const result = await handleVcAction(message.guild, message.member, targets, 'deafen');
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const targets = new Map();
      for (let i = 1; i <= 3; i++) {
        const u = interaction.options.getUser(i === 1 ? 'user' : `user${i}`);
        if (u) {
          const m = await interaction.guild.members.fetch(u.id).catch(() => null);
          if (m) targets.set(m.id, m);
        }
      }
      const result = await handleVcAction(interaction.guild, interaction.member, targets, 'deafen');
      await interaction.reply(result);
    }
  },

  // --- UNDEAFEN COMMAND ---
  {
    name: 'undeafen',
    description: 'Server-undeafens one or more members in voice channels.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.DeafenMembers],
    options: [
      { name: 'user', description: 'The member to undeafen', type: 6, required: true },
      { name: 'user2', description: 'Additional member', type: 6, required: false },
      { name: 'user3', description: 'Additional member', type: 6, required: false }
    ],
    async executePrefix(message) {
      const targets = message.mentions.members;
      if (!targets.size) return message.reply(cv2.warn('Usage', `${message.author} Mention members to undeafen: \`!undeafen @user1\``));
      const result = await handleVcAction(message.guild, message.member, targets, 'undeafen');
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const targets = new Map();
      for (let i = 1; i <= 3; i++) {
        const u = interaction.options.getUser(i === 1 ? 'user' : `user${i}`);
        if (u) {
          const m = await interaction.guild.members.fetch(u.id).catch(() => null);
          if (m) targets.set(m.id, m);
        }
      }
      const result = await handleVcAction(interaction.guild, interaction.member, targets, 'undeafen');
      await interaction.reply(result);
    }
  },

  // --- WARN COMMAND ---
  {
    name: 'warn',
    aliases: ['w'],
    description: 'Issues a formal warning to a user and logs it.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ModerateMembers],
    options: [
      {
        name: 'user',
        description: 'The member to warn',
        type: 6, // User
        required: true
      },
      {
        name: 'reason',
        description: 'Reason for the warning',
        type: 3, // String
        required: true
      }
    ],
    async executePrefix(message, args) {
      const target = message.mentions.members.first();
      if (!target) {
        return message.reply(cv2.warn('Command Error', `${message.author} Please mention a valid member to warn.\n\n**Usage:** \`!warn <@user> <reason>\``));
      }
      
      const reason = args.slice(1).join(' ') || 'No reason provided';
      const result = await handleWarn(message.guild, message.member, target, reason);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const targetUser = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      
      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!target) {
        return interaction.reply(cv2.warn('Command Error', `${interaction.user} Member not found in this server.`));
      }

      const result = await handleWarn(interaction.guild, interaction.member, target, reason);
      await interaction.reply(result);
    }
  },

  // --- WARNINGS COMMAND ---
  {
    name: 'warnings',
    aliases: ['warns', 'infractions'],
    description: 'Shows active warnings for a member.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ModerateMembers],
    options: [
      {
        name: 'user',
        description: 'The member whose warnings to view',
        type: 6,
        required: true
      }
    ],
    async executePrefix(message) {
      const target = message.mentions.members.first() || message.member;
      const result = await handleWarnings(message.guild, target);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      
      if (!target) {
        return interaction.reply(cv2.warn('Command Error', `${interaction.user} Member not found.`));
      }

      const result = await handleWarnings(interaction.guild, target);
      await interaction.reply(result);
    }
  },

  // --- CLEARWARNS COMMAND ---
  {
    name: 'clearwarns',
    aliases: ['cw', 'delwarns', 'resetwarns'],
    description: 'Clears all active warnings for a member.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ModerateMembers],
    options: [
      {
        name: 'user',
        description: 'The member whose warnings will be cleared',
        type: 6,
        required: true
      }
    ],
    async executePrefix(message) {
      const target = message.mentions.members.first();
      if (!target) {
        return message.reply(cv2.warn('Command Error', `${message.author} Please mention a valid member to clear warnings.\n\n**Usage:** \`!clearwarns <@user>\``));
      }
      const result = await handleClearWarns(message.guild, message.member, target);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const targetUser = interaction.options.getUser('user');
      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      
      if (!target) {
        return interaction.reply(cv2.warn('Command Error', `${interaction.user} Member not found.`));
      }

      const result = await handleClearWarns(interaction.guild, interaction.member, target);
      await interaction.reply(result);
    }
  },

  // --- TIMEOUT COMMAND ---
  {
    name: 'timeout',
    aliases: ['to', 'mute', 'm', 'silence'],
    description: 'Places a member on timeout (native Discord mute).',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ModerateMembers],
    options: [
      {
        name: 'user',
        description: 'Member to mute',
        type: 6,
        required: true
      },
      {
        name: 'duration',
        description: 'Duration (e.g. 10m, 2h, 1d)',
        type: 3,
        required: true
      },
      {
        name: 'reason',
        description: 'Reason for the timeout',
        type: 3,
        required: false
      }
    ],
    async executePrefix(message, args) {
      const target = message.mentions.members.first();
      if (!target) {
        return message.reply(cv2.warn('Command Error', `${message.author} Please mention a valid member.\n\n**Usage:** \`!timeout <@user> <duration> [reason]\``));
      }
      
      const durationStr = args[1];
      if (!durationStr) {
        return message.reply(cv2.warn('Command Error', `${message.author} Please specify a duration.\n\n**Usage:** \`!timeout <@user> <10m|2h|1d> [reason]\``));
      }
      const reason = args.slice(2).join(' ') || 'No reason provided';

      const result = await handleTimeout(message.guild, message.member, target, durationStr, reason);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const targetUser = interaction.options.getUser('user');
      const durationStr = interaction.options.getString('duration');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!target) {
        return interaction.reply(cv2.warn('Command Error', `${interaction.user} Member not found.`));
      }

      const result = await handleTimeout(interaction.guild, interaction.member, target, durationStr, reason);
      await interaction.reply(result);
    }
  },

  // --- UNTIMEOUT / REMOVE TIMEOUT COMMAND ---
  {
    name: 'untimeout',
    aliases: ['removetimeout', 'unto', 'cleartimeout', 'unmute', 'um'],
    description: 'Removes the timeout from a member.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ModerateMembers],
    options: [
      {
        name: 'user',
        description: 'Member to remove timeout from',
        type: 6,
        required: true
      },
      {
        name: 'reason',
        description: 'Reason for removing timeout',
        type: 3,
        required: false
      }
    ],
    async executePrefix(message, args) {
      const target = message.mentions.members.first() || (args[0] ? await message.guild.members.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null) : null);
      if (!target) {
        return message.reply(cv2.warn('Command Error', `${message.author} Please mention a valid member or provide their ID.\n\n**Usage:** \`!untimeout <@user> [reason]\``));
      }
      const reason = args.slice(1).join(' ') || 'No reason provided';
      const result = await handleUntimeout(message.guild, message.member, target, reason);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const targetUser = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!target) {
        return interaction.reply(cv2.warn('Command Error', `${interaction.user} Member not found.`));
      }

      const result = await handleUntimeout(interaction.guild, interaction.member, target, reason);
      await interaction.reply(result);
    }
  },

  // --- KICK COMMAND ---
  {
    name: 'kick',
    aliases: ['k'],
    description: 'Kicks a member from the server.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.KickMembers],
    options: [
      {
        name: 'user',
        description: 'Member to kick',
        type: 6,
        required: true
      },
      {
        name: 'reason',
        description: 'Reason for kick',
        type: 3,
        required: false
      }
    ],
    async executePrefix(message, args) {
      const target = message.mentions.members.first();
      if (!target) {
        return message.reply(cv2.warn('Command Error', `${message.author} Please mention a valid member.\n\n**Usage:** \`!kick <@user> [reason]\``));
      }
      const reason = args.slice(1).join(' ') || 'No reason provided';
      const result = await handleKick(message.guild, message.member, target, reason);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const targetUser = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!target) {
        return interaction.reply(cv2.warn('Command Error', `${interaction.user} Member not found.`));
      }

      const result = await handleKick(interaction.guild, interaction.member, target, reason);
      await interaction.reply(result);
    }
  },

  // --- BAN COMMAND ---
  {
    name: 'ban',
    aliases: ['b'],
    description: 'Permanently bans a member from the server.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.BanMembers],
    options: [
      {
        name: 'user',
        description: 'Member to ban',
        type: 6,
        required: true
      },
      {
        name: 'reason',
        description: 'Reason for ban',
        type: 3,
        required: false
      }
    ],
    async executePrefix(message, args) {
      const { isServerAdmin } = await import('../utils/helpers.js');
      if (!isServerAdmin(message.member, message.guild.id)) {
        return message.reply(cv2.danger('Access Denied', 'The `!ban` command is restricted to **Admin Tier** roles and server administrators.')).catch(() => null);
      }

      // Accept @mention or raw user ID (works for non-members too)
      let target = message.mentions.members.first();
      let targetId = null;

      if (!target && args[0]) {
        targetId = args[0].replace(/[<@!>]/g, '').trim();
        if (/^\d{17,20}$/.test(targetId)) {
          target = await message.guild.members.fetch(targetId).catch(() => null);
        } else {
          return message.reply(cv2.warn('Command Error', `${message.author} Please mention a member or provide a valid User ID.\n\n**Usage:** \`!ban <@user or userId> [reason]\``));
        }
      }

      if (!target && !targetId) {
        return message.reply(cv2.warn('Command Error', `${message.author} Please mention a member or provide a User ID.\n\n**Usage:** \`!ban <@user or userId> [reason]\``));
      }

      const reason = args.slice(1).join(' ') || 'No reason provided';

      if (target) {
        const result = await handleBan(message.guild, message.member, target, reason);
        await message.reply(result);
      } else {
        const result = await handleBanById(message.guild, message.member, targetId, reason);
        await message.reply(result);
      }
    },
    async executeSlash(interaction) {
      const { isServerAdmin } = await import('../utils/helpers.js');
      if (!isServerAdmin(interaction.member, interaction.guild.id)) {
        return interaction.reply(cv2.danger('Access Denied', 'The `/ban` command is restricted to **Admin Tier** roles and server administrators.'));
      }

      const targetUser = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!target) {
        // Not in server - ban by user ID directly
        const result = await handleBanById(interaction.guild, interaction.member, targetUser.id, reason, targetUser);
        return interaction.reply(result);
      }

      const result = await handleBan(interaction.guild, interaction.member, target, reason);
      await interaction.reply(result);
    }
  },

  // --- TEMPBAN COMMAND ---
  {
    name: 'tempban',
    aliases: ['tb', 'temporaryban'],
    description: 'Temporarily bans a member from the server with auto-unban expiration.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.BanMembers],
    options: [
      { name: 'user', description: 'Member to temporarily ban', type: 6, required: true },
      { name: 'duration', description: 'Duration (e.g. 10m, 2h, 7d)', type: 3, required: true },
      { name: 'reason', description: 'Reason for temporary ban', type: 3, required: false }
    ],
    async executePrefix(message, args) {
      const { isServerAdmin } = await import('../utils/helpers.js');
      if (!isServerAdmin(message.member, message.guild.id)) {
        return message.reply(cv2.danger('Access Denied', 'The `!tempban` command is restricted to **Admin Tier** roles and server administrators.')).catch(() => null);
      }

      if (!args[0]) {
        const errorContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Temporary Ban Error\n` +
                `-# ${BULLET_EMOJI} **Issue:** **__Missing Target Member or Duration__**\n` +
                `-# ${BULLET_EMOJI} **Usage:** \`!tempban <@user|id> <duration> [reason]\`\n` +
                `-# ${BULLET_EMOJI} **Examples:** \`!tempban @user 2h Toxicity\`, \`!tempban @user 7d Raid Attempt\``
            }
          ]
        };
        return message.reply({ components: [errorContainer], flags: (MessageFlags.IsComponentsV2 || 32768) });
      }

      let target = message.mentions.members.first();
      let targetId = args[0].replace(/[<@!>]/g, '').trim();

      if (!target && /^\d{17,20}$/.test(targetId)) {
        target = await message.guild.members.fetch(targetId).catch(() => null);
      }

      if (!target && !/^\d{17,20}$/.test(targetId)) {
        const errorContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Invalid Target\n` +
                `-# ${BULLET_EMOJI} **Issue:** **__Please specify a valid @mention or User ID__**`
            }
          ]
        };
        return message.reply({ components: [errorContainer], flags: (MessageFlags.IsComponentsV2 || 32768) });
      }

      const durationStr = args[1];
      const durationMs = parseDuration(durationStr);
      if (!durationMs) {
        const errorContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Invalid Duration\n` +
                `-# ${BULLET_EMOJI} **Issue:** **__Unsupported or missing duration format__**\n` +
                `-# ${BULLET_EMOJI} **Valid Formats:** \`10m\` (10 mins), \`2h\` (2 hours), \`1d\` (1 day), \`7d\` (7 days)`
            }
          ]
        };
        return message.reply({ components: [errorContainer], flags: (MessageFlags.IsComponentsV2 || 32768) });
      }

      const reason = args.slice(2).join(' ') || 'No reason specified';
      const expiresAt = Date.now() + durationMs;

      // Protection & Hierarchy checks
      const finalId = target ? target.id : targetId;
      if (isBotOwnerSync(finalId) || isExtraOwner(message.guild.id, finalId)) {
        const immuneContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Untouchable Entity\n` +
                `-# ${BULLET_EMOJI} **Status:** **__User is shielded by Athena Prime authorization tier__**`
            }
          ]
        };
        return message.reply({ components: [immuneContainer], flags: (MessageFlags.IsComponentsV2 || 32768) });
      }

      if (target && !canModerate(message.member, target)) {
        const permContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Hierarchy Blocked\n` +
                `-# ${BULLET_EMOJI} **Status:** **__Target possesses higher or equal role permissions__**`
            }
          ]
        };
        return message.reply({ components: [permContainer], flags: (MessageFlags.IsComponentsV2 || 32768) });
      }

      try {
        await message.guild.bans.create(finalId, { reason: `[TempBan: ${durationStr}] ${reason} - by ${message.author.tag}` });
        db.addTempBan(message.guild.id, finalId, expiresAt, reason, message.author.id);

        const expiryDate = Math.floor(expiresAt / 1000);
        const successContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Member Temporarily Banned | <a:03_tick_circle:1565665642084827206>\n` +
                `-# ${BULLET_EMOJI} **Target:** <@${finalId}> (\`${finalId}\`)\n` +
                `-# ${BULLET_EMOJI} **Duration:** \`${durationStr}\`\n` +
                `-# ${BULLET_EMOJI} **Unban Expiration:** <t:${expiryDate}:R> (<t:${expiryDate}:F>)\n` +
                `-# ${BULLET_EMOJI} **Reason:** ${reason}\n` +
                `-# ${BULLET_EMOJI} **Moderator:** ${message.author}`
            }
          ]
        };
        return message.reply({ components: [successContainer], flags: (MessageFlags.IsComponentsV2 || 32768) });
      } catch (err) {
        const failContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Execution Failed\n` +
                `-# ${BULLET_EMOJI} **Error:** \`${err.message}\``
            }
          ]
        };
        return message.reply({ components: [failContainer], flags: (MessageFlags.IsComponentsV2 || 32768) });
      }
    },
    async executeSlash(interaction) {
      const { isServerAdmin } = await import('../utils/helpers.js');
      if (!isServerAdmin(interaction.member, interaction.guild.id)) {
        return interaction.reply(cv2.danger('Access Denied', 'The `/tempban` command is restricted to **Admin Tier** roles and server administrators.'));
      }

      const targetUser = interaction.options.getUser('user');
      const durationStr = interaction.options.getString('duration');
      const reason = interaction.options.getString('reason') || 'No reason specified';

      const durationMs = parseDuration(durationStr);
      if (!durationMs) {
        return interaction.reply({
          components: [{
            type: 17,
            components: [{
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Invalid Duration\n` +
                `-# ${BULLET_EMOJI} **Issue:** **__Unsupported duration format__**\n` +
                `-# ${BULLET_EMOJI} **Valid Formats:** \`10m\`, \`2h\`, \`1d\`, \`7d\``
            }]
          }],
          flags: (MessageFlags.IsComponentsV2 || 32768) | MessageFlags.Ephemeral
        });
      }

      if (isBotOwnerSync(targetUser.id) || isExtraOwner(interaction.guild.id, targetUser.id)) {
        return interaction.reply({
          components: [{
            type: 17,
            components: [{
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Untouchable Entity\n` +
                `-# ${BULLET_EMOJI} **Status:** **__User is shielded by Athena Prime authorization tier__**`
            }]
          }],
          flags: (MessageFlags.IsComponentsV2 || 32768) | MessageFlags.Ephemeral
        });
      }

      const expiresAt = Date.now() + durationMs;
      try {
        await interaction.guild.bans.create(targetUser.id, { reason: `[TempBan: ${durationStr}] ${reason} - by ${interaction.user.tag}` });
        db.addTempBan(interaction.guild.id, targetUser.id, expiresAt, reason, interaction.user.id);

        const expiryDate = Math.floor(expiresAt / 1000);
        return interaction.reply({
          components: [{
            type: 17,
            components: [{
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Member Temporarily Banned | <a:03_tick_circle:1565665642084827206>\n` +
                `-# ${BULLET_EMOJI} **Target:** <@${targetUser.id}> (\`${targetUser.id}\`)\n` +
                `-# ${BULLET_EMOJI} **Duration:** \`${durationStr}\`\n` +
                `-# ${BULLET_EMOJI} **Unban Expiration:** <t:${expiryDate}:R> (<t:${expiryDate}:F>)\n` +
                `-# ${BULLET_EMOJI} **Reason:** ${reason}\n` +
                `-# ${BULLET_EMOJI} **Moderator:** ${interaction.user}`
            }]
          }],
          flags: (MessageFlags.IsComponentsV2 || 32768)
        });
      } catch (err) {
        return interaction.reply({
          components: [{
            type: 17,
            components: [{
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Execution Failed\n-# ${BULLET_EMOJI} **Error:** \`${err.message}\``
            }]
          }],
          flags: (MessageFlags.IsComponentsV2 || 32768) | MessageFlags.Ephemeral
        });
      }
    }
  },

  // --- TEMPTIMEOUT COMMAND ---
  {
    name: 'temptimeout',
    aliases: ['tto', 'tempmute'],
    description: 'Places a member on temporary timeout with structured notification.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ModerateMembers],
    options: [
      { name: 'user', description: 'Member to timeout', type: 6, required: true },
      { name: 'duration', description: 'Duration (e.g. 10m, 2h, 1d)', type: 3, required: true },
      { name: 'reason', description: 'Reason for timeout', type: 3, required: false }
    ],
    async executePrefix(message, args) {
      const target = message.mentions.members.first();
      if (!target) {
        const errorContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Temporary Timeout Error\n` +
                `-# ${BULLET_EMOJI} **Issue:** **__Missing Target Member__**\n` +
                `-# ${BULLET_EMOJI} **Usage:** \`!temptimeout <@user> <duration> [reason]\`\n` +
                `-# ${BULLET_EMOJI} **Examples:** \`!temptimeout @user 10m Spamming\``
            }
          ]
        };
        return message.reply({ components: [errorContainer], flags: (MessageFlags.IsComponentsV2 || 32768) });
      }

      const durationStr = args[1];
      const durationMs = parseDuration(durationStr);
      if (!durationMs || durationMs > 28 * 24 * 3600 * 1000) {
        const errorContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Invalid Duration\n` +
                `-# ${BULLET_EMOJI} **Issue:** **__Duration must be between 10s and 28 days__**\n` +
                `-# ${BULLET_EMOJI} **Valid Formats:** \`10m\`, \`2h\`, \`1d\`, \`7d\``
            }
          ]
        };
        return message.reply({ components: [errorContainer], flags: (MessageFlags.IsComponentsV2 || 32768) });
      }

      const reason = args.slice(2).join(' ') || 'No reason specified';

      if (!canModerate(message.member, target)) {
        const permContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Hierarchy Blocked\n` +
                `-# ${BULLET_EMOJI} **Status:** **__Target possesses higher or equal role permissions__**`
            }
          ]
        };
        return message.reply({ components: [permContainer], flags: (MessageFlags.IsComponentsV2 || 32768) });
      }

      try {
        await target.timeout(durationMs, `${reason} - by ${message.author.tag}`);
        const expiryDate = Math.floor((Date.now() + durationMs) / 1000);
        const successContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Member Timed Out | <a:03_tick_circle:1565665642084827206>\n` +
                `-# ${BULLET_EMOJI} **Target:** ${target} (\`${target.id}\`)\n` +
                `-# ${BULLET_EMOJI} **Duration:** \`${durationStr}\`\n` +
                `-# ${BULLET_EMOJI} **Lift Expiration:** <t:${expiryDate}:R> (<t:${expiryDate}:F>)\n` +
                `-# ${BULLET_EMOJI} **Reason:** ${reason}\n` +
                `-# ${BULLET_EMOJI} **Moderator:** ${message.author}`
            }
          ]
        };
        return message.reply({ components: [successContainer], flags: (MessageFlags.IsComponentsV2 || 32768) });
      } catch (err) {
        const failContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Execution Failed\n-# ${BULLET_EMOJI} **Error:** \`${err.message}\``
            }
          ]
        };
        return message.reply({ components: [failContainer], flags: (MessageFlags.IsComponentsV2 || 32768) });
      }
    },
    async executeSlash(interaction) {
      const targetUser = interaction.options.getUser('user');
      const durationStr = interaction.options.getString('duration');
      const reason = interaction.options.getString('reason') || 'No reason specified';

      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!target) {
        return interaction.reply({
          components: [{
            type: 17,
            components: [{
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Member Not Found\n-# ${BULLET_EMOJI} **Issue:** **__Target is not present in this server__**`
            }]
          }],
          flags: (MessageFlags.IsComponentsV2 || 32768) | MessageFlags.Ephemeral
        });
      }

      const durationMs = parseDuration(durationStr);
      if (!durationMs || durationMs > 28 * 24 * 3600 * 1000) {
        return interaction.reply({
          components: [{
            type: 17,
            components: [{
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Invalid Duration\n` +
                `-# ${BULLET_EMOJI} **Issue:** **__Duration must be between 10s and 28 days__**\n` +
                `-# ${BULLET_EMOJI} **Valid Formats:** \`10m\`, \`2h\`, \`1d\`, \`7d\``
            }]
          }],
          flags: (MessageFlags.IsComponentsV2 || 32768) | MessageFlags.Ephemeral
        });
      }

      if (!canModerate(interaction.member, target)) {
        return interaction.reply({
          components: [{
            type: 17,
            components: [{
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Hierarchy Blocked\n` +
                `-# ${BULLET_EMOJI} **Status:** **__Target possesses higher or equal role permissions__**`
            }]
          }],
          flags: (MessageFlags.IsComponentsV2 || 32768) | MessageFlags.Ephemeral
        });
      }

      try {
        await target.timeout(durationMs, `${reason} - by ${interaction.user.tag}`);
        const expiryDate = Math.floor((Date.now() + durationMs) / 1000);
        return interaction.reply({
          components: [{
            type: 17,
            components: [{
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Member Timed Out | <a:03_tick_circle:1565665642084827206>\n` +
                `-# ${BULLET_EMOJI} **Target:** ${target} (\`${target.id}\`)\n` +
                `-# ${BULLET_EMOJI} **Duration:** \`${durationStr}\`\n` +
                `-# ${BULLET_EMOJI} **Lift Expiration:** <t:${expiryDate}:R> (<t:${expiryDate}:F>)\n` +
                `-# ${BULLET_EMOJI} **Reason:** ${reason}\n` +
                `-# ${BULLET_EMOJI} **Moderator:** ${interaction.user}`
            }]
          }],
          flags: (MessageFlags.IsComponentsV2 || 32768)
        });
      } catch (err) {
        return interaction.reply({
          components: [{
            type: 17,
            components: [{
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Execution Failed\n-# ${BULLET_EMOJI} **Error:** \`${err.message}\``
            }]
          }],
          flags: (MessageFlags.IsComponentsV2 || 32768) | MessageFlags.Ephemeral
        });
      }
    }
  },

  // --- SAY COMMAND ---
  {
    name: 'say',
    description: 'Sends a raw text message to the designated channel.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageMessages],
    options: [
      {
        name: 'message',
        description: 'The text message to send',
        type: 3,
        required: true
      },
      {
        name: 'channel',
        description: 'Optional target text/voice channel',
        type: 7,
        required: false
      },
      {
        name: 'channel_id',
        description: 'Optional channel ID (to send to remote servers)',
        type: 3,
        required: false
      }
    ],
    async executePrefix(message, args) {
      if (args.length === 0) {
        return message.reply(cv2.warn('Command Error', `${message.author} Please enter a message to send.\n\n**Usage:** \`!say [#channel or id] <message>\``));
      }

      let channel = null;
      let text = '';

      // Accept GuildText, GuildAnnouncement (news channels), threads, and GuildVoice
      const sendableTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.GuildVoice];

      // Try to parse the first argument as a channel mention or ID
      const firstArg = args[0].replace(/[<#>]/g, '');
      // Look globally across all servers the bot is in
      const possibleChannel = message.client.channels.cache.get(firstArg)
        || (message.guild && message.guild.channels.cache.find(c => c.name.toLowerCase() === firstArg.toLowerCase()));

      if (possibleChannel && sendableTypes.includes(possibleChannel.type)) {
        channel = possibleChannel;
        text = args.slice(1).join(' ');
      } else {
        channel = message.channel;
        text = args.join(' ');
      }

      if (!text.trim()) {
        return message.reply(cv2.warn('Command Error', `${message.author} Please enter a message to send.`));
      }

      // Check bot has permission to send in the target channel
      const targetGuild = channel.guild;
      if (!targetGuild) {
         return message.reply(cv2.danger('Error', 'Target must be a server channel.'));
      }
      
      const botMember = targetGuild.members.me;
      if (!channel.permissionsFor(botMember).has(PermissionFlagsBits.SendMessages)) {
        return message.reply(cv2.danger('Permission Error', `I don't have **Send Messages** permission in ${channel}. Grant me access to that channel first.`));
      }

      try {
        await channel.send(text);
        await message.delete().catch(() => null);
      } catch (err) {
        await message.reply(cv2.danger('<:off:1533844858983157851> Failed', `Failed to send message in ${channel}.\n\`${err.message}\``)).catch(() => null);
      }
    },
    async executeSlash(interaction) {
      const text = interaction.options.getString('message');
      let channel = interaction.options.getChannel('channel') || interaction.channel;
      const channelId = interaction.options.getString('channel_id');

      if (channelId) {
        const remoteChannel = interaction.client.channels.cache.get(channelId);
        if (!remoteChannel) {
          return interaction.reply(cv2.warn('Command Error', `${interaction.user} Could not find a channel with that ID. Make sure the bot is in that server.`));
        }
        channel = remoteChannel;
      }

      // Accept GuildText, GuildAnnouncement (news), threads, and VC chat
      const sendableTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.GuildVoice];

      if (!sendableTypes.includes(channel.type)) {
        return interaction.reply(cv2.warn('Command Error', `${interaction.user} Target must be a text channel, announcement channel, thread, or voice channel.`));
      }

      // Check bot has permission to send in the target channel
      const targetGuild = channel.guild;
      if (!targetGuild) {
         return interaction.reply(cv2.danger('Error', 'Target must be a server channel.'));
      }

      const botMember = targetGuild.members.me;
      if (!channel.permissionsFor(botMember).has(PermissionFlagsBits.SendMessages)) {
        return interaction.reply(cv2.danger('Permission Error', `I don't have **Send Messages** permission in ${channel}.\n\nGrant me access to that channel first.`));
      }

      try {
        await channel.send(text);
        await interaction.reply(cv2.success('Message Dispatched', `Message successfully sent to ${channel}.`));
      } catch (err) {
        await interaction.reply(cv2.danger('<:off:1533844858983157851> Failed', `Failed to send message in ${channel}.\n\`${err.message}\``)).catch(() => null);
      }
    }
  },




  // --- CREATE ROLE COMMAND ---
  {
    name: 'createrole',
    slashHidden: true,
    description: 'Creates a new server role with a specified name and hex color.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageRoles],
    options: [
      {
        name: 'name',
        description: 'The name of the role',
        type: 3,
        required: true
      },
      {
        name: 'color',
        description: 'Hex color (e.g. #00ffaa)',
        type: 3,
        required: false
      }
    ],
    async executePrefix(message, args) {
      const name = args[0];
      if (!name) {
        return message.reply(cv2.warn('Command Error', `${message.author} Please specify a name for the role.\n\n**Usage:** \`!createrole <name> [#color]\``));
      }
      const color = args[1];
      const result = await handleCreateRole(message.guild, message.member, name, color);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const name = interaction.options.getString('name');
      const color = interaction.options.getString('color');
      const result = await handleCreateRole(interaction.guild, interaction.member, name, color);
      await interaction.reply(result);
    }
  },

  // --- DELETE ROLE COMMAND ---
  {
    name: 'deleterole',
    slashHidden: true,
    description: 'Deletes a server role safely.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageRoles],
    options: [
      {
        name: 'role',
        description: 'The role to delete',
        type: 8,
        required: true
      }
    ],
    async executePrefix(message) {
      const role = message.mentions.roles.first();
      if (!role) {
        return message.reply(cv2.warn('Command Error', `${message.author} Please mention the role you want to delete.\n\n**Usage:** \`!deleterole <@role>\``));
      }
      const result = await handleDeleteRole(message.guild, message.member, role);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const role = interaction.options.getRole('role');
      const result = await handleDeleteRole(interaction.guild, interaction.member, role);
      await interaction.reply(result);
    }
  },

  // --- PURGE COMMAND ---
  {
    name: 'purge',
    aliases: ['clear', 'clean', 'c'],
    description: 'Bulk deletes a specified number of messages from the channel (1-100).',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageMessages],
    options: [
      {
        name: 'amount',
        description: 'Number of messages to delete (1-100)',
        type: 4, // Integer
        required: true,
        min_value: 1,
        max_value: 100
      }
    ],
    async executePrefix(message, args) {
      const amount = parseInt(args[0]);
      if (!amount || isNaN(amount) || amount < 1 || amount > 100) {
        return message.reply(cv2.warn('Command Error', `${message.author} Please specify a number between 1-100.\n\n**Usage:** \`!purge <1-100>\``));
      }
      const result = await handlePurge(message.guild, message.channel, message.member, amount, message);
      if (result.embed) {
        const reply = await message.channel.send(result);
        setTimeout(() => reply.delete().catch(() => null), 5000);
      }
    },
    async executeSlash(interaction) {
      const amount = interaction.options.getInteger('amount');
      const result = await handlePurge(interaction.guild, interaction.channel, interaction.member, amount);
      await interaction.reply(result);
    }
  },

  // --- SLOWMODE COMMAND ---
  {
    name: 'slowmode',
    aliases: ['sm'],
    description: 'Sets the channel slowmode rate limit (0 to disable).',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageChannels],
    options: [
      {
        name: 'seconds',
        description: 'Slowmode delay in seconds (0 = off, max 21600)',
        type: 4, // Integer
        required: true,
        min_value: 0,
        max_value: 21600
      }
    ],
    async executePrefix(message, args) {
      const seconds = parseInt(args[0]);
      if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
        return message.reply(cv2.warn('Command Error', `${message.author} Please specify seconds between 0-21600.\n\n**Usage:** \`!slowmode <seconds>\` (0 = off)`));
      }
      const result = await handleSlowmode(message.guild, message.channel, message.member, seconds);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const seconds = interaction.options.getInteger('seconds');
      const result = await handleSlowmode(interaction.guild, interaction.channel, interaction.member, seconds);
      await interaction.reply(result);
    }
  },

  // --- UNBAN COMMAND ---
  {
    name: 'unban',
    aliases: ['ub'],
    description: 'Unbans a user from the server by User ID or @mention.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.BanMembers],
    options: [
      {
        name: 'userid',
        description: 'The User ID to unban (or paste @mention - digits will be parsed)',
        type: 3, // String
        required: true
      },
      {
        name: 'reason',
        description: 'Reason for unban',
        type: 3,
        required: false
      }
    ],
    async executePrefix(message, args) {
      const { isServerAdmin } = await import('../utils/helpers.js');
      if (!isServerAdmin(message.member, message.guild.id)) {
        return message.reply(cv2.danger('Access Denied', 'The `!unban` command is restricted to **Admin Tier** roles and server administrators.')).catch(() => null);
      }

      const rawArg = args[0];
      if (!rawArg) {
        return message.reply(cv2.warn('Command Error', `${message.author} Please specify a User ID or @mention.\n\n**Usage:** \`!unban <userId or @mention> [reason]\``));
      }
      // Strip mention characters to get a raw ID
      const userId = rawArg.replace(/[<@!>]/g, '').trim();
      const reason = args.slice(1).join(' ') || 'No reason provided';
      const result = await handleUnban(message.guild, message.member, userId, reason);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const { isServerAdmin } = await import('../utils/helpers.js');
      if (!isServerAdmin(interaction.member, interaction.guild.id)) {
        return interaction.reply(cv2.danger('Access Denied', 'The `/unban` command is restricted to **Admin Tier** roles and server administrators.'));
      }

      // Strip mention chars from the typed value just in case
      const userId = interaction.options.getString('userid').replace(/[<@!>]/g, '').trim();
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const result = await handleUnban(interaction.guild, interaction.member, userId, reason);
      await interaction.reply(result);
    }
  },

  // --- UNBANALL COMMAND ---
  {
    name: 'unbanall',
    description: 'Removes ALL active bans from the server. (Bot Owner, Server Owner, Extra Owners only)',
    category: 'moderation',
    permissions: [PermissionFlagsBits.BanMembers],
    options: [],
    async executePrefix(message) {
      const allowed = isBotOwnerSync(message.author.id) ||
                      message.author.id === message.guild.ownerId ||
                      isExtraOwner(message.guild.id, message.author.id);
      if (!allowed) {
        return message.reply(cv2.danger('Access Denied', `${message.author} Only the **Bot Owner**, **Server Owner**, or **Extra Owners** can mass-unban members.`));
      }
      const sentMsg = await message.reply(cv2.info('<a:loading:1542155051286396938> Processing...', 'Fetching ban list and removing bans, please wait.'));
      const result = await handleUnbanAll(message.guild, message.member);
      await sentMsg.edit(result);
    },
    async executeSlash(interaction) {
      const allowed = isBotOwnerSync(interaction.user.id) ||
                      interaction.user.id === interaction.guild.ownerId ||
                      isExtraOwner(interaction.guild.id, interaction.user.id);
      if (!allowed) {
        return interaction.reply(cv2.danger('Access Denied', `${interaction.user} Only the **Bot Owner**, **Server Owner**, or **Extra Owners** can mass-unban members.`));
      }
      await interaction.deferReply();
        const result = await handleUnbanAll(interaction.guild, interaction.member);
        await interaction.deleteReply().catch(() => null);
        await interaction.channel.send(result);
    }
  },

  // --- SYNC COMMAND ---
  {
    name: 'sync',
    description: 'Sync a channel\'s permissions with its category',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageChannels],
    async executePrefix(message) {
      let channel = message.mentions.channels.first() || message.channel;
      if (!channel.parent) {
        return message.reply({ embeds: [embed.warning('Error', 'This channel does not belong to a category.')] });
      }
      try {
        if (channel.permissionsLocked) {
          return message.reply(cv2.info('Already Synced', `${channel} is already synced with its category.`));
        }
        await channel.lockPermissions();
        await message.reply(cv2.success('Synced', `Successfully synced ${channel} with category **${channel.parent.name}**.`));
      } catch (err) {
        await message.reply(cv2.danger('Error', 'Failed to sync permissions. Check my roles and hierarchy.'));
      }
    },
    async executeSlash(interaction) {
      let channel = interaction.channel;
      if (!channel.parent) {
        return interaction.reply({ embeds: [embed.warning('Error', 'This channel does not belong to a category.')] });
      }
      try {
        if (channel.permissionsLocked) {
          return interaction.reply(cv2.info('Already Synced', `${channel} is already synced with its category.`));
        }
        await channel.lockPermissions();
        await interaction.reply(cv2.success('Synced', `Successfully synced ${channel} with category **${channel.parent.name}**.`));
      } catch (err) {
        await interaction.reply(cv2.danger('Error', 'Failed to sync permissions. Check my roles and hierarchy.'));
      }
    }
  },

  // --- SYNCALL COMMAND ---
  {
    name: 'syncall',
    description: 'Sync all channels in the server with their respective categories',
    category: 'moderation',
    permissions: [PermissionFlagsBits.Administrator],
    async executePrefix(message) {
      const m = await message.reply(cv2.info('Processing...', 'Syncing all channels to their categories. This might take a while to respect Discord rate limits...'));
      let success = 0;
      let failed = 0;

      const channelsToSync = message.guild.channels.cache.filter(c => c.parent && !c.permissionsLocked);
      
      if (channelsToSync.size === 0) {
        return m.edit(cv2.success('Already Synced', 'All channels are already fully synced with their categories!'));
      }

      for (const [id, channel] of channelsToSync) {
        try {
          await channel.lockPermissions();
          success++;
        } catch (err) {
          failed++;
        }
      }

      await m.edit(cv2.success('Sync Complete', `**${success}** channels synced.\n**${failed}** channels failed (missing permissions).`));
    },
    async executeSlash(interaction) {
      await interaction.reply(' Syncing all channels to their categories. This might take a while to respect Discord rate limits...');
      let success = 0;
      let failed = 0;

      const channelsToSync = interaction.guild.channels.cache.filter(c => c.parent && !c.permissionsLocked);
      
      if (channelsToSync.size === 0) {
        return interaction.editReply(cv2.success('Already Synced', 'All channels are already fully synced with their categories!'));
      }

      for (const [id, channel] of channelsToSync) {
        try {
          await channel.lockPermissions();
          success++;
        } catch (err) {
          failed++;
        }
      }

      await interaction.editReply(cv2.success('Sync Complete', `**${success}** channels synced.\n**${failed}** channels failed (missing permissions).`));
    }
  },

  // --- NUKE COMMAND ---
  {
    name: 'nuke',
    aliases: ['clonedelete'],
    description: 'Clone and delete the current channel.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageChannels],
    options: [],
    async executePrefix(message) {
      const allowed = isExtraOwner(message.guild.id, message.author.id) || isBotOwnerSync(message.author.id) || message.author.id === message.guild.ownerId || message.member.permissions.has(PermissionFlagsBits.ManageChannels) || message.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!allowed) {
        return message.reply(cv2.danger('Access Denied', 'Only Extra Owners, Server Owner, Bot Owner, or staff with Manage Channels can nuke this channel.'));
      }
      return executeNuke(message.channel, message.member, message.guild);
    },
    async executeSlash(interaction) {
      const allowed = isExtraOwner(interaction.guild.id, interaction.user.id) || isBotOwnerSync(interaction.user.id) || interaction.user.id === interaction.guild.ownerId || interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!allowed) {
        return interaction.reply(cv2.danger('Access Denied', 'Only Extra Owners, Server Owner, Bot Owner, or staff with Manage Channels can nuke this channel.'));
      }
      await interaction.reply(cv2.info('Channel Nuke', 'Initiating channel nuke sequence...'));
      return executeNuke(interaction.channel, interaction.member, interaction.guild);
    }
  },

  // --- MASSBAN COMMAND ---
  {
    name: 'massban',
    aliases: ['mb'],
    description: 'Ban all members with a specific role.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.BanMembers],
    options: [
      { name: 'role', description: 'The role whose members will be banned', type: 8, required: true },
      { name: 'reason', description: 'Reason for the mass ban', type: 3, required: false }
    ],
    async executePrefix(message, args) {
      const allowed = isExtraOwner(message.guild.id, message.author.id) || isBotOwnerSync(message.author.id) || message.author.id === message.guild.ownerId || message.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!allowed) {
        return message.reply(cv2.danger('Access Denied', 'Only Administrators, Server Owner, Extra Owners, or Bot Owner can mass ban.'));
      }
      const role = message.mentions.roles.first() || (args[0] ? message.guild.roles.cache.get(args[0].replace(/<@&|>/g, '')) : null);
      if (!role) {
        return message.reply(cv2.warn('Usage', `Usage: \`!massban <@role> [reason]\``));
      }
      const reason = args.slice(1).join(' ').trim() || 'Mass ban by administrator';
      const statusMsg = await message.reply(cv2.info('Mass Ban Initiated', `Processing members with role <@&${role.id}>...`));
      const result = await handleMassBan(message.guild, message.member, role, reason);
      await cv2.edit(statusMsg, result);
    },
    async executeSlash(interaction) {
      const allowed = isExtraOwner(interaction.guild.id, interaction.user.id) || isBotOwnerSync(interaction.user.id) || interaction.user.id === interaction.guild.ownerId || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!allowed) {
        return interaction.reply(cv2.danger('Access Denied', 'Only Administrators, Server Owner, Extra Owners, or Bot Owner can mass ban.'));
      }
      const role = interaction.options.getRole('role');
      const reason = interaction.options.getString('reason') || 'Mass ban by administrator';
      await interaction.reply(cv2.info('Mass Ban Initiated', `Processing members with role <@&${role.id}>...`));
      const result = await handleMassBan(interaction.guild, interaction.member, role, reason);
      await cv2.edit(interaction, result);
    }
  },

  // --- MASSKICK COMMAND ---
  {
    name: 'masskick',
    aliases: ['mk'],
    description: 'Kick all members with a specific role.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.KickMembers],
    options: [
      { name: 'role', description: 'The role whose members will be kicked', type: 8, required: true },
      { name: 'reason', description: 'Reason for the mass kick', type: 3, required: false }
    ],
    async executePrefix(message, args) {
      const allowed = isExtraOwner(message.guild.id, message.author.id) || isBotOwnerSync(message.author.id) || message.author.id === message.guild.ownerId || message.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!allowed) {
        return message.reply(cv2.danger('Access Denied', 'Only Administrators, Server Owner, Extra Owners, or Bot Owner can mass kick.'));
      }
      const role = message.mentions.roles.first() || (args[0] ? message.guild.roles.cache.get(args[0].replace(/<@&|>/g, '')) : null);
      if (!role) {
        return message.reply(cv2.warn('Usage', `Usage: \`!masskick <@role> [reason]\``));
      }
      const reason = args.slice(1).join(' ').trim() || 'Mass kick by administrator';
      const statusMsg = await message.reply(cv2.info('Mass Kick Initiated', `Processing members with role <@&${role.id}>...`));
      const result = await handleMassKick(message.guild, message.member, role, reason);
      await cv2.edit(statusMsg, result);
    },
    async executeSlash(interaction) {
      const allowed = isExtraOwner(interaction.guild.id, interaction.user.id) || isBotOwnerSync(interaction.user.id) || interaction.user.id === interaction.guild.ownerId || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!allowed) {
        return interaction.reply(cv2.danger('Access Denied', 'Only Administrators, Server Owner, Extra Owners, or Bot Owner can mass kick.'));
      }
      const role = interaction.options.getRole('role');
      const reason = interaction.options.getString('reason') || 'Mass kick by administrator';
      await interaction.reply(cv2.info('Mass Kick Initiated', `Processing members with role <@&${role.id}>...`));
      const result = await handleMassKick(interaction.guild, interaction.member, role, reason);
      await cv2.edit(interaction, result);
    }
  },

  // --- MASSTIMEOUT COMMAND ---
  {
    name: 'masstimeout',
    description: 'Timeout all members with a specific role.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ModerateMembers],
    options: [
      { name: 'role', description: 'The role whose members will be timed out', type: 8, required: true },
      { name: 'duration', description: 'Timeout duration (e.g. 10m, 1h, 1d)', type: 3, required: true },
      { name: 'reason', description: 'Reason for the mass timeout', type: 3, required: false }
    ],
    async executePrefix(message, args) {
      const allowed = isExtraOwner(message.guild.id, message.author.id) || isBotOwnerSync(message.author.id) || message.author.id === message.guild.ownerId || message.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!allowed) {
        return message.reply(cv2.danger('Access Denied', 'Only Administrators, Server Owner, Extra Owners, or Bot Owner can mass timeout.'));
      }
      const role = message.mentions.roles.first() || (args[0] ? message.guild.roles.cache.get(args[0].replace(/<@&|>/g, '')) : null);
      if (!role) {
        return message.reply(cv2.warn('Usage', `Usage: \`!masstimeout <@role> <time> [reason]\``));
      }
      const durationStr = args[1];
      const durationMs = parseDuration(durationStr);
      if (!durationMs) {
        return message.reply(cv2.warn('Invalid Duration', 'Please specify a valid duration (e.g. `10m`, `1h`, `1d`).'));
      }
      const reason = args.slice(2).join(' ').trim() || 'Mass timeout by administrator';
      const statusMsg = await message.reply(cv2.info('Mass Timeout Initiated', `Processing members with role <@&${role.id}>...`));
      const result = await handleMassTimeout(message.guild, message.member, role, durationMs, reason);
      await cv2.edit(statusMsg, result);
    },
    async executeSlash(interaction) {
      const allowed = isExtraOwner(interaction.guild.id, interaction.user.id) || isBotOwnerSync(interaction.user.id) || interaction.user.id === interaction.guild.ownerId || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!allowed) {
        return interaction.reply(cv2.danger('Access Denied', 'Only Administrators, Server Owner, Extra Owners, or Bot Owner can mass timeout.'));
      }
      const role = interaction.options.getRole('role');
      const durationStr = interaction.options.getString('duration');
      const durationMs = parseDuration(durationStr);
      if (!durationMs) {
        return interaction.reply(cv2.warn('Invalid Duration', 'Please specify a valid duration (e.g. `10m`, `1h`, `1d`).'));
      }
      const reason = interaction.options.getString('reason') || 'Mass timeout by administrator';
      await interaction.reply(cv2.info('Mass Timeout Initiated', `Processing members with role <@&${role.id}>...`));
      const result = await handleMassTimeout(interaction.guild, interaction.member, role, durationMs, reason);
      await cv2.edit(interaction, result);
    }
  }
];

// ==========================================
// CORE EXECUTION HANDLERS (DRY APPROACH)
// ==========================================

async function executeNuke(channel, moderator, guild) {
  try {
    if (!channel || channel.isDMBased()) return;
    const pos = channel.position;
    const author = moderator.user || moderator;
    const modTier = getUserTierName(guild, moderator);
    const cloned = await channel.clone({
      name: channel.name,
      reason: `Channel nuked by ${author.tag || author.username}`
    });
    await cloned.setPosition(pos).catch(() => null);
    await channel.delete(`Channel nuked by ${author.tag || author.username}`).catch(() => null);
    await cloned.send(cv2.success(
      'Channel Nuked | <a:03_tick_circle:1565665642084827206>',
      `Successfully cloned and nuked this channel.\n-# Initiated by <@${author.id}>`
    ));
    logToSecurityChannel(guild, cv2.log(
      'Channel Nuked',
      `Channel **${cloned.name}** was cloned and nuked.`,
      [
        { name: 'Moderator', value: `${author.tag} [${modTier}]`, inline: true },
        { name: 'Channel', value: `<#${cloned.id}>`, inline: true }
      ],
      'moderation'
    ));
  } catch (err) {
    console.error('[Nuke] Error:', err);
    try {
      await channel.send(cv2.danger('Nuke Failed', `Could not nuke channel: \`${err.message}\``));
    } catch {}
  }
}

async function handleMassBan(guild, moderator, role, reason) {
  if (role.id === guild.id) {
    return cv2.danger('Action Blocked', 'You cannot mass ban the `@everyone` role.');
  }
  await guild.members.fetch().catch(() => null);
  const targets = role.members.filter(m => 
    m.id !== guild.client.user.id &&
    !isBotOwnerSync(m.id) &&
    m.id !== guild.ownerId &&
    !db.isExtraOwner(guild.id, m.id) &&
    !db.isWhitelisted(guild, m.id, 'ban') &&
    canModerate(moderator, m) &&
    m.bannable
  );

  if (targets.size === 0) {
    return cv2.warn('No Eligible Members', `No bannable members found with role <@&${role.id}>.`);
  }

  let successCount = 0;
  let failCount = 0;
  const author = moderator.user || moderator;
  const modTier = getUserTierName(guild, moderator);

  for (const [, target] of targets) {
    try {
      await target.ban({ reason: `Mass ban by ${author.tag || author.username}: ${reason}` });
      successCount++;
    } catch {
      failCount++;
    }
  }

  logToSecurityChannel(guild, cv2.log(
    'Mass Ban Executed',
    `Mass ban executed on role **${role.name}**.`,
    [
      { name: 'Moderator', value: `${author.tag} [${modTier}]`, inline: true },
      { name: 'Role', value: `<@&${role.id}>`, inline: true },
      { name: 'Banned', value: `\`${successCount}\``, inline: true },
      { name: 'Failed', value: `\`${failCount}\``, inline: true },
      { name: 'Reason', value: reason }
    ],
    'moderation'
  ));

  return cv2.success(
    'Mass Ban Complete | <a:03_tick_circle:1565665642084827206>',
    `Successfully banned **${successCount}** member(s) with role <@&${role.id}>.` + (failCount > 0 ? `\nFailed: **${failCount}**.` : '')
  );
}

async function handleMassKick(guild, moderator, role, reason) {
  if (role.id === guild.id) {
    return cv2.danger('Action Blocked', 'You cannot mass kick the `@everyone` role.');
  }
  await guild.members.fetch().catch(() => null);
  const targets = role.members.filter(m => 
    m.id !== guild.client.user.id &&
    !isBotOwnerSync(m.id) &&
    m.id !== guild.ownerId &&
    !db.isExtraOwner(guild.id, m.id) &&
    !db.isWhitelisted(guild, m.id, 'kick') &&
    canModerate(moderator, m) &&
    m.kickable
  );

  if (targets.size === 0) {
    return cv2.warn('No Eligible Members', `No kickable members found with role <@&${role.id}>.`);
  }

  let successCount = 0;
  let failCount = 0;
  const author = moderator.user || moderator;
  const modTier = getUserTierName(guild, moderator);

  for (const [, target] of targets) {
    try {
      await target.kick(`Mass kick by ${author.tag || author.username}: ${reason}`);
      successCount++;
    } catch {
      failCount++;
    }
  }

  logToSecurityChannel(guild, cv2.log(
    'Mass Kick Executed',
    `Mass kick executed on role **${role.name}**.`,
    [
      { name: 'Moderator', value: `${author.tag} [${modTier}]`, inline: true },
      { name: 'Role', value: `<@&${role.id}>`, inline: true },
      { name: 'Kicked', value: `\`${successCount}\``, inline: true },
      { name: 'Failed', value: `\`${failCount}\``, inline: true },
      { name: 'Reason', value: reason }
    ],
    'moderation'
  ));

  return cv2.success(
    'Mass Kick Complete | <a:03_tick_circle:1565665642084827206>',
    `Successfully kicked **${successCount}** member(s) with role <@&${role.id}>.` + (failCount > 0 ? `\nFailed: **${failCount}**.` : '')
  );
}

async function handleMassTimeout(guild, moderator, role, durationMs, reason) {
  if (role.id === guild.id) {
    return cv2.danger('Action Blocked', 'You cannot mass timeout the `@everyone` role.');
  }
  await guild.members.fetch().catch(() => null);
  const targets = role.members.filter(m => 
    m.id !== guild.client.user.id &&
    !isBotOwnerSync(m.id) &&
    m.id !== guild.ownerId &&
    !db.isExtraOwner(guild.id, m.id) &&
    canModerate(moderator, m) &&
    m.moderatable
  );

  if (targets.size === 0) {
    return cv2.warn('No Eligible Members', `No members eligible for timeout with role <@&${role.id}>.`);
  }

  let successCount = 0;
  let failCount = 0;
  const author = moderator.user || moderator;
  const modTier = getUserTierName(guild, moderator);

  for (const [, target] of targets) {
    try {
      await target.timeout(durationMs, `Mass timeout by ${author.tag || author.username}: ${reason}`);
      successCount++;
    } catch {
      failCount++;
    }
  }

  logToSecurityChannel(guild, cv2.log(
    'Mass Timeout Executed',
    `Mass timeout executed on role **${role.name}**.`,
    [
      { name: 'Moderator', value: `${author.tag} [${modTier}]`, inline: true },
      { name: 'Role', value: `<@&${role.id}>`, inline: true },
      { name: 'Timed Out', value: `\`${successCount}\``, inline: true },
      { name: 'Failed', value: `\`${failCount}\``, inline: true },
      { name: 'Reason', value: reason }
    ],
    'moderation'
  ));

  return cv2.success(
    'Mass Timeout Complete | <a:03_tick_circle:1565665642084827206>',
    `Successfully timed out **${successCount}** member(s) with role <@&${role.id}>.` + (failCount > 0 ? `\nFailed: **${failCount}**.` : '')
  );
}

async function handleMuteAll(guild, moderator) {
  const vc = moderator.voice.channel;
  if (!vc) {
    return cv2.warn('<:off:1533844858983157851> Failed', 'You must be in a **voice channel** to use this command.');
  }

  let mutedCount = 0;
  for (const m of vc.members.values()) {
    if (m.id !== moderator.id && canModerate(moderator, m)) {
      await m.voice.setMute(true, `MuteAll by ${moderator.user.tag}`).catch(() => null);
      mutedCount++;
    }
  }

  const resEmbed = cv2.danger('Voice Mute Completed', `Successfully server-muted **${mutedCount}** member(s) in **${vc.name}**.`);
  const modTier = getUserTierName(guild, moderator);
  logToSecurityChannel(guild, cv2.log('MuteAll Voice Channel', `Moderator **${moderator.user.tag}** [${modTier}] muted all **${mutedCount}** members in **${vc.name}**.`, [
    { name: 'Moderator', value: `${moderator.user.tag} [${modTier}]`, inline: true },
    { name: 'Channel', value: `${vc.name}`, inline: true },
    { name: 'Muted Count', value: `\`${mutedCount}\``, inline: true }
  ], 'warning'));
  return resEmbed;
}

async function handleUnmuteAll(guild, moderator) {
  const vc = moderator.voice.channel;
  if (!vc) {
    return cv2.warn('<:off:1533844858983157851> Failed', 'You must be in a **voice channel** to use this command.');
  }

  let unmutedCount = 0;
  for (const m of vc.members.values()) {
    await m.voice.setMute(false, `UnmuteAll by ${moderator.user.tag}`).catch(() => null);
    unmutedCount++;
  }

  const resEmbed = cv2.success('Voice Unmute Completed', `Successfully removed server-mute from **${unmutedCount}** member(s) in **${vc.name}**.`);
  const modTier = getUserTierName(guild, moderator);
  logToSecurityChannel(guild, cv2.log('UnmuteAll Voice Channel', `Moderator **${moderator.user.tag}** [${modTier}] unmuted all **${unmutedCount}** members in **${vc.name}**.`, [
    { name: 'Moderator', value: `${moderator.user.tag} [${modTier}]`, inline: true },
    { name: 'Channel', value: `${vc.name}`, inline: true },
    { name: 'Unmuted Count', value: `\`${unmutedCount}\``, inline: true }
  ], 'success'));
  return resEmbed;
}

export async function handleWarn(guild, moderator, target, reason, force = false) {
  // 1. Untouchable Check
  if (!force && !isBotOwnerSync(moderator.id) && (isBotOwnerSync(target.id) || guild.ownerId === target.id)) {
    return cv2.danger('Untouchable', `You cannot take action against **${target.user.tag}**.\n\nThey are protected by **Athena Prime's** highest security clearance.`);
  }

  // 2. Extraowner Immunity (Bypass if moderator is Bot Owner/Server Owner)
  if (!force && isExtraOwner(guild.id, target.id)) {
    if (!isBotOwnerSync(moderator.id) && guild.ownerId !== moderator.id) {
       return cv2.danger('Immunity', ' This user is an Extra Owner and cannot be moderated by regular staff.');
    }
  }

  if (!force && !canModerate(moderator, target)) {
    return cv2.danger('Permission Denied', `You do not have enough power to warn **${target.user.tag}**.`);
  }

  const warns = db.addWarning(guild.id, target.id, moderator.id, reason);

  // Advanced DM Embed
  const dmEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('Warning Received')
      .setDescription(`You have been issued a warning in **${guild.name}**.\n\n**Reason:** ${reason}\n**Warn Total:** ${warns.length} / 3`);
    await target.send({ embeds: [dmEmbed] }).catch(() => null);

  // Response channel embed
  const resEmbed = { embeds: [
      new EmbedBuilder()
        .setDescription(`**User Warned |** <a:uptime:1552608831060844575>\n\n**Reason:** ${reason}\n-# ${target.user.username} has been warned. Your Limit is ${warns.length}/3. Exceeding the limits will lead to punishments.`)
        .setThumbnail(target.user.displayAvatarURL({ extension: 'png', size: 128 }))
        .setColor('#2b2d31')
    ] };

  // Log to logs channel
  const modTier = getUserTierName(guild, moderator);
  const targetTier = getUserTierName(guild, target);
  logToSecurityChannel(guild, cv2.log(
    'Warning Issued', 
    `Moderator warned user.`,
    [
      { name: 'Target', value: `${target.user.tag} (${target.id}) [${targetTier}]`, inline: true },
      { name: 'Moderator', value: `${moderator.user.tag} [${modTier}]`, inline: true },
      { name: 'Reason', value: reason },
      { name: 'Active Warns', value: `${warns.length}` }
    ],
    'warning'
  ));

  // Check Warn thresholds for auto punishment
  if (warns.length >= 3) {
    // Automatic quarantine!
    const autoReason = `Automated: Warning threshold limit exceeded (${warns.length}/3 Warnings)`;
    const quarantineRes = await executeQuarantine(guild, target, guild.members.me, autoReason);
    
    // Clear warning counts so they don't get double punished next message
    db.clearWarnings(guild.id, target.id);

    return cv2.danger(
        'Severe Warning Threshold Reached', 
        `**${target.user.tag}** accumulated ${warns.length} warnings. Executing **automatic quarantine punishment**.\n\n${quarantineRes.message}`
      );
  }

  return resEmbed;
}

async function handleWarnings(guild, target) {
  const warns = db.getWarnings(guild.id, target.id);
  const config = db.getGuildConfig(guild.id);
  const maxWarnings = config.maxWarnings || 3;
  const targetTag = target.user?.tag || target.tag || 'Unknown';
  const targetAvatarUrl = target.user?.displayAvatarURL ? target.user.displayAvatarURL({ extension: 'png', size: 128 }) : null;
  const initial = (target.user?.username || target.username || 'W')[0] || 'W';
  const warnProgress = renderSleekProgressBar(warns.length, maxWarnings, 14);

  const bannerAttachment = await generateCommandStatusBanner({
    title: 'INFRACTION TRACKER HUD',
    subtitle: `${targetTag.toUpperCase()} // WARNING STRIKES`,
    badge: warns.length >= maxWarnings ? 'LIMIT EXCEEDED' : warns.length > 0 ? `${warns.length}/${maxWarnings} STRIKES` : '0 STRIKES : PRISTINE',
    badgeColor: warns.length >= maxWarnings ? '#ef4444' : warns.length > 0 ? '#eab308' : '#22c55e',
    iconUrl: targetAvatarUrl,
    fallbackInitial: initial,
    current: warns.length,
    total: maxWarnings,
    unit: 'STRIKES RECORDED',
    accentColor: warns.length >= maxWarnings ? '#ef4444' : warns.length > 0 ? '#f97316' : '#22c55e',
    metrics: [
      { label: 'WARNINGS', value: `${warns.length}/${maxWarnings}` },
      { label: 'STATUS', value: warns.length >= maxWarnings ? 'PUNISHABLE' : warns.length > 0 ? 'ACTIVE' : 'CLEAN' },
      { label: 'ESCALATION', value: config.warnAction || 'QUARANTINE' }
    ],
    attachmentName: 'warn_banner.gif',
    animated: true
  });

  let warnDetails = '';
  if (warns.length === 0) {
    warnDetails = `-# ${BULLET_EMOJI} **Member has a clean disciplinary record with zero active warnings.**`;
  } else {
    warnDetails = warns.map((w, index) => {
      return (
        `-# ${BULLET_EMOJI} **[Strike #${index + 1}] <t:${Math.floor(w.timestamp / 1000)}:R>**\n` +
        `-#   **Reason:** ${w.reason}\n` +
        `-#   **Warner:** <@${w.warnerId}> (\`${w.warnerId}\`)`
      );
    }).join('\n-# <a:target_blink:1565667466984554588> ──────────────────────────────\n');
  }

  const container = {
    type: 17,
    components: [
      {
        type: 12,
        items: [{ media: { url: 'attachment://warn_banner.gif' } }]
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} INFRACTION AUDIT: ${targetTag}\n` +
          `-# ${BULLET_EMOJI} **Disciplinary Strike Meter:** ${warnProgress} (${warns.length}/${maxWarnings} Limit)\n` +
          `-# ${BULLET_EMOJI} **Member ID:** \`${target.id}\`\n` +
          `-# ${BULLET_EMOJI} **Escalation Threshold:** \`${maxWarnings}\` (Use \`!maxwarnings <amount>\` to configure)\n` +
          `-# ${BULLET_EMOJI} **Disciplinary Escalation:** \`${config.warnAction || 'Quarantine Isolation'}\``
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `### **Infraction History Log:**\n` + warnDetails
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# Athena Prime Disciplinary Defense Matrix • Zero-Trust Enforcement`
      }
    ]
  };

  return {
    components: [container],
    files: [bannerAttachment],
    flags: MessageFlags.IsComponentsV2
  };
}

async function handleClearWarns(guild, moderator, target) {
  const activeCount = db.getWarnings(guild.id, target.id).length;
  
  if (activeCount === 0) {
    return cv2.info('No warnings', `User **${target.user.tag}** has no warnings to clear.`);
  }

  db.clearWarnings(guild.id, target.id);

  const modTier = getUserTierName(guild, moderator);
  const targetTier = getUserTierName(guild, target);
  const resEmbed = cv2.success('Warnings Cleared', `Successfully cleared all active warnings for **${target.user.tag}**.`);
  logToSecurityChannel(guild, cv2.log(
    'Warnings Wiped',
    `Moderator **${moderator.user.tag}** [${modTier}] cleared **${activeCount}** active warnings for **${target.user.tag}** (${target.id}) [${targetTier}].`,
    [
      { name: 'Target', value: `${target.user.tag} (${target.id}) [${targetTier}]`, inline: true },
      { name: 'Moderator', value: `${moderator.user.tag} [${modTier}]`, inline: true },
      { name: 'Cleared Warns', value: `\`${activeCount}\`` }
    ],
    'success'
  ));
  return resEmbed;
}

async function handleTimeout(guild, moderator, target, durationStr, reason) {
  // Owner immunity check
  if (!isBotOwnerSync(moderator.id) && (isBotOwnerSync(target.id) || isExtraOwner(guild.id, target.id))) {
    return cv2.danger('Untouchable', 'This user is protected by **Athena Prime** and cannot be moderated.');
  }

  if (!canModerate(moderator, target)) {
    return cv2.danger('Permission Denied', `You do not have enough power to timeout **${target.user.tag}**.`);
  }

  const ms = parseDuration(durationStr);
  if (!ms || ms < 10000 || ms > 2419200000) { // Discord timeout limit is between 10s and 28 days
    return cv2.warn('Invalid Duration', 'Duration must be a format like `10m`, `2h`, `1d` (between 10 seconds and 28 days).');
  }

  try {
    await target.timeout(ms, `${reason} - by ${moderator.user.tag}`);

    // Send DM
    const dmEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('Timeout Applied')
      .setDescription(`You have been timed out in **${guild.name}**.\n\n**Duration:** ${durationStr}\n**Reason:** ${reason}`);
    await target.send({ embeds: [dmEmbed] }).catch(() => null);

    const resEmbed = cv2.danger('Timeout Executed', `Successfully placed **${target.user.tag}** on timeout.`, [
      { name: 'Member', value: `${target}`, inline: true },
      { name: 'Duration', value: durationStr, inline: true },
      { name: 'Reason', value: reason }
    ]);

    const modTier = getUserTierName(guild, moderator);
    const targetTier = getUserTierName(guild, target);
    logToSecurityChannel(guild, cv2.log(
      'Member Timeout',
      `Moderator timed out member.`,
      [
        { name: 'Target', value: `${target.user.tag} (${target.id}) [${targetTier}]`, inline: true },
        { name: 'Moderator', value: `${moderator.user.tag} [${modTier}]`, inline: true },
        { name: 'Duration', value: durationStr, inline: true },
        { name: 'Reason', value: reason }
      ],
      'danger'
    ));

    return resEmbed;
  } catch (error) {
    console.error(error);
    return cv2.danger('Failed', 'An error occurred while executing the timeout. Ensure my role is higher than the target.');
  }
}

async function handleUntimeout(guild, moderator, target, reason) {
  // Owner immunity check
  if (!isBotOwnerSync(moderator.id) && (isBotOwnerSync(target.id) || isExtraOwner(guild.id, target.id))) {
    return cv2.danger('Untouchable', 'This user is protected by **Athena Prime** and cannot be moderated.');
  }

  if (!canModerate(moderator, target)) {
    return cv2.danger('Permission Denied', `You do not have enough power to modify timeout for **${target.user.tag}**.`);
  }

  if (!target.isCommunicationDisabled()) {
    return cv2.warn('Not Timed Out', `**${target.user.tag}** does not have an active timeout.`);
  }

  try {
    await target.timeout(null, `${reason} - by ${moderator.user.tag}`);

    // Send DM
    const dmEmbed = new EmbedBuilder()
      .setColor(0x00FF88)
      .setTitle('Timeout Removed')
      .setDescription(`Your timeout has been removed in **${guild.name}**.\n\n**Reason:** ${reason}`);
    await target.send({ embeds: [dmEmbed] }).catch(() => null);

    const resEmbed = cv2.success('Timeout Removed', `Successfully removed timeout from **${target.user.tag}**.`, [
      { name: 'Member', value: `${target}`, inline: true },
      { name: 'Reason', value: reason, inline: true }
    ]);

    const modTier = getUserTierName(guild, moderator);
    const targetTier = getUserTierName(guild, target);
    logToSecurityChannel(guild, cv2.log(
      'Member Timeout Removed',
      `Moderator removed timeout from member.`,
      [
        { name: 'Target', value: `${target.user.tag} (${target.id}) [${targetTier}]`, inline: true },
        { name: 'Moderator', value: `${moderator.user.tag} [${modTier}]`, inline: true },
        { name: 'Reason', value: reason }
      ],
      'info'
    ));

    return resEmbed;
  } catch (error) {
    console.error(error);
    return cv2.danger('Failed', 'An error occurred while removing the timeout. Ensure my role is higher than the target.');
  }
}

async function handleKick(guild, moderator, target, reason) {
  // Owner immunity check
  if (!isBotOwnerSync(moderator.id) && (isBotOwnerSync(target.id) || isExtraOwner(guild.id, target.id))) {
    return cv2.danger('Untouchable', 'This user is protected by **Athena Prime** and cannot be moderated.');
  }

  if (!canModerate(moderator, target)) {
    return cv2.danger('Permission Denied', `You do not have enough power to kick **${target.user.tag}**.`);
  }

  if (!target.kickable) {
    return cv2.danger('<:off:1533844858983157851> Failed', `I do not have enough role permissions to kick **${target.user.tag}**.`);
  }

  try {
    // DM target
    const dmEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('Kicked from Server')
      .setDescription(`You have been kicked from **${guild.name}**.\n\n**Reason:** ${reason}`);
    await target.send({ embeds: [dmEmbed] }).catch(() => null);

    await target.kick(`${reason} - by ${moderator.user.tag}`);

    const resEmbed = cv2.danger('Member Kicked', `Successfully kicked **${target.user.tag}**.`, [
      { name: 'Member', value: `${target.user.username}`, inline: true },
      { name: 'Reason', value: reason, inline: true }
    ]);

    const modTier = getUserTierName(guild, moderator);
    const targetTier = getUserTierName(guild, target);
    logToSecurityChannel(guild, cv2.log(
      'Member Kicked',
      `Moderator kicked member.`,
      [
        { name: 'Target', value: `${target.user.tag} (${target.id}) [${targetTier}]`, inline: true },
        { name: 'Moderator', value: `${moderator.user.tag} [${modTier}]`, inline: true },
        { name: 'Reason', value: reason }
      ],
      'danger'
    ));

    return resEmbed;
  } catch (error) {
    console.error(error);
    return cv2.danger('<:off:1533844858983157851> Failed', 'An error occurred while kicking the user.');
  }
}

async function handleBan(guild, moderator, target, reason) {
  // Owner immunity check
  if (!isBotOwnerSync(moderator.id) && (isBotOwnerSync(target.id) || isExtraOwner(guild.id, target.id))) {
    return cv2.danger('Untouchable', 'This user is protected by **Athena Prime** and cannot be moderated.');
  }

  if (!canModerate(moderator, target)) {
    return cv2.danger('Permission Denied', `You do not have enough power to ban **${target.user.tag}**.`);
  }

  if (!target.bannable) {
    return cv2.danger('<:off:1533844858983157851> Failed', `I do not have enough role permissions to ban **${target.user.tag}**.`);
  }

  try {
    // DM target
    const dmEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('Banned from Server')
      .setDescription(`You have been permanently banned from **${guild.name}**.\n\n**Reason:** ${reason}`);
    await target.send({ embeds: [dmEmbed] }).catch(() => null);

    await target.ban({ reason: `${reason} - by ${moderator.user.tag}` });

    const resEmbed = cv2.danger('Member Banned', `Successfully banned **${target.user.tag}** permanently.`, [
      { name: 'Member', value: `${target.user.username}`, inline: true },
      { name: 'Reason', value: reason, inline: true }
    ]);

    const modTier = getUserTierName(guild, moderator);
    const targetTier = getUserTierName(guild, target);
    logToSecurityChannel(guild, cv2.log(
      'Member Banned',
      `Moderator banned member.`,
      [
        { name: 'Target', value: `${target.user.tag} (${target.id}) [${targetTier}]`, inline: true },
        { name: 'Moderator', value: `${moderator.user.tag} [${modTier}]`, inline: true },
        { name: 'Reason', value: reason }
      ],
      'danger'
    ));

    return resEmbed;
  } catch (error) {
    console.error(error);
    return cv2.danger('<:off:1533844858983157851> Failed', 'An error occurred while banning the user.');
  }
}

async function handleCreateRole(guild, moderator, name, color) {
  let roleColor = null;
  if (color) {
    if (/^#[0-9A-F]{6}$/i.test(color)) {
      roleColor = color;
    } else {
      return cv2.warn('Invalid Color', 'Please provide a valid hex color code (e.g. `#00ffaa`).');
    }
  }

  try {
    const opts = { name, reason: `Created by ${moderator.user.tag}` }; if (roleColor) opts.color = roleColor; const role = await guild.roles.create(opts); 

      

    const modTier = getUserTierName(guild, moderator);
    const resEmbed = cv2.success('Role Created', `Successfully created server role **${role.name}**.`, [
      { name: 'Role ID', value: `\`${role.id}\``, inline: true },
      { name: 'Hex Color', value: `\`${role.hexColor}\``, inline: true }
    ]);

    logToSecurityChannel(guild, cv2.log(
      'Role Created',
      `Moderator created a new role.`,
      [
        { name: 'Role Name', value: `${role.name}`, inline: true },
        { name: 'Moderator', value: `${moderator.user.tag} [${modTier}]`, inline: true }
      ],
      'success'
    ));

    return resEmbed;
  } catch (error) {
    console.error(error);
    return cv2.danger('<:off:1533844858983157851> Failed', 'Failed to create the role. Ensure my role is high enough and I have Manage Roles permission.');
  }
}

async function handleDeleteRole(guild, moderator, role) {
  if (role.managed) {
    return cv2.danger('<:off:1533844858983157851> Failed', 'You cannot delete managed roles (roles tied to bots or integrations).');
  }

  if (role.position >= moderator.roles.highest.position && moderator.id !== guild.ownerId) {
    return cv2.danger('Permission Denied', 'You cannot delete a role that is equal to or higher than your highest role.');
  }

  try {
    const roleName = role.name;
    const roleId = role.id;
    await role.delete(`Deleted by ${moderator.user.tag}`);

    const modTier = getUserTierName(guild, moderator);
    const resEmbed = cv2.success('Role Deleted', `Successfully deleted role **${roleName}** (ID: ${roleId}).`);

    logToSecurityChannel(guild, cv2.log(
      'Role Deleted',
      `Moderator deleted a role.`,
      [
        { name: 'Role Name', value: `${roleName}`, inline: true },
        { name: 'Moderator', value: `${moderator.user.tag} [${modTier}]`, inline: true }
      ],
      'danger'
    ));

    return resEmbed;
  } catch (error) {
    console.error(error);
    return cv2.danger('<:off:1533844858983157851> Failed', 'Failed to delete the role. Ensure my highest role is above the target role.');
  }
}

async function handlePurge(guild, channel, moderator, amount, triggerMessage = null) {
  try {
    if (!guild.client.ignoredDeletes) guild.client.ignoredDeletes = new Set();

    let fetchAmount = amount;
    if (triggerMessage) fetchAmount += 1;

    const messages = await channel.messages.fetch({ limit: fetchAmount });
    messages.forEach(m => guild.client.ignoredDeletes.add(m.id));

    const deleted = await channel.bulkDelete(messages, true);
    
    setTimeout(() => {
      messages.forEach(m => guild.client.ignoredDeletes.delete(m.id));
    }, 15000);

    const actualAmount = triggerMessage && deleted.has(triggerMessage.id) ? deleted.size - 1 : deleted.size;
    const modTier = getUserTierName(guild, moderator);

    const resEmbed = cv2.success('Messages Purged', `Successfully deleted **${actualAmount}** messages from this channel.`, [
      { name: 'Requested', value: `\`${amount}\``, inline: true },
      { name: 'Deleted', value: `\`${actualAmount}\``, inline: true },
      { name: 'Moderator', value: `${moderator}`, inline: true }
    ]);

    logToSecurityChannel(guild, cv2.log(
      'Messages Purged',
      `Moderator bulk-deleted messages.`,
      [
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Count', value: `${actualAmount}`, inline: true },
        { name: 'Moderator', value: `${moderator.user ? moderator.user.tag : moderator} [${modTier}]`, inline: true }
      ]
    ));

    let logComps = [];
    logComps.push({ type: 10, content: `-# **Message Sniped via Purge Command**` });
    logComps.push({ type: 14, divider: true });
    logComps.push({ type: 10, content: `-# **Action:** Bulk Delete (Purge)` });
    logComps.push({ type: 10, content: `-# **Executed By:** [${cleanDisplayName(moderator.displayName || moderator.user?.username || 'Moderator')}](https://discord.com/users/${moderator.id || moderator}) [${modTier}]` });
    let safeChannel = channel.name.replace(/[^a-zA-Z0-9\- ]/g, '').trim();
    if (!safeChannel) safeChannel = 'Channel';
    logComps.push({ type: 10, content: `-# **Channel:** [\# ${safeChannel}](https://discord.com/channels/${guild.id}/${channel.id})` });
    logComps.push({ type: 10, content: `-# **Messages Purged:** ${actualAmount}` });
    
    if (triggerMessage) {
      logComps.push({ type: 10, content: `-# **Trigger Command:** \`${triggerMessage.content}\`` });
    }
    
    logComps.push({ type: 14, divider: true });
    
    let userCounts = {};
    let userNames = {};
    deleted.forEach(m => {
      if (m.id === triggerMessage?.id) return;
      const id = m.author ? m.author.id : 'Unknown';
      userCounts[id] = (userCounts[id] || 0) + 1;
      if (m.author && id !== 'Unknown') {
        const mem = guild.members.cache.get(id);
        userNames[id] = cleanDisplayName(mem?.displayName || m.author.globalName || m.author.username);
      }
    });
    
    let summaryStr = Object.entries(userCounts).map(([id, count]) => {
      if (id === 'Unknown') return `- Unknown: ${count} messages`;
      return `- [${userNames[id]}](https://discord.com/users/${id}): ${count} messages`;
    }).join('\n-# ');

    if (summaryStr) {
      logComps.push({ type: 10, content: `-# **Affected Users:**\n-# ${summaryStr}` });
    }

    logComps.push({ type: 14, divider: true });
    logComps.push({ type: 10, content: `-# **Athena Diagnostic Logs**` });


    let payload = {
      components: [{ type: 17, components: logComps }],
      flags: 32768
    };

    logServerEvent(guild, 'msgDeletes', payload);

    return resEmbed;
  } catch (error) {
    console.error(error);
    return cv2.danger('<:off:1533844858983157851> Failed', 'Failed to delete messages. Messages older than 14 days cannot be bulk deleted.');
  }
}


async function handleSlowmode(guild, channel, moderator, seconds) {
  try {
    await channel.setRateLimitPerUser(seconds, `Slowmode set by ${moderator.user.tag}`);

    const resEmbed = seconds === 0
      ? cv2.success('Slowmode Disabled', `Slowmode has been disabled in **#${channel.name}**.`)
      : cv2.success('Slowmode Configured', `Slowmode set to **${seconds} seconds** in **#${channel.name}**.`, [
          { name: 'Channel', value: `${channel}`, inline: true },
          { name: 'Rate Limit', value: `\`${seconds}s\``, inline: true }
        ]);

    const modTier = getUserTierName(guild, moderator);
    logToSecurityChannel(guild, cv2.log(
      'Slowmode Updated',
      `Moderator adjusted channel slowmode.`,
      [
        { name: 'Channel', value: `#${channel.name}`, inline: true },
        { name: 'Seconds', value: `${seconds}`, inline: true },
        { name: 'Moderator', value: `${moderator.user.tag} [${modTier}]`, inline: true }
      ],
      seconds === 0 ? 'success' : 'warning'
    ));

    return resEmbed;
  } catch (error) {
    console.error(error);
    return cv2.danger('<:off:1533844858983157851> Failed', 'Failed to set slowmode. Ensure I have Manage Channel permissions.');
  }
}

async function handleUnban(guild, moderator, userId, reason) {
  try {
    // Validate userId format
    if (!/^\d{17,20}$/.test(userId)) {
      return cv2.warn('Invalid User ID', `\`${userId}\` is not a valid Discord User ID. IDs are 17-20 digit numbers.`);
    }

    const ban = await guild.bans.fetch(userId).catch(() => null);
    if (!ban) {
      return cv2.warn('Not Banned', `User ID \`${userId}\` is not currently banned from this server.`);
    }

    await guild.bans.remove(userId, `${reason} - by ${moderator.user.tag}`);

    const resEmbed = cv2.success('User Unbanned', `Successfully unbanned **${ban.user.tag}** (ID: \`${userId}\`).`, [
      { name: 'User', value: `${ban.user.tag}`, inline: true },
      { name: 'Moderator', value: `${moderator}`, inline: true },
      { name: 'Reason', value: reason }
    ]);

    const modTier = getUserTierName(guild, moderator);
    const targetTier = getUserTierName(guild, ban.user || userId);
    logToSecurityChannel(guild, cv2.log(
      'User Unbanned',
      `Moderator unbanned a user.`,
      [
        { name: 'Target', value: `${ban.user.tag} (${userId}) [${targetTier}]`, inline: true },
        { name: 'Moderator', value: `${moderator.user.tag} [${modTier}]`, inline: true },
        { name: 'Reason', value: reason }
      ],
      'success'
    ));

    return resEmbed;
  } catch (error) {
    console.error(error);
    return cv2.danger('<:off:1533844858983157851> Failed', 'An error occurred while unbanning the user.');
  }
}

// ==========================================
// BAN BY ID - for users not in the server
// ==========================================
async function handleBanById(guild, moderator, userId, reason, userObj = null) {
  // Protection check
  if (isBotOwnerSync(userId) || isExtraOwner(guild.id, userId)) {
    return cv2.danger(' Untouchable', 'This user is protected by **Athena Prime** and cannot be banned.');
  }

  if (!isBotOwnerSync(moderator.id) && !moderator.permissions.has(PermissionFlagsBits.BanMembers)) {
    return cv2.danger('Permission Denied', 'You need the **Ban Members** permission to use this command.');
  }

  try {
    const existingBan = await guild.bans.fetch(userId).catch(() => null);
    if (existingBan) {
      return cv2.warn('Already Banned', `User \`${userId}\` is already banned from this server.`);
    }

    await guild.bans.create(userId, { reason: `${reason} - by ${moderator.user.tag}` });

    const displayName = userObj ? `**${userObj.tag}**` : `\`${userId}\``;
    const resEmbed = cv2.danger('User Banned', `Successfully banned ${displayName}.`, [
      { name: 'User ID', value: `\`${userId}\``, inline: true },
      { name: 'Reason', value: reason, inline: true },
      { name: 'Banned by', value: `${moderator}`, inline: true }
    ]);

    const modTier = getUserTierName(guild, moderator);
    const targetTier = getUserTierName(guild, userObj || userId);
    logToSecurityChannel(guild, cv2.log('Member Banned by ID', `Moderator banned a user not currently in the server.`, [
      { name: 'Target', value: `${userObj ? userObj.tag : 'Unknown'} (\`${userId}\`) [${targetTier}]`, inline: true },
      { name: 'Moderator', value: `${moderator.user.tag} [${modTier}]`, inline: true },
      { name: 'Reason', value: reason }
    ], 'danger'));

    return resEmbed;
  } catch (error) {
    console.error(error);
    return cv2.danger('<:off:1533844858983157851> Failed', `Could not ban user \`${userId}\`: ${error.message}`);
  }
}

// ==========================================
// UNBAN ALL - mass unban
// ==========================================
async function handleUnbanAll(guild, moderator) {
  try {
    const bans = await guild.bans.fetch();
    if (bans.size === 0) {
      return cv2.info('No Bans', 'There are no banned users in this server to remove.');
    }

    let unbanned = 0;
    let failed = 0;

    for (const [userId] of bans) {
      try {
        await guild.bans.remove(userId, `UnbanAll by ${moderator.user.tag}`);
        unbanned++;
        await new Promise(r => setTimeout(r, 250)); // rate-limit friendly
      } catch { failed++; }
    }

    const resEmbed = cv2.success('All Bans Cleared', `Processed **${bans.size}** ban(s).`, [
      { name: '<a:uptime:1552608831060844575> Unbanned', value: `\`${unbanned}\``, inline: true },
      { name: '<:off:1533844858983157851> Failed', value: `\`${failed}\``, inline: true },
      { name: 'Executed by', value: `${moderator}`, inline: true }
    ]);

    const modTier = getUserTierName(guild, moderator);
    logToSecurityChannel(guild, cv2.log('UnbanAll Executed', 'A mass unban operation was performed.', [
      { name: 'Total Processed', value: `${bans.size}`, inline: true },
      { name: 'Unbanned', value: `${unbanned}`, inline: true },
      { name: 'Moderator', value: `${moderator.user.tag} [${modTier}]`, inline: true }
    ], 'success'));

    return resEmbed;
  } catch (error) {
    console.error(error);
    return cv2.danger('<:off:1533844858983157851> Failed', `An error occurred: ${error.message}`);
  }
}

// ==========================================
// VOICE STATE CONTROL - mute/deafen users
// ==========================================
async function handleVcAction(guild, moderator, targets, action) {
  let successCount = 0;
  let failedCount = 0;
  const isMute = action === 'mute' || action === 'unmute';
  const isEnable = action === 'mute' || action === 'deafen';

  for (const [id, member] of targets) {
    if (!member.voice.channel) {
      failedCount++;
      continue;
    }
    try {
      if (isMute) {
        await member.voice.setMute(isEnable, `${action} by ${moderator.user.tag}`);
      } else {
        await member.voice.setDeaf(isEnable, `${action} by ${moderator.user.tag}`);
      }
      successCount++;
    } catch {
      failedCount++;
    }
  }

  const actionName = action.charAt(0).toUpperCase() + action.slice(1);
  const embedRes = cv2.success(`${actionName} Complete`, `Processed **${targets.size}** member(s).`, [
    { name: '<a:uptime:1552608831060844575> Success', value: `\`${successCount}\``, inline: true },
    { name: '<:off:1533844858983157851> Failed/Not in VC', value: `\`${failedCount}\``, inline: true }
  ]);

  return embedRes;
}
