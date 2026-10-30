import { 
  AttachmentBuilder, 
  ApplicationCommandOptionType, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  MessageFlags 
} from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { 
  isPinterestUrl, 
  extractPinterestUrls, 
  fetchPinterestMedia, 
  downloadPinterestBuffer, 
  formatBytes 
} from '../utils/pinterest.js';

const TICK = '<a:03_tick_circle:1565665642084827206>';
const UPTIME = '<a:uptime:1552608831060844575>';
const LOADING = '<a:loading:1542155051286396938>';

/**
 * Builds the Pinterest CV2 Container and Action Buttons
 */
function buildPinterestContainer(user, result, downloaded, filename, guildId, hasAttachment = true) {
  const isVideo = result.mediaType === 'video';
  const guildConfig = guildId ? db.getGuildConfig(guildId) : null;
  const accentColor = guildConfig?.accentColor || '#5865F2';

  const headerText =
    `## **Pinterest Media Extractor** | ${TICK}\n` +
    `-# • **__Member:__** <@${user.id}> \`(${user.id})\`\n` +
    `-# • **__Media Type:__** \`${isVideo ? 'Pinterest Video (MP4)' : 'Original High-Resolution Image'}\`\n` +
    `-# • **__Resolution / Size:__** \`${formatBytes(downloaded.sizeBytes)}\` \u00b7 \`${downloaded.extension.toUpperCase()}\`\n` +
    (result.title && result.title !== 'Pinterest Media' ? `-# • **__Title:__** *${result.title}*\n` : '') +
    `-# • **__Source Pin:__** [View on Pinterest](${result.sourceUrl})`;

  const comps = [
    {
      type: 10,
      content: headerText
    },
    { type: 14, divider: true }
  ];

  // Visual Media Gallery preview inside CV2 Container for images
  if (!isVideo) {
    const mediaUrl = (hasAttachment && filename) ? `attachment://${filename}` : downloaded.url;
    if (mediaUrl) {
      comps.push({
        type: 12,
        items: [{ media: { url: mediaUrl } }]
      });
      comps.push({ type: 14, divider: true });
    }
  }

  comps.push({
    type: 10,
    content: `-# **Athena Pinterest Media Engine \u00b7 Direct 4K Master Extraction**`
  });

  const downloadLabel = isVideo ? 'Download Video' : 'Download Image';

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(downloadLabel)
      .setStyle(ButtonStyle.Link)
      .setURL(downloaded.url),
    new ButtonBuilder()
      .setLabel('Open on Pinterest')
      .setStyle(ButtonStyle.Link)
      .setURL(result.sourceUrl),
    new ButtonBuilder()
      .setLabel('Direct CDN Link')
      .setStyle(ButtonStyle.Link)
      .setURL(downloaded.url)
  );

  return {
    container: {
      type: 17,
      components: comps
    },
    actionRow
  };
}

export const commands = [
  {
    name: 'pinterest',
    aliases: ['pin', 'pinit', 'pintrest'],
    description: `${UPTIME} Fetch and download full-resolution images or videos from any Pinterest link.`,
    category: 'utility',
    options: [
      {
        name: 'link',
        description: 'The Pinterest URL to extract (supports pin.it and pinterest.com/pin/...)',
        type: ApplicationCommandOptionType.String,
        required: true
      }
    ],

    async executePrefix(message, args) {
      let targetUrl = null;

      // 1. Direct argument check
      if (args.length > 0) {
        const fullArg = args.join(' ');
        const foundUrls = extractPinterestUrls(fullArg);
        if (foundUrls.length > 0) {
          targetUrl = foundUrls[0];
        }
      }

      // 2. Reply message check (if user replied to a message containing a Pinterest link)
      if (!targetUrl && message.reference && message.reference.messageId) {
        try {
          const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
          if (referencedMessage && referencedMessage.content) {
            const foundUrls = extractPinterestUrls(referencedMessage.content);
            if (foundUrls.length > 0) {
              targetUrl = foundUrls[0];
            }
          }
        } catch {}
      }

      // If no valid URL detected, provide usage instructions
      if (!targetUrl) {
        return message.reply(cv2.warn(
          'Pinterest Media Extractor',
          `Please provide a valid Pinterest link or **reply** to a message containing one!\n\n` +
          `• **__Usage:__** \`!pinterest <url>\` or \`!pin <url>\`\n` +
          `• **__Quick Reply:__** Reply to any chat message with \`!pin\`\n` +
          `• **__Supported Formats:__** \`https://pin.it/...\` \u00b7 \`https://www.pinterest.com/pin/...\` \u00b7 \`https://i.pinimg.com/...\``
        ));
      }

      // Progress notification
      const statusMsg = await message.reply({
        content: `-# ${LOADING} **Fetching full-resolution media from Pinterest...**`
      }).catch(() => null);

      try {
        const result = await fetchPinterestMedia(targetUrl);
        if (!result.success) {
          const errPayload = cv2.danger('Extraction Failed', result.error || 'Failed to extract media from this Pinterest link.');
          if (statusMsg) return statusMsg.edit(errPayload);
          return message.reply(errPayload);
        }

        const downloaded = await downloadPinterestBuffer(result.mediaUrl, result.fallbackUrl);
        if (!downloaded || !downloaded.buffer) {
          const errPayload = cv2.danger('Download Failed', 'Could not download media file from Pinterest CDN.');
          if (statusMsg) return statusMsg.edit(errPayload);
          return message.reply(errPayload);
        }

        const filename = `pinterest_${Date.now()}.${downloaded.extension}`;
        const files = [];

        // Attach file if under Discord's 25MB ceiling
        if (downloaded.sizeBytes <= 25 * 1024 * 1024) {
          files.push(new AttachmentBuilder(downloaded.buffer, { name: filename }));
        }

        const { container, actionRow } = buildPinterestContainer(
          message.author,
          result,
          downloaded,
          filename,
          message.guild?.id,
          files.length > 0
        );

        const responsePayload = {
          content: null,
          components: [container, actionRow],
          files,
          flags: MessageFlags.IsComponentsV2
        };

        if (statusMsg) {
          await statusMsg.delete().catch(() => null);
        }
        await message.reply(responsePayload);
      } catch (err) {
        console.error('[Pinterest Command Error]:', err);
        const errPayload = cv2.danger('Pinterest Extractor Error', `An unexpected error occurred: \`${err.message}\``);
        if (statusMsg) await statusMsg.edit(errPayload).catch(() => null);
        else await message.reply(errPayload).catch(() => null);
      }
    },

    async executeSlash(interaction) {
      const link = interaction.options.getString('link');
      if (!link || !isPinterestUrl(link)) {
        return interaction.reply({
          ...cv2.warn('Invalid Pinterest Link', 'Please provide a valid Pinterest URL (e.g. `https://pin.it/...` or `https://www.pinterest.com/pin/...`).'),
          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
        });
      }

      await interaction.deferReply();

      try {
        const result = await fetchPinterestMedia(link);
        if (!result.success) {
          return interaction.editReply(cv2.danger('Extraction Failed', result.error || 'Failed to extract media from this Pinterest link.'));
        }

        const downloaded = await downloadPinterestBuffer(result.mediaUrl, result.fallbackUrl);
        if (!downloaded || !downloaded.buffer) {
          return interaction.editReply(cv2.danger('Download Failed', 'Could not download media file from Pinterest CDN.'));
        }

        const filename = `pinterest_${Date.now()}.${downloaded.extension}`;
        const files = [];

        if (downloaded.sizeBytes <= 25 * 1024 * 1024) {
          files.push(new AttachmentBuilder(downloaded.buffer, { name: filename }));
        }

        const { container, actionRow } = buildPinterestContainer(
          interaction.user,
          result,
          downloaded,
          filename,
          interaction.guild?.id,
          files.length > 0
        );

        return interaction.editReply({
          content: null,
          components: [container, actionRow],
          files,
          flags: MessageFlags.IsComponentsV2
        });
      } catch (err) {
        console.error('[Pinterest Slash Error]:', err);
        return interaction.editReply(cv2.danger('Pinterest Extractor Error', `An unexpected error occurred: \`${err.message}\``));
      }
    }
  }
];

export default commands;
