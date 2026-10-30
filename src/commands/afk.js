import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import db from '../database.js';
import { MessageFlags } from 'discord.js';

export const commands = [{
  name: 'afk',
  aliases: ['brb'],
  slashHidden: true,
  description: 'Set your AFK status',
  async executePrefix(message, args) {
    const reason = args.length > 0 ? args.join(' ') : 'AFK';
    const timestamp = Date.now();
    db.setAfk(message.author.id, reason, timestamp);

    const avatarUrl = message.author.displayAvatarURL({ dynamic: true, size: 128 });

    const container = {
      type: 17,
      components: [
        {
          type: 9,
          components: [{ type: 10, content: `# ${getRandomHeadingGlyph()} **AFK Set**\n-# **${message.member?.displayName || message.author.displayName} is now AFK**\n-# **Reason: ${reason}**` }],
          accessory: { type: 11, media: { url: avatarUrl } }
        },
        { type: 14, divider: true }, { type: 10, content: "-# **Athena Bulletproof Security !!!**" }
      ]
    };

    await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
}];