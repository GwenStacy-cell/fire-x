import { MessageFlags } from 'discord.js';
import cv2 from '../cv2.js';
import { searchWebImages, createSearchSession, buildImageResultPayload } from '../utils/imageSearch.js';

export const commands = [
  {
    name: 'image',
    aliases: ['pic', 'img', 'photo', 'picture', 'searchimg'],
    description: 'Search and retrieve real high-resolution pictures from the web with interactive pagination',
    category: 'utility',
    permissions: [],
    options: [
      {
        name: 'query',
        description: 'What picture to find (e.g. cat, worldmap, fog, mist, car, cm of tn, biden)',
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
                  content: `## Image Search Guidance | <a:atheNATICK:1557841381630681106>\n` +
                           `> -# <a:uptime:1552608831060844575> **Usage:** \`!image <search query>\` or \`!pic <query>\`\n` +
                           `> -# • **Examples:** \`!pic cat\`, \`!img car\`, \`!pic worldmap\`, \`!pic cm of tn\`, \`!image biden\`\n` +
                           `> -# • **Interactive Pagination:** Use \`Next\` and \`Previous\` buttons to cycle through high-res net pictures.`
                },
                { type: 14, divider: true },
                { type: 10, content: `-# **Athena Prime Visual Intelligence Engine \u2022 Live Web Search**` }
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
                content: `-# <a:uptime:1552608831060844575> **Searching the web for high-resolution pictures of \`${query}\`...**`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);

      try {
        const results = await searchWebImages(query, { offset: 0, shuffle: true });
        if (!results || results.length === 0) {
          const errPayload = cv2.warn('No Images Found', `No web images were found matching \`${query}\`. Try a different search term.`);
          if (loadingMsg) return loadingMsg.edit(errPayload);
          return message.reply(errPayload);
        }

        const sessionId = createSearchSession(query, results, 0);
        const payload = buildImageResultPayload(sessionId, 0);

        if (loadingMsg) {
          await loadingMsg.delete().catch(() => null);
        }
        return message.reply(payload);
      } catch (err) {
        console.error('[ImageCommand Error]', err);
        const errPayload = cv2.danger('Search Error', 'An unexpected error occurred while searching for images.');
        if (loadingMsg) return loadingMsg.edit(errPayload);
        return message.reply(errPayload);
      }
    },

    async executeSlash(interaction) {
      const query = interaction.options.getString('query');
      await interaction.deferReply();

      try {
        const results = await searchWebImages(query, { offset: 0, shuffle: true });
        if (!results || results.length === 0) {
          return interaction.editReply(cv2.warn('No Images Found', `No web images were found matching \`${query}\`. Try a different search term.`));
        }

        const sessionId = createSearchSession(query, results, 0);
        const payload = buildImageResultPayload(sessionId, 0);
        return interaction.editReply(payload);
      } catch (err) {
        console.error('[ImageSlash Error]', err);
        return interaction.editReply(cv2.danger('Search Error', 'An unexpected error occurred while searching for images.'));
      }
    }
  }
];

export default commands;
