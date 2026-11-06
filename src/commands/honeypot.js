import { 
  PermissionFlagsBits, 
  ChannelType, 
  MessageFlags, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { 
  getRandomHeadingGlyph, 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  UPTIME_EMOJI 
} from '../utils/emojis.js';
import { isBotOwnerSync } from '../utils/helpers.js';

export function isAuthorized(guild, member, userId) {
  if (isBotOwnerSync(userId)) return true;
  if (guild.ownerId === userId) return true;
  if (db.isExtraOwner(guild.id, userId)) return true;
  if (member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  return false;
}

export function buildHoneypotPanel(guild) {
  const cfg = db.getGuildConfig(guild.id);
  const channelId = cfg.honeypotChannelId;
  const roleId = cfg.honeypotRoleId;

  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  const role = roleId ? guild.roles.cache.get(roleId) : null;
  const isArmed = Boolean(channelId && channel);

  const incidents = db.getIncidents(guild.id, 50).filter(i => i.type === 'HONEYPOT_TRIGGER');

  const statusBadge = isArmed 
    ? `${UPTIME_EMOJI} **ARMED & SENTINEL ACTIVE**` 
    : `${WARN_EMOJI} **DISARMED / STANDBY**`;

  const fields = [
    {
      name: 'Sentinel Channel Trap',
      value: channel ? `<#${channel.id}> (\`${channel.id}\`)` : (channelId ? `\`${channelId}\` (Missing Channel)` : '`None (Unconfigured)`'),
      inline: true
    },
    {
      name: 'Decoy Canary Role',
      value: role ? `<@&${role.id}> (\`${role.id}\`)` : (roleId ? `\`${roleId}\` (Missing Role)` : '`None (Unconfigured)`'),
      inline: true
    },
    {
      name: 'Counter-Measure Strike',
      value: '`Instant Dual-Strike Ban (<15ms)`',
      inline: true
    },
    {
      name: 'Intruders Neutralized',
      value: `\`${incidents.length} Raiding Bots / Token Scrapers\``,
      inline: true
    },
    {
      name: 'Canary Visibility',
      value: '`Hidden from @everyone (Visible only to rogue scrapers)`',
      inline: false
    }
  ];

  const panel = cv2.card(
    `Ghost Honeypot Sentinel Matrix | ${isArmed ? TICK_EMOJI : WARN_EMOJI}`,
    `> -# ${statusBadge}\n` +
    `> -# Honeypots act as invisible tripwire decoys that human members never interact with.\n` +
    `> -# Selfbots, token scrapers, and automated raid engines that broadcast across all guild channels trip this sensor and are **instantly wiped out** before they can touch legitimate members.`,
    fields,
    'Athena Prime Security Suite • Ghost Honeypot Sentinel'
  );

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('honeypot_setup')
      .setLabel(isArmed ? 'Re-Deploy Tripwire' : 'Deploy Honeypot Trap')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('honeypot_remove')
      .setLabel('Disarm Tripwire')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!isArmed),
    new ButtonBuilder()
      .setCustomId('honeypot_refresh')
      .setLabel('Refresh Status')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    ...panel,
    components: [
      ...panel.components,
      actionRow.toJSON()
    ]
  };
}

export async function setupHoneypot(guild, user) {
  const botMe = guild.members.me || (guild.members.fetchMe ? await guild.members.fetchMe().catch(() => null) : null);
  if (!botMe?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return { success: false, error: 'Athena lacks the `Manage Channels` permission to deploy the honeypot canary channel.' };
  }
  if (!botMe?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { success: false, error: 'Athena lacks the `Manage Roles` permission to create the honeypot canary decoy role.' };
  }

  const cfg = db.getGuildConfig(guild.id);

  // 1. Clean existing decoy role if present
  if (cfg.honeypotRoleId) {
    const existingRole = guild.roles.cache.get(cfg.honeypotRoleId);
    if (existingRole && existingRole.editable) {
      await existingRole.delete('Athena Prime Honeypot Reconfiguration').catch(() => null);
    }
  }

  // 2. Clean existing trap channel if present
  if (cfg.honeypotChannelId) {
    const existingChannel = guild.channels.cache.get(cfg.honeypotChannelId);
    if (existingChannel && existingChannel.deletable) {
      await existingChannel.delete('Athena Prime Honeypot Reconfiguration').catch(() => null);
    }
  }

  // 3. Create Honeypot Decoy Role
  const canaryRole = await guild.roles.create({
    name: 'Athena Canary Sentinel',
    color: 0x2b2d31,
    hoist: false,
    mentionable: false,
    permissions: [],
    reason: `Ghost Honeypot Sentinel Role initialized by ${user.tag || user.id}`
  }).catch(() => null);

  // 4. Create Honeypot Trap Channel
  // Deny ViewChannel to @everyone so real members never see it, but selfbots / scrapers inspecting internal channels trip it
  const canaryChannel = await guild.channels.create({
    name: 'canary-trap-sentinel',
    type: ChannelType.GuildText,
    topic: 'Athena Prime Ghost Honeypot Sentinel. Any message or automated injection sent here triggers an immediate dual-strike ban.',
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
      },
      {
        id: botMe.id,
        allow: [
          PermissionFlagsBits.ViewChannel, 
          PermissionFlagsBits.SendMessages, 
          PermissionFlagsBits.ManageMessages, 
          PermissionFlagsBits.ReadMessageHistory
        ]
      }
    ],
    reason: `Ghost Honeypot Sentinel Channel deployed by ${user.tag || user.id}`
  }).catch(() => null);

  if (!canaryChannel) {
    return { success: false, error: 'Failed to create canary channel. Check guild channel limits.' };
  }

  // 5. Commit IDs strictly into Database
  cfg.honeypotChannelId = canaryChannel.id;
  if (canaryRole) cfg.honeypotRoleId = canaryRole.id;
  db.save();

  // Send sentinel banner inside honeypot channel
  const warningCard = cv2.danger(
    `Ghost Honeypot Sentinel Active | ${TICK_EMOJI}`,
    `> -# <a:uptime:1552608831060844575> **Tripwire Armed:** This is an isolated decoy containment room.\n` +
    `> -# ${BULLET_EMOJI} **Channel ID:** \`${canaryChannel.id}\`\n` +
    `> -# ${BULLET_EMOJI} **Decoy Role:** ${canaryRole ? `<@&${canaryRole.id}>` : '`None`'}\n` +
    `> -# ${BULLET_EMOJI} **Rule:** Any automated selfbot or unauthorized user transmitting packets here will be **instantly banned** within <15ms.`
  );
  await canaryChannel.send(warningCard).catch(() => null);

  return { 
    success: true, 
    channelId: canaryChannel.id, 
    roleId: canaryRole?.id || null 
  };
}

export async function removeHoneypot(guild) {
  const cfg = db.getGuildConfig(guild.id);
  const channelId = cfg.honeypotChannelId;
  const roleId = cfg.honeypotRoleId;

  if (channelId) {
    const channel = guild.channels.cache.get(channelId);
    if (channel && channel.deletable) {
      await channel.delete('Ghost Honeypot Sentinel Decommissioned').catch(() => null);
    }
  }

  if (roleId) {
    const role = guild.roles.cache.get(roleId);
    if (role && role.editable) {
      await role.delete('Ghost Honeypot Sentinel Decommissioned').catch(() => null);
    }
  }

  cfg.honeypotChannelId = null;
  cfg.honeypotRoleId = null;
  db.save();

  return { success: true };
}

export const commands = [
  {
    name: 'honeypot',
    aliases: ['trap', 'ghosttrap', 'canary'],
    description: 'Ghost Honeypot Sentinel - Configures invisible tripwire canary channels and roles.',
    category: 'Security',
    async execute(message, args) {
      const guild = message.guild;
      if (!guild) return;

      if (!isAuthorized(guild, message.member, message.author.id)) {
        return message.reply(cv2.danger(
          `Access Denied | ${WRONG_EMOJI}`,
          'Only Server Owners, Extra Owners, and Administrators can manage Honeypot Sentinels.'
        )).catch(() => null);
      }

      const sub = (args[0] || '').toLowerCase();

      if (sub === 'setup' || sub === 'deploy' || sub === 'arm') {
        const res = await setupHoneypot(guild, message.author);
        if (!res.success) {
          return message.reply(cv2.danger(`Honeypot Deployment Failed | ${WRONG_EMOJI}`, res.error)).catch(() => null);
        }
        return message.reply(cv2.success(
          `Ghost Honeypot Sentinel Deployed | ${TICK_EMOJI}`,
          `> -# **Sentinel Channel:** <#${res.channelId}> (\`${res.channelId}\`)\n` +
          `> -# **Decoy Role:** ${res.roleId ? `<@&${res.roleId}> (\`${res.roleId}\`)` : '`None`'}\n` +
          `> -# **Tripwire Status:** Active. Any selfbot or token scraper transmitting packets is eliminated on contact.`
        )).catch(() => null);
      }

      if (sub === 'remove' || sub === 'disable' || sub === 'disarm') {
        await removeHoneypot(guild);
        return message.reply(cv2.success(
          `Ghost Honeypot Sentinel Disarmed | ${TICK_EMOJI}`,
          'Canary tripwire channel and role have been permanently decommissioned.'
        )).catch(() => null);
      }

      // Default: Display Status Panel
      const panel = buildHoneypotPanel(guild);
      return message.reply(panel).catch(() => null);
    }
  }
];
