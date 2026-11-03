import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI, NINJA_BULLET, NINJA_BULLET_RTL } from '../utils/emojis.js';
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
  const statusText = isEnabled ? 'ACTIVE (Mention DMs Enabled)' : 'DISABLED (Mention DMs Blocked)';
  const statusBadge = isEnabled ? TICK_EMOJI : WRONG_EMOJI;

  const headingContent = Math.random() < 0.35 
    ? `# ${NINJA_BULLET} Athena Mention DM Notifications ${NINJA_BULLET_RTL} | ${statusBadge}`
    : `# ${glyph} Athena Mention DM Notifications | ${statusBadge}`;

  const container = {
    type: 17,
    accent_color: isEnabled ? 0x00FF88 : 0xFF2A4B,
    components: [
      {
        type: 10,
        content: headingContent
      },
      {
        type: 10,
        content: `Manage whether Athena dispatches automated direct message (DM) ping alerts to members of **${guild.name}** whenever they are tagged or mentioned in server chat channels.`
      },
      {
        type: 14,
        divider: true
      },
      {
        type: 10,
        content: `### Configuration Status:\n` +
          `> ${BULLET_EMOJI} **Operational State:** ${statusEmoji} \`${statusText}\`\n` +
          `> ${BULLET_EMOJI} **Mention & Tag DM Alerts:** \`${isEnabled ? 'DISPATCHING (Members receive DM pings when tagged)' : 'MUTED / BLOCKED (No DM alerts dispatched on tag)'}\`\n` +
          `> ${BULLET_EMOJI} **Official Moderation Notices (Warns, Timeouts, Bans):** \`ACTIVE & PROTECTED (Unaffected)\`\n` +
          `> ${BULLET_EMOJI} **Security & Antinuke Strikes:** \`ACTIVE & PROTECTED\``
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
            label: isEnabled ? 'Turn Off Mention DMs' : 'Re-Enable Mention DMs',
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
 * Builds the confirmation card for enabling or disabling mention DMs
 */
export function buildDmToggleResponse(guild, enable) {
  const glyph = getRandomHeadingGlyph();
  const badge = enable ? TICK_EMOJI : TICK_EMOJI;

  const content = enable
    ? `Athena tag and mention direct message (DM) notifications for **${guild.name}** have been **re-enabled**.\n\n` +
      `> ${BULLET_EMOJI} **Mention Alerts:** Members will receive Athena DM notifications when tagged in server channels.\n` +
      `> ${BULLET_EMOJI} **Moderation Notices:** Warns, timeouts, kicks, and bans remain active and protected.\n\n` +
      `-# To turn off mention DM notifications at any time, run \`!dm off\` or \`/dm action:disable\`.`
    : `Athena tag and mention direct message (DM) notifications for **${guild.name}** have been **turned off**.\n\n` +
      `> ${BULLET_EMOJI} **Mention Alerts:** Athena will no longer DM members when they are tagged in server channels.\n` +
      `> ${BULLET_EMOJI} **Moderation Notices:** Official moderation notices (warns, timeouts, kicks, and bans) remain active and protected.\n\n` +
      `-# To re-enable mention DM notifications at any time, run \`!dm on\` or \`/dm action:enable\`.`;

  const headingContent = Math.random() < 0.35
    ? `# ${NINJA_BULLET} Mention DMs ${enable ? 'Enabled' : 'Disabled'} ${NINJA_BULLET_RTL} | ${badge}`
    : `# ${glyph} Mention DMs ${enable ? 'Enabled' : 'Disabled'} | ${badge}`;

  const container = {
    type: 17,
    accent_color: enable ? 0x00FF88 : 0xFF2A4B,
    components: [
      {
        type: 10,
        content: headingContent
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
    description: 'Turn off or re-enable Athena DM notifications when users are tagged in chat.',
    category: 'security',
    aliases: ['dms', 'toggledm', 'serverdm', 'dmnotifs', 'dmnotifications', 'pingnotif', 'tagnotif', 'pingdm'],
    permissions: [PermissionFlagsBits.ManageGuild],
    options: [
      {
        name: 'action',
        description: 'Action to perform: disable, enable, or view status',
        type: 3,
        required: false,
        choices: [
          { name: 'Turn Off Mention DMs (disable)', value: 'disable' },
          { name: 'Re-Enable Mention DMs (enable)', value: 'enable' },
          { name: 'View Status (panel)', value: 'status' }
        ]
      }
    ],

    async executePrefix(message, args) {
      const guild = message.guild;
      if (!guild) return;

      const sub = (args[0] || '').toLowerCase();

      if (sub === 'off' || sub === 'disable' || sub === 'mute' || sub === 'stop') {
        db.setTagDmEnabled(guild.id, false);
        const res = buildDmToggleResponse(guild, false);
        return message.channel.send(res);
      }

      if (sub === 'on' || sub === 'enable' || sub === 'unmute' || sub === 'start') {
        db.setTagDmEnabled(guild.id, true);
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
        db.setTagDmEnabled(guild.id, false);
        const res = buildDmToggleResponse(guild, false);
        return interaction.reply(res);
      }

      if (action === 'enable' || action === 'on') {
        db.setTagDmEnabled(guild.id, true);
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
    db.setTagDmEnabled(guild.id, newState);
    const panel = buildDmStatusPanel(guild, newState);
    return interaction.update(panel);
  }
}

export default commands;
