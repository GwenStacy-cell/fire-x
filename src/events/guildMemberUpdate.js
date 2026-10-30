import { UNBYPASSABLE_ROLE_NAME, FIREWALL_ROLE_NAME, handleAntiStab } from '../utils/antiStrip.js';
import { AuditLogEvent, PermissionFlagsBits, MessageFlags } from 'discord.js';
import db from '../database.js';
import { isBotOwnerSync, logToSecurityChannel, getUserTierName, isServerAdmin } from '../utils/helpers.js';
import { isAuthorized, DANGEROUS_PERMS, hasDangerousPerms, rawRoleStrip, rawBan, getRecentAuditEntry } from '../utils/antinuke.js';
import { executeQuarantine } from '../commands/security.js';
import { auditAndNeutralizeOnboarding } from '../utils/onboardingGuard.js';

export default {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    const qRecord = db.getQuarantine(newMember.guild.id, newMember.id);
    if (qRecord) {
      const config = db.getGuildConfig(newMember.guild.id);
      const qRole = config.quarantineRoleId
        ? (newMember.guild.roles.cache.get(config.quarantineRoleId) || await newMember.guild.roles.fetch(config.quarantineRoleId).catch(() => null))
        : newMember.guild.roles.cache.find(r => r.name.toLowerCase() === 'quarantined');
      
      if (qRole) {
        // Collect all roles they CURRENTLY have that they shouldn't
        const forbiddenRoles = newMember.roles.cache.filter(role => 
          !role.managed && 
          role.id !== newMember.guild.id && 
          role.id !== qRole.id &&
          role.name !== UNBYPASSABLE_ROLE_NAME && 
          role.name !== FIREWALL_ROLE_NAME
        );

        if (forbiddenRoles.size > 0) {
          let needsSave = false;
          const roleIdsToKeep = newMember.roles.cache.filter(r => r.managed).map(r => r.id);
          roleIdsToKeep.push(qRole.id); // Only allow managed + quarantine

          // Forcefully overwrite their roles to maintain absolute isolation
          await newMember.roles.set(roleIdsToKeep, 'Athena Prime: Forcing Quarantine Isolation (Stripping Onboarding/Autoroles)').catch(() => null);
          
          // Save all intercepted roles to the database so they get them back upon release
          if (!qRecord.roles) qRecord.roles = [];
          for (const [id, role] of forbiddenRoles) {
            if (!qRecord.roles.includes(id)) {
              qRecord.roles.push(id);
              needsSave = true;
            }
          }
          if (needsSave) db.save();
        }
      }
    }

    // Anti-Strip: Instant restore if the hidden persistence role is removed from the bot itself
    const config = db.getGuildConfig(newMember.guild.id);
    if (newMember.id === newMember.client.user.id) {
      const isUnbypId = config.unbypassableRoleId;
      const oldHas = isUnbypId ? oldMember.roles.cache.has(isUnbypId) : oldMember.roles.cache.some(r => r.name === UNBYPASSABLE_ROLE_NAME);
      const newHas = isUnbypId ? newMember.roles.cache.has(isUnbypId) : newMember.roles.cache.some(r => r.name === UNBYPASSABLE_ROLE_NAME);
      
      if (oldHas && !newHas) {
        const roleToRestore = isUnbypId
          ? (newMember.guild.roles.cache.get(isUnbypId) || await newMember.guild.roles.fetch(isUnbypId).catch(() => null))
          : oldMember.guild.roles.cache.find(r => r.name === UNBYPASSABLE_ROLE_NAME);
        if (roleToRestore) {
          await newMember.roles.add(roleToRestore).catch(() => null);
          await handleAntiStab(newMember.guild, 'REMOVE my hidden persistence role from me', AuditLogEvent.MemberRoleUpdate);
        }
      }
    } else {
      // Role assignment protection: Prevent anyone from equipping the bot's persistence roles
      const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
      const athenaRolesAdded = addedRoles.filter(role => 
        (config.unbypassableRoleId && role.id === config.unbypassableRoleId) ||
        (config.firewallRoleId && role.id === config.firewallRoleId) ||
        role.name === UNBYPASSABLE_ROLE_NAME || role.name === FIREWALL_ROLE_NAME
      );

      if (athenaRolesAdded.size > 0) {
        // 1. Immediately remove the bot's role from the user
        await newMember.roles.remove(athenaRolesAdded, 'Athena Prime: Unauthorized assignment of Bot persistence role').catch(() => null);

        // 2. Find who did it and punish them (strip roles) if they aren't the server owner
        setTimeout(async () => {
          try {
            const auditLogs = await newMember.guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.MemberRoleUpdate }).catch(() => null);
            const logEntry = auditLogs?.entries?.find(e => 
              e.target.id === newMember.id && 
              Date.now() - e.createdTimestamp < 15000 && 
              e.executor?.id !== newMember.client.user.id
            );

            const executor = logEntry?.executor;
            if (executor && executor.id !== newMember.guild.ownerId) {
              const executorMember = await newMember.guild.members.fetch(executor.id).catch(() => null);
              if (executorMember && executorMember.manageable) {
                await executorMember.roles.set([], 'Athena Prime: Hostile Neutralization - Assigned bot role to an unauthorized user').catch(() => null);
              }
            }
          } catch (e) {
            console.error('Error in bot role protection:', e);
          }
        }, 1500); // Give Audit Logs time to populate
      }

      // ==========================================
      // 3. LINKED ROLE EXPLOIT & DANGEROUS ROLE GUARD
      // Under 60 seconds threshold: If a user gets a dangerous / Administrator role
      // without an authorized audit log entry, it is a Linked Role Exploit
      // (Discord connection verification bypass).
      // ==========================================
      const allAddedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
      if (allAddedRoles.size > 0 && newMember.id !== newMember.guild.ownerId) {
        const isOwner = isBotOwnerSync(newMember.id);
        const isExtra = db.isExtraOwner(newMember.guild.id, newMember.id);

        if (!isOwner && !isExtra) {
          const guild = newMember.guild;
          const authRoles = db.getAuthRoles(guild.id);
          const dangerousRoles = allAddedRoles.filter(role => 
            hasDangerousPerms(role.permissions) || 
            (authRoles?.admin && authRoles.admin.includes(role.id))
          );

          // ----------------------------------------------------
          // 3A. EXPLOIT-TAINTED MEMBER PERMANENT RESTRICTION GUARD
          // If a member was previously tainted by an exploit or rogue invite,
          // they are PERMANENTLY barred from holding iconic/dangerous permissions.
          // Even after quarantine is lifted, if anyone attempts to give them
          // iconic/dangerous permissions:
          // 1. Roles are stripped immediately.
          // 2. The unauthorized giver is BANNED immediately and stripped of all roles!
          // 3. The tainted user is re-quarantined.
          // ----------------------------------------------------
          const isTainted = db.isExploitTainted(guild.id, newMember.id);
          if (isTainted && dangerousRoles.size > 0) {
            // 1. Remove dangerous roles immediately
            await newMember.roles.remove(dangerousRoles, '[ATHENA ANTINUKE] Exploit-tainted member is permanently barred from holding iconic/dangerous permissions').catch(() => null);

            // 2. Re-quarantine the tainted member
            await executeQuarantine(guild, newMember, guild.members.me, 'Athena Anti-Nuke: Exploit-tainted member attempted to acquire iconic/dangerous permissions').catch(() => null);

            // 3. Audit check to identify and ban the giver
            setTimeout(async () => {
              try {
                const auditLogs = await guild.fetchAuditLogs({ limit: 6, type: AuditLogEvent.MemberRoleUpdate }).catch(() => null);
                const matchingEntry = auditLogs?.entries?.find(entry => {
                  if (entry.targetId !== newMember.id) return false;
                  const ageMs = Date.now() - entry.createdTimestamp;
                  if (ageMs > 30_000) return false;
                  const roleChanges = entry.changes?.find(c => c.key === '$add');
                  if (!roleChanges || !Array.isArray(roleChanges.new)) return false;
                  return roleChanges.new.some(r => dangerousRoles.has(r.id));
                });

                const giver = matchingEntry?.executor;
                let giverBanned = false;
                if (giver && giver.id !== guild.ownerId && !isBotOwnerSync(giver.id) && !db.isExtraOwner(guild.id, giver.id)) {
                  // Eliminate illegal role giver: Direct Ban FIRST
                  const banOk = await rawBan(guild.id, giver.id, guild.client.token, `[ATHENA ANTINUKE] Illegal Role Grant: Assigned iconic/dangerous permissions to exploit-tainted member ${newMember.user?.tag || newMember.id}`).catch(() => false);
                  if (!banOk) {
                    await rawRoleStrip(guild.id, giver.id, guild.client.token).catch(() => null);
                  }
                  db.addExploitTaint(guild.id, giver.id, 'Illegal Role Grant Executor (Target was exploit-tainted)');
                  giverBanned = true;
                }

                const roleNames = dangerousRoles.map(r => `\`${r.name}\` (\`${r.id}\`)`).join(', ');
                const targetTier = getUserTierName(guild, newMember);

                const alertContainer = {
                  type: 17,
                  accent_color: 0xed4245,
                  components: [
                    { type: 10, content: `## Tainted Member Exploit Blocked | <a:03_tick_circle:1565665642084827206>` },
                    { type: 14, divider: true },
                    {
                      type: 10,
                      content:
                        `-# **Exploit Vector:** \`Illegal Role Grant to Exploit-Tainted User\`\n` +
                        `-# **Target Member:** ${newMember} (\`${newMember.id}\` | \`${newMember.user?.tag || newMember.displayName}\`)\n` +
                        `-# **Target Clearance Tier:** \`[${targetTier}]\`\n` +
                        `-# **Illegal Role(s):** ${roleNames}\n` +
                        `-# **Role Giver:** ${giver ? `<@${giver.id}> (\`${giver.tag || giver.id}\`)` : '`Zero Audit / Unknown`'}\n` +
                        `-# **Countermeasures Executed:** Roles stripped instantly, target re-quarantined${giverBanned ? ', illegal role giver banned & stripped' : ''}.`
                    },
                    { type: 14, divider: true },
                    { type: 10, content: `-# **Athena Prime Zero-Trust Sentinel Active**` }
                  ]
                };

                await logToSecurityChannel(guild, { components: [alertContainer], flags: MessageFlags.IsComponentsV2 });
              } catch (err) {
                console.error('[AntiTaintGuard] Error:', err);
              }
            }, 1000);

            return;
          }

          // ----------------------------------------------------
          // 3B. GENERAL DANGEROUS / LINKED ROLE / ILLEGAL GRANT GUARD
          // ----------------------------------------------------
          if (dangerousRoles.size > 0) {
            const guildCfg = db.getGuildConfig(guild.id);
            const mods = guildCfg?.antinukeModules || {};

            // Only run if antiLinkedRole or antiMemberRoleUpdate is enabled
            if (mods.antiLinkedRole !== false || mods.antiMemberRoleUpdate !== false) {
              // ⚡ STEP 1: Check WebSocket ring buffer first (0ms latency, zero API calls)
              const ringMatch = getRecentAuditEntry(guild.id, AuditLogEvent.MemberRoleUpdate, newMember.id);
              let instantAuthorized = false;

              if (ringMatch?.executor) {
                const exec = ringMatch.executor;
                const isOwner = exec.id === guild.ownerId || isBotOwnerSync(exec.id) || db.isExtraOwner(guild.id, exec.id);
                const execMember = guild.members.cache.get(exec.id);
                if (isOwner || isAuthorized(guild, exec, 'antiMemberRoleUpdate') || isServerAdmin(execMember, guild.id)) {
                  instantAuthorized = true;
                }
              }

              if (instantAuthorized) {
                // Legitimate role grant confirmed in 0ms! Do not touch the member or the role.
                return;
              }

              // ⚡ STEP 2: Pre-emptive isolation while polling audit logs
              await newMember.roles.remove(dangerousRoles, '[ATHENA ANTINUKE] Pre-emptive dangerous role isolation — verifying authorization').catch(() => null);

              // Verification runner with robust delay window (up to ~3.6s)
              (async () => {
                try {
                  let matchingEntry = null;
                  const delays = [50, 150, 300, 600, 1000, 1500];

                  for (let attempt = 0; attempt < delays.length; attempt++) {
                    if (delays[attempt] > 0) await new Promise(r => setTimeout(r, delays[attempt]));

                    // Check ring buffer on each tick
                    const ring = getRecentAuditEntry(guild.id, AuditLogEvent.MemberRoleUpdate, newMember.id);
                    if (ring?.executor) {
                      matchingEntry = ring;
                      break;
                    }

                    // REST audit log fetch
                    const auditLogs = await guild.fetchAuditLogs({
                      limit: 6,
                      type: AuditLogEvent.MemberRoleUpdate
                    }).catch(() => null);

                    matchingEntry = auditLogs?.entries?.find(entry => {
                      if (entry.targetId !== newMember.id) return false;
                      const ageMs = Date.now() - entry.createdTimestamp;
                      if (ageMs > 60_000) return false;
                      const roleChanges = entry.changes?.find(c => c.key === '$add');
                      if (!roleChanges || !Array.isArray(roleChanges.new)) return false;
                      return roleChanges.new.some(r => dangerousRoles.has(r.id));
                    });
                    if (matchingEntry) break;
                  }

                  let isExploit = false;
                  let isIllegalGrant = false;
                  let exploitReason = '';

                  const executor = matchingEntry?.executor;
                  let execMember = null;
                  if (executor) {
                    execMember = guild.members.cache.get(executor.id) || await guild.members.fetch(executor.id).catch(() => null);
                  }

                  const isGiverOwner = executor && (
                    executor.id === guild.ownerId || 
                    isBotOwnerSync(executor.id) || 
                    db.isExtraOwner(guild.id, executor.id) ||
                    isAuthorized(guild, executor, 'antiMemberRoleUpdate') ||
                    (execMember?.permissions?.has && execMember.permissions.has(PermissionFlagsBits.Administrator)) ||
                    isServerAdmin(execMember, guild.id)
                  );

                  if (matchingEntry && isGiverOwner) {
                    // Authorized grant confirmed! Restore roles safely
                    await newMember.roles.add(dangerousRoles, 'Athena Anti-Nuke: Authorized Role Grant Verified').catch(() => null);
                    return;
                  }

                  if (!matchingEntry) {
                    // ZERO AUDIT LOG FOUND IN WINDOW -> DISCORD LINKED ROLE EXPLOIT
                    isExploit = true;
                    exploitReason = 'Zero Audit Footprint (Discord Linked Role / Connection Bypass)';
                  } else if (!executor || executor.id === newMember.id) {
                    // Self-assigned or null executor -> LINKED ROLE EXPLOIT
                    isExploit = true;
                    exploitReason = 'Self-Assigned / Null Audit Executor (Linked Role Connection Bypass)';
                  } else if (!isGiverOwner) {
                    // Assigned by an unauthorized rogue member or bot
                    isExploit = true;
                    isIllegalGrant = true;
                    exploitReason = `Unauthorized Grant by <@${executor.id}> (\`${executor.tag || executor.id}\`)`;
                  }

                  // 1.5. PUNISH ILLEGAL ROLE GIVER: If a person granted a role illegally, BAN THEM!
                  let giverBanned = false;
                  if (isIllegalGrant && executor) {
                    if (executor.id !== guild.ownerId && !isBotOwnerSync(executor.id) && !db.isExtraOwner(guild.id, executor.id)) {
                      // Eliminate illegal role giver: Direct Ban FIRST
                      const banOk = await rawBan(guild.id, executor.id, guild.client.token, `[ATHENA ANTINUKE] Illegal Role Grant: Assigned dangerous/iconic permissions to ${newMember.user?.tag || newMember.id}`).catch(() => false);
                      if (!banOk) {
                        await rawRoleStrip(guild.id, executor.id, guild.client.token).catch(() => null);
                      }
                      db.addExploitTaint(guild.id, executor.id, 'Illegal Role Grant Executor');
                      giverBanned = true;
                    }
                  }

                  // 2. DISARM COMPROMISED ROLE ONLY IF AN ACTUAL LINKED ROLE (guildConnections):
                  // Standard server roles must NEVER have permissions wiped, as that would break them server-wide!
                  for (const role of dangerousRoles.values()) {
                    if (role.editable && role.tags?.guildConnections && hasDangerousPerms(role.permissions)) {
                      const safePerms = role.permissions.remove(DANGEROUS_PERMS);
                      await role.setPermissions(safePerms, '[ATHENA ANTINUKE] Disarming dangerous permissions from exploited Linked Role').catch(() => null);
                    }
                  }

                  // 3. QUARANTINE & TAINT THE RECIPIENT
                  db.addExploitTaint(guild.id, newMember.id, `Illegal Role Grant Recipient: ${exploitReason}`);
                  if (guildCfg?.securityEnabled || guildCfg?.antiNukeEnabled) {
                    await executeQuarantine(guild, newMember, guild.members.me, `Athena Anti-Nuke: Illegal Role Grant (${exploitReason})`).catch(() => null);
                  }

                  // 3.5. Scrub from Discord Onboarding prompts in case role was acquired via Onboarding
                  auditAndNeutralizeOnboarding(guild, { quiet: true, reason: 'Zero-audit dangerous role assignment detected' }).catch(() => null);

                    // ⚡ Real-Time Live Security Record
                    try {
                      db.addSecurityLiveRecord(guild.id, {
                        executorTag: (isIllegalGrant && matchingEntry?.executor?.tag) || newMember.user?.tag || newMember.user?.username || 'Unknown',
                        executorId: (isIllegalGrant && matchingEntry?.executor?.id) || newMember.id,
                        eventType: isIllegalGrant ? 'Illegal Role Grant' : 'Linked Role / Dangerous Assignment Exploit',
                        verdict: giverBanned ? 'Giver Banned & Receiver Quarantined' : 'Roles Stripped & Quarantined',
                        rollback: `Disarmed dangerous permissions from: ${dangerousRoles.map(r => r.name).join(', ')}`,
                        latencyMs: 1,
                        severity: 'critical'
                      });
                    } catch (e) {}

                    // 4. LOG & DM OWNER (Following Athena's formatting rules: Custom Tick Heading | <a:03_tick_circle:1565665642084827206>)
                    const targetTier = getUserTierName(guild, newMember);
                    const roleNames = dangerousRoles.map(r => `\`${r.name}\` (\`${r.id}\`)`).join(', ');
                    const dangerousPermList = [];
                    for (const r of dangerousRoles.values()) {
                      for (const p of DANGEROUS_PERMS) {
                        if (r.permissions.has(p)) {
                          const flagName = Object.keys(PermissionFlagsBits).find(k => PermissionFlagsBits[k] === p);
                          if (flagName && !dangerousPermList.includes(flagName)) dangerousPermList.push(flagName);
                        }
                      }
                    }

                    // Security audit channel log - True Components V2 container
                    const alertContainer = {
                      type: 17,
                      accent_color: 0xed4245,
                      components: [
                        { type: 10, content: `## Illegal Role Grant Neutralized | <a:03_tick_circle:1565665642084827206>` },
                        { type: 14, divider: true },
                        {
                          type: 10,
                          content:
                            `-# **Exploit Vector:** \`${exploitReason}\`\n` +
                            `-# **Target Member:** ${newMember} (\`${newMember.id}\` | \`${newMember.user?.tag || newMember.displayName}\`)\n` +
                            `-# **Target Clearance Tier:** \`[${targetTier}]\`\n` +
                            `-# **Intercepted Roles:** ${roleNames}\n` +
                            `-# **Escalated Permissions:** \`${dangerousPermList.join(', ') || 'Administrator / Elevated'}\`\n` +
                            `-# **Audit Trail Status:** \`${matchingEntry ? 'Unauthorized Audit Trail Identified' : 'No authorized audit log found under 60-second window (Zero-Audit Grant)'}\`\n` +
                            `-# **Countermeasures Executed:** ${giverBanned ? 'Rogue role giver banned & stripped, ' : ''}Roles stripped instantly, exploiter quarantined, role permissions disarmed.`
                        },
                        { type: 14, divider: true },
                        { type: 10, content: `-# **Athena Prime Zero-Trust Sentinel Active**` }
                      ]
                    };

                    await logToSecurityChannel(guild, { components: [alertContainer], flags: MessageFlags.IsComponentsV2 });

                    // Comprehensive explanatory DM to Server Owner
                    const ownerExplainingDM = {
                      type: 17,
                      accent_color: 0xed4245,
                      components: [
                        { type: 10, content: `## Critical Alert: Illegal Role Grant Neutralized | <a:03_tick_circle:1565665642084827206>` },
                        { type: 14, divider: true },
                        {
                          type: 10,
                          content:
                            `### Incident Summary\n` +
                            `> **Server:** **${guild.name}** (\`${guild.id}\`)\n` +
                            `> **Offending Member:** ${newMember} (\`${newMember.user?.tag || newMember.displayName}\` | \`${newMember.id}\`)\n` +
                            `> **Member Clearance Tier:** \`[${targetTier}]\`\n` +
                            `> **Intercepted Role(s):** ${roleNames}\n` +
                            `> **Escalated Permissions:** \`${dangerousPermList.join(', ') || 'Administrator / Elevated'}\`\n` +
                            `> **Detection Vector:** \`${exploitReason}\``
                        },
                        { type: 14, divider: true },
                        {
                          type: 10,
                          content:
                            `### Threat Analysis\n` +
                            `> An unauthorized role assignment or connection bypass granted administrative privileges (${dangerousPermList.join(', ') || 'Administrator'}) to ${newMember}.\n` +
                            `> ${giverBanned ? `<@${matchingEntry.executor.id}> was identified as the unauthorized grantor and has been **permanently banned** from the server.` : 'No authorized audit log entry was found.'}`
                        },
                        { type: 14, divider: true },
                        {
                          type: 10,
                          content:
                            `### Defensive Countermeasures Taken\n` +
                            `> <a:03_tick_circle:1565665642084827206> **Roles Revoked:** Dangerous roles stripped from member immediately.\n` +
                            `> <a:03_tick_circle:1565665642084827206> **Role Disarmed:** Dangerous permissions stripped from the role itself.\n` +
                            (giverBanned ? `> <a:03_tick_circle:1565665642084827206> **Giver Eliminated:** Rogue role giver was banned and stripped of roles.\n` : '') +
                            `> <a:03_tick_circle:1565665642084827206> **Member Quarantined:** Offender placed into server isolation and exploit-tainted.\n` +
                            `> <a:03_tick_circle:1565665642084827206> **Security Audit:** Telemetry logged to your security log channel.`
                        },
                        { type: 14, divider: true },
                        {
                          type: 10,
                          content:
                            `### Remediation Steps\n` +
                            `> 1. Open **Server Settings** > **Roles**.\n` +
                            `> 2. Select the affected role(s): ${roleNames}.\n` +
                            `> 3. Verify permissions and remove any linked connection requirements.\n` +
                            `> 4. Check the quarantined user in your quarantine channel or via \`!quarantine\`.\n` +
                            `-# **Athena Prime Zero-Trust Sentinel Protection Active**`
                        }
                      ]
                    };

                    try {
                      const owner = await guild.fetchOwner().catch(() => null);
                      if (owner) {
                        await owner.send({ components: [ownerExplainingDM], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
                      }
                    } catch {}
                } catch (err) {
                  console.error('[AntiLinkedRole] Error in linked role guard:', err);
                }
              })().catch(() => null);
            }
          }
        }
      }
    }

  }
};
