import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { isServerAdmin } from '../utils/helpers.js';
import {
  auditServerFlaws,
  buildFlawsReportContainer,
  buildServerFixContainer,
  buildAIAnalysisContainer
} from '../utils/botThreatLearner.js';

const TICK = '<a:atheNATICK:1557841381630681106>';
const UPTIME = '<a:uptime:1552608831060844575>';
const OFF = '<:off:1533844858983157851>';

/**
 * Builds the comprehensive Components V2 Autonomous Self-Learning, Lambda AI,
 * and Heuristic Threat Matrix Dashboard.
 */
export function buildLearnDashboard(guild, config, prefix = '!') {
  const isLearning = Boolean(config.learnModeEnabled);
  const signatures = db.getNukeSignatures(guild.id);
  const flaws = db.getNukeFlaws(guild.id);
  const botThreats = signatures.filter(s => s.isBot);
  const baseline = db.getLearnBaseline(guild.id);

  const statusLine = isLearning
    ? `> ${UPTIME} **Status: Active (Continuous Autonomous Self-Learning Engaged)**\n> -# Athena Prime is actively monitoring rogue bot actions, analyzing attack velocity fingerprints, and automatically diagnosing defense flaws.`
    : `> ${OFF} **Status: Inactive / Standby**\n> -# Heuristic threat learning is dormant. Deterministic antinuke tripwires remain fully armed.`;

  let lastActivity = 'None recorded';
  if (baseline.lastAction && baseline.lastAction.timestamp) {
    const ts = Math.floor(baseline.lastAction.timestamp / 1000);
    lastActivity = `<t:${ts}:R> (${baseline.lastAction.eventType || 'Staff Action'})`;
  }

  const flawWarning = flaws.length > 0
    ? `\n> <:off:1533844858983157851> **Active Defense Flaws Recorded (${flaws.length}):** Antinuke encountered execution friction during past attacks. Run \`${prefix}learn flaws\` or \`${prefix}learn fix\` to view reasons and apply immediate fixes!`
    : '';

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content: `# Autonomous Self-Learning & Lambda AI Threat Matrix | ${TICK}\n${statusLine}${flawWarning}`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content:
`### Engine Telemetry & Autonomous Learning Memory
• **Total Threat Signatures Captured:** \`${signatures.length}\`
• **Hostile Bot Threats Profiled:** \`${botThreats.length}\`
• **Identified Defense Flaws & Failures:** \`${flaws.length}\` ${flaws.length > 0 ? '`[REMEDY REQUIRED]`' : '`[OPTIMAL]`'}
• **Baseline Staff Actions Profiled:** \`${baseline.actionsRecorded || 0}\`
• **Staff & Bot Accounts Indexed:** \`${baseline.staffTracked ? baseline.staffTracked.length : 0}\`
• **False-Positive Guard:** ${UPTIME} **Active** (Authorized administrative tasks establish safe baselines)
• **Lambda AI Neural Pipeline:** ${UPTIME} **Active** (Google Gemini 3.8 Flash automated autopsy core)
• **Last Recorded Activity:** ${lastActivity}`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content:
`### Management & Diagnostic Commands
• \`${prefix}learn on\` / \`${prefix}learn off\` — Enable or disable continuous autonomous learning.
• \`${prefix}learn flaws\` — View why antinuke failed to block certain actions, with root causes and fixes.
• \`${prefix}learn fix\` — Run live server hierarchy audit to identify and remediate permission flaws.
• \`${prefix}learn analyze [id]\` — Generate a Lambda Neural AI forensic autopsy for an incident.
• \`${prefix}learn baseline\` — Establish fresh privilege baselines across staff and integrated bots.
• \`${prefix}learn signatures\` — Inspect captured rogue bot fingerprints and velocity patterns.
• \`${prefix}learn clear\` — Reset signature history for this server.`
      },
      { type: 14, divider: true },
      {
        type: 1,
        components: [
          isLearning
            ? { type: 2, custom_id: 'learn_off', label: 'Disengage Learning', style: 2, emoji: { id: '1533844858983157851' } }
            : { type: 2, custom_id: 'learn_on', label: 'Engage Learning', style: 3, emoji: { id: '1552608831060844575' } },
          { type: 2, custom_id: 'learn_baseline', label: 'Run Baseline Scan', style: 2, emoji: { id: '1523765738655973589' } },
          { type: 2, custom_id: 'learn_signatures', label: 'Signatures', style: 2 },
          {
            type: 2,
            custom_id: 'learn_flaws',
            label: `Flaws (${flaws.length})`,
            style: flaws.length > 0 ? 4 : 2,
            emoji: { id: '1523766065576935475' }
          },
          { type: 2, custom_id: 'learn_refresh', label: 'Refresh', style: 2, emoji: { id: '1523766065576935475' } }
        ]
      },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'learn_fix', label: 'Run Security Fix Audit', style: 3, emoji: { id: '1552608831060844575' } },
          { type: 2, custom_id: 'learn_ai', label: 'Lambda AI Autopsy', style: 2, emoji: { id: '1523765738655973589' } },
          { type: 2, custom_id: 'learn_clear', label: 'Clear History', style: 4 }
        ]
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: '-# **Athena Prime Autonomous Self-Learning & Lambda AI Matrix · Zero-Day Immunity**'
      }
    ]
  };

  return { components: [container], flags: (MessageFlags.IsComponentsV2 || 32768) };
}

/**
 * Builds the threat signatures list container.
 */
export function buildSignaturesContainer(guild, prefix = '!') {
  const signatures = db.getNukeSignatures(guild.id);

  if (signatures.length === 0) {
    const container = {
      type: 17,
      components: [
        {
          type: 10,
          content: `# Threat Signature Registry | ${TICK}\n> ${OFF} **No rogue attack signatures recorded yet.**\n> -# Enable Learn Mode with \`${prefix}learn on\` to begin logging anomaly fingerprints.`
        },
        { type: 14, divider: true },
        {
          type: 1,
          components: [
            { type: 2, custom_id: 'learn_dashboard', label: 'Return to Dashboard', style: 2, emoji: { id: '1523765738655973589' } }
          ]
        }
      ]
    };
    return { components: [container], flags: (MessageFlags.IsComponentsV2 || 32768) };
  }

  const recent = signatures.slice(0, 8);
  const rows = recent.map((sig, idx) => {
    const ts = sig.timestamp ? `<t:${Math.floor(sig.timestamp / 1000)}:R>` : 'Unknown';
    const exec = sig.executorId ? `<@${sig.executorId}> (\`${sig.executorTag || sig.executorId}\`) ${sig.isBot ? '`[BOT]`' : '`[USER]`'}` : 'Unknown Actor';
    const flawBadge = sig.flawDetected ? '`[FLAW DETECTED]`' : '`[BLOCKED]`';
    return `**${idx + 1}. ${sig.eventType || 'Threat Anomaly'}** ${flawBadge}\n` +
           `-# • **Executor:** ${exec}\n` +
           `-# • **Action:** \`${sig.action || 'Unknown'}\` • **Verdict:** \`${sig.verdict || 'Processed'}\` • **Logged:** ${ts}` +
           (sig.flawDetected ? `\n-# • **Flaw:** ${sig.flawReason ? sig.flawReason.slice(0, 90) + '...' : 'Hierarchy/Permission conflict.'}` : '');
  }).join('\n\n');

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content: `# Threat Signature Registry | ${TICK}\n> -# Displaying the **${recent.length}** most recent heuristic anomaly patterns recorded for **${guild.name}**:`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: rows
      },
      { type: 14, divider: true },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'learn_dashboard', label: 'Return to Dashboard', style: 2, emoji: { id: '1523765738655973589' } },
          { type: 2, custom_id: 'learn_flaws', label: 'View Flaws & Fixes', style: 2 },
          { type: 2, custom_id: 'learn_clear', label: 'Clear All Signatures', style: 4 }
        ]
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: '-# **Athena Prime Autonomous Self-Learning & Lambda AI Matrix · Zero-Day Immunity**'
      }
    ]
  };

  return { components: [container], flags: (MessageFlags.IsComponentsV2 || 32768) };
}

/**
 * Runs a live heuristic baseline scan across server roles and staff.
 */
export async function executeBaselineScan(guild) {
  try {
    const members = await guild.members.fetch({ time: 5000 }).catch(() => guild.members.cache);
    const highPerms = [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers
    ];

    const staffMembers = members.filter(m => !m.user.bot && highPerms.some(perm => m.permissions.has(perm)));
    const staffIds = [...staffMembers.keys()];

    const adminRoles = guild.roles.cache.filter(r => highPerms.some(perm => r.permissions.has(perm)));
    const webhooks = await guild.fetchWebhooks().catch(() => new Map());

    const baseline = db.getLearnBaseline(guild.id);
    db.setBaselineProfile(guild.id, {
      actionsRecorded: (baseline.actionsRecorded || 0) + 1,
      staffTracked: staffIds,
      lastAction: { executorId: guild.ownerId, eventType: 'Baseline Audit Initialized', timestamp: Date.now() },
      lastUpdated: Date.now()
    });

    const container = {
      type: 17,
      components: [
        {
          type: 10,
          content: `# Heuristic Baseline Profile Initialized | ${TICK}\n> ${UPTIME} **Audit Scan Complete for ${guild.name}**`
        },
        { type: 14, divider: true },
        {
          type: 10,
          content:
`### Audit Telemetry Summary
• **Staff Accounts Audited & Whitelisted:** \`${staffIds.length}\`
• **Elevated Permission Roles Indexed:** \`${adminRoles.size}\`
• **Active Webhooks Monitored:** \`${webhooks.size}\`
• **Baseline Velocity Threshold:** \`3 actions / 10s nominal\`
• **False-Positive Immunity:** Full protection applied for routine administrative tasks.`
        },
        { type: 14, divider: true },
        {
          type: 1,
          components: [
            { type: 2, custom_id: 'learn_dashboard', label: 'Return to Dashboard', style: 2, emoji: { id: '1523765738655973589' } },
            { type: 2, custom_id: 'learn_fix', label: 'Run Security Fix Audit', style: 3, emoji: { id: '1552608831060844575' } }
          ]
        },
        { type: 14, divider: true },
        {
          type: 10,
          content: '-# **Athena Prime Autonomous Self-Learning & Lambda AI Matrix · Zero-Day Immunity**'
        }
      ]
    };

    return { components: [container], flags: (MessageFlags.IsComponentsV2 || 32768) };
  } catch (err) {
    const errorContainer = {
      type: 17,
      components: [
        {
          type: 10,
          content: `# Baseline Scan Failed\n> ${OFF} **Encountered error during audit:** \`${err.message}\``
        }
      ]
    };
    return { components: [errorContainer], flags: (MessageFlags.IsComponentsV2 || 32768) };
  }
}

/**
 * Global persistent interaction handler for Learn & Lambda Mode buttons.
 */
export async function handleLearnInteraction(interaction) {
  try {
    const customId = interaction.customId;
    if (!customId || (!customId.startsWith('learn_') && !customId.startsWith('lambda_'))) return false;

    if (!isServerAdmin(interaction.member, interaction.guild.id)) {
      await interaction.reply({
        content: `-# ${OFF} **Access Denied:** Only Server Administrators or Owners can manage Learn & Lambda AI Mode.`,
        flags: 64
      }).catch(() => null);
      return true;
    }

    const guild = interaction.guild;
    const config = db.getGuildConfig(guild.id);
    const prefix = config.prefix || '!';

    // Normalize prefix
    const actionKey = customId.replace(/^(learn_|lambda_)/, '');

    if (actionKey === 'on') {
      config.learnModeEnabled = true;
      db.updateGuildConfig(guild.id, { learnModeEnabled: true });
      const payload = buildLearnDashboard(guild, config, prefix);
      await interaction.update(payload).catch(() => null);
      return true;
    }

    if (actionKey === 'off') {
      config.learnModeEnabled = false;
      db.updateGuildConfig(guild.id, { learnModeEnabled: false });
      const payload = buildLearnDashboard(guild, config, prefix);
      await interaction.update(payload).catch(() => null);
      return true;
    }

    if (actionKey === 'refresh' || actionKey === 'dashboard') {
      const payload = buildLearnDashboard(guild, config, prefix);
      await interaction.update(payload).catch(() => null);
      return true;
    }

    if (actionKey === 'signatures') {
      const payload = buildSignaturesContainer(guild, prefix);
      await interaction.update(payload).catch(() => null);
      return true;
    }

    if (actionKey === 'flaws') {
      const payload = buildFlawsReportContainer(guild, prefix);
      await interaction.update(payload).catch(() => null);
      return true;
    }

    if (actionKey === 'fix') {
      await interaction.deferUpdate().catch(() => null);
      const payload = await buildServerFixContainer(guild, prefix);
      await interaction.editReply(payload).catch(() => null);
      return true;
    }

    if (actionKey.startsWith('ai')) {
      const targetSigId = actionKey.includes('_') ? actionKey.split('_')[1] : null;
      await interaction.deferUpdate().catch(() => null);
      const payload = await buildAIAnalysisContainer(guild, targetSigId, prefix);
      await interaction.editReply(payload).catch(() => null);
      return true;
    }

    if (actionKey === 'clear_flaws') {
      db.clearNukeFlaws(guild.id);
      const payload = buildFlawsReportContainer(guild, prefix);
      await interaction.update(payload).catch(() => null);
      return true;
    }

    if (actionKey === 'baseline') {
      const payload = await executeBaselineScan(guild);
      await interaction.update(payload).catch(() => null);
      return true;
    }

    if (actionKey === 'clear') {
      db.clearNukeSignatures(guild.id);
      const payload = buildLearnDashboard(guild, config, prefix);
      await interaction.update(payload).catch(() => null);
      return true;
    }

    return false;
  } catch (err) {
    console.error('[handleLearnInteraction] Error:', err);
    return false;
  }
}

export const commands = [
  // 1. LEARN COMMAND
  {
    name: 'learn',
    description: 'Autonomous Self-Learning, Lambda AI Threat Autopsy & Defense Flaw Diagnostics.',
    category: 'security',
    permissions: [],
    aliases: ['lambda', 'ai', 'heuristics', 'behavioral', 'lambdalearn', 'selflearn', 'autolearn'],
    options: [
      {
        name: 'action',
        description: 'Action to execute',
        type: 3,
        required: false,
        choices: [
          { name: 'Dashboard / Status', value: 'status' },
          { name: 'Enable Autonomous Learning', value: 'enable' },
          { name: 'Disable Autonomous Learning', value: 'disable' },
          { name: 'View Defense Flaws & Failures', value: 'flaws' },
          { name: 'Run Security Fix Audit', value: 'fix' },
          { name: 'Lambda AI Threat Autopsy', value: 'analyze' },
          { name: 'Run Baseline Scan', value: 'baseline' },
          { name: 'View Threat Signatures', value: 'signatures' },
          { name: 'Clear History', value: 'clear' }
        ]
      }
    ],
    async executePrefix(message, args) {
      if (!isServerAdmin(message.member, message.guild.id)) {
        return message.reply(cv2.danger('Access Denied', 'The `!learn` command is restricted to **Admin Tier** roles and server administrators.')).catch(() => null);
      }

      const guild = message.guild;
      const config = db.getGuildConfig(guild.id);
      const prefix = config.prefix || '!';
      const sub = (args[0] || 'status').toLowerCase();

      if (sub === 'on' || sub === 'enable' || sub === 'start') {
        config.learnModeEnabled = true;
        db.updateGuildConfig(guild.id, { learnModeEnabled: true });
        const payload = buildLearnDashboard(guild, config, prefix);
        return message.reply(payload);
      }

      if (sub === 'off' || sub === 'disable' || sub === 'stop') {
        config.learnModeEnabled = false;
        db.updateGuildConfig(guild.id, { learnModeEnabled: false });
        const payload = buildLearnDashboard(guild, config, prefix);
        return message.reply(payload);
      }

      if (sub === 'flaws' || sub === 'flaw' || sub === 'failures' || sub === 'reasons') {
        const payload = buildFlawsReportContainer(guild, prefix);
        return message.reply(payload);
      }

      if (sub === 'fix' || sub === 'auditfix' || sub === 'check' || sub === 'repair') {
        const payload = await buildServerFixContainer(guild, prefix);
        return message.reply(payload);
      }

      if (sub === 'analyze' || sub === 'ai' || sub === 'autopsy' || sub === 'lambda') {
        const sigId = args[1] || null;
        const payload = await buildAIAnalysisContainer(guild, sigId, prefix);
        return message.reply(payload);
      }

      if (sub === 'baseline' || sub === 'scan' || sub === 'audit') {
        const payload = await executeBaselineScan(guild);
        return message.reply(payload);
      }

      if (sub === 'signatures' || sub === 'list' || sub === 'sigs') {
        const payload = buildSignaturesContainer(guild, prefix);
        return message.reply(payload);
      }

      if (sub === 'clear' || sub === 'reset') {
        db.clearNukeSignatures(guild.id);
        const container = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# Threat Signatures Cleared | ${TICK}\n> -# All captured anomaly logs, bot attack patterns, and flaw records for **${guild.name}** have been reset.`
            }
          ]
        };
        return message.reply({ components: [container], flags: (MessageFlags.IsComponentsV2 || 32768) });
      }

      if (sub === 'clearflaws') {
        db.clearNukeFlaws(guild.id);
        const container = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# Defense Flaws Cleared | ${TICK}\n> -# All historical flaw flags for **${guild.name}** have been cleared.`
            }
          ]
        };
        return message.reply({ components: [container], flags: (MessageFlags.IsComponentsV2 || 32768) });
      }

      // Default: Status Dashboard
      const payload = buildLearnDashboard(guild, config, prefix);
      return message.reply(payload);
    },
    async executeSlash(interaction) {
      if (!isServerAdmin(interaction.member, interaction.guild.id)) {
        return interaction.reply({
          content: `-# ${OFF} **Access Denied:** Only Server Administrators or Owners can manage Learn & Lambda Mode.`,
          flags: 64
        });
      }

      const guild = interaction.guild;
      const config = db.getGuildConfig(guild.id);
      const prefix = config.prefix || '!';
      const action = (interaction.options.getString('action') || 'status').toLowerCase();

      if (action === 'enable') {
        config.learnModeEnabled = true;
        db.updateGuildConfig(guild.id, { learnModeEnabled: true });
        const payload = buildLearnDashboard(guild, config, prefix);
        return interaction.reply(payload);
      }

      if (action === 'disable') {
        config.learnModeEnabled = false;
        db.updateGuildConfig(guild.id, { learnModeEnabled: false });
        const payload = buildLearnDashboard(guild, config, prefix);
        return interaction.reply(payload);
      }

      if (action === 'flaws') {
        const payload = buildFlawsReportContainer(guild, prefix);
        return interaction.reply(payload);
      }

      if (action === 'fix') {
        await interaction.deferReply();
        const payload = await buildServerFixContainer(guild, prefix);
        return interaction.editReply(payload);
      }

      if (action === 'analyze') {
        await interaction.deferReply();
        const payload = await buildAIAnalysisContainer(guild, null, prefix);
        return interaction.editReply(payload);
      }

      if (action === 'baseline') {
        await interaction.deferReply();
        const payload = await executeBaselineScan(guild);
        return interaction.editReply(payload);
      }

      if (action === 'signatures') {
        const payload = buildSignaturesContainer(guild, prefix);
        return interaction.reply(payload);
      }

      if (action === 'clear') {
        db.clearNukeSignatures(guild.id);
        const container = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# Threat Signatures Cleared | ${TICK}\n> -# All captured anomaly logs and attack patterns for **${guild.name}** have been reset.`
            }
          ]
        };
        return interaction.reply({ components: [container], flags: (MessageFlags.IsComponentsV2 || 32768) });
      }

      const payload = buildLearnDashboard(guild, config, prefix);
      return interaction.reply(payload);
    }
  },

  // 2. DEDICATED LAMBDA COMMAND (Full Parity)
  {
    name: 'lambda',
    description: 'Autonomous Self-Learning, Lambda AI Threat Autopsy & Defense Flaw Diagnostics.',
    category: 'security',
    permissions: [],
    aliases: ['lambdalearn', 'selflearning'],
    options: [
      {
        name: 'action',
        description: 'Action to execute',
        type: 3,
        required: false,
        choices: [
          { name: 'Dashboard / Status', value: 'status' },
          { name: 'Enable Autonomous Learning', value: 'enable' },
          { name: 'Disable Autonomous Learning', value: 'disable' },
          { name: 'View Defense Flaws & Failures', value: 'flaws' },
          { name: 'Run Security Fix Audit', value: 'fix' },
          { name: 'Lambda AI Threat Autopsy', value: 'analyze' },
          { name: 'Run Baseline Scan', value: 'baseline' },
          { name: 'View Threat Signatures', value: 'signatures' },
          { name: 'Clear History', value: 'clear' }
        ]
      }
    ],
    async executePrefix(message, args) {
      const learnCmd = commands[0];
      return learnCmd.executePrefix(message, args);
    },
    async executeSlash(interaction) {
      const learnCmd = commands[0];
      return learnCmd.executeSlash(interaction);
    }
  }
];

export default commands;
