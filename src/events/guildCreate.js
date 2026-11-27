import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getRandomHeadingGlyph, TICK_EMOJI, WRONG_EMOJI, BULLET_EMOJI } from '../utils/emojis.js';
import db from '../database.js';
import { setupDashboardChannel } from '../utils/dashboardManager.js';
import { removePersistenceRoles } from '../utils/antiStrip.js';

export default {
  name: 'guildCreate',
  async execute(guild) {
    if (!guild || !guild.client) return;

    try {

      
      const client = guild.client;
      let ownerId = process.env.OWNER_ID;

      // Fallback to fetching application owner if not set in .env
      if (!ownerId) {
        const app = await client.application.fetch().catch(() => null);
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
        const u = await client.users.fetch(id).catch(() => null);
        if (u) owners.push(u);
      }

      // Attempt to find who added the bot
      let addedBy = "Someone";
      try {
        const { AuditLogEvent } = await import('discord.js');
        const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 });
        const logEntry = auditLogs.entries.first();
        if (logEntry && logEntry.targetId === client.user.id) {
          addedBy = `**${logEntry.executor.username}** (\`${logEntry.executor.id}\`)`;
        }
      } catch (err) {
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
                content: `${BULLET_EMOJI} ${addedBy} tried to add me to a banned server. I have automatically left it.\n\n-# ${BULLET_EMOJI} **Server Name:** \`${guild.name}\`  ·  **Server ID:** \`${guild.id}\`  ·  **Owner ID:** \`${guild.ownerId}\``
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

      if (owners.length === 0) return;

      const glyph = getRandomHeadingGlyph();
      const iconUrl = guild.iconURL({ size: 128, extension: 'png' });
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
            content: `${BULLET_EMOJI} ${addedBy} just added me to a new server.\n\n-# ${BULLET_EMOJI} **Server Name:** \`${guild.name}\`  ·  **Server ID:** \`${guild.id}\`  ·  **Owner ID:** \`${guild.ownerId}\`\n-# ${BULLET_EMOJI} **Member Count:** \`${guild.memberCount}\`  ·  **Channel Count:** \`${guild.channels.cache.size}\`  ·  **Role Count:** \`${guild.roles.cache.size}\``
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

      // Initialize the dashboard if Anti-Nuke is enabled (default is true)
      const cfg = db.getGuildConfig(guild.id);
      if (cfg.securityEnabled && cfg.antiNukeEnabled) {
        await setupDashboardChannel(guild, client).catch(() => null);
      } else {
        await removePersistenceRoles(guild).catch(() => null);
      }

    } catch (err) {
      console.error('Error in guildCreate tracker:', err);
    }
  }
};
