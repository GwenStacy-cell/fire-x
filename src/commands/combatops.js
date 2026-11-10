import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import cv2 from '../cv2.js';
import { buildLiveOpsPanel } from '../utils/liveOpsMonitor.js';
import { isExtraOwnerOrHigher } from '../utils/helpers.js';
import { WRONG_EMOJI } from '../utils/emojis.js';

export const commands = [
  {
    name: 'combatops',
    aliases: ['strikeops', 'strikemonitor', 'combattelemetry', 'combatmon', 'strikemon', 'strikes'],
    description: 'Real-time military-grade anti-nuke combat telemetry, single-strike timeline breakdown, and socket benchmarks',
    category: 'security',
    permissions: [PermissionFlagsBits.Administrator],

    async executePrefix(message, args) {
      if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
        return message.reply(cv2.danger(
          `Access Denied | ${WRONG_EMOJI}`,
          'Only the **Server Owner** and authorized **Extra Owners** can access the Anti-Nuke Combat Operations Monitor.'
        )).catch(() => null);
      }

      const payload = await buildLiveOpsPanel(message.guild, message.client, 'combat');
      return message.reply(payload);
    },

    async executeSlash(interaction) {
      if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
        return interaction.reply({
          ...cv2.danger(
            `Access Denied | ${WRONG_EMOJI}`,
            'Only the **Server Owner** and authorized **Extra Owners** can access the Anti-Nuke Combat Operations Monitor.'
          ),
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply();
      const payload = await buildLiveOpsPanel(interaction.guild, interaction.client, 'combat');
      return interaction.editReply(payload);
    }
  }
];
