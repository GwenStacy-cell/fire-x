import { AuditLogEvent } from 'discord.js';
import { directStrike, getRecentAuditEntry, rawRoleDelete, isRestorationHandled, isGuildUnderAttack } from '../utils/antinuke.js';
import db from '../database.js';
import embed from '../embed.js';
import { logServerEvent } from '../utils/serverLogger.js';

export default {
  name: 'roleCreate',
  async execute(role) {
    if (!role.guild) return;

    // ⚡ Ignore roles created by Athena's restoration engine or persistence sentinels
    if (isRestorationHandled(role.id)) return;
    const config = db.getGuildConfig(role.guild.id);
    const isPersistence = (config?.unbypassableRoleId && role.id === config.unbypassableRoleId) ||
                          (config?.firewallRoleId && role.id === config.firewallRoleId) ||
                          role.name === 'Athena Unbypassable' || role.name === 'Athena Firewall';
    if (isPersistence || role.managed) return;

    // ⚡ DIRECT STRIKE — immediate elimination & raw API rollback (sub-10ms)
    directStrike(
      role.guild,
      AuditLogEvent.RoleCreate,
      'Role Creation',
      role.id,
      async () => {
        await rawRoleDelete(role.guild.id, role.id, role.guild.client.token, 'Athena Anti-Nuke: Removed unauthorized role').catch(() => null);
      }
    ).catch(() => null);

    // Non-blocking server logging — zero REST audit contention with Anti-Nuke (Silenced during attacks)
    (async () => {
      try {
        if (isGuildUnderAttack(role.guild.id)) return;
        const ring = getRecentAuditEntry(role.guild.id, AuditLogEvent.RoleCreate, role.id);
        let executor = ring?.executor ? `${ring.executor.tag} (<@${ring.executor.id}>)` : 'Unknown';

        if (executor === 'Unknown') {
          await new Promise(r => setTimeout(r, 2000));
          const lateRing = getRecentAuditEntry(role.guild.id, AuditLogEvent.RoleCreate, role.id);
          if (lateRing?.executor) {
            executor = `${lateRing.executor.tag} (<@${lateRing.executor.id}>)`;
          }
        }

        const createEmbed = embed.build({
          description: `__**Role Created |**__ <a:uptime:1552608831060844575>\n> **Role:** ${role.name} (<@&${role.id}>)\n>  **Executor:** ${executor}`,
          color: '#2b2d31'
        });
        await logServerEvent(role.guild, 'roles', createEmbed);
      } catch {}
    })().catch(() => null);
  }
};
