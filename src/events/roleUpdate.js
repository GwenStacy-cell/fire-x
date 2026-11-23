import { AuditLogEvent, PermissionFlagsBits } from 'discord.js';

import { UNBYPASSABLE_ROLE_NAME, FIREWALL_ROLE_NAME, handleAntiStab, syncSupportingRolePositions, isSyncingSupportingRoles } from '../utils/antiStrip.js';
import db from '../database.js';
import { isRoleRestoring, markRoleRestoring, directStrike, triggerRoleStructureRestore, DANGEROUS_PERMS, triggerSnapshotSync, isGuildUnderAttack } from '../utils/antinuke.js';
import { buildServerLogEmbed, logServerEvent, getAuditExecutorAndReason } from '../utils/serverLogger.js';
import { formatUserLink } from '../utils/helpers.js';

export default {
  name: 'roleUpdate',
  async execute(oldRole, newRole) {
    if (!newRole.guild) return;

    // ⚡ Ignore update events fired by Athena's own restoration or modifications
    if (isRoleRestoring(newRole.id)) return;

    const config = db.getGuildConfig(newRole.guild.id);

    const isBotPrimary = (newRole.tags?.botId === newRole.client.user.id) ||
                         (newRole.guild.members.me?.roles?.botRole?.id === newRole.id);
    const isPersistenceRole = (config.unbypassableRoleId && newRole.id === config.unbypassableRoleId) ||
                              (config.firewallRoleId && newRole.id === config.firewallRoleId) ||
                              (config.athenFirewallRoleId && newRole.id === config.athenFirewallRoleId) ||
                              (config.athenaUnbypassableRoleId && newRole.id === config.athenaUnbypassableRoleId) ||
                              newRole.name === UNBYPASSABLE_ROLE_NAME || newRole.name === FIREWALL_ROLE_NAME;

    // 1. Auto-drag supporting secondary and hidden roles if Primary role, Firewall, or Unbypassable role moves
    // Guard against feedback recursion if Athena is currently actively reordering roles in this guild
    if (oldRole.position !== newRole.position && (config.securityEnabled || config.antiNukeEnabled)) {
      if (isBotPrimary || isPersistenceRole) {
        if (!isSyncingSupportingRoles(newRole.guild.id)) {
          syncSupportingRolePositions(newRole.guild, 'Athena Event Drag: Sentinel Hierarchy Realignment').catch(() => null);
        }
      }
    }

    // Anti-Strip: Instant restore if the persistence roles lose Admin
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
    // Never trigger if Athena is currently aligning its supporting sentinels in this guild
    if (oldRole.position !== newRole.position && !newRole.managed && !isPersistenceRole) {
      if (isSyncingSupportingRoles(newRole.guild.id)) return;
      if (config.securityEnabled || (config.antiNukeEnabled && config.antinukeModules?.antiRoleReorder !== false)) {
        const highestBotRole = newRole.guild.members.me.roles.highest;
        const isShieldBreach = newRole.position >= highestBotRole.position && newRole.id !== highestBotRole.id;
        const eventLabel = isShieldBreach ? 'Hierarchy Shield Wall Breach' : 'Role Reorder / Hierarchy Tampering';

        // ⚡ Direct Strike: Verify authorization FIRST. Server Owners and Extra Owners are protected.
        // If unauthorized, eliminate violator and restore baseline role structure.
        directStrike(
          newRole.guild,
          11 /* AuditLogEvent.RoleUpdate */,
          eventLabel,
          newRole.id,
          async () => {
            markRoleRestoring(newRole.id, 5000);
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
      const gainedDangerousPerm = DANGEROUS_PERMS.some(p => !oldRole.permissions.has(p) && newRole.permissions.has(p));

      if (gainedDangerousPerm && !newRole.managed) {
        // Direct Strike verifies executor authorization, eliminates violator, and rolls back
        directStrike(
          newRole.guild,
          AuditLogEvent.RoleUpdate,
          'Role Permission Escalation',
          newRole.id,
          async () => {
            markRoleRestoring(newRole.id, 5000);
            await newRole.setPermissions(oldRole.permissions, 'Athena Anti-Nuke: Unauthorized Permission Escalation Reverted').catch(() => null);
            return `Stripped unauthorized dangerous permissions from role **${newRole.name}**.`;
          }
        ).catch(() => null);
      }

      // 5. Role Name Modification Guard
      if (config.antinukeModules?.antiRoleUpdate !== false && oldRole.name !== newRole.name && !newRole.managed) {
        directStrike(
          newRole.guild,
          AuditLogEvent.RoleUpdate,
          'Role Name Modification',
          newRole.id,
          async () => {
            markRoleRestoring(newRole.id, 5000);
            await newRole.setName(oldRole.name, 'Athena Anti-Nuke: Role Name Restored').catch(() => null);
            return `Restored role name **${oldRole.name}** from unauthorized modification.`;
          }
        ).catch(() => null);
      }

      // Debounced snapshot sync after role updates
      triggerSnapshotSync(newRole.guild);
    }

    // Non-blocking server log entry for role updates
    (async () => {
      try {
        if (isGuildUnderAttack(newRole.guild.id)) return;
        const changes = [];
        if (oldRole.name !== newRole.name) changes.push(`**Name:** \`${oldRole.name}\` ➔ \`${newRole.name}\``);
        if (oldRole.hexColor !== newRole.hexColor) changes.push(`**Color:** \`${oldRole.hexColor}\` ➔ \`${newRole.hexColor}\``);
        if (oldRole.hoist !== newRole.hoist) changes.push(`**Hoisted:** \`${oldRole.hoist ? 'Yes' : 'No'}\` ➔ \`${newRole.hoist ? 'Yes' : 'No'}\``);
        if (oldRole.mentionable !== newRole.mentionable) changes.push(`**Mentionable:** \`${oldRole.mentionable ? 'Yes' : 'No'}\` ➔ \`${newRole.mentionable ? 'Yes' : 'No'}\``);

        if (!oldRole.permissions.equals(newRole.permissions)) {
          const added = newRole.permissions.toArray().filter(p => !oldRole.permissions.has(p));
          const removed = oldRole.permissions.toArray().filter(p => !newRole.permissions.has(p));
          if (added.length > 0) changes.push(`**Granted Perms:** \`${added.join(', ')}\``);
          if (removed.length > 0) changes.push(`**Revoked Perms:** \`${removed.join(', ')}\``);
        }

        if (changes.length === 0) return;

        const { executor, reason } = await getAuditExecutorAndReason(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
        const executorStr = executor ? `${formatUserLink(executor, newRole.guild)} (\`${executor.id}\`)` : 'Unknown';

        const updateEmbed = buildServerLogEmbed({
          title: 'Role updated',
          color: '#5865F2',
          attributes: {
            'Name': newRole.name,
            'ID': `\`${newRole.id}\``,
            'Changes': '\n' + changes.join('\n'),
            'Executor': executorStr,
            'Reason': reason
          },
          client: newRole.guild.client
        });
        await logServerEvent(newRole.guild, 'roles', updateEmbed);
      } catch {}
    })().catch(() => null);
  }
};
