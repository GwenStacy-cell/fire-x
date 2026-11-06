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
        .setStyle(ButtonStyle.Primary)
    );
  }

  container.components.push(actionRow.toJSON());
  return { components: [container], flags: 32768 };
}

export function buildTicketManagerPayload(guildId, view = 'core') {
  const config = db.getTickets(guildId);

  const categoryText = config.categoryId ? `<#${config.categoryId}>` : '*Auto-provisioned on first ticket (`Support Tickets`)*';
  const staffRolesText = config.staffRoleIds && config.staffRoleIds.length > 0
    ? config.staffRoleIds.map(id => `<@&${id}>`).join(' ')
    : '*Auto-detected from server staff/moderator roles*';
  const targetChannelText = config.targetChannelId ? `<#${config.targetChannelId}>` : 'Current Channel';
  const logChannelText = config.logChannelId ? `<#${config.logChannelId}>` : 'Server Owner & Staff DMs (Default)';
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
          '-# **Use the interactive controls below to configure your bulletproof ticket system.**\n\n' +
          `<a:target_blink:1565667466984554588> **Ticket Category:** ${categoryText}\n` +
          `<a:target_blink:1565667466984554588> **Staff Roles:** ${staffRolesText}\n` +
          `<a:target_blink:1565667466984554588> **Deployment Channel:** ${targetChannelText}\n` +
          `<a:target_blink:1565667466984554588> **Transcript Archive:** ${logChannelText}\n` +
          `<a:target_blink:1565667466984554588> **Closing Authority:** ${closeRolesText}\n` +
          `<a:target_blink:1565667466984554588> **AI Triage Sentry:** ${config.aiTriage ? '<:on:1533844867191406672>' : '<:off:1533844858983157851>'}\n` +
          `<a:target_blink:1565667466984554588> **Panel Title:** ${config.panelTitle || 'Support Tickets'}\n` +
          `<a:target_blink:1565667466984554588> **Description:** ${(config.panelDescription || 'Need help? Open a ticket below.').substring(0, 300)}\n` +
          `<a:target_blink:1565667466984554588> **Custom Options:** ${(config.panelOptions || []).length} configured\n` +
          `<a:target_blink:1565667466984554588> **Banner:** ${config.panelImage ? `[Link](${config.panelImage})` : 'None'} | **Thumbnail:** ${config.panelThumbnail ? `[Link](${config.panelThumbnail})` : 'None'}`
      },
      { type: 14, divider: true },
      { type: 10, content: '-# **Athena Prime Support & Security Matrix \u2022 V1.0.0**' }
    ]
  };

  if (view === 'adv') {
    const rowLog = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('tp_log_channel')
        .setPlaceholder('Select dedicated transcript archive channel...')
        .setChannelTypes(ChannelType.GuildText)
    );

    const rowClose = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId('tp_close_roles')
        .setPlaceholder('Select roles allowed to close tickets...')
        .setMinValues(1)
        .setMaxValues(10)
    );

    const rowAdvNav = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('tp_view_core')
        .setLabel('◀ Core Setup View')
        .setStyle(ButtonStyle.Secondary),
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

    container.components.push(rowLog.toJSON(), rowClose.toJSON(), rowAdvNav.toJSON());
  } else {
    // Core View
    const rowCat = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('tp_category')
        .setPlaceholder('Select Ticket Category (where text & voice open)...')
        .setChannelTypes(ChannelType.GuildCategory)
    );

    const rowStaff = new RoleSelectMenuBuilder()
      .setCustomId('tp_staff_roles')
      .setPlaceholder('Select Staff Roles (who view & answer tickets)...')
      .setMinValues(1)
      .setMaxValues(10);

    const rowStaffWrap = new ActionRowBuilder().addComponents(rowStaff);

    const rowTarget = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('tp_target_channel')
        .setPlaceholder('Select Deployment Channel (where panel is posted)...')
        .setChannelTypes(ChannelType.GuildText)
    );

    const rowBtns1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('tp_edit_text')
        .setLabel('Edit Text')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('tp_edit_media')
        .setLabel('Edit Media')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('tp_add_option')
        .setLabel('Add Option')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('tp_toggle_ai')
        .setLabel(`AI Triage: ${config.aiTriage ? 'ON' : 'OFF'}`)
        .setStyle(config.aiTriage ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('tp_view_adv')
        .setLabel('Advanced Logs ⚙️')
        .setStyle(ButtonStyle.Secondary)
    );

    const rowBtns2 = new ActionRowBuilder().addComponents(
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

    container.components.push(rowCat.toJSON(), rowStaffWrap.toJSON(), rowTarget.toJSON(), rowBtns1.toJSON(), rowBtns2.toJSON());
  }

  return { components: [container], flags: 32768 };
}

export async function updateManagerMessage(message, view = 'core') {
  const payload = buildTicketManagerPayload(message.guild.id, view);

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

  if (customId === 'tp_view_adv') {
    await interaction.deferUpdate();
    return updateManagerMessage(interaction.message, 'adv');
  }

  if (customId === 'tp_view_core') {
    await interaction.deferUpdate();
    return updateManagerMessage(interaction.message, 'core');
  }

  if (customId === 'tp_test') {
    const payload = buildTicketPanelPayload(guild.id);
    await interaction.channel.send(payload).catch(err => {
      console.error('[TicketPanel] Failed to send test panel:', err);
      return null;
    });
    return interaction.reply({
      content: `-# **Test Panel Dispatched | <a:03_tick_circle:1565665642084827206>**\nInteractive test ticket panel sent to this channel!`,
      flags: 64
    }).catch(() => null);
  }

  if (customId === 'tp_deploy') {
    const config = db.getTickets(guild.id);
    if (!config.targetChannelId) {
      return interaction.reply({
        content: `-# **Deployment Blocked | <a:04_cross_circle:1565665644806934639>**\nPlease select a target deployment channel from the dropdown first!`,
        flags: 64
      }).catch(() => null);
    }
    const targetChannel = guild.channels.cache.get(config.targetChannelId) || (await guild.channels.fetch(config.targetChannelId).catch(() => null));
    if (!targetChannel) {
      return interaction.reply({
        content: `-# **Deployment Error | <a:04_cross_circle:1565665644806934639>**\nTarget deployment channel could not be found.`,
        flags: 64
      }).catch(() => null);
    }

    // Auto-heal category if unset
    if (!config.categoryId) {
      let category = targetChannel.parentId ? guild.channels.cache.get(targetChannel.parentId) : null;
      if (!category) {
        category = guild.channels.cache.find
          ? guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && /tickets?|support/i.test(c.name))
          : Array.from(guild.channels.cache.values()).find(c => c.type === ChannelType.GuildCategory && /tickets?|support/i.test(c.name));
      }
      if (!category) {
        try {
          category = await guild.channels.create({
            name: 'Support Tickets',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
              { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
              { id: guild.members?.me?.id || guild.client?.user?.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles] }
            ]
          });
        } catch (e) {
          console.warn('[TicketPanel Auto-Provision] Could not create category:', e.message);
        }
      }
      if (category) {
        config.categoryId = category.id;
      }
    }

    // Auto-heal staff roles if unset
    if (!config.staffRoleIds || config.staffRoleIds.length === 0) {
      const allRoles = guild.roles.cache.values ? Array.from(guild.roles.cache.values()) : [];
      const detectedStaff = allRoles.filter(r =>
        !r.managed && r.id !== guild.id &&
        (r.permissions?.has(PermissionFlagsBits.ManageChannels) ||
         r.permissions?.has(PermissionFlagsBits.ModerateMembers) ||
         /staff|support|mod|admin|helper/i.test(r.name))
      );
      if (detectedStaff.length > 0) {
        const sorted = [...detectedStaff].sort((a, b) => (b.position || 0) - (a.position || 0));
        config.staffRoleIds = sorted.slice(0, 3).map(r => r.id);
      }
    }
    db.save();

    const payload = buildTicketPanelPayload(guild.id);
    await targetChannel.send(payload).catch(err => {
      console.error('[TicketPanel] Failed to deploy panel:', err);
      return null;
    });
    return interaction.reply({
      content: `-# **Panel Deployed | <a:03_tick_circle:1565665642084827206>**\nTicket panel successfully deployed to <#${config.targetChannelId}>!`,
      flags: 64
    }).catch(() => null);
  }

  if (customId === 'tp_cancel') {
    return interaction.message.delete().catch(() => null);
  }
}

export async function handleTicketPanelMenus(interaction) {
  const { customId, guild, values } = interaction;

  if (customId === 'tp_category') {
    const categoryId = values[0];
    db.updateTicketConfig(guild.id, { categoryId });
    await interaction.deferUpdate();
    return updateManagerMessage(interaction.message);
  }

  if (customId === 'tp_staff_roles') {
    db.updateTicketConfig(guild.id, { staffRoleIds: values });
    await interaction.deferUpdate();
    return updateManagerMessage(interaction.message);
  }

  if (customId === 'tp_target_channel') {
    const channelId = values[0];
    db.updateTicketConfig(guild.id, { targetChannelId: channelId });
    await interaction.deferUpdate();
    return updateManagerMessage(interaction.message);
  }

  if (customId === 'tp_log_channel') {
    const channelId = values[0];
    db.updateTicketConfig(guild.id, { logChannelId: channelId });
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
