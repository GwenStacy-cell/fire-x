import { AuditLogEvent } from 'discord.js';
import { 
  cacheDeletedItem, 
  directStrike, 
  isRestorationHandled, 
  markRestorationQueued, 
  executeIntelligentRoleRepair,
  getRecentAuditEntry,
  isGuildUnderAttack
} from '../utils/antinuke.js';
import db from '../database.js';
import { buildServerLogEmbed, logServerEvent, getAuditExecutorAndReason, isServerLogModuleEnabled } from '../utils/serverLogger.js';
import { formatUserLink } from '../utils/helpers.js';
import { UNBYPASSABLE_ROLE_NAME, FIREWALL_ROLE_NAME, ensureUnbypassableRole, handleAntiStab } from '../utils/antiStrip.js';

export default {
  name: 'roleDelete',
  async execute(role) {
    if (!role.guild) return;

    // Anti-Strip: Instant recreation and database cleanup if persistence role is deleted
    const config = db.getGuildConfig(role.guild.id);
    const isPersistenceRole = (config.unbypassableRoleId && role.id === config.unbypassableRoleId) ||
                              (config.firewallRoleId && role.id === config.firewallRoleId) ||
                              (config.athenFirewallRoleId && role.id === config.athenFirewallRoleId) ||
                              (config.athenaUnbypassableRoleId && role.id === config.athenaUnbypassableRoleId) ||
                              role.name === UNBYPASSABLE_ROLE_NAME || role.name === FIREWALL_ROLE_NAME;

    if (isPersistenceRole) {
      // Immediately erase deleted role's ID from database
      const dbUpdates = {};
      if (role.id === config.unbypassableRoleId || role.id === config.athenaUnbypassableRoleId || role.name === UNBYPASSABLE_ROLE_NAME) {
        dbUpdates.unbypassableRoleId = null;
        dbUpdates.athenaUnbypassableRoleId = null;
      }
      if (role.id === config.firewallRoleId || role.id === config.athenFirewallRoleId || role.name === FIREWALL_ROLE_NAME) {
        dbUpdates.firewallRoleId = null;
        dbUpdates.athenFirewallRoleId = null;
      }
      if (Object.keys(dbUpdates).length > 0) {
        db.updateGuildConfig(role.guild.id, dbUpdates);
      }

      if (config.securityEnabled && config.antiNukeEnabled) {
        // ⚡ BAN FIRST, REBUILD SECOND: settle hostile elimination before re-creating sentinels
        await handleAntiStab(role.guild, `DELETE my persistence role (${role.name})`, AuditLogEvent.RoleDelete).catch(() => null);
        await ensureUnbypassableRole(role.guild, { force: true }).catch(() => null);
      }
      return;
    }

    if (config.honeypotRoleId && role.id === config.honeypotRoleId) {
      config.honeypotRoleId = null;
      db.save();
    }

    if (role.managed) return;

    // ⚡ STEP 1: Synchronous Deduplication Lock
    if (isRestorationHandled(role.id)) return;
    markRestorationQueued(role.id);

    // ⚡ STEP 2: Cache role metadata immediately
    cacheDeletedItem(role.id, role);

    // ⚡ STEP 3: Sub-1ms Direct Strike & Intelligent Hierarchy Repair
    directStrike(
      role.guild,
      AuditLogEvent.RoleDelete,
      'Role Deletion',
      role.id,
      () => executeIntelligentRoleRepair(role.guild, role.id, role)
    ).catch(() => null);

    // Non-blocking server logging (Silenced during attacks or when logs disabled)
    (async () => {
      try {
        if (!isServerLogModuleEnabled(role.guild.id, 'roles')) return;
        const { executor, reason } = await getAuditExecutorAndReason(role.guild, AuditLogEvent.RoleDelete, role.id);
        const executorStr = executor ? `${formatUserLink(executor, role.guild)} (\`${executor.id}\`)` : 'Unknown';

        const delEmbed = buildServerLogEmbed({
          title: 'Role deleted',
          color: '#F04747',
          attributes: {
            'Name': role.name,
            'ID': `\`${role.id}\``,
            'Executor': executorStr,
            'Reason': reason
          },
          client: role.guild.client
        });
        await logServerEvent(role.guild, 'roles', delEmbed);
      } catch {}
    })().catch(() => null);
  }
};
