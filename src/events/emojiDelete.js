import { AuditLogEvent } from 'discord.js';
import { cacheDeletedItem, directStrike, deletedCache, queuedRestorations, isGuildUnderAttack } from '../utils/antinuke.js';
import db from '../database.js';
import { buildServerLogEmbed, logServerEvent, getAuditExecutorAndReason } from '../utils/serverLogger.js';
import { formatUserLink } from '../utils/helpers.js';

export default {
  name: 'emojiDelete',
  async execute(emoji) {
    if (!emoji.guild) return;
    if (db.isModModeActive(emoji.guild.id)) return;

    cacheDeletedItem(emoji.id, emoji);

    directStrike(
      emoji.guild,
      AuditLogEvent.EmojiDelete,
      'Emoji Deletion',
      emoji.id,
      async () => {
        try {
          const cached = deletedCache.get(emoji.id);
          if (!cached) return;
          if (queuedRestorations.has(emoji.id)) return;
          queuedRestorations.add(emoji.id);
          
          await emoji.guild.emojis.create({
            attachment: cached.url,
            name: cached.name,
            reason: 'Athena Anti-Nuke: Restored deleted emoji'
          });
        } catch {}
      }
    ).catch(() => null);

    // Non-blocking server log entry
    (async () => {
      try {
        if (isGuildUnderAttack(emoji.guild.id)) return;
        const { executor, reason } = await getAuditExecutorAndReason(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
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

