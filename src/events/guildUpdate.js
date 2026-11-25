import { AuditLogEvent } from 'discord.js';
import db from '../database.js';
import { directStrike, isGuildUnderAttack, rawVanityReclaim, waitForInFlightPunishments } from '../utils/antinuke.js';
import { buildServerLogEmbed, logServerEvent, getAuditExecutorAndReason, isServerLogModuleEnabled } from '../utils/serverLogger.js';
import { formatUserLink, formatChannelLink } from '../utils/helpers.js';

export default {
  name: 'guildUpdate',
  async execute(oldGuild, newGuild) {
    if (!newGuild) return;

    const config = db.getGuildConfig(newGuild.id);
    if (!config.securityEnabled && !(config.antiNukeEnabled && config.antinukeModules?.antiServerUpdate !== false)) {
      return;
    }

    // 1. Vanity URL Sniping Protection (Ban-First + PATCH /vanity-url { code })
    if (oldGuild.vanityURLCode && newGuild.vanityURLCode !== oldGuild.vanityURLCode && config.antinukeModules?.antiVanitySteal !== false) {
      directStrike(
        newGuild,
        AuditLogEvent.GuildUpdate,
        'Server Vanity URL Tampering',
        newGuild.id,
        async () => {
          await waitForInFlightPunishments(newGuild.id);
          await rawVanityReclaim(
            newGuild.id,
            oldGuild.vanityURLCode,
            newGuild.client.token,
            'Athena Anti-Nuke: Vanity URL Reclaimed'
          );
          return `Successfully reclaimed Vanity URL **discord.gg/${oldGuild.vanityURLCode}**.`;
        }
      ).catch(() => null);
    }

    // 2. Server Identity & Security Settings Rollback Guard
    const nameChanged = oldGuild.name !== newGuild.name;
    const iconChanged = oldGuild.icon !== newGuild.icon;
    const bannerChanged = oldGuild.banner !== newGuild.banner;
    const verifChanged = oldGuild.verificationLevel !== newGuild.verificationLevel;

    if (nameChanged || iconChanged || bannerChanged || verifChanged) {
      const rollbackIdentity = async () => {
        const revertPromises = [];
        if (nameChanged) {
          revertPromises.push(newGuild.setName(oldGuild.name, 'Athena Anti-Nuke: Server Name Restored').catch(() => null));
        }
        if (verifChanged) {
          revertPromises.push(newGuild.setVerificationLevel(oldGuild.verificationLevel, 'Athena Anti-Nuke: Verification Level Restored').catch(() => null));
        }
        if (iconChanged) {
          if (oldGuild.iconURL()) {
            revertPromises.push(newGuild.setIcon(oldGuild.iconURL({ extension: 'png', size: 1024 }), 'Athena Anti-Nuke: Server Icon Restored').catch(() => null));
          } else {
            revertPromises.push(newGuild.setIcon(null, 'Athena Anti-Nuke: Server Icon Restored').catch(() => null));
          }
        }
        if (bannerChanged) {
          if (oldGuild.bannerURL()) {
            revertPromises.push(newGuild.setBanner(oldGuild.bannerURL({ extension: 'png', size: 2048 }), 'Athena Anti-Nuke: Server Banner Restored').catch(() => null));
          } else {
            revertPromises.push(newGuild.setBanner(null, 'Athena Anti-Nuke: Server Banner Restored').catch(() => null));
          }
        }
        await Promise.allSettled(revertPromises);
        return 'Server name, icon, banner, and security verification level restored to baseline.';
      };

      // Direct Strike verifies audit log executor: authorized admins are untouched, hostiles neutralized
      directStrike(
        newGuild,
        AuditLogEvent.GuildUpdate,
        'Server Settings Tampering',
        newGuild.id,
        rollbackIdentity
      ).catch(() => null);
    }

    // 3. Non-blocking server log entry for all server/guild modifications
    (async () => {
      try {
        if (!isServerLogModuleEnabled(newGuild.id, 'server')) return;
        const changes = [];
        if (oldGuild.name !== newGuild.name) changes.push(`**Server Name:** \`${oldGuild.name}\` ➔ \`${newGuild.name}\``);
        if (oldGuild.icon !== newGuild.icon) changes.push(`**Server Icon:** Icon updated`);
        if (oldGuild.banner !== newGuild.banner) changes.push(`**Server Banner:** Banner updated`);
        if (oldGuild.splash !== newGuild.splash) changes.push(`**Invite Splash:** Splash updated`);
        if (oldGuild.afkChannelId !== newGuild.afkChannelId) {
          const oldAfk = oldGuild.afkChannelId ? formatChannelLink(oldGuild.afkChannelId, newGuild) : 'None';
          const newAfk = newGuild.afkChannelId ? formatChannelLink(newGuild.afkChannelId, newGuild) : 'None';
          changes.push(`**AFK Channel:** ${oldAfk} ➔ ${newAfk}`);
        }
        if (oldGuild.afkTimeout !== newGuild.afkTimeout) changes.push(`**AFK Timeout:** \`${oldGuild.afkTimeout / 60}m\` ➔ \`${newGuild.afkTimeout / 60}m\``);
        if (oldGuild.systemChannelId !== newGuild.systemChannelId) {
          const oldSys = oldGuild.systemChannelId ? formatChannelLink(oldGuild.systemChannelId, newGuild) : 'None';
          const newSys = newGuild.systemChannelId ? formatChannelLink(newGuild.systemChannelId, newGuild) : 'None';
          changes.push(`**System Channel:** ${oldSys} ➔ ${newSys}`);
        }
        if (oldGuild.rulesChannelId !== newGuild.rulesChannelId) {
          const oldRules = oldGuild.rulesChannelId ? formatChannelLink(oldGuild.rulesChannelId, newGuild) : 'None';
          const newRules = newGuild.rulesChannelId ? formatChannelLink(newGuild.rulesChannelId, newGuild) : 'None';
          changes.push(`**Rules Channel:** ${oldRules} ➔ ${newRules}`);
        }
        if (oldGuild.verificationLevel !== newGuild.verificationLevel) changes.push(`**Verification Level:** \`${oldGuild.verificationLevel}\` ➔ \`${newGuild.verificationLevel}\``);
        if (oldGuild.defaultMessageNotifications !== newGuild.defaultMessageNotifications) changes.push(`**Default Notifications:** \`${oldGuild.defaultMessageNotifications}\` ➔ \`${newGuild.defaultMessageNotifications}\``);
        if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) changes.push(`**Explicit Content Filter:** \`${oldGuild.explicitContentFilter}\` ➔ \`${newGuild.explicitContentFilter}\``);
        if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) changes.push(`**Vanity Code:** \`${oldGuild.vanityURLCode || 'None'}\` ➔ \`${newGuild.vanityURLCode || 'None'}\``);

        if (changes.length === 0) return;

        const { executor, reason } = await getAuditExecutorAndReason(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
        const executorStr = executor ? `${formatUserLink(executor, newGuild)} (\`${executor.id}\`)` : 'Unknown';

        const updateEmbed = buildServerLogEmbed({
          title: 'Server settings updated',
          color: '#FEE75C',
          attributes: {
            'Server': newGuild.name,
            'ID': `\`${newGuild.id}\``,
            'Changes': '\n' + changes.join('\n'),
            'Executor': executorStr,
            'Reason': reason
          },
          client: newGuild.client
        });
        await logServerEvent(newGuild, 'server', updateEmbed);
      } catch {}
    })().catch(() => null);
  }
};
