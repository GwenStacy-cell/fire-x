import { MessageFlags } from 'discord.js';
import cv2 from '../cv2.js';
import { 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  UPTIME_EMOJI, 
  getRandomHeadingGlyph 
} from '../utils/emojis.js';
import { 
  searchFederatedGifs, 
  createGifSession, 
  buildGifResultPayload 
} from '../utils/gifSearch.js';

export const commands = [
  {
    name: 'gif',
    aliases: ['findgif', 'searchgif', 'gifs', 'tenor', 'klipy', 'g'],
    description: 'Search animated GIFs across KLIPY, Tenor, Giphy, and OtakuGifs inside an accent borderless CV2 container',
    category: 'utility',
    permissions: [],
    options: [
      {
        name: 'query',
        description: 'What GIF to find (e.g. cat vibing, anime hug, popcorn, excited, rickroll)',
        type: 3, // STRING
        required: true
      }
    ],

    async executePrefix(message, args) {
      const query = args.join(' ').trim();
      if (!query) {
        return message.reply({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `# ${getRandomHeadingGlyph()} GIF Search Matrix | ${TICK_EMOJI}\n` +
                           `> -# <a:uptime:1552608831060844575> **Usage:** \`!gif <need / query>\`\n` +
                           `> -# ${BULLET_EMOJI} **Aliases:** \`!findgif\`, \`!searchgif\`, \`!gifs\`, \`!tenor\`, \`!klipy\`, \`/gif\`\n` +
                           `> -# ${BULLET_EMOJI} **Examples:** \`!gif anime hug\`, \`!gif cat vibing\`, \`!gif popcorn\`, \`!gif celebrating\`\n` +
                           `> -# ${BULLET_EMOJI} **Federated Routes:** Powered by KLIPY, Tenor, Giphy, OtakuGifs & Nekos Best.\n` +
                           `> -# ${BULLET_EMOJI} **Controls:** Use \`Prev\`, \`Next\`, \`Random\`, and \`Fresh Batch\` buttons to explore.`
                },
                { type: 14, divider: true },
                { type: 10, content: `-# **Athena Federated GIF Matrix \u00b7 KLIPY \u00b7 Tenor \u00b7 GIPHY \u00b7 OtakuGifs**` }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const loadingMsg = await message.reply({
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `-# <a:uptime:1552608831060844575> **Searching federated GIF routes for \`${query}\`...**`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);

      try {
        const results = await searchFederatedGifs(query, { offset: 0 });
        if (!results || results.length === 0) {
          const warnPayload = cv2.warn(
            `No GIFs Found | ${WARN_EMOJI}`,
            `No animated GIFs were located for \`${query}\`. Try a broader keyword or common phrase.`
          );
          if (loadingMsg) return loadingMsg.edit(warnPayload);
          return message.reply(warnPayload);
        }

        const sessionId = createGifSession(query, results, 0);
        const payload = buildGifResultPayload(sessionId, 0);

        if (loadingMsg) {
          await loadingMsg.delete().catch(() => null);
        }
        return message.reply(payload);
      } catch (err) {
        console.error('[GifCommand Error]', err);
        const errPayload = cv2.danger('Search Error', 'An unexpected error occurred while federating GIF routes.');
        if (loadingMsg) return loadingMsg.edit(errPayload);
        return message.reply(errPayload);
      }
    },

    async executeSlash(interaction) {
      const query = interaction.options.getString('query');
      if (!query) {
        return interaction.reply({
          content: `-# ${WARN_EMOJI} Please provide a GIF query: \`/gif query:<need>\``,
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply();

      try {
        const results = await searchFederatedGifs(query, { offset: 0 });
        if (!results || results.length === 0) {
          return interaction.editReply(
            cv2.warn(`No GIFs Found | ${WARN_EMOJI}`, `No animated GIFs were located for \`${query}\`. Try a broader keyword.`)
          );
        }

        const sessionId = createGifSession(query, results, 0);
        const payload = buildGifResultPayload(sessionId, 0);
        return interaction.editReply(payload);
      } catch (err) {
        console.error('[GifSlash Error]', err);
        return interaction.editReply(
          cv2.danger('Search Error', 'An unexpected error occurred while federating GIF routes.')
        );
      }
    }
  }
];

export default { commands };
