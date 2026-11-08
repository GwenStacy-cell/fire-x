import { 
  AttachmentBuilder, 
  MessageFlags, 
  PermissionFlagsBits,
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import cv2, { sanitizeCV2Payload } from '../cv2.js';
import { 
  convertMp4ToGif, 
  formatBytes 
} from '../utils/mediaConverter.js';
import { 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  UPTIME_EMOJI, 
  NINJA_BULLET, 
  NINJA_BULLET_RTL, 
  getRandomHeadingGlyph 
} from '../utils/emojis.js';
import { isPinterestUrl, fetchPinterestMedia } from '../utils/pinterest.js';
import { isExtraOwnerOrHigher } from '../utils/helpers.js';

export const commands = [
  {
    name: 'togif',
    aliases: ['mp4togif', 'convertgif', 'gifconvert', 'vidtogif', 'v2g'],
    description: 'Convert any MP4, WebM, or MOV video file or URL into a high-quality animated looping GIF (Extra Owner only)',
    category: 'utility',
    permissions: [PermissionFlagsBits.Administrator],
    options: [
      {
        name: 'file',
        description: 'Upload a video file from your device (.mp4, .mov, .webm)',
        type: 11, // ATTACHMENT
        required: false
      },
      {
        name: 'url',
        description: 'Direct video link or Pinterest URL',
        type: 3, // STRING
        required: false
      },
      {
        name: 'fps',
        description: 'Frame rate for the animated GIF (default: 15, max: 25)',
        type: 4, // INTEGER
        required: false,
        min_value: 8,
        max_value: 25
      },
      {
        name: 'duration',
        description: 'Max duration in seconds to convert (default: 15, max: 30)',
        type: 4, // INTEGER
        required: false,
        min_value: 1,
        max_value: 30
      },
      {
        name: 'speed',
        description: 'Playback speed for the converted GIF',
        type: 3, // STRING
        required: false,
        choices: [
          { name: '1.0x (Normal Speed)', value: '1.0' },
          { name: '1.25x (Slightly Faster)', value: '1.25' },
          { name: '1.5x (Fast Motion)', value: '1.5' },
          { name: '2.0x (Double Speed)', value: '2.0' }
        ]
      }
    ],

    async executePrefix(message, args) {
      if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
        return message.reply(cv2.danger(
          `Access Denied | ${WRONG_EMOJI}`,
          'This command is strictly restricted to **Extra Owners** (or Server Owner).'
        )).catch(() => null);
      }

      const prefix = '!';
      let videoSource = null;
      let filename = 'video.mp4';
      let fps = 15;
      let duration = 15;
      let speed = 1.0;

      // 1. Check direct message attachments
      const directAtt = message.attachments.find(a => 
        a.contentType?.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|m4v)(\?.*)?$/i.test(a.name)
      );

      if (directAtt) {
        videoSource = directAtt.url;
        filename = directAtt.name || 'video.mp4';
      }

      // 2. Check reply reference if no direct attachment
      if (!videoSource && message.reference?.messageId) {
        try {
          const refMsg = await message.channel.messages.fetch(message.reference.messageId);
          if (refMsg) {
            const refAtt = refMsg.attachments.find(a => 
              a.contentType?.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|m4v)(\?.*)?$/i.test(a.name)
            );
            if (refAtt) {
              videoSource = refAtt.url;
              filename = refAtt.name || 'video.mp4';
            }
          }
        } catch {}
      }

      // 3. Check URL or options in args
      if (!videoSource && args.length > 0) {
        for (const arg of args) {
          if (arg.startsWith('http://') || arg.startsWith('https://')) {
            videoSource = arg;
            filename = arg.split('/').pop().split('?')[0] || 'remote_video.mp4';
          } else if (/^\d+fps$/i.test(arg)) {
            fps = parseInt(arg, 10);
          } else if (/^\d+s$/i.test(arg)) {
            duration = parseInt(arg, 10);
          } else if (/^\d+(\.\d+)?x$/i.test(arg)) {
            speed = parseFloat(arg);
          }
        }
      }

      // 4. If no video found, display interactive instructional card
      if (!videoSource) {
        return message.reply({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `# ${getRandomHeadingGlyph()} Video to GIF Studio | ${WARN_EMOJI}\n` +
                           `> -# <a:uptime:1552608831060844575> **__How to Convert Videos to Animated GIFs:__**\n` +
                           `> ${BULLET_EMOJI} **Option 1 (Direct Upload):** Upload an MP4, MOV, or WebM video file and include \`${prefix}togif\` in the message.\n` +
                           `> ${BULLET_EMOJI} **Option 2 (Reply):** Reply to any existing video in chat with \`${prefix}togif\`.\n` +
                           `> ${BULLET_EMOJI} **Option 3 (URL Link):** Type \`${prefix}togif <video_url>\` with any direct video link or Pinterest URL.\n` +
                           `> ${BULLET_EMOJI} **Slash Command:** Use \`/togif file:[video] url:[link] fps:[8-25] duration:[1-30]\`.\n\n` +
                           `> -# **__Features & Supported Formats:__**\n` +
                           `> ${BULLET_EMOJI} **Supported Formats:** \`.mp4\`, \`.mov\`, \`.webm\`, \`.mkv\`, \`.avi\`\n` +
                           `> ${BULLET_EMOJI} **Dual-Pass Palette Generation:** Automatically generates a custom 256-color palette with Lanczos scaling for artifact-free color reproduction.\n` +
                           `> ${BULLET_EMOJI} **Auto-Size Safety:** Automatically scales large videos so they remain under Discord's file limits.`
                },
                { type: 14, divider: true },
                {
                  type: 10,
                  content: `-# **Athena Prime Multimedia Engine \u00b7 ffmpeg-static Dual-Pass Encoding**`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      // Check Pinterest URL resolution
      if (typeof videoSource === 'string' && isPinterestUrl(videoSource)) {
        try {
          const pinRes = await fetchPinterestMedia(videoSource);
          if (pinRes && pinRes.mediaUrl) {
            videoSource = pinRes.mediaUrl;
            filename = 'pinterest_video.mp4';
          }
        } catch {}
      }

      const processingNotice = await message.reply({
        content: `-# <a:uptime:1552608831060844575> **Processing Video:** Downloading and compiling high-efficiency palette GIF...`
      }).catch(() => null);

      try {
        const gifBuffer = await convertMp4ToGif(videoSource, {
          duration,
          fps,
          speed,
          returnMetadata: false
        });

        const cleanBaseName = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'converted';
        const gifFilename = `${cleanBaseName}.gif`;
        const attachment = new AttachmentBuilder(gifBuffer, { name: gifFilename });

        const containerJson = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Video Converted to GIF | ${TICK_EMOJI}\n` +
                       `> -# <a:uptime:1552608831060844575> **__Conversion Specifications:__**\n` +
                       `> ${BULLET_EMOJI} **Source:** \`${filename}\` (${formatBytes(gifBuffer.originalSizeBytes || 0)})\n` +
                       `> ${BULLET_EMOJI} **Dimensions:** \`${gifBuffer.width || 480}px Width\` \u00b7 \`${gifBuffer.fps || fps} FPS\` \u00b7 \`Looping Animated GIF\`\n` +
                       `> ${BULLET_EMOJI} **Render Duration:** \`Up to ${gifBuffer.duration || duration}s\` \u00b7 \`Speed: ${speed}x\`\n` +
                       `> ${BULLET_EMOJI} **Converted File Size:** \`${formatBytes(gifBuffer.length)}\`\n` +
                       `> ${BULLET_EMOJI} **Requested By:** <@${message.author.id}>`
            },
            { type: 14, divider: true },
            {
              type: 10,
              content: `-# **Athena Prime Multimedia Engine \u00b7 High-Fidelity Dual-Pass Palette Renderer**`
            }
          ]
        };

        const payload = sanitizeCV2Payload({
          components: [containerJson],
          files: [attachment],
          flags: MessageFlags.IsComponentsV2
        });

        if (processingNotice && processingNotice.deletable) {
          await processingNotice.delete().catch(() => null);
        }

        return message.reply(payload);
      } catch (err) {
        console.error('[togif Error]:', err);
        const errorContainer = cv2.danger(
          `Conversion Failed | ${WRONG_EMOJI}`,
          `Failed to convert the video to GIF: \`${err.message || 'Unknown processing error'}\`\n\n` +
          `> -# ${BULLET_EMOJI} Ensure the video file is valid and accessible.\n` +
          `> -# ${BULLET_EMOJI} Videos over 25MB or corrupted streams cannot be converted.`
        );

        if (processingNotice && processingNotice.deletable) {
          await processingNotice.delete().catch(() => null);
        }

        return message.reply(errorContainer);
      }
    },

    async executeSlash(interaction) {
      if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
        return interaction.reply({
          ...cv2.danger(
            `Access Denied | ${WRONG_EMOJI}`,
            'This command is strictly restricted to **Extra Owners** (or Server Owner).'
          ),
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply();

      const fileOption = interaction.options.getAttachment('file');
      const urlOption = interaction.options.getString('url');
      const fps = interaction.options.getInteger('fps') || 15;
      const duration = interaction.options.getInteger('duration') || 15;
      const speed = parseFloat(interaction.options.getString('speed') || '1.0');

      let videoSource = null;
      let filename = 'video.mp4';

      if (fileOption) {
        videoSource = fileOption.url;
        filename = fileOption.name || 'video.mp4';
      } else if (urlOption) {
        videoSource = urlOption.trim();
        filename = videoSource.split('/').pop().split('?')[0] || 'remote_video.mp4';
      }

      if (!videoSource) {
        return interaction.editReply({
          ...cv2.warn(
            `No Video Provided | ${WARN_EMOJI}`,
            `Please attach a video file using the \`file\` option or specify a link using the \`url\` option.\n\n` +
            `> -# ${BULLET_EMOJI} **Supported:** \`.mp4\`, \`.mov\`, \`.webm\`, \`.mkv\`, \`.avi\`, Pinterest video links.`
          )
        });
      }

      // Check Pinterest URL
      if (typeof videoSource === 'string' && isPinterestUrl(videoSource)) {
        try {
          const pinRes = await fetchPinterestMedia(videoSource);
          if (pinRes && pinRes.mediaUrl) {
            videoSource = pinRes.mediaUrl;
            filename = 'pinterest_video.mp4';
          }
        } catch {}
      }

      try {
        const gifBuffer = await convertMp4ToGif(videoSource, {
          duration,
          fps,
          speed,
          returnMetadata: false
        });

        const cleanBaseName = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'converted';
        const gifFilename = `${cleanBaseName}.gif`;
        const attachment = new AttachmentBuilder(gifBuffer, { name: gifFilename });

        const containerJson = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Video Converted to GIF | ${TICK_EMOJI}\n` +
                       `> -# <a:uptime:1552608831060844575> **__Conversion Specifications:__**\n` +
                       `> ${BULLET_EMOJI} **Source:** \`${filename}\` (${formatBytes(gifBuffer.originalSizeBytes || 0)})\n` +
                       `> ${BULLET_EMOJI} **Dimensions:** \`${gifBuffer.width || 480}px Width\` \u00b7 \`${gifBuffer.fps || fps} FPS\` \u00b7 \`Looping Animated GIF\`\n` +
                       `> ${BULLET_EMOJI} **Render Duration:** \`Up to ${gifBuffer.duration || duration}s\` \u00b7 \`Speed: ${speed}x\`\n` +
                       `> ${BULLET_EMOJI} **Converted File Size:** \`${formatBytes(gifBuffer.length)}\`\n` +
                       `> ${BULLET_EMOJI} **Requested By:** <@${interaction.user.id}>`
            },
            { type: 14, divider: true },
            {
              type: 10,
              content: `-# **Athena Prime Multimedia Engine \u00b7 High-Fidelity Dual-Pass Palette Renderer**`
            }
          ]
        };

        const payload = sanitizeCV2Payload({
          components: [containerJson],
          files: [attachment],
          flags: MessageFlags.IsComponentsV2
        });

        return interaction.editReply(payload);
      } catch (err) {
        console.error('[togif Slash Error]:', err);
        return interaction.editReply({
          ...cv2.danger(
            `Conversion Failed | ${WRONG_EMOJI}`,
            `Failed to convert the video to GIF: \`${err.message || 'Unknown processing error'}\`\n\n` +
            `> -# ${BULLET_EMOJI} Ensure the video file is valid and accessible.\n` +
            `> -# ${BULLET_EMOJI} Large files exceeding 25MB or corrupted streams cannot be converted.`
          )
        });
      }
    }
  }
];
