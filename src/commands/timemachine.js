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

export function takeGuildSnapshot(guild, creator, label = 'Manual Snapshot') {
  const channels = [];
  for (const ch of guild.channels.cache.values()) {
    const overwrites = [];
    for (const ov of ch.permissionOverwrites.cache.values()) {
      overwrites.push({
        id: ov.id,
        type: ov.type,
        allow: ov.allow.bitfield.toString(),
        deny: ov.deny.bitfield.toString()
      });
    }

    channels.push({
      id: ch.id,
      name: ch.name,
      type: ch.type,
      parentId: ch.parentId,
      position: ch.rawPosition,
      topic: ch.topic || null,
      nsfw: Boolean(ch.nsfw),
      rateLimitPerUser: ch.rateLimitPerUser || 0,
      overwrites
    });
  }

  const roles = [];
  for (const r of guild.roles.cache.values()) {
    if (r.managed || r.id === guild.roles.everyone.id) continue;
    roles.push({
      id: r.id,
      name: r.name,
      color: r.color,
      hoist: r.hoist,
      position: r.rawPosition,
      permissions: r.permissions.bitfield.toString(),
      mentionable: r.mentionable
    });
  }

  const snapshotId = `tm_${Date.now().toString(36)}`;
  const snapshotData = {
    id: snapshotId,
    timestamp: Date.now(),
    label: label.substring(0, 50),
    creatorId: creator.id,
    creatorTag: creator.tag || creator.id,
    channelsCount: channels.length,
    rolesCount: roles.length,
    data: { channels, roles }
  };

  db.saveTimeMachineSnapshot(guild.id, snapshotData);
  return snapshotData;
}

export async function restoreFromSnapshot(guild, snapshot) {
  const botMe = guild.members.me || (guild.members.fetchMe ? await guild.members.fetchMe().catch(() => null) : null);
  if (!botMe?.permissions.has(PermissionFlagsBits.ManageChannels) || !botMe?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return {
      success: false,
      error: 'Athena Prime requires `Manage Channels` and `Manage Roles` to execute a Time-Machine restoration.'
    };
  }

  let restoredRoles = 0;
  let restoredChannels = 0;
  let repairedOverwrites = 0;

  const roleMap = new Map(); // oldId -> newId / existingId

  // 1. Restore Missing Roles
  for (const r of snapshot.data.roles || []) {
    let existingRole = guild.roles.cache.get(r.id);
    if (!existingRole) {
      existingRole = await guild.roles.create({
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        permissions: BigInt(r.permissions || '0'),
        mentionable: r.mentionable,
        reason: `[Athena Time-Machine] Restoring snapshot ${snapshot.id}`
      }).catch(() => null);
      if (existingRole) restoredRoles++;
    }
    if (existingRole) {
      roleMap.set(r.id, existingRole.id);
    }
  }

  // 2. Restore Missing Categories First
  const categories = (snapshot.data.channels || []).filter(c => c.type === ChannelType.GuildCategory);
  for (const cat of categories) {
    let existingCat = guild.channels.cache.get(cat.id);
    if (!existingCat) {
      existingCat = await guild.channels.create({
        name: cat.name,
        type: ChannelType.GuildCategory,
        position: cat.position,
        reason: `[Athena Time-Machine] Restoring category from snapshot ${snapshot.id}`
      }).catch(() => null);
      if (existingCat) restoredChannels++;
    }
  }

  // 3. Restore Missing Text & Voice Channels
  const nonCategories = (snapshot.data.channels || []).filter(c => c.type !== ChannelType.GuildCategory);
  for (const ch of nonCategories) {
    let existingCh = guild.channels.cache.get(ch.id);
    if (!existingCh) {
      const channelData = {
        name: ch.name,
        type: ch.type,
        topic: ch.topic,
        nsfw: ch.nsfw,
        rateLimitPerUser: ch.rateLimitPerUser,
        reason: `[Athena Time-Machine] Restoring channel from snapshot ${snapshot.id}`
      };
      if (ch.parentId && guild.channels.cache.has(ch.parentId)) {
        channelData.parent = ch.parentId;
      }
      existingCh = await guild.channels.create(channelData).catch(() => null);
      if (existingCh) restoredChannels++;
    }

    // Restore overwrites if channel exists
    if (existingCh && Array.isArray(ch.overwrites) && existingCh.permissionOverwrites) {
      try {
        const mappedOverwrites = [];
        for (const ov of ch.overwrites) {
          const targetId = roleMap.get(ov.id) || ov.id;
          if (guild.roles.cache.has(targetId) || guild.members.cache.has(targetId) || targetId === guild.roles.everyone.id) {
            mappedOverwrites.push({
              id: targetId,
              type: ov.type,
              allow: BigInt(ov.allow || '0'),
              deny: BigInt(ov.deny || '0')
            });
          }
        }
        if (mappedOverwrites.length > 0) {
          await existingCh.permissionOverwrites.set(mappedOverwrites, `[Athena Time-Machine] Syncing Overwrites`).catch(() => null);
          repairedOverwrites++;
        }
      } catch {}
    }
  }

  return {
    success: true,
    restoredRoles,
    restoredChannels,
    repairedOverwrites
  };
}

export function computeSnapshotDiff(guild, snapshot) {
  let missingChannels = 0;
  let missingRoles = 0;

  for (const ch of snapshot.data.channels || []) {
    if (!guild.channels.cache.has(ch.id)) missingChannels++;
  }

  for (const r of snapshot.data.roles || []) {
    if (!guild.roles.cache.has(r.id)) missingRoles++;
  }

  return {
    missingChannels,
    missingRoles,
    currentChannels: guild.channels.cache.size,
    currentRoles: guild.roles.cache.size,
    snapshotChannels: snapshot.channelsCount,
    snapshotRoles: snapshot.rolesCount
  };
}

export const commands = [
  {
    name: 'timemachine',
    aliases: ['snapshot', 'deltarollback', 'tm'],
    description: 'Time-Machine Server Snapshots & Delta Rollback - Lightweight server snapshots with 1-click restore.',
    category: 'Security',
    async execute(message, args) {
      const guild = message.guild;
      if (!guild) return;

      if (!isAuthorized(guild, message.member, message.author.id)) {
        return message.reply(cv2.danger(
          `Access Denied | ${WRONG_EMOJI}`,
          'Only Server Owners, Extra Owners, and Administrators can manage Time-Machine snapshots.'
        )).catch(() => null);
      }

      const sub = (args[0] || '').toLowerCase();

      // Subcommand: create [label]
      if (sub === 'create' || sub === 'save') {
        const label = args.slice(1).join(' ') || 'Manual Snapshot';
        const snapshot = takeGuildSnapshot(guild, message.author, label);

        const fields = [
          {
            name: 'Snapshot ID',
            value: `\`${snapshot.id}\``,
            inline: true
          },
          {
            name: 'Snapshot Label',
            value: `\`${snapshot.label}\``,
            inline: true
          },
          {
            name: 'Channels Cached',
            value: `\`${snapshot.channelsCount} Channels\``,
            inline: true
          },
          {
            name: 'Roles Cached',
            value: `\`${snapshot.rolesCount} Roles\``,
            inline: true
          },
          {
            name: 'Restore Command',
            value: `\`!timemachine restore ${snapshot.id}\``,
            inline: false
          }
        ];

        const panel = cv2.card(
          `Time-Machine Snapshot Captured | ${TICK_EMOJI}`,
          `> -# <a:uptime:1552608831060844575> **Server Infrastructure Checkpoint Created.**\n` +
          `> -# Complete permission hierarchies, parent categories, and overwrites were frozen in database memory.`,
          fields,
          'Athena Prime Security Suite • Time-Machine Engine'
        );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`tm_restore_${snapshot.id}`)
            .setLabel('Restore Snapshot')
            .setStyle(ButtonStyle.Primary)
        );

        return message.reply({
          ...panel,
          components: [...panel.components, row.toJSON()]
        }).catch(() => null);
      }

      // Subcommand: restore <id>
      if (sub === 'restore' || sub === 'rollback') {
        const snapshotId = args[1];
        if (!snapshotId) {
          return message.reply(cv2.warn(
            `Snapshot ID Required | ${WARN_EMOJI}`,
            'Please specify the snapshot ID to restore: `!timemachine restore <snapshotId>`.'
          )).catch(() => null);
        }

        const snapshot = db.getTimeMachineSnapshot(guild.id, snapshotId);
        if (!snapshot) {
          return message.reply(cv2.danger(
            `Snapshot Not Found | ${WRONG_EMOJI}`,
            `No snapshot found with ID \`${snapshotId}\`. Run \`!timemachine list\` to inspect available snapshots.`
          )).catch(() => null);
        }

        const waitMsg = await message.reply(cv2.info(
          `Restoring Server Hierarchy | ${UPTIME_EMOJI}`,
          `> -# Restoring from snapshot \`${snapshot.id}\` (\`${snapshot.label}\`)...\n` +
          `> -# Reconstructing missing roles, categories, channels, and permission overwrites.`
        )).catch(() => null);

        const res = await restoreFromSnapshot(guild, snapshot);
        if (!res.success) {
          return waitMsg ? waitMsg.edit(cv2.danger(`Restoration Failed | ${WRONG_EMOJI}`, res.error)).catch(() => null) : null;
        }

        const fields = [
          {
            name: 'Roles Recreated',
            value: `\`${res.restoredRoles} Roles\``,
            inline: true
          },
          {
            name: 'Channels Recreated',
            value: `\`${res.restoredChannels} Channels\``,
            inline: true
          },
          {
            name: 'Overwrites Synchronized',
            value: `\`${res.repairedOverwrites} Channels\``,
            inline: true
          }
        ];

        const donePanel = cv2.card(
          `Time-Machine Restoration Complete | ${TICK_EMOJI}`,
          `> -# <a:uptime:1552608831060844575> **Server Hierarchy Successfully Synchronized.**\n` +
          `> -# All missing channels, roles, and permissions have been recreated.`,
          fields,
          'Athena Prime Security Suite • Time-Machine Engine'
        );

        return waitMsg ? waitMsg.edit(donePanel).catch(() => null) : null;
      }

      // Subcommand: diff <id>
      if (sub === 'diff') {
        const snapshotId = args[1];
        if (!snapshotId) {
          return message.reply(cv2.warn(`Snapshot ID Required | ${WARN_EMOJI}`, 'Usage: `!timemachine diff <snapshotId>`')).catch(() => null);
        }
        const snapshot = db.getTimeMachineSnapshot(guild.id, snapshotId);
        if (!snapshot) {
          return message.reply(cv2.danger(`Snapshot Not Found | ${WRONG_EMOJI}`, `No snapshot found with ID \`${snapshotId}\`.`)).catch(() => null);
        }

        const diff = computeSnapshotDiff(guild, snapshot);
        const fields = [
          { name: 'Missing Channels', value: `\`${diff.missingChannels} Channels\``, inline: true },
          { name: 'Missing Roles', value: `\`${diff.missingRoles} Roles\``, inline: true },
          { name: 'Current vs Snapshot Channels', value: `\`${diff.currentChannels} / ${diff.snapshotChannels}\``, inline: true },
          { name: 'Current vs Snapshot Roles', value: `\`${diff.currentRoles} / ${diff.snapshotRoles}\``, inline: true }
        ];

        const diffPanel = cv2.card(
          `Time-Machine Delta Analysis | ${TICK_EMOJI}`,
          `> -# Comparing current server state against snapshot \`${snapshot.id}\` (\`${snapshot.label}\`).`,
          fields,
          'Athena Prime Security Suite • Time-Machine Engine'
        );
        return message.reply(diffPanel).catch(() => null);
      }

      // Subcommand: list (Default)
      const snapshots = db.getTimeMachineSnapshots(guild.id);
      if (snapshots.length === 0) {
        return message.reply(cv2.info(
          `Time-Machine Snapshots | ${WARN_EMOJI}`,
          `> -# No snapshots currently exist for this server.\n` +
          `> -# Execute \`!timemachine create [label]\` to create your first instant server checkpoint.`
        )).catch(() => null);
      }

      const fields = snapshots.slice(0, 5).map(s => ({
        name: `Snapshot: ${s.id}`,
        value: `**Label:** \`${s.label}\`\n**Created:** <t:${Math.floor(s.timestamp / 1000)}:R>\n**Contents:** \`${s.channelsCount} Channels\` | \`${s.rolesCount} Roles\`\n**Restore:** \`!timemachine restore ${s.id}\``,
        inline: false
      }));

      const listPanel = cv2.card(
        `Time-Machine Snapshots Matrix | ${TICK_EMOJI}`,
        `> -# <a:uptime:1552608831060844575> **Saved Infrastructure Checkpoints:**\n` +
        `> -# Use \`!timemachine restore <id>\` to instantly recover missing server architecture.`,
        fields,
        'Athena Prime Security Suite • Time-Machine Engine'
      );

      return message.reply(listPanel).catch(() => null);
    }
  }
];
