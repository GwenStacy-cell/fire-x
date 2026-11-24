import { getRandomHeadingGlyph, hasHeadingGlyphStart, stripHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import cv2, { sanitizeCV2Payload } from '../cv2.js';
import { setGuildContext } from '../embed.js';
import db from '../database.js';
import { resolveMediaUrl, isPinterestUrl } from '../utils/pinterest.js';
import { formatChannelLink } from '../utils/helpers.js';

// In-memory active announcement drafts keyed by message ID to prevent Discord roundtrip state erasure
export const announcementDrafts = new Map();

// Regularly clean up drafts older than 6 hours
setInterval(() => {
  const now = Date.now();
  for (const [key, draft] of announcementDrafts.entries()) {
    if (now - (draft.lastUpdated || 0) > 6 * 60 * 60 * 1000) {
      announcementDrafts.delete(key);
    }
  }
}, 30 * 60 * 1000).unref();

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

export function buildPreviewEmbed(draft, guild = null) {
  const color = draft?.color || 0x5865F2;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: 'Announcement Builder' });

  if (draft?.title) {
    const clean = stripHeadingGlyph(draft.title);
    embed.setTitle(`${getRandomHeadingGlyph()} ${clean}`);
  } else {
    embed.setTitle(`${getRandomHeadingGlyph()} New Announcement`);
  }

  if (draft?.description) {
    embed.setDescription(draft.description);
  } else {
    embed.setDescription('Click the buttons below to edit this announcement. You can seamlessly add links, images, and multiple lines of text!');
  }

  if (draft?.imageUrl && /^https?:\/\//i.test(draft.imageUrl)) {
    embed.setImage(draft.imageUrl);
  }

  if (draft?.thumbnailUrl && /^https?:\/\//i.test(draft.thumbnailUrl)) {
    embed.setThumbnail(draft.thumbnailUrl);
  }

  const channelText = draft?.targetChannelId 
    ? `Target Channel: ${draft.targetChannelId}`
    : 'Target Channel: Not Set';
  embed.setFooter({ text: channelText });

  return embed;
}

export function buildAnnouncementContainer(draftOrEmbed, color = 0x5865F2) {
  let title = null;
  let desc = null;
  let thumbUrl = null;
  let imgUrl = null;
  let customColor = color;

  if (draftOrEmbed && draftOrEmbed.data) {
    // EmbedBuilder or Embed instance
    title = draftOrEmbed.data.title?.trim() || null;
    desc = draftOrEmbed.data.description?.trim() || null;
    thumbUrl = draftOrEmbed.data.thumbnail?.url || null;
    imgUrl = draftOrEmbed.data.image?.url || null;
    customColor = draftOrEmbed.data.color || color;
  } else if (draftOrEmbed) {
    // Plain draft object
    title = draftOrEmbed.title?.trim() || null;
    desc = draftOrEmbed.description?.trim() || null;
    thumbUrl = draftOrEmbed.thumbnailUrl?.trim() || null;
    imgUrl = draftOrEmbed.imageUrl?.trim() || null;
    customColor = draftOrEmbed.color || color;
  }

  const accentColor = typeof customColor === 'string'
    ? parseInt(customColor.replace('#', ''), 16)
    : (customColor || 0x5865F2);

  const container = { 
    type: 17, 
    accent_color: accentColor, 
    components: [] 
  };

  if (title) {
    title = stripHeadingGlyph(title);
    const formattedTitle = `${getRandomHeadingGlyph()} ${title}`;
    if (thumbUrl && /^https?:\/\//i.test(thumbUrl)) {
      container.components.push({
        type: 9,
        components: [{ type: 10, content: `# ${formattedTitle}` }],
        accessory: { type: 11, media: { url: thumbUrl } }
      });
    } else {
      container.components.push({ type: 10, content: `# ${formattedTitle}` });
    }
    container.components.push({ type: 14, divider: true });
  } else if (thumbUrl && /^https?:\/\//i.test(thumbUrl)) {
    container.components.push({
      type: 9,
      components: [{ type: 10, content: `# ${getRandomHeadingGlyph()} Announcement` }],
      accessory: { type: 11, media: { url: thumbUrl } }
    });
    container.components.push({ type: 14, divider: true });
  }

  if (imgUrl && /^https?:\/\//i.test(imgUrl)) {
    container.components.push({ type: 12, items: [{ media: { url: imgUrl } }] });
    container.components.push({ type: 14, divider: true });
  }

  if (desc) {
    container.components.push({ type: 10, content: desc });
  }

  return sanitizeCV2Payload(container);
}

export async function getOrFetchDraft(interaction) {
  const msgId = interaction.message?.id;
  let draft = msgId ? announcementDrafts.get(msgId) : null;
  if (draft) return draft;

  // Fallback: fetch live message from Discord REST API
  let msg = interaction.message;
  if (interaction.channel && msgId) {
    const fetched = await interaction.channel.messages.fetch(msgId).catch(() => null);
    if (fetched) msg = fetched;
  }

  const raw = msg?.embeds?.[0];
  const footerText = raw?.footer?.text || '';
  const channelMatch = footerText.match(/\b\d{17,20}\b/);

  const config = interaction.guild ? db.getGuildConfig(interaction.guild.id) : null;
  const color = config?.accentColor || raw?.color || 0x5865F2;

  draft = {
    guildId: interaction.guild?.id,
    authorId: interaction.user?.id,
    title: raw?.title ? stripHeadingGlyph(raw.title) : null,
    description: (raw?.description && !raw.description.startsWith('Click the buttons below')) ? raw.description : null,
    imageUrl: raw?.image?.url || null,
    thumbnailUrl: raw?.thumbnail?.url || null,
    targetChannelId: channelMatch ? channelMatch[0] : null,
    color: color,
    lastUpdated: Date.now()
  };

  if (msgId) announcementDrafts.set(msgId, draft);
  return draft;
}

export const commands = [
  {
    name: 'announce',
    aliases: ['announc', 'announcement'],
    description: 'Launch the Interactive Announcement Builder UI.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageMessages],
    options: [],
    async executePrefix(message, args) {
      if (message.guild) setGuildContext(message.guild.id);
      
      const config = db.getGuildConfig(message.guild.id);
      const color = config.accentColor || '#5865F2';
      
      const draft = {
        guildId: message.guild.id,
        authorId: message.author.id,
        title: null,
        description: null,
        imageUrl: null,
        thumbnailUrl: null,
        targetChannelId: null,
        color: color,
        lastUpdated: Date.now()
      };

      const previewEmbed = buildPreviewEmbed(draft, message.guild);
      const row = buildAnnouncementActionRow();

      const sent = await message.channel.send({ embeds: [previewEmbed], components: [row] });
      announcementDrafts.set(sent.id, draft);

      // Delete the trigger message to keep chat clean
      await message.delete().catch(() => null);
    },
    async executeSlash(interaction) {
      if (interaction.guild) setGuildContext(interaction.guild.id);

      const config = db.getGuildConfig(interaction.guild.id);
      const color = config.accentColor || '#5865F2';

      const draft = {
        guildId: interaction.guild.id,
        authorId: interaction.user.id,
        title: null,
        description: null,
        imageUrl: null,
        thumbnailUrl: null,
        targetChannelId: null,
        color: color,
        lastUpdated: Date.now()
      };

      const previewEmbed = buildPreviewEmbed(draft, interaction.guild);
      const row = buildAnnouncementActionRow();

      const reply = await interaction.reply({ embeds: [previewEmbed], components: [row], fetchReply: true });
      announcementDrafts.set(reply.id, draft);
    }
  }
];

export async function handleAnnouncementInteractions(interaction) {
  if (interaction.isButton()) {
    const customId = interaction.customId;
    const draft = await getOrFetchDraft(interaction);

    if (customId === 'ann_edit_text') {
      const modal = new ModalBuilder()
        .setCustomId('ann_modal_text')
        .setTitle('Edit Content');
      
      const titleInput = new TextInputBuilder()
        .setCustomId('ann_title')
        .setLabel('Title')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);
      
      if (draft.title) {
        titleInput.setValue(draft.title.slice(0, 45));
      }
        
      const descInput = new TextInputBuilder()
        .setCustomId('ann_desc')
        .setLabel('Description (Content)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      if (draft.description) {
        descInput.setValue(draft.description.slice(0, 4000));
      }

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput)
      );

      try {
        return await interaction.showModal(modal);
      } catch (err) {
        console.error('[Announce] showModal ann_modal_text error:', err);
        if (!interaction.replied && !interaction.deferred) {
          return await interaction.reply({
            ...cv2.asEphemeral(cv2.danger('Error', `Failed to open editor: ${err.message}`)),
            flags: MessageFlags.Ephemeral
          }).catch(() => null);
        }
        return;
      }
    }

    if (customId === 'ann_edit_media') {
      const modal = new ModalBuilder()
        .setCustomId('ann_modal_media')
        .setTitle('Edit Media');
      
      const imageInput = new TextInputBuilder()
        .setCustomId('ann_image')
        .setLabel('Large Image (URL or Pinterest link)')
        .setPlaceholder('https://example.com/banner.png or pin.it/...')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      if (draft.imageUrl) {
        imageInput.setValue(draft.imageUrl.slice(0, 1000));
      }
        
      const thumbInput = new TextInputBuilder()
        .setCustomId('ann_thumb')
        .setLabel('Thumbnail (URL or Pinterest link)')
        .setPlaceholder('https://example.com/thumb.png or pin.it/...')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      if (draft.thumbnailUrl) {
        thumbInput.setValue(draft.thumbnailUrl.slice(0, 1000));
      }

      modal.addComponents(
        new ActionRowBuilder().addComponents(imageInput),
        new ActionRowBuilder().addComponents(thumbInput)
      );

      try {
        return await interaction.showModal(modal);
      } catch (err) {
        console.error('[Announce] showModal ann_modal_media error:', err);
        if (!interaction.replied && !interaction.deferred) {
          return await interaction.reply({
            ...cv2.asEphemeral(cv2.danger('Error', `Failed to open media editor: ${err.message}`)),
            flags: MessageFlags.Ephemeral
          }).catch(() => null);
        }
        return;
      }
    }

    if (customId === 'ann_edit_channel') {
      const modal = new ModalBuilder()
        .setCustomId('ann_modal_channel')
        .setTitle('Set Target Channel');
      
      const chanInput = new TextInputBuilder()
        .setCustomId('ann_channel')
        .setLabel('Channel ID, #mention, or Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g. 123456789012345678, #announcements');

      if (draft.targetChannelId) {
        chanInput.setValue(draft.targetChannelId);
      }

      modal.addComponents(new ActionRowBuilder().addComponents(chanInput));

      try {
        return await interaction.showModal(modal);
      } catch (err) {
        console.error('[Announce] showModal ann_modal_channel error:', err);
        if (!interaction.replied && !interaction.deferred) {
          return await interaction.reply({
            ...cv2.asEphemeral(cv2.danger('Error', `Failed to open channel editor: ${err.message}`)),
            flags: MessageFlags.Ephemeral
          }).catch(() => null);
        }
        return;
      }
    }

    if (customId === 'ann_test') {
      const config = db.getGuildConfig(interaction.guild.id);
      const color = config?.accentColor || draft.color || 0x5865F2;
      const container = buildAnnouncementContainer(draft, color);

      if (!container.components || container.components.length === 0) {
        return await interaction.reply({
          ...cv2.asEphemeral(cv2.warn('Empty Announcement', 'Your announcement does not have any content, title, or media yet. Click **Edit Content** to add text.')),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }

      // Clone container and append test dispatch button safely inside container
      const testContainer = JSON.parse(JSON.stringify(container));
      testContainer.components.push(
        { type: 14, divider: true },
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 2,
              label: 'Send Test to Current Channel',
              custom_id: 'ann_test_send_channel'
            }
          ]
        }
      );

      return await interaction.reply({
        components: [testContainer],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
    }

    if (customId === 'ann_test_send_channel') {
      const comps = interaction.message?.components || [];
      const container = comps.find(c => c.type === 17);
      if (!container) {
        return await interaction.reply({
          ...cv2.asEphemeral(cv2.warn('Test Error', 'Could not locate announcement preview to dispatch.')),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }

      // Clean container by removing test button row and trailing divider
      const rawContainer = container.toJSON ? container.toJSON() : JSON.parse(JSON.stringify(container));
      if (rawContainer.components && Array.isArray(rawContainer.components)) {
        rawContainer.components = rawContainer.components.filter(c => c.type !== 1);
        if (rawContainer.components.length > 0 && rawContainer.components[rawContainer.components.length - 1].type === 14) {
          rawContainer.components.pop();
        }
      }

      try {
        await interaction.channel.send({ components: [rawContainer], flags: MessageFlags.IsComponentsV2 });
        return await interaction.reply({
          ...cv2.asEphemeral(cv2.success('Test Dispatched', `A live preview test of your announcement was dispatched to ${formatChannelLink(interaction.channel, interaction.guild)}.`)),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      } catch (err) {
        return await interaction.reply({
          ...cv2.asEphemeral(cv2.danger('Test Dispatch Failed', `Failed to send test message: ${err.message}`)),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }
    }

    if (customId === 'ann_publish') {
      if (!draft.targetChannelId) {
        return await interaction.reply({
          ...cv2.asEphemeral(cv2.warn('Target Channel Required', 'You must set a target channel first by clicking **Set Channel**.')),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }

      const targetChannel = interaction.guild.channels.cache.get(draft.targetChannelId) || await interaction.guild.channels.fetch(draft.targetChannelId).catch(() => null);
      if (!targetChannel) {
        return await interaction.reply({
          ...cv2.asEphemeral(cv2.danger('Channel Not Found', 'Target channel not found. Please provide a valid Channel ID or mention.')),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }

      const config = db.getGuildConfig(interaction.guild.id);
      const color = config?.accentColor || draft.color || 0x5865F2;
      const container = buildAnnouncementContainer(draft, color);

      try {
        await targetChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
        
        const publishedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('pub_dummy').setLabel('Published Successfully').setStyle(ButtonStyle.Success).setDisabled(true)
        );
        const embed = buildPreviewEmbed(draft, interaction.guild);
        embed.setFooter({ text: `Status: Published to #${targetChannel.name || draft.targetChannelId}` });

        if (interaction.message?.id) announcementDrafts.delete(interaction.message.id);

        return await interaction.update({ embeds: [embed], components: [publishedRow] });
      } catch (e) {
        return await interaction.reply({
          ...cv2.asEphemeral(cv2.danger('Dispatch Failed', `Failed to send announcement to ${formatChannelLink(targetChannel, interaction.guild)}: ${e.message}. Please check my channel permissions.`)),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }
    }
  }

  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;
    const draft = await getOrFetchDraft(interaction);
    const actionRow = buildAnnouncementActionRow();

    if (customId === 'ann_modal_text') {
      const rawTitle = interaction.fields.getTextInputValue('ann_title')?.trim();
      const desc = interaction.fields.getTextInputValue('ann_desc')?.trim();
      
      draft.title = rawTitle ? stripHeadingGlyph(rawTitle) : null;
      draft.description = desc || null;
      draft.lastUpdated = Date.now();
      if (interaction.message?.id) announcementDrafts.set(interaction.message.id, draft);

      const embed = buildPreviewEmbed(draft, interaction.guild);
      return await interaction.update({ embeds: [embed], components: [actionRow] });
    }

    if (customId === 'ann_modal_media') {
      await interaction.deferUpdate().catch(() => null);
      let image = interaction.fields.getTextInputValue('ann_image')?.trim() || null;
      let thumb = interaction.fields.getTextInputValue('ann_thumb')?.trim() || null;
      
      if (image) image = image.replace(/^<|>$/g, '').trim();
      if (thumb) thumb = thumb.replace(/^<|>$/g, '').trim();

      if (image && isPinterestUrl(image)) {
        image = await resolveMediaUrl(image);
      }
      if (thumb && isPinterestUrl(thumb)) {
        thumb = await resolveMediaUrl(thumb);
      }

      draft.imageUrl = (image && /^https?:\/\//i.test(image)) ? image : null;
      draft.thumbnailUrl = (thumb && /^https?:\/\//i.test(thumb)) ? thumb : null;
      draft.lastUpdated = Date.now();
      if (interaction.message?.id) announcementDrafts.set(interaction.message.id, draft);

      // Re-render preview with intact text data preserved
      const embed = buildPreviewEmbed(draft, interaction.guild);
      return await interaction.editReply({ embeds: [embed], components: [actionRow] });
    }

    if (customId === 'ann_modal_channel') {
      let chanInput = interaction.fields.getTextInputValue('ann_channel')?.trim() || '';
      chanInput = chanInput.replace(/[<#>]/g, '').trim();
      
      let target = null;
      if (/^\d{17,20}$/.test(chanInput)) {
        target = interaction.guild.channels.cache.get(chanInput) || await interaction.guild.channels.fetch(chanInput).catch(() => null);
      }
      if (!target) {
        target = interaction.guild.channels.cache.find(c => c.name.toLowerCase() === chanInput.toLowerCase() && c.isTextBased());
      }

      if (!target) {
        return await interaction.reply({
          ...cv2.asEphemeral(cv2.danger('Invalid Channel', 'Please provide a valid text Channel ID, #mention, or channel name.')),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }

      draft.targetChannelId = target.id;
      draft.lastUpdated = Date.now();
      if (interaction.message?.id) announcementDrafts.set(interaction.message.id, draft);

      const embed = buildPreviewEmbed(draft, interaction.guild);
      return await interaction.update({ embeds: [embed], components: [actionRow] });
    }
  }
}
