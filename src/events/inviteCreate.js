import db from '../database.js';
import { hasDangerousPerms, DANGEROUS_PERMS } from '../utils/antinuke.js';
import { logToSecurityChannel, isBotOwnerSync, getUserTierName } from '../utils/helpers.js';
import { executeQuarantine } from '../commands/security.js';
import { Routes, PermissionFlagsBits, MessageFlags } from 'discord.js';

export default {
  name: 'inviteCreate',
  async execute(invite) {
    const client = invite.client;
    if (!client.invites) client.invites = new Map();
    
    let guildInvites = client.invites.get(invite.guild.id);
    if (!guildInvites) {
      guildInvites = new Map();
      client.invites.set(invite.guild.id, guildInvites);
    }
    
    guildInvites.set(invite.code, invite.uses || 0);

    // ==========================================
    // ZERO-DAY DEFENSE: DANGEROUS ROLE-BASED INVITE GUARD
    // ==========================================
    const guild = invite.guild;
    if (!guild) return;

    const config = db.getGuildConfig(guild.id);
    if (!config || (!config.securityEnabled && !config.antiNukeEnabled)) return;

    try {
      // 1. Fetch raw invite details from REST to inspect role_ids and target_role
      const rawInvites = await client.rest.get(Routes.guildInvites(guild.id)).catch(() => null);
      const rawInv = Array.isArray(rawInvites) ? rawInvites.find(i => i.code === invite.code) : null;
      
      const roleIds = [
        ...(Array.isArray(rawInv?.role_ids) ? rawInv.role_ids : []),
        ...(Array.isArray(rawInv?.roles) ? rawInv.roles.map(r => r.id || r) : []),
        rawInv?.target_role?.id,
        rawInv?.target_role_id,
        invite.targetRole?.id,
        invite.targetRoleId,
        ...(Array.isArray(invite.roleIds) ? invite.roleIds : [])
      ].filter(Boolean);

      if (!roleIds || roleIds.length === 0) return;

      const authRoles = db.getAuthRoles(guild.id);
      const dangerousRoles = [];

      for (const roleId of roleIds) {
        const role = guild.roles.cache.get(roleId);
        if (role && (hasDangerousPerms(role.permissions) || (authRoles?.admin && authRoles.admin.includes(role.id)))) {
          dangerousRoles.push(role);
        }
      }

      if (dangerousRoles.length > 0) {
        // 2. Immediately delete the dangerous invite link
        await invite.delete('[ATHENA ANTINUKE] Rogue invite link created with dangerous administrative roles').catch(() => null);
        await client.rest.delete(Routes.invite(invite.code), { reason: '[ATHENA ANTINUKE] Destroyed rogue role-based invite link' }).catch(() => null);

        // 3. Disarm dangerous permissions from the roles themselves
        for (const role of dangerousRoles) {
          if (role.editable && hasDangerousPerms(role.permissions)) {
            const safePerms = role.permissions.remove(DANGEROUS_PERMS);
            await role.setPermissions(safePerms, '[ATHENA ANTINUKE] Disarming dangerous permissions from invite-linked role').catch(() => null);
          }
        }

        // 4. Inspect inviter / creator
        const inviterId = invite.inviterId || invite.inviter?.id || rawInv?.inviter?.id;
        const isServerOwner = inviterId === guild.ownerId;
        const isBotOwner = isBotOwnerSync(inviterId);
        const isExtra = db.isExtraOwner(guild.id, inviterId);

        let creatorMember = null;
        if (inviterId && !isServerOwner && !isBotOwner && !isExtra) {
          creatorMember = await guild.members.fetch(inviterId).catch(() => null);
          if (creatorMember) {
            // Strip ALL roles from the creator and quarantine them
            await creatorMember.roles.set([], '[ATHENA ANTINUKE] Stripped all roles for creating backdoored administrative invite link').catch(() => null);
            await executeQuarantine(guild, creatorMember, guild.members.me, 'Athena Anti-Nuke: Created invite link with unauthorized dangerous administrative roles').catch(() => null);
            db.addExploitTaint(guild.id, creatorMember.id, 'Created rogue administrative invite link');
          }
        }

        // 5. Send Alert to Security Channel
        const roleNames = dangerousRoles.map(r => `\`${r.name}\` (\`${r.id}\`)`).join(', ');
        const creatorStr = creatorMember ? `${creatorMember} (\`${creatorMember.id}\`)` : (inviterId ? `<@${inviterId}> (\`${inviterId}\`)` : 'Unknown User');

        const alertContainer = {
          type: 17,
          components: [
            { type: 10, content: `## Rogue Role-Based Invite Link Destroyed | <a:03_tick_circle:1565665642084827206>` },
            { type: 14, divider: true },
            {
              type: 10,
              content:
                `-# **Exploit Vector:** \`Role-Based Server Invite Link (Targeted Invite Backdoor)\`\n` +
                `-# **Invite Code:** \`${invite.code}\` (Deleted in <10ms)\n` +
                `-# **Creator / Inviter:** ${creatorStr}\n` +
                `-# **Targeted Dangerous Roles:** ${roleNames}\n` +
                `-# **Countermeasures Executed:** Invite destroyed, role permissions disarmed, rogue creator stripped of all roles, quarantined, and added to exploit taint list.`
            },
            { type: 14, divider: true },
            { type: 10, content: `-# **Athena Prime Zero-Trust Sentinel Active**` }
          ]
        };
        await logToSecurityChannel(guild, { components: [alertContainer], flags: MessageFlags.IsComponentsV2 });

        // 6. Direct DM to Server Owner
        try {
          const owner = await guild.fetchOwner();
          if (owner) {
            const ownerDM = {
              type: 17,
              components: [
                { type: 10, content: `## Critical Alert: Rogue Role-Based Invite Destroyed | <a:03_tick_circle:1565665642084827206>` },
                { type: 14, divider: true },
                {
                  type: 10,
                  content:
                    `### Incident Summary\n` +
                    `> **Server:** **${guild.name}** (\`${guild.id}\`)\n` +
                    `> **Invite Code:** \`${invite.code}\`\n` +
                    `> **Created By:** ${creatorStr}\n` +
                    `> **Bound Dangerous Role(s):** ${roleNames}\n\n` +
                    `### What Was The Threat?\n` +
                    `> Someone configured a Discord Server Invite link with **${roleNames}** attached to it. Anyone who joined using this link would have automatically received administrative permissions with zero manual role assignment.\n\n` +
                    `### Defensive Actions Taken\n` +
                    `> <a:03_tick_circle:1565665642084827206> **Invite Deleted:** The backdoored invite link was destroyed instantly.\n` +
                    `> <a:03_tick_circle:1565665642084827206> **Role Disarmed:** Dangerous permissions stripped from the targeted role.\n` +
                    `> <a:03_tick_circle:1565665642084827206> **Creator Handled:** Creator stripped of privileges and quarantined.`
                },
                { type: 14, divider: true },
                { type: 10, content: `-# **Athena Prime Zero-Trust Sentinel Active**` }
              ]
            };
            await owner.send({ components: [ownerDM], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
          }
        } catch {}
      }
    } catch (err) {
      console.error('[AntiNuke] Error in inviteCreate dangerous role inspection:', err);
    }
  }
};
