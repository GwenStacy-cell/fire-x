import { AttachmentBuilder, MessageFlags } from 'discord.js';
import { sanitizeCV2Payload } from '../cv2.js';
import db from '../database.js';
import {
  BULLET_EMOJI,
  NINJA_BULLET,
  NINJA_BULLET_RTL,
  UPTIME_EMOJI,
  WARN_EMOJI,
  getRandomHeadingGlyph
} from '../utils/emojis.js';
import { cleanDisplayName, formatChannelLink, formatUserLink } from '../utils/helpers.js';
import { CHANGELOG_ENTRIES } from '../utils/changelogData.js';
import { generateVoiceAnalyticsMatrix } from '../utils/voiceAnalyticsCanvas.js';

function formatMinutes(totalMins) {
  const safe = Math.max(0, Math.round(Number(totalMins) || 0));
  if (safe < 60) return `${safe}m`;
  const hrs = Math.floor(safe / 60);
  const mins = safe % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function buildHeadingLine(title) {
  if (Math.random() < 0.35) {
    return `# ${NINJA_BULLET} ${title} ${NINJA_BULLET_RTL}`;
  }
  return `# ${getRandomHeadingGlyph()} ${title}`;
}

export async function buildVoiceAnalyticsPayload(guild, user, member = null) {
  const analytics = db.getVoiceAnalytics(guild.id);
  const cfg = db.getGuildConfig(guild.id) || {};
  const accentHex = cfg.accentColor || '#00e5ff';
  const parsedHex = parseInt(String(accentHex).replace('#', ''), 16);
  const accentColorInt = Number.isFinite(parsedHex) ? parsedHex : 0x00E5FF;
  const version = CHANGELOG_ENTRIES[0]?.version || 'v4.0.12';

  const initiatorLink = formatUserLink(member || user, guild);
  const safeGuildName = String(guild.name || 'Server').replace(/[*_`~|>\\]/g, '').trim() || 'Server';

  const hourly = new Array(24).fill(0);
  let totalMinutes = 0;
  let peakHour = 0;
  let peakMinutes = 0;

  for (let h = 0; h < 24; h++) {
    const val = Math.max(0, Number(analytics.hourly?.[h]) || 0);
    hourly[h] = val;
    totalMinutes += val;
    if (val > peakMinutes) {
      peakMinutes = val;
      peakHour = h;
    }
  }

  if (totalMinutes === 0) {
    const emptyContainer = sanitizeCV2Payload({
      type: 17,
      accent_color: accentColorInt,
      components: [
        {
          type: 10,
          content:
            `${buildHeadingLine(`Athena Voice Telemetry & Heatmaps | ${WARN_EMOJI}`)}\n` +
            `-# ${UPTIME_EMOJI} **Requested by:** ${initiatorLink} · **Server:** ${safeGuildName} · **Signal:** Standby`
        },
        { type: 14, divider: true },
        {
          type: 10,
          content:
            `-# **No Voice Telemetry Recorded Yet**\n` +
            `> -# ${BULLET_EMOJI} **Engine Status:** Armed & tracking active voice sessions across **${safeGuildName}**\n` +
            `> -# ${BULLET_EMOJI} **Next Step:** Join any voice room and speak/hang out; completed sessions populate this 24h matrix automatically.`
        },
        { type: 14, divider: true },
        {
          type: 10,
          content: `-# **Athena Prime ${version} · Real-Time Voice Telemetry · Off-Thread Canvas Matrix**`
        }
      ]
    });

    return {
      components: [emptyContainer],
      flags: MessageFlags.IsComponentsV2
    };
  }

  const peakTimeStr = `${String(peakHour).padStart(2, '0')}:00`;
  const blockTotals = {
    night: hourly.slice(0, 6).reduce((a, b) => a + b, 0),
    morning: hourly.slice(6, 12).reduce((a, b) => a + b, 0),
    afternoon: hourly.slice(12, 18).reduce((a, b) => a + b, 0),
    evening: hourly.slice(18, 24).reduce((a, b) => a + b, 0)
  };

  const allChannelEntries = Object.entries(analytics.channels || {}).sort((a, b) => b[1] - a[1]);
  const allUserEntries = Object.entries(analytics.users || {}).sort((a, b) => b[1] - a[1]);

  const channelTotalDenom = allChannelEntries.reduce((sum, [, m]) => sum + Math.max(0, Number(m) || 0), 0) || totalMinutes;
  const userTotalDenom = allUserEntries.reduce((sum, [, m]) => sum + Math.max(0, Number(m) || 0), 0) || totalMinutes;

  const topChannelEntries = allChannelEntries.slice(0, 5);
  const topUserEntries = allUserEntries.slice(0, 5);

  const resolvedChannels = await Promise.all(
    topChannelEntries.map(async ([chId, mins]) => {
      const ch = guild.channels.cache.get(chId) || await guild.channels.fetch(chId).catch(() => null);
      const sharePct = channelTotalDenom > 0 ? Math.min(100, (mins / channelTotalDenom) * 100) : 0;
      return {
        id: chId,
        minutes: mins,
        sharePct,
        canvasLabel: ch ? ch.name : `Deleted VC (${chId.slice(-4)})`,
        textLink: ch ? formatChannelLink(ch, guild) : `Deleted VC (\`...${chId.slice(-4)}\`)`
      };
    })
  );

  const resolvedUsers = await Promise.all(
    topUserEntries.map(async ([uId, mins]) => {
      const mem = guild.members.cache.get(uId) || await guild.members.fetch(uId).catch(() => null);
      const usr = mem ? null : (guild.client?.users?.cache?.get(uId) || await guild.client?.users?.fetch(uId).catch(() => null));
      const targetObj = mem || usr;
      const sharePct = userTotalDenom > 0 ? Math.min(100, (mins / userTotalDenom) * 100) : 0;
      const rawName = targetObj?.displayName || targetObj?.nickname || targetObj?.user?.username || targetObj?.username || `User ${uId.slice(-4)}`;
      return {
        id: uId,
        minutes: mins,
        sharePct,
        canvasLabel: cleanDisplayName(rawName),
        textLink: formatUserLink(targetObj || uId, guild)
      };
    })
  );

  const matrixBuffer = await generateVoiceAnalyticsMatrix(
    {
      guildName: safeGuildName,
      totalMinutes,
      activeChannelCount: allChannelEntries.length,
      participantCount: allUserEntries.length,
      peakHour,
      peakMinutes,
      hourly,
      blocks: blockTotals,
      topChannels: resolvedChannels.slice(0, 4).map((c) => ({
        label: c.canvasLabel,
        minutes: c.minutes,
        sharePct: c.sharePct
      })),
      topUsers: resolvedUsers.slice(0, 4).map((u) => ({
        label: u.canvasLabel,
        minutes: u.minutes,
        sharePct: u.sharePct
      }))
    },
    accentHex
  ).catch(() => null);

  const channelLines = resolvedChannels.length > 0
    ? resolvedChannels.map((c, idx) => `> -# ${BULLET_EMOJI} **#${idx + 1}** ${c.textLink} · **${formatMinutes(c.minutes)}** (\`${c.sharePct.toFixed(1)}%\`)`).join('\n')
    : `> -# ${BULLET_EMOJI} No active channel records found.`;

  const userLines = resolvedUsers.length > 0
    ? resolvedUsers.map((u, idx) => `> -# ${BULLET_EMOJI} **#${idx + 1}** ${u.textLink} · **${formatMinutes(u.minutes)}** (\`${u.sharePct.toFixed(1)}%\`)`).join('\n')
    : `> -# ${BULLET_EMOJI} No participant sessions recorded.`;

  const components = [
    {
      type: 10,
      content:
        `${buildHeadingLine('Athena Voice Telemetry & Heatmaps')}\n` +
        `-# ${UPTIME_EMOJI} **Requested by:** ${initiatorLink} · **Scope:** ${safeGuildName} · **Peak Window:** **${peakTimeStr} UTC** (${formatMinutes(peakMinutes)})`
    },
    { type: 14, divider: true },
    {
      type: 10,
      content:
        `-# **Global Voice Aggregate & Diurnal Telemetry**\n` +
        `> -# ${BULLET_EMOJI} **Total Voice Tracked:** **${formatMinutes(totalMinutes)}** · **Active Hubs:** **${allChannelEntries.length} channels** · **Participants:** **${allUserEntries.length} users**\n` +
        `> -# ${BULLET_EMOJI} **Diurnal Split:** Night \`${formatMinutes(blockTotals.night)}\` · Morning \`${formatMinutes(blockTotals.morning)}\` · Afternoon \`${formatMinutes(blockTotals.afternoon)}\` · Evening \`${formatMinutes(blockTotals.evening)}\``
    },
    {
      type: 10,
      content:
        `-# **High-Traffic Voice Hubs**\n${channelLines}\n\n` +
        `-# **Top Voice Participants**\n${userLines}`
    }
  ];

  const files = [];
  if (matrixBuffer && matrixBuffer.length > 0) {
    files.push(new AttachmentBuilder(matrixBuffer, { name: 'voice_analytics_matrix.png' }));
    components.push({ type: 14, divider: true });
    components.push({
      type: 12,
      items: [{ media: { url: 'attachment://voice_analytics_matrix.png' } }]
    });
  }

  components.push({ type: 14, divider: true });
  components.push({
    type: 10,
    content: `-# **Athena Prime ${version} · Real-Time Voice Telemetry · Off-Thread Canvas Matrix**`
  });

  const container = sanitizeCV2Payload({
    type: 17,
    accent_color: accentColorInt,
    components
  });

  return {
    components: [container],
    files,
    flags: MessageFlags.IsComponentsV2
  };
}

export const commands = [
  {
    name: 'voiceanalytics',
    aliases: ['va', 'vstats', 'voicestats', 'vcheatmap'],
    description: 'View server voice telemetry matrix, diurnal heatmaps, and top voice hubs.',
    category: 'utility',
    permissions: [],
    async executePrefix(message) {
      await message.channel?.sendTyping?.().catch(() => null);
      const payload = await buildVoiceAnalyticsPayload(message.guild, message.author, message.member);
      return await message.reply(payload);
    },
    async executeSlash(interaction) {
      await interaction.deferReply();
      const payload = await buildVoiceAnalyticsPayload(interaction.guild, interaction.user, interaction.member);
      return await interaction.editReply(payload);
    }
  }
];
