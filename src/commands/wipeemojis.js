import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import cv2 from '../cv2.js';
import { isBotOwnerSync, isExtraOwner } from '../utils/helpers.js';

export const commands = [
  {
    name: 'wipeemojis',
    description: 'Delete all custom emojis from this server',
    category: 'moderation',
    async executePrefix(message, args) {
      if (message.author.id !== message.guild.ownerId && !isBotOwnerSync(message.author.id) && !isExtraOwner(message.guild.id, message.author.id)) {
        return message.reply(cv2.danger('Access Denied', 'You do not have permission to use this command.'));
      }

      if (message.guild.emojis.cache.size === 0) {
        return message.reply(cv2.warn('No Emojis', 'There are no custom emojis to delete in this server.'));
      }

      const confirmBtn = new ButtonBuilder().setCustomId('confirm_wipe_emojis').setLabel('Confirm Wipe').setStyle(ButtonStyle.Danger);
      const cancelBtn = new ButtonBuilder().setCustomId('cancel_wipe_emojis').setLabel('Cancel').setStyle(ButtonStyle.Secondary);
      const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

      const container = {
        type: 17,
        components: [
          { type: 10, content: `# ${getRandomHeadingGlyph()} **Emoji Wipe Sequence**\nAre you sure you want to delete **ALL** custom emojis in this server?\n\nThis action **cannot be undone**.` },
          { type: 14, divider: true },
          row.toJSON(),
          { type: 14, divider: true },
          { type: 10, content: '-# Athena Bulletproof Security System • V1.0.0' }
        ]
      };

      const msg = await message.reply({ 
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });

      const collector = msg.createMessageComponentCollector({ time: 30000 });

      collector.on('collect', async i => {
        if (i.user.id !== message.author.id) {
          return i.reply({ content: 'You cannot use this button.', flags: 64 }).catch(()=>{});
        }

        if (i.customId === 'cancel_wipe_emojis') {
          collector.stop('cancelled');
          const cancelContainer = {
            type: 17,
            components: [
              { type: 10, content: `# ${getRandomHeadingGlyph()} Emoji Wipe Sequence | <a:03_tick_circle:1565665642084827206>\n> -# Operation cancelled by user.` },
              { type: 14, divider: true },
              { type: 10, content: `-# **Athena Bulletproof Security System • V1.0.0**` }
            ]
          };
          return i.update({ components: [cancelContainer], flags: MessageFlags.IsComponentsV2 }).catch(()=>{});
        }

        if (i.customId === 'confirm_wipe_emojis') {
          collector.stop('confirmed');
          
          let deleted = 0;
          const emojis = Array.from(message.guild.emojis.cache.values());
          const total = emojis.length;

          const buildProgressContainer = () => ({
            type: 17,
            components: [
              { type: 10, content: `# ${getRandomHeadingGlyph()} Emoji Wipe Sequence | <a:03_tick_circle:1565665642084827206>\n> -# <a:uptime:1552608831060844575> Deleting emojis... [${deleted}/${total}]` },
              { type: 14, divider: true },
              { type: 10, content: `-# **Athena Bulletproof Security System • V1.0.0**` }
            ]
          });

          await i.update({ components: [buildProgressContainer()], flags: MessageFlags.IsComponentsV2 }).catch(()=>{});

          for (let idx = 0; idx < emojis.length; idx++) {
            try {
              await emojis[idx].delete();
              deleted++;
            } catch (err) {
              console.error(`Failed to delete emoji ${emojis[idx].name}:`, err);
            }

            // Update UI every 5 deletions to prevent Discord edit rate limits (5 per 5 seconds)
            if (deleted % 5 === 0 && deleted !== total) {
              await msg.edit({ components: [buildProgressContainer()], flags: MessageFlags.IsComponentsV2 }).catch(()=>{});
            }
          }

          const finalContainer = {
            type: 17,
            components: [
              { type: 10, content: `# ${getRandomHeadingGlyph()} Emoji Wipe Sequence | <a:03_tick_circle:1565665642084827206>\n> -# <a:uptime:1552608831060844575> Successfully deleted **${deleted}** emojis from the server.` },
              { type: 14, divider: true },
              { type: 10, content: `-# **Athena Bulletproof Security System • V1.0.0**` }
            ]
          };
          await msg.edit({ components: [finalContainer], flags: MessageFlags.IsComponentsV2 }).catch(()=>{});
        }
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time') {
          const timeoutContainer = {
            type: 17,
            components: [
              { type: 10, content: `# ${getRandomHeadingGlyph()} Emoji Wipe Sequence | <a:03_tick_circle:1565665642084827206>\n> -# Operation timed out.` },
              { type: 14, divider: true },
              { type: 10, content: `-# **Athena Bulletproof Security System • V1.0.0**` }
            ]
          };
          msg.edit({ components: [timeoutContainer], flags: MessageFlags.IsComponentsV2 }).catch(()=>{});
        }
      });
    }
  }
];
