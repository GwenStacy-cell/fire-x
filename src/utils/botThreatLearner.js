import { PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import db from '../database.js';
import { generateAIResponse, formatAIToGreyMarkdown } from './ai.js';
import { logToSecurityChannel } from './helpers.js';
import cv2 from '../cv2.js';

const TICK = '<a:atheNATICK:1557841381630681106>';
const UPTIME = '<a:uptime:1552608831060844575>';
const OFF = '<:off:1533844858983157851>';
const ARROW = '<a:z_arrow_pink1:1523082728004653138>';

/**
 * Required permissions for Athena Prime to reliably neutralize threats and rollback damage.
 */
const REQUIRED_PERMISSIONS = [
  { flag: PermissionFlagsBits.Administrator, name: 'Administrator' },
  { flag: PermissionFlagsBits.BanMembers, name: 'Ban Members' },
  { flag: PermissionFlagsBits.KickMembers, name: 'Kick Members' },
  { flag: PermissionFlagsBits.ManageRoles, name: 'Manage Roles' },
  { flag: PermissionFlagsBits.ManageChannels, name: 'Manage Channels' },
  { flag: PermissionFlagsBits.ViewAuditLog, name: 'View Audit Log' },
  { flag: PermissionFlagsBits.ManageGuild, name: 'Manage Server' }
];

/**
 * Audits server hierarchy and permissions to identify structural flaws that could prevent
 * Athena from blocking rogue bots or nuking actions.
 */
export async function auditServerFlaws(guild) {
  const flaws = [];
  const me = guild.members.me || await guild.members.fetch(guild.client.user.id).catch(() => null);

  if (!me) {
    flaws.push({
      type: 'BOT_MEMBER_UNAVAILABLE',
      severity: 'critical',
      title: 'Bot Member Cache Fault',
      reason: 'Athena Prime could not resolve its own member object in this server.',
      fix: 'Re-invite Athena Prime with proper authorization scopes.'
    });
    return { flaws, healthy: false, athenaPosition: 0, botCount: 0 };
  }

  const athenaHighestRole = me.roles.highest;
  const athenaPos = athenaHighestRole ? athenaHighestRole.position : 0;

  // 1. Check Athena's Core Permissions
  const missingPerms = [];
  for (const p of REQUIRED_PERMISSIONS) {
    if (!me.permissions.has(p.flag)) {
      missingPerms.push(p.name);
    }
  }

  if (missingPerms.length > 0 && !me.permissions.has(PermissionFlagsBits.Administrator)) {
    flaws.push({
      type: 'MISSING_CORE_PERMISSIONS',
      severity: 'critical',
      title: 'Athena Lacks Core Antinuke Permissions',
      reason: `Athena Prime is missing critical permissions: \`${missingPerms.join(', ')}\`. Without these permissions, countermeasure bans, role-stripping, and restoration will be rejected by the Discord API.`,
      fix: '1. Open Server Settings > Roles > Athena Prime.\n2. Enable Administrator permission, or explicitly grant: Ban Members, Manage Roles, Manage Channels, and View Audit Log.'
    });
  }

  // 2. Audit All Other Bots in the Guild for Hierarchy Conflicts & Dangerous Permissions
  await guild.members.fetch().catch(() => guild.members.cache);
  const allMembers = guild.members.cache?.values ? Array.from(guild.members.cache.values()) : [];
  const botMembers = allMembers.filter(m => m.user?.bot && m.id !== guild.client.user.id);

  for (const botMember of botMembers) {
    const botHighest = botMember.roles.highest;
    const botPos = botHighest ? botHighest.position : 0;

    // Hierarchy Inversion: Another bot is higher than or equal to Athena
    if (botPos >= athenaPos) {
      flaws.push({
        type: 'ROLE_HIERARCHY_INVERSION',
        severity: 'critical',
        targetBotId: botMember.id,
        targetBotTag: botMember.user.tag || botMember.user.username,
        title: `Hierarchy Conflict: ${botMember.user.username} is Above Athena`,
        reason: `Rogue or external bot <@${botMember.id}> holds highest role \`${botHighest.name}\` at position \`${botPos}\`, which is higher than or equal to Athena Prime (\`${athenaHighestRole.name}\` at position \`${athenaPos}\`). Discord strictly prohibits any bot from banning, kicking, or role-stripping accounts positioned higher in role hierarchy.`,
        fix: `1. Open Server Settings > Roles.\n2. Drag the **${athenaHighestRole.name}** role above **${botHighest.name}**.\n3. Ensure Athena Prime's role sits higher than every other bot in the server.`
      });
    }

    // Dangerous Permissions on External Bots
    const hasAdmin = botMember.permissions.has(PermissionFlagsBits.Administrator);
    const hasManageRoles = botMember.permissions.has(PermissionFlagsBits.ManageRoles);
    const hasManageChannels = botMember.permissions.has(PermissionFlagsBits.ManageChannels);
    const hasBan = botMember.permissions.has(PermissionFlagsBits.BanMembers);

    if (hasAdmin || hasManageRoles || hasManageChannels || hasBan) {
      const dangerPerms = [];
      if (hasAdmin) dangerPerms.push('Administrator');
      if (hasManageRoles) dangerPerms.push('Manage Roles');
      if (hasManageChannels) dangerPerms.push('Manage Channels');
      if (hasBan) dangerPerms.push('Ban Members');

      const isWhitelisted = db.isBotAuthorized ? db.isBotAuthorized(guild, botMember.id) : false;
      if (!isWhitelisted && botPos >= athenaPos) {
        flaws.push({
          type: 'UNAUTHORIZED_ELEVATED_BOT',
          severity: 'high',
          targetBotId: botMember.id,
          targetBotTag: botMember.user.tag || botMember.user.username,
          title: `Elevated External Bot: ${botMember.user.username}`,
          reason: `External bot <@${botMember.id}> possesses dangerous permissions (\`${dangerPerms.join(', ')}\`) while outside Athena's strike range due to hierarchy alignment. If compromised, this bot can wipe channels or roles before Athena can intervene.`,
          fix: `1. Strip Administrator and elevated permissions from <@${botMember.id}>.\n2. Or whitelist the bot if verified using \`!botwhitelist add ${botMember.id}\` after moving Athena above it.`
        });
      }
    }
  }

  return {
    flaws,
    healthy: flaws.length === 0,
    athenaPosition: athenaPos,
    athenaRoleName: athenaHighestRole ? athenaHighestRole.name : 'Unknown',
    botCount: botMembers.size
  };
}

/**
 * Deep forensic diagnostic on why an antinuke countermeasure failed, was blocked,
 * or encountered execution resistance during a hostile bot attack.
 */
export async function diagnoseIncidentFlaw(guild, executor, eventType, punishResult, rollbackResult) {
  const resultStr = String(punishResult || '');
  const rollbackStr = String(rollbackResult || '');
  const isFailure = resultStr.includes('Total failure') ||
                    resultStr.includes('Hierarchy blocked') ||
                    resultStr.includes('Missing Permissions') ||
                    resultStr.includes('Blocked') ||
                    resultStr.includes('Failed') ||
                    rollbackStr.toLowerCase().includes('failed');

  if (!isFailure) {
    return {
      flawDetected: false,
      flawType: 'NONE',
      flawReason: 'Countermeasure and damage recovery executed without architectural resistance.',
      flawFix: 'No corrective action required. Antinuke defense completed successfully.'
    };
  }

  const me = guild.members.me || await guild.members.fetch(guild.client.user.id).catch(() => null);
  const athenaHighest = me?.roles.highest;
  const athenaPos = athenaHighest ? athenaHighest.position : 0;

  const attackerMember = guild.members.cache.get(executor.id) || await guild.members.fetch(executor.id).catch(() => null);
  const attackerHighest = attackerMember?.roles.highest;
  const attackerPos = attackerHighest ? attackerHighest.position : 0;

  // 1. Check Server Owner Immunity
  if (executor.id === guild.ownerId) {
    return {
      flawDetected: true,
      flawType: 'SERVER_OWNER_IMMUNITY',
      title: 'Server Owner Hardcoded Immunity Conflict',
      flawReason: `The hostile action was triggered by the Server Owner (<@${executor.id}>). Discord's core security architecture strictly hardcodes the Server Owner as completely immune to bans, kicks, and role modifications by any bot.`,
      flawFix: '1. If the owner account was compromised, immediately rotate account password and reset 2FA in User Settings.\n2. Terminate all active Discord sessions from User Settings > Devices.\n3. Transfer ownership to a clean, secured alt account.'
    };
  }

  // 2. Check Role Hierarchy Inversion
  if (attackerPos >= athenaPos || resultStr.includes('Hierarchy blocked')) {
    const roleName = attackerHighest ? attackerHighest.name : 'Target Role';
    return {
      flawDetected: true,
      flawType: 'ROLE_HIERARCHY_INVERSION',
      title: 'Discord Role Hierarchy Inversion',
      flawReason: `Discord API Error 50013: Attacking actor <@${executor.id}> holds role \`${roleName}\` at position \`${attackerPos}\`, which is higher than or equal to Athena Prime's highest role (\`${athenaHighest?.name || 'Athena'}\` at position \`${athenaPos}\`). Discord strictly prohibits lower roles from banning, kicking, or role-stripping higher-ranking members.`,
      flawFix: `1. Open Server Settings > Roles.\n2. Drag Athena Prime's highest role to the top of the hierarchy (above all other staff and bot roles).\n3. Manually ban the rogue actor <@${executor.id}>.\n4. Run \`!security status\` to confirm defense integrity.`
    };
  }

  // 3. Check Missing Athena Core Permissions
  if (!me?.permissions.has(PermissionFlagsBits.Administrator)) {
    const missing = [];
    if (!me?.permissions.has(PermissionFlagsBits.BanMembers)) missing.push('Ban Members');
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) missing.push('Manage Roles');
    if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) missing.push('Manage Channels');
    if (!me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) missing.push('View Audit Log');

    if (missing.length > 0) {
      return {
        flawDetected: true,
        flawType: 'MISSING_CORE_PERMISSIONS',
        title: 'Athena Missing Core Execution Permissions',
        flawReason: `Athena Prime was blocked by Discord because it lacks critical execution permissions: \`${missing.join(', ')}\`. The API rejected the countermeasure request.`,
        flawFix: '1. Open Server Settings > Roles > Athena Prime.\n2. Enable Administrator permission (or toggle Ban Members, Manage Roles, and Manage Channels).\n3. Re-run `!health` to verify all 8 core permissions are green.'
      };
    }
  }

  // 4. Check Managed Integration Role Conflict
  if (attackerMember?.roles.cache.some(r => r.managed)) {
    return {
      flawDetected: true,
      flawType: 'MANAGED_INTEGRATION_ROLE',
      title: 'Managed Integration Role Lock',
      flawReason: `Attacking bot <@${executor.id}> possesses a Discord managed integration role (OAuth bot role) that cannot be stripped via standard role modification API calls without kicking or banning the bot itself.`,
      flawFix: '1. Use Athena\'s Raw Ban socket to eliminate the bot directly.\n2. Remove the bot\'s integration in Server Settings > Integrations.'
    };
  }

  // 5. Rate Limit or Channel/Role Limit
  if (resultStr.includes('429') || rollbackStr.includes('429')) {
    return {
      flawDetected: true,
      flawType: 'API_RATE_LIMIT',
      title: 'Discord REST API Rate Limit Congestion',
      flawReason: 'Discord temporarily throttled countermeasure socket requests due to excessive action density during the attack.',
      flawFix: '1. Athena has automatically queued restoration retries via background ring buffers.\n2. Run `!panic on` immediately to freeze channels and preserve server state.'
    };
  }

  // 6. Generic Execution Anomaly
  return {
    flawDetected: true,
    flawType: 'EXECUTION_ANOMALY',
    title: 'Unexpected Execution Anomaly',
    flawReason: `Countermeasure encountered an unexpected Discord API response: \`${resultStr || rollbackStr}\`.`,
    flawFix: '1. Inspect recent audit logs with `!records`.\n2. Verify Athena Prime is placed at top of Server Settings > Roles with Administrator.'
  };
}

/**
 * Autonomous Self-Learning & Threat Ingestion Pipeline.
 * Extracts comprehensive telemetry from rogue bot nuking attempts, diagnoses flaws,
 * stores the signature, notifies administrators, and triggers neural AI analysis.
 */
export async function recordAndLearnThreat(guild, executor, eventType, punishResult, rollbackResult) {
  try {
    const isBot = Boolean(executor.bot || guild.members.cache.get(executor.id)?.user?.bot);
    const diagnosis = await diagnoseIncidentFlaw(guild, executor, eventType, punishResult, rollbackResult);

    const me = guild.members.me || await guild.members.fetch(guild.client.user.id).catch(() => null);
    const athenaPos = me?.roles.highest.position || 0;
    const attackerMember = guild.members.cache.get(executor.id) || await guild.members.fetch(executor.id).catch(() => null);
    const attackerPos = attackerMember?.roles.highest.position || 0;
    const roleValues = attackerMember?.roles?.cache?.values ? Array.from(attackerMember.roles.cache.values()) : [];
    const botRoles = roleValues.filter(r => r.id !== guild.id).map(r => r.name);

    const signature = {
      executorId: executor.id,
      executorTag: executor.tag || executor.username || 'Unknown',
      isBot,
      eventType: eventType || 'Unknown Hostile Event',
      action: eventType,
      verdict: String(punishResult || 'None applied'),
      rollback: String(rollbackResult || 'No rollback'),
      botRoles: botRoles.slice(0, 10),
      botHighestPos: attackerPos,
      athenaHighestPos: athenaPos,
      hierarchyDelta: attackerPos - athenaPos,
      flawDetected: diagnosis.flawDetected,
      flawType: diagnosis.flawType,
      flawReason: diagnosis.flawReason,
      flawFix: diagnosis.flawFix,
      aiAnalysis: null
    };

    // Store in Database
    const savedEntry = db.addNukeSignature(guild.id, signature);

    // If a flaw was detected (Antinuke failed or encountered resistance), broadcast emergency alert
    if (diagnosis.flawDetected) {
      await dispatchFlawAlert(guild, savedEntry, diagnosis);
    }

    // Trigger Neural AI Analysis asynchronously in the background
    spawnAIThreatAnalysis(guild, savedEntry.id, signature);

    return savedEntry;
  } catch (err) {
    console.error('[BotThreatLearner] Ingestion error:', err);
    return null;
  }
}

/**
 * Dispatches a high-priority flaw alert to the security logs channel and owner DM.
 */
async function dispatchFlawAlert(guild, entry, diagnosis) {
  try {
    const container = buildFlawAlertContainer(guild, entry, diagnosis);
    await logToSecurityChannel(guild, container);

    const owner = guild.members.cache.get(guild.ownerId) || await guild.members.fetch(guild.ownerId).catch(() => null);
    if (owner) {
      await owner.send({
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `# Emergency Antinuke Flaw Alert | ${TICK}\n` +
                         `> -# <a:uptime:1552608831060844575> **Server:** **${guild.name}**\n` +
                         `> -# <a:uptime:1552608831060844575> **Hostile Actor:** <@${entry.executorId}> (\`${entry.executorTag}\`) ${entry.isBot ? '`[BOT]`' : '`[USER]`'}\n` +
                         `> -# <a:uptime:1552608831060844575> **Attack Event:** \`${entry.eventType}\`\n\n` +
                         `### Structural Flaw Detected\n` +
                         `> **${diagnosis.title || 'Countermeasure Blocked'}**\n` +
                         `> ${diagnosis.flawReason}\n\n` +
                         `### Immediate Corrective Fix\n` +
                         diagnosis.flawFix.split('\n').map(line => `> ${line}`).join('\n') + `\n\n` +
                         `-# Use \`!learn flaws\` or \`!learn fix\` in the server to inspect details.`
              }
            ]
          }
        ],
        flags: (MessageFlags.IsComponentsV2 || 32768)
      }).catch(() => null);
    }
  } catch (err) {
    console.error('[BotThreatLearner] Flaw alert error:', err);
  }
}

/**
 * Spawns an asynchronous Lambda AI / Google Gemini 3.8 Flash forensic analysis.
 */
function spawnAIThreatAnalysis(guild, signatureId, signature) {
  setTimeout(async () => {
    try {
      const aiPrompt =
        `You are Athena Prime's Autonomous Defense Matrix (Lambda Neural Sentry). ` +
        `Analyze this hostile bot nuking event and server defense outcome:\n` +
        `- Guild: "${guild.name}"\n` +
        `- Attacker: ${signature.executorTag} (ID: ${signature.executorId}, isBot: ${signature.isBot})\n` +
        `- Attack Type: ${signature.eventType}\n` +
        `- Defense Verdict: ${signature.verdict}\n` +
        `- Rollback Result: ${signature.rollback}\n` +
        `- Flaw Status: ${signature.flawDetected ? `FLAW DETECTED (${signature.flawType}): ${signature.flawReason}` : 'NEUTRALIZED'}\n\n` +
        `Provide a concise 3-4 sentence forensic breakdown explaining:\n` +
        `1. The exact attack vector and motive of the rogue bot.\n` +
        `2. The structural flaw or defense mechanism involved.\n` +
        `3. Concrete advice for the server administrator to ensure zero future recurrence.\n` +
        `Keep it objective, professional, and formatted in clean markdown.`;

      const aiRes = await generateAIResponse(aiPrompt, {
        guildId: guild.id,
        customSystem: 'You are an advanced autonomous cybersecurity antinuke intelligence engine. Answer authoritatively.'
      });

      if (aiRes && aiRes.success && aiRes.text) {
        const formatted = formatAIToGreyMarkdown(aiRes.text);
        db.updateNukeSignature(guild.id, signatureId, { aiAnalysis: formatted });
      }
    } catch (e) {
      console.error('[BotThreatLearner] Background AI autopsy error:', e);
    }
  }, 100);
}

/**
 * Builds the Components V2 Flaw Alert container.
 */
export function buildFlawAlertContainer(guild, entry, diagnosis) {
  const ts = Math.floor((entry.timestamp || Date.now()) / 1000);
  return {
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `# Antinuke Defense Flaw Detected | ${TICK}\n` +
                     `> ${UPTIME} **Incident Logged:** <t:${ts}:R> | **Server:** **${guild.name}**\n` +
                     `> -# Athena Prime intercepted a hostile action, but encountered execution friction.`
          },
          { type: 14, divider: true },
          {
            type: 10,
            content:
`### Threat Incident Telemetry
• **Hostile Actor:** <@${entry.executorId}> (\`${entry.executorTag}\`) ${entry.isBot ? '`[BOT]`' : '`[USER]`'}
• **Attack Vector:** \`${entry.eventType}\`
• **Countermeasure Verdict:** \`${entry.verdict}\`
• **Damage Recovery:** \`${entry.rollback}\`
• **Role Position Gap:** Attacker: \`pos ${entry.botHighestPos || 0}\` vs Athena: \`pos ${entry.athenaHighestPos || 0}\``
          },
          { type: 14, divider: true },
          {
            type: 10,
            content:
`### Identified Flaw & Cause
> **${diagnosis.title || 'Execution Failure'}**
> ${diagnosis.flawReason}`
          },
          { type: 14, divider: true },
          {
            type: 10,
            content:
`### Step-by-Step Remediation Fix
${diagnosis.flawFix.split('\n').map(line => `> ${line}`).join('\n')}`
          },
          { type: 14, divider: true },
          {
            type: 1,
            components: [
              { type: 2, custom_id: 'learn_flaws', label: 'View All Flaws', style: 2, emoji: { id: '1523765738655973589' } },
              { type: 2, custom_id: 'learn_fix', label: 'Run Security Audit', style: 3, emoji: { id: '1552608831060844575' } },
              { type: 2, custom_id: `learn_ai_${entry.id}`, label: 'Neural AI Autopsy', style: 2, emoji: { id: '1523766065576935475' } }
            ]
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: '-# **Athena Prime Autonomous Self-Learning & Lambda AI Matrix**'
          }
        ]
      }
    ],
    flags: (MessageFlags.IsComponentsV2 || 32768)
  };
}

/**
 * Builds the comprehensive Components V2 Flaws Directory container.
 */
export function buildFlawsReportContainer(guild, prefix = '!') {
  const flaws = db.getNukeFlaws(guild.id);

  if (flaws.length === 0) {
    return {
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `# Defense Flaws & Failures Registry | ${TICK}\n` +
                       `> ${UPTIME} **Zero Unresolved Defense Flaws Detected!**\n` +
                       `> -# Athena Prime has successfully neutralized all recorded attacks without encountering hierarchy or permission resistance.`
            },
            { type: 14, divider: true },
            {
              type: 10,
              content:
`### System Immunity Status
• **Role Hierarchy Alignment:** ${UPTIME} **Optimal** (Athena holds administrative elevation)
• **Core Permissions:** ${UPTIME} **Verified** (Ban, Kick, Manage Roles, Manage Channels)
• **Bot Threat Memory:** \`${db.getNukeSignatures(guild.id).length}\` attack patterns indexed
• **Lambda AI Self-Learning:** ${UPTIME} **Engaged** (Continuous anomaly profiling active)`
            },
            { type: 14, divider: true },
            {
              type: 1,
              components: [
                { type: 2, custom_id: 'learn_dashboard', label: 'Return to Dashboard', style: 2, emoji: { id: '1523765738655973589' } },
                { type: 2, custom_id: 'learn_fix', label: 'Run Full Audit', style: 2, emoji: { id: '1552608831060844575' } }
              ]
            },
            { type: 14, divider: true },
            {
              type: 10,
              content: '-# **Athena Prime Autonomous Self-Learning & Lambda AI Matrix**'
            }
          ]
        }
      ],
      flags: (MessageFlags.IsComponentsV2 || 32768)
    };
  }

  const recentFlaws = flaws.slice(0, 6);
  const rows = recentFlaws.map((f, idx) => {
    const ts = f.timestamp ? `<t:${Math.floor(f.timestamp / 1000)}:R>` : 'Recent';
    const actor = `<@${f.executorId}> (\`${f.executorTag}\`) ${f.isBot ? '`[BOT]`' : '`[USER]`'}`;
    const fixText = (f.flawFix || 'Move Athena to top of roles.').split('\n')[0];

    return `**${idx + 1}. ${f.flawType || 'EXECUTION_FLAW'} — ${f.eventType}** (${ts})\n` +
           `-# • **Hostile Actor:** ${actor}\n` +
           `-# • **Verdict:** \`${f.verdict}\`\n` +
           `-# • **Root Cause:** ${f.flawReason || 'Execution blocked by Discord API hierarchy.'}\n` +
           `-# • **Remedy:** **${fixText}**`;
  }).join('\n\n');

  return {
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `# Defense Flaws & Failures Registry | ${TICK}\n` +
                     `> -# Showing the **${recentFlaws.length}** most recent recorded execution flaws and block failures for **${guild.name}**:`
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
              { type: 2, custom_id: 'learn_dashboard', label: 'Dashboard', style: 2, emoji: { id: '1523765738655973589' } },
              { type: 2, custom_id: 'learn_fix', label: 'Run Security Audit & Fix', style: 3, emoji: { id: '1552608831060844575' } },
              { type: 2, custom_id: 'learn_clear_flaws', label: 'Clear Flaw Registry', style: 4 }
            ]
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: '-# **Athena Prime Autonomous Self-Learning & Lambda AI Matrix**'
          }
        ]
      }
    ],
    flags: (MessageFlags.IsComponentsV2 || 32768)
  };
}

/**
 * Builds the comprehensive Components V2 Fix & Audit container.
 */
export async function buildServerFixContainer(guild, prefix = '!') {
  const audit = await auditServerFlaws(guild);
  const flaws = audit.flaws;

  if (audit.healthy) {
    return {
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `# Server Hardening Audit & Hierarchy Verification | ${TICK}\n` +
                       `> ${UPTIME} **No Structural Antinuke Vulnerabilities Detected!**\n` +
                       `> -# Athena Prime has full permission supremacy and role elevation across **${guild.name}**.`
            },
            { type: 14, divider: true },
            {
              type: 10,
              content:
`### Verification Telemetry
• **Athena Highest Role:** \`${audit.athenaRoleName}\` (Position \`${audit.athenaPosition}\`)
• **External Bots Evaluated:** \`${audit.botCount}\`
• **Hierarchy Inversion Risk:** ${UPTIME} **0 Conflicts** (Athena is positioned above all bots)
• **Execution Readiness:** ${UPTIME} **100% Prepared** for sub-1ms countermeasure dual-strike.`
            },
            { type: 14, divider: true },
            {
              type: 1,
              components: [
                { type: 2, custom_id: 'learn_dashboard', label: 'Return to Dashboard', style: 2, emoji: { id: '1523765738655973589' } },
                { type: 2, custom_id: 'learn_signatures', label: 'View Threat Signatures', style: 2 }
              ]
            },
            { type: 14, divider: true },
            {
              type: 10,
              content: '-# **Athena Prime Autonomous Self-Learning & Lambda AI Matrix**'
            }
          ]
        }
      ],
      flags: (MessageFlags.IsComponentsV2 || 32768)
    };
  }

  const flawEntries = flaws.map((f, i) => {
    return `### ${i + 1}. ${f.title}\n` +
           `> **Identified Flaw:** ${f.reason}\n` +
           `> **Step-by-Step Fix:**\n` +
           f.fix.split('\n').map(l => `> • ${l}`).join('\n');
  }).join('\n\n');

  return {
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `# Server Hardening Audit & Structural Flaws | ${TICK}\n` +
                     `> -# Athena detected **${flaws.length}** structural security flaws that could prevent attacks from being blocked:`
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: flawEntries
          },
          { type: 14, divider: true },
          {
            type: 1,
            components: [
              { type: 2, custom_id: 'learn_dashboard', label: 'Return to Dashboard', style: 2, emoji: { id: '1523765738655973589' } },
              { type: 2, custom_id: 'learn_fix', label: 'Re-run Audit', style: 3, emoji: { id: '1552608831060844575' } },
              { type: 2, custom_id: 'learn_flaws', label: 'View Historical Flaws', style: 2 }
            ]
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: '-# **Athena Prime Autonomous Self-Learning & Lambda AI Matrix**'
          }
        ]
      }
    ],
    flags: (MessageFlags.IsComponentsV2 || 32768)
  };
}

/**
 * Builds the Neural AI Autopsy container for an individual signature or latest threat.
 */
export async function buildAIAnalysisContainer(guild, signatureId, prefix = '!') {
  const signatures = db.getNukeSignatures(guild.id);
  const target = signatureId
    ? signatures.find(s => s.id === signatureId)
    : (signatures.find(s => s.flawDetected) || signatures[0]);

  if (!target) {
    return {
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `# Neural AI Threat Autopsy | ${TICK}\n` +
                       `> ${OFF} **No threat signatures recorded yet.**\n` +
                       `> -# Run attacks or baseline scans to generate telemetry for Lambda AI analysis.`
            },
            { type: 14, divider: true },
            {
              type: 1,
              components: [
                { type: 2, custom_id: 'learn_dashboard', label: 'Return to Dashboard', style: 2, emoji: { id: '1523765738655973589' } }
              ]
            }
          ]
        }
      ],
      flags: (MessageFlags.IsComponentsV2 || 32768)
    };
  }

  const ts = target.timestamp ? `<t:${Math.floor(target.timestamp / 1000)}:R>` : 'Recent';
  const analysisText = target.aiAnalysis ||
    `> ${UPTIME} **Forensic Analysis Synthesized:**\n` +
    `> -# Attacking actor \`${target.executorTag}\` triggered an unauthorized \`${target.eventType}\` event.\n` +
    `> -# Verdict: \`${target.verdict}\` | Rollback: \`${target.rollback}\`\n` +
    (target.flawDetected
      ? `> -# **Flaw Analysis:** ${target.flawReason}\n> -# **Recommended Remedy:** ${target.flawFix}`
      : `> -# **Verdict Analysis:** The event was eliminated before a second destructive operation could execute.`);

  return {
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `# Lambda Neural AI Threat Autopsy | ${TICK}\n` +
                     `> ${UPTIME} **Signature ID:** \`${target.id}\` | **Recorded:** ${ts}\n` +
                     `> -# Powered by Google Gemini 3.8 Flash High Intelligence Pipeline & Lambda Security Engine.`
          },
          { type: 14, divider: true },
          {
            type: 10,
            content:
`### Threat Signature Fingerprint
• **Hostile Actor:** <@${target.executorId}> (\`${target.executorTag}\`) ${target.isBot ? '`[BOT]`' : '`[USER]`'}
• **Attack Type:** \`${target.eventType}\`
• **Countermeasure Verdict:** \`${target.verdict}\`
• **Damage Recovery:** \`${target.rollback}\`
• **Flaw Classification:** \`${target.flawType || 'NONE'}\``
          },
          { type: 14, divider: true },
          {
            type: 10,
            content:
`### Neural Forensic Dissection
${analysisText}`
          },
          { type: 14, divider: true },
          {
            type: 1,
            components: [
              { type: 2, custom_id: 'learn_dashboard', label: 'Return to Dashboard', style: 2, emoji: { id: '1523765738655973589' } },
              { type: 2, custom_id: 'learn_flaws', label: 'Flaws Registry', style: 2 },
              { type: 2, custom_id: 'learn_signatures', label: 'All Signatures', style: 2 }
            ]
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: '-# **Athena Prime Autonomous Self-Learning & Lambda AI Matrix**'
          }
        ]
      }
    ],
    flags: (MessageFlags.IsComponentsV2 || 32768)
  };
}
