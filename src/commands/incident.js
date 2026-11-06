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
  if (member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  return false;
}

export function buildIncidentBriefing(incident) {
  const fields = [
    {
      name: 'Incident Code',
      value: `\`${incident.id}\``,
      inline: true
    },
    {
      name: 'Threat Classification',
      value: `\`${incident.type}\``,
      inline: true
    },
    {
      name: 'Counter-Measure Latency',
      value: `\`${incident.latencyMs}ms (Sub-Wire Strike)\``,
      inline: true
    },
    {
      name: 'Attacker Entity',
      value: `<@${incident.attackerId}> (\`${incident.attackerTag || incident.attackerId}\`)`,
      inline: true
    },
    {
      name: 'Actions Intercepted',
      value: `\`${incident.actionsBlocked} Blocked / ${incident.actionsAttempted} Attempted\``,
      inline: true
    },
    {
      name: 'Enforcement Status',
      value: `${UPTIME_EMOJI} **${incident.status}**`,
      inline: true
    },
    {
      name: 'Incident Timestamp',
      value: `<t:${Math.floor(incident.timestamp / 1000)}:F> (<t:${Math.floor(incident.timestamp / 1000)}:R>)`,
      inline: false
    }
  ];

  if (incident.details) {
    fields.push({
      name: 'Forensic Investigation Notes',
      value: `\`\`\`diff\n+ ${incident.details}\n\`\`\``,
      inline: false
    });
  }

  return cv2.card(
    `Forensic Incident Report | ${TICK_EMOJI}`,
    `> -# <a:uptime:1552608831060844575> **Post-Raid Threat Telemetry Analysis.**\n` +
    `> -# Incident recorded automatically by Athena Prime Real-Time Sentinel.\n` +
    `> -# Offending token was condemned and revoked across the Discord API.`,
    fields,
    'Athena Prime Security Suite • Forensic Intelligence Matrix'
  );
}

export const commands = [
  {
    name: 'incident',
    aliases: ['raidreport', 'forensics', 'attacklog', 'threatlog'],
    description: 'Post-Raid Forensic Incident Report - View detailed telemetry of intercepted attacks and raiders.',
    category: 'Security',
    async execute(message, args) {
      const guild = message.guild;
      if (!guild) return;

      if (!isAuthorized(guild, message.member, message.author.id)) {
        return message.reply(cv2.danger(
          `Access Denied | ${WRONG_EMOJI}`,
          'Only Server Owners, Extra Owners, and Administrators can inspect forensic incident records.'
        )).catch(() => null);
      }

      const sub = (args[0] || '').toLowerCase();

      // Clear incident history
      if (sub === 'clear' || sub === 'purge') {
        db.clearIncidents(guild.id);
        return message.reply(cv2.success(
          `Incident History Purged | ${TICK_EMOJI}`,
          'All historical forensic incident records for this server have been reset.'
        )).catch(() => null);
      }

      // View specific incident
      if (sub === 'view' || sub === 'show' || (sub && sub.startsWith('inc-'))) {
        const queryId = (sub.startsWith('inc-') ? sub : args[1] || '').toUpperCase();
        const found = db.getIncidentById(guild.id, queryId);
        if (!found) {
          return message.reply(cv2.danger(
            `Incident Not Found | ${WRONG_EMOJI}`,
            `No incident record found matching ID \`${queryId}\`. Run \`!incident list\` to view available logs.`
          )).catch(() => null);
        }
        return message.reply(buildIncidentBriefing(found)).catch(() => null);
      }

      // List past incidents
      if (sub === 'list' || sub === 'history' || sub === 'all') {
        const list = db.getIncidents(guild.id, 10);
        if (list.length === 0) {
          return message.reply(cv2.info(
            `Forensic History Clean | ${UPTIME_EMOJI}`,
            '> -# No security incidents on record. Server perimeter has experienced zero hostile incursions.'
          )).catch(() => null);
        }

        const fields = list.map(inc => ({
          name: `Incident: ${inc.id}`,
          value: `**Type:** \`${inc.type}\`\n**Target/Attacker:** \`${inc.attackerTag}\` (<@${inc.attackerId}>)\n**Status:** ${inc.status} | <t:${Math.floor(inc.timestamp / 1000)}:R>\n**Inspect:** \`!incident view ${inc.id}\``,
          inline: false
        }));

        const panel = cv2.card(
          `Security Incursion Telemetry Logs | ${TICK_EMOJI}`,
          `> -# <a:uptime:1552608831060844575> **Archived Threat Records (Last 10 Incidents):**\n` +
          `> -# Use \`!incident view <id>\` for detailed forensic breakdown.`,
          fields,
          'Athena Prime Security Suite • Forensic Intelligence Matrix'
        );

        return message.reply(panel).catch(() => null);
      }

      // Default: Latest incident
      const latest = db.getIncidents(guild.id, 1)[0];
      if (!latest) {
        return message.reply(cv2.info(
          `Perimeter Fortified | ${UPTIME_EMOJI}`,
          `> -# No security incursions or hostile attacks recorded on this server.\n` +
          `> -# Athena Prime Antinuke Firewall and Ghost Honeypot are actively monitoring all ingress points.`
        )).catch(() => null);
      }

      return message.reply(buildIncidentBriefing(latest)).catch(() => null);
    }
  }
];
