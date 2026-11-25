import { AuditLogEvent } from 'discord.js';
import db from '../database.js';
import { directStrike, rawDeleteWebhook, rawBan, isAuthorized, isCondemned, condemn, setGuildUnderAttack, trackInFlightPunishment, waitForInFlightPunishments, isGuildUnderAttack, handleAuditLogEntry } from '../utils/antinuke.js';
import { buildServerLogEmbed, logServerEvent, getAuditExecutorAndReason, isServerLogModuleEnabled } from '../utils/serverLogger.js';
import { formatUserLink, formatChannelLink } from '../utils/helpers.js';

export default {
  name: 'webhooksUpdate',
  async execute(channel) {
    if (!channel.guild) return;
    const guild = channel.guild;
    const config = db.getGuildConfig(guild.id);
    if (!config?.securityEnabled && !config?.antiNukeEnabled) return;
    if (config?.antinukeModules?.antiWebhooks === false) return;
    // During active attack bursts, Wiretap intercepts WEBHOOKS_UPDATE via warm Undici sockets cleanly without REST contention
    if (isGuildUnderAttack(guild.id)) return;

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

        // If owner is known and unauthorized: ZERO TOLERANCE (BAN FIRST, DELETE WEBHOOK SECOND)
        if (owner) {
          const ownerMember = guild.members.cache.get(owner.id) || owner;
          if (isAuthorized(guild, ownerMember, 'antiwebhooks')) continue;

          // ⚡ Phase 1: Ban offender FIRST (and let logging/DM pipeline still execute on first strike!)
          const alreadyCondemned = isCondemned(guild.id, owner.id);
          condemn(guild.id, owner.id);
          setGuildUnderAttack(guild.id, owner.id, 60_000);
          let banPromise = null;
          if (!alreadyCondemned) {
            banPromise = rawBan(guild.id, owner.id, token, '[ATHENA SENTINEL] Unauthorized Webhook Creation', { actionType: 'WEBHOOK_UPDATE' });
            trackInFlightPunishment(guild.id, banPromise);
          }

          // ⚡ Phase 2: Delete webhook ONLY AFTER ban strike settles
          waitForInFlightPunishments(guild.id).then(async () => {
            await rawDeleteWebhook(whId, token, '[ATHENA SENTINEL] Rogue Webhook Neutralized').catch(() => null);
            if (!alreadyCondemned) {
              const execObj = {
                id: owner.id,
                tag: owner.tag || owner.username || `User (${owner.id})`,
                username: owner.username || owner.tag,
                bot: Boolean(owner.bot)
              };
              await handleAuditLogEntry(guild, {
                id: `wh_${whId}`,
                action: AuditLogEvent.WebhookCreate,
                executorId: owner.id,
                targetId: whId,
                executor: execObj,
                createdAt: new Date()
              }, {
                skipStrike: true,
                fromWiretap: false,
                wiretapHandledRollback: true,
                preExecutedPunishResult: 'Eliminated (Direct Raw Ban — Instant)'
              }).catch(() => null);
            }
          }).catch(() => null);
        } else {
          // Owner unknown — let directStrike resolve audit log first, ban first, then delete webhook
          directStrike(
            guild,
            AuditLogEvent.WebhookCreate,
            'Unauthorized Webhook Creation',
            whId,
            async () => {
              await waitForInFlightPunishments(guild.id);
              await rawDeleteWebhook(whId, token, '[ATHENA SENTINEL] Unverified Rogue Webhook Neutralized').catch(() => null);
            }
          ).catch(() => null);
        }
      }
    } catch (err) {
      console.error('[Antinuke] Webhook Wiretap error:', err);
    }

    // Non-blocking server log entry for webhooks
    (async () => {
      try {
        if (!isServerLogModuleEnabled(guild.id, 'webhooks')) return;
        const { executor, reason } = await getAuditExecutorAndReason(guild, AuditLogEvent.WebhookCreate, null);
        const executorStr = executor ? `${formatUserLink(executor, guild)} (\`${executor.id}\`)` : 'Unknown';

        const whEmbed = buildServerLogEmbed({
          title: 'Webhook updated',
          color: '#5865F2',
          attributes: {
            'Channel': formatChannelLink(channel.id, guild),
            'Channel ID': `\`${channel.id}\``,
            'Executor': executorStr,
            'Reason': reason
          },
          client: guild.client
        });
        await logServerEvent(guild, 'webhooks', whEmbed);
      } catch {}
    })().catch(() => null);
  }
};
