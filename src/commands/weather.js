import { MessageFlags } from 'discord.js';
import cv2 from '../cv2.js';
import { getRandomHeadingGlyph, TICK_EMOJI, BULLET_EMOJI } from '../utils/emojis.js';
import { resolveLocationInput, fetchWeatherData, buildWeatherReportPayload } from '../utils/weatherMap.js';

export const commands = [
  {
    name: 'weather',
    aliases: ['wtr', 'climate', 'forecast', 'temp', 'temperature'],
    description: 'Live global weather reconnaissance with generated world map projection & 3-day forecast',
    category: 'utility',
    permissions: [],
    options: [
      {
        name: 'location',
        description: 'City name, country, coordinates (lat,lon), or Google Maps URL',
        type: 3, // STRING
        required: true
      }
    ],
    async executePrefix(message, args) {
      const input = args.join(' ').trim();
      if (!input) {
        return message.reply({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `# ${getRandomHeadingGlyph()} Weather Reconnaissance Guidance | ${TICK_EMOJI}\n` +
                           `> -# <a:uptime:1552608831060844575> **Usage:** \`!weather <city | country | coordinates | google_maps_url>\`\n` +
                           `> -# ${BULLET_EMOJI} **All Aliases:** \`!wtr\`, \`!climate\`, \`!forecast\`, \`!temp\`, \`!temperature\`, \`/weather\`\n` +
                           `> -# ${BULLET_EMOJI} **City Example:** \`!weather London\` or \`!wtr Chennai\`\n` +
                           `> -# ${BULLET_EMOJI} **Coordinates Example:** \`!wtr 13.0827, 80.2707\`\n` +
                           `> -# ${BULLET_EMOJI} **Google Maps Link:** \`!wtr https://maps.google.com/?q=Eiffel+Tower\`\n` +
                           `> -# ${BULLET_EMOJI} **Projection Feature:** Generates an Equirectangular world map with locked radar crosshairs.`
                },
                { type: 14, divider: true },
                { type: 10, content: `-# **Athena Prime Atmospheric Sentry \u2022 World Meteorological Engine**` }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      // Show thinking feedback
      const loadingMsg = await message.reply({
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `-# <a:uptime:1552608831060844575> **Athena Prime is scanning satellite atmospheric feeds & generating world map...**`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);

      try {
        const resolved = await resolveLocationInput(input);
        if (!resolved || !resolved.query) {
          const errPayload = cv2.warn('Invalid Location', 'Could not resolve the specified location or Google Maps link.');
          if (loadingMsg) return loadingMsg.edit(errPayload);
          return message.reply(errPayload);
        }

        const data = await fetchWeatherData(resolved.query);
        if (!data || !data.current_condition || data.current_condition.length === 0) {
          const errPayload = cv2.danger('Meteorological Feed Error', `No weather data could be retrieved for \`${input}\`. Please verify the city name or coordinates.`);
          if (loadingMsg) return loadingMsg.edit(errPayload);
          return message.reply(errPayload);
        }

        const payload = await buildWeatherReportPayload(data, resolved.query, resolved.sourceUrl);
        if (loadingMsg) {
          await loadingMsg.delete().catch(() => null);
        }
        return message.reply(payload);
      } catch (err) {
        console.error('[WeatherCommand Error]', err);
        const errPayload = cv2.danger('Execution Error', 'An unexpected error occurred while generating the weather reconnaissance report.');
        if (loadingMsg) return loadingMsg.edit(errPayload);
        return message.reply(errPayload);
      }
    },

    async executeSlash(interaction) {
      const input = interaction.options.getString('location');
      await interaction.deferReply();

      try {
        const resolved = await resolveLocationInput(input);
        if (!resolved || !resolved.query) {
          return interaction.editReply(cv2.warn('Invalid Location', 'Could not resolve the specified location or Google Maps link.'));
        }

        const data = await fetchWeatherData(resolved.query);
        if (!data || !data.current_condition || data.current_condition.length === 0) {
          return interaction.editReply(cv2.danger('Meteorological Feed Error', `No weather data could be retrieved for \`${input}\`. Please verify the city name or coordinates.`));
        }

        const payload = await buildWeatherReportPayload(data, resolved.query, resolved.sourceUrl);
        return interaction.editReply(payload);
      } catch (err) {
        console.error('[WeatherSlash Error]', err);
        return interaction.editReply(cv2.danger('Execution Error', 'An unexpected error occurred while generating the weather reconnaissance report.'));
      }
    }
  }
];

export default commands;
