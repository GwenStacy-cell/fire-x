import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import cv2, { sanitizeCV2Payload } from '../cv2.js';
import { setGuildContext } from '../embed.js';
import db from '../database.js';
import { resolveMediaUrl, isPinterestUrl } from '../utils/pinterest.js';

export function buildAnnouncementActionRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ann_edit_text')
      .setLabel('Edit Content')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ann_edit_media')
      .setLabel('Edit Media')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ann_edit_channel')
      .setLabel('Set Channel')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ann_test')
      .setLabel('Test Output')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ann_publish')
      .setLabel('Publish')
      .setStyle(ButtonStyle.Success)
  );
}

export function buildAnnouncementContainer(embed, color = 0x5865F2) {
  const accentColor = typeof color === 'string'
    ? parseInt(color.replace('#', ''), 16)
    : (color || 0x5865F2);

  const container = { 
    type: 17, 
    accent_color: accentColor, 
    components: [] 
  };
  let hasHeader = false;

  const title = embed.data?.title?.trim();
  const desc = embed.data?.description?.trim();
  const thumbUrl = embed.data?.thumbnail?.url;
  const imgUrl = embed.data?.image?.url;

  if (title && thumbUrl) {
    container.components.push({
      type: 9,
      components: [{ type: 10, content: `# ${getRandomHeadingGlyph()} ${title}` }],
      accessory: { type: 11, media: { url: thumbUrl } }
    });
    hasHeader = true;
  } else if (title) {
    container.components.push({ type: 10, content: `# ${getRandomHeadingGlyph()} ${title}` });
    hasHeader = true;
  } else if (thumbUrl) {
    container.components.push({
      type: 9,
      components: [{ type: 10, content: desc || '' }],
      accessory: { type: 11, media: { url: thumbUrl } }
    });
    hasHeader = true;
  }

  if (desc && (!hasHeader || title)) {
    container.components.push({ type: 10, content: desc });
  }

  if (imgUrl) {
    container.components.push({ type: 12, items: [{ media: { url: imgUrl } }] });
  }

  return sanitizeCV2Payload(container);
}

export const commands = [
  {
    name: 'announce',
    description: 'Launch the Interactive Announcement Builder UI.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageMessages],
    options: [],
    async executePrefix(message, args) {
      if (message.guild) setGuildContext(message.guild.id);
      
      const config = db.getGuildConfig(message.guild.id);
      const color = config.accentColor || '#5865F2';
      
      const previewEmbed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: 'Announcement Builder' })
        .setTitle('New Announcement')
        .setDescription('Click the buttons below to edit this announcement. You can seamlessly add links, images, and multiple lines of text!')
        .setThumbnail(message.guild.members.me.displayAvatarURL({ dynamic: true, size: 256 }))
        .setFooter({ text: 'Target Channel: Not Set' });

      const row = buildAnnouncementActionRow();

      await message.channel.send({ embeds: [previewEmbed], components: [row] });
      // Delete the trigger message to keep chat clean
      await message.delete().catch(() => null);
    },
    async executeSlash(interaction) {
      if (interaction.guild) setGuildContext(interaction.guild.id);

      const config = db.getGuildConfig(interaction.guild.id);
      const color = config.accentColor || '#5865F2';

      const previewEmbed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: 'Announcement Builder' })
        .setTitle('New Announcement')
        .setDescription('Click the buttons below to edit this announcement. You can seamlessly add links, images, and multiple lines of text!')
        .setThumbnail(interaction.guild.members.me.displayAvatarURL({ dynamic: true, size: 256 }))
        .setFooter({ text: 'Target Channel: Not Set' });

      const row = buildAnnouncementActionRow();

      await interaction.reply({ embeds: [previewEmbed], components: [row] });
    }
  }
];

export async function handleAnnouncementInteractions(interaction) {
  if (interaction.isButton()) {
    const customId = interaction.customId;
    const embed = interaction.message?.embeds?.[0] ? EmbedBuilder.from(interaction.message.embeds[0]) : null;

    if (customId === 'ann_edit_text') {
      if (!embed) return;
      const modal = new ModalBuilder()
        .setCustomId('ann_modal_text')
        .setTitle('Edit Content');
      
      const titleInput = new TextInputBuilder()
        .setCustomId('ann_title')
        .setLabel('Title')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);
      if (embed.data.title) titleInput.setValue(embed.data.title);
        
      const descInput = new TextInputBuilder()
        .setCustomId('ann_desc')
        .setLabel('Description (Content)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      if (embed.data.description) descInput.setValue(embed.data.description);

      modal.addComponents(new ActionRowBuilder().addComponents(titleInput), new ActionRowBuilder().addComponents(descInput));
      return interaction.showModal(modal);
    }

    if (customId === 'ann_edit_media') {
      if (!embed) return;
      const modal = new ModalBuilder()
        .setCustomId('ann_modal_media')
        .setTitle('Edit Media');
      
      const imageInput = new TextInputBuilder()
        .setCustomId('ann_image')
        .setLabel('Large Image (Supports Pinterest / Direct URL)')
        .setPlaceholder('Image URL or Pinterest link (pin.it / pinterest.com)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);
      if (embed.data.image?.url) imageInput.setValue(embed.data.image.url);
        
      const thumbInput = new TextInputBuilder()
        .setCustomId('ann_thumb')
        .setLabel('Thumbnail (Supports Pinterest / Direct URL)')
        .setPlaceholder('Image URL or Pinterest link (pin.it / pinterest.com)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);
      if (embed.data.thumbnail?.url) thumbInput.setValue(embed.data.thumbnail.url);

      modal.addComponents(new ActionRowBuilder().addComponents(imageInput), new ActionRowBuilder().addComponents(thumbInput));
      return interaction.showModal(modal);
    }

    if (customId === 'ann_edit_channel') {
      const modal = new ModalBuilder()
        .setCustomId('ann_modal_channel')
        .setTitle('Set Target Channel');
      
      const chanInput = new TextInputBuilder()
        .setCustomId('ann_channel')
        .setLabel('Channel ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('123456789012345678');

      modal.addComponents(new ActionRowBuilder().addComponents(chanInput));
      return interaction.showModal(modal);
    }

    if (customId === 'ann_test') {
      if (!embed) {
        return interaction.reply({
          ...cv2.asEphemeral(cv2.warn('Announcement Not Found', 'Could not locate announcement draft.')),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }

      const config = db.getGuildConfig(interaction.guild.id);
      const color = config?.accentColor || embed.data.color || 0x5865F2;
      const container = buildAnnouncementContainer(embed, color);

      if (!container.components || container.components.length === 0) {
        return interaction.reply({
          ...cv2.asEphemeral(cv2.warn('Empty Announcement', 'Your announcement does not have any content, title, or media yet. Click **Edit Content** to add text.')),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }

      const testActionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ann_test_send_channel')
          .setLabel('Send Test to Current Channel')
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({
        components: [container, testActionRow.toJSON()],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
    }

    if (customId === 'ann_test_send_channel') {
      const comps = interaction.message?.components || [];
      const container = comps.find(c => c.type === 17);
      if (!container) {
        return interaction.reply({
          ...cv2.asEphemeral(cv2.warn('Test Error', 'Could not locate announcement container to test.')),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }

      const rawContainer = container.toJSON ? container.toJSON() : container;
      try {
        await interaction.channel.send({ components: [rawContainer], flags: MessageFlags.IsComponentsV2 });
        return interaction.reply({
          ...cv2.asEphemeral(cv2.success('Test Dispatched', `A live preview test of your announcement was dispatched to <#${interaction.channel.id}>.`)),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      } catch (err) {
        return interaction.reply({
          ...cv2.asEphemeral(cv2.danger('Test Dispatch Failed', `Failed to send test message: ${err.message}`)),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }
    }

    if (customId === 'ann_publish') {
      if (!embed) return;
      const footer = embed.data.footer?.text || '';
      if (!footer.startsWith('Target Channel: ') || footer.includes('Not Set')) {
        return interaction.reply({
          ...cv2.asEphemeral(cv2.warn('Target Channel Required', 'You must set a target channel first by clicking **Set Channel**.')),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }

      const channelId = footer.replace('Target Channel: ', '').trim();
      const targetChannel = interaction.guild.channels.cache.get(channelId) || await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!targetChannel) {
        return interaction.reply({
          ...cv2.asEphemeral(cv2.danger('Channel Not Found', 'Target channel not found. Please provide a valid Channel ID.')),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }

      const config = db.getGuildConfig(interaction.guild.id);
      const color = config?.accentColor || embed.data.color || 0x5865F2;
      const container = buildAnnouncementContainer(embed, color);

      try {
        await targetChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
        
        const publishedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('pub_dummy').setLabel('Published Successfully').setStyle(ButtonStyle.Success).setDisabled(true)
        );
        return interaction.update({ embeds: [embed.setFooter({ text: 'Status: Published' })], components: [publishedRow] });
      } catch (e) {
        return interaction.reply({
          ...cv2.asEphemeral(cv2.danger('Dispatch Failed', `Failed to send announcement to <#${channelId}>: ${e.message}. Please check my channel permissions.`)),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }
    }
  }

  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;
    const embed = interaction.message?.embeds?.[0] ? EmbedBuilder.from(interaction.message.embeds[0]) : null;
    if (!embed) return;

    if (customId === 'ann_modal_text') {
      const title = interaction.fields.getTextInputValue('ann_title');
      const desc = interaction.fields.getTextInputValue('ann_desc');
      if (title) embed.setTitle(title);
      else embed.setTitle(null);
      embed.setDescription(desc);
      return interaction.update({ embeds: [embed] });
    }

    if (customId === 'ann_modal_media') {
      let image = interaction.fields.getTextInputValue('ann_image')?.trim() || null;
      let thumb = interaction.fields.getTextInputValue('ann_thumb')?.trim() || null;
      
      if (image && isPinterestUrl(image)) {
        image = await resolveMediaUrl(image);
      }
      if (thumb && isPinterestUrl(thumb)) {
        thumb = await resolveMediaUrl(thumb);
      }

      if (image && image.startsWith('http')) embed.setImage(image);
      else embed.setImage(null);
      
      if (thumb && thumb.startsWith('http')) embed.setThumbnail(thumb);
      else embed.setThumbnail(null);
      
      return interaction.update({ embeds: [embed] });
    }

    if (customId === 'ann_modal_channel') {
      const chan = interaction.fields.getTextInputValue('ann_channel').replace(/[^0-9]/g, '');
      const target = interaction.guild.channels.cache.get(chan) || await interaction.guild.channels.fetch(chan).catch(() => null);
      if (!target) {
        return interaction.reply({
          ...cv2.asEphemeral(cv2.danger('Invalid Channel', 'Invalid Channel ID or I cannot access that channel.')),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }
      embed.setFooter({ text: `Target Channel: ${chan}` });
      return interaction.update({ embeds: [embed] });
    }
  }
}
