import { PermissionFlagsBits } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { isBotOwnerSync } from '../utils/helpers.js';

// In-memory timers so modmode auto-expires without polling
const modModeTimers = new Map(); // guildId -> setTimeout handle

/** Schedule auto-expiry of modmode */
export function scheduleModModeExpiry(client, guildId, durationMs) {
  const key = guildId;
  if (modModeTimers.has(key)) {
    clearTimeout(modModeTimers.get(key));
  }
  const handle = setTimeout(async () => {
    modModeTimers.delete(key);
    db.clearModMode(guildId);
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;
      const config = db.getGuildConfig(guildId);
      if (config.logChannelId) {
        const logCh = guild.channels.cache.get(config.logChannelId);
        if (logCh) {
          await logCh.send(cv2.warn(
            ' Modification Mode Expired',
            '⏰ Modification mode has automatically expired after 30 minutes.\n\n**Auto-restore is now active again** — unauthorized channel/role deletions will be restored.'
          )).catch(() => null);
        }
      }
    } catch { /* ignore */ }
  }, durationMs);
  modModeTimers.set(key, handle);
}

/** Stop modmode timer early */
export function cancelModModeTimer(guildId) {
  if (modModeTimers.has(guildId)) {
    clearTimeout(modModeTimers.get(guildId));
    modModeTimers.delete(guildId);
  }
}

export const commands = [
  {
    name: 'modmode',
    aliases: ['maintenancemode'],
    slashHidden: true,
    description: 'Pause auto-restore for server modifications. Max 30 minutes. (Owner only)',
    category: 'security',
    permissions: [],
    options: [
      {
        name: 'action',
        description: 'start or stop modification mode',
        type: 3,
        required: true,
        choices: [
          { name: 'start — pause auto-restore (max 30m)', value: 'start' },
          { name: 'stop — re-enable auto-restore now',    value: 'stop'  }
        ]
      }
    ],
    async executePrefix(message, args) {
      const isAuthorized = isBotOwnerSync(message.author.id) ||
        message.author.id === message.guild?.ownerId ||
        db.isExtraOwner(message.guild?.id, message.author.id);
      if (!isAuthorized) return;

      const action = args[0]?.toLowerCase();
      if (!action || !['start', 'stop'].includes(action)) {
        return message.reply(cv2.warn('Usage', '`!modmode start` or `!modmode stop`'));
      }
      const result = await handleModMode(message.guild, message.member, action, message.client);
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const isAuthorized = isBotOwnerSync(interaction.user.id) ||
        interaction.user.id === interaction.guild?.ownerId ||
        db.isExtraOwner(interaction.guild?.id, interaction.user.id);
      if (!isAuthorized) {
        return interaction.reply(cv2.danger('Access Denied', '️ Only Bot Owner, Server Owner, or Extra Owners can use Modification Mode.'));
      }

      const action = interaction.options.getString('action');
      const result = await handleModMode(interaction.guild, interaction.member, action, interaction.client);
      await interaction.reply(result);
    }
  }
];

async function handleModMode(guild, moderator, action, client) {
  if (action === 'start') {
    if (db.isModModeActive(guild.id)) {
      const mm = db.getModMode(guild.id);
      const remaining = Math.ceil((mm.expiresAt - Date.now()) / 60000);
      return cv2.warn('Already Active', ` Modification mode is already active.\n**Expires in:** \`${remaining} minute(s)\`\n\nUse \`/modmode stop\` to end it early.`);
    }

    const DURATION_MS = 30 * 60 * 1000; // fixed 30 minutes max
    const expiresAt = Date.now() + DURATION_MS;
    db.setModMode(guild.id, expiresAt, moderator.id);
    scheduleModModeExpiry(client, guild.id, DURATION_MS);

    return cv2.warn(
      ' Modification Mode ACTIVE',
      `Auto-restore of deleted channels/roles is **PAUSED for authorized maintenance actors** (**${moderator}**, Server Owner, Extra Owners) for **30 minutes**.\n\n` +
      `All unauthorized accounts or rogue bots remain under active 0ms Anti-Nuke protection and will still be banned and rolled back immediately.\n\n` +
      `**Auto-expires:** <t:${Math.floor(expiresAt / 1000)}:R>\n` +
      `Use \`/modmode stop\` to end it early.`,
      [
        { name: ' Started By', value: `${moderator}`, inline: true },
        { name: '⏰ Expires',    value: `<t:${Math.floor(expiresAt / 1000)}:F>`, inline: true }
      ]
    );
  }

  if (action === 'stop') {
    if (!db.isModModeActive(guild.id)) {
      return cv2.info('Not Active', 'Modification mode is not currently active.');
    }
    cancelModModeTimer(guild.id);
    db.clearModMode(guild.id);

    return cv2.success(
      ' Modification Mode STOPPED',
      `Auto-restore is now **active** again.\n\nAny unauthorized channel or role deletions will be automatically restored.`,
      [{ name: ' Stopped By', value: `${moderator}`, inline: true }]
    );
  }
}
