import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import db from '../database.js';
import cv2, { sanitizeCV2Payload } from '../cv2.js';
import { generateAIResponse, formatAIToGreyMarkdown } from '../utils/ai.js';

/**
 * Resolves the primary loading animated emoji (:loading~1: from security enable all)
 */
function resolveLoadingEmoji() {
  return '<a:loading:1542155051286396938>';
}

/**
 * Builds an accent borderless CV2 container for Athena AI responses
 */
export function buildAICV2Container(user, prompt, aiResult, accentColor = '#00e5ff') {
  const content = formatAIToGreyMarkdown(aiResult.text || 'No response generated.');
  const headerText =
    `### **Athena Prime Neural Engine** | <a:uptime:1552608831060844575>\n` +
    `-# • **__Member:__** <@${user.id}> \`(${user.id})\` \u00b7 **__Model:__** \`${aiResult.model}\` \u00b7 **__Latency:__** \`${aiResult.latencyMs}ms\`\n` +
    `-# • **__Prompt:__** *${prompt.length > 120 ? prompt.slice(0, 117) + '...' : prompt}*`;

  const footerText = `-# **Athena Intelligence Matrix \u00b7 Accelerated Neural Core \u00b7 Gemini 3.8 Flash**`;

  const comps = [
    {
      type: 10,
      content: headerText
    },
    { type: 14, divider: true }
  ];

  // Discord hard limit is 4000 characters total across all components in the payload.
  const auxLength = headerText.length + footerText.length + 50;
  const maxContentBudget = Math.max(800, 3800 - auxLength);

  let safeContent = content;
  if (safeContent.length > maxContentBudget) {
    const notice = '\n-# *(Response condensed for Discord display limits. Ask follow-up questions for more details!)*';
    const targetCut = maxContentBudget - notice.length;
    let cutIdx = safeContent.lastIndexOf('\n\n', targetCut);
    if (cutIdx === -1 || cutIdx < targetCut * 0.65) {
      cutIdx = safeContent.lastIndexOf('\n', targetCut);
    }
    if (cutIdx === -1 || cutIdx < targetCut * 0.65) {
      cutIdx = safeContent.lastIndexOf('. ', targetCut);
      if (cutIdx !== -1) cutIdx += 1;
    }
    if (cutIdx === -1 || cutIdx < targetCut * 0.5) {
      cutIdx = targetCut;
    }
    let trimmed = safeContent.slice(0, cutIdx).trim();
    const codeBlockCount = (trimmed.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      trimmed += '\n```';
    }
    safeContent = trimmed + notice;
  }

  comps.push({ type: 10, content: safeContent });
  if (aiResult.imageUrl) {
    comps.push({
      type: 12,
      items: [{ media: { url: aiResult.imageUrl } }]
    });
  }
  comps.push({ type: 14, divider: true });
  comps.push({
    type: 10,
    content: footerText
  });

  return sanitizeCV2Payload({
    type: 17,
    components: comps
  });
}

export const commands = [
  // --- ASK COMMAND ---
  {
    name: 'ask',
    description: 'Query the Athena Prime Neural AI Engine for answers, analysis, and assistance.',
    category: 'utility',
    aliases: ['ai', 'neural', 'gemini'],
    options: [
      {
        name: 'prompt',
        description: 'Your question or prompt for Athena AI',
        type: 3, // STRING
        required: true
      }
    ],
    async executePrefix(message, args) {
      const prompt = args.join(' ').trim();
      if (!prompt) {
        return message.reply({
          components: [
            cv2.buildContainer(
              'Athena Neural Engine',
              'Please provide a question or instruction to query Athena AI.\n\n-# **__Usage:__** `!ask <your question>` or `/ask <prompt>`'
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const cfg = db.getGuildConfig(message.guild?.id || '0');
      const accentColor = cfg?.accentColor || '#00e5ff';
      const loadingEmoji = resolveLoadingEmoji(message.guild, message.client);

      const thinkingContainer = {
        type: 17,
        components: [
          {
            type: 10,
            content: `-# ${loadingEmoji} **Athena Neural Engine is synthesizing response...**`
          }
        ]
      };

      const thinkingMsg = await message.reply({
        components: [thinkingContainer],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);

      const aiResult = await generateAIResponse(prompt, {
        guildId: message.guild?.id,
        userTag: message.author.tag,
        serverName: message.guild?.name
      });

      if (!aiResult.success) {
        const errorContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `### **Neural Engine Advisory** | <a:uptime:1552608831060844575>\n` +
                `-# • **__Status:__** \`Failed to synthesize\`\n` +
                `-# • **__Error:__** ${aiResult.error || 'Connection timed out'}`
            }
          ]
        };
        if (thinkingMsg) {
          try {
            await cv2.edit(thinkingMsg, { components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
            return;
          } catch {
            await thinkingMsg.delete().catch(() => null);
          }
        }
        return message.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {
          return message.channel.send({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        });
      }

      const container = buildAICV2Container(message.author, prompt, aiResult, accentColor);
      if (thinkingMsg) {
        try {
          await cv2.edit(thinkingMsg, { components: [container], flags: MessageFlags.IsComponentsV2 });
          return;
        } catch {
          await thinkingMsg.delete().catch(() => null);
        }
      }
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {
        return message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
      });
    },

    async executeSlash(interaction) {
      const loadingEmoji = resolveLoadingEmoji(interaction.guild, interaction.client);
      const thinkingContainer = {
        type: 17,
        components: [
          {
            type: 10,
            content: `-# ${loadingEmoji} **Athena Neural Engine is synthesizing response...**`
          }
        ]
      };

      await interaction.reply({
        components: [thinkingContainer],
        flags: MessageFlags.IsComponentsV2
      }).catch(async () => {
        await interaction.deferReply().catch(() => null);
      });

      const prompt = interaction.options.getString('prompt');
      const cfg = db.getGuildConfig(interaction.guild?.id || '0');
      const accentColor = cfg?.accentColor || '#00e5ff';

      const aiResult = await generateAIResponse(prompt, {
        guildId: interaction.guild?.id,
        userTag: interaction.user.tag,
        serverName: interaction.guild?.name
      });

      if (!aiResult.success) {
        const errorContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `### **Neural Engine Advisory** | <a:uptime:1552608831060844575>\n` +
                `-# • **__Status:__** \`Failed to synthesize\`\n` +
                `-# • **__Error:__** ${aiResult.error || 'Connection timed out'}`
            }
          ]
        };
        return interaction.editReply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
      }

      const container = buildAICV2Container(interaction.user, prompt, aiResult, accentColor);
      return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  },

  // --- AIMODE COMMAND ---
  {
    name: 'aimode',
    description: 'Configure server AI assistant mode and dedicated AI interaction channels.',
    category: 'utility',
    permissions: [PermissionFlagsBits.Administrator],
    options: [
      {
        name: 'status',
        description: 'View current AI assistant mode status',
        type: 1 // SUB_COMMAND
      },
      {
        name: 'toggle',
        description: 'Enable or disable conversational AI mode',
        type: 1,
        options: [
          {
            name: 'state',
            description: 'Turn AI mode on or off',
            type: 3,
            required: true,
            choices: [
              { name: 'Enable (ON)', value: 'on' },
              { name: 'Disable (OFF)', value: 'off' }
            ]
          }
        ]
      },
      {
        name: 'channel',
        description: 'Set or clear the dedicated AI conversation channel',
        type: 1,
        options: [
          {
            name: 'target',
            description: 'The channel for AI conversations (leave empty to unbind)',
            type: 7, // CHANNEL
            required: false
          }
        ]
      }
    ],
    async executePrefix(message, args) {
      const guildId = message.guild.id;
      const cfg = db.getGuildConfig(guildId) || {};
      const sub = (args[0] || '').toLowerCase();

      if (sub === 'on' || sub === 'enable') {
        db.updateGuildConfig(guildId, { aiModeEnabled: true });
        return message.reply({
          components: [
            cv2.buildContainer(
              'AI Mode Activated | <a:03_tick_circle:1565665642084827206>',
              'Conversational AI mode has been enabled. Set a dedicated channel with `!aimode channel #channel`.'
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'off' || sub === 'disable') {
        db.updateGuildConfig(guildId, { aiModeEnabled: false });
        return message.reply({
          components: [
            cv2.buildContainer(
              'AI Mode Disabled | <a:03_tick_circle:1565665642084827206>',
              'AI replies are now strictly restricted to the `!ask` command.'
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'channel') {
        const channelMention = message.mentions.channels.first() || (args[1] ? message.guild.channels.cache.get(args[1]) : null);
        if (!channelMention) {
          db.updateGuildConfig(guildId, { aiChannelId: null });
          return message.reply({
            components: [
              cv2.buildContainer(
                'AI Channel Unbound | <a:03_tick_circle:1565665642084827206>',
                'The dedicated AI channel binding has been removed. AI replies are now strictly restricted to `!ask`.'
              )
            ],
            flags: MessageFlags.IsComponentsV2
          });
        }
        db.updateGuildConfig(guildId, { aiModeEnabled: true, aiChannelId: channelMention.id });
        return message.reply({
          components: [
            cv2.buildContainer(
              'AI Channel Bound | <a:03_tick_circle:1565665642084827206>',
              `Athena AI will now converse automatically with members in <#${channelMention.id}>.\nAll responses will be formatted in accent borderless CV2 containers.`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      // Default: Status
      const isEnabled = Boolean(cfg.aiModeEnabled);
      const chId = cfg.aiChannelId;
      const statusText =
        `-# • **__System Status:__** \`${isEnabled ? 'ACTIVE' : 'STANDBY'}\`\n` +
        `-# • **__Dedicated Channel:__** ${chId ? `<#${chId}> (\`${chId}\`)` : '`None (Restricted to !ask only)`'}\n` +
        `-# • **__Container Styling:__** \`Accent Borderless CV2 Container\`\n\n` +
        `-# **__Commands:__**\n` +
        `-# • \`!ask <prompt>\` - Direct query to Athena Neural Engine\n` +
        `-# • \`!aimode on / off\` - Toggle conversational mode\n` +
        `-# • \`!aimode channel #channel\` - Bind dedicated AI chat channel`;

      return message.reply({
        components: [
          cv2.buildContainer('Athena AI Architecture Status | <a:03_tick_circle:1565665642084827206>', statusText)
        ],
        flags: MessageFlags.IsComponentsV2
      });
    },

    async executeSlash(interaction) {
      const guildId = interaction.guild.id;
      const cfg = db.getGuildConfig(guildId) || {};
      const sub = interaction.options.getSubcommand();

      if (sub === 'toggle') {
        const state = interaction.options.getString('state') === 'on';
        db.updateGuildConfig(guildId, { aiModeEnabled: state });
        return interaction.reply({
          components: [
            cv2.buildContainer(
              `AI Mode ${state ? 'Activated' : 'Disabled'} | <a:03_tick_circle:1565665642084827206>`,
              state
                ? 'Conversational AI mode has been enabled. Set a channel with `/aimode channel`.'
                : 'AI replies are now strictly restricted to `/ask`.'
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'channel') {
        const target = interaction.options.getChannel('target');
        if (!target) {
          db.updateGuildConfig(guildId, { aiChannelId: null });
          return interaction.reply({
            components: [
              cv2.buildContainer(
                'AI Channel Unbound | <a:03_tick_circle:1565665642084827206>',
                'The dedicated AI channel binding has been removed.'
              )
            ],
            flags: MessageFlags.IsComponentsV2
          });
        }
        db.updateGuildConfig(guildId, { aiModeEnabled: true, aiChannelId: target.id });
        return interaction.reply({
          components: [
            cv2.buildContainer(
              'AI Channel Bound | <a:03_tick_circle:1565665642084827206>',
              `Athena AI will now converse automatically with members in <#${target.id}>.`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      // Status
      const isEnabled = Boolean(cfg.aiModeEnabled);
      const chId = cfg.aiChannelId;
      const statusText =
        `-# • **__System Status:__** \`${isEnabled ? 'ACTIVE' : 'STANDBY'}\`\n` +
        `-# • **__Dedicated Channel:__** ${chId ? `<#${chId}>` : '`None (Restricted to /ask only)`'}\n` +
        `-# • **__Container Styling:__** \`Accent Borderless CV2 Container\``;

      return interaction.reply({
        components: [
          cv2.buildContainer('Athena AI Architecture Status | <a:03_tick_circle:1565665642084827206>', statusText)
        ],
        flags: MessageFlags.IsComponentsV2
      });
    }
  }
];

export default commands;
