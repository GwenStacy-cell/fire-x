import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { PermissionFlagsBits, AttachmentBuilder, MessageFlags } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { calculateXpForLevel } from '../utils/xpEngine.js';
import { generateRankCard, generateLeaderboard } from '../utils/canvasCards.js';
import { isExtraOwnerOrHigher } from '../utils/helpers.js';

const TROPHY = '<a:trophy:1533859922599481577>';
const COIN = '<a:Boost2:1533859928949784776>';

export async function buildXpDashboard(guildId) {
  const { ActionRowBuilder, RoleSelectMenuBuilder, MessageFlags } = await import('discord.js');
  const system = db.getXpSystem(guildId);

  const ON  = '<:on:1533844867191406672>';
  const OFF = '<:off:1533844858983157851>';
  const statusIcon = system.enabled ? ON : OFF;
  const statusLabel = system.enabled ? 'ONLINE & ACTIVE' : 'OFFLINE & PAUSED';

  // Determine current announcement setting text
  let announceSettingText = 'Current Channel (Active Chat)';
  const currentMode = system.announceMode || (system.announceChannelId ? 'channel' : 'current');
  if (currentMode === 'dm') {
    announceSettingText = 'Direct Message (User DM)';
  } else if (currentMode === 'disabled') {
    announceSettingText = 'Disabled (No Alerts)';
  } else if (system.announceChannelId) {
    announceSettingText = `<#${system.announceChannelId}> (Dedicated Channel)`;
  } else {
    announceSettingText = 'Current Channel (Where chatting)';
  }

  const cmdChannelText = system.cmdChannelId ? `<#${system.cmdChannelId}> (Restricted)` : 'All Channels (Unrestricted)';

  let rewardsText = 'None configured';
  if (Object.keys(system.roleRewards || {}).length > 0) {
    rewardsText = Object.entries(system.roleRewards)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([level, roleId]) => `Level ${level} -> <@&${roleId}>`)
      .join('\n-# <a:target_blink:1565667466984554588> ');
  }

  let multipliersText = 'None configured (1.0x default)';
  if (Object.keys(system.multipliers || {}).length > 0) {
    multipliersText = Object.entries(system.multipliers)
      .map(([roleId, mult]) => `<@&${roleId}> (${mult}x)`)
      .join('\n-# <a:target_blink:1565667466984554588> ');
  }

  const allUsers = db.getTopUsersXp(guildId, 99999);
  const totalTracked = allUsers.length;

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} XP Manager\n` +
          `-# **__Interactive Leveling & XP Control Matrix__**\n\n` +
          `-# ${BULLET_EMOJI} **System Status:** ${statusIcon} **${statusLabel}**\n` +
          `-# ${BULLET_EMOJI} **Announcement Mode / Destination:** **${announceSettingText}**\n` +
          `-# ${BULLET_EMOJI} **Commands Channel:** **${cmdChannelText}**\n` +
          `-# ${BULLET_EMOJI} **Active Tracked Members:** **${totalTracked} users**\n` +
          `-# ${BULLET_EMOJI} **Base XP Rate:** **15 - 25 XP / msg (60s cooldown)**`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          `-# **__Current Rewards & Multipliers__**\n` +
          `-# ${BULLET_EMOJI} **Level Role Rewards:**\n-# ${BULLET_EMOJI} ${rewardsText}\n\n` +
          `-# ${BULLET_EMOJI} **Role XP Boost Multipliers:**\n-# ${BULLET_EMOJI} ${multipliersText}`
      },
      { type: 14, divider: true },
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: 'xp_mode_select',
            placeholder: `Mode: ${currentMode === 'channel' ? 'Dedicated Channel' : currentMode === 'dm' ? 'Direct Message' : currentMode === 'disabled' ? 'Disabled' : 'Current Channel'}`,
            options: [
              { label: 'Current Channel', value: 'current', description: 'Announce in the active chat where member leveled up', default: currentMode === 'current' },
              { label: 'Direct Message (DM)', value: 'dm', description: 'Send level up card directly to member DMs', default: currentMode === 'dm' },
              { label: 'Dedicated Channel', value: 'channel_modal', description: 'Set specific announcement channel by ID', default: currentMode === 'channel' },
              { label: 'Disabled', value: 'disabled', description: 'Mute all level-up announcements', default: currentMode === 'disabled' }
            ]
          }
        ]
      },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'xp_toggle',       label: system.enabled ? 'Disable System' : 'Enable System', style: system.enabled ? 4 : 3 },
          { type: 2, custom_id: 'xp_set_announce', label: 'Announce Channel', style: 2 },
          { type: 2, custom_id: 'xp_set_cmd',      label: 'Command Channel',  style: 2 },
          { type: 2, custom_id: 'xp_clear',        label: 'Reset Setup',      style: 4 }
        ]
      },
      {
        type: 1,
        components: [
          { type: 6, custom_id: 'xp_add_reward', placeholder: 'Select role to add as Level Reward...', min_values: 1, max_values: 1 }
        ]
      },
      {
        type: 1,
        components: [
          { type: 6, custom_id: 'xp_add_multiplier', placeholder: 'Select roles for 1.5x XP Boost...', min_values: 1, max_values: 10 }
        ]
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: '-# Athena Prime Defense Matrix • Leveling System'
      }
    ]
  };

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

export const commands = [
  {
    name: 'xpsetup',
    description: 'Launch the Interactive XP Manager Control Panel.',
    category: 'admin',
    permissions: [PermissionFlagsBits.ManageGuild],
    options: [],
    async executePrefix(message) {
      const payload = await buildXpDashboard(message.guild.id);
      await message.reply(payload);
    },
    async executeSlash(interaction) {
      const payload = await buildXpDashboard(interaction.guild.id);
      await interaction.reply({ ...payload });
    }
  },

  {
    name: 'rank',
    description: 'View your current rank and XP.',
    category: 'leveling',
    aliases: ['lvl', 'level', 'xp'],
    options: [
      { name: 'user', description: 'User to view', type: 6, required: false }
    ],
    async executePrefix(message, args) {
      const system = db.getXpSystem(message.guild.id);
      if (!system || !system.enabled) {
        return message.reply(cv2.warn('XP System Inactive', 'The leveling and XP system is currently disabled on this server.\n-# Configure and enable it using `!xpsetup`.'));
      }

      // Admin Channel Configuration Subcommand (!xp channel #channel)
      if (args[0] && (args[0].toLowerCase() === 'channel' || args[0].toLowerCase() === 'stats' || args[0].toLowerCase() === 'cmdchannel')) {
        if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
          return message.reply({ components: [cv2.buildContainer('Permission Denied', 'Only Extra Owners or the Server Owner can configure the XP stats channel.')], flags: MessageFlags.IsComponentsV2 });
        }
        if (args[1] && args[1].toLowerCase() === 'clear') {
          db.setXpSystem(message.guild.id, { ...system, cmdChannelId: null });
          return message.reply({
            components: [{
              type: 17,
              components: [{
                type: 10,
                content: `# ${getRandomHeadingGlyph()} XP Stats Channel Reset | ${TICK_EMOJI}\n> -# ${BULLET_EMOJI} Cleared XP stats channel. Level up cards and XP commands are now unrestricted.`
              }]
            }],
            flags: MessageFlags.IsComponentsV2
          });
        }
        const targetChannel = message.mentions.channels.first() || (args[1] ? message.guild.channels.cache.get(args[1]) : null);
        if (targetChannel) {
          db.setXpSystem(message.guild.id, { ...system, cmdChannelId: targetChannel.id });
          return message.reply({
            components: [{
              type: 17,
              components: [{
                type: 10,
                content: `# ${getRandomHeadingGlyph()} XP Stats Channel Bound | ${TICK_EMOJI}\n> -# ${BULLET_EMOJI} Bound XP stats and commands channel to <#${targetChannel.id}>.\n> -# ${BULLET_EMOJI} Level-up announcements will now feature direct links and buttons to this channel.`
              }]
            }],
            flags: MessageFlags.IsComponentsV2
          });
        }
        return message.reply({
          components: [{
            type: 17,
            components: [{
              type: 10,
              content: `# ${getRandomHeadingGlyph()} XP Stats Channel Configuration\n> -# ${BULLET_EMOJI} **Current Stats Channel:** ${system.cmdChannelId ? `<#${system.cmdChannelId}>` : '`Not Set (Unrestricted)`'}\n> -# ${BULLET_EMOJI} **Usage:** \`!xp channel <#channel>\` or \`!xp channel clear\``
            }]
          }],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (system.cmdChannelId && message.channelId !== system.cmdChannelId) {
        return message.reply(cv2.warn('Restricted Channel', `Please execute XP statistics commands in <#${system.cmdChannelId}>.`));
      }

      const targetUser = message.mentions.users.first()
        || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null)
        || message.author;
      let targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) targetMember = { user: targetUser, displayName: targetUser.username };

      const allUsers = db.getTopUsersXp(message.guild.id, 99999);
      let rank = allUsers.findIndex(u => u.userId === targetUser.id) + 1;
      
      const userXp = db.getUserXp(message.guild.id, targetUser.id);
      if (rank === 0 && userXp.xp > 0) {
        rank = allUsers.length + 1;
      } else if (rank === 0) {
        rank = '-';
      }

      const requiredXp = calculateXpForLevel(userXp.level + 1);
      
      const attachment = await generateRankCard(targetMember, userXp.xp, userXp.level, rank, requiredXp);
      await message.reply({ content: `# ${getRandomHeadingGlyph()} Member Rank | ${TICK_EMOJI}\n-# ${BULLET_EMOJI} **Rank Card for <@${targetUser.id}>**`, files: [attachment] });
    },
    async executeSlash(interaction) {
      const system = db.getXpSystem(interaction.guild.id);
      if (!system || !system.enabled) {
        return interaction.reply({ ...cv2.warn('XP System Inactive', 'The leveling and XP system is currently disabled on this server.\n-# Configure and enable it using `!xpsetup`.'), flags: MessageFlags.Ephemeral });
      }

      if (system.cmdChannelId && interaction.channelId !== system.cmdChannelId) {
        return interaction.reply({ ...cv2.warn('Restricted Channel', `Please execute XP statistics commands in <#${system.cmdChannelId}>.`), flags: MessageFlags.Ephemeral });
      }

      await interaction.deferReply();
      const targetUser = interaction.options.getUser('user') || interaction.user;
      let targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) targetMember = { user: targetUser, displayName: targetUser.username }; // Fallback

      const allUsers = db.getTopUsersXp(interaction.guild.id, 99999);
      let rank = allUsers.findIndex(u => u.userId === targetUser.id) + 1;
      
      const userXp = db.getUserXp(interaction.guild.id, targetUser.id);
      if (rank === 0 && userXp.xp > 0) {
        rank = allUsers.length + 1; // Fallback if not found in cache for some reason
      } else if (rank === 0) {
        rank = '-';
      }

      const requiredXp = calculateXpForLevel(userXp.level + 1);
      
      const attachment = await generateRankCard(targetMember, userXp.xp, userXp.level, rank, requiredXp);
      await interaction.editReply({ content: `# ${getRandomHeadingGlyph()} Member Rank | ${TICK_EMOJI}\n-# ${BULLET_EMOJI} **Rank Card for <@${targetUser.id}>**`, files: [attachment] });
    }
  },

  {
    name: 'leaderboard',
    description: 'View the server XP leaderboard.',
    category: 'leveling',
    options: [
      { name: 'page', description: 'Page number', type: 4, required: false }
    ],
    async executeSlash(interaction) {
      const system = db.getXpSystem(interaction.guild.id);
      if (!system || !system.enabled) {
        return interaction.reply({ content: 'The XP system is currently disabled.' });
      }

      if (system.cmdChannelId && interaction.channelId !== system.cmdChannelId) {
        return interaction.reply({ content: `Please use this command in <#${system.cmdChannelId}>.` });
      }

      await interaction.deferReply();
      
      const allUsers = db.getTopUsersXp(interaction.guild.id, 100);
      const totalPages = Math.max(1, Math.ceil(allUsers.length / 10));
      const page = Math.max(1, Math.min(interaction.options.getInteger('page') || 1, totalPages));
      
      const startIdx = (page - 1) * 10;
      const paginatedUsers = allUsers.slice(startIdx, startIdx + 10);
      
      if (paginatedUsers.length === 0) {
        return interaction.editReply({ content: 'No users have gained XP yet!' });
      }

      const attachment = await generateLeaderboard(interaction.guild, paginatedUsers, page, totalPages);
      await interaction.editReply({ content: `${TROPHY} **Server Leaderboard** ${COIN}`, files: [attachment] });
    }
  },

  // --- RANK THEME COMMAND ---
  {
    name: 'ranktheme',
    description: 'Switch your personalized XP rank card visual theme (e.g. Hogwarts Animated GIF or Athena Classic).',
    category: 'leveling',
    aliases: ['setranktheme', 'cardtheme'],
    options: [
      {
        name: 'theme',
        description: 'Choose your card visual theme',
        type: 3,
        required: true,
        choices: [
          { name: 'Hogwarts (Animated Looping GIF)', value: 'hogwarts' },
          { name: 'Athena Classic (Obsidian Stone)', value: 'athena' }
        ]
      }
    ],
    async executePrefix(message, args) {
      const choice = (args[0] || '').toLowerCase();
      if (choice !== 'hogwarts' && choice !== 'athena' && choice !== 'classic') {
        const current = db.getUserRankTheme(message.author.id);
        return message.reply({
          components: [
            cv2.buildContainer(
              'Rank Theme Settings | <a:03_tick_circle:1565665642084827206>',
              `-# ${BULLET_EMOJI} **Active Theme:** \`${current.toUpperCase()}\`\n\n` +
              `-# ${BULLET_EMOJI} \`!ranktheme hogwarts\` \u2014 Cinematic Animated GIF with soaring Hedwig & flaming altar\n` +
              `-# ${BULLET_EMOJI} \`!ranktheme athena\` \u2014 Sleek Obsidian & God of War stone card`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const selected = (choice === 'athena' || choice === 'classic') ? 'athena' : 'hogwarts';
      db.setUserRankTheme(message.author.id, selected);

      return message.reply({
        components: [
          cv2.buildContainer(
            'Rank Theme Updated | <a:03_tick_circle:1565665642084827206>',
            `Your rank card theme has been switched to **\`${selected.toUpperCase()}\`**.\nRun \`!rank\` to preview your card.`
          )
        ],
        flags: MessageFlags.IsComponentsV2
      });
    },
    async executeSlash(interaction) {
      const theme = interaction.options.getString('theme');
      db.setUserRankTheme(interaction.user.id, theme);

      return interaction.reply({
        components: [
          cv2.buildContainer(
            'Rank Theme Updated | <a:03_tick_circle:1565665642084827206>',
            `Your rank card theme has been switched to **\`${theme.toUpperCase()}\`**.\nRun \`/rank\` to preview your card.`
          )
        ],
        flags: MessageFlags.IsComponentsV2
      });
    }
  },

  // --- RANK REWARDS COMMAND ---
  {
    name: 'rankrewards',
    description: 'Configure and view automatic role rewards granted upon reaching specific levels.',
    category: 'leveling',
    aliases: ['levelrewards', 'lvlaur', 'xprewards'],
    options: [
      {
        name: 'list',
        description: 'View all active level role rewards',
        type: 1
      },
      {
        name: 'add',
        description: 'Bind a role reward to a specific level (Admin)',
        type: 1,
        options: [
          { name: 'level', description: 'Target level', type: 4, required: true },
          { name: 'role', description: 'Role granted', type: 8, required: true }
        ]
      },
      {
        name: 'remove',
        description: 'Remove role reward for a level (Admin)',
        type: 1,
        options: [
          { name: 'level', description: 'Level milestone to unbind', type: 4, required: true }
        ]
      }
    ],
    async executePrefix(message, args) {
      const guildId = message.guild.id;
      const system = db.getXpSystem(guildId);
      const sub = (args[0] || '').toLowerCase();

      if (sub === 'add') {
        if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
          return message.reply({ components: [cv2.buildContainer('Permission Denied', 'Only Extra Owners or the Server Owner can add level rewards.')], flags: MessageFlags.IsComponentsV2 });
        }
        const level = parseInt(args[1]);
        const role = message.mentions.roles.first() || (args[2] ? message.guild.roles.cache.get(args[2]) : null);
        if (isNaN(level) || level < 1 || !role) {
          return message.reply({
            components: [cv2.buildContainer('Usage', '`!rankrewards add <level> <@role>`\n-# Example: `!rankrewards add 10 @Veteran`')],
            flags: MessageFlags.IsComponentsV2
          });
        }
        const rewards = system.roleRewards || {};
        rewards[String(level)] = role.id;
        db.setXpSystem(guildId, { ...system, roleRewards: rewards });

        return message.reply({
          components: [
            cv2.buildContainer(
              'Level Reward Registered | <a:03_tick_circle:1565665642084827206>',
              `Members reaching **Level ${level}** will now automatically receive the <@&${role.id}> role.`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'remove' || sub === 'delete') {
        if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
          return message.reply({ components: [cv2.buildContainer('Permission Denied', 'Only Extra Owners or the Server Owner can remove level rewards.')], flags: MessageFlags.IsComponentsV2 });
        }
        const level = parseInt(args[1]);
        if (isNaN(level)) {
          return message.reply({ components: [cv2.buildContainer('Usage', '`!rankrewards remove <level>`')], flags: MessageFlags.IsComponentsV2 });
        }
        const rewards = system.roleRewards || {};
        delete rewards[String(level)];
        db.setXpSystem(guildId, { ...system, roleRewards: rewards });

        return message.reply({
          components: [
            cv2.buildContainer(
              'Level Reward Purged | <a:03_tick_circle:1565665642084827206>',
              `Milestone role reward for **Level ${level}** was removed.`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      // Default: List
      const rewards = system.roleRewards || {};
      const entries = Object.entries(rewards).sort((a, b) => Number(a[0]) - Number(b[0]));
      if (entries.length === 0) {
        return message.reply({
          components: [
            cv2.buildContainer(
              'Level Role Milestones | <a:03_tick_circle:1565665642084827206>',
              'No level role rewards are configured on this server yet.\n\n-# **Administrators:** Use `!rankrewards add <level> <@role>`'
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const listStr = entries.map(([lvl, roleId]) => `-# ${BULLET_EMOJI} **Level ${lvl}** \u2192 <@&${roleId}> \`(${roleId})\``).join('\n');
      return message.reply({
        components: [
          cv2.buildContainer(
            'Level Role Milestones | <a:03_tick_circle:1565665642084827206>',
            `### **Configured Milestone Role Rewards**\n\n${listStr}`
          )
        ],
        flags: MessageFlags.IsComponentsV2
      });
    },

    async executeSlash(interaction) {
      const guildId = interaction.guild.id;
      const system = db.getXpSystem(guildId);
      const sub = interaction.options.getSubcommand();

      if (sub === 'add') {
        const level = interaction.options.getInteger('level');
        const role = interaction.options.getRole('role');
        const rewards = system.roleRewards || {};
        rewards[String(level)] = role.id;
        db.setXpSystem(guildId, { ...system, roleRewards: rewards });

        return interaction.reply({
          components: [
            cv2.buildContainer(
              'Level Reward Registered | <a:03_tick_circle:1565665642084827206>',
              `Members reaching **Level ${level}** will automatically receive <@&${role.id}>.`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'remove') {
        const level = interaction.options.getInteger('level');
        const rewards = system.roleRewards || {};
        delete rewards[String(level)];
        db.setXpSystem(guildId, { ...system, roleRewards: rewards });

        return interaction.reply({
          components: [
            cv2.buildContainer(
              'Level Reward Purged | <a:03_tick_circle:1565665642084827206>',
              `Milestone role reward for **Level ${level}** was removed.`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      // List
      const rewards = system.roleRewards || {};
      const entries = Object.entries(rewards).sort((a, b) => Number(a[0]) - Number(b[0]));
      if (entries.length === 0) {
        return interaction.reply({
          components: [
            cv2.buildContainer(
              'Level Role Milestones | <a:03_tick_circle:1565665642084827206>',
              'No level role rewards configured yet.\n\n-# **Administrators:** Use `/rankrewards add`.'
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const listStr = entries.map(([lvl, roleId]) => `-# ${BULLET_EMOJI} **Level ${lvl}** \u2192 <@&${roleId}> \`(${roleId})\``).join('\n');
      return interaction.reply({
        components: [
          cv2.buildContainer(
            'Level Role Milestones | <a:03_tick_circle:1565665642084827206>',
            `### **Configured Milestone Role Rewards**\n\n${listStr}`
          )
        ],
        flags: MessageFlags.IsComponentsV2
      });
    }
  }
];
