import { AuditLogEvent } from 'discord.js';
import db from '../database.js';
import { directStrike, isGuildUnderAttack, dispatcher } from '../utils/antinuke.js';

export default {
  name: 'guildUpdate',
  async execute(oldGuild, newGuild) {
    if (!newGuild) return;

    const config = db.getGuildConfig(newGuild.id);
    if (!config.securityEnabled && !(config.antiNukeEnabled && config.antinukeModules?.antiServerUpdate !== false)) {
      return;
    }

    // 1. Vanity URL Sniping Protection
    if (oldGuild.vanityURLCode && newGuild.vanityURLCode !== oldGuild.vanityURLCode) {
      // Immediately fire raw HTTP request to reclaim vanity URL before sniper bots can get it
      try {
        await fetch(`https://discord.com/api/v10/guilds/${newGuild.id}/vanity-url`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bot ${newGuild.client.token}`,
            'Content-Type': 'application/json',
            'X-Audit-Log-Reason': 'Athena Anti-Nuke: Instant Vanity URL Sniping Protection (Zero-Day Reclaim)'
          },
          body: JSON.stringify({ vanity_url_code: oldGuild.vanityURLCode }),
          dispatcher
        });
      } catch (e) {
        console.error('[Athena Anti-Nuke] Failed to raw reclaim vanity url', e);
      }

      // Strike the offender
      directStrike(
        newGuild,
        AuditLogEvent.GuildUpdate,
        'Server Vanity URL Tampering',
        newGuild.id,
        async () => `Successfully reclaimed Vanity URL **discord.gg/${oldGuild.vanityURLCode}** instantly.`
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

      // If server is actively under attack, revert immediately
      if (isGuildUnderAttack(newGuild.id)) {
        rollbackIdentity().catch(() => null);
      }

      // Direct Strike verifies audit log executor: authorized admins are untouched, hostiles neutralized
      directStrike(
        newGuild,
        AuditLogEvent.GuildUpdate,
        'Server Settings Tampering',
        newGuild.id,
        rollbackIdentity
      ).catch(() => null);
    }
  }
};
