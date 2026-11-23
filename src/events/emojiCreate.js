import { AuditLogEvent } from 'discord.js';
import { directStrike, isGuildUnderAttack } from '../utils/antinuke.js';
import { buildServerLogEmbed, logServerEvent, getAuditExecutorAndReason } from '../utils/serverLogger.js';
import { formatUserLink } from '../utils/helpers.js';

export default {
  name: 'emojiCreate',
  async execute(emoji) {
    if (!emoji.guild) return;

    directStrike(
      emoji.guild,
      AuditLogEvent.EmojiCreate,
      'Emoji Creation',
      emoji.id,
      async () => {
        await emoji.delete('Athena Anti-Nuke: Unauthorized Emoji Creation').catch(() => null);
      }
    ).catch(() => null);

    // Non-blocking server log entry
    (async () => {
      try {
        if (isGuildUnderAttack(emoji.guild.id)) return;
        const { executor, reason } = await getAuditExecutorAndReason(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
        const executorStr = executor ? `${formatUserLink(executor, emoji.guild)} (\`${executor.id}\`)` : 'Unknown';
        const emojiStr = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;

        const createEmbed = buildServerLogEmbed({
          title: 'Emoji created',
          color: '#43B581',
          attributes: {
            'Emoji': `${emojiStr} \`${emoji.name}\``,
            'ID': `\`${emoji.id}\``,
            'Animated': emoji.animated ? 'Yes' : 'No',
            'Executor': executorStr,
            'Reason': reason
          },
          client: emoji.guild.client
        });
        await logServerEvent(emoji.guild, 'emojis', createEmbed);
      } catch {}
    })().catch(() => null);
  }
};
