import { PermissionFlagsBits } from 'discord.js';
import db from '../database.js';

export const UNBYPASSABLE_ROLE_NAME = 'Athena Unbypassable';
export const FIREWALL_ROLE_NAME = 'Athena Firewall';

const ensureLocks = new Set();

export async function removePersistenceRoles(guild) {
  if (!guild) return;
  try {
    await guild.roles.fetch().catch(() => null);
    const cfg = db.getGuildConfig(guild.id);
    const roleIdsToDelete = [
      cfg.firewallRoleId, 
      cfg.unbypassableRoleId, 
      cfg.athenFirewallRoleId, 
      cfg.athenaUnbypassableRoleId
    ].filter(Boolean);

    for (const rid of roleIdsToDelete) {
      const r = guild.roles.cache.get(rid) || await guild.roles.fetch(rid).catch(() => null);
      if (r && r.editable) await r.delete('Athena Security Inactive (Idle Mode)').catch(() => null);
    }

    const remaining = guild.roles.cache.filter(role => 
      (role.name === UNBYPASSABLE_ROLE_NAME || role.name === FIREWALL_ROLE_NAME) && role.editable
    );
    for (const role of remaining.values()) {
      await role.delete('Athena Security Inactive (Idle Mode)').catch(() => null);
    }

    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (me) await me.fetch(true).catch(() => null);

    db.updateGuildConfig(guild.id, {
      firewallRoleId: null,
      unbypassableRoleId: null,
      athenFirewallRoleId: null,
      athenaUnbypassableRoleId: null
    });
  } catch (err) {
    console.error(`[AntiStrip] Error removing persistence roles in ${guild.name}:`, err.message);
  }
}

export async function ensureUnbypassableRole(guild, options = {}) {
  if (!guild || !guild.members.me) return null;
  if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) return null;

  if (ensureLocks.has(guild.id)) return null;
  ensureLocks.add(guild.id);

  try {
    const config = db.getGuildConfig(guild.id);
    if (!options?.force && (!config?.securityEnabled || !config?.antiNukeEnabled)) {
      await removePersistenceRoles(guild).catch(() => null);
      return null;
    }

    await guild.roles.fetch().catch(() => null);

    // 1. Unbypassable Role (Hidden) - ALWAYS fetch ID from our database first
    let unbypassableRole = config.unbypassableRoleId
      ? (guild.roles.cache.get(config.unbypassableRoleId) || await guild.roles.fetch(config.unbypassableRoleId).catch(() => null))
      : null;

    if (!unbypassableRole) {
      let unbypRoles = [...guild.roles.cache.filter(r => r.name === UNBYPASSABLE_ROLE_NAME).values()];
      let unbypassableCandidate = unbypRoles.find(r => r.editable);
      
      // Clear duplicates
      if (unbypRoles.length > 1) {
        for (const r of unbypRoles) {
          if (r.id !== (unbypassableCandidate ? unbypassableCandidate.id : unbypRoles[0].id) && r.editable) {
            await r.delete().catch(() => null);
          }
        }
      }

      if (!unbypassableCandidate && unbypRoles.length > 0) {
        unbypassableCandidate = unbypRoles[0]; // Fallback to non-editable if we must
      }

      unbypassableRole = unbypassableCandidate || await guild.roles.create({
        name: UNBYPASSABLE_ROLE_NAME,
        permissions: [PermissionFlagsBits.Administrator],
        color: '#2b2d31', // Dark discord color
        hoist: false,
        mentionable: false,
        reason: 'Athena Prime Unbypassable Persistence'
      }).catch(err => {
        console.error('[AntiStrip] Failed creating unbypassable role:', err.message);
        return null;
      });

      if (unbypassableRole) {
        db.updateGuildConfig(guild.id, { 
          unbypassableRoleId: unbypassableRole.id,
          athenaUnbypassableRoleId: unbypassableRole.id
        });
      }
    }

    // 2. Firewall Role (Pure Red, Hoisted) - ALWAYS fetch ID from our database first
    let firewallRole = config.firewallRoleId
      ? (guild.roles.cache.get(config.firewallRoleId) || await guild.roles.fetch(config.firewallRoleId).catch(() => null))
      : null;

    if (!firewallRole) {
      let fwRoles = [...guild.roles.cache.filter(r => r.name === FIREWALL_ROLE_NAME).values()];
      let firewallCandidate = fwRoles.find(r => r.editable);
      
      // Clear duplicates
      if (fwRoles.length > 1) {
        for (const r of fwRoles) {
          if (r.id !== (firewallCandidate ? firewallCandidate.id : fwRoles[0].id) && r.editable) {
            await r.delete().catch(() => null);
          }
        }
      }

      if (!firewallCandidate && fwRoles.length > 0) {
        firewallCandidate = fwRoles[0]; // Fallback
      }

      firewallRole = firewallCandidate || await guild.roles.create({
        name: FIREWALL_ROLE_NAME,
        permissions: [PermissionFlagsBits.Administrator],
        color: '#FF0000', // Pure Red
        hoist: true,
        mentionable: false,
        reason: 'Athena Prime Firewall Persistence'
      }).catch(err => {
        console.error('[AntiStrip] Failed creating firewall role:', err.message);
        return null;
      });

      if (firewallRole) {
        db.updateGuildConfig(guild.id, { 
          firewallRoleId: firewallRole.id,
          athenFirewallRoleId: firewallRole.id
        });
      }
    }

    if (!unbypassableRole || !firewallRole) {
      return null;
    }

    // 3. Ensure Permissions
    if (unbypassableRole.editable && !unbypassableRole.permissions.has(PermissionFlagsBits.Administrator)) {
      await unbypassableRole.setPermissions([PermissionFlagsBits.Administrator], 'Athena Prime Unbypassable Persistence').catch(() => null);
    }
    if (firewallRole.editable && !firewallRole.permissions.has(PermissionFlagsBits.Administrator)) {
      await firewallRole.setPermissions([PermissionFlagsBits.Administrator], 'Athena Prime Firewall Persistence').catch(() => null);
    }

    // 4. Move positions (Firewall above Unbypassable, both just below bot's highest)
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const botHighestPos = botMember?.roles?.highest?.position ?? 0;
    if (firewallRole.editable && firewallRole.position < botHighestPos - 1) {
      await firewallRole.setPosition(botHighestPos - 1).catch(() => null);
    }
    if (unbypassableRole.editable && unbypassableRole.position < botHighestPos - 2) {
      await unbypassableRole.setPosition(botHighestPos - 2).catch(() => null);
    }

    // 5. Ensure the bot has both roles
    const me = botMember || await guild.members.fetch(guild.client.user.id).catch(() => null);
    if (me) {
      if (unbypassableRole && !me.roles.cache.has(unbypassableRole.id)) {
        await me.roles.add(unbypassableRole).catch(() => null);
      }
      if (firewallRole && !me.roles.cache.has(firewallRole.id)) {
        await me.roles.add(firewallRole).catch(() => null);
      }
      await me.fetch(true).catch(() => null);
    }

    // Save role IDs to DB so disable all can find them even if renamed
    db.updateGuildConfig(guild.id, {
      firewallRoleId: firewallRole.id,
      unbypassableRoleId: unbypassableRole.id,
      athenFirewallRoleId: firewallRole.id,
      athenaUnbypassableRoleId: unbypassableRole.id
    });

    return { unbypassableRole, firewallRole };
  } catch (error) {
    console.error(`[AntiStrip] Failed to ensure persistence roles in ${guild.name}:`, error.message);
    return null;
  } finally {
    ensureLocks.delete(guild.id);
  }
}

import embed from '../embed.js';
import { AuditLogEvent } from 'discord.js';

export async function handleAntiStab(guild, actionText, auditLogType) {
  try {
    const config = db.getGuildConfig(guild.id);
    if (!config?.securityEnabled || !config?.antiNukeEnabled) {
      await removePersistenceRoles(guild).catch(() => null);
      return null;
    }
    
    // No delay — rely on audit log already being fetched from the WebSocket event that triggered this
    const auditLogs = await guild.fetchAuditLogs({ limit: 5, type: auditLogType }).catch(() => null);
    const logEntry = auditLogs?.entries?.find(e => Date.now() - e.createdTimestamp < 15000 && e.executor?.id !== guild.client.user.id);
    const executor = logEntry?.executor;

    let punishedText = '';
    if (executor && executor.id !== guild.ownerId && executor.id !== guild.client.user.id) {
      try {
        const member = guild.members.cache.get(executor.id) ?? await guild.members.fetch(executor.id).catch(() => null);
        if (member && member.bannable) {
          // Strip roles and ban in parallel for maximum speed
          await Promise.all([
            member.roles.set([], 'Anti-Stab: Hostile Neutralization — Stripping roles').catch(() => null),
            member.ban({ reason: `Anti-Stab: Hostile Neutralization — Attempted to ${actionText}` }).catch(() => null)
          ]);
          punishedText = `\n\n**Hostile Neutralization:** I have successfully stripped their roles and **BANNED** them from the server to neutralize the threat.`;
        } else {
          punishedText = `\n\nI attempted to execute a **Hostile Neutralization**, but their top role is higher than mine or they are the server owner.`;
        }
      } catch (e) {
        punishedText = `\n\nFailed to execute a **Hostile Neutralization** automatically (missing permissions or hierarchy).`;
      }
    } else if (executor?.id === guild.ownerId) {
      punishedText = `\n\nSince they are the Server Owner, I cannot execute a **Hostile Neutralization**, but I have forced my permissions back on.`;
    }

    // ⚡ Real-Time Live Security Record
    try {
      db.addSecurityLiveRecord(guild.id, {
        executorTag: executor ? (executor.tag || executor.username) : 'Unknown Admin',
        executorId: executor ? executor.id : 'Unknown',
        eventType: `Anti-Stab Persistence Attack (${actionText})`,
        verdict: executor?.id !== guild.ownerId ? 'Banned & Roles Stripped' : 'Protected (Owner Action)',
        rollback: 'Athena Unbypassable & Firewall permissions immediately restored',
        latencyMs: 1,
        severity: 'critical'
      });
    } catch {}

    // 4. Alert the Server Owner (NO EMOJIS)
    const owner = await guild.fetchOwner().catch(() => null);
    if (!owner) return;
    
    const stabberMention = executor ? `<@${executor.id}> (${executor.tag})` : 'an Unknown Admin (Audit log hidden)';
    
    const alertEmbed = embed.danger(
      'ANTI-STAB: Hostile Neutralization Initiated',
      `**Server:** ${guild.name}\n\nSomeone just attempted to **${actionText}**!\n\n**Stabber Detected:** ${stabberMention}${punishedText}\n\nI have instantly forced my permissions back on to protect the server. Please review your audit logs.`
    );
    
    // Remove all emojis from the embed title
    alertEmbed.data.title = alertEmbed.data.title.replace(/[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/gu, '').trim();

    await owner.send({ embeds: [alertEmbed] }).catch(() => null);
  } catch (err) {
    // Ignore if DMs are closed
  }
}
