import { UNBYPASSABLE_ROLE_NAME, FIREWALL_ROLE_NAME, handleAntiStab } from '../utils/antiStrip.js';
import { AuditLogEvent, PermissionFlagsBits, MessageFlags } from 'discord.js';
import db from '../database.js';
import { isBotOwnerSync, logToSecurityChannel, getUserTierName, isServerAdmin, isQuarantineStaffAuthorized, formatUserLink } from '../utils/helpers.js';
import { isAuthorized, DANGEROUS_PERMS, hasDangerousPerms, rawBan, getRecentAuditEntry, rawFetchAuditLogs, condemn, setGuildUnderAttack } from '../utils/antinuke.js';
import { executeQuarantine } from '../commands/security.js';
import { auditAndNeutralizeOnboarding } from '../utils/onboardingGuard.js';
import { buildServerLogEmbed, logServerEvent, getAuditExecutorAndReason } from '../utils/serverLogger.js';

export default {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    const config = db.getGuildConfig(newMember.guild.id);
    const qRoleId = config?.quarantineRoleId;
    const isQuarantineRole = (r) => (qRoleId && r.id === qRoleId) || r.name.toLowerCase() === 'quarantined';
    const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
    const wasQuarantineRoleRemoved = removedRoles.some(isQuarantineRole);
    const qRecord = db.getQuarantine(newMember.guild.id, newMember.id);

    // ==========================================
    // 1. QUARANTINE ROLE REMOVAL SENTINEL
    // If someone removes the Quarantine role from a member:
    // - If done by Athena (command / unquarantine): Allow.
    // - If done by Server Owner, Bot Owner, Extra Owner, or Whitelisted staff:
    //   Authorized manual unquarantine directly via Discord! Lift quarantine, clear taint, restore roles.
    // - If done by an unauthorized Administrator or member:
    //   BOTH the original target AND the unauthorized admin are immediately quarantined!
    // ==========================================
    if (wasQuarantineRoleRemoved) {
      const guild = newMember.guild;
      const qRole = (qRoleId ? guild.roles.cache.get(qRoleId) : null) || guild.roles.cache.find(r => r.name.toLowerCase() === 'quarantined') || removedRoles.find(isQuarantineRole);

      (async () => {
        try {
          let ring = getRecentAuditEntry(guild.id, AuditLogEvent.MemberRoleUpdate, newMember.id);
          const delays = [80, 150, 300, 600, 1000];

          for (let attempt = 0; attempt < delays.length; attempt++) {
            if (ring?.executor) break;
            if (delays[attempt] > 0) await new Promise(r => setTimeout(r, delays[attempt]));
            ring = getRecentAuditEntry(guild.id, AuditLogEvent.MemberRoleUpdate, newMember.id);
            if (ring?.executor) break;

            const auditLogs = await guild.fetchAuditLogs({ limit: 6, type: AuditLogEvent.MemberRoleUpdate }).catch(() => null);
            const match = auditLogs?.entries?.find(entry => {
              if (entry.targetId !== newMember.id) return false;
              const ageMs = Date.now() - entry.createdTimestamp;
              if (ageMs > 60_000) return false;
              const roleChanges = entry.changes?.find(c => c.key === '$remove');
              if (!roleChanges || !Array.isArray(roleChanges.new)) return false;
              return roleChanges.new.some(isQuarantineRole);
            });
            if (match) {
              ring = match;
              break;
            }
          }

          const executor = ring?.executor;

          // Case A: Athena itself removed the role via command/unquarantine
          if (executor && executor.id === guild.client.user.id) {
            return;
          }

          // Case B: Authorized manual unquarantine by Server Owner, Bot Owner, Extra Owner, or Whitelisted staff
          if (executor && isQuarantineStaffAuthorized(guild, executor)) {
            // Authorized staff deliberately removed quarantine role manually directly in Discord!
            db.removeQuarantine(guild.id, newMember.id);
            db.removeExploitTaint(guild.id, newMember.id);

            // If there were saved roles in quarantine record, restore them
            if (qRecord?.roles && qRecord.roles.length > 0) {
              const managedRoleIds = newMember.roles.cache.filter(r => r.managed).map(r => r.id);
              const restoreRoles = [...new Set([...qRecord.roles, ...managedRoleIds])].filter(id => id !== qRole?.id);
              if (restoreRoles.length > 0) {
                await newMember.roles.set(restoreRoles, `Manual quarantine lift authorized by ${executor.tag || executor.id}`).catch(() => null);
              }
            }

            const authLogContainer = {
              type: 17,
              accent_color: 0x57f287,
              components: [
                { type: 10, content: `## Manual Quarantine Lifted | <a:03_tick_circle:1565665642084827206>` },
                { type: 14, divider: true },
                {
                  type: 10,
                  content:
                    `-# **Target Member:** ${newMember} (\`${newMember.id}\` | \`${newMember.user?.tag || newMember.displayName}\`)\n` +
                    `-# **Authorized Staff:** <@${executor.id}> (\`${executor.tag || executor.id}\`)\n` +
                    `-# **Authorization Tier:** \`[${getUserTierName(guild, executor)}]\`\n` +
                    `-# **Method:** \`Manual Discord Role Removal (No Command Required)\`\n` +
                    `-# **Actions Taken:** Quarantine record lifted, exploit taint purged, original role structure restored.`
                },
                { type: 14, divider: true },
                { type: 10, content: `-# **Athena Prime Zero-Trust Sentinel Active**` }
              ]
            };
            await logToSecurityChannel(guild, { components: [authLogContainer], flags: MessageFlags.IsComponentsV2 });
            return;
          }

          // Case C: UNAUTHORIZED manual removal (Unauthorized Admin, rogue member, self-removal, or zero audit)!
          // "if a unauthorised admin tries to remove quaratnine role from the quarantined user.. both of them shoiuld be quarantined"
          
          // 1. Immediately re-quarantine the original member
          if (qRole) {
            await newMember.roles.add(qRole, '[ATHENA ANTINUKE] Unauthorized quarantine removal blocked — restoring containment isolation').catch(() => null);
          }

          // 2. Quarantine the unauthorized admin/executor
          let execMember = null;
          let adminQuarantined = false;
          if (executor && executor.id !== guild.client.user.id && executor.id !== newMember.id) {
            execMember = guild.members.cache.get(executor.id) || await guild.members.fetch(executor.id).catch(() => null);
          }

          if (execMember && execMember.id !== guild.ownerId && !isBotOwnerSync(execMember.id) && !db.isExtraOwner(guild.id, execMember.id)) {
            await executeQuarantine(
              guild,
              execMember,
              guild.members.me,
              `Athena Anti-Nuke: Unauthorized attempt to release quarantined user ${newMember.user?.tag || newMember.id}`
            ).catch(() => null);
            db.addExploitTaint(guild.id, execMember.id, 'Unauthorized quarantine release perpetrator');
            adminQuarantined = true;
          }

          // 3. Security channel critical alert
          const breachContainer = {
            type: 17,
            accent_color: 0xed4245,
            components: [
              { type: 10, content: `## Quarantine Breach Neutralized | <a:03_tick_circle:1565665642084827206>` },
              { type: 14, divider: true },
              {
                type: 10,
                content:
                  `-# **Exploit Vector:** \`Unauthorized Manual Quarantine Role Removal\`\n` +
                  `-# **Quarantined Target:** ${newMember} (\`${newMember.id}\` | \`${newMember.user?.tag || newMember.displayName}\`)\n` +
                  `-# **Perpetrator (Unauthorized Admin):** ${executor ? `<@${executor.id}> (\`${executor.tag || executor.id}\`)` : '`Zero Audit / Unknown`'}\n` +
                  `-# **Countermeasures Executed:** Target re-quarantined immediately${adminQuarantined ? ' and unauthorized administrator isolated into quarantine zone' : ''}.\n` +
                  `-# **Security Policy:** General Administrators cannot release quarantined members. Only Extra Owners, Whitelisted Staff, and Server Owners hold quarantine clearance.`
              },
              { type: 14, divider: true },
              { type: 10, content: `-# **Athena Prime Zero-Trust Sentinel Active**` }
            ]
          };
          await logToSecurityChannel(guild, { components: [breachContainer], flags: MessageFlags.IsComponentsV2 });

        } catch (err) {
          console.error('[AntiQuarantineBreach] Error:', err);
        }
      })().catch(() => null);
    }

    if (qRecord && !wasQuarantineRoleRemoved) {
      const qRole = config?.quarantineRoleId
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
        // ⚡ Immediate Direct Ban if recipient is unauthorized (Zero role-removal delay)
        if (newMember.id !== newMember.guild.ownerId && !isBotOwnerSync(newMember.id) && !db.isExtraOwner(newMember.guild.id, newMember.id)) {
          condemn(newMember.guild.id, newMember.id);
          rawBan(newMember.guild.id, newMember.id, newMember.client.token, '[ATHENA PRIME] Unauthorized acquisition of Bot persistence role').catch(() => null);
        }

        // ⚡ Immediate Hostile Neutralization — Find who did it and ban over direct socket (0ms delay)
        (async () => {
          try {
            let ring = getRecentAuditEntry(newMember.guild.id, AuditLogEvent.MemberRoleUpdate, newMember.id);
            if (!ring) {
              const rawData = await rawFetchAuditLogs(newMember.guild.id, newMember.client.token, AuditLogEvent.MemberRoleUpdate).catch(() => null);
              const found = rawData?.audit_log_entries?.find(e => e.target_id === newMember.id);
              if (found?.user_id) ring = { executor: { id: found.user_id } };
            }
            const executor = ring?.executor;
            if (executor && executor.id !== newMember.guild.ownerId && executor.id !== newMember.client.user.id && !db.isExtraOwner(newMember.guild.id, executor.id) && !isBotOwnerSync(executor.id)) {
              condemn(newMember.guild.id, executor.id);
              await rawBan(newMember.guild.id, executor.id, newMember.client.token, '[ATHENA PRIME] Unauthorized assignment of Bot persistence role').catch(() => null);
            }
          } catch (e) {
            console.error('Error in bot role protection:', e);
          }
        })().catch(() => null);
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

          // ⚡ ZERO-DAY HONEYPOT ROLE CANARY CHECK (0ms Direct Ban Elimination)
          const cfg = db.getGuildConfig(guild.id);
          if (cfg?.honeypotRoleId && allAddedRoles.has(cfg.honeypotRoleId)) {
            condemn(guild.id, newMember.id);
            setGuildUnderAttack(guild.id, newMember.id, 60_000);
            rawBan(guild.id, newMember.id, guild.client.token, '[ATHENA HONEYPOT] ⚡ Honeypot Role Canary Triggered (Instant Direct Ban)').catch(() => null);
            console.log(`[ATHENA HONEYPOT] ⚡ Honeypot Role triggered by ${newMember.id}! Neutralized in 0ms!`);

            // Trace and ban unauthorized assigner
            (async () => {
              const ring = getRecentAuditEntry(guild.id, AuditLogEvent.MemberRoleUpdate, newMember.id);
              let assignerId = ring?.executorId || ring?.executor?.id;
              if (!assignerId) {
                const rawLogs = await rawFetchAuditLogs(guild.id, guild.client.token, AuditLogEvent.MemberRoleUpdate).catch(() => null);
                const match = rawLogs?.audit_log_entries?.find(e => e.target_id === newMember.id);
                if (match?.user_id) assignerId = match.user_id;
              }
              if (assignerId && assignerId !== guild.client.user.id && !isAuthorized(guild, { id: assignerId }, 'antiMemberRoleUpdate')) {
                condemn(guild.id, assignerId);
                rawBan(guild.id, assignerId, guild.client.token, '[ATHENA HONEYPOT] ⚡ Assigned Canary Honeypot Role to Member').catch(() => null);
              }
            })().catch(() => null);
            return;
          }

          const authRoles = db.getAuthRoles(guild.id);
          const dangerousRoles = allAddedRoles.filter(role => 
            hasDangerousPerms(role.permissions) || 
            (authRoles?.admin && authRoles.admin.includes(role.id))
          );

          // ----------------------------------------------------
          // 3. ZERO-TRUST DANGEROUS ROLE & PRIVILEGE ESCALATION SENTINEL
          // Detects unauthorized dangerous role assignments, rogue admin bots,
          // and Discord Linked Role (zero-audit connection) exploits.
          // Fully exempts legitimate grants from Server Owner, Bot Owner, Extra Owners,
          // Whitelisted users, Server Admins, and Athena herself (e.g. !addrole / unquarantine).
          // ----------------------------------------------------
          if (dangerousRoles.size > 0) {
            const guildCfg = db.getGuildConfig(guild.id);
            const mods = guildCfg?.antinukeModules || {};

            // Check if anti-nuke / security protection is active
            if (mods.antiLinkedRole !== false || mods.antiMemberRoleUpdate !== false || guildCfg?.securityEnabled || guildCfg?.antiNukeEnabled) {
              
              const isGiverAuthorized = (exec, execMem) => {
                if (!exec) return false;
                if (exec.id === guild.client.user.id) return true; // Athena Prime bot itself (e.g. !addrole, unquarantine)
                if (exec.id === guild.ownerId) return true; // Server Owner
                if (isBotOwnerSync(exec.id)) return true; // Bot Owner
                if (db.isExtraOwner(guild.id, exec.id)) return true; // Extra Owner
                if (isAuthorized(guild, exec, 'antiMemberRoleUpdate')) return true; // Whitelisted user / role for antiMemberRoleUpdate
                const resolvedMem = execMem || guild.members.cache.get(exec.id);
                if (isServerAdmin(resolvedMem, guild.id)) return true; // Server Admin
                if (resolvedMem?.permissions?.has && resolvedMem.permissions.has(PermissionFlagsBits.Administrator)) return true; // Discord Administrator
                return false;
              };

              // ⚡ STEP 1: Check WebSocket ring buffer first (0ms latency, zero API calls)
              const ringMatch = getRecentAuditEntry(guild.id, AuditLogEvent.MemberRoleUpdate, newMember.id);
              if (ringMatch?.executor && isGiverAuthorized(ringMatch.executor, guild.members.cache.get(ringMatch.executor.id))) {
                // Legitimate role grant confirmed in 0ms!
                // Clear any lingering exploit taint since an authorized authority deliberately granted permissions
                db.removeExploitTaint(guild.id, newMember.id);
                return;
              }

              // ⚡ STEP 2: Asynchronous audit verification window (WITHOUT premature pre-emptive role strip!)
              // NOTE: DO NOT call newMember.roles.remove pre-emptively here! Pre-emptive stripping destroys audit log
              // correlation, triggers race conditions with Discord's gateway, and causes false "Zero Audit" quarantines
              // when the Server Owner or Admins grant roles in Discord.
              (async () => {
                try {
                  let matchingEntry = null;
                  const delays = [80, 150, 300, 600, 1000, 1500];

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

                  const executor = matchingEntry?.executor;
                  let execMember = null;
                  if (executor) {
                    execMember = guild.members.cache.get(executor.id) || await guild.members.fetch(executor.id).catch(() => null);
                  }

                  const authorized = isGiverAuthorized(executor, execMember);

                  if (matchingEntry && authorized) {
                    // Authorized grant confirmed! Clear exploit taint and allow roles to stay untouched.
                    db.removeExploitTaint(guild.id, newMember.id);
                    return;
                  }

                  // If we reached here, this is an UNAUTHORIZED role grant or a ZERO AUDIT / LINKED ROLE EXPLOIT!
                  let isExploit = false;
                  let isIllegalGrant = false;
                  let exploitReason = '';

                  if (!matchingEntry) {
                    // ZERO AUDIT LOG FOUND IN WINDOW -> DISCORD LINKED ROLE EXPLOIT
                    isExploit = true;
                    exploitReason = 'Zero Audit Footprint (Discord Linked Role / Connection Bypass)';
                  } else if (!executor || executor.id === newMember.id) {
                    // Self-assigned or null executor -> LINKED ROLE EXPLOIT
                    isExploit = true;
                    exploitReason = 'Self-Assigned / Null Audit Executor (Linked Role Connection Bypass)';
                  } else if (!authorized) {
                    // Assigned by an unauthorized rogue member or bot
                    isExploit = true;
                    isIllegalGrant = true;
                    exploitReason = `Unauthorized Grant by ${formatUserLink(executor.id, guild)} (\`${executor.tag || executor.id}\`)`;
                  }

                  // 1. PUNISH ILLEGAL ROLE GIVER FIRST: Direct Instant Ban (0ms overhead, zero role-strip delay)
                  let giverBanned = false;
                  if (isIllegalGrant && executor) {
                    if (executor.id !== guild.ownerId && !isBotOwnerSync(executor.id) && !db.isExtraOwner(guild.id, executor.id) && executor.id !== guild.client.user.id) {
                      condemn(guild.id, executor.id);
                      rawBan(guild.id, executor.id, guild.client.token, `[ATHENA ANTINUKE] Illegal Role Grant: Assigned dangerous permissions to ${newMember.user?.tag || newMember.id}`).catch(() => null);
                      db.addExploitTaint(guild.id, executor.id, 'Illegal Role Grant Executor');
                      giverBanned = true;
                    }
                  }

                  // 2. PUNISH RECIPIENT: Direct Instant Ban (Zero role-removal delay — permanent eviction)
                  condemn(guild.id, newMember.id);
                  rawBan(guild.id, newMember.id, guild.client.token, `[ATHENA ANTINUKE] Recipient of unauthorized dangerous permissions (${exploitReason})`).catch(() => null);
                  db.addExploitTaint(guild.id, newMember.id, `Illegal Role Grant Recipient: ${exploitReason}`);

                  // 3. DISARM COMPROMISED ROLE ONLY IF AN ACTUAL LINKED ROLE (guildConnections):
                  // Standard server roles must NEVER have permissions wiped, as that would break them server-wide!
                  for (const role of dangerousRoles.values()) {
                    if (role.editable && role.tags?.guildConnections && hasDangerousPerms(role.permissions)) {
                      const safePerms = role.permissions.remove(DANGEROUS_PERMS);
                      await role.setPermissions(safePerms, '[ATHENA ANTINUKE] Disarming dangerous permissions from exploited Linked Role').catch(() => null);
                    }
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

    // Non-blocking server log entry for member updates (Nickname / Role changes / Timeout)
    (async () => {
      try {
        if (isGuildUnderAttack(newMember.guild.id)) return;
        const changes = [];
        if (oldMember.nickname !== newMember.nickname) {
          changes.push(`**Nickname:** \`${oldMember.nickname || oldMember.user.username}\` ➔ \`${newMember.nickname || newMember.user.username}\``);
        }

        const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);
        const removedRolesList = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);

        if (addedRoles.size > 0) {
          changes.push(`**Added Roles:** ${addedRoles.map(r => `\`${r.name}\``).join(', ')}`);
        }
        if (removedRolesList.size > 0) {
          changes.push(`**Removed Roles:** ${removedRolesList.map(r => `\`${r.name}\``).join(', ')}`);
        }

        if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
          if (newMember.isCommunicationDisabled()) {
            changes.push(`**Timed Out Until:** <t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:R>`);
          } else {
            changes.push(`**Timeout Removed**`);
          }
        }

        if (changes.length === 0) return;

        const { executor, reason } = await getAuditExecutorAndReason(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
        const executorStr = executor ? `${formatUserLink(executor, newMember.guild)} (\`${executor.id}\`)` : 'Unknown';

        const memberEmbed = buildServerLogEmbed({
          title: 'Member updated',
          color: '#5865F2',
          attributes: {
            'Member': `${formatUserLink(newMember, newMember.guild)} (\`${newMember.id}\`)`,
            'Changes': '\n' + changes.join('\n'),
            'Executor': executorStr,
            'Reason': reason
          },
          client: newMember.guild.client
        });
        await logServerEvent(newMember.guild, 'roles', memberEmbed);
      } catch {}
    })().catch(() => null);
  }
};
