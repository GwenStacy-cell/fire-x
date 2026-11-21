import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { isBotOwnerSync } from '../utils/helpers.js';

// ——————————————————————————————————————————
// PRESET ACCENT COLORS — Pure, clean palette
// ——————————————————————————————————————————
const PRESETS = [
  { label: 'Red',     hex: '#FF0000', emoji: '' },
  { label: 'Blue',    hex: '#0000FF', emoji: '' },
  { label: 'Cyan',    hex: '#00FFFF', emoji: '' },
  { label: 'Green',   hex: '#00FF00', emoji: '' },
  { label: 'Yellow',  hex: '#FFFF00', emoji: '' },
  { label: 'Orange',  hex: '#FF8000', emoji: '' },
  { label: 'Purple',  hex: '#8000FF', emoji: '' },
  { label: 'Pink',    hex: '#FF00FF', emoji: '' },
  { label: 'White',   hex: '#FFFFFF', emoji: '' },
  { label: 'Black',   hex: '#010101', emoji: '' },
];

function hexToInt(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

// ——————————————————————————————————————————
// SAVED ACCENT CONFIRMATION EMBED
// ——————————————————————————————————————————
function buildSavedEmbed(guild, colorName, hex, executorAvatarURL) {
  return new EmbedBuilder()
    .setColor(hexToInt(hex))
    .setTitle('Accent saved')
    .setDescription(`**${colorName.toUpperCase()}** · \`${hex.toUpperCase()}\`\n> Server components will use this accent.`)
    .setThumbnail(executorAvatarURL || null);
}

// ——————————————————————————————————————————
// BUILD THE ACCENT PANEL EMBED + COMPONENTS
// ——————————————————————————————————————————
export function buildAccentPanel(guild) {
  const cfg = db.getGuildConfig(guild.id);
  const current = cfg.accentColor || null;

  // Find the label of the current color if it's a preset
  const currentPreset = PRESETS.find(p => p.hex.toUpperCase() === current?.toUpperCase());

  const panelEmbed = new EmbedBuilder()
    .setColor(current ? hexToInt(current) : 0x2b2d31)
    .setTitle('__**ACCENT MANAGER**__')
    .setDescription(
      `Customize the accent color used across all of **Athena Prime's** responses in this server.\n\n` +
      `All \`256³\` colors are available — choose a preset below, enter a custom hex code, or reset to the default.\n\n` +
      `**CURRENT COLOR:** ${current ? `\`${current.toUpperCase()}\`` : 'Default (no accent set)'}`
    )
    .setFooter({ text: 'Athena Prime Customization • Changes apply instantly' })
    .setTimestamp();

  // Row 1: Presets 1-5
  const row1 = new ActionRowBuilder().addComponents(
    ...PRESETS.slice(0, 5).map(p => {
      const btn = new ButtonBuilder()
        .setCustomId(`accent_preset_${p.hex.replace('#', '')}`)
        .setLabel(p.label)
        .setStyle(current?.toUpperCase() === p.hex.toUpperCase() ? ButtonStyle.Primary : ButtonStyle.Secondary);
      if (p.emoji) btn.setEmoji(p.emoji);
      return btn;
    })
  );

  // Row 2: Presets 6-10
  const row2 = new ActionRowBuilder().addComponents(
    ...PRESETS.slice(5, 10).map(p => {
      const btn = new ButtonBuilder()
        .setCustomId(`accent_preset_${p.hex.replace('#', '')}`)
        .setLabel(p.label)
        .setStyle(current?.toUpperCase() === p.hex.toUpperCase() ? ButtonStyle.Primary : ButtonStyle.Secondary);
      if (p.emoji) btn.setEmoji(p.emoji);
      return btn;
    })
  );

  // Row 3: Custom Hex + Reset + Close
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('accent_custom_hex')
      .setLabel('Custom Hex')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('accent_reset')
      .setLabel('Reset to Default')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('accent_close')
      .setLabel('Close')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embed: panelEmbed, components: [row1, row2, row3] };
}

// ——————————————————————————————————————————
// BUTTON HANDLER
// ——————————————————————————————————————————
export async function handleAccentButton(interaction) {
  const { customId, guild, user } = interaction;

  // Auth check — server owner, bot owner, or extra owner
  const isAuth = isBotOwnerSync(user.id) ||
    user.id === guild.ownerId ||
    db.isExtraOwner(guild.id, user.id) ||
    interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

  if (!isAuth) {
    return interaction.reply({
      content: '️ Only the **Server Owner** or **Administrators** can change the accent color.'
    });
  }

  // ——— Custom Hex — Show Modal ———
  if (customId === 'accent_custom_hex') {
    const modal = new ModalBuilder()
      .setCustomId('accent_hex_modal')
      .setTitle('Custom Accent Color');

    const hexInput = new TextInputBuilder()
      .setCustomId('accent_hex_input')
      .setLabel('HEX COLOR CODE')
      .setPlaceholder('#FF0000 or FF0000')
      .setStyle(TextInputStyle.Short)
      .setMinLength(6)
      .setMaxLength(7)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(hexInput));
    return interaction.showModal(modal);
  }

  // ——— Preset Color ———
  if (customId.startsWith('accent_preset_')) {
    const hex = '#' + customId.replace('accent_preset_', '');
    const preset = PRESETS.find(p => p.hex.toUpperCase() === hex.toUpperCase());
    const colorName = preset?.label || 'Custom';

    db.updateGuildConfig(guild.id, { accentColor: hex.toUpperCase() });

    // Update the panel to reflect highlighted button
    const panel = buildAccentPanel(guild);
    await interaction.update({ embeds: [panel.embed], components: panel.components });

    // Sync JTC Panel if exists
    try {
      const { syncPanel } = await import('./jtc.js');
      await syncPanel(guild);
    } catch(e) {}

    // Send confirmation as a follow-up
    const executorAvatarURL = interaction.user.displayAvatarURL({ size: 256 });
    const savedEmbed = buildSavedEmbed(guild, colorName, hex, executorAvatarURL);
    await interaction.followUp({ embeds: [savedEmbed] });
    return;
  }

  // ——— Reset ———
  if (customId === 'accent_reset') {
    db.updateGuildConfig(guild.id, { accentColor: null });
    const panel = buildAccentPanel(guild);
    await interaction.update({ embeds: [panel.embed], components: panel.components });

    // Sync JTC Panel if exists
    try {
      const { syncPanel } = await import('./jtc.js');
      await syncPanel(guild);
    } catch(e) {}
    await interaction.followUp({ content: ' Accent color has been reset to default.' });
    return;
  }

  // ——— Close ———
  if (customId === 'accent_close') {
    await interaction.message.delete().catch(() => null);
    return;
  }
}

// ——————————————————————————————————————————
// MODAL HANDLER
// ——————————————————————————————————————————
export async function handleAccentModal(interaction) {
  const rawHex = interaction.fields.getTextInputValue('accent_hex_input').trim();
  const clean = rawHex.startsWith('#') ? rawHex : `#${rawHex}`;
  const valid = /^#[0-9A-Fa-f]{6}$/.test(clean);

  if (!valid) {
    return interaction.reply({
      content: ` **Invalid hex code:** \`${rawHex}\`\n\nPlease enter a valid 6-digit hex color code (e.g. \`#FF0000\` or \`FF0000\`).`
    });
  }

  const finalHex = clean.toUpperCase();

  // Check if it matches a known preset name
  const preset = PRESETS.find(p => p.hex.toUpperCase() === finalHex);
  const colorName = preset?.label || 'Custom';

  db.updateGuildConfig(interaction.guild.id, { accentColor: finalHex });

  // Update the panel
  const panel = buildAccentPanel(interaction.guild);
  await interaction.update({ embeds: [panel.embed], components: panel.components });

  // Sync JTC Panel if exists
  try {
    const { syncPanel } = await import('./jtc.js');
    await syncPanel(interaction.guild);
  } catch(e) {}

  // Send confirmation follow-up
  const executorAvatarURL = interaction.user.displayAvatarURL({ size: 256 });
  const savedEmbed = buildSavedEmbed(interaction.guild, colorName, finalHex, executorAvatarURL);
  await interaction.followUp({ embeds: [savedEmbed] });
}

// ——————————————————————————————————————————
// COMMAND DEFINITION
// ——————————————————————————————————————————
export const commands = [
  {
    name: 'accent',
    aliases: ['setaccent', 'theme', 'coloraccent'],
    description: "Customize Athena Prime's accent color for this server's embeds.",
    category: 'utility',
    permissions: [PermissionFlagsBits.Administrator],
    options: [],
    async executePrefix(message) {
      const isAuth = isBotOwnerSync(message.author.id) ||
        message.author.id === message.guild.ownerId ||
        db.isExtraOwner(message.guild.id, message.author.id) ||
        message.member?.permissions?.has(PermissionFlagsBits.Administrator);

      if (!isAuth) {
        return message.reply(cv2.danger('Permission Denied', `${message.author} Only Administrators can manage the accent color.`));
      }

      const panel = buildAccentPanel(message.guild);
      await message.reply({ embeds: [panel.embed], components: panel.components });
    },
    async executeSlash(interaction) {
      const isAuth = isBotOwnerSync(interaction.user.id) ||
        interaction.user.id === interaction.guild.ownerId ||
        db.isExtraOwner(interaction.guild.id, interaction.user.id) ||
        interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

      if (!isAuth) {
        return interaction.reply(cv2.danger('Permission Denied', `${interaction.user} Only Administrators can manage the accent color.`));
      }

      const panel = buildAccentPanel(interaction.guild);
      await interaction.reply({ embeds: [panel.embed], components: panel.components });
    }
  }
];

export default commands;
