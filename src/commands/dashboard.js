import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import db from '../database.js';
import os from 'os';
import { generateCommandStatusBanner } from '../utils/canvasCards.js';
import { cleanDisplayName } from '../utils/helpers.js';

export const commands = [
  {
    name: 'dashboard',
    aliases: [
      'commandcenter',
      'omni',
      'omnihud',
      'warroomall',
      'fullhud',
      'matrix360',
      'allinone',
      'allstats',
      'masterhud',
      'cyberhud',
      'central'
    ],
    description: 'Displays the Athena Prime Unified Command Center — an all-inclusive cyber HUD combining Telemetry, Server Operations, and DEFCON Security.',
    category: 'utility',
    async executePrefix(message, args) {
      const result = await buildDashboardResponse(message.guild, message.client, message.author);
      return message.reply(result);
    },
    async executeSlash(interaction) {
      await interaction.deferReply();
      const result = await buildDashboardResponse(interaction.guild, interaction.client, interaction.user);
      return interaction.editReply(result);
    }
  }
];

export async function buildDashboardResponse(guild, client, requester = null) {
  const config = guild ? db.getGuildConfig(guild.id) : null;
  const accentColor = config?.accentColor || '#00f0ff';
  const prefix = config?.prefix || '!';

  // 1. Gather Telemetry Data
  const uptime = Math.floor(process.uptime());
  const d = Math.floor(uptime / 86400);
  const h = Math.floor((uptime % 86400) / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = uptime % 60;

  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const totalMemMB = Math.round(os.totalmem() / 1024 / 1024);
  const totalGuilds = client.guilds.cache.size;

  let totalCachedMembers = 0;
  client.guilds.cache.forEach(g => {
    totalCachedMembers += g.memberCount || g.members?.cache.size || 0;
  });

  // 2. Gather Server Data (if run inside a guild)
  let owner = null;
  let humans = 0;
  let bots = 0;
  let textChannels = 0;
  let voiceChannels = 0;
  let categories = 0;
  let stageChannels = 0;
  let totalChannels = 0;
  let totalRoles = 0;
  let boostLevel = 0;
  let boostCount = 0;
  let emojisCount = 0;
  let stickersCount = 0;
  let verifStr = 'N/A';

  if (guild) {
    if (guild.memberCount !== guild.members.cache.size) {
      await guild.members.fetch().catch(() => null);
    }
    owner = await guild.fetchOwner().catch(() => null);
    bots = guild.members.cache.filter(m => m.user.bot).size;
    humans = Math.max(0, guild.memberCount - bots);

    textChannels = guild.channels.cache.filter(c => c.type === 0).size;
    voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
    categories = guild.channels.cache.filter(c => c.type === 4).size;
    stageChannels = guild.channels.cache.filter(c => c.type === 13).size;
    totalChannels = guild.channels.cache.size;

    totalRoles = guild.roles.cache.size;
    boostLevel = guild.premiumTier || 0;
    boostCount = guild.premiumSubscriptionCount || 0;
    emojisCount = guild.emojis.cache.size;
    stickersCount = guild.stickers.cache.size;

    const verifLabels = [
      'None (Unrestricted)',
      'Low (Verified Email)',
      'Medium (Registered > 5 mins)',
      'High (Server Member > 10 mins)',
      'Very High (Phone Required)'
    ];
    verifStr = verifLabels[guild.verificationLevel] || `Level ${guild.verificationLevel}`;
  }

  // 3. Gather DEFCON & Defense Data
  const lockdown = guild ? db.getLockdownSnapshot(guild.id) : null;
  const raidActive = Boolean(config?.raidMode);
  const isEmergency = guild ? Boolean(db.getEmergencyState(guild.id)) : false;
  const isAlert = Boolean(lockdown || raidActive || isEmergency);
  const extraOwnersCount = guild ? db.getExtraOwners(guild.id).length : 0;
  const spamPermittedCount = db.getSpamPermitted()?.length || 0;

  // 4. Generate Animated Cyber HUD Banner
  const badgeText = isEmergency
    ? 'BLACKOUT EMERGENCY'
    : lockdown
    ? (lockdown.tierLabel || 'LOCKDOWN ACTIVE')
    : raidActive
    ? 'RAID MODE ACTIVE'
    : 'ALL SYSTEMS NOMINAL';

  const badgeColor = isAlert ? '#ff2a4b' : '#00ff88';

  const bannerAttachment = await generateCommandStatusBanner({
    title: 'ATHENA PRIME // COMMAND CENTER',
    subtitle: `${guild ? cleanDisplayName(guild.name).toUpperCase() : 'SYSTEM CLUSTERS'} // UNIFIED OMNI MATRIX`,
    badge: badgeText,
    badgeColor: badgeColor,
    iconUrl: (guild?.iconURL({ extension: 'png', size: 256, forceStatic: true })) || (client.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true })),
    fallbackInitial: guild?.name[0] || 'A',
    current: isAlert ? 100 : heapMB,
    total: isAlert ? 100 : Math.max(500, Math.round(totalMemMB / 4)),
    unit: isAlert ? 'THREAT LVL' : 'MB HEAP',
    accentColor: isAlert ? '#ff2a4b' : accentColor,
    metrics: [
      { label: 'MEMBERS', value: guild ? `${guild.memberCount}` : `${totalGuilds} GUILDS` },
      { label: 'PING', value: `${client.ws.ping}MS` },
      { label: 'DEFENSE', value: isAlert ? 'DEFCON 1' : 'DEFCON 5' }
    ],
    attachmentName: 'command_center.gif',
    animated: true
  }).catch(() => null);

  // 5. Construct Interactive ActionRow (5 Buttons Max)
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dash_refresh').setLabel('Refresh Matrix').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dash_defcon_knowmore').setLabel('DEFCON Intel & Guide').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('hud_mode_telemetry').setLabel('Telemetry Focus').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hud_mode_server').setLabel('Server Focus').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hud_mode_defcon').setLabel('DEFCON Focus').setStyle(ButtonStyle.Secondary)
  );

  // Quick action recovery / audio briefing buttons
  let secondaryRow = null;
  if (lockdown || isEmergency) {
    secondaryRow = new ActionRowBuilder();
    if (lockdown) {
      secondaryRow.addComponents(
        new ButtonBuilder().setCustomId('lockdown_lift').setLabel('Lift Lockdown').setStyle(ButtonStyle.Danger)
      );
    }
    if (isEmergency) {
      secondaryRow.addComponents(
        new ButtonBuilder().setCustomId('emergency_end').setLabel('End Emergency').setStyle(ButtonStyle.Danger)
      );
    }
    secondaryRow.addComponents(
      new ButtonBuilder().setCustomId('play_tactical_dispatch').setLabel('Tactical Audio Briefing').setStyle(ButtonStyle.Primary)
    );
  } else {
    secondaryRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('play_tactical_dispatch').setLabel('Tactical Audio Briefing').setStyle(ButtonStyle.Secondary)
    );
  }

  // 6. Build Discord Components V2 Container
  const containerComponents = [
    ...(bannerAttachment ? [{ type: 12, items: [{ media: { url: 'attachment://command_center.gif' } }] }] : []),
    { type: 10, content: `# ${getRandomHeadingGlyph()} Athena Prime Unified Command Center | <a:03_tick_circle:1565665642084827206>` },
    { type: 14, divider: true },
    {
      type: 10,
      content:
        `### **I. Core Bot Telemetry**\n` +
        `> -# ${BULLET_EMOJI} **Gateway Ping:** \`${client.ws.ping}ms\` latency\n` +
        `> -# ${BULLET_EMOJI} **Active Clusters:** \`${totalGuilds.toLocaleString()}\` guilds connected \u2022 \`${totalCachedMembers.toLocaleString()}\` members\n` +
        `> -# ${BULLET_EMOJI} **Memory Usage:** \`${heapMB} MB\` heap used / \`${heapTotalMB} MB\` total (\`${totalMemMB} MB\` system RAM)\n` +
        `> -# ${BULLET_EMOJI} **Continuous Uptime:** \`${d}d ${h}h ${m}m ${s}s\`\n` +
        `> -# ${BULLET_EMOJI} **Runtime:** Node \`${process.version}\` on \`${os.platform()} (${os.arch()})\``
    },
    { type: 14, divider: true }
  ];

  if (guild) {
    containerComponents.push(
      {
        type: 10,
        content:
          `### **II. Guild Operations & Capacity**\n` +
          `> -# ${BULLET_EMOJI} **Server:** **${cleanDisplayName(guild.name)}** (\`${guild.id}\`)\n` +
          `> -# ${BULLET_EMOJI} **Owner:** ${owner ? `<@${owner.id}> (\`${owner.user?.tag || owner.id}\`)` : `<@${guild.ownerId}>`}\n` +
          `> -# ${BULLET_EMOJI} **Member Count:** \`${guild.memberCount.toLocaleString()}\` total (\`${humans.toLocaleString()}\` humans \u2022 \`${bots.toLocaleString()}\` bots)\n` +
          `> -# ${BULLET_EMOJI} **Channels:** \`${totalChannels}\` total (\`${textChannels}\` text \u2022 \`${voiceChannels}\` voice \u2022 \`${categories}\` cat \u2022 \`${stageChannels}\` stage)\n` +
          `> -# ${BULLET_EMOJI} **Roles & Boosts:** \`${totalRoles}\` roles \u2022 \`Level ${boostLevel}\` (${boostCount} boosts)\n` +
          `> -# ${BULLET_EMOJI} **Server Assets:** \`${emojisCount}\` custom emojis \u2022 \`${stickersCount}\` stickers`
      },
      { type: 14, divider: true }
    );
  }

  containerComponents.push(
    {
      type: 10,
      content:
        `### **III. DEFCON Defense Matrix & Security Posture**\n` +
        `> -# ${BULLET_EMOJI} **DEFCON State:** ${isAlert ? '`DEFCON 1 (CRITICAL THREAT ALERT)`' : '`DEFCON 5 (PEACETIME / NOMINAL)`'}\n` +
        `> -# ${BULLET_EMOJI} **Emergency Blackout:** ${isEmergency ? '`ENGAGED (Total Server Blackout)`' : '`Standby (Disengaged)`'}\n` +
        `> -# ${BULLET_EMOJI} **Panic Lockdown:** ${lockdown ? `\`ENGAGED (${lockdown.tierLabel || 'Tier ' + lockdown.tier})\` \u2022 \`${lockdown.channels?.length || 0} channels locked\`` : '`Standby (Disengaged)`'}\n` +
        `> -# ${BULLET_EMOJI} **Anti-Raid Auto-Quarantine:** ${raidActive ? '`ARMED (Isolating Incoming Accounts)`' : '`Standby (Passive Wiretap)`'}\n` +
        `> -# ${BULLET_EMOJI} **Gate Verification:** \`${verifStr}\`\n` +
        `> -# ${BULLET_EMOJI} **Whitelists & Staff:** \`${extraOwnersCount}\` extra owners \u2022 \`${spamPermittedCount}\` bypass entries\n\n` +
        `> **Tactical Emergency & Panic Directives:**\n` +
        `> -# ${BULLET_EMOJI} \`${prefix}panic\` / \`${prefix}emergency\` \u2014 Instant total server blackout & verification elevation \`[Owner Only]\`\n` +
        `> -# ${BULLET_EMOJI} \`${prefix}unpanic\` / \`${prefix}endemergency\` \u2014 Lift emergency mode and restore all permissions \`[Owner Only]\`\n` +
        `> -# ${BULLET_EMOJI} \`${prefix}lockdown <1|2|3>\` \u2014 Ultra-fast batched lockdown (Soft / Medium / Nuclear) \`[Extra Owner]\`\n` +
        `> -# ${BULLET_EMOJI} \`${prefix}unlockdown\` \u2014 Instant ~1.2s zero-loss restoration from database bitmask snapshot \`[Extra Owner]\`\n` +
        `> -# ${BULLET_EMOJI} **Tactical Audio Briefing:** Click **[Tactical Audio Briefing]** below to broadcast live military voice dispatch in VC or download audio.`
    },
    { type: 14, divider: true },
    { type: 10, content: `-# **Athena Prime Tactical Command Center \u2022 Unified Operations**` }
  );

  const finalComponents = [{ type: 17, components: containerComponents }, actionRow, secondaryRow];

  return {
    components: finalComponents,
    files: bannerAttachment ? [bannerAttachment] : [],
    flags: MessageFlags.IsComponentsV2
  };
}

export function buildDefconIntelContainer(prefix = '!') {
  return {
    type: 17,
    components: [
      { type: 10, content: `# ${getRandomHeadingGlyph()} Athena Prime DEFCON Defense Matrix Intel | <a:03_tick_circle:1565665642084827206>` },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          `### **What is the DEFCON Defense Matrix?**\n` +
          `> Athena Prime implements a military-grade 5-tier DEFCON (Defense Readiness Condition) posture system. ` +
          `It seamlessly bridges automated background zero-day heuristic interception with rapid one-click administrative panic overrides.\n\n` +
          `> <a:uptime:1552608831060844575> **Operational Architecture:** Event interception fires at raw WebSocket wiretap speeds (<1ms), while batched REST mutations alter channels in parallel chunks without hitting Discord 429 secondary rate limits.`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          `### **The 5 DEFCON Readiness Levels**\n` +
          `> **DEFCON 5 \u2022 PEACETIME (Normal Operations)**\n` +
          `> -# ${BULLET_EMOJI} Standard community operations; all bot sub-systems monitoring in passive standby.\n` +
          `> -# ${BULLET_EMOJI} Raw WebSocket wiretap running in background (<1ms processing).\n` +
          `> -# ${BULLET_EMOJI} 60-second Linked Role audit log cross-examination active.\n\n` +
          `> **DEFCON 4 \u2022 GUARDED (Elevated Surveillance)**\n` +
          `> -# ${BULLET_EMOJI} Passive anomaly heuristics tracking staff velocity; automod strictness raised.\n` +
          `> -# ${BULLET_EMOJI} Phishing, token stealer, and fake nitro domain filters active.\n` +
          `> -# ${BULLET_EMOJI} Zero-day invite inspection verifies no dangerous permissions on invite links.\n\n` +
          `> **DEFCON 3 \u2022 ELEVATED (Heightened Raid Alert)**\n` +
          `> -# ${BULLET_EMOJI} Join-velocity burst monitoring triggered (default: 8 joins in 5 seconds).\n` +
          `> -# ${BULLET_EMOJI} Account age restrictions & anti-alt heuristics active.\n` +
          `> -# ${BULLET_EMOJI} Pre-lockdown bitmask snapshotting primed in database memory.\n\n` +
          `> **DEFCON 2 \u2022 SEVERE (Active Incursion / Raid Mode)**\n` +
          `> -# ${BULLET_EMOJI} Server Raid Mode armed (\`${prefix}raidmode on\`).\n` +
          `> -# ${BULLET_EMOJI} Verification level elevated to **Very High (Verified Phone Required)**.\n` +
          `> -# ${BULLET_EMOJI} Incoming members instantly stripped of roles & isolated in \`.   You Have Been Quarantined\`.\n\n` +
          `> **DEFCON 1 \u2022 MAXIMUM CRITICAL (Emergency Blackout / Panic Lockdown)**\n` +
          `> -# ${BULLET_EMOJI} Triggered via \`${prefix}panic\`, \`${prefix}emergency\`, or \`${prefix}lockdown 3\`.\n` +
          `> -# ${BULLET_EMOJI} Total server blackout: all public channels hidden or muted for \`@everyone\`.\n` +
          `> -# ${BULLET_EMOJI} Micro-batched parallel REST execution (chunks of 8) completes in **~1.2 seconds**.\n` +
          `> -# ${BULLET_EMOJI} Server verification elevated to Phone Required to block attacker alternate accounts.`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          `### **How It Works Under the Hood (Architecture & Mechanics)**\n` +
          `> -# ${BULLET_EMOJI} **1. Zero-Loss Bitmask Snapshots:** Before any channel is touched, Athena serializes exact bitmask integers (\`allow\` / \`deny\` BigInts) into database cache. Nothing is lost.\n` +
          `> -# ${BULLET_EMOJI} **2. Parallel Batched REST Engine:** Instead of sequential loops taking 20+ seconds, channels are processed in concurrent chunks of 8 using \`Promise.allSettled\`. Lockdown or rollback finishes in **~1.2 seconds**.\n` +
          `> -# ${BULLET_EMOJI} **3. Phone Verification Shield:** In DEFCON 1 and Tier 2/3 lockdowns, verification is elevated so attackers cannot bypass channel permissions using unverified alt accounts.`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          `### **Execution & Clearance Manual**\n` +
          `> **Emergency Activation Commands:**\n` +
          `> -# ${BULLET_EMOJI} \`${prefix}panic\` / \`${prefix}emergency\` \u2014 Total server channel blackout & verification elevation \`[Server Owner / Bot Owner]\`\n` +
          `> -# ${BULLET_EMOJI} \`${prefix}lockdown 1\` \u2014 Soft lockdown (mutes send & voice speak) \`[Extra Owner]\`\n` +
          `> -# ${BULLET_EMOJI} \`${prefix}lockdown 2\` \u2014 Medium lockdown (mutes send, files, reactions + arms raid mode) \`[Extra Owner]\`\n` +
          `> -# ${BULLET_EMOJI} \`${prefix}lockdown 3\` \u2014 Nuclear lockdown (total server channel blackout) \`[Extra Owner]\`\n` +
          `> -# ${BULLET_EMOJI} \`${prefix}raidmode on\` \u2014 Auto-quarantine incoming joins & phone verification \`[Extra Owner]\`\n\n` +
          `> **Recovery & Restoration Commands:**\n` +
          `> -# ${BULLET_EMOJI} \`${prefix}unpanic\` / \`${prefix}endemergency\` \u2014 Lifts emergency blackout & restores permissions \`[Server Owner / Bot Owner]\`\n` +
          `> -# ${BULLET_EMOJI} \`${prefix}unlockdown\` \u2014 Restores exact channels & bitmasks from database snapshot in ~1.2s \`[Extra Owner]\`\n` +
          `> -# ${BULLET_EMOJI} **Interactive Action Buttons:** \`[Lift Lockdown]\` & \`[End Emergency]\` buttons attached to alert messages allow instant 1-click restoration.`
      },
      { type: 14, divider: true },
      { type: 10, content: `-# **Athena Prime Defense Matrix \u2022 DEFCON Architectural Manual**` }
    ]
  };
}
