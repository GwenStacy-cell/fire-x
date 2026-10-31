import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  MessageFlags 
} from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { 
  dispatchMorningMessage, 
  buildMorningPayload, 
  getRandomThought, 
  getResolvedMorningChannel 
} from '../utils/morningEngine.js';

/**
 * Builds the interactive Morning Broadcaster Control Panel (Components V2)
 */
export function buildMorningPanel(guild, config) {
  const isEnabled = !!config.enabled;
  const channelDisplay = config.channelId 
    ? `<#${config.channelId}> (\`${config.channelId}\`)`
    : `\`Auto-Detect\` ${BULLET_EMOJI} Text channel where most members chat`;

  const pingDisplay = config.ping === 'here'
    ? '`@here`'
    : (config.ping && config.ping !== 'none' ? `<@&${config.ping}>` : '`None`');

  let schedDisplay = '`Pending calculation...`';
  if (config.scheduledTimeToday) {
    const s = config.scheduledTimeToday;
    const hour12 = s.hour % 12 || 12;
    const ampm = s.hour >= 12 ? 'PM' : 'AM';
    schedDisplay = `\`${String(hour12).padStart(2, '0')}:${String(s.minute).padStart(2, '0')} ${ampm}\` (Varies randomly every morning)`;
  }

  const lastSent = config.lastSentDate 
    ? `\`${config.lastSentDate}\`` 
    : '`Not sent yet`';

  const customCount = Array.isArray(config.customQuotes) ? config.customQuotes.length : 0;

  const glyph = getRandomHeadingGlyph();

  const container = {
    type: 17,
    accent_color: 0x5865F2,
    components: [
      {
        type: 10,
        content: `# ${glyph} Morning Thought Dispatcher | ${isEnabled ? TICK_EMOJI : WRONG_EMOJI}`
      },
      {
        type: 10,
        content: `Automatically dispatches pleasant, uplifting morning reflections and thoughts of the day to your active community channel at a distinct, randomized morning time every single day.`
      },
      {
        type: 14,
        divider: true
      },
      {
        type: 10,
        content: `### Configuration Status:\n` +
          `> ${BULLET_EMOJI} **Operational Status:** \`${isEnabled ? 'ACTIVE (Enabled)' : 'INACTIVE (Disabled)'}\`\n` +
          `> ${BULLET_EMOJI} **Target Channel:** ${channelDisplay}\n` +
          `> ${BULLET_EMOJI} **Today's Scheduled Time:** ${schedDisplay}\n` +
          `> ${BULLET_EMOJI} **Notification Ping:** ${pingDisplay}\n` +
          `> ${BULLET_EMOJI} **Timezone:** \`${config.timezone || 'Asia/Kolkata'}\`\n` +
          `> ${BULLET_EMOJI} **Thought Library:** \`60+ Curated\` | \`${customCount} Custom Server Quotes\`\n` +
          `> ${BULLET_EMOJI} **Last Dispatched:** ${lastSent}`
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
            label: isEnabled ? 'Disable Dispatcher' : 'Enable Dispatcher',
            custom_id: 'mrn_toggle'
          },
          {
            type: 2,
            style: ButtonStyle.Primary,
            label: 'Set Channel',
            custom_id: 'mrn_channel'
          },
          {
            type: 2,
            style: ButtonStyle.Secondary,
            label: 'Auto Detect Chat',
            custom_id: 'mrn_auto'
          },
          {
            type: 2,
            style: ButtonStyle.Secondary,
            label: 'Cycle Ping Mode',
            custom_id: 'mrn_ping'
          },
          {
            type: 2,
            style: ButtonStyle.Secondary,
            label: 'Test Send Live',
            custom_id: 'mrn_test'
          }
        ]
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
    name: 'morning',
    description: 'Configure and manage automatic random morning thought messages.',
    category: 'utility',
    aliases: ['goodmorning', 'dailythought', 'thoughtoftheday'],
    permissions: [PermissionFlagsBits.ManageGuild],
    options: [
      {
        name: 'panel',
        description: 'Open the interactive morning message control panel.',
        type: 1
      },
      {
        name: 'enable',
        description: 'Enable the morning message broadcaster.',
        type: 1
      },
      {
        name: 'disable',
        description: 'Disable the morning message broadcaster.',
        type: 1
      },
      {
        name: 'channel',
        description: 'Set a specific channel for morning messages.',
        type: 1,
        options: [
          {
            name: 'target',
            description: 'The text channel to send morning messages in.',
            type: 7,
            required: true
          }
        ]
      },
      {
        name: 'auto',
        description: 'Set the bot to automatically post in the most active chat channel.',
        type: 1
      },
      {
        name: 'ping',
        description: 'Set ping mode for morning messages (none or here).',
        type: 1,
        options: [
          {
            name: 'mode',
            description: 'Ping mode',
            type: 3,
            required: true,
            choices: [
              { name: 'No Ping', value: 'none' },
              { name: '@here', value: 'here' }
            ]
          }
        ]
      },
      {
        name: 'test',
        description: 'Immediately dispatch a test morning thought card.',
        type: 1
      },
      {
        name: 'add',
        description: 'Add a custom pleasant thought or quote to your server.',
        type: 1,
        options: [
          {
            name: 'quote',
            description: 'The inspirational or pleasant thought text.',
            type: 3,
            required: true
          }
        ]
      }
    ],

    async executePrefix(message, args) {
      const guild = message.guild;
      if (!guild) return;

      const sub = (args[0] || '').toLowerCase();
      const config = db.getMorningConfig(guild.id);

      if (!sub || sub === 'panel' || sub === 'config' || sub === 'menu') {
        const panel = buildMorningPanel(guild, config);
        return message.channel.send(panel);
      }

      if (sub === 'enable' || sub === 'on') {
        db.updateMorningConfig(guild.id, { enabled: true });
        const updated = db.getMorningConfig(guild.id);
        const glyph = getRandomHeadingGlyph();
        return message.channel.send({
          ...cv2.success(
            `${glyph} Morning Dispatcher Enabled | ${TICK_EMOJI}`,
            `Morning thoughts will automatically dispatch each day at a random morning time.\n` +
            `> ${BULLET_EMOJI} **Channel:** ${updated.channelId ? `<#${updated.channelId}>` : '`Auto-Detect (Most active chat)`'}\n` +
            `> ${BULLET_EMOJI} **Notification:** \`${updated.ping === 'here' ? '@here' : 'None'}\``
          ),
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'disable' || sub === 'off') {
        db.updateMorningConfig(guild.id, { enabled: false });
        const glyph = getRandomHeadingGlyph();
        return message.channel.send({
          ...cv2.warn(
            `${glyph} Morning Dispatcher Disabled | ${WARN_EMOJI}`,
            `Automatic morning thought messages are now disabled for **${guild.name}**.`
          ),
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'channel' || sub === 'setchannel') {
        const channelMention = message.mentions.channels.first();
        const rawId = args[1]?.replace(/[^0-9]/g, '');
        const targetChan = channelMention || (rawId ? (guild.channels.cache.get(rawId) || await guild.channels.fetch(rawId).catch(() => null)) : null);

        if (!targetChan || !targetChan.isTextBased()) {
          const glyph = getRandomHeadingGlyph();
          return message.channel.send({
            ...cv2.danger(
              `${glyph} Invalid Channel | ${WRONG_EMOJI}`,
              `Please provide a valid text channel mention or ID.\n> **Usage:** \`!morning channel #general\``
            ),
            flags: MessageFlags.IsComponentsV2
          });
        }

        db.updateMorningConfig(guild.id, { channelId: targetChan.id, enabled: true });
        const glyph = getRandomHeadingGlyph();
        return message.channel.send({
          ...cv2.success(
            `${glyph} Morning Channel Configured | ${TICK_EMOJI}`,
            `Morning thought messages will now be sent to <#${targetChan.id}> (\`${targetChan.id}\`).`
          ),
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'auto') {
        db.updateMorningConfig(guild.id, { channelId: null, enabled: true });
        const glyph = getRandomHeadingGlyph();
        return message.channel.send({
          ...cv2.success(
            `${glyph} Auto-Detection Mode Enabled | ${TICK_EMOJI}`,
            `Athena will dynamically detect the text channel where members chat the most and dispatch the morning reflection there!`
          ),
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'ping') {
        const mode = (args[1] || '').toLowerCase();
        let newPing = 'none';
        if (mode === 'here' || mode === '@here') newPing = 'here';
        else if (mode === 'none' || mode === 'off') newPing = 'none';
        else {
          const roleMention = message.mentions.roles.first() || (args[1]?.replace(/[^0-9]/g, '') ? guild.roles.cache.get(args[1].replace(/[^0-9]/g, '')) : null);
          if (roleMention) newPing = roleMention.id;
        }

        db.updateMorningConfig(guild.id, { ping: newPing });
        const glyph = getRandomHeadingGlyph();
        return message.channel.send({
          ...cv2.success(
            `${glyph} Morning Ping Updated | ${TICK_EMOJI}`,
            `Notification ping set to: \`${newPing === 'here' ? '@here' : (newPing !== 'none' ? '@Role' : 'None')}\``
          ),
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'test') {
        const glyph = getRandomHeadingGlyph();
        const statusMsg = await message.channel.send({
          ...cv2.warn(`${glyph} Dispatching Test Morning Message | ${WARN_EMOJI}`, 'Resolving target channel and compiling card...'),
          flags: MessageFlags.IsComponentsV2
        });

        const result = await dispatchMorningMessage(guild, message.client, true);
        if (result.success) {
          return statusMsg.edit({
            ...cv2.success(
              `${glyph} Test Morning Message Sent | ${TICK_EMOJI}`,
              `Successfully dispatched live pleasant morning thought to <#${result.channelId}>!`
            ),
            flags: MessageFlags.IsComponentsV2
          });
        } else {
          return statusMsg.edit({
            ...cv2.danger(
              `${glyph} Test Dispatch Failed | ${WRONG_EMOJI}`,
              `Could not send morning thought: \`${result.reason}\``
            ),
            flags: MessageFlags.IsComponentsV2
          });
        }
      }

      if (sub === 'add') {
        const quoteText = args.slice(1).join(' ').trim();
        if (!quoteText) {
          const glyph = getRandomHeadingGlyph();
          return message.channel.send({
            ...cv2.danger(
              `${glyph} Missing Quote Text | ${WRONG_EMOJI}`,
              `Please provide the thought text to add.\n> **Example:** \`!morning add If you lost everything one day, just know how to restart everything\``
            ),
            flags: MessageFlags.IsComponentsV2
          });
        }

        const custom = Array.isArray(config.customQuotes) ? [...config.customQuotes] : [];
        custom.push(quoteText);
        db.updateMorningConfig(guild.id, { customQuotes: custom });

        const glyph = getRandomHeadingGlyph();
        return message.channel.send({
          ...cv2.success(
            `${glyph} Custom Thought Added | ${TICK_EMOJI}`,
            `Added custom quote to rotation:\n> *"${quoteText}"*\n> Total custom quotes: \`${custom.length}\``
          ),
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'list') {
        const custom = Array.isArray(config.customQuotes) ? config.customQuotes : [];
        const glyph = getRandomHeadingGlyph();
        if (custom.length === 0) {
          return message.channel.send({
            ...cv2.warn(
              `${glyph} Custom Thought Library | ${WARN_EMOJI}`,
              `Your server currently has no custom quotes. Running purely on the **60+ Curated Positive Thoughts**.\nUse \`!morning add <text>\` to add your own!`
            ),
            flags: MessageFlags.IsComponentsV2
          });
        }

        const listStr = custom.map((q, i) => `> **${i + 1}.** *"${q}"*`).join('\n');
        return message.channel.send({
          ...cv2.success(
            `${glyph} Custom Server Thoughts | ${TICK_EMOJI}`,
            `**${custom.length} Custom Thoughts Configured:**\n${listStr}`
          ),
          flags: MessageFlags.IsComponentsV2
        });
      }

      // Default fallback
      const panel = buildMorningPanel(guild, config);
      return message.channel.send(panel);
    },

    async executeSlash(interaction) {
      const guild = interaction.guild;
      if (!guild) return;

      const sub = interaction.options.getSubcommand() || 'panel';
      const config = db.getMorningConfig(guild.id);

      if (sub === 'panel') {
        const panel = buildMorningPanel(guild, config);
        return interaction.reply(panel);
      }

      if (sub === 'enable') {
        db.updateMorningConfig(guild.id, { enabled: true });
        const glyph = getRandomHeadingGlyph();
        return interaction.reply({
          ...cv2.success(
            `${glyph} Morning Dispatcher Enabled | ${TICK_EMOJI}`,
            `Morning reflections will dispatch every day at a randomized morning time for this server.`
          ),
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'disable') {
        db.updateMorningConfig(guild.id, { enabled: false });
        const glyph = getRandomHeadingGlyph();
        return interaction.reply({
          ...cv2.warn(
            `${glyph} Morning Dispatcher Disabled | ${WARN_EMOJI}`,
            `Morning thought messages have been turned off.`
          ),
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'channel') {
        const targetChan = interaction.options.getChannel('target');
        db.updateMorningConfig(guild.id, { channelId: targetChan.id, enabled: true });
        const glyph = getRandomHeadingGlyph();
        return interaction.reply({
          ...cv2.success(
            `${glyph} Morning Channel Configured | ${TICK_EMOJI}`,
            `Morning messages will be dispatched to <#${targetChan.id}>.`
          ),
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'auto') {
        db.updateMorningConfig(guild.id, { channelId: null, enabled: true });
        const glyph = getRandomHeadingGlyph();
        return interaction.reply({
          ...cv2.success(
            `${glyph} Auto-Detection Mode Enabled | ${TICK_EMOJI}`,
            `Athena will dynamically detect the most active text channel and post there.`
          ),
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'ping') {
        const mode = interaction.options.getString('mode') || 'none';
        db.updateMorningConfig(guild.id, { ping: mode });
        const glyph = getRandomHeadingGlyph();
        return interaction.reply({
          ...cv2.success(
            `${glyph} Notification Ping Set | ${TICK_EMOJI}`,
            `Notification ping mode set to: \`${mode === 'here' ? '@here' : 'None'}\``
          ),
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'test') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
        const result = await dispatchMorningMessage(guild, interaction.client, true);
        const glyph = getRandomHeadingGlyph();
        if (result.success) {
          return interaction.editReply({
            ...cv2.success(
              `${glyph} Test Morning Message Dispatched | ${TICK_EMOJI}`,
              `Dispatched live pleasant thought of the day to <#${result.channelId}>!`
            ),
            flags: MessageFlags.IsComponentsV2
          });
        } else {
          return interaction.editReply({
            ...cv2.danger(
              `${glyph} Test Dispatch Failed | ${WRONG_EMOJI}`,
              `Could not send morning thought: \`${result.reason}\``
            ),
            flags: MessageFlags.IsComponentsV2
          });
        }
      }

      if (sub === 'add') {
        const quoteText = interaction.options.getString('quote')?.trim();
        const custom = Array.isArray(config.customQuotes) ? [...config.customQuotes] : [];
        custom.push(quoteText);
        db.updateMorningConfig(guild.id, { customQuotes: custom });

        const glyph = getRandomHeadingGlyph();
        return interaction.reply({
          ...cv2.success(
            `${glyph} Custom Thought Added | ${TICK_EMOJI}`,
            `Added custom quote:\n> *"${quoteText}"*`
          ),
          flags: MessageFlags.IsComponentsV2
        });
      }
    }
  }
];

/**
 * Handles all interactive button and modal clicks for the Morning panel (mrn_*)
 */
export async function handleMorningInteraction(interaction) {
  const guild = interaction.guild;
  if (!guild) return;

  // Permission check
  const member = interaction.member;
  if (!member?.permissions?.has(PermissionFlagsBits.ManageGuild) && !member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      ...cv2.asEphemeral(cv2.danger('Unauthorized', 'You need **Manage Server** or Administrator clearance to adjust morning message parameters.')),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    });
  }

  const customId = interaction.customId;
  const config = db.getMorningConfig(guild.id);

  if (interaction.isButton()) {
    if (customId === 'mrn_toggle') {
      const newEnabled = !config.enabled;
      db.updateMorningConfig(guild.id, { enabled: newEnabled });
      const updated = db.getMorningConfig(guild.id);
      const panel = buildMorningPanel(guild, updated);
      return interaction.update(panel);
    }

    if (customId === 'mrn_auto') {
      db.updateMorningConfig(guild.id, { channelId: null, enabled: true });
      const updated = db.getMorningConfig(guild.id);
      const panel = buildMorningPanel(guild, updated);
      return interaction.update(panel);
    }

    if (customId === 'mrn_ping') {
      const nextPing = config.ping === 'here' ? 'none' : 'here';
      db.updateMorningConfig(guild.id, { ping: nextPing });
      const updated = db.getMorningConfig(guild.id);
      const panel = buildMorningPanel(guild, updated);
      return interaction.update(panel);
    }

    if (customId === 'mrn_channel') {
      const modal = new ModalBuilder()
        .setCustomId('mrn_modal_channel')
        .setTitle('Set Morning Channel');

      const chanInput = new TextInputBuilder()
        .setCustomId('mrn_channel_input')
        .setLabel('Target Channel ID or Mention')
        .setPlaceholder('e.g. 123456789012345678 or #general')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      if (config.channelId) chanInput.setValue(config.channelId);

      modal.addComponents(new ActionRowBuilder().addComponents(chanInput));
      return interaction.showModal(modal);
    }

    if (customId === 'mrn_test') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
      const result = await dispatchMorningMessage(guild, interaction.client, true);
      const glyph = getRandomHeadingGlyph();
      if (result.success) {
        return interaction.editReply({
          ...cv2.success(
            `${glyph} Test Morning Message Dispatched | ${TICK_EMOJI}`,
            `Live pleasant thought card dispatched to <#${result.channelId}>!`
          ),
          flags: MessageFlags.IsComponentsV2
        });
      } else {
        return interaction.editReply({
          ...cv2.danger(
            `${glyph} Test Failed | ${WRONG_EMOJI}`,
            `Failed to send morning message: \`${result.reason}\``
          ),
          flags: MessageFlags.IsComponentsV2
        });
      }
    }
  }

  if (interaction.isModalSubmit()) {
    if (customId === 'mrn_modal_channel') {
      const raw = interaction.fields.getTextInputValue('mrn_channel_input') || '';
      const cleanId = raw.replace(/[^0-9]/g, '');
      const targetChan = guild.channels.cache.get(cleanId) || await guild.channels.fetch(cleanId).catch(() => null);

      if (!targetChan || !targetChan.isTextBased()) {
        return interaction.reply({
          ...cv2.asEphemeral(cv2.danger('Invalid Channel', 'Could not locate that text channel. Please supply a valid Channel ID.')),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }

      db.updateMorningConfig(guild.id, { channelId: targetChan.id, enabled: true });
      const updated = db.getMorningConfig(guild.id);
      const panel = buildMorningPanel(guild, updated);
      return interaction.update(panel);
    }
  }
}
