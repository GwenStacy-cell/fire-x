import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  MessageFlags, 
  AttachmentBuilder, 
  ApplicationCommandOptionType,
  PermissionFlagsBits
} from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { isBotOwnerSync, isExtraOwner } from '../utils/helpers.js';
import { TICK_EMOJI, UPTIME_EMOJI, BULLET_EMOJI, getRandomHeadingGlyph } from '../utils/emojis.js';
import { optimizeEmojiBuffer } from './utility.js';
import { handleFileUploadPublish } from './fileupload.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import util from 'util';
import { exec } from 'child_process';

const execPromise = util.promisify(exec);

const TICK = TICK_EMOJI;
const STATUS = UPTIME_EMOJI;

/**
 * Builds the interactive Component V2 panel for emoji inspection & copying.
 */
export async function buildEmojiPanel(guild, options = {}) {
  const {
    type = 'animated',      // 'animated' | 'static' | 'all'
    mode = 'formatted',     // 'formatted' | 'raw'
    scope = 'guild',        // 'guild' | 'global'
    page = 0,
    search = ''
  } = options;

  let emojiCollection;
  if (scope === 'global') {
    emojiCollection = guild.client.emojis.cache;
  } else {
    try {
      emojiCollection = await guild.emojis.fetch();
    } catch {
      emojiCollection = guild.emojis.cache;
    }
  }

  const allList = Array.from(emojiCollection.values());
  const totalGuildCount = allList.length;
  const animatedCount = allList.filter(e => e.animated).length;
  const staticCount = allList.filter(e => !e.animated).length;

  // Filter by type
  let filtered = allList;
  if (type === 'animated') {
    filtered = allList.filter(e => e.animated);
  } else if (type === 'static') {
    filtered = allList.filter(e => !e.animated);
  }

  // Filter by search query if provided
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(e => e.name.toLowerCase().includes(q) || e.id === q);
  }

  // Sort alphabetically by name
  filtered.sort((a, b) => a.name.localeCompare(b.name));

  const typeLabel = type === 'animated' ? 'Animated' : type === 'static' ? 'Static' : 'All';
  const perPage = mode === 'raw' ? 25 : 8;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(Math.max(0, page), totalPages - 1);
  const pageItems = filtered.slice(currentPage * perPage, (currentPage + 1) * perPage);

  const title = scope === 'global'
    ? `Global ${typeLabel} Emojis | ${TICK}`
    : `${typeLabel} Emojis | ${TICK}`;

  let desc = `> -# **Server:** **${guild.name}** (\`${guild.id}\`)\n` +
             `> -# **Server Inventory:** **${totalGuildCount} Total** (**${animatedCount} Animated**, **${staticCount} Static**)\n` +
             `> -# **Active View:** **${filtered.length} ${typeLabel} Emojis** • **Page ${currentPage + 1} of ${totalPages}**\n\n`;

  if (filtered.length === 0) {
    desc += `> -# **Notice:** No ${typeLabel.toLowerCase()} emojis found in this server.\n` +
            `> -# Use the filter buttons below to inspect other emoji categories!`;
  } else if (mode === 'raw') {
    desc += `**Direct Copyable Raw Format (\`<a:name:id>\`):**\n` +
            `*Click or tap inside the codeblock below to copy all strings directly:*\n\n` +
            '```text\n' +
            pageItems.map(e => e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`).join('\n') +
            '\n```';
  } else {
    desc += `**Emoji Inventory & Formatted IDs:**\n\n`;
    for (const e of pageItems) {
      const emojiStr = e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`;
      const dlUrl = e.imageURL({ size: 128, extension: e.animated ? 'gif' : 'webp' });
      desc += `${emojiStr} \`${emojiStr}\`\n` +
              `> -# • **Name:** \`${e.name}\` | **ID:** \`${e.id}\` | [Asset CDN](${dlUrl})\n`;
    }
  }

  const panel = cv2.info(
    title,
    desc,
    [],
    `Athena Emoji Engine • Page ${currentPage + 1}/${totalPages} (${filtered.length} total)`,
    0x5865F2
  );

  // Row 1: Pagination & Mode Controls
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`emoj_nav:${type}:${mode}:${scope}:${currentPage - 1}:${search || 'none'}`)
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId(`emoj_page_indicator`)
      .setLabel(`${currentPage + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`emoj_nav:${type}:${mode}:${scope}:${currentPage + 1}:${search || 'none'}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`emoj_mode:${type}:${mode === 'raw' ? 'formatted' : 'raw'}:${scope}:${currentPage}:${search || 'none'}`)
      .setLabel(mode === 'raw' ? '📱 Formatted View' : '📋 Raw IDs (Copy)')
      .setStyle(mode === 'raw' ? ButtonStyle.Success : ButtonStyle.Primary)
  );

  // Row 2: Category Filter Tabs & Download
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`emoj_type:animated:${mode}:${scope}:0:${search || 'none'}`)
      .setLabel(`Animated (${animatedCount})`)
      .setStyle(type === 'animated' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`emoj_type:static:${mode}:${scope}:0:${search || 'none'}`)
      .setLabel(`Static (${staticCount})`)
      .setStyle(type === 'static' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`emoj_type:all:${mode}:${scope}:0:${search || 'none'}`)
      .setLabel(`All (${totalGuildCount})`)
      .setStyle(type === 'all' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`emoj_export:${type}:${scope}`)
      .setLabel('📥 Export (.txt)')
      .setStyle(ButtonStyle.Secondary)
  );

  if (panel.components && panel.components[0] && panel.components[0].type === 17) {
    panel.components[0].components.push(
      { type: 14, divider: true },
      row1.toJSON(),
      row2.toJSON()
    );
  } else {
    panel.components.push(row1, row2);
  }

  return panel;
}

/**
 * Builds single emoji inspection card.
 */
export function buildSingleEmojiCard(emoji, guild) {
  const emojiStr = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
  const isGif = emoji.animated;
  const dlUrl = emoji.imageURL({ size: 512, extension: isGif ? 'gif' : 'webp' });
  const createdUnix = Math.floor(emoji.createdTimestamp / 1000);

  const desc = 
    `> -# **Preview:** ${emojiStr}\n` +
    `> -# **Discord Format:** \`${emojiStr}\`\n` +
    `> -# **Escaped String:** \\${emojiStr}\n` +
    `> -# **Emoji ID:** \`${emoji.id}\`\n` +
    `> -# **Emoji Name:** \`${emoji.name}\`\n` +
    `> -# **Animation:** \`${isGif ? 'Animated (GIF)' : 'Static (PNG/WEBP)'}\`\n` +
    `> -# **Server Source:** **${emoji.guild?.name || guild?.name || 'External'}** (\`${emoji.guild?.id || guild?.id || 'Unknown'}\`)\n` +
    `> -# **Created At:** <t:${createdUnix}:F> (<t:${createdUnix}:R>)\n` +
    `> -# **Download Asset:** [Click here for 512px High-Res](${dlUrl})\n\n` +
    `**Direct Copy Block:**\n` +
    '```text\n' +
    emojiStr + '\n' +
    '```';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Download High-Res Asset')
      .setStyle(ButtonStyle.Link)
      .setURL(dlUrl)
  );

  const card = cv2.info(
    `Emoji Inspector | ${TICK}`,
    desc,
    [],
    'Athena Emoji Inspector • Sub-Millisecond Analysis',
    0x5865F2
  );

  if (card.components && card.components[0] && card.components[0].type === 17) {
    card.components[0].components.push({ type: 14, divider: true }, row.toJSON());
  } else {
    card.components.push(row);
  }

  return card;
}

/**
 * Handles all interaction callbacks prefixed with `emoj_`.
 */
export async function handleEmojiInteractions(interaction) {
  if (!interaction.customId || !interaction.customId.startsWith('emoj_')) return false;

  const isServerOwner = (interaction.guild && interaction.guild.ownerId === interaction.user.id) || isBotOwnerSync(interaction.user.id);
  if (!isServerOwner) {
    return interaction.reply({
      content: '-# **Access Denied:** Only the **Server Owner** or **Bot Owner** can interact with the Emoji Matrix.',
      flags: MessageFlags.Ephemeral
    });
  }

  const [action, p1, p2, p3, p4, p5] = interaction.customId.split(':');

  if (action === 'emoj_noop') {
    return interaction.deferUpdate().catch(() => null);
  }

  if (action === 'emoj_export') {
    const type = p1 || 'animated';
    const scope = p2 || 'guild';

    let emojiCollection = scope === 'global' ? interaction.client.emojis.cache : interaction.guild.emojis.cache;
    let list = Array.from(emojiCollection.values());
    if (type === 'animated') list = list.filter(e => e.animated);
    else if (type === 'static') list = list.filter(e => !e.animated);

    list.sort((a, b) => a.name.localeCompare(b.name));
    const lines = list.map(e => e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`).join('\n');
    const filename = `${interaction.guild.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${type}_emojis.txt`;
    const attachment = new AttachmentBuilder(Buffer.from(lines, 'utf-8'), { name: filename });

    return interaction.reply({
      content: `-# **Export Complete | ${TICK}** Generated export file containing **${list.length} ${type} emoji strings**:`,
      files: [attachment],
      flags: MessageFlags.Ephemeral
    });
  }

  let type = 'animated';
  let mode = 'formatted';
  let scope = 'guild';
  let page = 0;
  let search = '';

  if (action === 'emoj_nav') {
    type = p1 || 'animated';
    mode = p2 || 'formatted';
    scope = p3 || 'guild';
    page = parseInt(p4, 10) || 0;
    search = p5 === 'none' ? '' : (p5 || '');
  } else if (action === 'emoj_mode') {
    type = p1 || 'animated';
    mode = p2 || 'formatted';
    scope = p3 || 'guild';
    page = parseInt(p4, 10) || 0;
    search = p5 === 'none' ? '' : (p5 || '');
  } else if (action === 'emoj_type') {
    type = p1 || 'animated';
    mode = p2 || 'formatted';
    scope = p3 || 'guild';
    page = parseInt(p4, 10) || 0;
    search = p5 === 'none' ? '' : (p5 || '');
  }

  const payload = await buildEmojiPanel(interaction.guild, { type, mode, scope, page, search });
  return cv2.respond(interaction, payload, 7);
}

/**
 * Scans a binary buffer (such as an .exe, archive, or binary asset) and extracts
 * embedded PNG and GIF images.
 */
function carveImagesFromBuffer(buffer, maxImages = 100) {
  const images = [];
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pngIend = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

  let offset = 0;
  while (offset < buffer.length && images.length < maxImages) {
    const start = buffer.indexOf(pngHeader, offset);
    if (start === -1) break;
    const end = buffer.indexOf(pngIend, start + 8);
    if (end === -1) {
      offset = start + 8;
      continue;
    }
    const fullEnd = end + 8;
    const imgBuf = buffer.subarray(start, fullEnd);
    if (imgBuf.length >= 68 && imgBuf.length <= 10 * 1024 * 1024) {
      images.push({
        name: `emoji_${images.length + 1}`,
        buffer: Buffer.from(imgBuf),
        isAnimated: false
      });
    }
    offset = fullEnd;
  }

  // Scan for GIF images if room allows
  offset = 0;
  const gif87 = Buffer.from('GIF87a');
  const gif89 = Buffer.from('GIF89a');
  while (offset < buffer.length && images.length < maxImages) {
    const s87 = buffer.indexOf(gif87, offset);
    const s89 = buffer.indexOf(gif89, offset);
    let start = -1;
    if (s87 !== -1 && s89 !== -1) start = Math.min(s87, s89);
    else if (s87 !== -1) start = s87;
    else if (s89 !== -1) start = s89;
    if (start === -1) break;

    // Search for GIF trailer 0x3B (at least 32 bytes ahead)
    let end = buffer.indexOf(0x3b, start + 32);
    if (end === -1 || (end - start) > 10 * 1024 * 1024) {
      offset = start + 6;
      continue;
    }
    const fullEnd = end + 1;
    const gifBuf = buffer.subarray(start, fullEnd);
    if (gifBuf.length >= 32) {
      images.push({
        name: `animated_emoji_${images.length + 1}`,
        buffer: Buffer.from(gifBuf),
        isAnimated: true
      });
    }
    offset = fullEnd;
  }

  return images;
}

export { handleFileUploadPublish };
export const handleEmojiUpload = handleFileUploadPublish;

/**
 * Handles batch importing emojis into server slots from JSON, ZIP, or EXE files.
 */
export async function handleEmojiBatchImport(message, args = []) {
  if (!message.guild) {
    return message.reply(cv2.warn('Guild Only', 'This command can only be used in a server.'));
  }

  const isOwner = (message.guild && message.guild.ownerId === message.author.id) ||
                  isBotOwnerSync(message.author.id) ||
                  isExtraOwner(message.guild.id, message.author.id);
  const hasPerm = message.member?.permissions?.has(PermissionFlagsBits.ManageGuildExpressions) ||
                  message.member?.permissions?.has(PermissionFlagsBits.Administrator);

  if (!isOwner && !hasPerm) {
    return message.reply(cv2.danger('Access Denied', 'You require the **Manage Emojis & Stickers** permission or Server Owner status to upload emojis.'));
  }

  let uploadMsg = message;

  // If no attachment in command message, prompt user and await their upload
  if (!message.attachments || message.attachments.size === 0) {
    await message.reply(cv2.info('Emjs', 'Please upload/attach the JSON, ZIP, or EXE emoji file in your next message. You have 2 minutes...'));

    const filter = m => m.author.id === message.author.id;
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 120000, errors: ['time'] }).catch(() => null);

    if (!collected || collected.size === 0) {
      return message.channel.send(cv2.warn('Upload Timed Out', 'Upload timed out. Please run the command again and attach your JSON, ZIP, or EXE file.'));
    }

    uploadMsg = collected.first();
  }

  if (!uploadMsg.attachments || uploadMsg.attachments.size === 0) {
    return message.channel.send(cv2.warn('Upload Timed Out', 'No attachments detected. Please run the command again and attach your JSON, ZIP, or EXE file.'));
  }

  const waitMsg = await message.channel.send(cv2.info('Uploading Emojis', '<a:loading:1542155051286396938> Processing uploaded emoji archive / file...'));

  const itemsToUpload = []; // { name, buffer, isAnimated }
  const tempDirsToClean = [];

  try {
    for (const attachment of uploadMsg.attachments.values()) {
      const fileName = attachment.name.toLowerCase();

      // Case 1: JSON file
      if (fileName.endsWith('.json') || fileName.endsWith('.txt')) {
        const res = await fetch(attachment.url);
        const text = await res.text();
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          // Check if plain text with emoji mentions
          const lines = text.split('\n');
          for (const line of lines) {
            const m = line.match(/<(a)?:([a-zA-Z0-9_]+):(\d+)>/);
            if (m) {
              const isAnim = !!m[1];
              const ext = isAnim ? 'gif' : 'png';
              const dlUrl = `https://cdn.discordapp.com/emojis/${m[3]}.${ext}?size=256&quality=lossless`;
              try {
                const imgRes = await fetch(dlUrl);
                if (imgRes.ok) {
                  const buf = Buffer.from(await imgRes.arrayBuffer());
                  itemsToUpload.push({ name: m[2], buffer: buf, isAnimated: isAnim });
                }
              } catch {}
            }
          }
        }

        if (parsed) {
          // If array: [ { name, url }, ... ] or [ "<:name:id>", ... ]
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (typeof item === 'string') {
                const m = item.match(/<(a)?:([a-zA-Z0-9_]+):(\d+)>/);
                if (m) {
                  const isAnim = !!m[1];
                  const dlUrl = `https://cdn.discordapp.com/emojis/${m[3]}.${isAnim ? 'gif' : 'png'}?size=256&quality=lossless`;
                  try {
                    const imgRes = await fetch(dlUrl);
                    if (imgRes.ok) {
                      itemsToUpload.push({ name: m[2], buffer: Buffer.from(await imgRes.arrayBuffer()), isAnimated: isAnim });
                    }
                  } catch {}
                }
              } else if (item && typeof item === 'object') {
                const name = item.name || item.title || item.id;
                const url = item.url || item.image || item.data || item.link;
                if (name && url) {
                  try {
                    const imgRes = await fetch(url);
                    if (imgRes.ok) {
                      const buf = Buffer.from(await imgRes.arrayBuffer());
                      const isAnim = url.includes('.gif') || (item.animated === true);
                      itemsToUpload.push({ name, buffer: buf, isAnimated: isAnim });
                    }
                  } catch {}
                }
              }
            }
          } else if (typeof parsed === 'object') {
            const emojiList = Array.isArray(parsed.emojis) ? parsed.emojis : null;
            if (emojiList) {
              for (const item of emojiList) {
                const name = item.name || item.id;
                const url = item.url || item.image || (item.id ? `https://cdn.discordapp.com/emojis/${item.id}.${item.animated ? 'gif' : 'png'}?size=256&quality=lossless` : null);
                if (name && url) {
                  try {
                    const imgRes = await fetch(url);
                    if (imgRes.ok) {
                      itemsToUpload.push({ name, buffer: Buffer.from(await imgRes.arrayBuffer()), isAnimated: !!item.animated || url.includes('.gif') });
                    }
                  } catch {}
                }
              }
            } else {
              // Key-value pairs: { "name": "url" }
              for (const [name, url] of Object.entries(parsed)) {
                if (typeof url === 'string' && url.startsWith('http')) {
                  try {
                    const imgRes = await fetch(url);
                    if (imgRes.ok) {
                      itemsToUpload.push({ name, buffer: Buffer.from(await imgRes.arrayBuffer()), isAnimated: url.includes('.gif') });
                    }
                  } catch {}
                }
              }
            }
          }
        }
      }

      // Case 2: ZIP / EXE / 7Z / RAR / Archive
      else if (['.zip', '.exe', '.7z', '.rar', '.tar', '.gz'].some(ext => fileName.endsWith(ext))) {
        const res = await fetch(attachment.url);
        const fileBuf = Buffer.from(await res.arrayBuffer());
        const fileExt = path.extname(fileName) || '.zip';
        const tempArchive = path.join(os.tmpdir(), `emjs_${Date.now()}${fileExt}`);
        const extractDir = path.join(os.tmpdir(), `emjs_extracted_${Date.now()}`);
        fs.writeFileSync(tempArchive, fileBuf);
        fs.mkdirSync(extractDir, { recursive: true });
        tempDirsToClean.push(tempArchive, extractDir);

        // Try extracting via 7z first (handles .exe SFX, .zip, .rar, .7z)
        try {
          await execPromise(`7z x "${tempArchive}" -o"${extractDir}" -y`);
        } catch {
          try {
            await execPromise(`tar -xf "${tempArchive}" -C "${extractDir}"`);
          } catch {
            if (fileExt === '.zip') {
              try {
                await execPromise(`powershell -command "Expand-Archive -Path '${tempArchive}' -DestinationPath '${extractDir}' -Force"`);
              } catch {}
            }
          }
        }

        // Recursively find images
        function walkDir(dir) {
          const files = fs.readdirSync(dir, { withFileTypes: true });
          for (const f of files) {
            const full = path.join(dir, f.name);
            if (f.isDirectory()) {
              walkDir(full);
            } else if (f.isFile()) {
              const ext = path.extname(f.name).toLowerCase();
              if (['.png', '.gif', '.jpg', '.jpeg', '.webp'].includes(ext)) {
                const baseName = path.basename(f.name, ext);
                const buf = fs.readFileSync(full);
                itemsToUpload.push({ name: baseName, buffer: buf, isAnimated: ext === '.gif' });
              }
            }
          }
        }
        walkDir(extractDir);

        // If directory extraction yielded no images (e.g. standalone PE executable or raw packed .exe), carve from buffer
        if (itemsToUpload.length === 0) {
          const carved = carveImagesFromBuffer(fileBuf);
          if (carved.length > 0) {
            itemsToUpload.push(...carved);
          }
        }
      }

      // Case 3: Direct image files
      else if (['.png', '.gif', '.jpg', '.jpeg', '.webp'].some(ext => fileName.endsWith(ext))) {
        const ext = path.extname(fileName);
        const baseName = path.basename(fileName, ext);
        const res = await fetch(attachment.url);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          itemsToUpload.push({ name: baseName, buffer: buf, isAnimated: ext === '.gif' });
        }
      }
    }

    if (itemsToUpload.length === 0) {
      return waitMsg.edit(cv2.warn('No Emojis Found', 'No valid emojis found in the uploaded file. Please ensure your JSON contains emoji URLs or your ZIP contains images.'));
    }

    // Now upload emojis to server
    const createdEmojis = [];
    let failedCount = 0;

    for (const item of itemsToUpload) {
      try {
        let cleanName = item.name.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32);
        if (cleanName.length < 2) cleanName = `emoji_${cleanName}`;

        let finalBuf = item.buffer;
        if (finalBuf.length > 256 * 1024) {
          finalBuf = await optimizeEmojiBuffer(finalBuf, item.isAnimated);
        }

        const newEmoji = await message.guild.emojis.create({
          attachment: finalBuf,
          name: cleanName
        });
        createdEmojis.push(newEmoji);
      } catch (err) {
        failedCount++;
      }
    }

    const preview = createdEmojis.slice(0, 30).map(e => e.toString()).join(' ');
    const desc = 
      `-# ${BULLET_EMOJI} **Successfully Uploaded:** \`${createdEmojis.length}\` emoji(s)\n` +
      (failedCount > 0 ? `-# ${BULLET_EMOJI} **Failed / Skipped:** \`${failedCount}\` emoji(s)\n` : '') +
      `-# ${BULLET_EMOJI} **Total Server Inventory:** \`${message.guild.emojis.cache.size}\` emojis\n\n` +
      (preview ? `**Emoji Previews:**\n${preview}` : '');

    return waitMsg.edit(cv2.success('Emoji Upload Complete', desc));

  } catch (err) {
    return waitMsg.edit(cv2.danger('Upload Error', `An unexpected error occurred: \`${err.message}\``));
  } finally {
    for (const p of tempDirsToClean) {
      try {
        if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
      } catch {}
    }
  }
}

export const commands = [
  {
    name: 'emojis',
    aliases: ['emjs', 'emoji', 'emj', 'animatedemojis', 'emojilist', 'emojids', 'emojid', 'getemojis', 'allemojis', 'emojirole'],
    description: 'Inspect, manage, upload and batch export server emojis.',
    category: 'utility',
    options: [
      {
        name: 'type',
        description: 'Category of emojis to display',
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: 'Animated Only (Default)', value: 'animated' },
          { name: 'Static Only', value: 'static' },
          { name: 'All Emojis', value: 'all' }
        ]
      },
      {
        name: 'mode',
        description: 'Output format style',
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: 'Formatted UI with previews', value: 'formatted' },
          { name: 'Raw Copyable Codeblock', value: 'raw' }
        ]
      },
      {
        name: 'query',
        description: 'Search by emoji name, or paste an emoji to inspect its raw ID',
        type: ApplicationCommandOptionType.String,
        required: false
      }
    ],

    async executePrefix(message, args) {
      if (!message.guild) {
        return message.reply(cv2.warn('Guild Only', 'This command can only be used in a server.'));
      }

      const q = (args[0] || '').trim().toLowerCase();

      // Subcommand: upload .exe, .json, or .zip file with title/note to designated channel
      if (q === 'upload' || q === 'postfile' || q === 'publishfile') {
        return handleFileUploadPublish(message, args.slice(1));
      }

      // Subcommand: import custom emojis into server slots
      if (q === 'import') {
        return handleEmojiBatchImport(message, args.slice(1));
      }

      const isServerOwner = (message.guild && message.guild.ownerId === message.author.id) ||
                            isBotOwnerSync(message.author.id) ||
                            isExtraOwner(message.guild.id, message.author.id);
      if (!isServerOwner) {
        return message.reply(cv2.danger('Access Denied', 'This command is strictly reserved for the **Server Owner**, designated **Extra Owners**, or **Bot Owner**.', false));
      }

      // Check if user is inspecting a specific emoji or raw ID
      if (q && q !== 'animated' && q !== 'static' && q !== 'all' && q !== 'raw' && q !== 'global' && q !== 'bot') {
        const fullInput = args.join(' ').trim();
        // Check mention match: <:name:id> or <a:name:id>
        const mentionMatch = fullInput.match(/<(a)?:([a-zA-Z0-9_]+):(\d+)>/);
        let targetEmoji = null;

        if (mentionMatch) {
          const emojiId = mentionMatch[3];
          targetEmoji = message.guild.emojis.cache.get(emojiId) || message.client.emojis.cache.get(emojiId);
          if (!targetEmoji) {
            // Mock synthetic emoji from raw mention so user still gets full details
            targetEmoji = {
              id: emojiId,
              name: mentionMatch[2],
              animated: !!mentionMatch[1],
              createdTimestamp: Number((BigInt(emojiId) >> 22n) + 1420070400000n),
              imageURL: ({ size = 512, extension } = {}) =>
                `https://cdn.discordapp.com/emojis/${emojiId}.${mentionMatch[1] ? 'gif' : 'webp'}?size=${size}`
            };
          }
        } else if (/^\d{17,20}$/.test(q)) {
          targetEmoji = message.guild.emojis.cache.get(q) || message.client.emojis.cache.get(q);
        } else {
          targetEmoji = message.guild.emojis.cache.find(e => e.name.toLowerCase() === q) ||
                        message.client.emojis.cache.find(e => e.name.toLowerCase() === q);
        }

        if (targetEmoji) {
          const card = buildSingleEmojiCard(targetEmoji, message.guild);
          return message.reply(card);
        }
      }

      let type = 'animated';
      let mode = 'formatted';
      let scope = 'guild';
      let search = '';

      if (q === 'static') type = 'static';
      else if (q === 'all') type = 'all';
      else if (q === 'animated') type = 'animated';

      if (args.includes('raw') || q === 'raw') mode = 'raw';
      if (args.includes('global') || args.includes('bot') || q === 'global' || q === 'bot') scope = 'global';

      const payload = await buildEmojiPanel(message.guild, { type, mode, scope, page: 0, search });
      return message.reply(payload);
    },

    async executeSlash(interaction) {
      if (!interaction.guild) {
        return interaction.reply({ content: '-# This command can only be used in a server.', flags: MessageFlags.Ephemeral });
      }

      const isServerOwner = (interaction.guild && interaction.guild.ownerId === interaction.user.id) || isBotOwnerSync(interaction.user.id);
      if (!isServerOwner) {
        return interaction.reply({
          ...cv2.danger('Access Denied', 'This command is strictly reserved for the **Server Owner** or **Bot Owner**.', false),
          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
        });
      }

      const typeOpt = interaction.options.getString('type') || 'animated';
      const modeOpt = interaction.options.getString('mode') || 'formatted';
      const query = interaction.options.getString('query')?.trim() || '';

      if (query) {
        const mentionMatch = query.match(/<(a)?:([a-zA-Z0-9_]+):(\d+)>/);
        let targetEmoji = null;

        if (mentionMatch) {
          const emojiId = mentionMatch[3];
          targetEmoji = interaction.guild.emojis.cache.get(emojiId) || interaction.client.emojis.cache.get(emojiId);
          if (!targetEmoji) {
            targetEmoji = {
              id: emojiId,
              name: mentionMatch[2],
              animated: !!mentionMatch[1],
              createdTimestamp: Number((BigInt(emojiId) >> 22n) + 1420070400000n),
              imageURL: ({ size = 512, extension } = {}) =>
                `https://cdn.discordapp.com/emojis/${emojiId}.${mentionMatch[1] ? 'gif' : 'webp'}?size=${size}`
            };
          }
        } else if (/^\d{17,20}$/.test(query)) {
          targetEmoji = interaction.guild.emojis.cache.get(query) || interaction.client.emojis.cache.get(query);
        } else {
          targetEmoji = interaction.guild.emojis.cache.find(e => e.name.toLowerCase() === query.toLowerCase()) ||
                        interaction.client.emojis.cache.find(e => e.name.toLowerCase() === query.toLowerCase());
        }

        if (targetEmoji) {
          const card = buildSingleEmojiCard(targetEmoji, interaction.guild);
          return interaction.reply(card);
        }
      }

      const payload = await buildEmojiPanel(interaction.guild, { 
        type: typeOpt, 
        mode: modeOpt, 
        scope: 'guild', 
        page: 0, 
        search: query 
      });
      return interaction.reply(payload);
    }
  }
];
