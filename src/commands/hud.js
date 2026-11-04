import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import db from '../database.js';
import os from 'os';
import { cleanDisplayName } from '../utils/helpers.js';

export const commands = [
  {
    name: 'hud',
    aliases: ['warroom', 'corehud', 'matrixhud'],
    description: 'Displays the flagship Athena Prime War-Room Animated Cyber HUD.',
    category: 'utility',
    options: [
      {
        name: 'mode',
        description: 'HUD Mode: telemetry (system core), server (guild overview), defcon (defense status)',
        type: 3,
        required: false,
        choices: [
          { name: 'Core System Telemetry', value: 'telemetry' },
          { name: 'Server Dashboard', value: 'server' },
          { name: 'DEFCON Defense Status', value: 'defcon' },
          { name: 'Unified Command Center (All-in-One)', value: 'omni' }
        ]
      }
    ],
    async executePrefix(message, args) {
      const mode = args[0]?.toLowerCase() || 'telemetry';
      const result = await buildHudResponse(message.guild, message.client, mode, message.author);
      return message.reply(result);
    },
    async executeSlash(interaction) {
      await interaction.deferReply();
      const mode = interaction.options.getString('mode') || 'telemetry';
      const result = await buildHudResponse(interaction.guild, interaction.client, mode, interaction.user);
      return interaction.editReply(result);
    }
  }
];

export async function buildHudResponse(guild, client, mode = 'telemetry', requester = null) {
  if (mode === 'omni' || mode === 'all' || mode === 'dashboard') {
    const { buildDashboardResponse } = await import('./dashboard.js');
    return buildDashboardResponse(guild, client, requester);
  }

  const config = guild ? db.getGuildConfig(guild.id) : null;
  const accentColor = config?.accentColor || '#00f0ff';

  if (mode === 'server' && guild) {
    if (guild.memberCount !== guild.members.cache.size) {
      await guild.members.fetch().catch(() => null);
    }
    const boostLevel = guild.premiumTier || 0;

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hud_mode_telemetry').setLabel('Core Telemetry').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('hud_mode_server').setLabel('Server Dashboard').setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId('hud_mode_defcon').setLabel('DEFCON Status').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('hud_mode_omni').setLabel('Unified Dashboard').setStyle(ButtonStyle.Success)
    );

    const container = {
      type: 17,
      components: [
        { type: 10, content: `# ${getRandomHeadingGlyph()} **${cleanDisplayName(guild.name)} // War-Room Dashboard** | <a:03_tick_circle:1565665642084827206>` },
        { type: 14, divider: true },
        {
          type: 10,
          content:
            `> -# ${BULLET_EMOJI} **Server ID:** \`${guild.id}\`\n` +
            `> -# ${BULLET_EMOJI} **Total Members:** \`${guild.memberCount.toLocaleString()}\` members\n` +
            `> -# ${BULLET_EMOJI} **Total Channels:** \`${guild.channels.cache.size}\` channels\n` +
            `> -# ${BULLET_EMOJI} **Total Roles:** \`${guild.roles.cache.size}\` roles\n` +
            `> -# ${BULLET_EMOJI} **Boost Tier:** \`Level ${boostLevel}\` (${guild.premiumSubscriptionCount || 0} boosts)`
        },
        { type: 14, divider: true },
        { type: 10, content: `-# **Athena Prime Tactical War-Room \u2022 Live Interface**` }
      ]
    };

    return {
      components: [container, actionRow],
      files: [],
      flags: MessageFlags.IsComponentsV2
    };
  }

  if (mode === 'defcon' && guild) {
    const lockdown = db.getLockdownSnapshot(guild.id);
    const raidActive = Boolean(config?.raidMode);
    const isEmergency = Boolean(db.getEmergencyState(guild.id));
    const isAlert = Boolean(lockdown || raidActive || isEmergency);

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hud_mode_telemetry').setLabel('Core Telemetry').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('hud_mode_server').setLabel('Server Dashboard').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('hud_mode_defcon').setLabel('DEFCON Status').setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId('hud_mode_omni').setLabel('Unified Dashboard').setStyle(ButtonStyle.Success)
    );

    const container = {
      type: 17,
      components: [
        { type: 10, content: `# ${getRandomHeadingGlyph()} **DEFCON Defense Matrix Status** | <a:03_tick_circle:1565665642084827206>` },
        { type: 14, divider: true },
        {
          type: 10,
          content:
            `> -# ${BULLET_EMOJI} **Server Threat State:** ${isAlert ? '`DEFCON 1 (Elevated Security)`' : '`DEFCON 5 (Peacetime / Normal)`'}\n` +
            `> -# ${BULLET_EMOJI} **Server Panic Lockdown:** ${lockdown ? `\`Active (${lockdown.tierLabel || 'Tier ' + lockdown.tier})\`` : '`Standby (Disengaged)`'}\n` +
            `> -# ${BULLET_EMOJI} **Raid Shield:** ${raidActive ? '`Armed (Auto-quarantine active)`' : '`Monitoring`'}\n` +
            `> -# ${BULLET_EMOJI} **Emergency Blackout:** ${isEmergency ? '`Active (Blackout engaged)`' : '`Inactive`'}`
        },
        { type: 14, divider: true },
        { type: 10, content: `-# **Athena Prime Tactical War-Room \u2022 DEFCON Protocols**` }
      ]
    };

    return {
      components: [container, actionRow],
      files: [],
      flags: MessageFlags.IsComponentsV2
    };
  }

  // Default: Core Telemetry
  const uptime = Math.floor(process.uptime());
  const d = Math.floor(uptime / 86400);
  const h = Math.floor((uptime % 86400) / 3600);
  const m = Math.floor((uptime % 3600) / 60);

  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const totalMemMB = Math.round(os.totalmem() / 1024 / 1024);
  const totalServers = client.guilds.cache.size;

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('hud_mode_telemetry').setLabel('Core Telemetry').setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('hud_mode_server').setLabel('Server Dashboard').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hud_mode_defcon').setLabel('DEFCON Status').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hud_mode_omni').setLabel('Unified Dashboard').setStyle(ButtonStyle.Success)
  );

  const container = {
    type: 17,
    components: [
      { type: 10, content: `# ${getRandomHeadingGlyph()} **Athena Prime Core Telemetry** | <a:03_tick_circle:1565665642084827206>` },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          `> -# ${BULLET_EMOJI} **Gateway Ping:** \`${client.ws.ping}ms\`\n` +
          `> -# ${BULLET_EMOJI} **Active Clusters:** \`${totalServers.toLocaleString()}\` servers connected\n` +
          `> -# ${BULLET_EMOJI} **Memory Usage:** \`${heapMB} MB\` heap / \`${totalMemMB} MB\` system RAM\n` +
          `> -# ${BULLET_EMOJI} **Process Uptime:** \`${d}d ${h}h ${m}m\` continuous\n` +
          `> -# ${BULLET_EMOJI} **Node Engine:** \`${process.version}\` on \`${os.platform()} (${os.arch()})\``
      },
      { type: 14, divider: true },
      { type: 10, content: `-# **Athena Prime Tactical War-Room \u2022 Core Telemetry**` }
    ]
  };

  return {
    components: [container, actionRow],
    files: [],
    flags: MessageFlags.IsComponentsV2
  };
}
