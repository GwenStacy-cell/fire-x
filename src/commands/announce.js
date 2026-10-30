import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import cv2 from '../cv2.js';
import { setGuildContext } from '../embed.js';
import db from '../database.js';
import { resolveMediaUrl, isPinterestUrl } from '../utils/pinterest.js';

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

      const row = new ActionRowBuilder().addComponents(
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
          .setCustomId('ann_publish')
          .setLabel('Publish')
          .setStyle(ButtonStyle.Success)
      );

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

      const row = new ActionRowBuilder().addComponents(
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
          .setCustomId('ann_publish')
          .setLabel('Publish')
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({ embeds: [previewEmbed], components: [row] });
    }
  }
];



export async function handleAnnouncementInteractions(interaction) {
  if (interaction.isButton()) {
    const customId = interaction.customId;
    const embed = EmbedBuilder.from(interaction.message.embeds[0]);

    if (customId === 'ann_edit_text') {
      const modal = new ModalBuilder()
        .setCustomId('ann_modal_text')
        .setTitle('Edit Content');
      
      const titleInput = new TextInputBuilder()
        .setCustomId('ann_title')
        .setLabel('Title')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        ; if (embed.data.title) titleInput.setValue(embed.data.title);
        
      const descInput = new TextInputBuilder()
        .setCustomId('ann_desc')
        .setLabel('Description (Content)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        ; if (embed.data.description) descInput.setValue(embed.data.description);

      modal.addComponents(new ActionRowBuilder().addComponents(titleInput), new ActionRowBuilder().addComponents(descInput));
      return interaction.showModal(modal);
    }

    if (customId === 'ann_edit_media') {
      const modal = new ModalBuilder()
        .setCustomId('ann_modal_media')
        .setTitle('Edit Media');
      
      const imageInput = new TextInputBuilder()
        .setCustomId('ann_image')
        .setLabel('Large Image (Supports Pinterest / Direct URL)')
        .setPlaceholder('Image URL or Pinterest link (pin.it / pinterest.com)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        ; if (embed.data.image?.url) imageInput.setValue(embed.data.image.url);
        
      const thumbInput = new TextInputBuilder()
        .setCustomId('ann_thumb')
        .setLabel('Thumbnail (Supports Pinterest / Direct URL)')
        .setPlaceholder('Image URL or Pinterest link (pin.it / pinterest.com)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        ; if (embed.data.thumbnail?.url) thumbInput.setValue(embed.data.thumbnail.url);

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

        if (customId === 'ann_publish') {
      const footer = embed.data.footer?.text || '';
      if (!footer.startsWith('Target Channel: ') || footer.includes('Not Set')) {
        return interaction.reply({ content: 'You must set a target channel first by clicking **Set Channel**.', flags: 64 });
      }

      const channelId = footer.replace('Target Channel: ', '').trim();
      const targetChannel = interaction.guild.channels.cache.get(channelId);
      if (!targetChannel) {
        return interaction.reply({ content: 'Target channel not found. Please set a valid Channel ID.', flags: 64 });
      }

      const container = { type: 17, components: [] };
      let hasHeader = false;
      
      if (embed.data.title && embed.data.thumbnail?.url) {
         container.components.push({
           type: 9,
           components: [{ type: 10, content: `# ${getRandomHeadingGlyph()} ${embed.data.title}` }],
           accessory: { type: 11, media: { url: embed.data.thumbnail.url } }
         });
         hasHeader = true;
      } else if (embed.data.title) {
         container.components.push({ type: 10, content: `# ${getRandomHeadingGlyph()} ${embed.data.title}` });
         hasHeader = true;
      } else if (embed.data.thumbnail?.url) {
         container.components.push({
           type: 9,
           components: [{ type: 10, content: embed.data.description || '' }],
           accessory: { type: 11, media: { url: embed.data.thumbnail.url } }
         });
         hasHeader = true;
      }

      if (embed.data.description && (!hasHeader || !embed.data.thumbnail?.url)) {
         container.components.push({ type: 10, content: embed.data.description });
      } else if (embed.data.description && embed.data.title && embed.data.thumbnail?.url) {
         container.components.push({ type: 10, content: embed.data.description });
      }

      if (embed.data.image?.url) {
         container.components.push({ type: 12, items: [{ media: { url: embed.data.image.url } }] });
      }

      try {
        await targetChannel.send({ components: [container], flags: 32768 });
        
        const publishedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('pub_dummy').setLabel('Published Successfully').setStyle(ButtonStyle.Success).setDisabled(true)
        );
        return interaction.update({ embeds: [embed.setFooter({ text: 'Status: Published' })], components: [publishedRow] });
      } catch (e) {
        return interaction.reply({ content: 'Failed to send announcement to that channel. Check my permissions!', flags: 64 });
      }
    }
  }

  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;
    const embed = EmbedBuilder.from(interaction.message.embeds[0]);

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
      const target = interaction.guild.channels.cache.get(chan);
      if (!target) {
        return interaction.reply({ content: 'Invalid Channel ID or I cannot see that channel.', flags: 64 });
      }
      embed.setFooter({ text: `Target Channel: ${chan}` });
      return interaction.update({ embeds: [embed] });
    }
  }
}
