import { 
  PermissionFlagsBits, 
  MessageFlags, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { 
  getRandomHeadingGlyph, 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  UPTIME_EMOJI 
} from '../utils/emojis.js';
import { isBotOwnerSync } from '../utils/helpers.js';

export function isAuthorized(guild, member, userId) {
  if (isBotOwnerSync(userId)) return true;
  if (guild.ownerId === userId) return true;
  if (db.isExtraOwner(guild.id, userId)) return true;
  if (member?.permissions?.has(PermissionFlagsBits.ManageMessages)) return true;
  if (member?.permissions?.has(PermissionFlagsBits.KickMembers)) return true;
  if (member?.permissions?.has(PermissionFlagsBits.BanMembers)) return true;
  if (member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  return false;
}

export function buildUserPulseCard(user, metrics) {
  const total = (metrics?.bans || 0) + 
                (metrics?.kicks || 0) + 
                (metrics?.warns || 0) + 
                (metrics?.timeouts || 0) + 
                (metrics?.purges || 0) + 
                (metrics?.tickets || 0);

  let tier = 'Recruit (0-10 Actions)';
  if (total >= 100) tier = 'Master Sentinel (100+ Actions)';
  else if (total >= 50) tier = 'Senior Enforcer (50-99 Actions)';
  else if (total >= 20) tier = 'Active Moderator (20-49 Actions)';

  const fields = [
    {
      name: 'Total Enforcement Quota',
      value: `\`${total} Actions Executed\``,
      inline: true
    },
    {
      name: 'Performance Rank',
      value: `\`${tier}\``,
      inline: true
    },
    {
      name: 'Last Active Timestamp',
      value: metrics?.lastActionAt ? `<t:${Math.floor(metrics.lastActionAt / 1000)}:R>` : '`Never recorded`',
      inline: true
    },
    {
      name: 'Action Breakdown',
      value: `> -# ${BULLET_EMOJI} **Bans:** \`${metrics?.bans || 0}\`  \u00b7  **Kicks:** \`${metrics?.kicks || 0}\`\n` +
             `> -# ${BULLET_EMOJI} **Timeouts:** \`${metrics?.timeouts || 0}\`  \u00b7  **Warns:** \`${metrics?.warns || 0}\`\n` +
             `> -# ${BULLET_EMOJI} **Message Purges:** \`${metrics?.purges || 0}\`  \u00b7  **Tickets Closed:** \`${metrics?.tickets || 0}\``,
      inline: false
    }
  ];

  return cv2.card(
    `Staff Pulse Profile \u2022 ${user.username} | ${TICK_EMOJI}`,
    `> -# <a:uptime:1552608831060844575> **Telemetry Performance Record for <@${user.id}>.**\n` +
    `> -# Tracks authentic verified moderation actions dispatched by this staff account.`,
    fields,
    'Athena Prime Security Suite • Staff Pulse Telemetry'
  );
}

export function buildServerPulseOverview(guild) {
  const allStaff = db.getStaffMetrics(guild.id) || {};
  const entries = Object.entries(allStaff);

  let totalBans = 0;
  let totalKicks = 0;
  let totalTimeouts = 0;
  let totalWarns = 0;
  let totalPurges = 0;
  let totalTickets = 0;

  const staffRanks = [];

  for (const [userId, m] of entries) {
    const sum = (m.bans || 0) + (m.kicks || 0) + (m.warns || 0) + (m.timeouts || 0) + (m.purges || 0) + (m.tickets || 0);
    totalBans += m.bans || 0;
    totalKicks += m.kicks || 0;
    totalTimeouts += m.timeouts || 0;
    totalWarns += m.warns || 0;
    totalPurges += m.purges || 0;
    totalTickets += m.tickets || 0;

    staffRanks.push({ userId, total: sum, lastActionAt: m.lastActionAt });
  }

  staffRanks.sort((a, b) => b.total - a.total);
  const totalActions = totalBans + totalKicks + totalTimeouts + totalWarns + totalPurges + totalTickets;

  const fields = [
    {
      name: 'Total Staff Enforcements',
      value: `\`${totalActions} Actions\``,
      inline: true
    },
    {
      name: 'Tracked Staff Members',
      value: `\`${entries.length} Moderators\``,
      inline: true
    },
    {
      name: 'Server Health Index',
      value: totalActions > 0 ? '`Optimal (Active Vigilance)`' : '`Dormant (Zero Recent Actions)`',
      inline: true
    },
    {
      name: 'Global Enforcement Breakdown',
      value: `> -# ${BULLET_EMOJI} **Bans:** \`${totalBans}\`  \u00b7  **Kicks:** \`${totalKicks}\`  \u00b7  **Timeouts:** \`${totalTimeouts}\`\n` +
             `> -# ${BULLET_EMOJI} **Warns:** \`${totalWarns}\`  \u00b7  **Purges:** \`${totalPurges}\`  \u00b7  **Tickets:** \`${totalTickets}\``,
      inline: false
    }
  ];

  if (staffRanks.length > 0) {
    const topText = staffRanks.slice(0, 5).map((s, idx) => {
      const timeStr = s.lastActionAt ? `<t:${Math.floor(s.lastActionAt / 1000)}:R>` : '`Never`';
      return `> -# **${idx + 1}.** <@${s.userId}> — **${s.total} actions** (Last active: ${timeStr})`;
    }).join('\n');

    fields.push({
      name: 'Top Active Moderators',
      value: topText,
      inline: false
    });
  }

  return cv2.card(
    `Staff Pulse & Moderation Quotas | ${TICK_EMOJI}`,
    `> -# <a:uptime:1552608831060844575> **Real-Time Staff Activity & Quota Tracking.**\n` +
    `> -# Evaluates staff engagement, moderation turnaround times, and team accountability.\n` +
    `> -# Run \`!staffpulse @user\` to inspect individual quota performance.`,
    fields,
    'Athena Prime Security Suite • Staff Pulse Telemetry'
  );
}

export const commands = [
  {
    name: 'staffpulse',
    aliases: ['modstats', 'staffstats', 'modquota', 'staffquota'],
    description: 'Staff Pulse & Moderation Quota Tracker - Real-time metrics on staff actions and activity quotas.',
    category: 'Security',
    async execute(message, args) {
      const guild = message.guild;
      if (!guild) return;

      if (!isAuthorized(guild, message.member, message.author.id)) {
        return message.reply(cv2.danger(
          `Access Denied | ${WRONG_EMOJI}`,
          'Only Server Owners, Extra Owners, and Staff Supervisors can inspect Staff Pulse metrics.'
        )).catch(() => null);
      }

      const sub = (args[0] || '').toLowerCase();

      // Reset
      if (sub === 'reset' || sub === 'clear') {
        if (message.author.id !== guild.ownerId && !isBotOwnerSync(message.author.id) && !db.isExtraOwner(guild.id, message.author.id)) {
          return message.reply(cv2.danger(`Access Denied | ${WRONG_EMOJI}`, 'Only the Server Owner or Extra Owners can reset the moderation quota cycle.')).catch(() => null);
        }
        db.resetStaffMetrics(guild.id);
        return message.reply(cv2.success(
          `Staff Quota Cycle Reset | ${TICK_EMOJI}`,
          'All moderation statistics and activity records for this cycle have been cleared.'
        )).catch(() => null);
      }

      // Target user
      const targetUser = message.mentions?.users?.first?.();
      if (targetUser) {
        const metrics = db.getStaffMetrics(guild.id, targetUser.id);
        return message.reply(buildUserPulseCard(targetUser, metrics)).catch(() => null);
      }

      // Default: Server Overview
      const overview = buildServerPulseOverview(guild);
      return message.reply(overview).catch(() => null);
    }
  }
];
