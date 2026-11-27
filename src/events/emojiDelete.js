import { AuditLogEvent } from 'discord.js';
import { cacheDeletedItem, directStrike, deletedCache, isRestorationHandled, markRestorationQueued, restorationRegistry } from '../utils/antinuke.js';
import db from '../database.js';
import { buildServerLogEmbed, logServerEvent, getAuditExecutorAndReason as getLogAudit, isServerLogModuleEnabled } from '../utils/serverLogger.js';
import { formatUserLink } from '../utils/helpers.js';

export default {
  name: 'emojiDelete',
  async execute(emoji) {
    if (!emoji.guild) return;

    cacheDeletedItem(emoji.id, emoji);

    directStrike(
      emoji.guild,
      AuditLogEvent.EmojiDelete,
      'Emoji Deletion',
      emoji.id,
      async () => {
        if (isRestorationHandled(emoji.id)) return;
        markRestorationQueued(emoji.id);
        try {
          const cached = deletedCache.get(emoji.id);
          if (!cached) return;
          const created = await emoji.guild.emojis.create({
            attachment: cached.url,
            name: cached.name,
            reason: 'Athena Anti-Nuke: Restored deleted emoji'
          });
          restorationRegistry.restored.set(emoji.id, Date.now());
          if (created?.id) restorationRegistry.restored.set(created.id, Date.now());
          setTimeout(() => {
            restorationRegistry.restored.delete(emoji.id);
            if (created?.id) restorationRegistry.restored.delete(created.id);
          }, 15 * 60 * 1000);
        } catch {} finally {
          restorationRegistry.queued.delete(emoji.id);
        }
      }
    ).catch(() => null);

    // Non-blocking server log entry
    (async () => {
      try {
        if (!isServerLogModuleEnabled(emoji.guild.id, 'emojis')) return;
        const { executor, reason } = await getLogAudit(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
        const executorStr = executor ? `${formatUserLink(executor, emoji.guild)} (\`${executor.id}\`)` : 'Unknown';

        const delEmbed = buildServerLogEmbed({
          title: 'Emoji deleted',
          color: '#F04747',
          attributes: {
            'Name': emoji.name,
            'ID': `\`${emoji.id}\``,
            'Executor': executorStr,
            'Reason': reason
          },
          client: emoji.guild.client
        });
        await logServerEvent(emoji.guild, 'emojis', delEmbed);
      } catch {}
    })().catch(() => null);
  }
};

