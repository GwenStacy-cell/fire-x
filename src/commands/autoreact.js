import { MessageFlags, ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import db from '../database.js';
import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI } from '../utils/emojis.js';

const TICK = '<a:black_dot:1544740123403620422>';
const ARROW = '<a:z_arrow_pink1:1523082728004653138>';

export function getAutoReactPanel(guildId, client) {
  const config = db.getGuildConfig(guildId) || {};
  const reacts = config.autoReacts || {};

  let rulesText = '';
  const channelIds = Object.keys(reacts);
  if (channelIds.length === 0) {
    rulesText = `-# **${ARROW} No active auto-react channels.**`;
  } else {
    for (const cid of channelIds) {
      if (reacts[cid].length === 0) continue;
      rulesText += `-# **${BULLET_EMOJI} <#${cid}>**  ${ARROW}  **${reacts[cid].join(' ')}**\n`;
    }
    if (!rulesText) rulesText = `-# **${ARROW} No active auto-react channels.**`;
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('autoreact_channel')
      .setPlaceholder('Select a channel to manage reactions...')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('autoreact_clear').setLabel('Clear All').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('autoreact_close').setLabel('Close Panel').setStyle(ButtonStyle.Secondary)
  );

  const container = {
    type: 17,
    components: [
      {
        type: 9,
        components: [
          {
            type: 10,
            content: `# ${getRandomHeadingGlyph()} Auto-React Engine\n\n-# Automatically add emoji reactions to messages in specific channels.\n\n-# ${BULLET_EMOJI} Select a channel below to configure reactions!`
          }
        ],
        accessory: {
          type: 11,
          media: { url: client?.guilds.cache.get(guildId)?.members.me?.displayAvatarURL({ extension: 'png' }) || client?.user?.displayAvatarURL({ extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png' }
        }
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# **${TICK} System Documentation:**\n-# ${BULLET_EMOJI} **How it works:** Whenever any user sends a message in a configured channel, Athena will instantly react to their message with the emojis you set.\n-# ${BULLET_EMOJI} **Multiple Emojis:** You can add as many emojis as you want. Just separate them with a space!\n-# ${BULLET_EMOJI} **Use Cases:** Perfect for #art channels (auto upvote/downvote), #suggestions, or welcome lobbies.`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# **${TICK} Current Configurations:**\n${rulesText}`
      },
      { type: 14, divider: true },
      row1.toJSON(),
      row2.toJSON(),
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# **Athena Bulletproof Security !!!**`
      }
    ]
  };

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

export async function handleAutoReactMenu(interaction) {
  if (interaction.customId === 'autoreact_channel') {
    const cid = interaction.values[0];
    const modal = new ModalBuilder().setCustomId(`autoreact_modal_${cid}`).setTitle('Manage Channel Reactions');
    
    const config = db.getGuildConfig(interaction.guild.id);
    const reacts = config.autoReacts || {};
    const current = reacts[cid] ? reacts[cid].join(' ') : '';

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('emojis')
          .setLabel('Emojis (separated by space)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('e.g. \uD83D\uDC4D \uD83D\uDC4E <:custom:id>')
          .setValue(current)
      )
    );

    return interaction.showModal(modal);
  }
}

export async function handleAutoReactButton(interaction) {
  if (interaction.customId === 'autoreact_close') {
    return interaction.message.delete().catch(() => null);
  }
  if (interaction.customId === 'autoreact_clear') {
    db.updateGuildConfig(interaction.guild.id, { autoReacts: {} });
    return interaction.update(getAutoReactPanel(interaction.guild.id, interaction.client));
  }
}

export async function handleAutoReactModal(interaction) {
  const cid = interaction.customId.replace('autoreact_modal_', '');
  const emojiStr = interaction.fields.getTextInputValue('emojis') || '';
  
  // Extract all emojis without mangling them so they display correctly in the UI
  const rawEmojis = emojiStr.split(/\s+/).filter(e => e.length > 0);

  const config = db.getGuildConfig(interaction.guild.id);
  const reacts = config.autoReacts || {};
  
  if (rawEmojis.length === 0) {
    delete reacts[cid];
  } else {
    reacts[cid] = rawEmojis;
  }
  
  db.updateGuildConfig(interaction.guild.id, { autoReacts: reacts });
  return interaction.update(getAutoReactPanel(interaction.guild.id, interaction.client));
}

export default {
  name: 'autoreact',
  description: 'Manage Auto-React configurations',
  type: 1, // CHAT_INPUT
  async executePrefix(message) {
    const { isExtraOwner, isBotOwnerSync } = await import('../utils/helpers.js');
    if (message.guild.ownerId !== message.author.id && !isBotOwnerSync(message.author.id) && !isExtraOwner(message.guild.id, message.author.id)) {
      return message.reply({ content: '-# **You do not have permission to manage this system.**', flags: 64 });
    }
    await message.reply(getAutoReactPanel(message.guild.id, message.client));
  },
  async executeSlash(interaction) {
    const { isExtraOwner, isBotOwnerSync } = await import('../utils/helpers.js');
    if (interaction.guild.ownerId !== interaction.user.id && !isBotOwnerSync(interaction.user.id) && !isExtraOwner(interaction.guild.id, interaction.user.id)) {
      return interaction.reply({ content: '-# **You do not have permission to manage this system.**', flags: 64 });
    }
    await interaction.reply(getAutoReactPanel(interaction.guild.id, interaction.client));
  }
};
