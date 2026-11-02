import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { 
  PermissionFlagsBits, 
  ButtonStyle, 
  MessageFlags 
} from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { areServerDmsEnabled, isExtraOwnerOrHigher } from '../utils/helpers.js';

/**
 * Builds the interactive Server DM Notification Matrix panel (Components V2)
 */
export function buildDmStatusPanel(guild, isEnabled) {
  const glyph = getRandomHeadingGlyph();
  const ON = '<:on:1533844867191406672>';
  const OFF = '<:off:1533844858983157851>';
  const statusEmoji = isEnabled ? ON : OFF;
  const statusText = isEnabled ? 'ACTIVE (DMs Enabled)' : 'DISABLED (All DMs Blocked)';
  const statusBadge = isEnabled ? TICK_EMOJI : WRONG_EMOJI;

  const container = {
    type: 17,
    accent_color: isEnabled ? 0x00FF88 : 0xFF2A4B,
    components: [
      {
        type: 10,
        content: `# ${glyph} Server DM Notifications | ${statusBadge}`
      },
      {
        type: 10,
        content: `Manage whether Athena dispatches automated direct messages (DMs) to members of **${guild.name}** for moderation actions, security strikes, automod warnings, and server greetings.`
      },
      {
        type: 14,
        divider: true
      },
      {
        type: 10,
        content: `### Configuration Status:\n` +
          `> ${BULLET_EMOJI} **Operational State:** ${statusEmoji} \`${statusText}\`\n` +
          `> ${BULLET_EMOJI} **Moderation Actions (Warn, Timeout, Kick, Ban):** \`${isEnabled ? 'DISPATCHING' : 'MUTED / BLOCKED'}\`\n` +
          `> ${BULLET_EMOJI} **Security Enforcements (Quarantine, Strikes):** \`${isEnabled ? 'DISPATCHING' : 'MUTED / BLOCKED'}\`\n` +
          `> ${BULLET_EMOJI} **Automod Warnings (Filters, Spams, Invites):** \`${isEnabled ? 'DISPATCHING' : 'MUTED / BLOCKED'}\`\n` +
          `> ${BULLET_EMOJI} **Server Greetings (Welcome & Leave DMs):** \`${isEnabled ? 'DISPATCHING' : 'MUTED / BLOCKED'}\``
      },
      {
        type: 14,
        divider: true
      },
      {
        type: 1,
        components: [
          {
            type: 2,
            style: isEnabled ? ButtonStyle.Danger : ButtonStyle.Success,
            label: isEnabled ? 'Turn Off All DMs' : 'Re-Enable All DMs',
            custom_id: 'dm_toggle',
            emoji: { id: isEnabled ? '1533844858983157851' : '1533844867191406672' }
          }
        ]
      },
      {
        type: 14,
        divider: true
      },
      {
        type: 10,
        content: `-# **Athena Bulletproof Defense Matrix • V1.0.0**`
      }
    ]
  };

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}

/**
 * Builds the confirmation card for enabling or disabling DMs
 */
export function buildDmToggleResponse(guild, enable) {
  const glyph = getRandomHeadingGlyph();
  const badge = enable ? TICK_EMOJI : TICK_EMOJI;

  const content = enable
    ? `All automated direct message (DM) notifications from Athena to users of **${guild.name}** have been **re-enabled**.\n\n` +
      `> ${BULLET_EMOJI} **Moderation Actions:** Members will receive formal notices upon warns, timeouts, kicks, and bans.\n` +
      `> ${BULLET_EMOJI} **Security Enforcements:** Quarantined members will receive their case instructions in DM.\n` +
      `> ${BULLET_EMOJI} **Server Greetings:** Active welcome/leave DMs will be dispatched to joining/leaving members.\n` +
      `> ${BULLET_EMOJI} **Automod Warnings:** Members will be alerted when violating word or spam filters.\n\n` +
      `-# To turn off DM notifications at any time, run \`!dm off\` or \`/dm action:disable\`.`
    : `All automated direct message (DM) notifications from Athena to users of **${guild.name}** have been **turned off**.\n\n` +
      `> ${BULLET_EMOJI} **Moderation Actions:** Warns, timeouts, kicks, and bans will no longer DM members.\n` +
      `> ${BULLET_EMOJI} **Security Enforcements:** Quarantine, blacklist, and antinuke strike alerts will remain silent.\n` +
      `> ${BULLET_EMOJI} **Server Greetings:** Welcome and farewell direct messages are disabled.\n` +
      `> ${BULLET_EMOJI} **Automod Warnings:** Filter violations and spam warnings will not DM users.\n\n` +
      `-# To re-enable DM notifications at any time, run \`!dm on\` or \`/dm action:enable\`.`;

  const container = {
    type: 17,
    accent_color: enable ? 0x00FF88 : 0xFF2A4B,
    components: [
      {
        type: 10,
        content: `# ${glyph} Server DMs ${enable ? 'Enabled' : 'Disabled'} | ${badge}`
      },
      {
        type: 10,
        content: content
      },
      {
        type: 14,
        divider: true
      },
      {
        type: 10,
        content: `-# **Athena Bulletproof Defense Matrix • V1.0.0**`
      }
    ]
  };

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}

export const commands = [
  {
    name: 'dm',
    description: 'Turn off or re-enable all Athena automated DM notifications to users of this server.',
    category: 'security',
    aliases: ['dms', 'toggledm', 'serverdm', 'dmnotifs', 'dmnotifications'],
    permissions: [PermissionFlagsBits.ManageGuild],
    options: [
      {
        name: 'action',
        description: 'Action to perform: disable, enable, or view status',
        type: 3,
        required: false,
        choices: [
          { name: 'Turn Off All DMs (disable)', value: 'disable' },
          { name: 'Re-Enable All DMs (enable)', value: 'enable' },
          { name: 'View Status (panel)', value: 'status' }
        ]
      }
    ],

    async executePrefix(message, args) {
      const guild = message.guild;
      if (!guild) return;

      const sub = (args[0] || '').toLowerCase();

      if (sub === 'off' || sub === 'disable' || sub === 'mute' || sub === 'stop') {
        db.updateGuildConfig(guild.id, { dmNotificationsEnabled: false, dmsEnabled: false });
        const res = buildDmToggleResponse(guild, false);
        return message.channel.send(res);
      }

      if (sub === 'on' || sub === 'enable' || sub === 'unmute' || sub === 'start') {
        db.updateGuildConfig(guild.id, { dmNotificationsEnabled: true, dmsEnabled: true });
        const res = buildDmToggleResponse(guild, true);
        return message.channel.send(res);
      }

      // Default: Status panel with 1-click button
      const isEnabled = areServerDmsEnabled(guild.id);
      const panel = buildDmStatusPanel(guild, isEnabled);
      return message.channel.send(panel);
    },

    async executeSlash(interaction) {
      const guild = interaction.guild;
      if (!guild) return;

      const action = interaction.options.getString('action');

      if (action === 'disable' || action === 'off') {
        db.updateGuildConfig(guild.id, { dmNotificationsEnabled: false, dmsEnabled: false });
        const res = buildDmToggleResponse(guild, false);
        return interaction.reply(res);
      }

      if (action === 'enable' || action === 'on') {
        db.updateGuildConfig(guild.id, { dmNotificationsEnabled: true, dmsEnabled: true });
        const res = buildDmToggleResponse(guild, true);
        return interaction.reply(res);
      }

      // Default: Status panel
      const isEnabled = areServerDmsEnabled(guild.id);
      const panel = buildDmStatusPanel(guild, isEnabled);
      return interaction.reply(panel);
    }
  }
];

/**
 * Handles interactive button clicks for dm_* buttons
 */
export async function handleDmInteraction(interaction) {
  const guild = interaction.guild;
  if (!guild) return;

  // Permission check
  const member = interaction.member;
  if (!isExtraOwnerOrHigher(interaction.user.id, guild) && !member?.permissions?.has(PermissionFlagsBits.ManageGuild) && !member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      ...cv2.asEphemeral(cv2.danger('Unauthorized', 'You need **Extra Owner** or Administrator clearance to toggle server DM parameters.')),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    });
  }

  const customId = interaction.customId;

  if (customId === 'dm_toggle') {
    const currentState = areServerDmsEnabled(guild.id);
    const newState = !currentState;
    db.updateGuildConfig(guild.id, { dmNotificationsEnabled: newState, dmsEnabled: newState });
    const panel = buildDmStatusPanel(guild, newState);
    return interaction.update(panel);
  }
}

export default commands;
