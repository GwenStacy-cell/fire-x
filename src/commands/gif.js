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
  buildGifResultPayload,
  parseGifRequest,
  VERB_CONJUGATIONS 
} from '../utils/gifSearch.js';

export const commands = [
  {
    name: 'gif',
    aliases: ['findgif', 'searchgif', 'gifs', 'tenor', 'klipy', 'g', 'gifsearch', 'tenorgif', 'klipygif', 'giphy', 'gifme', 'reactiongif', 'reactgif', 'actiongif', 'anigif'],
    description: 'Search animated GIFs and express actions mentioning users inside an accent borderless CV2 container',
    category: 'utility',
    permissions: [],
    options: [
      {
        name: 'query',
        description: 'What GIF to find or action request (e.g. punches @user, hugs @user, cat vibing, eating popcorn)',
        type: 3, // STRING
        required: true
      },
      {
        name: 'target',
        description: 'Optional member to mention in the action GIF container',
        type: 6, // USER
        required: false
      }
    ],

    async executePrefix(message, args) {
      const rawContent = args.join(' ').trim();
      if (!rawContent) {
        return message.reply({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `# ${getRandomHeadingGlyph()} GIF Expression Matrix | ${TICK_EMOJI}\n` +
                           `> -# <a:uptime:1552608831060844575> **Usage:** \`!gif <request> [@user]\`\n` +
                           `> -# <a:target_blink:1565667466984554588> **Expressive Action:** \`!gif punches @user\`, \`!gif hugs @user\`, \`!gif dances with @user\`\n` +
                           `> -# <a:target_blink:1565667466984554588> **Personal Action:** \`!gif is eating popcorn\`, \`!gif dances\`, \`!gif dies of laughter\`\n` +
                           `> -# <a:target_blink:1565667466984554588> **General Search:** \`!gif cat vibing\`, \`!gif popcorn\`, \`!gif anime celebration\`\n` +
                           `> -# <a:target_blink:1565667466984554588> **Aliases:** \`!findgif\`, \`!searchgif\`, \`!gifs\`, \`!tenor\`, \`!klipy\`, \`!g\`, \`!giphy\`, \`!actiongif\`\n` +
                           `> -# <a:target_blink:1565667466984554588> **Federated Routes:** Powered by KLIPY, Tenor, Giphy, OtakuGifs & Nekos Best.\n` +
                           `> -# <a:target_blink:1565667466984554588> **Controls:** Use \`Prev\`, \`Next\`, \`Random\`, and \`Fresh Batch\` buttons to explore.`
                },
                { type: 14, divider: true },
                { type: 10, content: `-# **Athena Federated GIF Matrix · KLIPY · Tenor · GIPHY · OtakuGifs**` }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const parsed = parseGifRequest(rawContent, message.author, message.mentions.users);

      const loadingMsg = await message.reply({
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `-# <a:uptime:1552608831060844575> **Federating GIF routes for \`${parsed.cleanQuery}\`...**`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);

      try {
        let results = await searchFederatedGifs(parsed.searchQuery, { offset: 0 });
        if ((!results || results.length === 0) && parsed.cleanQuery !== parsed.searchQuery) {
          results = await searchFederatedGifs(parsed.cleanQuery, { offset: 0 });
        }

        if (!results || results.length === 0) {
          const warnPayload = cv2.warn(
            `No GIFs Found | ${WARN_EMOJI}`,
            `No animated GIFs were located for \`${parsed.cleanQuery}\`. Try a broader keyword or common action.`
          );
          if (loadingMsg) return loadingMsg.edit(warnPayload);
          return message.reply(warnPayload);
        }

        const sessionId = createGifSession(parsed.searchQuery, results, 0, {
          actionHeadline: parsed.actionHeadline,
          cleanQuery: parsed.cleanQuery,
          authorId: message.author.id,
          targetId: parsed.targetUser?.id || null
        });
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
      const targetUser = interaction.options.getUser('target');
      if (!query) {
        return interaction.reply({
          content: `-# ${WARN_EMOJI} Please provide a GIF query or action request: \`/gif query:<need>\``,
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply();

      const mentionsList = targetUser ? [targetUser] : [];
      const parsed = parseGifRequest(query, interaction.user, mentionsList);
      if (targetUser && !parsed.targetUser) {
        parsed.targetUser = targetUser;
        const conjugated = VERB_CONJUGATIONS[parsed.cleanQuery.toLowerCase()] || parsed.cleanQuery;
        parsed.actionHeadline = `<@${interaction.user.id}> ${conjugated} <@${targetUser.id}>!`;
      }

      try {
        let results = await searchFederatedGifs(parsed.searchQuery, { offset: 0 });
        if ((!results || results.length === 0) && parsed.cleanQuery !== parsed.searchQuery) {
          results = await searchFederatedGifs(parsed.cleanQuery, { offset: 0 });
        }

        if (!results || results.length === 0) {
          return interaction.editReply(
            cv2.warn(`No GIFs Found | ${WARN_EMOJI}`, `No animated GIFs were located for \`${parsed.cleanQuery}\`. Try a broader keyword.`)
          );
        }

        const sessionId = createGifSession(parsed.searchQuery, results, 0, {
          actionHeadline: parsed.actionHeadline,
          cleanQuery: parsed.cleanQuery,
          authorId: interaction.user.id,
          targetId: parsed.targetUser?.id || null
        });
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
