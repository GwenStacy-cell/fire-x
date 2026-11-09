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
  if (member?.permissions?.has(PermissionFlagsBits.ManageWebhooks)) return true;
  if (member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  return false;
}

export async function executeDecapitationSweep(guild, executor) {
  const startTime = Date.now();
  const botMe = guild.members?.me || (guild.members?.fetchMe ? await guild.members.fetchMe().catch(() => null) : null) || (guild.client?.user?.id ? await guild.members?.fetch(guild.client.user.id).catch(() => null) : null);

  if (!botMe?.permissions?.has(PermissionFlagsBits.ManageWebhooks)) {
    return {
      success: false,
      error: 'Athena Prime requires the `Manage Webhooks` permission to audit and decapitate rogue webhooks.'
    };
  }

  // Fetch all guild webhooks in one REST call
  const webhooks = await guild.fetchWebhooks().catch(() => null);
  if (!webhooks) {
    return {
      success: false,
      error: 'Failed to query guild webhooks from Discord API gateway.'
    };
  }

  const clientUserId = guild.client.user.id;
  const cfg = db.getGuildConfig(guild.id);

  // Filter out authorized webhooks (e.g. created by Athena Prime itself)
  const webhookList = Array.isArray(webhooks) ? webhooks : Array.from(webhooks.values ? webhooks.values() : webhooks);
  const rogueHooks = webhookList.filter(hook => {
    // Keep webhooks owned by Athena Prime
    if (hook.owner?.id === clientUserId) return false;
    // Check whitelist if defined
    if (cfg?.whitelist?.users?.[hook.owner?.id]) return false;
    return true;
  });

  const targetCount = rogueHooks.length;
  const impactedChannels = new Set();
  rogueHooks.forEach(h => {
    if (h.channelId) impactedChannels.add(h.channelId);
  });

  // Parallel eradication: Wipe all rogue webhooks concurrently
  const deletionPromises = [];
  for (const hook of rogueHooks) {
    deletionPromises.push(
      hook.delete(`Athena Prime Decapitation Engine | Swept by ${executor.tag || executor.id}`)
        .catch(() => null)
    );
  }

  const results = await Promise.allSettled(deletionPromises);
  const eradicated = results.filter(r => r.status === 'fulfilled').length;
  const latencyMs = Date.now() - startTime;

  // Record into Staff pulse and incident log if malicious webhooks were eradicated
  if (eradicated > 0) {
    db.recordStaffAction(guild.id, executor.id, 'purges');
    db.recordIncident(guild.id, {
      type: 'ROGUE_WEBHOOK_DECAPITATION',
      attackerId: executor.id,
      attackerTag: executor.tag || executor.id,
      actionsAttempted: targetCount,
      actionsBlocked: eradicated,
      latencyMs,
      status: 'NEUTRALIZED',
      details: `Parallel sweep eradicated ${eradicated} rogue webhooks across ${impactedChannels.size} channels.`
    });
  }

  return {
    success: true,
    scanned: webhooks.size,
    eradicated,
    channelsCleansed: impactedChannels.size,
    latencyMs
  };
}

export const commands = [
  {
    name: 'decapitate',
    aliases: ['purgehooks', 'antiwebhook', 'wipehooks', 'hookpurge'],
    description: 'Malicious Webhook Decapitation Engine - Rapid parallel sweep and eradication of rogue webhooks.',
    category: 'Security',
    async execute(message, args) {
      const guild = message.guild;
      if (!guild) return;

      if (!isAuthorized(guild, message.member, message.author.id)) {
        return message.reply(cv2.danger(
          `Access Denied | ${WRONG_EMOJI}`,
          'Only Server Owners, Extra Owners, and Webhook Managers can initiate the Webhook Decapitation Engine.'
        )).catch(() => null);
      }

      const res = await executeDecapitationSweep(guild, message.author);
      if (!res.success) {
        return message.reply(cv2.danger(`Decapitation Aborted | ${WRONG_EMOJI}`, res.error)).catch(() => null);
      }

      const isClean = res.eradicated === 0;

      const fields = [
        {
          name: 'Total Webhooks Scanned',
          value: `\`${res.scanned} Endpoints\``,
          inline: true
        },
        {
          name: 'Rogue Webhooks Eradicated',
          value: `\`${res.eradicated} Purged\``,
          inline: true
        },
        {
          name: 'Purge Latency',
          value: `\`${res.latencyMs}ms (Sub-Wire Parallel)\``,
          inline: true
        },
        {
          name: 'Channels Purified',
          value: `\`${res.channelsCleansed} Channels\``,
          inline: true
        },
        {
          name: 'Perimeter State',
          value: isClean ? '`No Malicious Webhooks Detected`' : '`All Rogue Endpoints Obliterated`',
          inline: false
        }
      ];

      const panel = cv2.card(
        `Webhook Decapitation Complete | ${TICK_EMOJI}`,
        `> -# <a:uptime:1552608831060844575> **Perimeter Integrity Restored.**\n` +
        `> -# Rogue Discord webhooks represent one of the most critical zero-day raid vectors.\n` +
        `> -# The Decapitation Engine concurrently swept the Discord REST gateway and excised unauthorized endpoints.`,
        fields,
        'Athena Prime Security Suite • Decapitation Engine'
      );

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
          ...cv2.danger(`Access Denied | ${WRONG_EMOJI}`, 'Only Server Owners, Extra Owners, and Webhook Managers can initiate the Webhook Decapitation Engine.'),
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply();
      const res = await executeDecapitationSweep(guild, interaction.user);
      if (!res.success) {
        return interaction.editReply(cv2.danger(`Decapitation Aborted | ${WRONG_EMOJI}`, res.error));
      }

      const isClean = res.eradicated === 0;

      const fields = [
        {
          name: 'Total Webhooks Scanned',
          value: `\`${res.scanned} Endpoints\``,
          inline: true
        },
        {
          name: 'Rogue Webhooks Eradicated',
          value: `\`${res.eradicated} Purged\``,
          inline: true
        },
        {
          name: 'Purge Latency',
          value: `\`${res.latencyMs}ms (Sub-Wire Parallel)\``,
          inline: true
        },
        {
          name: 'Channels Purified',
          value: `\`${res.channelsCleansed} Channels\``,
          inline: true
        },
        {
          name: 'Perimeter State',
          value: isClean ? '`No Malicious Webhooks Detected`' : '`All Rogue Endpoints Obliterated`',
          inline: false
        }
      ];

      const panel = cv2.card(
        `Webhook Decapitation Complete | ${TICK_EMOJI}`,
        `> -# <a:uptime:1552608831060844575> **Perimeter Integrity Restored.**\n` +
        `> -# Rogue Discord webhooks represent one of the most critical zero-day raid vectors.\n` +
        `> -# The Decapitation Engine concurrently swept the Discord REST gateway and excised unauthorized endpoints.`,
        fields,
        'Athena Prime Security Suite • Decapitation Engine'
      );

      return interaction.editReply(panel);
    }
  }
];
