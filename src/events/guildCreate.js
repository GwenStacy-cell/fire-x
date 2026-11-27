import { PermissionFlagsBits } from 'discord.js';
import { getRandomHeadingGlyph, TICK_EMOJI, WRONG_EMOJI, BULLET_EMOJI } from '../utils/emojis.js';
import db from '../database.js';
import { setupDashboardChannel } from '../utils/dashboardManager.js';
import { snapshotGuildInfrastructure } from '../utils/antinuke.js';
import { connectToHomeVc } from '../utils/voice.js';
import { syncBotMigrationForGuild } from '../utils/botMigrationSync.js';

/**
 * Hydrates and arms all persisted server configurations immediately upon guild join,
 * so inviting a fresh bot token/account to an existing Mongo-backed server behaves identically to Athena.
 */
export async function hydrateGuildOnJoin(guild, client) {
  if (!guild || !client) return;

  // 1. Immediate RAM ground-truth snapshot
  snapshotGuildInfrastructure(guild);

  // 2. Warm invite cache immediately so invite logs track the first member join after invite
  if (!client.invites) client.invites = new Map();
  guild.invites?.fetch?.().then(invites => {
    if (invites) client.invites.set(guild.id, new Map(invites.map(i => [i.code, i.uses])));
    else if (!client.invites.has(guild.id)) client.invites.set(guild.id, new Map());
  }).catch(() => {
    if (!client.invites.has(guild.id)) client.invites.set(guild.id, new Map());
  });

  // 3. Migrate old secondary/hidden sentinels (ONLY if security enabled & Top 3), update avatar/banner,
  // update existing #security-logs, and DM the Server Owner
  const migrationRes = await syncBotMigrationForGuild(guild, client, { notifyOwner: true }).catch(() => null);

  // 4. Member cache, onboarding guard & live security dashboard when armed
  const cfg = db.getGuildConfig(guild.id);
  if (cfg.securityEnabled && cfg.antiNukeEnabled) {
    import('../utils/onboardingGuard.js')
      .then(({ auditAndNeutralizeOnboarding }) => auditAndNeutralizeOnboarding(guild, { quiet: true, reason: 'Guild Join Sentinel Scan' }))
      .catch(() => null);

    const wlRoles = cfg.whitelist?.roles;
    if ((guild.memberCount && guild.members?.cache?.size < guild.memberCount) || (wlRoles && Object.keys(wlRoles).length > 0)) {
      guild.members?.fetch?.().then(() => snapshotGuildInfrastructure(guild)).catch(() => null);
    }
    await setupDashboardChannel(guild, client).catch(() => null);
  }

  // 4. Instant 24/7 Home VC connection (if configured)
  if (cfg.homeVcId) {
    setTimeout(() => {
      connectToHomeVc(guild, cfg.homeVcId, true).catch(() => null);
    }, 1500).unref?.();
  }

  // 5. Music Player UI, Voice Roles, Server Stats & JTC Lobby Sync
  if (cfg.musicChannelId && cfg.musicMessageId) {
    import('../utils/musicManager.js').then(({ updatePlayerUI }) => updatePlayerUI(guild.id)).catch(() => null);
  }

  const vrId = db.getVoiceRole(guild.id);
  if (vrId) {
    import('../commands/community.js').then(({ syncVoiceRoles }) => syncVoiceRoles(guild, vrId, false)).catch(() => null);
  }

  const serverStatsCfg = db.getServerStats(guild.id);
  if (serverStatsCfg) {
    import('../commands/serverstats.js').then(({ updateServerStatsChannels }) => updateServerStatsChannels(guild, serverStatsCfg)).catch(() => null);
  }

  if (cfg.statsChannelId && guild.roles?.everyone?.id) {
    const ch = guild.channels?.cache?.get?.(cfg.statsChannelId);
    if (ch?.permissionOverwrites?.edit) {
      ch.permissionOverwrites.edit(guild.roles.everyone.id, { UseApplicationCommands: true }).catch(() => null);
    }
  }

  const tieredJtc = db.getTieredJtcConfig(guild.id);
  const jtcCfg = db.getJtcConfig(guild.id);
  if (tieredJtc || jtcCfg?.lobbyChannelId || jtcCfg?.secondaryLobbyChannelId) {
    import('../commands/jtc.js').then(({ syncJtcLobbyStatuses, syncPanel }) => {
      syncJtcLobbyStatuses(guild, { delayMs: 280 }).catch(() => null);
      if (jtcCfg?.lobbyChannelId) syncPanel(guild).catch(() => null);
    }).catch(() => null);
  }

  // 6. MoveProtection audit baseline & active VC/Tag drag session resumption
  if (db.cache.moveProtection?.[guild.id]?.length > 0 && guild.fetchAuditLogs) {
    guild.fetchAuditLogs({ limit: 10, type: 26 }).then(auditLogs => {
      if (!client.auditLogCounts) client.auditLogCounts = new Map();
      auditLogs?.entries?.forEach?.(e => client.auditLogCounts.set(e.id, e.extra?.count || 1));
    }).catch(() => null);
  }

  if (Object.keys(db.getActiveVcDrags()?.[guild.id] || {}).length > 0) {
    import('../commands/vcdrag.js').then(({ restoreActiveVcDrags }) => restoreActiveVcDrags(client)).catch(() => null);
  }
}

export default {
  name: 'guildCreate',
  async execute(guild) {
    if (!guild || !guild.client) return;

    try {
      const client = guild.client;
      let ownerId = process.env.OWNER_ID;

      // Fallback to fetching application owner if not set in .env
      if (!ownerId) {
        const app = await client.application?.fetch?.().catch(() => null);
        if (app && app.owner) {
          ownerId = app.owner.ownerId || app.owner.id;
        }
      }

      if (!ownerId) {
        // Fallback to hardcoded owner if everything else fails
        ownerId = '1423292960744804383';
      }

      const ownerIds = [...new Set([ownerId, process.env.SECOND_OWNER_ID, '1423292960744804383', '1383136323183050974'].filter(Boolean))];
      const owners = [];
      for (const id of ownerIds) {
        const u = await client.users?.fetch?.(id).catch(() => null);
        if (u) owners.push(u);
      }

      // Attempt to find who added the bot
      let addedBy = 'Someone';
      try {
        const { AuditLogEvent } = await import('discord.js');
        const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 });
        const logEntry = auditLogs?.entries?.first?.();
        if (logEntry && logEntry.targetId === client.user?.id) {
          addedBy = `**${logEntry.executor.username}** (\`${logEntry.executor.id}\`)`;
        }
      } catch {
        // Missing View Audit Log permission or log not generated yet
      }

      if (db.isServerBanned(guild.id)) {
        if (owners.length > 0) {
          const glyph = getRandomHeadingGlyph();
          const bannedContainer = {
            type: 17,
            components: [
              {
                type: 10,
                content: `# ${glyph} Banned Server Addition Attempt | ${WRONG_EMOJI}`
              },
              { type: 14, divider: true },
              {
                type: 10,
                content: `${BULLET_EMOJI} ${addedBy} tried to add me to a banned server. I have automatically left it.\n\n-# ${BULLET_EMOJI} **Server Name:** \`${guild.name}\`  \u00b7  **Server ID:** \`${guild.id}\`  \u00b7  **Owner ID:** \`${guild.ownerId}\``
              },
              { type: 14, divider: true },
              {
                type: 10,
                content: '-# **Athena Bulletproof Security System**'
              }
            ]
          };

          for (const owner of owners) {
            await owner.send({ components: [bannedContainer], flags: 32768 }).catch(() => null);
          }
        }
        await guild.leave().catch(() => null);
        return;
      }

      if (owners.length > 0) {
        const glyph = getRandomHeadingGlyph();
        const iconUrl = guild.iconURL?.({ size: 128, extension: 'png' });
        const joinContainer = {
          type: 17,
          components: [
            iconUrl ? {
              type: 9,
              components: [{ type: 10, content: `# ${glyph} New Server Joined | ${TICK_EMOJI}` }],
              accessory: { type: 11, media: { url: iconUrl } }
            } : {
              type: 10,
              content: `# ${glyph} New Server Joined | ${TICK_EMOJI}`
            },
            { type: 14, divider: true },
            {
              type: 10,
              content: `${BULLET_EMOJI} ${addedBy} just added me to a new server.\n\n-# ${BULLET_EMOJI} **Server Name:** \`${guild.name}\`  \u00b7  **Server ID:** \`${guild.id}\`  \u00b7  **Owner ID:** \`${guild.ownerId}\`\n-# ${BULLET_EMOJI} **Member Count:** \`${guild.memberCount}\`  \u00b7  **Channel Count:** \`${guild.channels?.cache?.size ?? 0}\`  \u00b7  **Role Count:** \`${guild.roles?.cache?.size ?? 0}\``
            },
            { type: 14, divider: true },
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 1,
                  label: 'Generate Invite',
                  custom_id: `gen_invite_${guild.id}`
                }
              ]
            },
            { type: 14, divider: true },
            {
              type: 10,
              content: '-# **Athena Prime Server Tracking**'
            }
          ]
        };

        for (const owner of owners) {
          await owner.send({ components: [joinContainer], flags: 32768 }).catch(() => null);
        }
      }

      // Immediately hydrate all persisted server features & protections (security, sentinels, dashboard, invites, homeVC, stats, JTC)
      await hydrateGuildOnJoin(guild, client);
    } catch (err) {
      console.error('Error in guildCreate tracker:', err);
    }
  }
};
