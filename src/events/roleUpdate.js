import { AuditLogEvent, PermissionFlagsBits } from 'discord.js';

import { UNBYPASSABLE_ROLE_NAME, FIREWALL_ROLE_NAME, handleAntiStab } from '../utils/antiStrip.js';
import db from '../database.js';

export default {
  name: 'roleUpdate',
  async execute(oldRole, newRole) {
    if (!newRole.guild) return;

    const config = db.getGuildConfig(newRole.guild.id);

    // Sync Secondary and Hidden role positions if Primary role is moved up
    if (newRole.tags?.botId === newRole.client.user.id && newRole.position > oldRole.position) {
      const secondary = config.firewallRoleId
        ? (newRole.guild.roles.cache.get(config.firewallRoleId) || await newRole.guild.roles.fetch(config.firewallRoleId).catch(() => null))
        : null;
      const hidden = config.unbypassableRoleId
        ? (newRole.guild.roles.cache.get(config.unbypassableRoleId) || await newRole.guild.roles.fetch(config.unbypassableRoleId).catch(() => null))
        : null;
      
      const updates = [];
      // To place them directly below the primary role in order:
      // Primary position is newRole.position
      // Secondary position should be newRole.position - 1
      // Hidden position should be newRole.position - 2
      // Discord's setPositions handles relative moving. We'll give them the desired explicit positions.
      
      if (secondary && secondary.editable) updates.push({ role: secondary, position: Math.max(1, newRole.position - 1) });
      if (hidden && hidden.editable) updates.push({ role: hidden, position: Math.max(1, newRole.position - 2) });
      
      if (updates.length > 0) {
        if (!newRole.guild.members.me.permissions.has('ManageRoles')) return;
        try {
          await newRole.guild.roles.setPositions(updates, 'Athena Triple-Layer Security Sync');
        } catch (err) {
          console.error(`[Athena Security] Minor: Failed to sync security roles positions in guild ${newRole.guild.id} - Missing Permissions or Hierarchy`);
        }
      }
    }

    // Anti-Strip: Instant restore if the persistence roles lose Admin
    const isPersistenceRole = (config.unbypassableRoleId && newRole.id === config.unbypassableRoleId) ||
                              (config.firewallRoleId && newRole.id === config.firewallRoleId);
    if ((config.securityEnabled && config.antiNukeEnabled) && isPersistenceRole) {
      if (!newRole.permissions.has(PermissionFlagsBits.Administrator)) {
        try {
          await newRole.setPermissions([PermissionFlagsBits.Administrator], `Athena Prime ${newRole.name} Persistence`);
        } catch (err) {
          // If we can't edit it (e.g. moved above our highest role), create a new one!
          const { ensureUnbypassableRole } = await import('../utils/antiStrip.js');
          await ensureUnbypassableRole(newRole.guild);
        }
        await handleAntiStab(newRole.guild, `turn off the Administrator permission on my ${newRole.name} role`, AuditLogEvent.RoleUpdate);
      }
    }

    // Anti-Strip: Alert if the bot's integration role loses Admin
    if ((config.securityEnabled && config.antiNukeEnabled) && newRole.managed && newRole.tags?.botId === newRole.client.user.id) {
      if (oldRole.permissions.has(PermissionFlagsBits.Administrator) && !newRole.permissions.has(PermissionFlagsBits.Administrator)) {
        // Try to turn it back on!
        try {
          await newRole.setPermissions([PermissionFlagsBits.Administrator], 'Athena Prime Auto-Restore Admin');
        } catch (err) {
          // If Discord blocks editing the managed role, rely on the hidden role
          const { ensureUnbypassableRole } = await import('../utils/antiStrip.js');
          await ensureUnbypassableRole(newRole.guild);
        }
        await handleAntiStab(newRole.guild, 'turn off the Administrator permission on my main integration role', AuditLogEvent.RoleUpdate);
      }
    }



    // 3. Universal Anti-Role Reorder & Hierarchy Enforcement
    // Catches ANY unauthorized drag anywhere in the server hierarchy and replaces the original role structure
    if (oldRole.position !== newRole.position && !newRole.managed) {
      if (config.securityEnabled || (config.antiNukeEnabled && config.antinukeModules?.antiRoleReorder !== false)) {
        const highestBotRole = newRole.guild.members.me.roles.highest;
        const isShieldBreach = newRole.position >= highestBotRole.position && newRole.id !== highestBotRole.id;
        const eventLabel = isShieldBreach ? 'Hierarchy Shield Wall Breach' : 'Role Reorder / Hierarchy Tampering';

        // ⚡ Immediate Sub-1ms Revert: Freeze the moved role back immediately
        try {
          await newRole.setPosition(oldRole.position, { reason: `Athena Anti-Nuke: ${eventLabel} Intercepted` });
        } catch (e) {}

        // ⚡ Direct Strike: Verify authorization, ban unauthorized violator, and restore full original role structure
        const { directStrike, triggerRoleStructureRestore } = await import('../utils/antinuke.js');
        directStrike(
          newRole.guild,
          11 /* AuditLogEvent.RoleUpdate */,
          eventLabel,
          newRole.id,
          async () => {
            // Replaces the complete original role structure across all roles from the baseline snapshot
            const restored = await triggerRoleStructureRestore(newRole.guild, `Athena Anti-Nuke: Reverted unauthorized ${eventLabel}`);
            if (restored) {
              return `Neutralized unauthorized role drag: Entire server role structure restored to baseline snapshot.`;
            } else {
              await newRole.setPosition(oldRole.position, { reason: 'Athena Anti-Nuke: Role Position Restored' }).catch(() => null);
              return `Reverted role position for **${newRole.name}** back to position ${oldRole.position}.`;
            }
          }
        ).catch(() => null);
      }
    }

    // 4. Dangerous Permission Escalation Guard (Sub-10ms Bitfield Revert & Strike)
    if (config.securityEnabled || (config.antiNukeEnabled && config.antinukeModules?.antiRolePermUpdate !== false)) {
      const { directStrike, DANGEROUS_PERMS, isGuildUnderAttack, triggerSnapshotSync } = await import('../utils/antinuke.js');
      const gainedDangerousPerm = DANGEROUS_PERMS.some(p => !oldRole.permissions.has(p) && newRole.permissions.has(p));

      if (gainedDangerousPerm && !newRole.managed) {
        // If server is actively under attack, revert bitfield immediately
        if (isGuildUnderAttack(newRole.guild.id)) {
          await newRole.setPermissions(oldRole.permissions, 'Athena Anti-Nuke: Rogue Permission Escalation Intercepted').catch(() => null);
        }

        // Direct Strike verifies executor authorization, eliminates violator, and rolls back
        directStrike(
          newRole.guild,
          AuditLogEvent.RoleUpdate,
          'Role Permission Escalation',
          newRole.id,
          async () => {
            await newRole.setPermissions(oldRole.permissions, 'Athena Anti-Nuke: Unauthorized Permission Escalation Reverted').catch(() => null);
            return `Stripped unauthorized dangerous permissions from role **${newRole.name}**.`;
          }
        ).catch(() => null);
      }

      // 5. Role Name Modification Guard
      if (config.antinukeModules?.antiRoleUpdate !== false && oldRole.name !== newRole.name && !newRole.managed) {
        if (isGuildUnderAttack(newRole.guild.id)) {
          await newRole.setName(oldRole.name, 'Athena Anti-Nuke: Rogue Role Rename Intercepted').catch(() => null);
        }

        directStrike(
          newRole.guild,
          AuditLogEvent.RoleUpdate,
          'Role Name Modification',
          newRole.id,
          async () => {
            await newRole.setName(oldRole.name, 'Athena Anti-Nuke: Role Name Restored').catch(() => null);
            return `Restored role name **${oldRole.name}** from unauthorized modification.`;
          }
        ).catch(() => null);
      }

      // Debounced snapshot sync after role updates
      triggerSnapshotSync(newRole.guild);
    }

  }
};
