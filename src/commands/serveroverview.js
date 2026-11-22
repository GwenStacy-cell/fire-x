import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  AttachmentBuilder, 
  MessageFlags 
} from 'discord.js';
import statsDB from '../statsDB.js';
import { generateStatbotOverviewImage, generateTopImage, generateServerTrendImage } from '../utils/statCanvas.js';
import cv2, { sanitizeCV2Payload } from '../cv2.js';
import db from '../database.js';
import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI } from '../utils/emojis.js';

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
      .setEmoji('<a:01_home_beat:1567037361810833428>')
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
      .setEmoji('<a:02_delete_beat:1567037365547962449>')
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

  return [row1.toJSON(), row2.toJSON(), row3.toJSON(), row4.toJSON()];
}

export async function buildOverviewPayload(guild, activeTab = 'overview', timeframe = '7d') {
  const tfLabel = getTimeframeLabel(timeframe);
  const dbConfig = db.getGuildConfig(guild.id);
  const embedColor = dbConfig.accentColor ? parseInt(dbConfig.accentColor.replace('#', ''), 16) : 0x5865F2;
  const components = buildServerOverviewComponents(activeTab, timeframe);
  const stats = statsDB.getServerStatbotStats(guild.id, timeframe);

  let attachment = null;
  let bodyComp = null;
  let tabTitle = 'Overview';

  if (activeTab === 'overview') {
    tabTitle = 'Overview';
    const buffer = await generateStatbotOverviewImage(guild, stats, timeframe);
    attachment = new AttachmentBuilder(buffer, { name: 'server-overview.png' });
    bodyComp = {
      type: 12,
      items: [{ media: { url: 'attachment://server-overview.png' } }]
    };
  } else if (activeTab === 'leaderboards') {
    tabTitle = 'Top Leaderboards';
    const topMsgs = stats.topMsgMembers || [];
    const topVcs = stats.topVcMembers || [];
    const buffer = await generateTopImage(guild, topMsgs, topVcs);
    attachment = new AttachmentBuilder(buffer, { name: 'server-leaderboard.png' });
    bodyComp = {
      type: 12,
      items: [{ media: { url: 'attachment://server-leaderboard.png' } }]
    };
  } else if (activeTab === 'graphs') {
    tabTitle = 'Activity Trends';
    const oldOverview = statsDB.getServerOverviewStats(guild.id);
    const buffer = await generateServerTrendImage(guild, oldOverview?.chart || [], timeframe);
    attachment = new AttachmentBuilder(buffer, { name: 'server-trends.png' });
    bodyComp = {
      type: 12,
      items: [{ media: { url: 'attachment://server-trends.png' } }]
    };
  } else if (activeTab === 'text') {
    tabTitle = 'Text Telemetry';
    bodyComp = {
      type: 10,
      content:
        `> -# <a:uptime:1552608831060844575> **${guild.name}** \u2022 **Text Communication Diagnostics**\n` +
        `> -# ${BULLET_EMOJI} **Total Messages:** \`${stats.messages.total.toLocaleString()} msgs\`\n` +
        `> -# ${BULLET_EMOJI} **Daily Velocity:** \`${stats.messages.avg.toLocaleString()} msgs/day\`\n` +
        `> -# ${BULLET_EMOJI} **Today's Activity:** \`${stats.messages.today.toLocaleString()} msgs\`\n` +
        `> -# ${BULLET_EMOJI} **Hyperlinks Distributed:** \`${stats.links.total.toLocaleString()}\` (\`${stats.links.avg} / day\`)\n\n` +
        `### Top Message Contributors\n` +
        (stats.topMsgMembers.length > 0
          ? stats.topMsgMembers.map((m, i) => `> -# **#${i + 1}** <@${m.user_id}>: \`${m.total.toLocaleString()} msgs\``).join('\n')
          : `> -# No message telemetry recorded for this timeframe.`)
    };
  } else if (activeTab === 'voice') {
    tabTitle = 'Voice Telemetry';
    const formatVoice = (s) => {
      if (!s || isNaN(s)) return '0m';
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };
    bodyComp = {
      type: 10,
      content:
        `> -# <a:uptime:1552608831060844575> **${guild.name}** \u2022 **Voice Channel Diagnostics**\n` +
        `> -# ${BULLET_EMOJI} **Total Voice Time:** \`${formatVoice(stats.voice.totalSeconds)}\`\n` +
        `> -# ${BULLET_EMOJI} **Daily Voice Velocity:** \`${formatVoice(stats.voice.avgSeconds)} / day\`\n` +
        `> -# ${BULLET_EMOJI} **Today's Voice Time:** \`${formatVoice(stats.voice.todaySeconds)}\`\n\n` +
        `### Top Voice Talkers\n` +
        (stats.topVcMembers.length > 0
          ? stats.topVcMembers.map((m, i) => `> -# **#${i + 1}** <@${m.user_id}>: \`${formatVoice(m.total)}\``).join('\n')
          : `> -# No voice telemetry recorded for this timeframe.`)
    };
  } else if (activeTab === 'engagement') {
    tabTitle = 'Engagement Matrix';
    const ratio = stats.messages.total > 0 ? (stats.reactions.total / stats.messages.total).toFixed(3) : '0.000';
    bodyComp = {
      type: 10,
      content:
        `> -# <a:uptime:1552608831060844575> **${guild.name}** \u2022 **Reactivity & Participation Analysis**\n` +
        `> -# ${BULLET_EMOJI} **Total Reactions:** \`${stats.reactions.total.toLocaleString()}\` (All-Time: \`${stats.reactions.all.toLocaleString()}\`)\n` +
        `> -# ${BULLET_EMOJI} **Reaction Velocity:** \`${stats.reactions.avg} reactions/day\`\n` +
        `> -# ${BULLET_EMOJI} **Total Hyperlinks:** \`${stats.links.total.toLocaleString()}\` (All-Time: \`${stats.links.all.toLocaleString()}\`)\n` +
        `> -# ${BULLET_EMOJI} **Link Sharing Velocity:** \`${stats.links.avg} links/day\`\n` +
        `> -# ${BULLET_EMOJI} **Reactivity Ratio:** \`${ratio} reactions/msg\`\n` +
        `> -# ${BULLET_EMOJI} **Active Participants:** \`${stats.activeUsers.active.toLocaleString()} members\``
    };
  } else if (activeTab === 'active') {
    tabTitle = 'Active User Telemetry';
    const totalMembers = guild.memberCount || 1;
    const activePercent = ((stats.activeUsers.active / totalMembers) * 100).toFixed(1);
    bodyComp = {
      type: 10,
      content:
        `> -# <a:uptime:1552608831060844575> **${guild.name}** \u2022 **Population Dynamics & Retention**\n` +
        `> -# ${BULLET_EMOJI} **Unique Active Members:** \`${stats.activeUsers.active.toLocaleString()} users\` (\`${activePercent}%\` of server)\n` +
        `> -# ${BULLET_EMOJI} **Daily Active Average:** \`${stats.activeUsers.avg} users/day\`\n` +
        `> -# ${BULLET_EMOJI} **Peak Daily Active:** \`${stats.activeUsers.peak.toLocaleString()} users\`\n` +
        `> -# ${BULLET_EMOJI} **Server Population:** \`${totalMembers.toLocaleString()} total members\``
    };
  } else if (activeTab === 'growth') {
    tabTitle = 'Growth Dynamics';
    const netGrowth = stats.members.joined - stats.members.left;
    const netPrefix = netGrowth > 0 ? '+' : '';
    bodyComp = {
      type: 10,
      content:
        `> -# <a:uptime:1552608831060844575> **${guild.name}** \u2022 **Member Influx & Churn Rate**\n` +
        `> -# ${BULLET_EMOJI} **Current Population:** \`${guild.memberCount.toLocaleString()} members\`\n` +
        `> -# ${BULLET_EMOJI} **Members Joined:** \`+${stats.members.joined.toLocaleString()}\`\n` +
        `> -# ${BULLET_EMOJI} **Members Departed:** \`-${stats.members.left.toLocaleString()}\`\n` +
        `> -# ${BULLET_EMOJI} **Net Population Shift:** \`${netPrefix}${netGrowth.toLocaleString()} members\``
    };
  } else if (activeTab === 'compare') {
    tabTitle = 'Comparative Matrix';
    bodyComp = {
      type: 10,
      content:
        `> -# <a:uptime:1552608831060844575> **${guild.name}** \u2022 **Cross-Vector Performance Metrics**\n` +
        `> -# ${BULLET_EMOJI} **Active Window:** \`${tfLabel}\`\n` +
        `> -# ${BULLET_EMOJI} **Messages Analyzed:** \`${stats.messages.total.toLocaleString()} msgs\`\n` +
        `> -# ${BULLET_EMOJI} **Voice Tracked:** \`${Math.round(stats.voice.totalSeconds / 3600)} hours\`\n` +
        `> -# ${BULLET_EMOJI} **Daily Active Users:** \`${stats.activeUsers.avg} avg / day\`\n` +
        `> -# ${BULLET_EMOJI} **Growth Ratio:** \`${stats.members.joined} joins / ${stats.members.left} leaves\``
    };
  } else {
    tabTitle = 'Overview';
    const buffer = await generateStatbotOverviewImage(guild, stats, timeframe);
    attachment = new AttachmentBuilder(buffer, { name: 'server-overview.png' });
    bodyComp = {
      type: 12,
      items: [{ media: { url: 'attachment://server-overview.png' } }]
    };
  }

  const containerComps = [
    {
      type: 10,
      content: `# ${getRandomHeadingGlyph()} Server Stats > ${tabTitle} (${tfLabel}) | ${TICK_EMOJI}`
    },
    { type: 14, divider: true }
  ];

  if (bodyComp) {
    containerComps.push(bodyComp);
    containerComps.push({ type: 14, divider: true });
  }

  containerComps.push(...components);
  containerComps.push({ type: 14, divider: true });
  containerComps.push({
    type: 10,
    content: `-# **Tracking since ${stats.trackingSince || '2026-09-11'} | UTC \u2022 Athena Bulletproof Defense Matrix**`
  });

  const container = {
    type: 17,
    accent_color: embedColor,
    components: containerComps
  };

  return sanitizeCV2Payload({
    components: [container],
    files: attachment ? [attachment] : [],
    ...(attachment ? {} : { attachments: [] }),
    flags: MessageFlags.IsComponentsV2
  });
}

export async function handleServerOverviewInteraction(interaction) {
  const customId = interaction.customId;
  if (!customId || !customId.startsWith('so_')) return;

  if (customId === 'so_close') {
    await interaction.deferUpdate().catch(() => null);
    try {
      if (interaction.message?.deletable) {
        await interaction.message.delete().catch(() => null);
      } else {
        await interaction.editReply({ components: [] }).catch(() => null);
      }
    } catch {
      await interaction.editReply({ components: [] }).catch(() => null);
    }
    return;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => null);
  }

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
    await interaction.editReply(payload).catch((err) => {
      console.error('[ServerOverview] editReply error:', err);
    });
  } catch (err) {
    console.error('Error updating server overview interaction:', err);
  }
}

export const commands = [
  {
    name: 'serveroverview',
    description: 'View a high-fidelity Statbot-style overview dashboard of server statistics',
    aliases: ['so', 'serverstats', 'server', 'serverstat', 'serverview', 'sstats', 'soverview', 'sstat', 'statsview', 'serverstatsview', 'overview', 'stats'],
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
        if (waitMsg) {
          await waitMsg.edit(payload).catch(async () => {
            await waitMsg.delete().catch(() => null);
            await message.channel.send(payload);
          });
        } else {
          await message.channel.send(payload);
        }
      } catch (e) {
        console.error('Server overview execution error:', e);
        if (waitMsg) await waitMsg.edit(cv2.danger('Error', 'Failed to render server overview dashboard.')).catch(() => null);
      }
    },
    async executeSlash(interaction) {
      await interaction.deferReply();
      const timeframe = interaction.options.getString('timeframe') || '7d';

      try {
        const payload = await buildOverviewPayload(interaction.guild, 'overview', timeframe);
        await interaction.editReply(payload);
      } catch (e) {
        console.error('Server overview slash execution error:', e);
        await interaction.editReply(cv2.danger('Error', 'Failed to render server overview dashboard.')).catch(() => null);
      }
    }
  }
];
