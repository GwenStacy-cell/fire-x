import { AuditLogEvent } from 'discord.js';
import db from '../database.js';
import { directStrike, isChannelRestoring, markChannelRestoring, isGuildUnderAttack } from '../utils/antinuke.js';
import { buildServerLogEmbed, logServerEvent, getAuditExecutorAndReason } from '../utils/serverLogger.js';
import { formatUserLink, formatChannelLink } from '../utils/helpers.js';

export default {
  name: 'channelUpdate',
  async execute(oldChannel, newChannel) {
    if (!newChannel.guild) return;
    if (db.isModModeActive(newChannel.guild.id)) return;

    // ⚡ Ignore update events fired by Athena's own restoration, JTC rooms, or JTC infrastructure
    if (isChannelRestoring(newChannel.id) || db.isJtcChannel(newChannel.id) || db.isJtcInfrastructure(newChannel.guild.id, newChannel.id)) return;

    const config = db.getGuildConfig(newChannel.guild.id);
    if (!config?.securityEnabled && !config?.antiNukeEnabled) return;
    const mods = config?.antinukeModules || {};

    const guild = newChannel.guild;

    // 1. Channel Permission Tampering Guard
    if (mods.antiChannelPermUpdate !== false || mods.antiChannelUpdate !== false) {
      const oldPerms = oldChannel.permissionOverwrites?.cache;
      const newPerms = newChannel.permissionOverwrites?.cache;

      let permsTampered = false;
      if (oldPerms && newPerms && oldPerms.size !== newPerms.size) {
        permsTampered = true;
      } else if (oldPerms && newPerms) {
        for (const [id, overwrite] of newPerms) {
          const oldOw = oldPerms.get(id);
          if (!oldOw || !oldOw.allow.equals(overwrite.allow) || !oldOw.deny.equals(overwrite.deny)) {
            permsTampered = true;
            break;
          }
        }
      }

      if (permsTampered) {
        // Direct strike verifies executor authorization FIRST.
        // Extra Owners and Server Owners are NEVER touched or reverted.
        // Unauthorized violators are banned first, then rollback runs.
        directStrike(
          guild,
          AuditLogEvent.ChannelUpdate,
          'Channel Permission Tampering',
          newChannel.id,
          async () => {
            if (oldPerms) {
              markChannelRestoring(newChannel.id, 5000);
              await newChannel.permissionOverwrites.set(oldPerms, 'Athena Anti-Nuke: Reverted Unauthorized Channel Permission Changes').catch(() => null);
            }
          }
        ).catch(() => null);
        return;
      }
    }

    // 2. Channel Name Modification Guard
    if (mods.antiChannelNameMod !== false || mods.antiChannelUpdate !== false) {
      if (oldChannel.name !== newChannel.name) {
        directStrike(
          guild,
          AuditLogEvent.ChannelUpdate,
          'Channel Name Modification',
          newChannel.id,
          async () => {
            markChannelRestoring(newChannel.id, 5000);
            await newChannel.setName(oldChannel.name, 'Athena Anti-Nuke: Restored Channel Name').catch(() => null);
          }
        ).catch(() => null);
        return;
      }
    }

    // 3. Channel Reorder / Hierarchy Tampering Guard
    if (mods.antiChannelReorder !== false || mods.antiChannelUpdate !== false) {
      if (oldChannel.rawPosition !== newChannel.rawPosition) {
        directStrike(
          guild,
          AuditLogEvent.ChannelUpdate,
          'Channel Reorder / Tampering',
          newChannel.id,
          async () => {
            markChannelRestoring(newChannel.id, 5000);
            await newChannel.setPosition(oldChannel.rawPosition, { reason: 'Athena Anti-Nuke: Restored Channel Position' }).catch(() => null);
          }
        ).catch(() => null);
      }
    }

    // 4. Non-blocking server log entry for channel updates
    (async () => {
      try {
        if (isGuildUnderAttack(guild.id)) return;
        const changes = [];
        if (oldChannel.name !== newChannel.name) changes.push(`**Name:** \`${oldChannel.name}\` ➔ \`${newChannel.name}\``);
        if (oldChannel.topic !== newChannel.topic) changes.push(`**Topic:** \`${oldChannel.topic || 'None'}\` ➔ \`${newChannel.topic || 'None'}\``);
        if (oldChannel.parentId !== newChannel.parentId) changes.push(`**Category:** \`${oldChannel.parent?.name || 'None'}\` ➔ \`${newChannel.parent?.name || 'None'}\``);
        if (oldChannel.nsfw !== newChannel.nsfw) changes.push(`**NSFW:** \`${oldChannel.nsfw}\` ➔ \`${newChannel.nsfw}\``);
        if (oldChannel.bitrate !== newChannel.bitrate) changes.push(`**Bitrate:** \`${(oldChannel.bitrate/1000) || 0}kbps\` ➔ \`${(newChannel.bitrate/1000) || 0}kbps\``);
        if (oldChannel.userLimit !== newChannel.userLimit) changes.push(`**User Limit:** \`${oldChannel.userLimit || 'Unlimited'}\` ➔ \`${newChannel.userLimit || 'Unlimited'}\``);
        if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) changes.push(`**Slowmode:** \`${oldChannel.rateLimitPerUser || 0}s\` ➔ \`${newChannel.rateLimitPerUser || 0}s\``);

        if (changes.length === 0) return;

        const { executor, reason } = await getAuditExecutorAndReason(guild, AuditLogEvent.ChannelUpdate, newChannel.id);
        const executorStr = executor ? `${formatUserLink(executor, guild)} (\`${executor.id}\`)` : 'Unknown';
        const channelLink = formatChannelLink(newChannel, guild);

        const updateEmbed = buildServerLogEmbed({
          title: 'Channel updated',
          color: '#5865F2',
          attributes: {
            'Channel': `${newChannel.name} (${channelLink})`,
            'ID': `\`${newChannel.id}\``,
            'Changes': '\n' + changes.join('\n'),
            'Executor': executorStr,
            'Reason': reason
          },
          client: guild.client
        });
        await logServerEvent(guild, 'channels', updateEmbed);
      } catch {}
    })().catch(() => null);
  }
};
