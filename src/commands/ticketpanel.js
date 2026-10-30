import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { resolveMediaUrl, isPinterestUrl } from '../utils/pinterest.js';

export function buildTicketPanelPayload(guildId) {
  const config = db.getTickets(guildId);
  const title = config.panelTitle || 'Support Tickets';
  const desc = config.panelDescription || 'Need help? Click the button below to open a private ticket.';

  const containerComponents = [
    { type: 10, content: `# ${getRandomHeadingGlyph()} **${title}**` },
    { type: 14, divider: true },
    { type: 10, content: desc },
    { type: 14, divider: true },
    { type: 10, content: '-# **Athena Prime Support System \u2022 V1.0.0**' }
  ];

  if (config.panelThumbnail) {
    containerComponents[0] = {
      type: 9,
      components: [{ type: 10, content: `# ${getRandomHeadingGlyph()} **${title}**` }],
      accessory: { type: 11, media: { url: config.panelThumbnail } }
    };
  }

  const container = {
    type: 17,
    components: containerComponents
  };

  let actionRow;
  if (config.panelOptions && config.panelOptions.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('ticket_select_option')
      .setPlaceholder(config.panelPlaceholder || 'Select the reason for your ticket...');
    for (const opt of config.panelOptions) {
      select.addOptions({ label: opt.label, description: opt.description, value: opt.label.substring(0, 25) });
    }
    actionRow = new ActionRowBuilder().addComponents(select);
  } else {
    actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_open_general')
        .setLabel('Open Ticket')
        .setEmoji('<:139707ticket:1533859896620089485>')
        .setStyle(ButtonStyle.Primary)
    );
  }

  container.components.push(actionRow.toJSON());
  return { components: [container], flags: 32768 };
}

export function buildTicketManagerPayload(guildId) {
  const config = db.getTickets(guildId);

  const targetChannelText = config.targetChannelId ? `<#${config.targetChannelId}>` : 'Current Channel';
  const closeRolesText = config.closeTicketRoleIds && config.closeTicketRoleIds.length > 0
    ? config.closeTicketRoleIds.map(id => `<@&${id}>`).join(' ')
    : 'Anyone (Default)';

  const container = {
    type: 17,
    components: [
      { type: 10, content: `# ${getRandomHeadingGlyph()} **Ticket Panel Manager**` },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          '-# **Use the controls below to customize your Ticket Panel. When ready, click Deploy Panel.**\n\n' +
          `**Title:** ${config.panelTitle || 'Support Tickets'}\n` +
          `**Description:** ${(config.panelDescription || 'Need help? Open a ticket below.').substring(0, 500)}\n` +
          `**Options Count:** ${(config.panelOptions || []).length}\n` +
          `**Placeholder:** ${config.panelPlaceholder || 'Select a reason...'}\n` +
          `**AI Triage:** ${config.aiTriage ? '<:on:1533844867191406672>' : '<:off:1533844858983157851>'}\n` +
          `**Target Channel:** ${targetChannelText}\n` +
          `**Closing Roles:** ${closeRolesText}\n` +
          `**Image Banner:** ${config.panelImage ? `[Link](${config.panelImage})` : 'None'}\n` +
          `**Thumbnail:** ${config.panelThumbnail ? `[Link](${config.panelThumbnail})` : 'None'}`
      },
      { type: 14, divider: true },
      { type: 10, content: '-# **Athena Prime Ticket System \u2022 V1.0.0**' }
    ]
  };

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tp_edit_text')
      .setLabel('Edit Title & Desc')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('tp_edit_media')
      .setLabel('Edit Media & Placeholder')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('tp_add_option')
      .setLabel('Add Option')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('tp_toggle_ai')
      .setLabel(`AI Triage: ${config.aiTriage ? 'ON' : 'OFF'}`)
      .setStyle(config.aiTriage ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tp_clear_options')
      .setLabel('Clear Options')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('tp_test')
      .setLabel('Test Panel')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('tp_deploy')
      .setLabel('Deploy Panel')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('tp_cancel')
      .setLabel('Save & Close')
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('tp_target_channel')
      .setPlaceholder('Select target channel for deployment...')
      .setChannelTypes(ChannelType.GuildText)
  );

  const row4 = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('tp_close_roles')
      .setPlaceholder('Select roles that can close tickets (leave empty for everyone)...')
      .setMinValues(1)
      .setMaxValues(10)
  );

  container.components.push(row3.toJSON(), row4.toJSON(), row1.toJSON(), row2.toJSON());
  return { components: [container], flags: 32768 };
}

export async function updateManagerMessage(message) {
  const payload = buildTicketManagerPayload(message.guild.id);

  if (message.author?.id === message.client.user.id) {
    await message.edit(payload).catch(() => null);
  } else {
    await message.reply(payload);
  }
}

export const commands = [
  {
    name: 'ticketpanel',
    description: 'Launch the interactive ticket panel manager',
    type: 1,
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    async executePrefix(message, args) {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply(cv2.error('Missing Permission', 'You need Administrator permissions to use this command.'));
      }

      await updateManagerMessage(message);
    }
  }
];

export async function handleTicketPanelButtons(interaction) {
  const { customId, guild } = interaction;

  if (customId === 'tp_edit_text') {
    const config = db.getTickets(guild.id);
    const modal = new ModalBuilder().setCustomId('tp_modal_text').setTitle('Edit Panel Text');
    const titleInput = new TextInputBuilder().setCustomId('title').setLabel('Panel Title').setStyle(TextInputStyle.Short).setValue(config.panelTitle || 'Support Tickets').setRequired(true);
    const descInput = new TextInputBuilder().setCustomId('description').setLabel('Panel Description (Terms/Hours)').setStyle(TextInputStyle.Paragraph).setValue(config.panelDescription || 'Need help? Open a ticket below.').setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(titleInput), new ActionRowBuilder().addComponents(descInput));
    return interaction.showModal(modal);
  }

  if (customId === 'tp_edit_media') {
    const config = db.getTickets(guild.id);
    const modal = new ModalBuilder().setCustomId('tp_modal_media').setTitle('Edit Panel Media');
    const imageInput = new TextInputBuilder().setCustomId('image').setLabel('Banner (Supports Pinterest / Image URL)').setPlaceholder('Image URL or Pinterest link (pin.it / pinterest.com)').setStyle(TextInputStyle.Short).setValue(config.panelImage || '').setRequired(false);
    const thumbInput = new TextInputBuilder().setCustomId('thumbnail').setLabel('Thumbnail (Supports Pinterest / Image URL)').setPlaceholder('Image URL or Pinterest link (pin.it / pinterest.com)').setStyle(TextInputStyle.Short).setValue(config.panelThumbnail || '').setRequired(false);
    modal.addComponents(new ActionRowBuilder().addComponents(imageInput), new ActionRowBuilder().addComponents(thumbInput));
    return interaction.showModal(modal);
  }

  if (customId === 'tp_add_option') {
    const config = db.getTickets(guild.id);
    if ((config.panelOptions || []).length >= 5) {
      return interaction.reply({ content: '-# **Limit Reached:** You can only have up to 5 ticket options.', flags: 64 }).catch(() => null);
    }
    const modal = new ModalBuilder().setCustomId('tp_modal_option').setTitle('Add Ticket Option');
    const labelInput = new TextInputBuilder().setCustomId('label').setLabel('Option Label (e.g. General Support)').setStyle(TextInputStyle.Short).setRequired(true);
    const descInput = new TextInputBuilder().setCustomId('description').setLabel('Short Description').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(labelInput), new ActionRowBuilder().addComponents(descInput));
    return interaction.showModal(modal);
  }

  if (customId === 'tp_toggle_ai') {
    const config = db.getTickets(guild.id);
    db.updateTicketConfig(guild.id, { aiTriage: !config.aiTriage });
    await interaction.deferUpdate();
    return updateManagerMessage(interaction.message);
  }

  if (customId === 'tp_clear_options') {
    db.updateTicketConfig(guild.id, { panelOptions: [] });
    await interaction.deferUpdate();
    return updateManagerMessage(interaction.message);
  }

  if (customId === 'tp_test') {
    const payload = buildTicketPanelPayload(guild.id);
    await interaction.channel.send(payload).catch(err => {
      console.error('[TicketPanel] Failed to send test panel:', err);
      return null;
    });
    return interaction.reply({
      content: '<a:uptime:1552608831060844575> Test ticket panel sent to this channel!',
      flags: 64
    }).catch(() => null);
  }

  if (customId === 'tp_deploy') {
    const config = db.getTickets(guild.id);
    if (!config.targetChannelId) {
      return interaction.reply({ content: '-# **Error:** Please select a target channel from the dropdown first!', flags: 64 }).catch(() => null);
    }
    const targetChannel = guild.channels.cache.get(config.targetChannelId);
    if (!targetChannel) {
      return interaction.reply({ content: '-# **Error:** Target channel not found.', flags: 64 }).catch(() => null);
    }

    const payload = buildTicketPanelPayload(guild.id);
    await targetChannel.send(payload).catch(err => {
      console.error('[TicketPanel] Failed to deploy panel:', err);
      return null;
    });
    return interaction.reply({
      content: `<a:uptime:1552608831060844575> **Success:** Ticket panel deployed to <#${config.targetChannelId}>!`,
      flags: 64
    }).catch(() => null);
  }

  if (customId === 'tp_cancel') {
    return interaction.message.delete().catch(() => null);
  }
}

export async function handleTicketPanelMenus(interaction) {
  const { customId, guild, values } = interaction;

  if (customId === 'tp_target_channel') {
    const channelId = values[0];
    db.updateTicketConfig(guild.id, { targetChannelId: channelId });
    await interaction.deferUpdate();
    return updateManagerMessage(interaction.message);
  }

  if (customId === 'tp_close_roles') {
    db.updateTicketConfig(guild.id, { closeTicketRoleIds: values });
    await interaction.deferUpdate();
    return updateManagerMessage(interaction.message);
  }
}

export async function handleTicketPanelModals(interaction) {
  const { customId, guild, fields } = interaction;

  if (customId === 'tp_modal_text') {
    db.updateTicketConfig(guild.id, {
      panelTitle: fields.getTextInputValue('title'),
      panelDescription: fields.getTextInputValue('description')
    });
    await interaction.deferUpdate();
    return updateManagerMessage(interaction.message);
  }

  if (customId === 'tp_modal_media') {
    let panelImage = fields.getTextInputValue('image')?.trim() || null;
    let panelThumbnail = fields.getTextInputValue('thumbnail')?.trim() || null;

    if (panelImage && isPinterestUrl(panelImage)) {
      panelImage = await resolveMediaUrl(panelImage);
    }
    if (panelThumbnail && isPinterestUrl(panelThumbnail)) {
      panelThumbnail = await resolveMediaUrl(panelThumbnail);
    }

    db.updateTicketConfig(guild.id, {
      panelImage,
      panelThumbnail
    });
    await interaction.deferUpdate();
    return updateManagerMessage(interaction.message);
  }

  if (customId === 'tp_modal_option') {
    const label = fields.getTextInputValue('label').trim();
    const description = fields.getTextInputValue('description').trim();
    const config = db.getTickets(guild.id);
    const options = config.panelOptions || [];
    options.push({ label, description });
    db.updateTicketConfig(guild.id, { panelOptions: options });
    await interaction.deferUpdate();
    return updateManagerMessage(interaction.message);
  }
}
