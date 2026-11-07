import { AttachmentBuilder, MessageFlags } from 'discord.js';
import fetch from 'node-fetch';
import cv2 from '../cv2.js';
import { 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  UPTIME_EMOJI, 
  getRandomHeadingGlyph 
} from '../utils/emojis.js';
import { 
  generateMemeImage, 
  captionImage, 
  applyImageFilter, 
  buildMemeCV2Payload, 
  MEME_TEMPLATES 
} from '../utils/memeEngine.js';

async function resolveTargetImageUrl(message, args = []) {
  // 1. Direct attachment in current message
  if (message.attachments.first()) {
    const att = message.attachments.first();
    if (att.contentType?.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(att.name)) {
      return att.url;
    }
  }

  // 2. Mentioned user avatar
  const mention = message.mentions.users.first();
  if (mention) {
    return mention.displayAvatarURL({ extension: 'png', size: 1024, forceStatic: true });
  }

  // 3. Replied-to message attachment or avatar
  if (message.reference && message.reference.messageId) {
    try {
      const refMsg = await message.channel.messages.fetch(message.reference.messageId);
      if (refMsg?.attachments.first()) {
        const att = refMsg.attachments.first();
        if (att.contentType?.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(att.name)) {
          return att.url;
        }
      }
      if (refMsg?.author) {
        return refMsg.author.displayAvatarURL({ extension: 'png', size: 1024, forceStatic: true });
      }
    } catch {}
  }

  // 4. URL in text arguments
  const urlArg = args.find(a => /^https?:\/\/[^\s]+$/i.test(a));
  if (urlArg) return urlArg;

  // 5. Fallback to command author's avatar
  return message.author.displayAvatarURL({ extension: 'png', size: 1024, forceStatic: true });
}

export const commands = [
  // --- MEME GENERATOR ---
  {
    name: 'meme',
    aliases: ['memegen', 'makememe'],
    description: 'Generate high-definition memes from popular templates with custom text',
    category: 'engagement',
    options: [
      { name: 'template', description: 'Meme template name (e.g. drake, distracted, doge)', type: 3, required: true },
      { name: 'top_text', description: 'Top meme caption', type: 3, required: false },
      { name: 'bottom_text', description: 'Bottom meme caption', type: 3, required: false }
    ],

    async executePrefix(message, args) {
      if (args.length === 0) {
        const templateList = MEME_TEMPLATES.map(t => 
          `${BULLET_EMOJI} \`${t.id}\` — **${t.name}** (\`${t.aliases.join(', ')}\`)`
        ).join('\n');

        return message.reply(cv2.panel(
          `Meme Studio Templates | ${TICK_EMOJI}`,
          `Create memes instantly using \`!meme <template> [top text] | [bottom text]\`\n\n` +
          `**__Popular Templates:__**\n${templateList}\n\n` +
          `**Examples:**\n` +
          `${BULLET_EMOJI} \`!meme drake Writing code | Fixing bugs\`\n` +
          `${BULLET_EMOJI} \`!meme doge 2010 gamer | 2026 gamer\`\n` +
          `${BULLET_EMOJI} \`!meme change Athena is the best Discord bot\``
        ));
      }

      const template = args[0].toLowerCase();
      const textRaw = args.slice(1).join(' ');
      let topText = '';
      let bottomText = '';

      if (textRaw.includes('|')) {
        const parts = textRaw.split('|');
        topText = parts[0].trim();
        bottomText = parts.slice(1).join('|').trim();
      } else {
        topText = textRaw.trim() || 'TOP TEXT';
        bottomText = '';
      }

      const loadingMsg = await message.reply({
        content: `-# <a:uptime:1552608831060844575> **Synthesizing meme template \`${template}\`...**`
      }).catch(() => null);

      try {
        const { buffer, templateId } = await generateMemeImage(template, topText, bottomText);
        const attachment = new AttachmentBuilder(buffer, { name: `meme_${templateId}.png` });

        const payload = buildMemeCV2Payload(
          'Meme Synthesis Complete',
          `Template: \`${templateId}\` \u00b7 Generated for <@${message.author.id}>`,
          attachment
        );

        if (loadingMsg) await loadingMsg.delete().catch(() => {});
        return message.reply(payload);
      } catch (err) {
        console.error('[MemeCommand Error]:', err);
        const errPayload = cv2.error('Meme Generation Failed', `Failed to construct meme: \`${err.message}\``);
        if (loadingMsg) return loadingMsg.edit(errPayload);
        return message.reply(errPayload);
      }
    }
  },

  // --- CAPTION IMAGE ---
  {
    name: 'caption',
    aliases: ['addcaption', 'cap'],
    description: 'Add a modern meme caption header to any image or user avatar',
    category: 'engagement',
    options: [
      { name: 'text', description: 'Caption text to place at the top of the image', type: 3, required: true }
    ],

    async executePrefix(message, args) {
      const text = args.join(' ').trim();
      if (!text) {
        return message.reply(cv2.warn(
          `Caption Required | ${WARN_EMOJI}`,
          `Please provide a caption text: \`!caption <your text here>\`.\n` +
          `You can attach an image, mention a user, or reply to an existing image message!`
        ));
      }

      const imageUrl = await resolveTargetImageUrl(message, args);
      const loadingMsg = await message.reply({
        content: `-# <a:uptime:1552608831060844575> **Applying meme caption header...**`
      }).catch(() => null);

      try {
        const res = await fetch(imageUrl);
        const imgBuffer = await res.buffer();
        const captionedBuffer = await captionImage(imgBuffer, text);
        const attachment = new AttachmentBuilder(captionedBuffer, { name: 'captioned.png' });

        const payload = buildMemeCV2Payload(
          'Image Captioning Complete',
          `Caption: *"${text.length > 80 ? text.slice(0, 77) + '...' : text}"*`,
          attachment
        );

        if (loadingMsg) await loadingMsg.delete().catch(() => {});
        return message.reply(payload);
      } catch (err) {
        console.error('[CaptionCommand Error]:', err);
        const errPayload = cv2.error('Caption Failed', `Could not apply caption: \`${err.message}\``);
        if (loadingMsg) return loadingMsg.edit(errPayload);
        return message.reply(errPayload);
      }
    }
  },

  // --- IMAGE FX & FILTERS ---
  {
    name: 'filter',
    aliases: ['imagefilter', 'fx', 'deepfry'],
    description: 'Apply aesthetic visual FX filters to any picture, avatar, or attachment',
    category: 'engagement',
    options: [
      { name: 'type', description: 'Filter type (deepfry, glitch, grayscale, sepia, invert, pixelate, polaroid)', type: 3, required: true }
    ],

    async executePrefix(message, args) {
      const sub = (args[0] || '').toLowerCase();
      const validFilters = ['deepfry', 'glitch', 'grayscale', 'sepia', 'invert', 'pixelate', 'polaroid'];

      if (!sub || !validFilters.includes(sub)) {
        return message.reply(cv2.panel(
          `Visual FX Filter Studio | ${TICK_EMOJI}`,
          `Transform any picture or avatar using \`!filter <type> [@user | attachment]\`\n\n` +
          `**__Available FX Filters:__**\n` +
          `${BULLET_EMOJI} \`deepfry\` — High saturation, noise & explosive contrast\n` +
          `${BULLET_EMOJI} \`glitch\` — Cyberpunk RGB channel split\n` +
          `${BULLET_EMOJI} \`grayscale\` — Classic monochromatic tone\n` +
          `${BULLET_EMOJI} \`sepia\` — Vintage retro warmth\n` +
          `${BULLET_EMOJI} \`invert\` — Color negative inversion\n` +
          `${BULLET_EMOJI} \`pixelate\` — 8-bit retro gaming downsample\n` +
          `${BULLET_EMOJI} \`polaroid\` — Classic white photo frame border\n\n` +
          `**Example:** \`!filter deepfry @friend\` or reply to any image with \`!filter glitch\`!`
        ));
      }

      const imageUrl = await resolveTargetImageUrl(message, args.slice(1));
      const loadingMsg = await message.reply({
        content: `-# <a:uptime:1552608831060844575> **Processing \`${sub}\` visual FX pipeline...**`
      }).catch(() => null);

      try {
        const res = await fetch(imageUrl);
        const imgBuffer = await res.buffer();
        const filteredBuffer = await applyImageFilter(imgBuffer, sub);
        const attachment = new AttachmentBuilder(filteredBuffer, { name: `filter_${sub}.png` });

        const payload = buildMemeCV2Payload(
          'Visual Filter Applied',
          `Filter Effect: \`${sub.toUpperCase()}\` \u00b7 Rendered for <@${message.author.id}>`,
          attachment
        );

        if (loadingMsg) await loadingMsg.delete().catch(() => {});
        return message.reply(payload);
      } catch (err) {
        console.error('[FilterCommand Error]:', err);
        const errPayload = cv2.error('Filter Failed', `Could not apply filter: \`${err.message}\``);
        if (loadingMsg) return loadingMsg.edit(errPayload);
        return message.reply(errPayload);
      }
    }
  }
];

export default { commands };
