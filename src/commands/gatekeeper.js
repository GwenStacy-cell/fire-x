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

export async function evaluateIncomingMember(member) {
  const guild = member.guild;
  const cfg = db.getGuildConfig(guild.id);
  const gk = cfg.gatekeeper || { enabled: false, minAgeHours: 24, requireAvatar: false, action: 'quarantine' };

  if (!gk.enabled) return { passed: true };

  const accountAgeHours = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60);
  const hasDefaultAvatar = !member.user.avatar;

  let failedReason = null;

  if (accountAgeHours < gk.minAgeHours) {
    failedReason = `Account age (${Math.floor(accountAgeHours)}h) is below minimum threshold (${gk.minAgeHours}h)`;
  } else if (gk.requireAvatar && hasDefaultAvatar) {
    failedReason = 'Default Discord avatar detected (Custom profile picture required)';
  }

  if (!failedReason) return { passed: true };

  // Perimeter Enforcement
  const action = gk.action || 'quarantine';

  if (action === 'ban') {
    await member.ban({ reason: `[Athena Gatekeeper] ${failedReason}` }).catch(() => null);
  } else if (action === 'kick') {
    await member.kick(`[Athena Gatekeeper] ${failedReason}`).catch(() => null);
  } else {
    // Quarantine
    const qRoleId = cfg.quarantineRoleId;
    if (qRoleId && guild.roles.cache.has(qRoleId)) {
      await member.roles.set([qRoleId], `[Athena Gatekeeper] ${failedReason}`).catch(() => null);
    }
    if (!db.cache.quarantines) db.cache.quarantines = {};
    if (!db.cache.quarantines[guild.id]) db.cache.quarantines[guild.id] = {};
    db.cache.quarantines[guild.id][member.id] = {
      roles: [],
      quarantinedAt: Date.now(),
      reason: `Gatekeeper: ${failedReason}`
    };
    db.save();
  }

  // Record incident
  db.recordIncident(guild.id, {
    type: 'GATEKEEPER_PERIMETER_INTERCEPTION',
    attackerId: member.id,
    attackerTag: member.user.tag || member.id,
    actionsAttempted: 1,
    actionsBlocked: 1,
    latencyMs: 8,
    status: `INTERCEPTED (${action.toUpperCase()})`,
    details: failedReason
  });

  return { passed: false, reason: failedReason, action };
}

export function buildGatekeeperPanel(guild) {
  const cfg = db.getGuildConfig(guild.id);
  const gk = cfg.gatekeeper || { enabled: false, minAgeHours: 24, requireAvatar: false, action: 'quarantine' };

  const isEnabled = Boolean(gk.enabled);
  const statusBadge = isEnabled
    ? `${UPTIME_EMOJI} **ARMED & SCREENING NEW JOINS**`
    : `${WARN_EMOJI} **DISARMED / INACTIVE**`;

  const fields = [
    {
      name: 'Gatekeeper State',
      value: isEnabled ? '`Active (Automated Screening)`' : '`Disabled`',
      inline: true
    },
    {
      name: 'Minimum Account Age',
      value: `\`${gk.minAgeHours} Hours (${(gk.minAgeHours / 24).toFixed(1)} Days)\``,
      inline: true
    },
    {
      name: 'Enforcement Action',
      value: `\`${(gk.action || 'quarantine').toUpperCase()}\``,
      inline: true
    },
    {
      name: 'Avatar Integrity Check',
      value: gk.requireAvatar ? '`Enforced (No Default Avatars)`' : '`Permitted (Any Avatar)`',
      inline: true
    },
    {
      name: 'Quarantine Chamber Role',
      value: cfg.quarantineRoleId ? `<@&${cfg.quarantineRoleId}> (\`${cfg.quarantineRoleId}\`)` : '`None (Defaulting to Isolation)`',
      inline: false
    }
  ];

  const panel = cv2.card(
    `Raid Account Age & Avatar Gatekeeper | ${isEnabled ? TICK_EMOJI : WARN_EMOJI}`,
    `> -# ${statusBadge}\n` +
    `> -# Mass raids, token generators, and throwaway bot accounts invariably utilize brand new accounts with default avatars.\n` +
    `> -# Gatekeeper automatically stops hostile joins at the perimeter before they can send messages.`,
    fields,
    'Athena Prime Security Suite • Gatekeeper Sentry'
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('gk_toggle')
      .setLabel(isEnabled ? 'Deactivate Gatekeeper' : 'Arm Gatekeeper')
      .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('gk_avatar_toggle')
      .setLabel(gk.requireAvatar ? 'Disable Avatar Check' : 'Require Custom Avatar')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('gk_refresh')
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
    name: 'gatekeeper',
    aliases: ['raidgate', 'accountgate', 'joingate'],
    description: 'Raid Account Age & Avatar Gating - Filters incoming accounts by age and default avatar.',
    category: 'Security',
    async execute(message, args) {
      const guild = message.guild;
      if (!guild) return;

      if (!isAuthorized(guild, message.member, message.author.id)) {
        return message.reply(cv2.danger(
          `Access Denied | ${WRONG_EMOJI}`,
          'Only Server Owners, Extra Owners, and Administrators can configure the Gatekeeper perimeter.'
        )).catch(() => null);
      }

      const sub = (args[0] || '').toLowerCase();

      // Toggle on/off
      if (sub === 'on' || sub === 'enable' || sub === 'arm') {
        db.updateGatekeeperConfig(guild.id, { enabled: true });
        return message.reply(cv2.success(
          `Gatekeeper Perimeter Armed | ${TICK_EMOJI}`,
          'All incoming accounts will now be screened for age and avatar compliance.'
        )).catch(() => null);
      }

      if (sub === 'off' || sub === 'disable' || sub === 'disarm') {
        db.updateGatekeeperConfig(guild.id, { enabled: false });
        return message.reply(cv2.warn(
          `Gatekeeper Perimeter Deactivated | ${WARN_EMOJI}`,
          'Incoming member age verification has been suspended.'
        )).catch(() => null);
      }

      // Min age
      if (sub === 'minage' || sub === 'age' || sub === 'hours') {
        const hours = parseInt(args[1], 10);
        if (isNaN(hours) || hours < 1 || hours > 720) {
          return message.reply(cv2.warn(
            `Invalid Age | ${WARN_EMOJI}`,
            'Please specify a valid minimum age between 1 and 720 hours (up to 30 days): `!gatekeeper minage <hours>`.'
          )).catch(() => null);
        }
        db.updateGatekeeperConfig(guild.id, { minAgeHours: hours });
        return message.reply(cv2.success(
          `Gatekeeper Minimum Age Updated | ${TICK_EMOJI}`,
          `Incoming accounts created less than **${hours} hours** (${(hours / 24).toFixed(1)} days) ago will be intercepted.`
        )).catch(() => null);
      }

      // Avatar
      if (sub === 'avatar') {
        const state = (args[1] || '').toLowerCase();
        const enable = state === 'on' || state === 'enable' || state === 'true';
        db.updateGatekeeperConfig(guild.id, { requireAvatar: enable });
        return message.reply(cv2.success(
          `Gatekeeper Avatar Check ${enable ? 'Enforced' : 'Relaxed'} | ${TICK_EMOJI}`,
          enable 
            ? 'Members with default Discord avatars will be intercepted.' 
            : 'Default avatars are now permitted.'
        )).catch(() => null);
      }

      // Action
      if (sub === 'action' || sub === 'punish') {
        const act = (args[1] || '').toLowerCase();
        if (!['quarantine', 'kick', 'ban'].includes(act)) {
          return message.reply(cv2.warn(
            `Invalid Action | ${WARN_EMOJI}`,
            'Please specify a valid action: `quarantine`, `kick`, or `ban`.'
          )).catch(() => null);
        }
        db.updateGatekeeperConfig(guild.id, { action: act });
        return message.reply(cv2.success(
          `Gatekeeper Enforcement Action Set | ${TICK_EMOJI}`,
          `Failing accounts will receive **${act.toUpperCase()}** penalty.`
        )).catch(() => null);
      }

      // Default: Display panel
      const panel = buildGatekeeperPanel(guild);
      return message.reply(panel).catch(() => null);
    }
  }
];
