import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  UPTIME_EMOJI, 
  getRandomHeadingGlyph 
} from '../utils/emojis.js';
import { AI_PERSONAS } from '../utils/personaEngine.js';

export const commands = [
  {
    name: 'persona',
    aliases: ['aipersona', 'personality', 'tone'],
    description: 'Switch Athena Prime conversational AI personality (Tsundere, Cyberpunk, Butler, Sensei)',
    category: 'utility',
    permissions: [PermissionFlagsBits.ManageGuild],
    options: [
      { name: 'name', description: 'Persona name (default, tsundere, cyberpunk, butler, sensei)', type: 3, required: false }
    ],

    async executePrefix(message, args) {
      const chosen = (args[0] || '').toLowerCase().trim();

      if (!chosen || !AI_PERSONAS[chosen]) {
        const currentKey = db.getGuildPersona(message.guild.id);
        const current = AI_PERSONAS[currentKey] || AI_PERSONAS['default'];

        const lines = Object.entries(AI_PERSONAS).map(([k, p]) => {
          const isCurr = k === currentKey ? ` **(ACTIVE)**` : '';
          return `${BULLET_EMOJI} \`!persona ${k}\` — **${p.name}**${isCurr}\n> -# *${p.desc}*`;
        }).join('\n\n');

        return message.reply(cv2.panel(
          `Conversational AI Persona Matrix | ${TICK_EMOJI}`,
          `Configure Athena's unique conversational personality for \`!ask\` and server chat.\n\n` +
          `**Current Active Persona:** \`${current.name}\`\n\n` +
          `**__Available Personas:__**\n${lines}\n\n` +
          `**Usage:** Run \`!persona <name>\` (e.g. \`!persona tsundere\`).`
        ));
      }

      db.setGuildPersona(message.guild.id, chosen);
      const persona = AI_PERSONAS[chosen];

      return message.reply(cv2.success(
        `AI Persona Engaged | ${TICK_EMOJI}`,
        `Athena Prime is now operating under the **${persona.name}** persona!\n\n` +
        `${BULLET_EMOJI} **Description:** ${persona.desc}\n` +
        `${BULLET_EMOJI} **Tone Style:** ${persona.tone}\n\n` +
        `Test the new persona right now with \`!ask <question>\`!`
      ));
    },

    async executeSlash(interaction) {
      const chosen = (interaction.options.getString('name') || '').toLowerCase().trim();

      if (!chosen || !AI_PERSONAS[chosen]) {
        const currentKey = db.getGuildPersona(interaction.guild.id);
        const current = AI_PERSONAS[currentKey] || AI_PERSONAS['default'];

        const lines = Object.entries(AI_PERSONAS).map(([k, p]) => {
          const isCurr = k === currentKey ? ` **(ACTIVE)**` : '';
          return `${BULLET_EMOJI} \`/persona name:${k}\` — **${p.name}**${isCurr}\n> -# *${p.desc}*`;
        }).join('\n\n');

        return interaction.reply(cv2.panel(
          `Conversational AI Persona Matrix | ${TICK_EMOJI}`,
          `Configure Athena's unique conversational personality for \`!ask\` and server chat.\n\n` +
          `**Current Active Persona:** \`${current.name}\`\n\n` +
          `**__Available Personas:__**\n${lines}\n\n` +
          `**Usage:** Select a persona from the options.`
        ));
      }

      db.setGuildPersona(interaction.guild.id, chosen);
      const persona = AI_PERSONAS[chosen];

      return interaction.reply(cv2.success(
        `AI Persona Engaged | ${TICK_EMOJI}`,
        `Athena Prime is now operating under the **${persona.name}** persona!\n\n` +
        `${BULLET_EMOJI} **Description:** ${persona.desc}\n` +
        `${BULLET_EMOJI} **Tone Style:** ${persona.tone}\n\n` +
        `Test the new persona right now with \`!ask <question>\`!`
      ));
    }
  }
];

export default { commands };
