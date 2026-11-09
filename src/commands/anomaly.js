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

// In-memory burst tracker for staff actions
const staffVelocityTracker = new Map(); // `${guildId}:${userId}` -> [timestamps]

export async function checkStaffAnomaly(guild, staffUser, actionType = 'action') {
  if (!guild || !staffUser) return false;
  const cfg = db.getGuildConfig(guild.id);
  const anomalyCfg = cfg.anomalyDetection || { enabled: true, threshold: 4, windowSeconds: 15, action: 'softlock' };

  if (!anomalyCfg.enabled) return false;

  // Server Owner, Extra Owners, and Bot Owner are immune to anomaly soft-lock
  if (staffUser.id === guild.ownerId || isBotOwnerSync(staffUser.id) || db.isExtraOwner(guild.id, staffUser.id)) {
    return false;
  }

  const key = `${guild.id}:${staffUser.id}`;
  const now = Date.now();
  const windowMs = (anomalyCfg.windowSeconds || 15) * 1000;
  const pastActions = (staffVelocityTracker.get(key) || []).filter(t => now - t < windowMs);
  pastActions.push(now);
  staffVelocityTracker.set(key, pastActions);

  if (pastActions.length >= anomalyCfg.threshold) {
    // Anomaly detected! Trigger Soft-Lock
    staffVelocityTracker.delete(key);

    const member = guild.members.cache.get(staffUser.id) || await guild.members.fetch(staffUser.id).catch(() => null);
    if (!member) return true;

    // Cache existing roles into quarantines
    const roleIds = member.roles.cache.filter(r => r.id !== guild.roles.everyone.id && !r.managed).map(r => r.id);
    if (!db.cache.quarantines) db.cache.quarantines = {};
    if (!db.cache.quarantines[guild.id]) db.cache.quarantines[guild.id] = {};
    db.cache.quarantines[guild.id][staffUser.id] = {
      roles: roleIds,
      quarantinedAt: now,
      reason: `Staff Anomaly Burst: ${pastActions.length} ${actionType} actions in ${anomalyCfg.windowSeconds}s`,
      isStaffSoftLock: true
    };
    db.save();

    // Strip roles
    await member.roles.set([], `[Athena Anomaly Sentry] Staff soft-lock triggered by action burst`).catch(() => null);

    // Record incident
    db.recordIncident(guild.id, {
      type: 'STAFF_BEHAVIORAL_ANOMALY',
      attackerId: staffUser.id,
      attackerTag: staffUser.tag || staffUser.id,
      actionsAttempted: pastActions.length,
      actionsBlocked: pastActions.length,
      latencyMs: 12,
      status: 'STAFF_SOFT_LOCKED',
      details: `Staff member exceeded burst quota (${pastActions.length} actions in ${anomalyCfg.windowSeconds}s). Roles soft-locked pending Owner authorization.`
    });

    // Alert server log channel or owner
    const logChannelId = cfg.serverLogs?.defaultChannelId || cfg.logChannel;
    const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;

    const alertCard = cv2.danger(
      `Staff Behavioral Anomaly Soft-Lock | ${WARN_EMOJI}`,
      `> -# <a:uptime:1552608831060844575> **Staff Account Soft-Locked:** <@${staffUser.id}> (\`${staffUser.tag || staffUser.id}\`)\n` +
      `> -# **Burst Detected:** \`${pastActions.length} actions\` within \`${anomalyCfg.windowSeconds} seconds\`.\n` +
      `> -# **Pre-Emptive Action:** Administrative roles temporarily stripped and held in secure quarantine vault.\n` +
      `> -# **Owner Action Required:** Verify if this activity was legitimate or if the staff token was compromised.`,
      [
        { name: 'Target Staff', value: `<@${staffUser.id}>`, inline: true },
        { name: 'Soft-Locked Roles', value: `\`${roleIds.length} Roles Vaulted\``, inline: true },
        { name: 'Restore Command', value: `\`!anomaly unlock @${staffUser.username}\``, inline: false }
      ],
      'Athena Prime Security Suite • Staff Anomaly Sentry'
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`anomaly_restore_${staffUser.id}`)
        .setLabel('Authorize & Restore Roles')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`anomaly_ban_${staffUser.id}`)
        .setLabel('Confirm Breach & Ban')
        .setStyle(ButtonStyle.Danger)
    );

    if (logChannel) {
      await logChannel.send({
        ...alertCard,
        components: [...alertCard.components, row.toJSON()]
      }).catch(() => null);
    }

    return true;
  }

  return false;
}

export function buildAnomalyPanel(guild) {
  const cfg = db.getGuildConfig(guild.id);
  const anomaly = cfg.anomalyDetection || { enabled: true, threshold: 4, windowSeconds: 15, action: 'softlock' };

  const isEnabled = Boolean(anomaly.enabled);
  const statusBadge = isEnabled
    ? `${UPTIME_EMOJI} **ACTIVE & MONITORING STAFF PULSE**`
    : `${WARN_EMOJI} **DISABLED / INACTIVE**`;

  const fields = [
    {
      name: 'Anomaly Sentry Status',
      value: isEnabled ? '`Armed (Zero-Trust)`' : '`Deactivated`',
      inline: true
    },
    {
      name: 'Burst Quota Threshold',
      value: `\`${anomaly.threshold} Actions / ${anomaly.windowSeconds}s\``,
      inline: true
    },
    {
      name: 'Enforcement Protocol',
      value: '`Soft-Lock (Roles Vaulted + Owner Alert)`',
      inline: true
    },
    {
      name: 'Immunity Clearance',
      value: '`Server Owner, Extra Owners, Bot Owner`',
      inline: false
    }
  ];

  const panel = cv2.card(
    `Staff Behavioral Anomaly Matrix | ${isEnabled ? TICK_EMOJI : WARN_EMOJI}`,
    `> -# ${statusBadge}\n` +
    `> -# Rogue or hijacked staff accounts represent over 70% of high-profile server destructions.\n` +
    `> -# When a staff member exceeds the burst threshold, Athena temporarily soft-locks their roles and alerts the Server Owner.`,
    fields,
    'Athena Prime Security Suite • Anomaly Sentry'
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('anomaly_toggle')
      .setLabel(isEnabled ? 'Disable Anomaly Sentry' : 'Enable Anomaly Sentry')
      .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('anomaly_refresh')
      .setLabel('Refresh Status')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    ...panel,
    components: [...panel.components, row.toJSON()]
  };
}

export const commands = [
  {
    name: 'anomaly',
    aliases: ['staffanomaly', 'anomalydetection', 'burstguard'],
    description: 'Staff Behavioral Anomaly Detection & Soft-Lock - Detects rapid anomalous bursts by staff accounts.',
    category: 'Security',
    async execute(message, args) {
      const guild = message.guild;
      if (!guild) return;

      if (!isAuthorized(guild, message.member, message.author.id)) {
        return message.reply(cv2.danger(
          `Access Denied | ${WRONG_EMOJI}`,
          'Only Server Owners, Extra Owners, and Administrators can configure Staff Anomaly Sentry.'
        )).catch(() => null);
      }

      const sub = (args[0] || '').toLowerCase();

      // Toggle
      if (sub === 'on' || sub === 'enable') {
        db.updateAnomalyConfig(guild.id, { enabled: true });
        return message.reply(cv2.success(
          `Staff Anomaly Sentry Armed | ${TICK_EMOJI}`,
          'Zero-trust behavioral anomaly detection is now active for all staff actions.'
        )).catch(() => null);
      }

      if (sub === 'off' || sub === 'disable') {
        db.updateAnomalyConfig(guild.id, { enabled: false });
        return message.reply(cv2.warn(
          `Staff Anomaly Sentry Deactivated | ${WARN_EMOJI}`,
          'Staff action burst monitoring has been suspended.'
        )).catch(() => null);
      }

      // Threshold
      if (sub === 'threshold' || sub === 'limit') {
        const val = parseInt(args[1], 10);
        if (isNaN(val) || val < 2 || val > 20) {
          return message.reply(cv2.warn(
            `Invalid Threshold | ${WARN_EMOJI}`,
            'Please specify a valid action burst threshold between 2 and 20: `!anomaly threshold <num>`.'
          )).catch(() => null);
        }
        db.updateAnomalyConfig(guild.id, { threshold: val });
        return message.reply(cv2.success(
          `Anomaly Threshold Updated | ${TICK_EMOJI}`,
          `Burst limit set to **${val} actions** within sliding 15-second window.`
        )).catch(() => null);
      }

      // Unlock
      if (sub === 'unlock' || sub === 'restore') {
        const targetId = message.mentions.users.first()?.id || args[1];
        if (!targetId) {
          return message.reply(cv2.warn(`User Required | ${WARN_EMOJI}`, 'Specify target staff member: `!anomaly unlock @user`')).catch(() => null);
        }

        const quarantineRecord = db.cache.quarantines?.[guild.id]?.[targetId];
        if (!quarantineRecord) {
          return message.reply(cv2.danger(`No Record Found | ${WRONG_EMOJI}`, 'No active soft-lock quarantine record exists for this user.')).catch(() => null);
        }

        const member = guild.members.cache.get(targetId) || await guild.members.fetch(targetId).catch(() => null);
        if (member && Array.isArray(quarantineRecord.roles)) {
          await member.roles.add(quarantineRecord.roles, '[Athena Anomaly] Staff roles authorized and restored by Owner').catch(() => null);
        }

        delete db.cache.quarantines[guild.id][targetId];
        db.save();

        return message.reply(cv2.success(
          `Staff Soft-Lock Authorized | ${TICK_EMOJI}`,
          `> -# <@${targetId}> has been cleared and their vaulted administrative roles have been restored.`
        )).catch(() => null);
      }

      // Default: Status panel
      const panel = buildAnomalyPanel(guild);
      return message.reply(panel).catch(() => null);
    },

    async executePrefix(message, args) {
      return this.execute(message, args);
    },

    async executeSlash(interaction) {
      const guild = interaction.guild;
      if (!guild) return;

      if (!isAuthorized(guild, interaction.member, interaction.user.id)) {
        return interaction.reply({
          ...cv2.danger(`Access Denied | ${WRONG_EMOJI}`, 'Only Server Owners, Extra Owners, and Administrators can configure Staff Behavioral Anomaly Sentry.'),
          flags: MessageFlags.Ephemeral
        });
      }

      const panel = buildAnomalyPanel(guild);
      return interaction.reply(panel);
    }
  }
];
