import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import db from '../database.js';
import statsDB from '../statsDB.js';
import cv2 from '../cv2.js';
import ms from 'ms';
import chalk from 'chalk';

const EMOJI_HEADER = '<a:emoji_11:1533024044075454464>';
const EMOJI_JOIN = '<a:emoji_56:1533024028451672257>';
const EMOJI_WINNER = '<a:giveaway:1533844904604864603>';

// In-memory state for active giveaway managers. Maps interaction/message ID -> config
export const gwManagers = new Map();

// Helper to generate the CV2 Manager Panel container
export function buildManagerContainer(managerId) {
  const cfg = gwManagers.get(managerId);
  if (!cfg) return null;

  const modeLabels = {
    'random': 'Random (Classic)',
    'messages': 'Most Messages (Channel)',
    'vc': 'Most Voice Chat Time',
    'invites': 'Highest Invites'
  };

  let endsText = 'Not Set';
  if (cfg.durationMs) {
    const endsAt = Math.floor((Date.now() + cfg.durationMs) / 1000);
    endsText = `<t:${endsAt}:R> (<t:${endsAt}:f> IST)`;
  }

  const components = [
    { type: 10, content: `# ${getRandomHeadingGlyph()} ${EMOJI_HEADER} GIVEAWAY MANAGER` },
    { type: 14, divider: true },
    { type: 10, content: `-# **Configure your giveaway below. Use the dropdown to select the winner selection mode, and the buttons to set the prize and duration.**` },
    { type: 14, divider: true },
    { type: 10, content: `**Prize:** ${cfg.prize}` },
    { type: 10, content: `**Duration:** ${cfg.duration} (${endsText})` },
    { type: 10, content: `**Winners:** ${cfg.winners}` },
    { type: 10, content: `**Mode:** ${modeLabels[cfg.mode]}` },
    { type: 14, divider: true },
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `gw_mode_${managerId}`,
          placeholder: 'Select Winner Selection Mode...',
          options: [
            { label: 'Random (Classic)', value: 'random', description: 'Picks a completely random winner' },
            { label: 'Most Messages in Channel', value: 'messages', description: 'Picks the user with the most messages in this channel' },
            { label: 'Most VC Time', value: 'vc', description: 'Picks the user with the most overall Voice Chat time' },
            { label: 'Highest Invites', value: 'invites', description: 'Picks the user with the highest net invites' }
          ]
        }
      ]
    },
    {
      type: 1,
      components: [
        { type: 2, style: 1, label: 'Configure Settings', custom_id: `gw_setup_${managerId}` },
        { type: 2, style: 3, label: 'Start Giveaway', custom_id: `gw_start_${managerId}` },
        { type: 2, style: 2, label: 'Manage Active', custom_id: `gw_manage_${managerId}` }
      ]
    }
  ];

  return { type: 17, components };
}

export async function endGiveaway(client, messageId, gwData) {
  try {
    const guild = client.guilds.cache.get(gwData.guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(gwData.channelId);
    if (!channel) return;

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return;

    // Pick winners
    const participants = gwData.participants || [];
    let winners = [];
    
    if (participants.length > 0) {
      if (gwData.mode === 'messages') {
        const stats = participants.map(id => {
          const s = statsDB.getUserStats(gwData.guildId, id);
          return { id, score: s.messages };
        }).sort((a, b) => b.score - a.score);
        winners = stats.slice(0, gwData.winnersCount).map(x => x.id);
      } else if (gwData.mode === 'vc') {
        const stats = participants.map(id => {
          const s = statsDB.getUserStats(gwData.guildId, id);
          return { id, score: s.voiceSeconds };
        }).sort((a, b) => b.score - a.score);
        winners = stats.slice(0, gwData.winnersCount).map(x => x.id);
      } else if (gwData.mode === 'invites') {
        const stats = participants.map(id => {
          const s = statsDB.getUserInvites(gwData.guildId, id);
          return { id, score: s.net };
        }).sort((a, b) => b.score - a.score);
        winners = stats.slice(0, gwData.winnersCount).map(x => x.id);
      } else {
        // Random (default)
        const shuffled = [...participants].sort(() => 0.5 - Math.random());
        winners = shuffled.slice(0, gwData.winnersCount);
      }
    }

    // Update the embed
    const originalEmbed = EmbedBuilder.from(message.embeds[0]);
    originalEmbed.setColor('#2b2d31');
    originalEmbed.setDescription(`**Prize:** ${gwData.prize}\n**Ended:** <t:${Math.floor(Date.now() / 1000)}:R>\n**Hosted By:** <@${gwData.hostId}>\n\n**Winners:** ${winners.length > 0 ? winners.map(id => `<@${id}>`).join(', ') : 'None'}`);
    originalEmbed.setFooter({ text: `Ended � ${participants.length} Entries` });

    // Disable the button
    const row = ActionRowBuilder.from(message.components[0]);
    row.components[0].setDisabled(true);

    await message.edit({ embeds: [originalEmbed], components: [row] });

    const guildConfig = db.getGuildConfig(gwData.guildId) || {};
    const accentColor = guildConfig.accentColor || '#5865F2';

    // Announce the winner
    if (winners.length > 0) {
      const winEmbed = new EmbedBuilder()
        .setColor(accentColor)
        .setDescription(`##  Giveaway Ended \n\n${EMOJI_WINNER}\n\n**Winner(s):** ${winners.map(id => `<@${id}>`).join(', ')}\n**Prize:** ${gwData.prize}\n\n**Congratulations! Please DM the host to claim your prize.**`);

      await channel.send({ content: `${winners.map(id => `<@${id}>`).join(', ')}`, embeds: [winEmbed] });

      // DM the winners
      for (const winnerId of winners) {
        try {
          const winnerUser = await client.users.fetch(winnerId);
          if (winnerUser) {
            const dmEmbed = new EmbedBuilder()
              .setTitle(' You Won a Giveaway! ')
              .setDescription(`Congratulations! You won the **${gwData.prize}** giveaway in **${guild.name}**!\n\nPlease reach out to the host (<@${gwData.hostId}>) or open a ticket in the server to claim your prize.`)
              .setColor('#FFD700');
            await winnerUser.send({ embeds: [dmEmbed] }).catch(() => null);
          }
        } catch (e) {
          // Ignore if user cannot be fetched or has DMs closed
        }
      }
    } else {
      const loseEmbed = new EmbedBuilder()
        .setColor(accentColor)
        .setDescription(`##  Giveaway Ended \n\n${EMOJI_WINNER}\n\nNobody entered the giveaway! The prize **${gwData.prize}** goes unclaimed.`);

      await channel.send({ embeds: [loseEmbed] });
    }

    // Mark as ended but keep in DB for rerolling
    gwData.ended = true;
    db.saveGiveaway(messageId, gwData);
  } catch (error) {
    console.error(chalk.red(` Failed to end giveaway ${messageId}:`), error);
  }
}

export const commands = [
  {
    name: 'giveaway',
    description: 'Manage server giveaways',
    aliases: ['gw'],
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [],
    async executePrefix(message, args) {
      if (!message.member.permissions.has('Administrator')) return;
      const managerId = message.id;
      gwManagers.set(managerId, {
        prize: 'Not Set',
        duration: 'Not Set',
        durationMs: 0,
        winners: 1,
        mode: 'random',
        hostId: message.author.id,
        channelId: message.channel.id
      });

      const components = buildManagerContainer(managerId);
      await message.reply({ components: [components], flags: 1 << 15 }); // MessageFlags.IsComponentsV2
    },
    async executeSlash(interaction) {
      const managerId = interaction.id;
      gwManagers.set(managerId, {
        prize: 'Not Set',
        duration: 'Not Set',
        durationMs: 0,
        winners: 1,
        mode: 'random',
        hostId: interaction.user.id,
        channelId: interaction.channel.id
      });

      const components = buildManagerContainer(managerId);
      await interaction.reply({ components: [components], flags: 1 << 15 });
    }
  }
];
