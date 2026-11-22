import { 
  PermissionFlagsBits, 
  AttachmentBuilder, 
  MessageFlags, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import db from '../database.js';
import statsDB from '../statsDB.js';
import { generateStatCard } from '../utils/statCanvas.js';
import cv2, { sanitizeCV2Payload } from '../cv2.js';
import { buildOverviewPayload } from './serveroverview.js';
import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI } from '../utils/emojis.js';
import { cleanDisplayName, getUserTierName } from '../utils/helpers.js';

export const commands = [
  {
    name: 'stats',
    description: 'View server statistics overview, member activity, and personal insights',
    aliases: ['me', 'u', 'statsme', 'statme', 'mystat', 'mystats', 'sstats', 'serverstatsview'],
    category: 'utility',
    options: [
      {
        name: 'server',
        description: 'View server activity overview dashboard',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'timeframe',
            description: 'Timeframe period for server statistics',
            type: 3, // STRING
            required: false,
            choices: [
              { name: '24H (1 Day)', value: '24h' },
              { name: '7D (1 Week)', value: '7d' },
              { name: '30D (1 Month)', value: '30d' },
              { name: 'All Tracked Time', value: 'all' }
            ]
          }
        ]
      },
      {
        name: 'me',
        description: 'View your own statistics',
        type: 1 // SUB_COMMAND
      },
      {
        name: 'user',
        description: 'View statistics of a specific user',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'target',
            description: 'The user to view stats for',
            type: 6, // USER
            required: true
          }
        ]
      }
    ],
    async executeSlash(interaction) {
      const cfg = db.getGuildConfig(interaction.guild.id);
      if (cfg.statsChannelId && interaction.channel.id !== cfg.statsChannelId) {
        return interaction.reply(cv2.warn('Wrong Channel', `Please use this command in <#${cfg.statsChannelId}>.`));
      }

      await interaction.deferReply();
      const subcommand = interaction.options.getSubcommand(false) || 'server';

      if (subcommand === 'server') {
        const timeframe = interaction.options.getString('timeframe') || '7d';
        try {
          const payload = await buildOverviewPayload(interaction.guild, 'overview', timeframe);
          return interaction.editReply(payload);
        } catch (e) {
          console.error('[Stats] Server overview slash error:', e);
          return interaction.editReply(cv2.danger('Error', 'Failed to render server overview dashboard.'));
        }
      }

      // Subcommand: me or user
      let targetUser = interaction.user;
      let targetMember = interaction.member;

      if (subcommand === 'user') {
        const providedUser = interaction.options.getUser('target');
        if (providedUser) {
          targetUser = providedUser;
          targetMember = await interaction.guild.members.fetch(providedUser.id).catch(() => null);
        }
      }

      const guildId = interaction.guild.id;
      const userId = targetUser.id;
      const dbConfig = db.getGuildConfig(guildId);
      const embedColor = dbConfig.accentColor ? parseInt(dbConfig.accentColor.replace('#', ''), 16) : 0x5865F2;

      // Fetch user data
      const userStats = statsDB.getUserStats(guildId, userId);
      const serverRanks = statsDB.getServerRanks(guildId, userId);
      const topChannels = statsDB.getTopChannels(guildId, userId);
      const chartData = statsDB.getChartData(guildId, userId);

      if (userStats.msg_14d === 0 && userStats.vc_14d === 0) {
        const noDataContainer = {
          type: 17,
          accent_color: embedColor,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} User Statistics > ${cleanDisplayName(targetUser.username)} | ${TICK_EMOJI}`
            },
            { type: 14, divider: true },
            {
              type: 10,
              content:
                `> -# <a:uptime:1552608831060844575> **No Activity Telemetry Recorded (Last 14 Days)**\n` +
                `> -# ${BULLET_EMOJI} **Member:** ${targetUser} (\`${targetUser.id}\`)\n` +
                `> -# ${BULLET_EMOJI} **Status:** Unranked — No messages sent or voice channels joined within lookback window.\n\n` +
                `-# **Tip:** Use \`/stats server\` to explore server-wide statistics!`
            },
            { type: 14, divider: true },
            {
              type: 10,
              content: `-# **Athena Bulletproof Defense Matrix • V1.0.0**`
            }
          ]
        };
        return interaction.editReply({ components: [noDataContainer], flags: MessageFlags.IsComponentsV2 });
      }

      try {
        const buffer = await generateStatCard(targetUser, targetMember, userStats, serverRanks, topChannels, chartData, interaction.guild);
        const attachment = new AttachmentBuilder(buffer, { name: 'statbot-card.png' });

        const cardContainer = {
          type: 17,
          accent_color: embedColor,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} User Statistics > ${cleanDisplayName(targetUser.username)} | ${TICK_EMOJI}`
            },
            { type: 14, divider: true },
            {
              type: 12,
              items: [{ media: { url: 'attachment://statbot-card.png' } }]
            },
            { type: 14, divider: true },
            {
              type: 10,
              content: `-# **Member:** <@${targetUser.id}> (\`${targetUser.id}\`) • **Clearance:** \`[${getUserTierName(interaction.guild, targetMember)}]\` • Athena Bulletproof Defense Matrix`
            }
          ]
        };

        const payload = sanitizeCV2Payload({
          components: [cardContainer],
          files: [attachment],
          flags: MessageFlags.IsComponentsV2
        });

        return interaction.editReply(payload);
      } catch (err) {
        console.error('[Stats] User stat card slash error:', err);
        return interaction.editReply(cv2.danger('Error', 'Failed to generate statistics card. Please try again later.'));
      }
    },

    executePrefix: async (message, args) => {
      const cfg = db.getGuildConfig(message.guild.id);
      if (cfg.statsChannelId && message.channel.id !== cfg.statsChannelId) {
        return message.reply(cv2.warn('Wrong Channel', `Please use this command in <#${cfg.statsChannelId}>.`)).catch(() => null);
      }

      const firstArg = (args[0] || '').toLowerCase();

      // Check if command was triggered via personal user stats alias
      const invokedAlias = message.content.slice(1).trim().split(/ +/)[0].toLowerCase();
      const isExplicitUserCmd = ['me', 'u', 'statsme', 'statme', 'mystat', 'mystats'].includes(invokedAlias);

      // Check if first arg specifies user stats
      const isMention = message.mentions.users.size > 0;
      const isSnowflake = /^\d{17,20}$/.test(args[0] || '');
      const isMeArg = firstArg === 'me' || firstArg === 'user' || isMention || isSnowflake;

      // Check if user wants member count VC management
      const isVcArg = ['vc', 'setup', 'config', 'disable', 'channel', 'channels', 'refresh', 'reset', 'sync'].includes(firstArg);
      if (isVcArg) {
        const { commands: serverStatsCmds } = await import('./serverstats.js');
        const sstats = serverStatsCmds[0];
        if (sstats?.executePrefix) {
          const vcArgs = firstArg === 'vc' ? args.slice(1) : args;
          return sstats.executePrefix(message, vcArgs);
        }
      }

      // If user explicitly asked for their/another user's statistics
      if (isExplicitUserCmd || isMeArg) {
        let targetUser = message.author;
        let targetMember = message.member;

        if (isMention) {
          targetUser = message.mentions.users.first();
          targetMember = message.mentions.members.first() || await message.guild.members.fetch(targetUser.id).catch(() => null);
        } else if (isSnowflake) {
          const fetchedMember = await message.guild.members.fetch(args[0]).catch(() => null);
          if (fetchedMember) {
            targetUser = fetchedMember.user;
            targetMember = fetchedMember;
          }
        } else if (firstArg === 'user' && args[1]) {
          const id = args[1].replace(/[<@!>]/g, '');
          const fetchedMember = await message.guild.members.fetch(id).catch(() => null);
          if (fetchedMember) {
            targetUser = fetchedMember.user;
            targetMember = fetchedMember;
          }
        }

        const guildId = message.guild.id;
        const userId = targetUser.id;
        const dbConfig = db.getGuildConfig(guildId);
        const embedColor = dbConfig.accentColor ? parseInt(dbConfig.accentColor.replace('#', ''), 16) : 0x5865F2;

        // Fetch user data
        const userStats = statsDB.getUserStats(guildId, userId);
        const serverRanks = statsDB.getServerRanks(guildId, userId);
        const topChannels = statsDB.getTopChannels(guildId, userId);
        const chartData = statsDB.getChartData(guildId, userId);

        if (userStats.msg_14d === 0 && userStats.vc_14d === 0) {
          const noDataContainer = {
            type: 17,
            accent_color: embedColor,
            components: [
              {
                type: 10,
                content: `# ${getRandomHeadingGlyph()} User Statistics > ${cleanDisplayName(targetUser.username)} | ${TICK_EMOJI}`
              },
              { type: 14, divider: true },
              {
                type: 10,
                content:
                  `> -# <a:uptime:1552608831060844575> **No Activity Telemetry Recorded (Last 14 Days)**\n` +
                  `> -# ${BULLET_EMOJI} **Member:** ${targetUser} (\`${targetUser.id}\`)\n` +
                  `> -# ${BULLET_EMOJI} **Status:** Unranked — No messages sent or voice channels joined within lookback window.\n` +
                  `> -# ${BULLET_EMOJI} **Live Telemetry:** Athena records messages, voice time, reactions, and links in real-time.\n\n` +
                  `-# **Tip:** Use \`!stats\` or \`!serveroverview\` to explore overall server activity!`
              },
              { type: 14, divider: true },
              {
                type: 1,
                components: [
                  new ButtonBuilder()
                    .setCustomId('so_tab:overview:7d')
                    .setLabel('View Server Stats')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('<a:01_home_beat:1567037361810833428>')
                    .toJSON()
                ]
              },
              { type: 14, divider: true },
              {
                type: 10,
                content: `-# **Athena Bulletproof Defense Matrix • V1.0.0**`
              }
            ]
          };
          return message.reply({ components: [noDataContainer], flags: MessageFlags.IsComponentsV2 });
        }

        const waitMsg = await message.reply(cv2.info('Generating...', 'Rendering high-resolution user statistics card...')).catch(() => null);

        try {
          const buffer = await generateStatCard(targetUser, targetMember, userStats, serverRanks, topChannels, chartData, message.guild);
          const attachment = new AttachmentBuilder(buffer, { name: 'statbot-card.png' });

          const cardContainer = {
            type: 17,
            accent_color: embedColor,
            components: [
              {
                type: 10,
                content: `# ${getRandomHeadingGlyph()} User Statistics > ${cleanDisplayName(targetUser.username)} | ${TICK_EMOJI}`
              },
              { type: 14, divider: true },
              {
                type: 12,
                items: [{ media: { url: 'attachment://statbot-card.png' } }]
              },
              { type: 14, divider: true },
              {
                type: 1,
                components: [
                  new ButtonBuilder()
                    .setCustomId('so_tab:overview:7d')
                    .setLabel('Server Stats')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<a:01_home_beat:1567037361810833428>')
                    .toJSON(),
                  new ButtonBuilder()
                    .setCustomId('so_close')
                    .setLabel('Close')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<a:02_delete_beat:1567037365547962449>')
                    .toJSON()
                ]
              },
              { type: 14, divider: true },
              {
                type: 10,
                content: `-# **Member:** <@${targetUser.id}> (\`${targetUser.id}\`) • **Clearance:** \`[${getUserTierName(message.guild, targetMember)}]\` • Athena Bulletproof Defense Matrix`
              }
            ]
          };

          const payload = sanitizeCV2Payload({
            components: [cardContainer],
            files: [attachment],
            flags: MessageFlags.IsComponentsV2
          });

          if (waitMsg) {
            await waitMsg.edit(payload).catch(async () => {
              await waitMsg.delete().catch(() => null);
              await message.channel.send(payload);
            });
          } else {
            await message.channel.send(payload);
          }
        } catch (err) {
          console.error('[Stats] User stat card prefix error:', err);
          if (waitMsg) {
            await waitMsg.edit(cv2.danger('Error', 'Failed to generate statistics card. Please try again later.')).catch(() => null);
          }
        }
        return;
      }

      // Default !stats (with no args, or !stats server, or !stats overview, or !stats 7d / 24h / 30d / all):
      // Render the high-fidelity Server Stats Overview Dashboard!
      let timeframe = '7d';
      if (['24h', '1d', 'day', 'today'].includes(firstArg)) timeframe = '24h';
      else if (['30d', '1m', 'month'].includes(firstArg)) timeframe = '30d';
      else if (['all', 'alltime', 'total'].includes(firstArg)) timeframe = 'all';

      const waitMsg = await message.reply(cv2.info('Analyzing...', 'Crunching server activity telemetry and rendering overview dashboard...')).catch(() => null);

      try {
        const payload = await buildOverviewPayload(message.guild, 'overview', timeframe);
        if (waitMsg) {
          await waitMsg.edit(payload).catch(async () => {
            await waitMsg.delete().catch(() => null);
            await message.channel.send(payload);
          });
        } else {
          await message.channel.send(payload);
        }
      } catch (e) {
        console.error('[Stats] Server overview prefix error:', e);
        if (waitMsg) {
          await waitMsg.edit(cv2.danger('Error', 'Failed to render server overview dashboard.')).catch(() => null);
        }
      }
    }
  }
];
