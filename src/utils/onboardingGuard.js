import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI } from './emojis.js';
import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import db from '../database.js';
import { logToSecurityChannel, isBotOwnerSync } from './helpers.js';

export const CRITICAL_ONBOARDING_PERMS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ModerateMembers
];

/**
 * Checks if a set of permissions contains any critical dangerous permissions.
 */
export function hasCriticalOnboardingPerms(permissions) {
  if (!permissions) return false;
  return CRITICAL_ONBOARDING_PERMS.some(p => permissions.has(p));
}

/**
 * Get readable list of dangerous permission names.
 */
export function getDangerousPermNames(permissions) {
  if (!permissions) return [];
  const list = [];
  const nameMap = {
    Administrator: 'Administrator',
    ManageGuild: 'Manage Server',
    ManageRoles: 'Manage Roles',
    BanMembers: 'Ban Members',
    KickMembers: 'Kick Members',
    ManageChannels: 'Manage Channels',
    ManageWebhooks: 'Manage Webhooks',
    MentionEveryone: 'Mention Everyone',
    ManageMessages: 'Manage Messages',
    ModerateMembers: 'Timeout Members'
  };

  for (const [key, perm] of Object.entries(PermissionFlagsBits)) {
    if (CRITICAL_ONBOARDING_PERMS.includes(perm) && permissions.has(perm)) {
      list.push(nameMap[key] || key);
    }
  }
  return list;
}

/**
 * Helper to safely extract role IDs from an option
 */
function extractRoleIds(option) {
  if (!option) return [];
  if (option.roles?.keys) {
    return [...option.roles.keys()];
  }
  if (Array.isArray(option.roleIds)) {
    return option.roleIds;
  }
  if (Array.isArray(option.roles)) {
    return option.roles.map(r => (typeof r === 'string' ? r : r.id)).filter(Boolean);
  }
  return [];
}

/**
 * Helper to safely extract channel IDs from an option
 */
function extractChannelIds(option) {
  if (!option) return [];
  if (option.channels?.keys) {
    return [...option.channels.keys()];
  }
  if (Array.isArray(option.channelIds)) {
    return option.channelIds;
  }
  if (Array.isArray(option.channels)) {
    return option.channels.map(c => (typeof c === 'string' ? c : c.id)).filter(Boolean);
  }
  return [];
}

/**
 * Actively scans Discord Onboarding configuration for dangerous roles and neutralizes them immediately.
 * 1. Strips dangerous permissions (Admin, Manage Server, Manage Roles, Ban, etc.) from the role.
 * 2. Edits the Onboarding prompts to remove the dangerous role from prompt options.
 * 3. Strips the role from any non-privileged members who received it and isolates them.
 * 4. Logs to the security channel and alerts the server owner.
 */
export async function auditAndNeutralizeOnboarding(guild, options = {}) {
  const { quiet = false, reason = 'Automated Security Sentinel' } = options;
  if (!guild || !guild.members?.me) return { success: false, reason: 'Invalid guild or bot member' };

  try {
    const onboarding = await guild.fetchOnboarding().catch(() => null);
    if (!onboarding) {
      return { success: true, onboardingActive: false, neutralizedCount: 0, roles: [] };
    }

    const authRoles = db.getAuthRoles(guild.id);
    const dangerousRoleMap = new Map();

    const rawPrompts = onboarding.prompts?.values 
      ? [...onboarding.prompts.values()] 
      : (Array.isArray(onboarding.prompts) ? onboarding.prompts : []);

    // 1. Audit all prompts and options
    for (const prompt of rawPrompts) {
      const rawOptions = prompt.options?.values 
        ? [...prompt.options.values()] 
        : (Array.isArray(prompt.options) ? prompt.options : []);

      for (const opt of rawOptions) {
        const roleIds = extractRoleIds(opt);
        for (const roleId of roleIds) {
          const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
          if (!role) continue;

          const isDangerous = hasCriticalOnboardingPerms(role.permissions) || 
                              (authRoles?.admin && authRoles.admin.includes(role.id));

          if (isDangerous) {
            if (!dangerousRoleMap.has(role.id)) {
              dangerousRoleMap.set(role.id, {
                role,
                permsList: getDangerousPermNames(role.permissions),
                promptTitles: [prompt.title]
              });
            } else {
              const entry = dangerousRoleMap.get(role.id);
              if (!entry.promptTitles.includes(prompt.title)) entry.promptTitles.push(prompt.title);
            }
          }
        }
      }
    }

    if (dangerousRoleMap.size === 0) {
      return { success: true, onboardingActive: true, neutralizedCount: 0, roles: [] };
    }

    const neutralizedList = [];
    const dangerousRoleIds = new Set(dangerousRoleMap.keys());
    const config = db.getGuildConfig(guild.id);

    // 2. Disarm dangerous permissions from the roles themselves
    for (const [roleId, data] of dangerousRoleMap) {
      const { role, permsList, promptTitles } = data;
      let disarmed = false;
      let strippedMembersCount = 0;
      let quarantinedCount = 0;

      if (role.editable && hasCriticalOnboardingPerms(role.permissions)) {
        const safePerms = role.permissions.remove(CRITICAL_ONBOARDING_PERMS);
        await role.setPermissions(safePerms, `[ATHENA ANTINUKE] Neutralized dangerous permissions from Onboarding role: ${reason}`).catch(() => null);
        disarmed = true;
      }

      // Strip this dangerous role from any members who acquired it (except Owner / Extra Owners / Bot Owner)
      for (const member of role.members.values()) {
        if (member.id === guild.ownerId || isBotOwnerSync(member.id) || db.isExtraOwner(guild.id, member.id) || member.user.bot) continue;
        if (member.manageable) {
          await member.roles.remove(role, '[ATHENA ANTINUKE] Stripped dangerous role acquired via Discord Onboarding').catch(() => null);
          strippedMembersCount++;

          // Quarantine unauthorized holder if security is active
          if (config?.securityEnabled || config?.antiNukeEnabled) {
            try {
              const { executeQuarantine } = await import('../commands/security.js');
              await executeQuarantine(guild, member, guild.members.me, `Athena Anti-Nuke: Acquired dangerous role (${role.name}) via Discord Onboarding`).catch(() => null);
              quarantinedCount++;
            } catch {}
          }
        }
      }

      neutralizedList.push({
        id: role.id,
        name: role.name,
        perms: permsList,
        prompts: promptTitles,
        disarmed,
        strippedMembersCount,
        quarantinedCount
      });
    }

    // 3. Edit Onboarding via REST to scrub dangerous roles from prompt options
    if (guild.members.me.permissions.has(PermissionFlagsBits.ManageGuild)) {
      try {
        const sanitizedPrompts = rawPrompts.map(prompt => {
          const rawOptions = prompt.options?.values 
            ? [...prompt.options.values()] 
            : (Array.isArray(prompt.options) ? prompt.options : []);

          return {
            id: prompt.id,
            title: prompt.title,
            singleSelect: prompt.singleSelect,
            required: prompt.required,
            inOnboarding: prompt.inOnboarding,
            type: prompt.type,
            options: rawOptions.map(option => {
              const roleIds = extractRoleIds(option);
              const channelIds = extractChannelIds(option);
              const safeRoleIds = roleIds.filter(id => !dangerousRoleIds.has(id));

              return {
                id: option.id,
                title: option.title,
                description: option.description,
                emoji: option.emoji,
                channels: channelIds,
                roles: safeRoleIds
              };
            })
          };
        });

        const defaultChannelIds = onboarding.defaultChannels?.keys 
          ? [...onboarding.defaultChannels.keys()] 
          : (Array.isArray(onboarding.defaultChannelIds) ? onboarding.defaultChannelIds : []);

        await guild.editOnboarding({
          prompts: sanitizedPrompts,
          defaultChannels: defaultChannelIds,
          enabled: onboarding.enabled,
          mode: onboarding.mode,
          reason: `[ATHENA ANTINUKE] Scrubbed dangerous roles (${[...dangerousRoleIds].join(', ')}) from Onboarding prompts`
        }).catch(err => {
          console.warn(`[OnboardingGuard] editOnboarding call rejected in ${guild.id}:`, err.message);
        });
      } catch (err) {
        console.warn(`[OnboardingGuard] Failed to scrub roles from Onboarding prompts in ${guild.id}:`, err.message);
      }
    }

    // 4. Send Security Alert Embed & DM Server Owner
    if (!quiet) {
      const roleSummaries = neutralizedList.map(r => 
        `• <@&${r.id}> (\`${r.name}\` | \`${r.id}\`)\n` +
        `  - **__Prompts:__** \`${r.prompts.join(', ') || 'Default'}\`\n` +
        `  - **__Revoked Permissions:__** \`${r.perms.join(', ') || 'Administrator / Elevated'}\`\n` +
        `  - **__Neutralized Members:__** \`${r.strippedMembersCount}\` members stripped | \`${r.quarantinedCount}\` isolated`
      ).join('\n\n');

      const alertContainer = {
        type: 17,
        components: [
          {
            type: 10,
            content: `# ${getRandomHeadingGlyph()} Discord Onboarding Exploit Neutralized | <a:03_tick_circle:1565665642084827206>`
          },
          { type: 14, divider: true },
          {
            type: 10,
            content:
              `> -# **__Incident Classification:__** \`Discord Onboarding Dangerous Role Vector\`\n` +
              `> -# **__Trigger Event:__** \`${reason}\`\n\n` +
              `> -# **__Neutralized Onboarding Roles:__**\n${roleSummaries}\n\n` +
              `> -# **__Countermeasures Applied:__**\n` +
              `-# • **__Role Permissions Disarmed:__** All Administrator, Manage Server, Manage Roles, and Ban/Kick privileges removed.\n` +
              `-# • **__Onboarding Configuration Scrubbed:__** Roles excised from public prompt options.\n` +
              `-# • **__Member Access Revoked:__** Unauthorized holders stripped of the role and quarantined immediately.`
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# **Athena Prime Bulletproof Security System • Onboarding Sentinel Active**`
          }
        ]
      };

      await logToSecurityChannel(guild, alertContainer);

      // DM Server Owner
      try {
        const owner = await guild.members.fetch(guild.ownerId).catch(() => null);
        if (owner) {
          await owner.send({ components: [alertContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        }
      } catch {}
    }

    return {
      success: true,
      onboardingActive: true,
      neutralizedCount: neutralizedList.length,
      roles: neutralizedList
    };
  } catch (error) {
    console.error(`[OnboardingGuard] Error auditing onboarding in ${guild.id}:`, error);
    return { success: false, error: error.message };
  }
}
