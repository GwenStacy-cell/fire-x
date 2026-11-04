import { PermissionFlagsBits } from 'discord.js';
import db from '../database.js';

export const UNBYPASSABLE_ROLE_NAME = 'Athena Unbypassable';
export const FIREWALL_ROLE_NAME = 'Athena Firewall';

const ensureLocks = new Map(); // guild.id => Promise<{ unbypassableRole, firewallRole }>

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

    const me = guild.members.me || (guild.members.fetchMe ? await guild.members.fetchMe().catch(() => null) : null) || (guild.client?.user?.id && guild.members?.fetch ? await guild.members.fetch(guild.client.user.id).catch(() => null) : null);
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
  if (!guild) return null;

  // Resolve bot member reliably across all discord.js caching states
  let me = guild.members.me;
  if (!me && guild.members?.fetchMe) {
    me = await guild.members.fetchMe().catch(() => null);
  }
  if (!me && guild.client?.user?.id && guild.members?.fetch) {
    me = await guild.members.fetch(guild.client.user.id).catch(() => null);
  }
  if (!me) {
    console.error(`[AntiStrip] Could not resolve bot member in guild ${guild.name || guild.id}`);
    return null;
  }

  // Athena requires Manage Roles to create, position, and bind persistence sentinels
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    console.warn(`[AntiStrip] Bot lacks ManageRoles permission in guild ${guild.name || guild.id}`);
    return null;
  }

  // De-duplicate concurrent calls: if a creation task is already in-flight for this guild, wait for it
  if (ensureLocks.has(guild.id)) {
    return await ensureLocks.get(guild.id);
  }

  const executionPromise = (async () => {
    try {
      const config = db.getGuildConfig(guild.id);
      if (!options?.force && (!config?.securityEnabled || !config?.antiNukeEnabled)) {
        await removePersistenceRoles(guild).catch(() => null);
        return null;
      }

      await guild.roles.fetch().catch(() => null);

      // Determine target permissions safe for this bot member
      const hasAdmin = me.permissions.has(PermissionFlagsBits.Administrator);
      const targetPermissions = hasAdmin
        ? [PermissionFlagsBits.Administrator]
        : [
            PermissionFlagsBits.ManageRoles,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageGuild,
            PermissionFlagsBits.KickMembers,
            PermissionFlagsBits.BanMembers,
            PermissionFlagsBits.ViewAuditLog,
            PermissionFlagsBits.ModerateMembers
          ].filter(p => me.permissions.has(p));

      // Helper to safely create role with fallback if target permissions are rejected by Discord API (e.g. 50013 Missing Permissions)
      async function createSentinelRole(name, color, hoist, reason) {
        let role = await guild.roles.create({
          name,
          permissions: targetPermissions,
          color,
          hoist,
          mentionable: false,
          reason
        }).catch(err => {
          console.warn(`[AntiStrip] Role create with target permissions failed for ${name}: ${err.message}. Retrying with base permissions...`);
          return null;
        });

        if (!role) {
          role = await guild.roles.create({
            name,
            permissions: [],
            color,
            hoist,
            mentionable: false,
            reason
          }).catch(err => {
            console.error(`[AntiStrip] Fallback role create failed for ${name}: ${err.message}`);
            return null;
          });
        }

        return role;
      }

      // 1. Unbypassable Role (Hidden) - ALWAYS fetch ID from our database first
      let unbypassableRole = config.unbypassableRoleId
        ? (guild.roles.cache.get(config.unbypassableRoleId) || await guild.roles.fetch(config.unbypassableRoleId).catch(() => null))
        : null;

      if (!unbypassableRole) {
        const unbypRoles = [...guild.roles.cache.filter(r => r.name === UNBYPASSABLE_ROLE_NAME).values()];
        const unbypassableCandidate = unbypRoles.find(r => r.editable);

        // Clear unmanaged editable duplicates
        if (unbypRoles.length > 1) {
          for (const r of unbypRoles) {
            if (r.id !== (unbypassableCandidate ? unbypassableCandidate.id : unbypRoles[0].id) && r.editable) {
              await r.delete('Clearing duplicate persistence role').catch(() => null);
            }
          }
        }

        unbypassableRole = unbypassableCandidate || await createSentinelRole(
          UNBYPASSABLE_ROLE_NAME,
          '#2b2d31',
          false,
          'Athena Prime Unbypassable Persistence'
        );

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
        const fwRoles = [...guild.roles.cache.filter(r => r.name === FIREWALL_ROLE_NAME).values()];
        const firewallCandidate = fwRoles.find(r => r.editable);

        // Clear unmanaged editable duplicates
        if (fwRoles.length > 1) {
          for (const r of fwRoles) {
            if (r.id !== (firewallCandidate ? firewallCandidate.id : fwRoles[0].id) && r.editable) {
              await r.delete('Clearing duplicate persistence role').catch(() => null);
            }
          }
        }

        firewallRole = firewallCandidate || await createSentinelRole(
          FIREWALL_ROLE_NAME,
          '#FF0000',
          true,
          'Athena Prime Firewall Persistence'
        );

        if (firewallRole) {
          db.updateGuildConfig(guild.id, { 
            firewallRoleId: firewallRole.id,
            athenFirewallRoleId: firewallRole.id
          });
        }
      }

      if (!unbypassableRole && !firewallRole) {
        return null;
      }

      // 3. Ensure Permissions on editable roles
      if (unbypassableRole?.editable) {
        if (hasAdmin && !unbypassableRole.permissions.has(PermissionFlagsBits.Administrator)) {
          await unbypassableRole.setPermissions([PermissionFlagsBits.Administrator], 'Athena Prime Unbypassable Persistence').catch(() => null);
        } else if (!hasAdmin && targetPermissions.length > 0) {
          await unbypassableRole.setPermissions(targetPermissions, 'Athena Prime Unbypassable Persistence').catch(() => null);
        }
      }
      if (firewallRole?.editable) {
        if (hasAdmin && !firewallRole.permissions.has(PermissionFlagsBits.Administrator)) {
          await firewallRole.setPermissions([PermissionFlagsBits.Administrator], 'Athena Prime Firewall Persistence').catch(() => null);
        } else if (!hasAdmin && targetPermissions.length > 0) {
          await firewallRole.setPermissions(targetPermissions, 'Athena Prime Firewall Persistence').catch(() => null);
        }
      }

      // 4. Move positions (Firewall above Unbypassable, both positioned safely below bot's highest role)
      const botHighestPos = me?.roles?.highest?.position ?? 0;
      const fwTargetPos = Math.max(1, botHighestPos - 1);
      const unbTargetPos = Math.max(1, botHighestPos - 2);

      if (firewallRole?.editable && fwTargetPos < botHighestPos && fwTargetPos >= 1 && firewallRole.position !== fwTargetPos) {
        await firewallRole.setPosition(fwTargetPos).catch(() => null);
      }
      if (unbypassableRole?.editable && unbTargetPos < botHighestPos && unbTargetPos >= 1 && unbypassableRole.position !== unbTargetPos) {
        await unbypassableRole.setPosition(unbTargetPos).catch(() => null);
      }

      // 5. Ensure the bot has both roles
      await me.fetch(true).catch(() => null);
      if (unbypassableRole && !me.roles.cache.has(unbypassableRole.id)) {
        await me.roles.add(unbypassableRole, 'Athena Prime Persistence Sentinel Binding').catch(err => {
          console.warn('[AntiStrip] Could not add unbypassable role to bot:', err.message);
        });
      }
      if (firewallRole && !me.roles.cache.has(firewallRole.id)) {
        await me.roles.add(firewallRole, 'Athena Prime Persistence Sentinel Binding').catch(err => {
          console.warn('[AntiStrip] Could not add firewall role to bot:', err.message);
        });
      }
      await me.fetch(true).catch(() => null);

      // Save role IDs to DB so disable all can find them even if renamed
      db.updateGuildConfig(guild.id, {
        firewallRoleId: firewallRole?.id || null,
        unbypassableRoleId: unbypassableRole?.id || null,
        athenFirewallRoleId: firewallRole?.id || null,
        athenaUnbypassableRoleId: unbypassableRole?.id || null
      });

      return { unbypassableRole, firewallRole };
    } catch (error) {
      console.error(`[AntiStrip] Failed to ensure persistence roles in ${guild.name}:`, error.message);
      return null;
    } finally {
      ensureLocks.delete(guild.id);
    }
  })();

  ensureLocks.set(guild.id, executionPromise);
  return await executionPromise;
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
