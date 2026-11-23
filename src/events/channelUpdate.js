import { AuditLogEvent } from 'discord.js';
import db from '../database.js';
import { directStrike, isChannelRestoring, markChannelRestoring } from '../utils/antinuke.js';

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
  }
};
