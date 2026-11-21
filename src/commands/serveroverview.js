import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  AttachmentBuilder, 
  EmbedBuilder,
  MessageFlags 
} from 'discord.js';
import statsDB from '../statsDB.js';
import { generateStatbotOverviewImage, generateTopImage } from '../utils/statCanvas.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { getRandomHeadingGlyph, BULLET_EMOJI } from '../utils/emojis.js';

export function getTimeframeLabel(timeframe) {
  switch (timeframe) {
    case '24h': return '24H (1 Day)';
    case '30d': return '30D (1 Month)';
    case 'all': return 'All Tracked Time';
    case '7d':
    default: return '7D (1 Week)';
  }
}

export function buildServerOverviewComponents(activeTab = 'overview', timeframe = '7d') {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`so_tab:overview:${timeframe}`)
      .setLabel('Overview')
      .setStyle(activeTab === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`so_tab:text:${timeframe}`)
      .setLabel('Text')
      .setStyle(activeTab === 'text' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`so_tab:voice:${timeframe}`)
      .setLabel('Voice')
      .setStyle(activeTab === 'voice' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`so_tab:engagement:${timeframe}`)
      .setLabel('Engagement')
      .setStyle(activeTab === 'engagement' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`so_tab:active:${timeframe}`)
      .setLabel('Active')
      .setStyle(activeTab === 'active' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`so_tab:graphs:${timeframe}`)
      .setLabel('Graphs')
      .setStyle(activeTab === 'graphs' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`so_tab:growth:${timeframe}`)
      .setLabel('Growth')
      .setStyle(activeTab === 'growth' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`so_tab:leaderboards:${timeframe}`)
      .setLabel('Leaderboards')
      .setStyle(activeTab === 'leaderboards' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`so_tab:compare:${timeframe}`)
      .setLabel('Compare')
      .setStyle(activeTab === 'compare' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`so_refresh:${activeTab}:${timeframe}`)
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('so_close')
      .setLabel('Close')
      .setStyle(ButtonStyle.Secondary)
  );

  const row4 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`so_timeframe:${activeTab}`)
      .setPlaceholder(getTimeframeLabel(timeframe))
      .addOptions([
        { label: '24H (1 Day)', value: '24h', default: timeframe === '24h' },
        { label: '7D (1 Week)', value: '7d', default: timeframe === '7d' },
        { label: '30D (1 Month)', value: '30d', default: timeframe === '30d' },
        { label: 'All Tracked Time', value: 'all', default: timeframe === 'all' }
      ])
  );

  return [row1, row2, row3, row4];
}

export async function buildOverviewPayload(guild, activeTab = 'overview', timeframe = '7d') {
  const components = buildServerOverviewComponents(activeTab, timeframe);
  const stats = statsDB.getServerStatbotStats(guild.id, timeframe);

  if (activeTab === 'overview') {
    const buffer = await generateStatbotOverviewImage(guild, stats, timeframe);
    const attachment = new AttachmentBuilder(buffer, { name: 'server-overview.png' });
    return {
      content: null,
      embeds: [],
      files: [attachment],
      components
    };
  }

  if (activeTab === 'leaderboards') {
    const topMsgs = stats.topMsgMembers || [];
    const topVcs = stats.topVcMembers || [];
    const buffer = await generateTopImage(guild, topMsgs, topVcs);
    const attachment = new AttachmentBuilder(buffer, { name: 'server-leaderboard.png' });
    return {
      content: null,
      embeds: [],
      files: [attachment],
      components
    };
  }

  // Text Breakdown
  if (activeTab === 'text') {
    const tfLabel = getTimeframeLabel(timeframe);
    const dbConfig = db.getGuildConfig(guild.id);
    const embedColor = dbConfig.accentColor ? parseInt(dbConfig.accentColor.replace('#', ''), 16) : 0x2b2d31;

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`${getRandomHeadingGlyph()} Server Stats > Text Telemetry (${tfLabel})`)
      .setDescription(
        `> -# ${BULLET_EMOJI} **Total Messages:** \`${stats.messages.total.toLocaleString()}\`\n` +
        `> -# ${BULLET_EMOJI} **Daily Average:** \`${stats.messages.avg.toLocaleString()} msgs/day\`\n` +
        `> -# ${BULLET_EMOJI} **Today's Activity:** \`${stats.messages.today.toLocaleString()} msgs\`\n` +
        `> -# ${BULLET_EMOJI} **Links Distributed:** \`${stats.links.total.toLocaleString()}\` (\`${stats.links.avg} / day\`)\n\n` +
        `### Top Message Contributors\n` +
        (stats.topMsgMembers.length > 0
          ? stats.topMsgMembers.map((m, i) => `> -# **#${i + 1}** <@${m.user_id}>: \`${m.total.toLocaleString()} msgs\``).join('\n')
          : `> -# No message telemetry recorded for this timeframe.`)
      )
      .setFooter({ text: `Tracking since ${stats.trackingSince} | UTC \u2022 Powered by Athena` });

    return {
      content: null,
      embeds: [embed],
      files: [],
      components
    };
  }

  // Voice Breakdown
  if (activeTab === 'voice') {
    const tfLabel = getTimeframeLabel(timeframe);
    const dbConfig = db.getGuildConfig(guild.id);
    const embedColor = dbConfig.accentColor ? parseInt(dbConfig.accentColor.replace('#', ''), 16) : 0x2b2d31;

    const formatVoice = (s) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`${getRandomHeadingGlyph()} Server Stats > Voice Telemetry (${tfLabel})`)
      .setDescription(
        `> -# ${BULLET_EMOJI} **Total Voice Time:** \`${formatVoice(stats.voice.totalSeconds)}\`\n` +
        `> -# ${BULLET_EMOJI} **Daily Average:** \`${formatVoice(stats.voice.avgSeconds)} / day\`\n` +
        `> -# ${BULLET_EMOJI} **Today's Voice Time:** \`${formatVoice(stats.voice.todaySeconds)}\`\n\n` +
        `### Top Voice Talkers\n` +
        (stats.topVcMembers.length > 0
          ? stats.topVcMembers.map((m, i) => `> -# **#${i + 1}** <@${m.user_id}>: \`${formatVoice(m.total)}\``).join('\n')
          : `> -# No voice telemetry recorded for this timeframe.`)
      )
      .setFooter({ text: `Tracking since ${stats.trackingSince} | UTC \u2022 Powered by Athena` });

    return {
      content: null,
      embeds: [embed],
      files: [],
      components
    };
  }

  // Engagement Breakdown
  if (activeTab === 'engagement') {
    const tfLabel = getTimeframeLabel(timeframe);
    const dbConfig = db.getGuildConfig(guild.id);
    const embedColor = dbConfig.accentColor ? parseInt(dbConfig.accentColor.replace('#', ''), 16) : 0x2b2d31;

    const ratio = stats.messages.total > 0 ? (stats.reactions.total / stats.messages.total).toFixed(3) : '0.000';

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`${getRandomHeadingGlyph()} Server Stats > Engagement Matrix (${tfLabel})`)
      .setDescription(
        `> -# ${BULLET_EMOJI} **Total Reactions:** \`${stats.reactions.total.toLocaleString()}\` (All-Time: \`${stats.reactions.all.toLocaleString()}\`)\n` +
        `> -# ${BULLET_EMOJI} **Reaction Velocity:** \`${stats.reactions.avg} / day\`\n` +
        `> -# ${BULLET_EMOJI} **Total Hyperlinks:** \`${stats.links.total.toLocaleString()}\` (All-Time: \`${stats.links.all.toLocaleString()}\`)\n` +
        `> -# ${BULLET_EMOJI} **Link Velocity:** \`${stats.links.avg} / day\`\n` +
        `> -# ${BULLET_EMOJI} **Reactivity Ratio:** \`${ratio} reactions / msg\`\n` +
        `> -# ${BULLET_EMOJI} **Active Participants:** \`${stats.activeUsers.active.toLocaleString()} members\`\n`
      )
      .setFooter({ text: `Tracking since ${stats.trackingSince} | UTC \u2022 Powered by Athena` });

    return {
      content: null,
      embeds: [embed],
      files: [],
      components
    };
  }

  // Active Users Breakdown
  if (activeTab === 'active') {
    const tfLabel = getTimeframeLabel(timeframe);
    const dbConfig = db.getGuildConfig(guild.id);
    const embedColor = dbConfig.accentColor ? parseInt(dbConfig.accentColor.replace('#', ''), 16) : 0x2b2d31;

    const totalMembers = guild.memberCount || 1;
    const activePercent = ((stats.activeUsers.active / totalMembers) * 100).toFixed(1);

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`${getRandomHeadingGlyph()} Server Stats > Active User Telemetry (${tfLabel})`)
      .setDescription(
        `> -# ${BULLET_EMOJI} **Unique Active Members:** \`${stats.activeUsers.active.toLocaleString()} users\` (\`${activePercent}%\` of server)\n` +
        `> -# ${BULLET_EMOJI} **Daily Active Average:** \`${stats.activeUsers.avg} users/day\`\n` +
        `> -# ${BULLET_EMOJI} **Peak Daily Active:** \`${stats.activeUsers.peak.toLocaleString()} users\`\n` +
        `> -# ${BULLET_EMOJI} **Server Population:** \`${totalMembers.toLocaleString()} total members\`\n`
      )
      .setFooter({ text: `Tracking since ${stats.trackingSince} | UTC \u2022 Powered by Athena` });

    return {
      content: null,
      embeds: [embed],
      files: [],
      components
    };
  }

  // Growth Breakdown
  if (activeTab === 'growth') {
    const tfLabel = getTimeframeLabel(timeframe);
    const dbConfig = db.getGuildConfig(guild.id);
    const embedColor = dbConfig.accentColor ? parseInt(dbConfig.accentColor.replace('#', ''), 16) : 0x2b2d31;

    const netGrowth = stats.members.joined - stats.members.left;
    const netPrefix = netGrowth > 0 ? '+' : '';

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`${getRandomHeadingGlyph()} Server Stats > Growth & Population Dynamics (${tfLabel})`)
      .setDescription(
        `> -# ${BULLET_EMOJI} **Current Population:** \`${guild.memberCount.toLocaleString()} members\`\n` +
        `> -# ${BULLET_EMOJI} **Members Joined:** \`+${stats.members.joined.toLocaleString()}\`\n` +
        `> -# ${BULLET_EMOJI} **Members Departed:** \`-${stats.members.left.toLocaleString()}\`\n` +
        `> -# ${BULLET_EMOJI} **Net Population Shift:** \`${netPrefix}${netGrowth.toLocaleString()}\`\n`
      )
      .setFooter({ text: `Tracking since ${stats.trackingSince} | UTC \u2022 Powered by Athena` });

    return {
      content: null,
      embeds: [embed],
      files: [],
      components
    };
  }

  // Graphs Tab (14-day Activity Trend)
  if (activeTab === 'graphs') {
    const oldOverview = statsDB.getServerOverviewStats(guild.id);
    const buffer = await generateStatbotOverviewImage(guild, stats, timeframe);
    const attachment = new AttachmentBuilder(buffer, { name: 'trend.png' });
    return {
      content: null,
      embeds: [],
      files: [attachment],
      components
    };
  }

  // Compare Tab
  if (activeTab === 'compare') {
    const tfLabel = getTimeframeLabel(timeframe);
    const dbConfig = db.getGuildConfig(guild.id);
    const embedColor = dbConfig.accentColor ? parseInt(dbConfig.accentColor.replace('#', ''), 16) : 0x2b2d31;

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`${getRandomHeadingGlyph()} Server Stats > Comparative Telemetry (${tfLabel})`)
      .setDescription(
        `> -# ${BULLET_EMOJI} **Active Timeframe:** \`${tfLabel}\`\n` +
        `> -# ${BULLET_EMOJI} **Messages Analyzed:** \`${stats.messages.total.toLocaleString()} msgs\`\n` +
        `> -# ${BULLET_EMOJI} **Voice Tracked:** \`${Math.round(stats.voice.totalSeconds / 3600)} hours\`\n` +
        `> -# ${BULLET_EMOJI} **Daily Active Users:** \`${stats.activeUsers.avg} avg / day\`\n` +
        `> -# ${BULLET_EMOJI} **Growth Ratio:** \`${stats.members.joined} joins / ${stats.members.left} leaves\`\n`
      )
      .setFooter({ text: `Tracking since ${stats.trackingSince} | UTC \u2022 Powered by Athena` });

    return {
      content: null,
      embeds: [embed],
      files: [],
      components
    };
  }

  // Fallback to overview
  const buffer = await generateStatbotOverviewImage(guild, stats, timeframe);
  const attachment = new AttachmentBuilder(buffer, { name: 'server-overview.png' });
  return {
    content: null,
    embeds: [],
    files: [attachment],
    components
  };
}

export async function handleServerOverviewInteraction(interaction) {
  const customId = interaction.customId;
  if (!customId.startsWith('so_')) return;

  if (customId === 'so_close') {
    return interaction.message.delete().catch(() => interaction.update({ components: [] }));
  }

  await interaction.deferUpdate().catch(() => null);

  let activeTab = 'overview';
  let timeframe = '7d';

  if (customId.startsWith('so_timeframe')) {
    const parts = customId.split(':');
    activeTab = parts[1] || 'overview';
    timeframe = interaction.values?.[0] || '7d';
  } else if (customId.startsWith('so_tab:')) {
    const parts = customId.split(':');
    activeTab = parts[1] || 'overview';
    timeframe = parts[2] || '7d';
  } else if (customId.startsWith('so_refresh:')) {
    const parts = customId.split(':');
    activeTab = parts[1] || 'overview';
    timeframe = parts[2] || '7d';
  }

  try {
    const payload = await buildOverviewPayload(interaction.guild, activeTab, timeframe);
    await interaction.editReply(payload).catch(console.error);
  } catch (err) {
    console.error('Error updating server overview interaction:', err);
  }
}

export const commands = [
  {
    name: 'serveroverview',
    description: 'View a high-fidelity Statbot-style overview dashboard of server statistics',
    aliases: ['so', 'serverstats', 'server', 'serverstat', 'serverview', 'sstats', 'soverview', 'sstat', 'statsview', 'serverstatsview', 'overview'],
    category: 'utility',
    options: [
      {
        name: 'timeframe',
        description: 'Timeframe period for statistics',
        type: 3, // STRING
        required: false,
        choices: [
          { name: '24H (1 Day)', value: '24h' },
          { name: '7D (1 Week)', value: '7d' },
          { name: '30D (1 Month)', value: '30d' },
          { name: 'All Tracked Time', value: 'all' }
        ]
      }
    ],
    async executePrefix(message, args) {
      const waitMsg = await message.reply(cv2.info('Analyzing...', 'Crunching server activity telemetry and rendering overview dashboard...')).catch(() => null);
      
      const requestedTf = (args[0] || '').toLowerCase();
      let timeframe = '7d';
      if (['24h', '1d', 'day', 'today'].includes(requestedTf)) timeframe = '24h';
      else if (['30d', '1m', 'month'].includes(requestedTf)) timeframe = '30d';
      else if (['all', 'alltime', 'total'].includes(requestedTf)) timeframe = 'all';

      try {
        const payload = await buildOverviewPayload(message.guild, 'overview', timeframe);
        const replyMsg = await message.channel.send(payload);
        if (waitMsg) await waitMsg.delete().catch(() => null);

        // Attach collector for smooth 5-minute interaction
        const collector = replyMsg.createMessageComponentCollector({
          time: 300_000
        });

        collector.on('collect', async (i) => {
          await handleServerOverviewInteraction(i);
        });

        collector.on('end', () => {
          replyMsg.edit({ components: [] }).catch(() => null);
        });
      } catch (e) {
        console.error('Server overview execution error:', e);
        if (waitMsg) await waitMsg.edit(cv2.error('Error', 'Failed to render server overview dashboard.')).catch(() => null);
      }
    },
    async executeSlash(interaction) {
      await interaction.deferReply();
      const timeframe = interaction.options.getString('timeframe') || '7d';

      try {
        const payload = await buildOverviewPayload(interaction.guild, 'overview', timeframe);
        const replyMsg = await interaction.editReply(payload);

        // Attach collector
        if (replyMsg && typeof replyMsg.createMessageComponentCollector === 'function') {
          const collector = replyMsg.createMessageComponentCollector({
            time: 300_000
          });

          collector.on('collect', async (i) => {
            await handleServerOverviewInteraction(i);
          });

          collector.on('end', () => {
            interaction.editReply({ components: [] }).catch(() => null);
          });
        }
      } catch (e) {
        console.error('Server overview slash execution error:', e);
        await interaction.editReply(cv2.error('Error', 'Failed to render server overview dashboard.')).catch(() => null);
      }
    }
  }
];
