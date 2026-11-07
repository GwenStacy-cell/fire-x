import { AuditLogEvent } from 'discord.js';
import db from '../database.js';
import { directStrike, isGuildUnderAttack } from '../utils/antinuke.js';

export default {
  name: 'channelUpdate',
  async execute(oldChannel, newChannel) {
    if (!newChannel.guild) return;
    if (db.isModModeActive(newChannel.guild.id)) return;

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
        // Instant Bitfield Overwrite Revert
        if (isGuildUnderAttack(guild.id) && oldPerms) {
          try {
            await newChannel.permissionOverwrites.set(oldPerms, 'Athena Anti-Nuke: Rogue Permission Tampering Intercepted');
          } catch {}
        }

        directStrike(
          guild,
          AuditLogEvent.ChannelUpdate,
          'Channel Permission Tampering',
          newChannel.id,
          async () => {
            if (oldPerms) {
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
        if (isGuildUnderAttack(guild.id)) {
          newChannel.setName(oldChannel.name, 'Athena Anti-Nuke: Rogue Channel Rename Intercepted').catch(() => null);
        }

        directStrike(
          guild,
          AuditLogEvent.ChannelUpdate,
          'Channel Name Modification',
          newChannel.id,
          async () => {
            await newChannel.setName(oldChannel.name, 'Athena Anti-Nuke: Restored Channel Name').catch(() => null);
          }
        ).catch(() => null);
        return;
      }
    }

    // 3. Channel Reorder / Hierarchy Tampering Guard
    if (mods.antiChannelReorder !== false || mods.antiChannelUpdate !== false) {
      if (oldChannel.rawPosition !== newChannel.rawPosition) {
        if (isGuildUnderAttack(guild.id)) {
          newChannel.setPosition(oldChannel.rawPosition, { reason: 'Athena Anti-Nuke: Rogue Channel Move Intercepted' }).catch(() => null);
        }

        directStrike(
          guild,
          AuditLogEvent.ChannelUpdate,
          'Channel Reorder / Tampering',
          newChannel.id,
          async () => {
            await newChannel.setPosition(oldChannel.rawPosition, { reason: 'Athena Anti-Nuke: Restored Channel Position' }).catch(() => null);
          }
        ).catch(() => null);
      }
    }
  }
};
