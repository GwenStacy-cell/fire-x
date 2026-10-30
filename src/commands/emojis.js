import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  MessageFlags, 
  AttachmentBuilder, 
  ApplicationCommandOptionType 
} from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { isBotOwnerSync } from '../utils/helpers.js';
import { TICK_EMOJI, UPTIME_EMOJI } from '../utils/emojis.js';

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

export const commands = [
  {
    name: 'emojis',
    aliases: ['animatedemojis', 'emojilist', 'emojids', 'emojid', 'getemojis', 'allemojis', 'emojirole'],
    description: 'Inspect and extract animated or static emoji IDs formatted as <a:name:id>',
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

      const isServerOwner = (message.guild && message.guild.ownerId === message.author.id) || isBotOwnerSync(message.author.id);
      if (!isServerOwner) {
        return message.reply(cv2.danger('Access Denied', 'This command is strictly reserved for the **Server Owner** or **Bot Owner**.', false));
      }

      const q = (args[0] || '').trim().toLowerCase();

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
