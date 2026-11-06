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
  return false;
}

export function buildDualKeyAuthCard(action) {
  const fields = [
    {
      name: 'Action Identifier',
      value: `\`${action.id}\``,
      inline: true
    },
    {
      name: 'Protected Command',
      value: `\`!${action.commandName}\``,
      inline: true
    },
    {
      name: 'Initiating Commander',
      value: `<@${action.initiatorId}> (\`${action.initiatorTag || action.initiatorId}\`)`,
      inline: true
    },
    {
      name: 'Command Parameters',
      value: action.rawArgs && action.rawArgs.length > 0 ? `\`${action.rawArgs.join(' ')}\`` : '`None`',
      inline: true
    },
    {
      name: 'Authorization Window',
      value: `Expires <t:${Math.floor(action.expiresAt / 1000)}:R>`,
      inline: true
    },
    {
      name: 'Required Clearance',
      value: '`Secondary Server Owner or Extra Owner (Two-Man Rule)`',
      inline: false
    }
  ];

  const panel = cv2.card(
    `Dual-Key Nuclear Authorization Required | ${WARN_EMOJI}`,
    `> -# <a:uptime:1552608831060844575> **A high-impact destructive command has been placed on operational hold.**\n` +
    `> -# Under the Dual-Key Security Protocol, nuclear actions require confirmation from a **secondary authorized administrator**.\n` +
    `> -# The initiator cannot self-authorize this action.`,
    fields,
    'Athena Prime Security Suite • Dual-Key Nuclear Protocol'
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dualkey_auth_${action.id}`)
      .setLabel('Authorize Nuclear Action')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`dualkey_abort_${action.id}`)
      .setLabel('Abort Action')
      .setStyle(ButtonStyle.Danger)
  );

  return {
    ...panel,
    components: [...panel.components, row.toJSON()]
  };
}

export function buildDualKeyDashboard(guild) {
  const cfg = db.getGuildConfig(guild.id);
  const dk = cfg.dualKey || { enabled: false, protectedCommands: ['unbanall', 'emergency', 'wipeemojis', 'lockdown', 'nuke'] };

  const isEnabled = Boolean(dk.enabled);
  const statusBadge = isEnabled
    ? `${UPTIME_EMOJI} **DUAL-KEY TWO-MAN RULE ENFORCED**`
    : `${WARN_EMOJI} **DUAL-KEY PROTOCOL INACTIVE**`;

  const fields = [
    {
      name: 'Protocol Status',
      value: isEnabled ? '`Enforced (2 Signatures Required)`' : '`Disabled (Single Signature)`',
      inline: true
    },
    {
      name: 'Protected Commands',
      value: dk.protectedCommands.map(c => `\`!${c}\``).join('  \u00b7  '),
      inline: false
    },
    {
      name: 'Eligible Authorizers',
      value: '`Server Owner, Registered Extra Owners, Bot Owner`',
      inline: false
    }
  ];

  const panel = cv2.card(
    `Dual-Key Nuclear Authorization Matrix | ${isEnabled ? TICK_EMOJI : WARN_EMOJI}`,
    `> -# ${statusBadge}\n` +
    `> -# Prevents single-point-of-failure rogue actions. Commands that wipe emojis, execute emergency lockdown, or unban all members cannot be executed alone.\n` +
    `> -# Two distinct authorized identities must approve the execution within 5 minutes.`,
    fields,
    'Athena Prime Security Suite • Dual-Key Protocol'
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('dualkey_toggle')
      .setLabel(isEnabled ? 'Disable Dual-Key' : 'Enable Dual-Key Protocol')
      .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('dualkey_refresh')
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
    name: 'dualkey',
    aliases: ['twomanrule', 'nuclearauth', '2manrule'],
    description: 'Dual-Key Nuclear Authorizations - Two-man rule requiring secondary authorization before nuclear actions execute.',
    category: 'Security',
    async execute(message, args) {
      const guild = message.guild;
      if (!guild) return;

      if (!isAuthorized(guild, message.member, message.author.id)) {
        return message.reply(cv2.danger(
          `Access Denied | ${WRONG_EMOJI}`,
          'Only Server Owners, Extra Owners, and Bot Owners can configure the Dual-Key Protocol.'
        )).catch(() => null);
      }

      const sub = (args[0] || '').toLowerCase();

      // Toggle
      if (sub === 'toggle' || sub === 'on' || sub === 'off') {
        const cfg = db.getGuildConfig(guild.id);
        const currentState = Boolean(cfg.dualKey?.enabled);
        const newState = sub === 'toggle' ? !currentState : (sub === 'on');
        db.updateDualKeyConfig(guild.id, { enabled: newState });

        return message.reply(cv2.success(
          `Dual-Key Protocol ${newState ? 'Armed' : 'Deactivated'} | ${TICK_EMOJI}`,
          newState 
            ? 'Nuclear commands now require secondary authorization from a distinct Extra Owner before executing.' 
            : 'Dual-Key requirement suspended. Nuclear commands can execute with single signature.'
        )).catch(() => null);
      }

      // Authorize command via text
      if (sub === 'auth' || sub === 'authorize') {
        const actionId = args[1];
        if (!actionId) {
          return message.reply(cv2.warn(`Action ID Required | ${WARN_EMOJI}`, 'Specify the action identifier: `!dualkey auth <actionId>`')).catch(() => null);
        }

        const action = db.getPendingDualKey(actionId);
        if (!action || action.guildId !== guild.id) {
          return message.reply(cv2.danger(`Invalid Action | ${WRONG_EMOJI}`, 'No active pending authorization found for this ID.')).catch(() => null);
        }

        if (action.initiatorId === message.author.id && !isBotOwnerSync(message.author.id)) {
          return message.reply(cv2.danger(
            `Self-Authorization Prohibited | ${WRONG_EMOJI}`,
            'Two-man rule forbids self-authorization. A different Extra Owner or the Server Owner must sign this payload.'
          )).catch(() => null);
        }

        db.removePendingDualKey(actionId);

        return message.reply(cv2.success(
          `Nuclear Action Authorized | ${TICK_EMOJI}`,
          `> -# <@${message.author.id}> has provided secondary clearance for \`!${action.commandName}\`.\n` +
          `> -# Initiator <@${action.initiatorId}> may now execute the command, or re-run the action.`
        )).catch(() => null);
      }

      // Abort
      if (sub === 'abort' || sub === 'cancel') {
        const actionId = args[1];
        if (!actionId) {
          return message.reply(cv2.warn(`Action ID Required | ${WARN_EMOJI}`, 'Specify the action identifier: `!dualkey abort <actionId>`')).catch(() => null);
        }
        db.removePendingDualKey(actionId);
        return message.reply(cv2.success(
          `Nuclear Action Aborted | ${TICK_EMOJI}`,
          `Pending authorization \`${actionId}\` has been discarded.`
        )).catch(() => null);
      }

      // Default: Dashboard
      const panel = buildDualKeyDashboard(guild);
      return message.reply(panel).catch(() => null);
    }
  }
];
