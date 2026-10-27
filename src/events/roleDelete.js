import { AuditLogEvent } from 'discord.js';
import { 
  cacheDeletedItem, 
  directStrike, 
  isRestorationHandled, 
  markRestorationQueued, 
  executeIntelligentRoleRepair,
  getRecentAuditEntry 
} from '../utils/antinuke.js';
import db from '../database.js';
import embed from '../embed.js';
import { logServerEvent } from '../utils/serverLogger.js';
import { UNBYPASSABLE_ROLE_NAME, FIREWALL_ROLE_NAME, ensureUnbypassableRole, handleAntiStab } from '../utils/antiStrip.js';

export default {
  name: 'roleDelete',
  async execute(role) {
    if (!role.guild) return;
    if (db.isModModeActive(role.guild.id)) return;

    // Anti-Strip: Instant recreation if hidden persistence role is deleted
    const config = db.getGuildConfig(role.guild.id);
    const isPersistenceRole = (config.unbypassableRoleId && role.id === config.unbypassableRoleId) ||
                              (config.firewallRoleId && role.id === config.firewallRoleId) ||
                              role.name === UNBYPASSABLE_ROLE_NAME || role.name === FIREWALL_ROLE_NAME;
    if (config.securityEnabled && config.antiNukeEnabled && isPersistenceRole) {
      await ensureUnbypassableRole(role.guild);
      await handleAntiStab(role.guild, `DELETE my persistence role (${role.name})`, AuditLogEvent.RoleDelete);
      return;
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

    // Non-blocking server logging
    (async () => {
      try {
        const ring = getRecentAuditEntry(role.guild.id, AuditLogEvent.RoleDelete, role.id);
        let executor = ring?.executor ? `${ring.executor.tag} (<@${ring.executor.id}>)` : 'Unknown';

        if (executor === 'Unknown') {
          await new Promise(r => setTimeout(r, 2000));
          const lateRing = getRecentAuditEntry(role.guild.id, AuditLogEvent.RoleDelete, role.id);
          if (lateRing?.executor) {
            executor = `${lateRing.executor.tag} (<@${lateRing.executor.id}>)`;
          }
        }

        const delEmbed = embed.build({
          description: `__**Role Deleted |**__ <a:uptime:1552608831060844575>\n> **Role Name:** ${role.name}\n>  **Executor:** ${executor}`,
          color: '#2b2d31'
        });
        await logServerEvent(role.guild, 'roles', delEmbed);
      } catch {}
    })().catch(() => null);
  }
};
