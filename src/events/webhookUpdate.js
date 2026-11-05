import { AuditLogEvent } from 'discord.js';
import db from '../database.js';
import { directStrike, rawDeleteWebhook, rawRoleStrip, rawBan, isAuthorized, condemn } from '../utils/antinuke.js';

export default {
  name: 'webhooksUpdate',
  async execute(channel) {
    if (!channel.guild) return;
    const guild = channel.guild;
    const config = db.getGuildConfig(guild.id);
    if (!config?.securityEnabled && !config?.antiNukeEnabled) return;
    if (config?.antinukeModules?.antiWebhooks === false) return;

    try {
      // 1. Fetch channel's current webhooks with 0ms delay
      const webhooks = await channel.fetchWebhooks().catch(() => null);
      if (!webhooks || webhooks.size === 0) return;

      const now = Date.now();
      const token = guild.client.token;

      // Check any newly created webhook (created within the last 60 seconds)
      const newWebhooks = webhooks.filter(w => now - w.createdTimestamp < 60000);

      for (const [whId, webhook] of newWebhooks) {
        const owner = webhook.owner;

        // If owner is known and unauthorized: ZERO TOLERANCE (THRESHOLD = 1)
        if (owner) {
          if (isAuthorized(guild, owner, 'antiwebhooks')) continue;

          // ⚡ Rogue webhook detected! Parallel Dual-Strike FIRST (Ban + Role Strip + Webhook Delete in sub-1ms)
          condemn(guild.id, owner.id);
          
          Promise.allSettled([
            rawDeleteWebhook(whId, token, '[ATHENA SENTINEL] Rogue Webhook Neutralized'),
            rawBan(guild.id, owner.id, token, '[ATHENA SENTINEL] Unauthorized Webhook Creation'),
            rawRoleStrip(guild.id, owner.id, token)
          ]).catch(() => null);

          // Trigger directStrike for server log, quarantine fallback, and owner DM
          directStrike(
            guild,
            AuditLogEvent.WebhookCreate,
            'Unauthorized Webhook Creation',
            whId,
            async () => {
              await rawDeleteWebhook(whId, token).catch(() => null);
            }
          ).catch(() => null);
        } else {
          // Owner unknown (e.g. lack of audit permissions) — immediately eliminate rogue webhook
          await rawDeleteWebhook(whId, token, '[ATHENA SENTINEL] Unverified Rogue Webhook Neutralized').catch(() => null);

          directStrike(
            guild,
            AuditLogEvent.WebhookCreate,
            'Unauthorized Webhook Creation',
            whId,
            async () => {
              await rawDeleteWebhook(whId, token).catch(() => null);
            }
          ).catch(() => null);
        }
      }
    } catch (err) {
      console.error('[Antinuke] Webhook Wiretap error:', err);
    }
  }
};
