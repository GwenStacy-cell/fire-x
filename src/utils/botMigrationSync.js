import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import db from '../database.js';
import {
  FIREWALL_ROLE_NAME,
  UNBYPASSABLE_ROLE_NAME,
  ensureUnbypassableRole,
  removePersistenceRoles
} from './antiStrip.js';
import {
  formatChannelLink,
  formatUserLink,
  logToSecurityChannel,
  pruneDuplicateSecurityLogChannels
} from './helpers.js';
import { isPinterestUrl, resolveMediaUrl } from './pinterest.js';
import {
  BULLET_EMOJI,
  getRandomHeadingGlyph,
  TICK_EMOJI,
  UPTIME_EMOJI,
  WARN_EMOJI
} from './emojis.js';

const inFlightMigrations = new Map();

/**
 * Fetches an external/CDN image URL or MP4 video and returns Buffer + contentType + Data URI.
 */
export async function fetchMediaAsBuffer(url) {
  let targetUrl = url;
  if (targetUrl && isPinterestUrl(targetUrl)) {
    targetUrl = await resolveMediaUrl(targetUrl);
  }
  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`HTTP fetch failed with status: ${response.status} ${response.statusText}`);
    }
    let contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

    if (contentType.includes('video/mp4') || String(url).toLowerCase().includes('.mp4')) {
      const tempId = Math.random().toString(36).substring(2, 15);
      const tempMp4Path = path.join(os.tmpdir(), `athena_in_${tempId}.mp4`);
      const tempGifPath = path.join(os.tmpdir(), `athena_out_${tempId}.gif`);

      await fs.writeFile(tempMp4Path, buffer);

      await new Promise((resolve, reject) => {
        ffmpeg(tempMp4Path)
          .outputOptions([
            '-vf', 'fps=20,scale=min(iw\\,600):-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
            '-loop', '0',
            '-t', '15'
          ])
          .toFormat('gif')
          .on('end', resolve)
          .on('error', (err) => reject(new Error(`FFmpeg conversion failed: ${err.message}`)))
          .save(tempGifPath);
      });

      buffer = await fs.readFile(tempGifPath);
      contentType = 'image/gif';

      await fs.unlink(tempMp4Path).catch(() => null);
      await fs.unlink(tempGifPath).catch(() => null);
    }

    return {
      buffer,
      contentType,
      dataUri: `data:${contentType};base64,${buffer.toString('base64')}`
    };
  } catch (error) {
    throw new Error(`Failed to resolve image buffer from media link: ${error.message}`);
  }
}

/**
 * Finds the already-existing security logs channel in the guild via DB ID first (or single fallback adoption)
 * and ensures the current bot can view and post inside it.
 */
export async function resolveAndPrepareSecurityLogChannel(guild, client) {
  if (!guild) return null;
  const cfg = db.getGuildConfig(guild.id);
  const logChId = cfg.securityLogChannelId || cfg.logChannel;
  let channel = null;

  if (logChId && guild.channels) {
    channel = guild.channels.cache?.get?.(logChId)
      || await guild.channels.fetch?.(logChId).catch(() => null);
  }

  if (!channel) {
    channel = await pruneDuplicateSecurityLogChannels(guild).catch(() => null);
  }

  if (channel && client?.user?.id && channel.permissionOverwrites?.edit) {
    const me = guild.members?.me;
    const canManagePerms = me?.permissions?.has?.(PermissionFlagsBits.Administrator)
      || me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)
      || me?.permissions?.has?.(PermissionFlagsBits.ManageChannels);
    if (canManagePerms) {
      await channel.permissionOverwrites.edit(client.user.id, {
        ViewChannel: true,
        SendMessages: true,
        EmbedLinks: true,
        AttachFiles: true,
        ReadMessageHistory: true
      }).catch(() => null);
    }
  }

  return channel || null;
}

/**
 * Discovers candidate IDs of the previous Athena Prime bot in the guild so we can clone
 * its server-specific avatar and banner if it is still present during migration.
 */
async function findPreviousBotIds(guild, client, cfg, existingLogChannel) {
  const candidates = new Set();
  const selfId = client?.user?.id;

  if (cfg.sentinelBotId && cfg.sentinelBotId !== selfId) candidates.add(cfg.sentinelBotId);
  if (cfg.guildProfileBotId && cfg.guildProfileBotId !== selfId) candidates.add(cfg.guildProfileBotId);
  if (process.env.OLD_BOT_ID && process.env.OLD_BOT_ID !== selfId) candidates.add(process.env.OLD_BOT_ID);

  for (const role of guild.roles?.cache?.values?.() || []) {
    if (role.managed && role.tags?.botId && role.tags.botId !== selfId && /athena/i.test(role.name)) {
      candidates.add(role.tags.botId);
    }
  }

  for (const ch of [existingLogChannel, guild.channels?.cache?.get?.(cfg.dashboardChannelId)].filter(Boolean)) {
    if (typeof ch.messages?.fetch !== 'function') continue;
    const msgs = await ch.messages.fetch({ limit: 15 }).catch(() => null);
    if (!msgs) continue;
    for (const msg of msgs.values()) {
      if (msg.author?.bot && msg.author.id !== selfId && /athena/i.test(msg.author.username || '')) {
        candidates.add(msg.author.id);
      }
    }
  }

  return [...candidates];
}

/**
 * Automatically clones or restores the server-specific bot avatar & banner onto the new bot.
 * Supports:
 * 1) Persisted guildBotAvatarUrl / guildBotBannerUrl (from !setguildavatar / !setguildbanner)
 * 2) Live cloning the old Athena bot's guild member avatar & banner if still present in guild
 * 3) Optional fallback asset hashes or env defaults (DEFAULT_GUILD_BOT_AVATAR / DEFAULT_GUILD_BOT_BANNER)
 */
export async function syncGuildBotProfile(guild, client, existingLogChannel = null) {
  const result = {
    avatarUpdated: false,
    bannerUpdated: false,
    source: null,
    errors: []
  };

  if (!guild || !client?.rest || !client?.user?.id) return result;
  const cfg = db.getGuildConfig(guild.id);
  if (cfg.guildProfileBotId === client.user.id) {
    return { ...result, alreadySynced: true };
  }

  let avatarSourceUrl = cfg.guildBotAvatarUrl || cfg.guildBotAvatarCdnUrl || null;
  let bannerSourceUrl = cfg.guildBotBannerUrl || cfg.guildBotBannerCdnUrl || null;

  // Try live cloning from the old bot member while it is still present in the server
  const oldBotIds = await findPreviousBotIds(guild, client, cfg, existingLogChannel);
  for (const oldBotId of oldBotIds) {
    if (avatarSourceUrl && bannerSourceUrl) break;
    const oldMember = await client.rest.get(`/guilds/${guild.id}/members/${oldBotId}`).catch(() => null);
    if (!oldMember) continue;

    if (!avatarSourceUrl && oldMember.avatar) {
      const ext = oldMember.avatar.startsWith('a_') ? 'gif' : 'png';
      avatarSourceUrl = `https://cdn.discordapp.com/guilds/${guild.id}/users/${oldBotId}/avatars/${oldMember.avatar}.${ext}?size=1024`;
      result.source = 'cloned_from_old_bot';
    }
    if (!bannerSourceUrl && oldMember.banner) {
      const ext = oldMember.banner.startsWith('a_') ? 'gif' : 'png';
      bannerSourceUrl = `https://cdn.discordapp.com/guilds/${guild.id}/users/${oldBotId}/banners/${oldMember.banner}.${ext}?size=1024`;
      result.source = 'cloned_from_old_bot';
    }
  }

  if (!avatarSourceUrl && process.env.DEFAULT_GUILD_BOT_AVATAR) {
    avatarSourceUrl = process.env.DEFAULT_GUILD_BOT_AVATAR;
  }
  if (!bannerSourceUrl && process.env.DEFAULT_GUILD_BOT_BANNER) {
    bannerSourceUrl = process.env.DEFAULT_GUILD_BOT_BANNER;
  }

  const patchBody = {};
  const dbUpdates = {};

  if (avatarSourceUrl) {
    try {
      const { dataUri } = await fetchMediaAsBuffer(avatarSourceUrl);
      patchBody.avatar = dataUri;
    } catch (err) {
      result.errors.push(`Avatar resolve: ${err.message}`);
    }
  }

  if (bannerSourceUrl) {
    try {
      const { dataUri } = await fetchMediaAsBuffer(bannerSourceUrl);
      patchBody.banner = dataUri;
    } catch (err) {
      result.errors.push(`Banner resolve: ${err.message}`);
    }
  }

  if (Object.keys(patchBody).length > 0) {
    try {
      const patched = await client.rest.patch(`/guilds/${guild.id}/members/@me`, { body: patchBody });
      if (patchBody.avatar) {
        result.avatarUpdated = true;
        if (!result.source) result.source = 'database_saved';
        if (patched?.avatar) {
          const ext = patched.avatar.startsWith('a_') ? 'gif' : 'png';
          dbUpdates.guildBotAvatarCdnUrl = `https://cdn.discordapp.com/guilds/${guild.id}/users/${client.user.id}/avatars/${patched.avatar}.${ext}?size=1024`;
        }
      }
      if (patchBody.banner) {
        result.bannerUpdated = true;
        if (!result.source) result.source = 'database_saved';
        if (patched?.banner) {
          const ext = patched.banner.startsWith('a_') ? 'gif' : 'png';
          dbUpdates.guildBotBannerCdnUrl = `https://cdn.discordapp.com/guilds/${guild.id}/users/${client.user.id}/banners/${patched.banner}.${ext}?size=1024`;
        }
      }
      dbUpdates.guildProfileBotId = client.user.id;
    } catch (err) {
      result.errors.push(`Discord profile patch: ${err.message}`);
    }
  } else if (oldBotIds.length > 0 || avatarSourceUrl === null) {
    // Mark attempted only when old bot wasn't missing due to API error
    dbUpdates.guildProfileBotId = client.user.id;
  }

  if (Object.keys(dbUpdates).length > 0) {
    db.updateGuildConfig(guild.id, dbUpdates);
  }

  return result;
}

/**
 * Deletes ONLY old Athena Prime secondary (Athena Firewall) & hidden (Athena Unbypassable) roles,
 * creates fresh ones, and self-assigns them — strictly ONLY when security is enabled AND Athena is Top 3.
 * Updates existing security logs channel & DMs Server Owner on status.
 */
export async function syncBotMigrationForGuild(guild, client, options = {}) {
  if (!guild?.id || !client?.user?.id) return null;
  if (inFlightMigrations.has(guild.id)) {
    return await inFlightMigrations.get(guild.id);
  }

  const runPromise = (async () => {
    const cfg = db.getGuildConfig(guild.id);
    const isSecurityEnabled = Boolean(cfg.securityEnabled && cfg.antiNukeEnabled);

    // 1. Always preserve & prepare existing security logs channel first
    const existingLogChannel = await resolveAndPrepareSecurityLogChannel(guild, client);

    // 2. Automatically sync/clone server-specific bot avatar & banner
    const profileResult = await syncGuildBotProfile(guild, client, existingLogChannel);

    if (!isSecurityEnabled) {
      await removePersistenceRoles(guild).catch(() => null);
      return {
        isSecurityEnabled: false,
        profileResult,
        sentinelAction: 'idle_removed'
      };
    }

    // 3. Check exact Top 3 hierarchy gate cleanly against fetched roles
    await guild.roles?.fetch?.().catch(() => null);
    const me = guild.members?.me
      || (guild.members?.fetchMe ? await guild.members.fetchMe().catch(() => null) : null);
    if (me?.fetch) await me.fetch(true).catch(() => null);

    const roleValues = [...(guild.roles?.cache?.values?.() || [])];
    const maxPos = roleValues.length > 0 ? Math.max(...roleValues.map(r => r.position || 0), 1) : 1;
    const botPos = me?.roles?.highest?.position ?? 0;
    const requiredMinPos = Math.max(1, maxPos - 2);
    const isTop3 = botPos >= requiredMinPos;

    // Already migrated for THIS bot ID and roles intact -> skip destructive rebuild/DM spam
    const alreadyOwned = cfg.sentinelBotId === client.user.id
      && cfg.firewallRoleId
      && cfg.unbypassableRoleId
      && guild.roles?.cache?.has?.(cfg.firewallRoleId)
      && guild.roles?.cache?.has?.(cfg.unbypassableRoleId)
      && me?.roles?.cache?.has?.(cfg.firewallRoleId)
      && me?.roles?.cache?.has?.(cfg.unbypassableRoleId);

    if (alreadyOwned) {
      await ensureUnbypassableRole(guild, { force: true }).catch(() => null);
      return {
        isSecurityEnabled: true,
        isTop3,
        botPos,
        maxPos,
        profileResult,
        sentinelAction: 'already_migrated'
      };
    }

    let sentinelAction = 'skipped_not_top3';
    const deletedRoles = [];
    const blockedRoles = [];
    let createdRoles = null;

    if (isTop3) {
      // Strictly collect ONLY old Athena Secondary (Athena Firewall) & Hidden (Athena Unbypassable) roles
      const oldSentinelRoles = [];
      for (const role of guild.roles?.cache?.values?.() || []) {
        if (!role || role.managed || role.id === guild.id) continue;
        const lowerName = String(role.name || '').toLowerCase();
        if (lowerName === FIREWALL_ROLE_NAME.toLowerCase() || lowerName === UNBYPASSABLE_ROLE_NAME.toLowerCase()) {
          oldSentinelRoles.push(role);
        }
      }

      // Delete ONLY old secondary & hidden sentinel roles (never primary/integration role!)
      for (const role of oldSentinelRoles) {
        const canEdit = role.editable !== undefined ? role.editable : (role.position < botPos);
        if (canEdit && typeof role.delete === 'function') {
          const ok = await role.delete('Athena Prime Migration: Removing old secondary/hidden sentinel role')
            .then(() => true)
            .catch(() => false);
          if (ok) {
            deletedRoles.push(`${role.name} (${role.id})`);
          } else {
            blockedRoles.push(`${role.name} (${role.id})`);
          }
        } else {
          blockedRoles.push(`${role.name} (${role.id} — above bot Pos ${botPos})`);
        }
      }

      // Clear stale IDs before creating and self-assigning fresh sentinels
      db.updateGuildConfig(guild.id, {
        firewallRoleId: null,
        unbypassableRoleId: null,
        athenFirewallRoleId: null,
        athenaUnbypassableRoleId: null
      });

      createdRoles = await ensureUnbypassableRole(guild, { force: true }).catch(() => null);
      if (createdRoles?.firewallRole || createdRoles?.unbypassableRole) {
        db.updateGuildConfig(guild.id, {
          sentinelBotId: blockedRoles.length === 0 ? client.user.id : null
        });
        sentinelAction = 'replaced_and_assigned';
      } else {
        sentinelAction = 'creation_failed';
      }
    }

    const notifyKey = `${client.user.id}:${isTop3 ? 'synced' : 'top3_blocked'}`;
    const shouldNotify = options.notifyOwner !== false && cfg.migrationNotifiedBotId !== notifyKey;
    const logChannelText = existingLogChannel ? formatChannelLink(existingLogChannel, guild) : '`No existing #security-logs channel found`';
    const botLink = formatUserLink(client.user, guild);

    const profileSummary = (profileResult.avatarUpdated || profileResult.bannerUpdated)
      ? `Updated${profileResult.avatarUpdated ? ' Avatar' : ''}${profileResult.avatarUpdated && profileResult.bannerUpdated ? ' &' : ''}${profileResult.bannerUpdated ? ' Banner' : ''}`
      : (profileResult.errors.length > 0 ? `Failed (${profileResult.errors[0]})` : 'No server-specific override cached or on old bot');

    // 4. Update already-existing security logs channel (never create duplicate!)
    const auditCard = {
      type: 17,
      components: [
        {
          type: 10,
          content: `# ${getRandomHeadingGlyph()} Bot Migration & Security Sentinel Sync | ${isTop3 ? TICK_EMOJI : WARN_EMOJI}`
        },
        { type: 14, divider: true },
        {
          type: 10,
          content:
            `> -# ${UPTIME_EMOJI} **Active Security Bot:** ${botLink} (\`${client.user.id}\`)\n` +
            `> -# ${BULLET_EMOJI} **Security Status:** \`ARMED\` | **Role Position:** \`Pos ${botPos} / ${maxPos}\` (${isTop3 ? '**Top 3 Verified**' : `**Below Top 3 — Need >= Pos ${requiredMinPos}**`})\n` +
            `> -# ${BULLET_EMOJI} **Secondary & Hidden Sentinels:** ${
              sentinelAction === 'replaced_and_assigned'
                ? `Deleted \`${deletedRoles.length}\` old -> Created & Self-Assigned ${createdRoles?.firewallRole ? `<@&${createdRoles.firewallRole.id}>` : '`Firewall`'} + ${createdRoles?.unbypassableRole ? `<@&${createdRoles.unbypassableRole.id}>` : '`Unbypassable`'}`
                : '`Skipped replacement — Athena highest role must be in Top 3`'
            }\n` +
            (blockedRoles.length > 0 ? `> -# ${BULLET_EMOJI} **Old Sentinels Above Bot:** ${blockedRoles.join(', ')}\n` : '') +
            `> -# ${BULLET_EMOJI} **Guild Bot Avatar & Banner:** \`${profileSummary}\`\n` +
            `> -# ${BULLET_EMOJI} **Existing Security Logs:** ${logChannelText} (Database-linked & preserved)`
        },
        { type: 14, divider: true },
        {
          type: 10,
          content: `-# **Athena Prime Migration Engine · Zero-Duplication Protocol**`
        }
      ]
    };

    if (existingLogChannel) {
      await logToSecurityChannel(guild, auditCard).catch(() => null);
    }

    // 5. DM the Server Owner when new bot is added (especially Top-3 pass/fail & sentinel sync)
    let dmSent = false;
    if (shouldNotify && guild.ownerId) {
      const ownerUser = await client.users?.fetch?.(guild.ownerId).catch(() => null);
      if (ownerUser) {
        const ownerDmCard = {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} ${isTop3 ? 'Athena Prime Joined & Sentinels Synced' : 'Action Needed: Move Athena to Top 3'} | ${isTop3 ? TICK_EMOJI : WARN_EMOJI}`
            },
            { type: 14, divider: true },
            {
              type: 10,
              content:
                `> -# ${UPTIME_EMOJI} **Server:** \`${guild.name}\` (\`${guild.id}\`)\n` +
                `> -# ${BULLET_EMOJI} **New Bot:** ${botLink} (\`${client.user.id}\`)\n` +
                `> -# ${BULLET_EMOJI} **Security State:** \`ENABLED\` (All MongoDB whitelists, extra owners, triggers, welcome/leave & setups synced)\n` +
                `> -# ${BULLET_EMOJI} **Top 3 Role Check:** \`Pos ${botPos} / ${maxPos}\` (${isTop3 ? '**PASSED**' : `**NOT IN TOP 3 — Need >= Pos ${requiredMinPos}**`})\n\n` +
                (isTop3
                  ? `### Sentinel & Identity Update\n` +
                    `> -# ${BULLET_EMOJI} **Old Secondary & Hidden Sentinels Removed:** \`${deletedRoles.length}\`\n` +
                    `> -# ${BULLET_EMOJI} **New Sentinels Created & Self-Assigned:** \`${FIREWALL_ROLE_NAME}\` & \`${UNBYPASSABLE_ROLE_NAME}\`\n` +
                    (blockedRoles.length > 0 ? `> -# ${BULLET_EMOJI} **Manually Delete Above Bot:** ${blockedRoles.join(', ')}\n` : '') +
                    `> -# ${BULLET_EMOJI} **Server Avatar & Banner:** \`${profileSummary}\`\n` +
                    `> -# ${BULLET_EMOJI} **Security Logs Channel:** ${logChannelText}`
                  : `### Required Action — Role Not in Top 3\n` +
                    `> -# ${BULLET_EMOJI} Security is enabled in **${guild.name}**, but the new bot's highest role (\`Pos ${botPos}\`) is **not in the Top 3 roles** (\`>= Pos ${requiredMinPos}\`).\n` +
                    `> -# ${BULLET_EMOJI} Because of this, old \`${FIREWALL_ROLE_NAME}\` (secondary) and \`${UNBYPASSABLE_ROLE_NAME}\` (hidden) roles were **not** replaced automatically.\n` +
                    `> -# ${BULLET_EMOJI} Please open **Server Settings -> Roles**, drag the new bot's role into the **Top 3** (above old sentinel roles), and run \`!unb deploy\`.`)
            },
            { type: 14, divider: true },
            {
              type: 10,
              content: `-# **Athena Prime Server Owner Notification · Security Sync**`
            }
          ]
        };

        dmSent = await ownerUser.send({ components: [ownerDmCard], flags: MessageFlags.IsComponentsV2 })
          .then(() => true)
          .catch(() => false);
      }
      db.updateGuildConfig(guild.id, { migrationNotifiedBotId: notifyKey });
    }

    return {
      isSecurityEnabled: true,
      isTop3,
      botPos,
      maxPos,
      sentinelAction,
      deletedRoles,
      blockedRoles,
      createdRoles,
      profileResult,
      existingLogChannelId: existingLogChannel?.id || null,
      dmSent
    };
  })();

  inFlightMigrations.set(guild.id, runPromise);
  try {
    return await runPromise;
  } finally {
    inFlightMigrations.delete(guild.id);
  }
}
