import { 
  PermissionFlagsBits, 
  ChannelType, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  MessageFlags,
  EmbedBuilder
} from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { 
  getRandomHeadingGlyph, 
  BULLET_EMOJI, 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  UPTIME_EMOJI 
} from '../utils/emojis.js';
import { formatChannelLink, formatUserLink, isExtraOwnerOrHigher } from '../utils/helpers.js';
import { buildServerLogEmbed, logServerEvent } from '../utils/serverLogger.js';
import { markRestorationQueued } from '../utils/antinuke.js';

export const LOG_MODULES = [
  { id: 'channels', name: 'Channel Events', desc: 'Create, delete, update, and permission modifications' },
  { id: 'voice', name: 'Voice Status Subtitles', desc: 'Live voice channel activity status updates and moves' },
  { id: 'roles', name: 'Role & Perm Events', desc: 'Role create, delete, color, and permission diffs' },
  { id: 'server', name: 'Server Identity Events', desc: 'Server name, icon, banner, and security modifications' },
  { id: 'emojis', name: 'Emoji & Stickers', desc: 'Custom emoji and sticker additions and removals' },
  { id: 'webhooks', name: 'Webhooks & Integrations', desc: 'Webhook creations, updates, and token modifications' },
  { id: 'invites', name: 'Invites & Vanity', desc: 'Server invite creations, deletions, and vanity status' },
  { id: 'bans', name: 'Moderation & Bans', desc: 'Member bans, unbans, kicks, and security purges' }
];

/**
 * Automatically create the logs category and a private staff-only server-logs channel.
 */
export async function setupServerLogsChannel(guild) {
  const config = db.getGuildConfig(guild.id);
  const sl = config.serverLogs || { enabled: false, defaultChannelId: null, categoryId: null, modules: {} };

  // 1. Ensure Logs Category: Logs (Pure letters, no emojis/decorations)
  let category = sl.categoryId 
    ? guild.channels.cache.get(sl.categoryId) || await guild.channels.fetch(sl.categoryId).catch(() => null)
    : null;

  if (!category) {
    category = await guild.channels.create({
      name: 'Logs',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id, // @everyone
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: guild.client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles
          ]
        }
      ],
      reason: 'Athena Server Logs Category Deployment'
    });
    sl.categoryId = category.id;
    markRestorationQueued(category.id);
  } else if (category.name === '╭・Logs') {
    await category.setName('Logs').catch(() => null);
  }

  // 2. Ensure Text Channel: server-logs (Pure letters, no emojis)
  let logChannel = sl.defaultChannelId
    ? guild.channels.cache.get(sl.defaultChannelId) || await guild.channels.fetch(sl.defaultChannelId).catch(() => null)
    : null;

  if (!logChannel) {
    logChannel = await guild.channels.create({
      name: 'server-logs',
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: guild.client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }
      ],
      reason: 'Athena Server Logs Channel Auto-Creation'
    });
    markRestorationQueued(logChannel.id);
  } else if (logChannel.name === '📁・server-logs' || logChannel.name === '📁 . server-logs' || logChannel.name.includes('📁')) {
    await logChannel.setName('server-logs').catch(() => null);
  }

  sl.defaultChannelId = logChannel.id;
  sl.enabled = true;
  db.updateGuildConfig(guild.id, { serverLogs: sl });

  // Send initial welcome message to log channel
  const welcomeEmbed = buildServerLogEmbed({
    title: 'Server Logs System Initialized',
    color: '#5865F2',
    attributes: {
      'Status': 'Active & Operational',
      'Target Channel': formatChannelLink(logChannel, guild),
      'Category': formatChannelLink(category, guild),
      'Monitored Events': 'Channels, Voice Status, Roles, Server Settings, Emojis, Webhooks, Invites'
    },
    client: guild.client
  });
  await logChannel.send({ embeds: [welcomeEmbed] }).catch(() => null);

  return { category, logChannel, sl };
}

/**
 * Bind an existing guild channel as the server logs channel.
 */
export async function bindServerLogsChannel(guild, targetChannel) {
  if (!targetChannel || !targetChannel.isTextBased()) {
    throw new Error('Target channel must be a valid text-based channel.');
  }

  const config = db.getGuildConfig(guild.id);
  const sl = config.serverLogs || { enabled: false, defaultChannelId: null, categoryId: null, modules: {} };

  sl.defaultChannelId = targetChannel.id;
  sl.enabled = true;
  db.updateGuildConfig(guild.id, { serverLogs: sl });

  const confirmEmbed = buildServerLogEmbed({
    title: 'Server Logs Channel Bound',
    color: '#43B581',
    attributes: {
      'Status': 'Successfully Bound',
      'Target Channel': formatChannelLink(targetChannel, guild),
      'Assigned By': 'Server Owner / Extra Owner',
      'Coverage': 'All live server modifications will now route to this channel.'
    },
    client: guild.client
  });
  await targetChannel.send({ embeds: [confirmEmbed] }).catch(() => null);

  return sl;
}

/**
 * Build interactive Components V2 Server Logs panel.
 */
export function buildServerLogsPanel(guild, note = null) {
  const config = db.getGuildConfig(guild.id);
  const sl = config.serverLogs || { enabled: false, defaultChannelId: null, categoryId: null, modules: {} };

  const isEnabled = Boolean(sl.enabled && sl.defaultChannelId);
  const defaultChannelLink = sl.defaultChannelId 
    ? formatChannelLink(sl.defaultChannelId, guild) 
    : '`None (Not Configured)`';
  const categoryLink = sl.categoryId 
    ? formatChannelLink(sl.categoryId, guild) 
    : '`None`';

  const noteText = note ? `> **Note:** ${note}\n\n` : '';

  const modulesList = LOG_MODULES.map(m => {
    const mCfg = sl.modules?.[m.id];
    const isModActive = (mCfg?.enabled !== false) && isEnabled;
    const statusPill = isModActive ? '`Active`' : '`Disabled`';
    return `> ${BULLET_EMOJI} **${m.name}:** ${statusPill} — ${m.desc}`;
  }).join('\n');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('serverlogs_btn_create')
      .setLabel('Auto-Create Channel')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('serverlogs_btn_toggle')
      .setLabel(sl.enabled ? 'Disable Logging' : 'Enable Logging')
      .setStyle(sl.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('serverlogs_btn_test')
      .setLabel('Dispatch Test Log')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!sl.defaultChannelId),
    new ButtonBuilder()
      .setCustomId('serverlogs_btn_disable')
      .setLabel('Unbind Channel')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!sl.defaultChannelId)
  );

  const container = {
    type: 17,
    accent_color: isEnabled ? 0x43B581 : 0x5865F2,
    components: [
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} Server Logging Matrix | ${TICK_EMOJI}`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          noteText +
          `> -# ${UPTIME_EMOJI} **Master Switch:** \`${sl.enabled ? 'Active & Logging' : 'Disabled'}\`\n` +
          `> -# ${BULLET_EMOJI} **Log Channel:** ${defaultChannelLink}\n` +
          `> -# ${BULLET_EMOJI} **Logs Category:** ${categoryLink}\n\n` +
          `> -# **__Monitored Modification Suites:__**\n` +
          modulesList +
          `\n\n> -# **__Commands & Usage:__**\n` +
          `> ${BULLET_EMOJI} \`!serverlogs setup\` — Automatically deploy \`Logs\` & \`server-logs\`.\n` +
          `> ${BULLET_EMOJI} \`!serverlogs bind <#channel>\` — Bind an existing text channel for logs.\n` +
          `> ${BULLET_EMOJI} \`!serverlogs test\` — Dispatch an immediate test verification embed.\n` +
          `> ${BULLET_EMOJI} \`!serverlogs disable\` — Toggle off or unbind logging.`
      },
      { type: 14, divider: true },
      row.toJSON(),
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# **Athena Bulletproof Security Matrix • V1.0.0**`
      }
    ]
  };

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}

/**
 * Handle button interactions for server logs panel.
 */
export async function handleServerLogsInteraction(interaction) {
  const customId = interaction.customId;
  if (!customId || !customId.startsWith('serverlogs_btn_')) return;

  const guild = interaction.guild;
  if (!guild) return;

  if (customId === 'serverlogs_btn_create') {
    await interaction.deferUpdate().catch(() => null);
    try {
      const { logChannel } = await setupServerLogsChannel(guild);
      return interaction.editReply(buildServerLogsPanel(guild, `Auto-created and bound ${formatChannelLink(logChannel, guild)} successfully!`));
    } catch (err) {
      console.error('[ServerLogs] Auto-setup button error:', err);
      return interaction.followUp(cv2.danger(`Setup Failed | ${WRONG_EMOJI}`, `Could not create channels: ${err.message}`));
    }
  }

  if (customId === 'serverlogs_btn_toggle') {
    await interaction.deferUpdate().catch(() => null);
    const config = db.getGuildConfig(guild.id);
    const sl = config.serverLogs || { enabled: false };
    sl.enabled = !sl.enabled;
    db.updateGuildConfig(guild.id, { serverLogs: sl });
    return interaction.editReply(buildServerLogsPanel(guild, `Master logging switch toggled to **${sl.enabled ? 'Enabled' : 'Disabled'}**.`));
  }

  if (customId === 'serverlogs_btn_test') {
    await interaction.deferUpdate().catch(() => null);
    const config = db.getGuildConfig(guild.id);
    const sl = config.serverLogs;
    if (!sl?.defaultChannelId) {
      return interaction.followUp(cv2.warn(`Not Configured | ${WARN_EMOJI}`, 'No server logs channel is currently configured.'));
    }

    const testEmbed = buildServerLogEmbed({
      title: 'Server Logs Test Verification',
      color: '#43B581',
      attributes: {
        'Status': 'Verification Passed',
        'Triggered By': formatUserLink(interaction.user, guild),
        'Target Channel': formatChannelLink(sl.defaultChannelId, guild),
        'Latency': `${interaction.client.ws.ping}ms`
      },
      client: guild.client
    });

    await logServerEvent(guild, 'server', testEmbed);
    return interaction.editReply(buildServerLogsPanel(guild, 'Verification test log dispatched to the configured log channel!'));
  }

  if (customId === 'serverlogs_btn_disable') {
    await interaction.deferUpdate().catch(() => null);
    const config = db.getGuildConfig(guild.id);
    const sl = config.serverLogs || {};
    sl.enabled = false;
    sl.defaultChannelId = null;
    db.updateGuildConfig(guild.id, { serverLogs: sl });
    return interaction.editReply(buildServerLogsPanel(guild, 'Server logging system has been disabled and unconfigured.'));
  }
}

export const commands = [
  {
    name: 'serverlogs',
    aliases: ['slogs', 'logchannel', 'auditlogs', 'serverlog'],
    description: 'Configure automated server modification and voice status logging. [Extra Owner]',
    category: 'utility',
    permissions: [PermissionFlagsBits.Administrator],
    options: [
      {
        name: 'panel',
        description: 'Open the interactive Server Logs Control Panel',
        type: 1
      },
      {
        name: 'setup',
        description: 'Automatically create the logs category and server-logs channel',
        type: 1
      },
      {
        name: 'bind',
        description: 'Bind an existing text channel for server modification logs',
        type: 1,
        options: [
          { name: 'channel', description: 'The text channel to bind', type: 7, required: true }
        ]
      },
      {
        name: 'test',
        description: 'Dispatch a test log embed to verify delivery',
        type: 1
      },
      {
        name: 'disable',
        description: 'Disable server modification logging',
        type: 1
      }
    ],

    async executePrefix(message, args) {
      if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
        return message.reply(cv2.warn(`Permission Denied | ${WARN_EMOJI}`, 'This command is strictly restricted to Extra Owners (or Server Owner).'));
      }
      const sub = args[0]?.toLowerCase();

      // 1. Auto-Setup / Create: !serverlogs setup | !serverlogs create
      if (sub === 'setup' || sub === 'create' || sub === 'autosetup') {
        try {
          const { logChannel } = await setupServerLogsChannel(message.guild);
          return message.reply(cv2.success(
            `Logs Deployed | ${TICK_EMOJI}`,
            `Successfully deployed ${formatChannelLink(logChannel.id, message.guild)} under \`╭・Logs\`!\nAll server modifications and voice statuses are now actively tracked.`
          ));
        } catch (e) {
          return message.reply(cv2.danger(`Error | ${WRONG_EMOJI}`, `Failed to create log channel: ${e.message}`));
        }
      }

      // 2. Bind Existing Channel: !serverlogs bind #channel | !serverlogs set #channel
      if (sub === 'bind' || sub === 'set' || sub === 'channel') {
        const rawTarget = args[1] || '';
        const targetId = rawTarget.replace(/[^0-9]/g, '');
        const targetChannel = message.mentions.channels.first() || 
          message.guild.channels.cache.get(targetId) || 
          message.guild.channels.cache.find(c => c.name.toLowerCase() === rawTarget.toLowerCase());

        if (!targetChannel) {
          return message.reply(cv2.warn(`Usage | ${WARN_EMOJI}`, 'Please mention or specify a valid text channel: `!serverlogs bind #channel`'));
        }

        try {
          await bindServerLogsChannel(message.guild, targetChannel);
          return message.reply(cv2.success(
            `Logs Bound | ${TICK_EMOJI}`,
            `Successfully bound server modification logs to ${formatChannelLink(targetChannel.id, message.guild)}!\nAll server modifications and voice statuses will now route here.`
          ));
        } catch (e) {
          return message.reply(cv2.danger(`Error | ${WRONG_EMOJI}`, e.message));
        }
      }

      // 3. Test Log: !serverlogs test
      if (sub === 'test') {
        const config = db.getGuildConfig(message.guild.id);
        const sl = config.serverLogs;
        if (!sl?.defaultChannelId) {
          return message.reply(cv2.warn(`Not Configured | ${WARN_EMOJI}`, 'No server logs channel is configured. Run `!serverlogs setup` or `!serverlogs bind #channel`.'));
        }

        const testEmbed = buildServerLogEmbed({
          title: 'Server Logs Test Verification',
          color: '#43B581',
          attributes: {
            'Status': 'Verification Passed',
            'Triggered By': formatUserLink(message.author, message.guild),
            'Target Channel': formatChannelLink(sl.defaultChannelId, message.guild),
            'Latency': `${message.client.ws.ping}ms`
          },
          client: message.client
        });
        await logServerEvent(message.guild, 'server', testEmbed);
        return message.reply(cv2.success(`Test Sent | ${TICK_EMOJI}`, `Dispatched a test log embed to ${formatChannelLink(sl.defaultChannelId, message.guild)}.`));
      }

      // 4. Disable: !serverlogs disable | !serverlogs off
      if (sub === 'disable' || sub === 'off') {
        const config = db.getGuildConfig(message.guild.id);
        const sl = config.serverLogs || {};
        sl.enabled = false;
        db.updateGuildConfig(message.guild.id, { serverLogs: sl });
        return message.reply(cv2.success(`Logging Disabled | ${TICK_EMOJI}`, 'Server modification logging has been turned off.'));
      }

      // Default: Display interactive panel
      return message.reply(buildServerLogsPanel(message.guild));
    },

    async executeSlash(interaction) {
      if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
        return interaction.reply({ ...cv2.warn(`Permission Denied | ${WARN_EMOJI}`, 'This command is strictly restricted to Extra Owners (or Server Owner).'), flags: MessageFlags.Ephemeral });
      }
      const sub = interaction.options.getSubcommand() || 'panel';

      if (sub === 'setup') {
        await interaction.deferReply();
        try {
          const { logChannel } = await setupServerLogsChannel(interaction.guild);
          return interaction.editReply(cv2.success(
            `Logs Deployed | ${TICK_EMOJI}`,
            `Successfully deployed ${formatChannelLink(logChannel.id, interaction.guild)} under \`╭・Logs\`!\nAll server modifications and voice statuses are now actively tracked.`
          ));
        } catch (e) {
          return interaction.editReply(cv2.danger(`Error | ${WRONG_EMOJI}`, `Failed to create log channel: ${e.message}`));
        }
      }

      if (sub === 'bind') {
        await interaction.deferReply();
        const targetChannel = interaction.options.getChannel('channel');
        try {
          await bindServerLogsChannel(interaction.guild, targetChannel);
          return interaction.editReply(cv2.success(
            `Logs Bound | ${TICK_EMOJI}`,
            `Successfully bound server modification logs to ${formatChannelLink(targetChannel.id, interaction.guild)}!\nAll server modifications and voice statuses will now route here.`
          ));
        } catch (e) {
          return interaction.editReply(cv2.danger(`Error | ${WRONG_EMOJI}`, e.message));
        }
      }

      if (sub === 'test') {
        await interaction.deferReply();
        const config = db.getGuildConfig(interaction.guild.id);
        const sl = config.serverLogs;
        if (!sl?.defaultChannelId) {
          return interaction.editReply(cv2.warn(`Not Configured | ${WARN_EMOJI}`, 'No server logs channel is configured. Run `/serverlogs setup` or `/serverlogs bind`.'));
        }

        const testEmbed = buildServerLogEmbed({
          title: 'Server Logs Test Verification',
          color: '#43B581',
          attributes: {
            'Status': 'Verification Passed',
            'Triggered By': formatUserLink(interaction.user, interaction.guild),
            'Target Channel': formatChannelLink(sl.defaultChannelId, interaction.guild),
            'Latency': `${interaction.client.ws.ping}ms`
          },
          client: interaction.client
        });
        await logServerEvent(interaction.guild, 'server', testEmbed);
        return interaction.editReply(cv2.success(`Test Sent | ${TICK_EMOJI}`, `Dispatched a test log embed to ${formatChannelLink(sl.defaultChannelId, interaction.guild)}.`));
      }

      if (sub === 'disable') {
        await interaction.deferReply();
        const config = db.getGuildConfig(interaction.guild.id);
        const sl = config.serverLogs || {};
        sl.enabled = false;
        db.updateGuildConfig(interaction.guild.id, { serverLogs: sl });
        return interaction.editReply(cv2.success(`Logging Disabled | ${TICK_EMOJI}`, 'Server modification logging has been turned off.'));
      }

      // Default: panel
      return interaction.reply(buildServerLogsPanel(interaction.guild));
    }
  }
];
