import cv2 from '../cv2.js';
import { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import db from '../database.js';
import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI } from '../utils/emojis.js';

const TICK = '<a:black_dot:1544740123403620422>';
const ARROW = '<a:z_arrow_pink1:1523082728004653138>';

export function getYtStatsPanel(guildId, client) {
  const config = db.getGuildConfig(guildId) || {};
  const ytStats = config.ytStats || [];

  let activeText = '';
  if (ytStats.length === 0) {
    activeText = `-# **${ARROW} No active YouTube stat channels.**`;
  } else {
    for (const stat of ytStats) {
      activeText += `-# **${BULLET_EMOJI} <#${stat.channelId}>**  ${ARROW}  **${stat.handle}**  *(Format: ${stat.format})*\n`;
    }
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ytstats_bind').setLabel('Bind Existing VC').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ytstats_auto').setLabel('Add YouTube Channel').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ytstats_clear').setLabel('Wipe All Configs').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ytstats_refresh').setLabel('Force Refresh').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ytstats_close').setLabel('Close').setStyle(ButtonStyle.Secondary)
  );

  const container = {
    type: 17,
    components: [
      {
        type: 9,
        components: [
          {
            type: 10,
            content: `# ${getRandomHeadingGlyph()} YouTube Stats VC Engine\n\n-# Dynamically rename voice channels to display live YouTube subscriber counts.\n\n-# ${BULLET_EMOJI} Setup a new channel by clicking the Bind button below.`
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
        content: `-# **${TICK} System Documentation:**\n-# ${BULLET_EMOJI} **How it works:** Athena silently scrapes the YouTube channel in the background to fetch live subscriber counts, avoiding strict Google API Key quotas.\n-# ${BULLET_EMOJI} **Update Frequency:** To protect your server from being Rate-Limited by Discord (which aggressively bans rapid channel renames), Athena updates the stats exactly once every **10 minutes**.\n-# ${BULLET_EMOJI} **Format Template:** Use \`{subs}\`, \`{videos}\`, and \`{views}\` where you want the numbers to appear (e.g. \`Subs: {subs}\`).\n-# ${BULLET_EMOJI} **Pro Tip:** If you ever want to change the format of these channels after Auto-Setup creates them, you can just click the **Bind Existing VC** button, paste the ID of the channel it created, and type whatever custom format/text you want. The engine will instantly overwrite the format to your new layout!`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# **${TICK} Active Bound Channels:**\n${activeText}`
      },
      { type: 14, divider: true },
      row1.toJSON(),
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# **Athena Bulletproof Security !!!**`
      }
    ]
  };

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

export async function handleYtStatsButton(interaction) {
  if (interaction.customId === 'ytstats_close') {
    return interaction.message.delete().catch(() => null);
  }
  
  if (interaction.customId === 'ytstats_clear') {
    await interaction.deferUpdate();
    const config = db.getGuildConfig(interaction.guild.id) || {};
    const ytStats = config.ytStats || [];
    
    const categoriesToDelete = new Set();
    
    // Fetch all channels aggressively so we don't miss any that are uncached
    await interaction.guild.channels.fetch().catch(() => null);

    // 1. Delete channels known to DB
    for (const stat of ytStats) {
      const channel = interaction.guild.channels.cache.get(stat.channelId) || await interaction.guild.channels.fetch(stat.channelId).catch(() => null);
      if (channel) {
        if (channel.parentId) categoriesToDelete.add(channel.parentId);
        await channel.delete().catch(() => null);
      }
    }
    
    // 2. Aggressive sweeper for orphaned categories created by ytstats_auto
    interaction.guild.channels.cache.forEach(c => {
       if (c.type === 4 && (c.name.startsWith('▶') || c.name.includes('▶'))) {
          categoriesToDelete.add(c.id);
       }
    });

    // 3. Nuke categories and their orphaned children
    for (const catId of categoriesToDelete) {
      const category = interaction.guild.channels.cache.get(catId);
      if (category) {
        // Delete all children inside it first
        const children = interaction.guild.channels.cache.filter(c => c.parentId === category.id);
        for (const [id, child] of children) {
           await child.delete().catch(() => null);
        }
        await category.delete().catch(() => null);
      }
    }
    
    db.updateGuildConfig(interaction.guild.id, { ytStats: [] });
    return interaction.editReply(getYtStatsPanel(interaction.guild.id, interaction.client));
  }
  
  if (interaction.customId === 'ytstats_auto') {
    const modal = new ModalBuilder().setCustomId('ytstats_auto_modal').setTitle('Add YouTube Channel');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('yt_handle')
          .setLabel('YouTube Handle')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('@MrBeast')
      )
    );
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'ytstats_bind') {
    const modal = new ModalBuilder().setCustomId('ytstats_bind_modal').setTitle('Bind YouTube Stats VC');
    
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('vc_id')
          .setLabel('Voice Channel ID')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('123456789012345678')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('yt_handle')
          .setLabel('YouTube Handle')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('@MrBeast')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('format')
          .setLabel('Channel Name Format')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Subs: {count}')
          .setValue('Subs: {count}')
      )
    );
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'ytstats_refresh') {
    await interaction.deferReply({ flags: 64 }).catch(() => null);
    const { forceUpdateYtStats } = await import('../utils/ytStatsEngine.js');
    try {
      await forceUpdateYtStats(interaction.guild);
      await interaction.editReply({ content: 'Forced refresh complete! Note: If the name did not change, Discord may be rate-limiting the channel.' });
    } catch (e) {
      await interaction.editReply({ content: `Refresh failed: ${e.message}` });
    }
  }
}

export async function handleYtStatsModal(interaction) {
  if (interaction.customId === 'ytstats_auto_modal') {
    await interaction.reply({ content: '-# <a:loading:1542155051286396938> **Building YouTube Layout...**', flags: 64 }).catch(()=>null);
    let ytHandle = interaction.fields.getTextInputValue('yt_handle').trim();
    if (ytHandle.includes('youtube.com/')) {
      const parts = ytHandle.split('youtube.com/');
      ytHandle = parts[1];
    }
    ytHandle = ytHandle.split('?')[0].replace(/[\/]/g, '').trim();
    if (!ytHandle.startsWith('@') && !ytHandle.startsWith('UC')) ytHandle = '@' + ytHandle;

    try {
      const { ChannelType, PermissionFlagsBits } = await import('discord.js');
      const category = await interaction.guild.channels.create({
        name: `▶ ${ytHandle}`,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [{ id: interaction.guild.id, deny: [PermissionFlagsBits.Connect] }]
      });

      const subsChannel = await interaction.guild.channels.create({
        name: 'Subs: Loading...',
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites: [{ id: interaction.guild.id, deny: [PermissionFlagsBits.Connect] }]
      });

      const vidsChannel = await interaction.guild.channels.create({
        name: 'Videos: Loading...',
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites: [{ id: interaction.guild.id, deny: [PermissionFlagsBits.Connect] }]
      });

      const viewsChannel = await interaction.guild.channels.create({
        name: 'Views: Loading...',
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites: [{ id: interaction.guild.id, deny: [PermissionFlagsBits.Connect] }]
      });

      const db = (await import('../database.js')).default;
      const config = db.getGuildConfig(interaction.guild.id);
      const ytStats = config.ytStats || [];
      
      ytStats.push({ channelId: subsChannel.id, handle: ytHandle, format: 'Subs: {subs}' });
      ytStats.push({ channelId: vidsChannel.id, handle: ytHandle, format: 'Videos: {videos}' });
      ytStats.push({ channelId: viewsChannel.id, handle: ytHandle, format: 'Views: {views}' });
      
      db.updateGuildConfig(interaction.guild.id, { ytStats });
      
      const { forceUpdateYtStats } = await import('../utils/ytStatsEngine.js');
      forceUpdateYtStats(interaction.guild).catch(()=>null);
      
      return interaction.editReply({ content: '-# **Auto-Setup Complete!** Category and Channels created seamlessly.' }).catch(()=>null);
    } catch (e) {
      return interaction.editReply({ content: `-# **Error:** ${e.message}` }).catch(()=>null);
    }
  }
  if (interaction.customId === 'ytstats_bind_modal') {
    const vcId = interaction.fields.getTextInputValue('vc_id').trim();
    let ytHandle = interaction.fields.getTextInputValue('yt_handle').trim();
    const format = interaction.fields.getTextInputValue('format').trim();
    
    // Extract handle if they pasted a full URL
    if (ytHandle.includes('youtube.com/')) {
      const parts = ytHandle.split('youtube.com/');
      ytHandle = parts[1];
    }
    // Remove any trailing slashes, queries, or leading slashes
    ytHandle = ytHandle.split('?')[0].replace(/[\/]/g, '').trim();
    
    // Ensure handle starts with @ if it's not a UC channel ID
    if (!ytHandle.startsWith('@') && !ytHandle.startsWith('UC')) {
      ytHandle = '@' + ytHandle;
    }
    
    const config = db.getGuildConfig(interaction.guild.id);
    const ytStats = config.ytStats || [];
    
    // Check if VC already bound
    const existingIndex = ytStats.findIndex(s => s.channelId === vcId);
    if (existingIndex > -1) {
      ytStats[existingIndex] = { channelId: vcId, handle: ytHandle, format };
    } else {
      ytStats.push({ channelId: vcId, handle: ytHandle, format });
    }
    
    db.updateGuildConfig(interaction.guild.id, { ytStats });
    
    // Automatically Force Refresh on Save so the user sees it immediately
    const { forceUpdateYtStats } = await import('../utils/ytStatsEngine.js');
    forceUpdateYtStats(interaction.guild).catch(() => null);

    return interaction.update(getYtStatsPanel(interaction.guild.id, interaction.client)).catch(async () => {
      return interaction.reply({ content: '-# **YouTube Stats VC Bound Successfully!**', flags: 64 }).catch(() => null);
    });
  }
}

export default {
  name: 'ytstats',
  description: 'Manage YouTube Stats Voice Channels',
  type: 1,
  async executePrefix(message) {
    const { isExtraOwner, isBotOwnerSync } = await import('../utils/helpers.js');
    if (message.guild.ownerId !== message.author.id && !isBotOwnerSync(message.author.id) && !isExtraOwner(message.guild.id, message.author.id)) {
      return message.reply(cv2.danger('Access Denied', 'You do not have permission to manage this system.\n-# Required Clearance: Server Owner, Extra Owner, or Bot Owner.'));
    }
    await message.reply(getYtStatsPanel(message.guild.id, message.client));
  },
  async executeSlash(interaction) {
    const { isExtraOwner, isBotOwnerSync } = await import('../utils/helpers.js');
    if (interaction.guild.ownerId !== interaction.user.id && !isBotOwnerSync(interaction.user.id) && !isExtraOwner(interaction.guild.id, interaction.user.id)) {
      return interaction.reply({ ...cv2.danger('Access Denied', 'You do not have permission to manage this system.\n-# Required Clearance: Server Owner, Extra Owner, or Bot Owner.'), flags: MessageFlags.Ephemeral });
    }
    await interaction.reply(getYtStatsPanel(interaction.guild.id, interaction.client));
  }
};
