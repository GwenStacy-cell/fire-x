import { 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ChannelSelectMenuBuilder, 
  StringSelectMenuBuilder, 
  ChannelType, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  MessageFlags 
} from 'discord.js';
import cv2, { sanitizeCV2Payload } from '../cv2.js';
import { setGuildContext } from '../embed.js';
import db from '../database.js';
import { generateAIResponse } from '../utils/ai.js';
import { resolveMediaUrl, isPinterestUrl } from '../utils/pinterest.js';

// In-memory active announcement drafts keyed by message ID
export const announcementDrafts = new Map();

// Regularly clean up drafts older than 2 hours without blocking the process
setInterval(() => {
  const now = Date.now();
  for (const [key, draft] of announcementDrafts.entries()) {
    if (now - draft.lastUpdated > 2 * 60 * 60 * 1000) {
      announcementDrafts.delete(key);
    }
  }
}, 30 * 60 * 1000).unref();

/**
 * Resolves standalone custom emoji IDs in user prompts into full Discord custom emoji strings
 * Example: "1557841381630681106" -> "<a:03_tick_circle:1565665642084827206>"
 */
export function resolveCustomEmojiIds(prompt, client, guild) {
  if (!prompt || typeof prompt !== 'string') return prompt;

  return prompt.replace(/(?<!<a?:[a-zA-Z0-9_]+:)(?<!:)(\b\d{17,20}\b)/g, (match, id) => {
    let found = guild?.emojis?.cache?.get(id);
    if (!found && client?.emojis?.cache) {
      found = client.emojis.cache.get(id);
    }
    if (found) {
      return found.toString();
    }
    return `<:custom:${id}>`;
  });
}

/**
 * Restores any custom Discord emojis (<:name:id> or <a:name:id>) if the AI truncated them to <:name> or :name:
 */
export function restoreCustomEmojis(text, sourcePrompt) {
  if (!text || !sourcePrompt) return text;
  const customEmojis = sourcePrompt.match(/<a?:[a-zA-Z0-9_]+:\d+>/g) || [];
  let result = text;
  for (const emoji of customEmojis) {
    const match = emoji.match(/<a?:([a-zA-Z0-9_]+):(\d+)>/);
    if (match) {
      const [, name] = match;
      // Replace <:name> or <a:name> missing :id
      result = result.replace(new RegExp('<a?:' + name + '>', 'g'), emoji);
      // Replace standalone :name: not inside an existing full emoji tag
      result = result.replace(new RegExp('(?<!<a?:)(?<![a-zA-Z0-9_]):' + name + ':(?![0-9]+>)', 'g'), emoji);
    }
  }
  return result;
}

/**
 * Parses raw AI output containing delimiters into structured title, grey-formatted body, and footer
 */
export function parseAnnouncementOutput(rawText, fallbackPrompt = 'Server Announcement', sourcePrompt = '') {
  if (!rawText) {
    return {
      title: 'Server Announcement',
      body: '-# Important announcement for all members.',
      footer: 'Athena Prime Official Announcement'
    };
  }

  const restoredText = restoreCustomEmojis(rawText, sourcePrompt);

  let title = '';
  let body = '';
  let footer = 'Athena Prime Official Announcement';

  const titleMatch = restoredText.match(/===TITLE===\s*([\s\S]*?)(?:===BODY===|$)/i);
  const bodyMatch = restoredText.match(/===BODY===\s*([\s\S]*?)(?:===FOOTER===|$)/i);
  const footerMatch = restoredText.match(/===FOOTER===\s*([\s\S]*$)/i);

  if (titleMatch && titleMatch[1].trim()) {
    title = titleMatch[1].trim();
    body = bodyMatch ? bodyMatch[1].trim() : '';
    if (footerMatch && footerMatch[1].trim()) {
      footer = footerMatch[1].trim();
    }
  } else {
    const lines = restoredText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      title = lines[0];
      body = lines.slice(1).join('\n');
    } else {
      title = 'Server Announcement';
      body = restoredText;
    }
  }

  // Strip delimiter residues and markdown headings from title
  title = title
    .replace(/^[=\-_*~#\s]+|[=\-_*~#\s]+$/g, '')
    .replace(/^\[|\]$/g, '')
    .replace(/^#+\s*/, '')
    .replace(/^-#\s*/, '')
    .replace(/^\*\*__|\__\*\*$/g, '')
    .trim();

  footer = footer
    .replace(/^[=\-_*~#\s]+|[=\-_*~#\s]+$/g, '')
    .replace(/^\[|\]$/g, '')
    .replace(/^-#\s*/, '')
    .replace(/^\*\*__|\__\*\*$/g, '')
    .trim() || 'Athena Prime Official Announcement';

  if (!title) {
    title = fallbackPrompt.length > 40 ? fallbackPrompt.slice(0, 37) + '...' : fallbackPrompt;
  }

  return {
    title,
    body: cleanAnnouncementBody(body),
    footer
  };
}

/**
 * Ensures all body lines are formatted with Discord subtext grey fonts (-#) and grey bold underline highlights
 */
export function cleanAnnouncementBody(text) {
  if (!text) return '-# No content provided.';
  const lines = text.split('\n');
  const formatted = [];

  for (let line of lines) {
    let trimmed = line.trim();
    if (!trimmed) {
      formatted.push('');
      continue;
    }

    if (/^[=\-_*~]{2,}/.test(trimmed) || /^(?:===+)?(BODY|TITLE|FOOTER)(?:===+)?/i.test(trimmed)) {
      continue;
    }

    trimmed = trimmed.replace(/^(?:-#\s*)+/, '').trim();

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      trimmed = trimmed.slice(1, -1).trim();
    }

    if (!trimmed) continue;

    trimmed = trimmed
      .replace(/__\*\*([^*_]+)\*\*__/g, '**__$1__**')
      .replace(/\*\*(?!__)(.*?)(?<!__)\*\*/g, '**__$1__**');

    formatted.push(`-# ${trimmed}`);
  }

  return formatted.join('\n');
}

/**
 * Core AI generation engine with human-speech error handling, custom emoji placement, and thinking pipeline
 */
export async function generateAIAnnouncement(userPrompt, previousDraft = null, refinement = null, client = null, guild = null) {
  let promptText = resolveCustomEmojiIds(userPrompt, client, guild);

  if (previousDraft && refinement) {
    const resolvedRefine = resolveCustomEmojiIds(refinement, client, guild);
    promptText = `Current Announcement Draft:
Title: ${previousDraft.title}
Body:
${previousDraft.body}
Footer:
${previousDraft.footer}

User Refinement Request:
${resolvedRefine}`;
  }

  const customSystem = `You are Athena's elite Announcement Crafting Intelligence.
Your task is to transform informal, brief, or typo-filled user text into a stunning, professional, high-impact Discord announcement.

CRITICAL INSTRUCTIONS:
1. CUSTOM EMOJI & EMOJI ID EXTRACTION:
- If the user specifies an emoji or emoji ID for the heading/title (e.g., "use <:icon:123> in heading", "use emoji id 1557841381630681107 in title"), you MUST strictly include that exact custom emoji in the title.
- If the user specifies an emoji or emoji ID for bullets (e.g., "use <:trophy:123> for bullets", "use emoji id 1557841381630681106 for bullets"), you MUST strictly use that exact emoji at the start of every bullet point.
- NEVER use generic Discord native emojis like ❌, ✅, ⚠️. If no custom bullet emoji is specified, use clean stylish bullets like • or an appropriate thematic bullet.
- ALWAYS preserve full Discord custom emojis (<:name:id> or <a:name:id>) exactly as given. NEVER truncate them.

2. FORMATTING RULES:
- NEVER wrap titles or lines in square brackets.
- DO NOT repeat delimiter tags or write extra preamble.
- Output MUST strictly use the delimiters:
===TITLE===
[Title without leading # or markdown heading hashes, max 100 chars]
===BODY===
[The announcement body. EVERY line must begin with '-# ' for Discord grey subtext. Highlight key terms, dates, times, roles, prizes, or links with **__term:__**.]
===FOOTER===
[Short, elegant footer text, max 100 chars]

Example Output:
===TITLE===
<:film:987654321> Interstellar Community Movie Night
===BODY===
-# Welcome everyone! Get ready for an epic cinematic journey through space and time.
-#
-# <:popcorn:123456789> **__Movie Title:__** Interstellar (2014)
-# <:popcorn:123456789> **__Start Time:__** 8:00 PM IST
-# <:popcorn:123456789> **__Venue:__** Community Voice & Stage Channel
-# <:popcorn:123456789> **__Reminders:__** Grab your popcorn, cold drinks, and cozy setup!
-#
-# Hop in early to catch the pre-show chat. See you there!
===FOOTER===
Athena Prime Official Announcement`;

  try {
    const res = await generateAIResponse(promptText, { customSystem, raw: true });
    if (res.success && res.text) {
      return parseAnnouncementOutput(res.text, userPrompt, promptText);
    }
  } catch (err) {
    console.error('AI Announcement generation error:', err);
  }

  return {
    title: 'Server Announcement',
    body: cleanAnnouncementBody(userPrompt),
    footer: 'Athena Prime Official Announcement'
  };
}

/**
 * Builds the initial prompt intake CV2 container for !aiannounce
 */
export function buildPromptIntakeContainer(draft = null) {
  const targetText = draft?.targetChannelId ? `<#${draft.targetChannelId}>` : '`Not Selected (Choose from dropdown below)`';
  const pingText = draft?.pingMode === 'everyone' ? '@everyone' : (draft?.pingMode === 'here' ? '@here' : 'None (Silent)');

  const comps = [
    {
      type: 10,
      content: `# ${getRandomHeadingGlyph()} Athena AI Announcement Studio | <a:uptime:1552608831060844575>\n-# Transform rough ideas, typo-filled notes, or brief human bullet points into stunning server announcements.\n-# Powered by Google Gemini 3.8 Flash High Intelligence Pipeline.`
    },
    { type: 14, divider: true },
    {
      type: 10,
      content: 
        `-# ${BULLET_EMOJI} **__Custom Emoji & ID Support:__** Provide full emojis (\`<:name:id>\` / \`<a:name:id>\`) or raw **Emoji IDs** (e.g. \`1557841381630681106\`) for heading and bullets.\n` +
        `-# ${BULLET_EMOJI} **__Live Studio Preview:__** Inspect, adjust mentions, choose target channel, and fully edit heading, content, and footer before sending.\n` +
        `-# ${BULLET_EMOJI} **__Direct Command:__** \`!aiannounce <your prompt / notes>\` or write your prompt below.`
    },
    { type: 14, divider: true },
    {
      type: 10,
      content: `-# ${BULLET_EMOJI} **__Target Channel:__** ${targetText} \u00b7 **__Broadcast:__** \`${pingText}\``
    }
  ];

  // Row 1: Target Channel Select
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('aian_select_channel')
    .setPlaceholder('Select target announcement channel...')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  if (draft?.targetChannelId) {
    channelSelect.setDefaultChannels([draft.targetChannelId]);
  }
  comps.push(new ActionRowBuilder().addComponents(channelSelect).toJSON());

  // Row 2: Broadcast Mention Select
  const pingSelect = new StringSelectMenuBuilder()
    .setCustomId('aian_select_ping')
    .setPlaceholder('Select broadcast mention mode...')
    .addOptions([
      {
        label: 'Silent (No Mention)',
        value: 'none',
        description: 'Post announcement cleanly without pinging members',
        default: !draft?.pingMode || draft?.pingMode === 'none'
      },
      {
        label: '@here (Online Members)',
        value: 'here',
        description: 'Mention online and active members in the channel',
        default: draft?.pingMode === 'here'
      },
      {
        label: '@everyone (All Members)',
        value: 'everyone',
        description: 'Broadcast notification to all members of the server',
        default: draft?.pingMode === 'everyone'
      }
    ]);
  comps.push(new ActionRowBuilder().addComponents(pingSelect).toJSON());

  // Row 3: Action Buttons
  comps.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('aian_open_prompt_modal')
      .setLabel('Write Announcement Prompt')
      .setEmoji('<:1dd48b63_d55f_467f_bc5c_04df55c7:1561262243352412221>')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('aian_open_manual_modal')
      .setLabel('Create Manually')
      .setStyle(ButtonStyle.Secondary)
  ).toJSON());

  return {
    type: 17,
    components: comps
  };
}

/**
 * Builds the CV2 Container for the Announcement Studio Preview or Published Announcement
 */
export function buildAnnouncementStudioContainer(draft, isPreview = true) {
  const comps = [];

  // 1. Heading Component (Bold Heading)
  const titleText = draft.title || 'Server Announcement';
  comps.push({
    type: 10,
    content: `# ${titleText}`
  });

  comps.push({ type: 14, divider: true });

  // 2. Optional Banner / Media Gallery
  if (draft.imageUrl && /^https?:\/\//i.test(draft.imageUrl)) {
    comps.push({
      type: 12,
      items: [{ media: { url: draft.imageUrl } }]
    });
    comps.push({ type: 14, divider: true });
  }

  // Calculate safe budget for announcement body (Discord 4000 total displayable text limit)
  const footerText = draft.footer ? `-# **${draft.footer}**` : `-# **Athena Prime Official Announcement**`;
  const targetText = draft.targetChannelId ? `<#${draft.targetChannelId}>` : '`Not Selected`';
  const pingLabel = draft.pingMode === 'everyone' ? '@everyone' : (draft.pingMode === 'here' ? '@here' : 'None');
  const previewControlsText = isPreview
    ? `-# ${BULLET_EMOJI} **__AI Announcement Studio Controls:__** Target: ${targetText} \u00b7 Broadcast: \`${pingLabel}\``
    : '';

  const auxLength = titleText.length + footerText.length + (isPreview ? previewControlsText.length + 50 : 0) + 60;
  const maxBodyBudget = Math.max(800, 3800 - auxLength);

  let bodyText = draft.body || '-# No announcement content set.';
  if (bodyText.length > maxBodyBudget) {
    const notice = '\n-# *(Announcement body condensed for Discord display limits)*';
    const targetCut = maxBodyBudget - notice.length;
    let cutIdx = bodyText.lastIndexOf('\n', targetCut);
    if (cutIdx === -1 || cutIdx < targetCut * 0.7) {
      cutIdx = bodyText.lastIndexOf('. ', targetCut);
      if (cutIdx !== -1) cutIdx += 1;
    }
    if (cutIdx === -1 || cutIdx < targetCut * 0.5) {
      cutIdx = targetCut;
    }
    bodyText = bodyText.slice(0, cutIdx).trim() + notice;
  }

  comps.push({ type: 10, content: bodyText });
  comps.push({ type: 14, divider: true });
  comps.push({
    type: 10,
    content: footerText
  });

  if (isPreview) {
    comps.push({ type: 14, divider: true });
    comps.push({
      type: 10,
      content: previewControlsText
    });

    // Row 1: Target Channel Select
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId('aian_select_channel')
      .setPlaceholder('Select target announcement channel...')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
    if (draft.targetChannelId) {
      channelSelect.setDefaultChannels([draft.targetChannelId]);
    }
    const channelRow = new ActionRowBuilder().addComponents(channelSelect);
    comps.push(channelRow.toJSON());

    // Row 2: Broadcast Mention Select
    const pingSelect = new StringSelectMenuBuilder()
      .setCustomId('aian_select_ping')
      .setPlaceholder('Select broadcast mention mode...')
      .addOptions([
        {
          label: 'Silent (No Mention)',
          value: 'none',
          description: 'Post announcement cleanly without pinging members',
          default: !draft.pingMode || draft.pingMode === 'none'
        },
        {
          label: '@here (Online Members)',
          value: 'here',
          description: 'Mention online and active members in the channel',
          default: draft.pingMode === 'here'
        },
        {
          label: '@everyone (All Members)',
          value: 'everyone',
          description: 'Broadcast notification to all members of the server',
          default: draft.pingMode === 'everyone'
        }
      ]);
    const pingRow = new ActionRowBuilder().addComponents(pingSelect);
    comps.push(pingRow.toJSON());

    // Row 3: Action Buttons
    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('aian_deploy')
        .setLabel('Send Announcement')
        .setEmoji('<a:03_tick_circle:1565665642084827206>')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('aian_refine_ai')
        .setLabel('Refine with AI')
        .setEmoji('<:1dd48b63_d55f_467f_bc5c_04df55c7:1561262243352412221>')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('aian_manual_edit')
        .setLabel('Edit (Title/Body/Footer)')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('aian_set_media')
        .setLabel('Banner / Media')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('aian_discard')
        .setLabel('Discard')
        .setStyle(ButtonStyle.Danger)
    );
    comps.push(buttonRow.toJSON());
  }

  return sanitizeCV2Payload({
    type: 17,
    components: comps
  });
}

/**
 * Safely extracts or reconstructs draft from Map or from existing Discord Components V2 message
 */
function getDraftFromInteraction(interaction) {
  const msgId = interaction.message?.id;
  if (msgId && announcementDrafts.has(msgId)) {
    return announcementDrafts.get(msgId);
  }

  const components = interaction.message?.components || [];
  let title = 'Server Announcement';
  let body = '';
  let footer = 'Athena Prime Official Announcement';
  let imageUrl = null;
  let targetChannelId = null;
  let pingMode = 'none';

  try {
    for (const comp of components) {
      if (comp.type === 17 && Array.isArray(comp.components)) {
        for (const inner of comp.components) {
          if (inner.type === 10 && inner.content) {
            if (inner.content.startsWith('# ') && title === 'Server Announcement') {
              title = inner.content.replace(/^#\s*/, '').trim();
            } else if (inner.content.includes('Target Channel:') || inner.content.includes('Target:')) {
              const chMatch = inner.content.match(/Target(?:\s*Channel)?:\s*<#(\d+)>/);
              if (chMatch) targetChannelId = chMatch[1];
              const pingMatch = inner.content.match(/Broadcast:\s*`([^`]+)`/);
              if (pingMatch) {
                const p = pingMatch[1].trim();
                pingMode = p === '@everyone' ? 'everyone' : (p === '@here' ? 'here' : 'none');
              }
            } else if (inner.content.startsWith('-#') && !inner.content.includes('AI Announcement Studio Controls')) {
              if (!body) {
                body = inner.content;
              } else if (inner.content.startsWith('-# **') && inner.content.endsWith('**')) {
                footer = inner.content.slice(5, -2).trim();
              }
            }
          }
          if (inner.type === 1 && Array.isArray(inner.components)) {
            for (const c of inner.components) {
              if (c.custom_id === 'aian_select_channel' && c.default_values?.[0]?.id) {
                targetChannelId = c.default_values[0].id;
              }
            }
          }
          if (inner.type === 12 && inner.items?.[0]?.media?.url) {
            imageUrl = inner.items[0].media.url;
          }
        }
      }
    }
  } catch (e) {}

  const restoredDraft = {
    authorId: interaction.user.id,
    guildId: interaction.guildId,
    title,
    body: body || '-# No announcement content set.',
    footer,
    imageUrl,
    targetChannelId,
    pingMode,
    originalPrompt: '',
    lastUpdated: Date.now()
  };

  if (msgId) {
    announcementDrafts.set(msgId, restoredDraft);
  }
  return restoredDraft;
}

export const commands = [
  {
    name: 'aiannounce',
    description: 'Launch the AI Announcement Studio to craft, format, preview, and broadcast announcements.',
    category: 'moderation',
    aliases: ['aian', 'ai-announce', 'smartannounce', 'studioannounce'],
    permissions: [PermissionFlagsBits.ManageMessages],
    options: [
      {
        name: 'prompt',
        description: 'Describe what to announce (AI will enhance, fix typos, format, and apply emojis)',
        type: 3, // STRING
        required: false
      },
      {
        name: 'channel',
        description: 'Target channel to broadcast the announcement to',
        type: 7, // CHANNEL
        required: false
      }
    ],
    async executePrefix(message, args) {
      if (message.guild) setGuildContext(message.guild.id);

      const prompt = args.join(' ').trim();
      if (!prompt) {
        const draft = {
          authorId: message.author.id,
          guildId: message.guild.id,
          title: 'Server Announcement',
          body: '',
          footer: 'Athena Prime Official Announcement',
          imageUrl: null,
          targetChannelId: null,
          pingMode: 'none',
          originalPrompt: '',
          lastUpdated: Date.now()
        };
        const intake = buildPromptIntakeContainer(draft);
        const msg = await message.channel.send({ components: [intake], flags: MessageFlags.IsComponentsV2 });
        announcementDrafts.set(msg.id, draft);
        return;
      }

      const thinkingContainer = {
        type: 17,
        components: [
          {
            type: 10,
            content: `# ${getRandomHeadingGlyph()} Crafting Announcement | <a:loading:1542155051286396938>\n-# Athena AI is analyzing your prompt and formatting your announcement...`
          }
        ]
      };

      const msg = await message.channel.send({ components: [thinkingContainer], flags: MessageFlags.IsComponentsV2 });

      const aiDraft = await generateAIAnnouncement(prompt, null, null, message.client, message.guild);
      const draft = {
        authorId: message.author.id,
        guildId: message.guild.id,
        title: aiDraft.title,
        body: aiDraft.body,
        footer: aiDraft.footer || 'Athena Prime Official Announcement',
        imageUrl: null,
        targetChannelId: null,
        pingMode: 'none',
        originalPrompt: prompt,
        lastUpdated: Date.now()
      };

      const previewContainer = buildAnnouncementStudioContainer(draft, true);
      await msg.edit({ components: [previewContainer], flags: MessageFlags.IsComponentsV2 });
      announcementDrafts.set(msg.id, draft);

      await message.delete().catch(() => null);
    },

    async executeSlash(interaction) {
      if (interaction.guild) setGuildContext(interaction.guild.id);

      const prompt = interaction.options.getString('prompt')?.trim();
      const targetChan = interaction.options.getChannel('channel');

      if (!prompt) {
        const draft = {
          authorId: interaction.user.id,
          guildId: interaction.guild.id,
          title: 'Server Announcement',
          body: '',
          footer: 'Athena Prime Official Announcement',
          imageUrl: null,
          targetChannelId: targetChan?.id || null,
          pingMode: 'none',
          originalPrompt: '',
          lastUpdated: Date.now()
        };
        const intake = buildPromptIntakeContainer(draft);
        const replyMsg = await interaction.reply({ components: [intake], flags: MessageFlags.IsComponentsV2 });
        announcementDrafts.set(replyMsg.id || interaction.id, draft);
        return;
      }

      await interaction.deferReply();

      const thinkingContainer = {
        type: 17,
        components: [
          {
            type: 10,
            content: `# ${getRandomHeadingGlyph()} Crafting Announcement | <a:loading:1542155051286396938>\n-# Athena AI is analyzing your prompt and formatting your announcement...`
          }
        ]
      };
      await interaction.editReply({ components: [thinkingContainer], flags: MessageFlags.IsComponentsV2 });

      const aiDraft = await generateAIAnnouncement(prompt, null, null, interaction.client, interaction.guild);
      const draft = {
        authorId: interaction.user.id,
        guildId: interaction.guild.id,
        title: aiDraft.title,
        body: aiDraft.body,
        footer: aiDraft.footer || 'Athena Prime Official Announcement',
        imageUrl: null,
        targetChannelId: targetChan?.id || null,
        pingMode: 'none',
        originalPrompt: prompt,
        lastUpdated: Date.now()
      };

      const previewContainer = buildAnnouncementStudioContainer(draft, true);
      const replyMsg = await interaction.editReply({ components: [previewContainer], flags: MessageFlags.IsComponentsV2 });
      announcementDrafts.set(replyMsg.id, draft);
    }
  }
];

/**
 * Central Interaction Handler for AI Announcement Studio buttons, select menus, and modals
 */
export async function handleAIAnnouncementInteractions(interaction) {
  const member = interaction.member;
  if (!member || (!member.permissions.has(PermissionFlagsBits.ManageMessages) && !member.permissions.has(PermissionFlagsBits.Administrator))) {
    return interaction.reply({
      content: '-# You need **Manage Messages** permission to use the AI Announcement Studio.',
      flags: 64
    });
  }

  const customId = interaction.customId;

  // 1. Initial Intake Buttons
  if (interaction.isButton()) {
    if (customId === 'aian_open_prompt_modal') {
      const modal = new ModalBuilder()
        .setCustomId('aian_modal_initial_prompt')
        .setTitle('Write Announcement Prompt');

      const promptInput = new TextInputBuilder()
        .setCustomId('aian_prompt_input')
        .setLabel('What would you like to announce?')
        .setPlaceholder('e.g. game night 8pm, snacks, bullets: 1557841381630681106, heading: 1557841381630681107')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(promptInput));
      return interaction.showModal(modal);
    }

    if (customId === 'aian_open_manual_modal') {
      const modal = new ModalBuilder()
        .setCustomId('aian_modal_initial_manual')
        .setTitle('Create Announcement Manually');

      const titleInput = new TextInputBuilder()
        .setCustomId('aian_initial_title')
        .setLabel('Heading / Title')
        .setPlaceholder('Enter announcement title...')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const bodyInput = new TextInputBuilder()
        .setCustomId('aian_initial_body')
        .setLabel('Content Body (-# grey subtext)')
        .setPlaceholder('Enter announcement details...')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const footerInput = new TextInputBuilder()
        .setCustomId('aian_initial_footer')
        .setLabel('Footer Text')
        .setPlaceholder('Athena Prime Official Announcement')
        .setValue('Athena Prime Official Announcement')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(bodyInput),
        new ActionRowBuilder().addComponents(footerInput)
      );
      return interaction.showModal(modal);
    }
  }

  // 2. Draft Security Check
  const draft = getDraftFromInteraction(interaction);
  if (draft.authorId && draft.authorId !== interaction.user.id && !member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: '-# Only the creator of this announcement draft or an Administrator can modify it.',
      flags: 64
    });
  }

  // 3. Dropdown Handlers
  if (interaction.isChannelSelectMenu() && customId === 'aian_select_channel') {
    draft.targetChannelId = interaction.values[0];
    draft.lastUpdated = Date.now();
    announcementDrafts.set(interaction.message.id, draft);

    const isIntake = !draft.originalPrompt && (!draft.body || draft.body === '-# No announcement content set.');
    const container = isIntake ? buildPromptIntakeContainer(draft) : buildAnnouncementStudioContainer(draft, true);

    return interaction.update({
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (interaction.isStringSelectMenu() && customId === 'aian_select_ping') {
    draft.pingMode = interaction.values[0];
    draft.lastUpdated = Date.now();
    announcementDrafts.set(interaction.message.id, draft);

    const isIntake = !draft.originalPrompt && (!draft.body || draft.body === '-# No announcement content set.');
    const container = isIntake ? buildPromptIntakeContainer(draft) : buildAnnouncementStudioContainer(draft, true);

    return interaction.update({
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });
  }

  // 4. Studio Action Buttons
  if (interaction.isButton()) {
    if (customId === 'aian_deploy') {
      if (!draft.targetChannelId) {
        return interaction.reply({
          content: '-# Please select a target announcement channel from the dropdown first.',
          flags: 64
        });
      }

      const targetChannel = interaction.guild.channels.cache.get(draft.targetChannelId) 
        || await interaction.guild.channels.fetch(draft.targetChannelId).catch(() => null);

      if (!targetChannel) {
        return interaction.reply({
          content: '-# The selected target channel could not be found or fetched. Please re-select a channel.',
          flags: 64
        });
      }

      const botPerms = targetChannel.permissionsFor(interaction.guild.members.me);
      if (!botPerms || !botPerms.has(PermissionFlagsBits.SendMessages)) {
        return interaction.reply({
          content: `-# I do not have permission to send messages in <#${draft.targetChannelId}>. Please grant me Send Messages permission.`,
          flags: 64
        });
      }

      try {
        const publishedContainer = buildAnnouncementStudioContainer(draft, false);
        const pingContent = draft.pingMode === 'everyone' ? '@everyone' : (draft.pingMode === 'here' ? '@here' : undefined);

        const sentMsg = await targetChannel.send({
          content: pingContent,
          components: [publishedContainer],
          flags: MessageFlags.IsComponentsV2
        });

        // Heading | <a:atheNATICK:...> success rule
        const successContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Announcement Published | <a:03_tick_circle:1565665642084827206>\n-# Successfully broadcasted to <#${draft.targetChannelId}>.\n-# ${BULLET_EMOJI} **__Jump to Announcement:__** [View Message](${sentMsg.url})\n-# ${BULLET_EMOJI} **__Broadcast Mention:__** \`${draft.pingMode === 'none' ? 'None' : '@' + draft.pingMode}\``
            }
          ]
        };

        await interaction.update({ components: [successContainer], flags: MessageFlags.IsComponentsV2 });
        announcementDrafts.delete(interaction.message.id);
        return;
      } catch (err) {
        console.error('Failed to deploy announcement:', err);
        return interaction.reply({
          content: `-# Failed to send announcement to <#${draft.targetChannelId}>. Error: ${err.message}`,
          flags: 64
        });
      }
    }

    if (customId === 'aian_refine_ai') {
      const modal = new ModalBuilder()
        .setCustomId('aian_modal_refine')
        .setTitle('Refine Announcement with AI');

      const refineInput = new TextInputBuilder()
        .setCustomId('aian_refine_prompt')
        .setLabel('What adjustments should AI make?')
        .setPlaceholder('e.g. make it punchier, bullets: 1557841381630681106, change footer...')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(refineInput));
      return interaction.showModal(modal);
    }

    if (customId === 'aian_manual_edit') {
      const modal = new ModalBuilder()
        .setCustomId('aian_modal_manual')
        .setTitle('Edit Announcement (Full)');

      const titleInput = new TextInputBuilder()
        .setCustomId('aian_manual_title')
        .setLabel('Heading / Title')
        .setStyle(TextInputStyle.Short)
        .setValue((draft.title || 'Server Announcement').slice(0, 100))
        .setRequired(true);

      const bodyInput = new TextInputBuilder()
        .setCustomId('aian_manual_body')
        .setLabel('Content Body (-# grey font)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue((draft.body || '').slice(0, 3900))
        .setRequired(true);

      const footerInput = new TextInputBuilder()
        .setCustomId('aian_manual_footer')
        .setLabel('Footer Text')
        .setStyle(TextInputStyle.Short)
        .setValue((draft.footer || 'Athena Prime Official Announcement').slice(0, 100))
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(bodyInput),
        new ActionRowBuilder().addComponents(footerInput)
      );
      return interaction.showModal(modal);
    }

    if (customId === 'aian_set_media') {
      const modal = new ModalBuilder()
        .setCustomId('aian_modal_media')
        .setTitle('Set Banner / Media');

      const mediaInput = new TextInputBuilder()
        .setCustomId('aian_media_url')
        .setLabel('Image / Banner URL (Direct link)')
        .setPlaceholder('https://example.com/banner.png (or empty to clear)')
        .setStyle(TextInputStyle.Short)
        .setValue(draft.imageUrl || '')
        .setRequired(false);

      modal.addComponents(new ActionRowBuilder().addComponents(mediaInput));
      return interaction.showModal(modal);
    }

    if (customId === 'aian_discard') {
      announcementDrafts.delete(interaction.message.id);
      const discardedContainer = {
        type: 17,
        components: [
          {
            type: 10,
            content: `-# Announcement draft was discarded.`
          }
        ]
      };
      return interaction.update({ components: [discardedContainer], flags: MessageFlags.IsComponentsV2 });
    }
  }

  // 5. Modal Submissions
  if (interaction.isModalSubmit()) {
    if (customId === 'aian_modal_initial_prompt') {
      const prompt = interaction.fields.getTextInputValue('aian_prompt_input');

      const thinkingContainer = {
        type: 17,
        components: [
          {
            type: 10,
            content: `# ${getRandomHeadingGlyph()} Crafting Announcement | <a:loading:1542155051286396938>\n-# Athena AI is analyzing your prompt and formatting your announcement...`
          }
        ]
      };

      await interaction.update({ components: [thinkingContainer], flags: MessageFlags.IsComponentsV2 });

      const aiDraft = await generateAIAnnouncement(prompt, null, null, interaction.client, interaction.guild);
      const newDraft = {
        authorId: interaction.user.id,
        guildId: interaction.guild.id,
        title: aiDraft.title,
        body: aiDraft.body,
        footer: aiDraft.footer || 'Athena Prime Official Announcement',
        imageUrl: draft.imageUrl || null,
        targetChannelId: draft.targetChannelId || null,
        pingMode: draft.pingMode || 'none',
        originalPrompt: prompt,
        lastUpdated: Date.now()
      };

      const previewContainer = buildAnnouncementStudioContainer(newDraft, true);
      await interaction.editReply({ components: [previewContainer], flags: MessageFlags.IsComponentsV2 });
      announcementDrafts.set(interaction.message.id, newDraft);
      return;
    }

    if (customId === 'aian_modal_initial_manual') {
      const title = interaction.fields.getTextInputValue('aian_initial_title');
      const body = interaction.fields.getTextInputValue('aian_initial_body');
      const footer = interaction.fields.getTextInputValue('aian_initial_footer')?.trim() || 'Athena Prime Official Announcement';

      const newDraft = {
        authorId: interaction.user.id,
        guildId: interaction.guild.id,
        title: title.trim(),
        body: cleanAnnouncementBody(body),
        footer,
        imageUrl: draft.imageUrl || null,
        targetChannelId: draft.targetChannelId || null,
        pingMode: draft.pingMode || 'none',
        originalPrompt: '',
        lastUpdated: Date.now()
      };

      const previewContainer = buildAnnouncementStudioContainer(newDraft, true);
      await interaction.update({ components: [previewContainer], flags: MessageFlags.IsComponentsV2 });
      announcementDrafts.set(interaction.message.id, newDraft);
      return;
    }

    if (customId === 'aian_modal_refine') {
      const refinePrompt = interaction.fields.getTextInputValue('aian_refine_prompt');

      const thinkingContainer = {
        type: 17,
        components: [
          {
            type: 10,
            content: `# ${getRandomHeadingGlyph()} Refining Announcement | <a:loading:1542155051286396938>\n-# Athena AI is adjusting your announcement draft...`
          }
        ]
      };

      await interaction.update({ components: [thinkingContainer], flags: MessageFlags.IsComponentsV2 });

      const refined = await generateAIAnnouncement(draft.originalPrompt || draft.body, draft, refinePrompt, interaction.client, interaction.guild);
      draft.title = refined.title;
      draft.body = refined.body;
      if (refined.footer) draft.footer = refined.footer;
      draft.lastUpdated = Date.now();

      const previewContainer = buildAnnouncementStudioContainer(draft, true);
      await interaction.editReply({ components: [previewContainer], flags: MessageFlags.IsComponentsV2 });
      announcementDrafts.set(interaction.message.id, draft);
      return;
    }

    if (customId === 'aian_modal_manual') {
      const title = interaction.fields.getTextInputValue('aian_manual_title');
      const body = interaction.fields.getTextInputValue('aian_manual_body');
      const footer = interaction.fields.getTextInputValue('aian_manual_footer')?.trim() || 'Athena Prime Official Announcement';

      draft.title = title.trim();
      draft.body = cleanAnnouncementBody(body);
      draft.footer = footer;
      draft.lastUpdated = Date.now();

      const previewContainer = buildAnnouncementStudioContainer(draft, true);
      await interaction.update({ components: [previewContainer], flags: MessageFlags.IsComponentsV2 });
      announcementDrafts.set(interaction.message.id, draft);
      return;
    }

    if (customId === 'aian_modal_media') {
      let url = interaction.fields.getTextInputValue('aian_media_url')?.trim() || null;
      if (url && isPinterestUrl(url)) {
        url = await resolveMediaUrl(url);
      }
      draft.imageUrl = url && /^https?:\/\//i.test(url) ? url : null;
      draft.lastUpdated = Date.now();

      const previewContainer = buildAnnouncementStudioContainer(draft, true);
      await interaction.update({ components: [previewContainer], flags: MessageFlags.IsComponentsV2 });
      announcementDrafts.set(interaction.message.id, draft);
      return;
    }
  }
}
