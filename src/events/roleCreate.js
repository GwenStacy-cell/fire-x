import { AuditLogEvent } from 'discord.js';
import { directStrike, rawRoleDelete, isRestorationHandled, isPendingSelfCreate, isGuildUnderAttack, triggerSnapshotSync } from '../utils/antinuke.js';
import db from '../database.js';
import { buildServerLogEmbed, logServerEvent, getAuditExecutorAndReason, isServerLogModuleEnabled } from '../utils/serverLogger.js';
import { formatUserLink } from '../utils/helpers.js';

export default {
  name: 'roleCreate',
  async execute(role) {
    if (!role.guild) return;

    // ⚡ Ignore roles created by Athena's restoration engine or persistence sentinels
    if (isRestorationHandled(role.id) || isPendingSelfCreate(role.guild.id, 'role', role.name, true)) return;
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

    // Keep infrastructure snapshot updated for legitimate role additions
    if (!isGuildUnderAttack(role.guild.id)) {
      triggerSnapshotSync(role.guild, 15_000);
    }

    // Non-blocking server logging — zero REST audit contention with Anti-Nuke or when logs are disabled
    (async () => {
      try {
        if (!isServerLogModuleEnabled(role.guild.id, 'roles')) return;
        const { executor, reason } = await getAuditExecutorAndReason(role.guild, AuditLogEvent.RoleCreate, role.id);
        const executorStr = executor ? `${formatUserLink(executor, role.guild)} (\`${executor.id}\`)` : 'Unknown';

        const createEmbed = buildServerLogEmbed({
          title: 'Role created',
          color: '#43B581',
          attributes: {
            'Name': role.name,
            'ID': `\`${role.id}\``,
            'Color': role.hexColor !== '#000000' ? role.hexColor : 'Default',
            'Hoisted': role.hoist ? 'Yes' : 'No',
            'Mentionable': role.mentionable ? 'Yes' : 'No',
            'Executor': executorStr,
            'Reason': reason
          },
          client: role.guild.client
        });
        await logServerEvent(role.guild, 'roles', createEmbed);
      } catch {}
    })().catch(() => null);
  }
};
