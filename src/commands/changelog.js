import { buildChangelogPayload } from '../utils/changelogData.js';

export const commands = [
  {
    name: 'changelog',
    aliases: ['updates', 'changes', 'cl', 'release', 'notes'],
    description: 'View the latest Athena Prime updates, optimizations, and release history across the last 5 days',
    category: 'utility',
    options: [
      {
        name: 'page',
        description: 'Specific release day page to view (1 to 5)',
        type: 4,
        required: false,
        min_value: 1,
        max_value: 5
      }
    ],

    async executePrefix(message, args) {
      let page = 1;
      if (args && args[0]) {
        const parsed = parseInt(args[0], 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
          page = parsed;
        }
      }

      const payload = buildChangelogPayload(page);
      return message.reply(payload).catch(() => null);
    },

    async executeSlash(interaction) {
      const page = interaction.options.getInteger('page') || 1;
      const payload = buildChangelogPayload(page);
      return interaction.reply(payload).catch(() => null);
    }
  }
];
