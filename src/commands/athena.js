import { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { 
  generateAthenaGuideResponse, 
  buildGuideHubContainer, 
  buildAthenaGuideContainer,
  buildThinkingContainer,
  getGuideSession,
  clearGuideSession,
  resolveMemberClearance,
  getCommandClearanceRequirement,
  canMemberExecuteCommand,
  detectAndCorrectTypos,
  getAllBotCommands
} from '../utils/botGuideKnowledge.js';
import { getSecurityStatusPanel, getAutoModPanel, handleUnlockdown } from './security.js';
import { buildTicketManagerPayload, buildTicketPanelPayload } from './ticketpanel.js';
import { getManagerPanel, executeWelcomeTest } from './welcome.js';
import { gwManagers, buildManagerContainer } from './giveaway.js';
import { isBotOwnerSync, isExtraOwnerOrHigher } from '../utils/helpers.js';

const TICK = '<a:03_tick_circle:1565665642084827206>';

/**
 * Creates a rate-limited real-time progress handler that edits the thinking container smoothly
 */
function createProgressHandler(target, session = null) {
  let lastEditTime = Date.now();
  let isEditing = false;
  let pendingUpdate = null;
  let pendingTimer = null;
  let active = true;

  const flush = async (update) => {
    if (!active || !target) return;
    isEditing = true;
    lastEditTime = Date.now();
    try {
      const container = buildThinkingContainer(update.title, update.detail, session);
      await cv2.edit(target, {
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    } catch {
      // Ignore transient network errors or deleted messages
    } finally {
      isEditing = false;
    }
  };

  return {
    onProgress: async ({ title, detail }) => {
      if (!active || !target) return;
      const now = Date.now();
      const elapsed = now - lastEditTime;

      if (elapsed >= 900 && !isEditing) {
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          pendingTimer = null;
        }
        pendingUpdate = null;
        await flush({ title, detail });
      } else {
        pendingUpdate = { title, detail };
        if (!pendingTimer) {
          const waitTime = Math.max(100, 950 - elapsed);
          pendingTimer = setTimeout(async () => {
            pendingTimer = null;
            if (pendingUpdate && active) {
              const u = pendingUpdate;
              pendingUpdate = null;
              await flush(u);
            }
          }, waitTime);
        }
      }
    },
    stop: () => {
      active = false;
      pendingUpdate = null;
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
    }
  };
}

export const commands = [
  {
    name: 'athena',
    description: 'Ask Athena Prime directly to explain commands, resolve doubts, and give step-by-step guidance.',
    category: 'utility',
    aliases: ['guide', 'howto', 'askathena', 'assistant', 'athenahelp'],
    options: [
      {
        name: 'query',
        description: 'What question, doubt, or setup guidance do you need about Athena?',
        type: 3, // STRING
        required: false
      }
    ],
    async executePrefix(message, args) {
      const cfg = db.getGuildConfig(message.guild?.id || '0');
      const prefix = cfg?.prefix || '!';
      const accentColor = cfg?.accentColor || '#00e5ff';
      const prompt = args.join(' ').trim();

      // Reset / Clear Thread Memory Command
      if (prompt.toLowerCase() === 'reset' || prompt.toLowerCase() === 'clear') {
        clearGuideSession(message.guild?.id || '0', message.author.id, message.channel.id);
        const resetContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `### **Conversation Thread Cleared | ${TICK}**\n-# Conversation memory has been reset for this channel. Your next query will start a fresh session.`
            }
          ]
        };
        return message.reply({ components: [resetContainer], flags: MessageFlags.IsComponentsV2 });
      }

      // If no prompt provided, show the interactive Guidance Hub
      if (!prompt) {
        const hub = buildGuideHubContainer(message.guild, message.author, prefix);
        return message.reply(hub);
      }

      const activeSession = getGuideSession(message.guild?.id || '0', message.author.id, message.channel.id);
      const shortPrompt = prompt.length > 45 ? prompt.slice(0, 42) + '...' : prompt;
      const initialContainer = buildThinkingContainer(
        activeSession && activeSession.turnCount >= 1
          ? `Scanning catalog & analyzing follow-up (Turn #${activeSession.turnCount + 1}) for: "${shortPrompt}"...`
          : `Athena Prime is scanning catalog of 250+ commands & detecting intent for: "${shortPrompt}"...`,
        activeSession && activeSession.turnCount >= 1
          ? `Thread active (rolling timer expires <t:${Math.floor(activeSession.expiresAt / 1000)}:R>) • Correlating with previous turns...`
          : `Analyzing command catalog and matching user keywords across system registries...`,
        activeSession
      );

      const thinkingMsg = await message.reply({
        components: [initialContainer],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);

      const progress = createProgressHandler(thinkingMsg, activeSession);

      let aiResult;
      try {
        aiResult = await generateAthenaGuideResponse(prompt, {
          guild: message.guild,
          user: message.author,
          member: message.member,
          channelId: message.channel.id,
          prefix,
          onProgress: progress.onProgress
        });
      } finally {
        progress.stop();
      }

      const container = buildAthenaGuideContainer(message.author, prompt, aiResult, accentColor, prefix, aiResult.session);

      if (thinkingMsg) {
        try {
          await cv2.edit(thinkingMsg, { components: [container], flags: MessageFlags.IsComponentsV2 });
          return;
        } catch {
          await thinkingMsg.delete().catch(() => null);
        }
      }

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {
        return message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      });
    },

    async executeSlash(interaction) {
      const cfg = db.getGuildConfig(interaction.guild?.id || '0');
      const prefix = cfg?.prefix || '!';
      const accentColor = cfg?.accentColor || '#00e5ff';
      const prompt = interaction.options.getString('query')?.trim();

      // Reset / Clear Thread Memory Command
      if (prompt && (prompt.toLowerCase() === 'reset' || prompt.toLowerCase() === 'clear')) {
        clearGuideSession(interaction.guild?.id || '0', interaction.user.id, interaction.channelId);
        const resetContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `### **Conversation Thread Cleared | ${TICK}**\n-# Conversation memory has been reset for this channel. Your next query will start a fresh session.`
            }
          ]
        };
        return interaction.reply({ components: [resetContainer], flags: MessageFlags.IsComponentsV2 });
      }

      if (!prompt) {
        const hub = buildGuideHubContainer(interaction.guild, interaction.user, prefix);
        return interaction.reply(hub);
      }

      await interaction.deferReply();

      const activeSession = getGuideSession(interaction.guild?.id || '0', interaction.user.id, interaction.channelId);
      const shortPrompt = prompt.length > 45 ? prompt.slice(0, 42) + '...' : prompt;
      const initialContainer = buildThinkingContainer(
        activeSession && activeSession.turnCount >= 1
          ? `Scanning catalog & analyzing follow-up (Turn #${activeSession.turnCount + 1}) for: "${shortPrompt}"...`
          : `Athena Prime is scanning catalog of 250+ commands & detecting intent for: "${shortPrompt}"...`,
        activeSession && activeSession.turnCount >= 1
          ? `Thread active (rolling timer expires <t:${Math.floor(activeSession.expiresAt / 1000)}:R>) • Correlating with previous turns...`
          : `Analyzing command catalog and matching user keywords across system registries...`,
        activeSession
      );

      await cv2.edit(interaction, {
        components: [initialContainer],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);

      const progress = createProgressHandler(interaction, activeSession);

      let aiResult;
      try {
        aiResult = await generateAthenaGuideResponse(prompt, {
          guild: interaction.guild,
          user: interaction.user,
          member: interaction.member,
          channelId: interaction.channelId,
          prefix,
          onProgress: progress.onProgress
        });
      } finally {
        progress.stop();
      }

      const container = buildAthenaGuideContainer(interaction.user, prompt, aiResult, accentColor, prefix, aiResult.session);
      return cv2.edit(interaction, { components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {
        return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      });
    }
  }
];

/**
 * Universal Command Status & Database Telemetry Inspector
 */
export async function buildLiveCommandStatusPayload(guild, member, user, cmdName, prefix = '!') {
  const { commandMap } = await import('./loader.js');
  let cmd = commandMap.get(cmdName.toLowerCase());
  if (!cmd) {
    const allCommands = await getAllBotCommands();
    const typo = detectAndCorrectTypos(cmdName, allCommands);
    if (typo.hasTypo && typo.correctedCommand) {
      cmd = commandMap.get(typo.correctedCommand.toLowerCase());
    }
  }

  if (!cmd && (cmdName.toLowerCase() === 'moderation' || cmdName.toLowerCase() === 'mod')) {
    const cfg = db.getGuildConfig(guild?.id || '0') || {};
    const authRoles = db.getAuthRoles(guild?.id || '0');
    const modRoles = authRoles.mod && authRoles.mod.length ? authRoles.mod.map(r => `<@&${r}>`).join(', ') : '`Default Staff Permissions`';
    const logChan = cfg.logChannelId ? `<#${cfg.logChannelId}>` : '`Not Bound`';
    const aiTox = cfg.aiToxicityEnabled ? '`Active / AI Toxicity Defense`' : '`Deactivated`';

    return {
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## MODERATION Telemetry & Status | ${TICK}\n` +
                `-# • **Operational State:** \`Autonomous Moderation Suite Active\`\n` +
                `-# • **Audit Log Channel:** ${logChan}\n` +
                `-# • **Designated Mod Roles:** ${modRoles}\n` +
                `-# • **AI Toxicity Shield:** ${aiTox}\n` +
                `-# • **Anti-Spam Filter:** ${cfg.spamDetection !== false ? '`Active`' : '`Disabled`'}\n` +
                `-# • **Core Enforcement Commands:** \`!ban\`, \`!kick\`, \`!timeout\`, \`!mute\`, \`!warn\`, \`!purge\`, \`!quarantine\`\n\n` +
                `-# **__Clearance Level:__** \`Server Moderator / Administrator\``
            }
          ]
        },
        {
          type: 1,
          components: [
            { type: 2, custom_id: 'athena_act_automod_panel', label: 'Open AutoMod Panel', style: 2 },
            { type: 2, custom_id: 'athena_act_security_status', label: 'Inspect Security Status', style: 2 },
            { type: 2, custom_id: 'athena_act_ai_ask_moderation', label: 'Ask AI About Moderation', style: 2 }
          ]
        }
      ],
      flags: MessageFlags.IsComponentsV2
    };
  }

  if (!cmd) {
    return {
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## Command Not Found | ${TICK}\n` +
                `-# The command \`!${cmdName}\` was not recognized in the Athena catalog of 254+ commands.\n` +
                `-# Run \`${prefix}help\` to browse all active modules, or use \`${prefix}athena\` to search with AI.`
            }
          ]
        }
      ],
      flags: MessageFlags.IsComponentsV2
    };
  }

  const cleanName = cmd.name;
  const clearance = getCommandClearanceRequirement(cleanName, cmd);
  const memberClearance = await resolveMemberClearance(guild, user, member);
  const canRun = canMemberExecuteCommand(memberClearance, clearance);
  const aliases = cmd.aliases && cmd.aliases.length > 0 
    ? cmd.aliases.map(a => `\`!${a}\``).join(', ') 
    : '`None`';

  const cfg = db.getGuildConfig(guild?.id || '0') || {};
  const statusPoints = [];

  // General telemetry
  statusPoints.push(`-# • **Operational State:** \`Autonomous & Ready\``);
  statusPoints.push(`-# • **Primary Invocation:** \`${prefix}${cleanName}\``);
  statusPoints.push(`-# • **Aliases:** ${aliases}`);
  statusPoints.push(`-# • **Clearance Level:** \`${clearance.label}\``);
  statusPoints.push(`-# • **Your Access:** ${canRun ? '`Granted (Executable)`' : '`Restricted (Clearance Required)`'}`);

  const actionButtons = [
    { type: 2, custom_id: `athena_act_cmd_help_${cleanName}`, label: `View !${cleanName} Help`, style: 2 }
  ];

  // Specific module telemetry from database
  if (guild) {
    if (cleanName === 'welcome' || cleanName === 'leave') {
      const wChan = cfg.welcomeChannelId ? `<#${cfg.welcomeChannelId}>` : '`Not Configured`';
      const lChan = cfg.leaveChannelId ? `<#${cfg.leaveChannelId}>` : '`Not Configured`';
      const wCard = cfg.welcomeCard ? '`Custom Graphic Card`' : '`Standard Text Layout`';
      statusPoints.push(`-# • **Welcome Channel:** ${wChan}`);
      statusPoints.push(`-# • **Leave Channel:** ${lChan}`);
      statusPoints.push(`-# • **Render Style:** ${wCard}`);
      actionButtons.unshift({ type: 2, custom_id: 'athena_act_welcome_setup', label: 'Open Welcome Setup', style: 2 });
      actionButtons.push({ type: 2, custom_id: 'athena_act_welcome_vars', label: 'Placeholders Guide', style: 2 });
      actionButtons.push({ type: 2, custom_id: 'athena_act_welcome_test', label: 'Test Welcome Card', style: 2 });
    } else if (cleanName === 'autorole') {
      const humanRoles = (cfg.autoroles && cfg.autoroles.length) 
        ? cfg.autoroles.map(r => `<@&${r}>`).join(', ') 
        : '`None Bound`';
      const botRoles = (cfg.botAutoroles && cfg.botAutoroles.length) 
        ? cfg.botAutoroles.map(r => `<@&${r}>`).join(', ') 
        : '`None Bound`';
      statusPoints.push(`-# • **Human Auto-Roles:** ${humanRoles}`);
      statusPoints.push(`-# • **Bot Auto-Roles:** ${botRoles}`);
    } else if (cleanName === 'counting') {
      const cData = db.getCounting(guild.id);
      const cChan = cData?.channelId ? `<#${cData.channelId}>` : '`Not Configured`';
      const cCount = cData?.currentCount ?? 0;
      const cLastUser = cData?.lastUserId ? `<@${cData.lastUserId}>` : '`None`';
      statusPoints.push(`-# • **Counting Channel:** ${cChan}`);
      statusPoints.push(`-# • **Current Count:** \`${cCount}\``);
      statusPoints.push(`-# • **Last Counter:** ${cLastUser}`);
    } else if (cleanName === 'jtc' || cleanName === 'vcpanel') {
      const jChan = cfg.jtcChannelId ? `<#${cfg.jtcChannelId}>` : '`Not Configured`';
      const jCat = cfg.jtcCategoryId ? `<#${cfg.jtcCategoryId}>` : '`Default Category`';
      statusPoints.push(`-# • **JTC Hub Channel:** ${jChan}`);
      statusPoints.push(`-# • **JTC Category:** ${jCat}`);
    } else if (cleanName === 'security' || cleanName === 'antinuke' || cleanName === 'ss') {
      const secConfig = db.getAntinukeConfig ? db.getAntinukeConfig(guild.id) : null;
      const wl = db.getAllWhitelists ? db.getAllWhitelists(guild.id) : null;
      const wlCount = wl?.users ? Object.keys(wl.users).length : 0;
      statusPoints.push(`-# • **Antinuke Shield:** ${secConfig?.enabled !== false ? '`Active / Monitoring`' : '`Deactivated`'}`);
      statusPoints.push(`-# • **Whitelisted Accounts:** \`${wlCount} trusted admins\``);
      actionButtons.unshift({ type: 2, custom_id: 'athena_act_security_status', label: 'Inspect Security Status', style: 2 });
    } else if (cleanName === 'automod' || cleanName === 'filters' || cleanName === 'spam') {
      const aiTox = cfg.aiToxicityEnabled ? '`Active / AI Shielding`' : '`Deactivated`';
      statusPoints.push(`-# • **AI Toxicity Defense:** ${aiTox}`);
      statusPoints.push(`-# • **Anti-Spam Filter:** ${cfg.spamDetection !== false ? '`Active`' : '`Disabled`'}`);
      actionButtons.unshift({ type: 2, custom_id: 'athena_act_automod_panel', label: 'Open AutoMod Panel', style: 2 });
    } else if (cleanName === 'verify' || cleanName === 'verification') {
      const vData = db.getVerification(guild.id);
      const vChan = vData?.channelId ? `<#${vData.channelId}>` : '`Not Configured`';
      const vRole = vData?.roleId ? `<@&${vData.roleId}>` : '`Not Bound`';
      const vMode = (vData?.mode || 'button').toUpperCase();
      statusPoints.push(`-# • **Gateway Channel:** ${vChan}`);
      statusPoints.push(`-# • **Verified Role:** ${vRole}`);
      statusPoints.push(`-# • **Authentication Mode:** \`${vMode}\``);
      actionButtons.unshift({ type: 2, custom_id: 'athena_act_verify_setup', label: 'Open Verification Setup', style: 2 });
    } else if (cleanName === 'giveaway') {
      actionButtons.unshift({ type: 2, custom_id: 'athena_act_giveaway_manager', label: 'Open Giveaway Manager', style: 2 });
    } else if (cleanName === 'lockdown') {
      const snap = db.getLockdownSnapshot(guild.id);
      const ldState = snap ? `ACTIVE (Tier ${snap.tier})` : 'Normal Operations (Inactive)';
      statusPoints.push(`-# • **Panic Lockdown State:** \`${ldState}\``);
      actionButtons.unshift({ type: 2, custom_id: 'athena_act_lockdown_status', label: 'Inspect Lockdown Status', style: 2 });
    } else if (cleanName === 'starboard') {
      const sChan = cfg.starboardChannelId ? `<#${cfg.starboardChannelId}>` : '`Not Configured`';
      const sLimit = cfg.starboardThreshold || 3;
      statusPoints.push(`-# • **Starboard Channel:** ${sChan}`);
      statusPoints.push(`-# • **Star Reaction Threshold:** \`${sLimit} Stars\``);
    } else if (cleanName === 'birthday') {
      const bChan = cfg.birthdayChannelId ? `<#${cfg.birthdayChannelId}>` : '`Not Configured`';
      const bRole = cfg.birthdayRoleId ? `<@&${cfg.birthdayRoleId}>` : '`Not Bound`';
      statusPoints.push(`-# • **Birthday Channel:** ${bChan}`);
      statusPoints.push(`-# • **Celebration Role:** ${bRole}`);
    } else if (cleanName === 'rank' || cleanName === 'leveling' || cleanName === 'ranktheme') {
      const currentTheme = db.getUserRankTheme(user.id);
      statusPoints.push(`-# • **Leveling Module:** ${cfg.levelingEnabled !== false ? '`Active`' : '`Disabled`'}`);
      statusPoints.push(`-# • **Your Active Card Theme:** \`${currentTheme}\``);
      actionButtons.push({ type: 2, custom_id: 'athena_act_rank_preview', label: 'Preview XP Card', style: 2 });
    } else if (cleanName === 'aiannounce' || cleanName === 'announce') {
      statusPoints.push(`-# • **AI Announcement Engine:** \`Gemini 3.8 Flash High Architecture\``);
      statusPoints.push(`-# • **Custom Emoji ID Support:** \`Active (Emoji & ID parsing enabled)\``);
      actionButtons.unshift({ type: 2, custom_id: 'athena_act_aiannounce_create', label: 'Draft AI Announcement', style: 2 });
    } else if (cleanName === 'news') {
      const feeds = db.getNewsFeeds ? db.getNewsFeeds(guild.id) : [];
      const newsChan = cfg.newsChannelId ? `<#${cfg.newsChannelId}>` : '`Not Bound`';
      statusPoints.push(`-# • **News Channel:** ${newsChan}`);
      statusPoints.push(`-# • **Subscribed Feeds:** \`${feeds.length} / 5 feeds active\``);
    } else if (cleanName === 'rate' || cleanName === 'rateedit') {
      const rChan = cfg.rateChannelId ? `<#${cfg.rateChannelId}>` : '`Not Bound`';
      statusPoints.push(`-# • **Rate Edit Channel:** ${rChan}`);
      statusPoints.push(`-# • **Interaction Method:** \`Interactive 1-5 Star Voting Buttons\``);
    }
  }

  // Always offer Ask AI About This
  actionButtons.push({ type: 2, custom_id: `athena_act_ai_ask_${cleanName}`, label: 'Ask AI About This', style: 2 });

  const finalButtons = actionButtons.slice(0, 4);

  return {
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## ${cleanName.toUpperCase()} Telemetry & Status | ${TICK}\n` +
              statusPoints.join('\n') + '\n\n' +
              `-# **__Description:__** ${cmd.description || 'No description registered.'}`
          }
        ]
      },
      {
        type: 1,
        components: finalButtons
      }
    ],
    flags: MessageFlags.IsComponentsV2
  };
}

/**
 * Universal Command Help Inspector
 */
export async function buildDetailedCommandHelpPayload(guild, member, user, cmdName, prefix = '!') {
  const { commandMap } = await import('./loader.js');
  let cmd = commandMap.get(cmdName.toLowerCase());
  if (!cmd) {
    const allCommands = await getAllBotCommands();
    const typo = detectAndCorrectTypos(cmdName, allCommands);
    if (typo.hasTypo && typo.correctedCommand) {
      cmd = commandMap.get(typo.correctedCommand.toLowerCase());
    }
  }

  if (!cmd && (cmdName.toLowerCase() === 'moderation' || cmdName.toLowerCase() === 'mod')) {
    return {
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## Command Manual: !moderation | ${TICK}\n` +
                `-# **__Description:__** High-speed administrative and moderation enforcement matrix.\n` +
                `-# • **Category:** \`Moderation\`\n` +
                `-# • **Clearance Required:** \`Moderator / Administrator\`\n\n` +
                `<:info_jtc:1524111455404953663> **__Key Moderation Commands:__**\n` +
                `-# • \`${prefix}ban <@user> [reason]\` - Permanently ban member from server\n` +
                `-# • \`${prefix}kick <@user> [reason]\` - Kick member from server\n` +
                `-# • \`${prefix}timeout <@user> <duration> [reason]\` - Native Discord timeout\n` +
                `-# • \`${prefix}mute <@user> [reason]\` - Server voice-mute member\n` +
                `-# • \`${prefix}warn <@user> [reason]\` - Issue tracked server warning to user\n` +
                `-# • \`${prefix}purge <count>\` - Mass delete messages\n` +
                `-# • \`${prefix}quarantine <@user>\` - Isolate member to quarantine chamber`
            }
          ]
        },
        {
          type: 1,
          components: [
            { type: 2, custom_id: 'athena_act_cmd_status_moderation', label: 'Inspect Moderation Status', style: 2 },
            { type: 2, custom_id: 'athena_act_automod_panel', label: 'Open AutoMod Panel', style: 2 },
            { type: 2, custom_id: 'athena_act_ai_ask_moderation', label: 'Ask AI About Moderation', style: 2 }
          ]
        }
      ],
      flags: MessageFlags.IsComponentsV2
    };
  }

  if (!cmd) {
    return {
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## Command Not Found | ${TICK}\n` +
                `-# The command \`!${cmdName}\` was not recognized in the Athena catalog.`
            }
          ]
        }
      ],
      flags: MessageFlags.IsComponentsV2
    };
  }

  const cleanName = cmd.name;
  const clearance = getCommandClearanceRequirement(cleanName, cmd);
  const aliases = cmd.aliases && cmd.aliases.length > 0 
    ? cmd.aliases.map(a => `\`!${a}\``).join(', ') 
    : '`None`';

  let subcommands = [];
  if (Array.isArray(cmd.options) && cmd.options.length > 0) {
    for (const opt of cmd.options) {
      if (opt.type === 1) { // SUB_COMMAND
        subcommands.push(`-# • \`${prefix}${cleanName} ${opt.name}\` - ${opt.description}`);
      } else {
        subcommands.push(`-# • \`${opt.name}\`${opt.required ? ' *(Required)*' : ' *(Optional)*'} - ${opt.description}`);
      }
    }
  }

  let content = `## Command Manual: !${cleanName} | ${TICK}\n` +
    `-# **__Description:__** ${cmd.description || 'No description registered.'}\n` +
    `-# • **Category:** \`${cmd.category || 'General'}\`\n` +
    `-# • **Clearance Required:** \`${clearance.label}\`\n` +
    `-# • **Aliases:** ${aliases}\n`;

  if (subcommands.length > 0) {
    content += `\n<:info_jtc:1524111455404953663> **__Subcommands & Parameters:__**\n` + subcommands.slice(0, 8).join('\n') + '\n';
  }

  content += `\n-# **__Quick Invocation:__** Run \`${prefix}${cleanName}\` or \`/${cleanName}\` in any permitted channel.`;

  const buttons = [
    { type: 2, custom_id: `athena_act_cmd_status_${cleanName}`, label: `Inspect ${cleanName} Status`, style: 2 },
    { type: 2, custom_id: `athena_act_ai_ask_${cleanName}`, label: 'Ask AI About This', style: 2 }
  ];

  return {
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content
          }
        ]
      },
      {
        type: 1,
        components: buttons
      }
    ],
    flags: MessageFlags.IsComponentsV2
  };
}

export async function handleAthenaGuideButtons(interaction) {
  const { customId, guild, user, member } = interaction;
  const cfg = db.getGuildConfig(guild?.id || '0');
  const prefix = cfg?.prefix || '!';
  const accentColor = cfg?.accentColor || '#00e5ff';

  if (customId === 'athena_reset_thread') {
    clearGuideSession(guild?.id || '0', user.id, interaction.channelId);
    return cv2.respond(interaction, {
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `### **Conversation Thread Cleared | ${TICK}**\n-# Conversation memory has been reset for this channel. You can now start a fresh topic with \`${prefix}athena <question>\`.`
            }
          ]
        }
      ],
      flags: MessageFlags.IsComponentsV2
    }, 7).catch(() => null);
  }

  if (customId === 'athena_guide_hub') {
    const hub = buildGuideHubContainer(guild, user, prefix);
    return cv2.respond(interaction, hub, 7).catch(() => null);
  }

  // --- ONE-CLICK INTERACTIVE ACTION BUTTON HANDLERS ---
  if (customId && (customId.startsWith('athena_act_') || customId.startsWith('athena_guide_action:'))) {
    const act = customId.startsWith('athena_act_') 
      ? customId.replace('athena_act_', '') 
      : customId.replace('athena_guide_action:', '');

    // 1. Apply Hogwarts Theme
    if (act === 'ranktheme_hogwarts') {
      db.setUserRankTheme(user.id, 'hogwarts');
      return cv2.respond(interaction, {
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## Rank Card Theme Updated | ${TICK}\n` +
                  `-# **__Applied Theme:__** \`Hogwarts (Cinematic Animated Plate)\`\n` +
                  `-# Your XP Rank Card is now equipped with Hogwarts Castle, soaring Hedwig the owl, and glowing altar candles.\n` +
                  `-# Run \`${prefix}rank\` in chat anytime to render your live animated XP card!`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      }, 7).catch(() => null);
    }

    // 2. Apply Athena Theme
    if (act === 'ranktheme_athena') {
      db.setUserRankTheme(user.id, 'athena');
      return cv2.respond(interaction, {
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## Rank Card Theme Updated | ${TICK}\n` +
                  `-# **__Applied Theme:__** \`Athena (Sleek Obsidian Stone)\`\n` +
                  `-# Your XP Rank Card is now set to the classic Athena Obsidian theme.\n` +
                  `-# Run \`${prefix}rank\` in chat anytime to render your card!`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      }, 7).catch(() => null);
    }

    // 3. Preview XP Card
    if (act === 'rank_preview') {
      const currentTheme = db.getUserRankTheme(user.id);
      return cv2.respond(interaction, {
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## XP Rank Card Status | ${TICK}\n` +
                  `-# **__Member:__** <@${user.id}> \`(${user.id})\`\n` +
                  `-# **__Active Theme:__** \`${currentTheme}\`\n` +
                  `-# **__How to Render:__** Run \`${prefix}rank\` in any text channel to generate your full high-res XP banner.\n` +
                  `-# You can switch themes on the spot using the grey action buttons above.`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      }, 7).catch(() => null);
    }

    // 3b. Launch AI Announcement Studio Directly
    if (act === 'aiannounce_create') {
      const hasPerm = member?.permissions?.has(PermissionFlagsBits.ManageGuild) || 
                      member?.permissions?.has(PermissionFlagsBits.ManageMessages) || 
                      member?.permissions?.has(PermissionFlagsBits.Administrator) || 
                      guild?.ownerId === user.id || 
                      isBotOwnerSync(user.id);
      if (!hasPerm) {
        return cv2.respond(interaction, {
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `### Access Denied | ${TICK}\n-# Manage Server, Manage Messages, or Administrator permissions required to launch the AI Announcement Studio.`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }
      const { buildPromptIntakeContainer } = await import('./aiannounce.js');
      const intakeContainer = buildPromptIntakeContainer();
      return cv2.respond(interaction, {
        components: [intakeContainer],
        flags: MessageFlags.IsComponentsV2
      }, 7).catch(() => null);
    }

    // 4. Open Ticket Manager
    if (act === 'ticket_manager') {
      if (!member?.permissions?.has(PermissionFlagsBits.Administrator)) {
        return cv2.respond(interaction, {
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `### Access Denied | ${TICK}\n-# Only Extra Owners or the Server Owner can launch the Ticket Panel Manager.\n-# Non-owners can use \`${prefix}ticket\` to open a support ticket.`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }
      const payload = buildTicketManagerPayload(guild.id);
      return cv2.respond(interaction, payload, 7).catch(() => null);
    }

    // 5. Create Support Ticket
    if (act === 'ticket_create') {
      const payload = buildTicketPanelPayload(guild.id);
      return cv2.respond(interaction, payload, 7).catch(() => null);
    }

    // 6. Inspect Security Status
    if (act === 'security_status') {
      const hasClearance = member?.permissions?.has(PermissionFlagsBits.ModerateMembers) || 
                           member?.permissions?.has(PermissionFlagsBits.Administrator) || 
                           guild.ownerId === user.id;
      if (!hasClearance) {
        return cv2.respond(interaction, {
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `### Access Denied | ${TICK}\n-# Viewing full security status requires Moderator or Administrator clearance.\n-# Athena Prime antinuke shield is actively monitoring server integrity.`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }
      const panel = await getSecurityStatusPanel(guild);
      return cv2.respond(interaction, panel, 7).catch(() => null);
    }

    // 7. Enable All Security
    if (act === 'security_enable_all') {
      const isOwner = guild.ownerId === user.id;
      if (!isOwner) {
        return cv2.respond(interaction, {
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `### Clearance Notice | ${TICK}\n-# Enabling all security modules requires **Server Owner** clearance.\n-# As a server staff member, you can run \`${prefix}security status\` to inspect current protections.`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }
      return cv2.respond(interaction, {
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## One-Click Security Enforcement | ${TICK}\n` +
                  `-# **__Server Owner Detected:__** <@${user.id}>\n` +
                  `-# To initialize the full autonomous antinuke and anti-raid suite with role hierarchy checks, please execute \`${prefix}security enable all\` in this channel.\n` +
                  `-# This guarantees all roles, honeypots, and quarantine channels are bound directly to the database.`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      }, 7).catch(() => null);
    }

    // 8. View Whitelist
    if (act === 'security_whitelist') {
      const panel = await getSecurityStatusPanel(guild);
      return cv2.respond(interaction, panel, 7).catch(() => null);
    }

    // 9. Open AutoMod Panel
    if (act === 'automod_panel') {
      if (!member?.permissions?.has(PermissionFlagsBits.Administrator)) {
        return cv2.respond(interaction, {
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `### Access Denied | ${TICK}\n-# Only Extra Owners or the Server Owner can configure the AutoMod Dashboard.`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }
      const panel = await getAutoModPanel(guild);
      return cv2.respond(interaction, panel, 7).catch(() => null);
    }

    // 10. Toggle AI Toxicity Shield
    if (act === 'automod_ai') {
      if (!member?.permissions?.has(PermissionFlagsBits.Administrator)) {
        return cv2.respond(interaction, {
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `### Access Denied | ${TICK}\n-# Only Extra Owners or the Server Owner can toggle AI Toxicity AutoMod.`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }
      const current = db.getGuildConfig(guild.id).aiToxicityEnabled === true;
      const turnOn = !current;
      db.updateGuildConfig(guild.id, { aiToxicityEnabled: turnOn });
      return cv2.respond(interaction, {
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## AI Toxicity & Sentiment AutoMod | ${TICK}\n` +
                  `-# **__Status:__** ${turnOn ? '`Active / Shielding`' : '`Disabled`'}\n` +
                  `-# ${turnOn ? 'Doxxing attempts (IPs, SSNs, phone numbers), severe toxicity, and violent threats will be autonomously intercepted.' : 'AI Toxicity shield is now deactivated.'}`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      }, 7).catch(() => null);
    }

    // 11. Open Welcome Setup Dashboard
    if (act === 'welcome_setup') {
      const hasPerm = member?.permissions?.has(PermissionFlagsBits.ManageGuild) || 
                      member?.permissions?.has(PermissionFlagsBits.Administrator) || 
                      guild.ownerId === user.id;
      if (!hasPerm) {
        return cv2.respond(interaction, {
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `### Access Denied | ${TICK}\n-# Only Extra Owners or the Server Owner can configure the Welcome System.\n-# Run \`${prefix}welcome\` to view server greeting settings.`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }
      const panel = getManagerPanel(guild.id, 'welcome');
      return cv2.respond(interaction, panel, 7).catch(() => null);
    }

    // 12. Open Leave Setup Dashboard
    if (act === 'leave_setup') {
      const hasPerm = member?.permissions?.has(PermissionFlagsBits.ManageGuild) || 
                      member?.permissions?.has(PermissionFlagsBits.Administrator) || 
                      guild.ownerId === user.id;
      if (!hasPerm) {
        return cv2.respond(interaction, {
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `### Access Denied | ${TICK}\n-# Only Extra Owners or the Server Owner can configure the Leave System.\n-# Run \`${prefix}leave\` to view server departure settings.`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }
      const panel = getManagerPanel(guild.id, 'leave');
      return cv2.respond(interaction, panel, 7).catch(() => null);
    }

    // 13. Test Welcome Card Execution
    if (act === 'welcome_test') {
      const result = await executeWelcomeTest(guild, member, 'welcome');
      if (!result.success) {
        return cv2.respond(interaction, {
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `### Welcome Test Advisory | ${TICK}\n-# • **__Status:__** \`Could not dispatch test message\`\n-# • **__Reason:__** ${result.error}\n-# Click **Open Welcome Setup** below to select a channel from the dropdown first.`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }
      return cv2.respond(interaction, {
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## Welcome Test Card Dispatched | ${TICK}\n-# • **__Target Channel:__** <#${result.channelId}>\n-# • **__Status:__** \`Successfully rendered test welcome card\`\n-# Check <#${result.channelId}> to preview your card layout, avatars, and typography!`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      }, 7).catch(() => null);
    }

    // 13b. View Welcome & Leave Placeholders Guide
    if (act === 'welcome_vars') {
      return cv2.respond(interaction, {
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## Dynamic Placeholders & Variable Matrix | ${TICK}\n` +
                  `-# Use these dynamic placeholders in your Top Text, Title, Description, Author, or Footer.\n\n` +
                  `### Member Counts & Ordinals\n` +
                  `-# • \`{membercount}\` or \`{count}\` — Current server member count (e.g. \`142\`).\n` +
                  `-# • \`{ordinal}\` or \`{ordinal_count}\` — Formatted join milestone ordinal (e.g. \`1st\`, \`2nd\`, \`142nd\`).\n\n` +
                  `### User Information\n` +
                  `-# • \`{user}\` or \`{member}\` — Member ping (\`<@id>\`) or formatted link based on Name Format.\n` +
                  `-# • \`{mention}\` — Literal user ping (\`<@id>\`).\n` +
                  `-# • \`{username}\` — Clean raw username (e.g. \`gwen\`).\n` +
                  `-# • \`{displayname}\` or \`{nickname}\` — Server nickname or display name.\n` +
                  `-# • \`{tag}\` — Full Discord tag.\n` +
                  `-# • \`{userid}\` or \`{id}\` — Raw Discord user snowflake ID.\n` +
                  `-# • \`{avatar}\` — User avatar CDN URL.\n\n` +
                  `### Server Information\n` +
                  `-# • \`{server}\` — Server name.\n` +
                  `-# • \`{serverid}\` — Server snowflake ID.\n` +
                  `-# • \`{server.icon}\` — Server icon CDN URL.\n` +
                  `-# • \`{owner}\` — Server Owner mention (\`<@owner_id>\`).\n` +
                  `-# • \`{boosts}\` — Server Nitro boost count.\n` +
                  `-# • \`{roles}\` — Total server role count.\n` +
                  `-# • \`{channels}\` — Total server channel count.\n\n` +
                  `### Relative Timestamps\n` +
                  `-# • \`{created}\` — Discord relative timestamp for account age.\n` +
                  `-# • \`{joined}\` — Discord relative timestamp for guild join date.\n\n` +
                  `### Example Embed Setup\n` +
                  `-# Top Text: \`Welcome {user}! You are our {ordinal} member!\`\n` +
                  `-# Title: \`Welcome to {server}!\`\n` +
                  `-# Body: \`thank you for joining!\n( ♡ ) {membercount} members [peace]\``
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      }, 7).catch(() => null);
    }

    // 14. Open Giveaway Manager
    if (act === 'giveaway_manager') {
      const hasPerm = member?.permissions?.has(PermissionFlagsBits.Administrator) || 
                      guild?.ownerId === user.id ||
                      isBotOwnerSync(user.id);
      if (!hasPerm) {
        return cv2.respond(interaction, {
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `### Access Denied | ${TICK}\n-# Administrator permissions are required to launch the Giveaway Manager.`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }
      const managerId = interaction.id;
      gwManagers.set(managerId, {
        prize: 'Not Set',
        duration: 'Not Set',
        durationMs: 0,
        winners: 1,
        mode: 'random',
        hostId: user.id,
        channelId: interaction.channelId
      });
      const container = buildManagerContainer(managerId);
      return cv2.respond(interaction, { components: [container], flags: MessageFlags.IsComponentsV2 }, 7).catch(() => null);
    }

    // 15. Server Verification Gateway Control
    if (act === 'verify_setup') {
      const hasPerm = member?.permissions?.has(PermissionFlagsBits.Administrator) || 
                      guild?.ownerId === user.id ||
                      isBotOwnerSync(user.id);
      if (!hasPerm) {
        return cv2.respond(interaction, {
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `### Access Denied | ${TICK}\n-# Administrator permissions are required to configure Server Verification.`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }

      const vData = db.getVerification(guild?.id || '0');
      if (vData && vData.roleId) {
        const vChan = vData.channelId ? `<#${vData.channelId}>` : '`Active Channel`';
        const vRole = `<@&${vData.roleId}>`;
        const vMode = (vData.mode || 'button').toUpperCase();
        return cv2.respond(interaction, {
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## Verification Gateway Control | ${TICK}\n` +
                    `-# • **Operational Status:** \`Deployed & Actively Screening\`\n` +
                    `-# • **Verification Channel:** ${vChan}\n` +
                    `-# • **Verified Role:** ${vRole}\n` +
                    `-# • **Challenge Mechanism:** \`${vMode}\`\n\n` +
                    `-# Switch verification authentication modes or dismantle the gate below:`
                }
              ]
            },
            {
              type: 1,
              components: [
                { type: 2, custom_id: 'athena_act_verify_mode_button', label: 'Set Button Mode', style: 2 },
                { type: 2, custom_id: 'athena_act_verify_mode_captcha', label: 'Set Graphic CAPTCHA', style: 2 },
                { type: 2, custom_id: 'athena_act_verify_mode_math', label: 'Set Math Challenge', style: 2 },
                { type: 2, custom_id: 'athena_act_verify_disable', label: 'Dismantle Gateway', style: 2 }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }

      return cv2.respond(interaction, {
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## Verification Gateway Setup | ${TICK}\n` +
                  `-# • **Operational Status:** \`Not Configured\`\n` +
                  `-# • **Instant Setup:** Run \`${prefix}verify setup <@role> [button|captcha|math]\` in your gate channel.\n` +
                  `-# • **Slash Setup:** \`/verify setup role:@Role mode:button\`\n\n` +
                  `-# **Available Modes:**\n` +
                  `-# • \`button\`: 1-Click instant identity confirmation\n` +
                  `-# • \`captcha\`: Distorted image CAPTCHA (Zero false positives)\n` +
                  `-# • \`math\`: Arithmetic challenge filtering automated bot scripts`
              }
            ]
          },
          {
            type: 1,
            components: [
              { type: 2, custom_id: 'athena_act_cmd_help_verify', label: 'View !verify Manual', style: 2 },
              { type: 2, custom_id: 'athena_act_security_status', label: 'Inspect Security Status', style: 2 }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      }, 7).catch(() => null);
    }

    // 16. Toggle Verification Challenge Mode
    if (act.startsWith('verify_mode_')) {
      const hasPerm = isExtraOwnerOrHigher(user.id, guild);
      if (!hasPerm) {
        return cv2.respond(interaction, {
          components: [{ type: 17, components: [{ type: 10, content: `### Access Denied | ${TICK}\n-# Extra Owner or Server Owner clearance required.` }] }],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }
      const newMode = act.replace('verify_mode_', '');
      const vData = db.getVerification(guild?.id || '0');
      if (!vData || !vData.roleId) {
        return cv2.respond(interaction, {
          components: [{ type: 17, components: [{ type: 10, content: `### Setup Required | ${TICK}\n-# Please deploy verification first using \`${prefix}verify setup <@role>\`.` }] }],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }
      db.updateVerification(guild.id, { mode: newMode });
      return cv2.respond(interaction, {
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## Verification Mode Switched | ${TICK}\n` +
                  `-# • **New Mode:** \`${newMode.toUpperCase()}\`\n` +
                  `-# • Joining members must now pass **${newMode.toUpperCase()}** authentication to receive <@&${vData.roleId}>.`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      }, 7).catch(() => null);
    }

    // 17. Dismantle Verification Gate
    if (act === 'verify_disable') {
      const hasPerm = isExtraOwnerOrHigher(user.id, guild);
      if (!hasPerm) {
        return cv2.respond(interaction, {
          components: [{ type: 17, components: [{ type: 10, content: `### Access Denied | ${TICK}\n-# Extra Owner or Server Owner clearance required.` }] }],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }
      const vData = db.getVerification(guild?.id || '0');
      if (vData && vData.messageId && vData.channelId) {
        try {
          const chan = guild.channels.cache.get(vData.channelId) || await guild.channels.fetch(vData.channelId).catch(() => null);
          if (chan) {
            const m = await chan.messages.fetch(vData.messageId).catch(() => null);
            if (m) await m.delete().catch(() => null);
          }
        } catch {}
      }
      db.deleteVerification(guild.id);
      return cv2.respond(interaction, {
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## Verification Gateway Dismantled | ${TICK}\n` +
                  `-# The verification panel and database bindings have been completely removed.\n` +
                  `-# Run \`${prefix}verify setup <@role>\` anytime to re-deploy.`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      }, 7).catch(() => null);
    }

    // 18. Inspect Lockdown Status
    if (act === 'lockdown_status') {
      const snap = db.getLockdownSnapshot(guild?.id || '0');
      if (snap) {
        const lockedCount = Object.keys(snap.channels || {}).length;
        const timeStr = Math.floor(snap.timestamp / 1000);
        return cv2.respond(interaction, {
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## Panic Lockdown Status: ACTIVE | ${TICK}\n` +
                    `-# • **Active Tier:** \`Tier ${snap.tier}\`\n` +
                    `-# • **Engaged Since:** <t:${timeStr}:R> (<t:${timeStr}:f>)\n` +
                    `-# • **Channels Isolated:** \`${lockedCount} channels\`\n` +
                    `-# • **Snapshot Integrity:** \`Secured in SQLite storage\`\n\n` +
                    `-# Click **Emergency Unlockdown** below to restore all channel permissions instantly.`
                }
              ]
            },
            {
              type: 1,
              components: [
                { type: 2, custom_id: 'athena_act_unlockdown', label: 'Emergency Unlockdown', style: 2 },
                { type: 2, custom_id: 'athena_act_security_status', label: 'Inspect Security Status', style: 2 }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }

      return cv2.respond(interaction, {
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## Panic Lockdown Status: NORMAL | ${TICK}\n` +
                  `-# • **Operational State:** \`No Active Lockdown\`\n` +
                  `-# • **Server Channels:** Standard server permissions active across all categories.\n` +
                  `-# • **Emergency Action:** In case of a raid or compromise, run \`${prefix}lockdown [1|2|3]\` to isolate channels instantly.`
              }
            ]
          },
          {
            type: 1,
            components: [
              { type: 2, custom_id: 'athena_act_security_status', label: 'Inspect Security Status', style: 2 },
              { type: 2, custom_id: 'athena_act_cmd_help_lockdown', label: 'View !lockdown Help', style: 2 }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      }, 7).catch(() => null);
    }

    // 19. Emergency Unlockdown Execution
    if (act === 'unlockdown') {
      const isAuthorized = isBotOwnerSync(user.id) || 
                           user.id === guild?.ownerId || 
                           db.isExtraOwner(guild?.id || '0', user.id) || 
                           member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                           member?.permissions?.has(PermissionFlagsBits.ManageChannels);
      if (!isAuthorized) {
        return cv2.respond(interaction, {
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `### Access Denied | ${TICK}\n-# Only Extra Owners or the Server Owner can lift panic lockdown.`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        }, 7).catch(() => null);
      }

      const result = await handleUnlockdown(guild, member);
      return cv2.respond(interaction, result, 7).catch(() => null);
    }

    // 20. Universal Command Status Inspector
    if (act.startsWith('cmd_status_')) {
      const targetCmd = act.replace('cmd_status_', '');
      const payload = await buildLiveCommandStatusPayload(guild, member, user, targetCmd, prefix);
      return cv2.respond(interaction, payload, 7).catch(() => null);
    }

    // 21. Universal Command Manual Inspector
    if (act.startsWith('cmd_help_')) {
      const targetCmd = act.replace('cmd_help_', '');
      const payload = await buildDetailedCommandHelpPayload(guild, member, user, targetCmd, prefix);
      return cv2.respond(interaction, payload, 7).catch(() => null);
    }

    // 22. Universal Autonomous AI Action Synthesizer (Zero Fake Placeholders)
    const label = interaction.component?.label || act.replace(/^custom_/, '').replace(/_/g, ' ');
    let promptQuery;
    if (act.startsWith('ai_ask_')) {
      const targetCmd = act.replace('ai_ask_', '');
      promptQuery = `How do I configure and use !${targetCmd} in my Discord server? Explain setup steps, options, and best practices.`;
    } else {
      const { commandMap } = await import('./loader.js');
      const parts = act.split('_');
      const potentialCmd = parts[0]?.toLowerCase();
      if (potentialCmd && commandMap.has(potentialCmd)) {
        const sub = parts.slice(1).join(' ');
        promptQuery = `How do I use and configure !${potentialCmd}${sub ? ` ${sub}` : ''} in Athena Prime? Provide complete step-by-step instructions, parameters, and architecture.`;
      } else {
        promptQuery = `How to ${label}? Provide exact step-by-step guidance and actions for Athena Prime.`;
      }
    }

    await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 }).catch(() => null);

    const initialThinking = buildThinkingContainer(
      `Athena Prime is synthesizing action: "${label}"...`,
      `Querying server database and neural knowledge matrix...`
    );

    await cv2.edit(interaction, {
      components: [initialThinking],
      flags: MessageFlags.IsComponentsV2
    }).catch(() => null);

    const progress = createProgressHandler(interaction);

    let aiResult;
    try {
      aiResult = await generateAthenaGuideResponse(promptQuery, {
        guild,
        user,
        member,
        channelId: interaction.channelId,
        prefix,
        onProgress: progress.onProgress
      });
    } finally {
      progress.stop();
    }

    const container = buildAthenaGuideContainer(user, promptQuery, aiResult, accentColor, prefix, aiResult?.session);
    return cv2.edit(interaction, {
      components: [container],
      flags: MessageFlags.IsComponentsV2
    }).catch(() => null);
  }

  // --- MODAL: ASK FOLLOW-UP DOUBT ---
  if (customId === 'athena_ask_followup') {
    const activeSession = getGuideSession(guild?.id || '0', user.id, interaction.channelId);
    const topicCmd = activeSession?.primaryCommand ? `!${activeSession.primaryCommand}` : 'this command';

    const modal = new ModalBuilder()
      .setCustomId('athena_doubt_modal')
      .setTitle('Athena Prime • Ask a Follow-Up');

    const doubtInput = new TextInputBuilder()
      .setCustomId('athena_doubt_input')
      .setLabel(`FOLLOW-UP DOUBT OR BUTTON REQUEST`.slice(0, 45))
      .setPlaceholder(`Ask a doubt or request a button (e.g. "give me a button for hogwarts theme")...`.slice(0, 100))
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(2)
      .setMaxLength(1000)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(doubtInput));
    return interaction.showModal(modal);
  }

  // --- MODAL SUBMIT: PROCESS USER DOUBT ---
  if (interaction.isModalSubmit && interaction.isModalSubmit() && customId === 'athena_doubt_modal') {
    const userDoubt = interaction.fields.getTextInputValue('athena_doubt_input');
    await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 }).catch(() => null);

    const activeSession = getGuideSession(guild?.id || '0', user.id, interaction.channelId);
    const initialContainer = buildThinkingContainer(
      `Athena Prime is analyzing your follow-up inquiry...`,
      `Synthesizing codebase logic and active thread context...`,
      activeSession
    );

    await cv2.edit(interaction, {
      components: [initialContainer],
      flags: MessageFlags.IsComponentsV2
    }).catch(() => null);

    const progress = createProgressHandler(interaction, activeSession);

    let aiResult;
    try {
      aiResult = await generateAthenaGuideResponse(userDoubt, {
        guild,
        user,
        member,
        channelId: interaction.channelId,
        prefix,
        onProgress: progress.onProgress
      });
    } finally {
      progress.stop();
    }

    const container = buildAthenaGuideContainer(user, userDoubt, aiResult, accentColor, prefix, aiResult.session);
    return cv2.edit(interaction, { components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
  }

  // --- CLICKABLE CONTEXTUAL SUGGESTION PILL CHIPS ---
  if (customId && customId.startsWith('athena_fu_')) {
    const idx = parseInt(customId.replace('athena_fu_', ''), 10);
    const activeSession = getGuideSession(guild?.id || '0', user.id, interaction.channelId);
    let query = activeSession?.suggestedFollowUps?.[idx] || interaction.component?.label;
    if (!query) {
      query = `More details on ${activeSession?.primaryCommand || 'this command'}`;
    }

    await interaction.deferUpdate().catch(() => null);

    const initialContainer = buildThinkingContainer(
      `Athena Prime is deep-diving into "${query.slice(0, 50)}"...`,
      `Reading codebase specifications and command execution flows...`,
      activeSession
    );

    await cv2.edit(interaction, {
      components: [initialContainer],
      flags: MessageFlags.IsComponentsV2
    }).catch(() => null);

    const progress = createProgressHandler(interaction, activeSession);

    let aiResult;
    try {
      aiResult = await generateAthenaGuideResponse(query, {
        guild,
        user,
        member,
        channelId: interaction.channelId,
        prefix,
        onProgress: progress.onProgress
      });
    } finally {
      progress.stop();
    }

    const container = buildAthenaGuideContainer(user, query, aiResult, accentColor, prefix, aiResult.session);
    return cv2.edit(interaction, { components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
  }

  const topicPrompts = {
    'athena_topic_security': 'How do I configure Athena Prime Security and Antinuke to protect against rogue admins, role exploits, and unauthorized bot adds?',
    'athena_topic_automod': 'How do I setup Automod and enable the AI Toxicity and Doxxing intercept shield?',
    'athena_topic_tickets': 'How do I deploy the support ticket system with voice channels and Smart AI Triage for ban appeals?',
    'athena_topic_minigames': 'How do I use and configure the server economy and casino minigames (Blackjack, Roulette, Trivia)?',
    'athena_topic_lockdown': 'How does Panic Lockdown Tier 1, Tier 2, and Tier 3 work and how do I safely unlockdown?',
    'athena_topic_learn': 'What is Heuristic Learn Mode and how do I baseline my server staff actions?'
  };

  if (topicPrompts[customId]) {
    await interaction.deferUpdate().catch(() => null);
    const query = topicPrompts[customId];

    const activeSession = getGuideSession(guild?.id || '0', user.id, interaction.channelId);
    const initialContainer = buildThinkingContainer(
      `Athena Prime is scanning module architecture & system domain...`,
      `Reading deep-dive specifications and real source files...`,
      activeSession
    );

    await cv2.edit(interaction, {
      components: [initialContainer],
      flags: MessageFlags.IsComponentsV2
    }).catch(() => null);

    const progress = createProgressHandler(interaction, activeSession);

    let aiResult;
    try {
      aiResult = await generateAthenaGuideResponse(query, {
        guild,
        user,
        member,
        channelId: interaction.channelId,
        prefix,
        onProgress: progress.onProgress
      });
    } finally {
      progress.stop();
    }

    const container = buildAthenaGuideContainer(user, query, aiResult, accentColor, prefix, aiResult.session);
    return cv2.edit(interaction, { components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
  }

  if (customId === 'athena_topic_help') {
    const { buildHelpContainer } = await import('./utility.js');
    const helpContainer = buildHelpContainer(interaction.client, guild?.id, 'home');
    return cv2.respond(interaction, { components: [helpContainer], flags: MessageFlags.IsComponentsV2 }, 7).catch(() => null);
  }
}

export default commands;
