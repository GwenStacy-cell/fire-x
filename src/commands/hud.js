import { PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import db from '../database.js';
import os from 'os';
import { generateCommandStatusBanner } from '../utils/canvasCards.js';
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
    const bannerAttachment = await generateCommandStatusBanner({
      title: cleanDisplayName(guild.name).toUpperCase(),
      subtitle: `${guild.id} // COMMAND CENTER`,
      badge: boostLevel > 0 ? `BOOST LEVEL ${boostLevel}` : 'ACTIVE DEFENSE',
      badgeColor: boostLevel > 0 ? '#ff73fa' : '#00f0ff',
      iconUrl: guild.iconURL({ extension: 'png', size: 256, forceStatic: true }) || null,
      fallbackInitial: guild.name[0] || 'S',
      current: guild.memberCount,
      total: Math.max(100, Math.ceil(guild.memberCount / 100) * 100),
      unit: 'MEMBERS',
      accentColor: accentColor,
      metrics: [
        { label: 'MEMBERS', value: `${guild.memberCount}` },
        { label: 'ROLES', value: `${guild.roles.cache.size}` },
        { label: 'CHANNELS', value: `${guild.channels.cache.size}` }
      ],
      attachmentName: 'warroom_server.gif',
      animated: true
    }).catch(() => null);

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hud_mode_telemetry').setLabel('Core Telemetry').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('hud_mode_server').setLabel('Server Dashboard').setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId('hud_mode_defcon').setLabel('DEFCON Status').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('hud_mode_omni').setLabel('Unified Dashboard').setStyle(ButtonStyle.Success)
    );

    const container = {
      type: 17,
      components: [
        ...(bannerAttachment ? [{ type: 12, items: [{ media: { url: 'attachment://warroom_server.gif' } }] }] : []),
        { type: 10, content: `## **${cleanDisplayName(guild.name)} // War-Room Dashboard** | <a:03_tick_circle:1565665642084827206>` },
        { type: 14, divider: true },
        {
          type: 10,
          content:
            `> -# \u2022 **Server ID:** \`${guild.id}\`\n` +
            `> -# \u2022 **Total Members:** \`${guild.memberCount.toLocaleString()}\` members\n` +
            `> -# \u2022 **Total Channels:** \`${guild.channels.cache.size}\` channels\n` +
            `> -# \u2022 **Total Roles:** \`${guild.roles.cache.size}\` roles\n` +
            `> -# \u2022 **Boost Tier:** \`Level ${boostLevel}\` (${guild.premiumSubscriptionCount || 0} boosts)`
        },
        { type: 14, divider: true },
        { type: 10, content: `-# **Athena Prime Tactical War-Room \u2022 Live Interface**` }
      ]
    };

    return {
      components: [container, actionRow],
      files: bannerAttachment ? [bannerAttachment] : [],
      flags: MessageFlags.IsComponentsV2
    };
  }

  if (mode === 'defcon' && guild) {
    const lockdown = db.getLockdownSnapshot(guild.id);
    const raidActive = Boolean(config?.raidMode);
    const isEmergency = Boolean(db.getEmergencyState(guild.id));
    const isAlert = Boolean(lockdown || raidActive || isEmergency);

    const bannerAttachment = await generateCommandStatusBanner({
      title: isAlert ? 'DEFCON 1: SERVER THREAT DETECTED' : 'DEFCON 5: ALL SYSTEMS NORMAL',
      subtitle: `${guild.name.toUpperCase()} // DEFENSE MATRIX`,
      badge: isEmergency ? 'BLACKOUT EMERGENCY' : lockdown ? (lockdown.tierLabel || 'LOCKDOWN ACTIVE') : raidActive ? 'RAID MODE ACTIVE' : 'PEACETIME GUARDED',
      badgeColor: isAlert ? '#ff2a4b' : '#00f0ff',
      iconUrl: guild.iconURL({ extension: 'png', size: 256, forceStatic: true }) || null,
      fallbackInitial: guild.name[0] || 'D',
      current: isAlert ? 100 : 25,
      total: 100,
      unit: 'THREAT LVL',
      accentColor: isAlert ? '#ff2a4b' : '#00f0ff',
      metrics: [
        { label: 'LOCKDOWN', value: lockdown ? 'ACTIVE' : 'STANDBY' },
        { label: 'RAID SHIELD', value: raidActive ? 'ARMED' : 'ONLINE' },
        { label: 'VERIFICATION', value: guild.verificationLevel >= 4 ? 'PHONE REQ' : 'NORMAL' }
      ],
      attachmentName: 'warroom_defcon.gif',
      animated: true
    }).catch(() => null);

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hud_mode_telemetry').setLabel('Core Telemetry').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('hud_mode_server').setLabel('Server Dashboard').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('hud_mode_defcon').setLabel('DEFCON Status').setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId('hud_mode_omni').setLabel('Unified Dashboard').setStyle(ButtonStyle.Success)
    );

    const container = {
      type: 17,
      components: [
        ...(bannerAttachment ? [{ type: 12, items: [{ media: { url: 'attachment://warroom_defcon.gif' } }] }] : []),
        { type: 10, content: `## **DEFCON Defense Matrix Status** | <a:03_tick_circle:1565665642084827206>` },
        { type: 14, divider: true },
        {
          type: 10,
          content:
            `> -# \u2022 **Server Threat State:** ${isAlert ? '`DEFCON 1 (Elevated Security)`' : '`DEFCON 5 (Peacetime / Normal)`'}\n` +
            `> -# \u2022 **Server Panic Lockdown:** ${lockdown ? `\`Active (${lockdown.tierLabel || 'Tier ' + lockdown.tier})\`` : '`Standby (Disengaged)`'}\n` +
            `> -# \u2022 **Raid Shield:** ${raidActive ? '`Armed (Auto-quarantine active)`' : '`Monitoring`'}\n` +
            `> -# \u2022 **Emergency Blackout:** ${isEmergency ? '`Active (Blackout engaged)`' : '`Inactive`'}`
        },
        { type: 14, divider: true },
        { type: 10, content: `-# **Athena Prime Tactical War-Room \u2022 DEFCON Protocols**` }
      ]
    };

    return {
      components: [container, actionRow],
      files: bannerAttachment ? [bannerAttachment] : [],
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

  const bannerAttachment = await generateCommandStatusBanner({
    title: 'ATHENA PRIME CORE TELEMETRY',
    subtitle: `${client.user.username.toUpperCase()} // SYSTEM HEALTH & CLUSTERS`,
    badge: 'ONLINE // ALL SYSTEMS NOMINAL',
    badgeColor: '#00ff88',
    iconUrl: client.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }) || null,
    fallbackInitial: 'A',
    current: heapMB,
    total: Math.max(500, Math.round(totalMemMB / 4)),
    unit: 'MB HEAP',
    accentColor: accentColor,
    metrics: [
      { label: 'SERVERS', value: `${totalServers}` },
      { label: 'PING', value: `${client.ws.ping}MS` },
      { label: 'UPTIME', value: `${d}D ${h}H` }
    ],
    attachmentName: 'warroom_telemetry.gif',
    animated: true
  }).catch(() => null);

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('hud_mode_telemetry').setLabel('Core Telemetry').setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('hud_mode_server').setLabel('Server Dashboard').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hud_mode_defcon').setLabel('DEFCON Status').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hud_mode_omni').setLabel('Unified Dashboard').setStyle(ButtonStyle.Success)
  );

  const container = {
    type: 17,
    components: [
      ...(bannerAttachment ? [{ type: 12, items: [{ media: { url: 'attachment://warroom_telemetry.gif' } }] }] : []),
      { type: 10, content: `## **Athena Prime Core Telemetry** | <a:03_tick_circle:1565665642084827206>` },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          `> -# \u2022 **Gateway Ping:** \`${client.ws.ping}ms\`\n` +
          `> -# \u2022 **Active Clusters:** \`${totalServers.toLocaleString()}\` servers connected\n` +
          `> -# \u2022 **Memory Usage:** \`${heapMB} MB\` heap / \`${totalMemMB} MB\` system RAM\n` +
          `> -# \u2022 **Process Uptime:** \`${d}d ${h}h ${m}m\` continuous\n` +
          `> -# \u2022 **Node Engine:** \`${process.version}\` on \`${os.platform()} (${os.arch()})\``
      },
      { type: 14, divider: true },
      { type: 10, content: `-# **Athena Prime Tactical War-Room \u2022 Core Telemetry**` }
    ]
  };

  return {
    components: [container, actionRow],
    files: bannerAttachment ? [bannerAttachment] : [],
    flags: MessageFlags.IsComponentsV2
  };
}
