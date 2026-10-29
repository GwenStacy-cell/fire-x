import { ChannelType, PermissionFlagsBits } from 'discord.js';
import cv2 from '../cv2.js';
import { isAuthorized, isServerAdmin, logToSecurityChannel, isExtraOwnerOrHigher } from '../utils/helpers.js';

async function checkChannelAdminPerms(member, guild) {
  if (!member) return false;
  return isExtraOwnerOrHigher(member.id || member.user?.id, guild);
}

function resolveCategory(guild, input) {
  if (!input) return null;
  const cleanId = input.replace(/[<#>]/g, '').trim();
  const byId = guild.channels.cache.get(cleanId);
  if (byId && byId.type === ChannelType.GuildCategory) return byId;

  const lower = input.toLowerCase().trim();
  return guild.channels.cache.find(c => 
    c.type === ChannelType.GuildCategory && 
    c.name.toLowerCase() === lower
  ) || guild.channels.cache.find(c => 
    c.type === ChannelType.GuildCategory && 
    c.name.toLowerCase().includes(lower)
  );
}

async function executeCategoryDeletion(guild, targetCategory, moderatorTag, withAll) {
  const categoryName = targetCategory.name;
  const children = guild.channels.cache.filter(c => c.parentId === targetCategory.id);

  if (withAll) {
    let deletedCount = 0;
    let failedCount = 0;

    for (const [, child] of children) {
      const del = await child.delete(`Category wipe by ${moderatorTag}`).catch(() => null);
      if (del) deletedCount++;
      else failedCount++;
    }

    const catDel = await targetCategory.delete(`Deleted via deletecategoryall by ${moderatorTag}`).catch(() => null);
    if (!catDel) {
      return cv2.danger('Error', `Deleted **${deletedCount}** channel(s), but failed to delete the category itself. Check my permissions.`);
    }

    return cv2.success(
      'Category & Channels Deleted',
      `Successfully deleted category **${categoryName}** along with all channels inside it.`,
      [
        { name: 'Category', value: `\`${categoryName}\``, inline: true },
        { name: 'Channels Deleted', value: `\`${deletedCount} channels\``, inline: true }
      ]
    );
  } else {
    // Preserve channels by removing parent
    let preservedCount = 0;
    for (const [, child] of children) {
      await child.setParent(null, { reason: `Category unlinking by ${moderatorTag}` }).catch(() => null);
      preservedCount++;
    }

    const catDel = await targetCategory.delete(`Deleted via deletecategory by ${moderatorTag}`).catch(() => null);
    if (!catDel) {
      return cv2.danger('Error', `Failed to delete category **${categoryName}**. Check my permissions.`);
    }

    return cv2.success(
      'Category Deleted',
      `Successfully deleted category **${categoryName}**.\nAll channels inside have been preserved.`,
      [
        { name: 'Category', value: `\`${categoryName}\``, inline: true },
        { name: 'Preserved Channels', value: `\`${preservedCount} channels (now uncategorized)\``, inline: true }
      ]
    );
  }
}

export const createChannelCmd = {
  name: 'createchannel',
  aliases: ['createc', 'makechannel'],
  description: 'Creates a new text channel in the server.',
  category: 'utility',
  permissions: [PermissionFlagsBits.ManageChannels],
  slashHidden: true,
  async executeSlash() {},
  async executePrefix(message, args) {
    if (!await checkChannelAdminPerms(message.member, message.guild)) {
      return message.reply(cv2.danger('Permission Denied', 'You do not have permission to manage channels.'));
    }

    if (!args.length) {
      return message.reply(cv2.warn('Missing Argument', 'Please provide a channel name.\n**Usage:** `!createchannel <name>`'));
    }

    const channelName = args.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!channelName) {
      return message.reply(cv2.warn('Invalid Name', 'Channel name must contain valid characters (letters, numbers, dashes).'));
    }

    const newChannel = await message.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: message.channel.parentId || undefined,
      reason: `Created via !createchannel by ${message.author.tag}`
    }).catch(() => null);

    if (!newChannel) {
      return message.reply(cv2.danger('Error', 'Failed to create channel. Check my permissions.'));
    }

    await message.reply(cv2.success('Channel Created', `Successfully created ${newChannel}.\n**Name:** \`${newChannel.name}\``));
  }
};

export const deleteChannelCmd = {
  name: 'deletechannel',
  aliases: ['delc', 'removechannel'],
  description: 'Deletes one or more channels. Separate multiple with commas or spaces.',
  category: 'utility',
  permissions: [PermissionFlagsBits.ManageChannels],
  slashHidden: true,
  async executeSlash() {},
  async executePrefix(message, args) {
    if (!await checkChannelAdminPerms(message.member, message.guild)) {
      return message.reply(cv2.danger('Permission Denied', 'You do not have permission to manage channels.'));
    }

    if (!args.length) {
      return message.reply(cv2.warn('Missing Argument', 'Please mention one or more channels or provide their IDs.\n**Usage:** `!deletechannel #channel1, 1234567890, #channel3`'));
    }

    const inputString = args.join(' ');
    let targets = inputString.includes(',')
      ? inputString.split(',').map(s => s.trim()).filter(Boolean)
      : inputString.split(/\s+/).filter(Boolean);

    // If no commas and multiple space-tokens, check if it's one multi-word name
    if (!inputString.includes(',') && targets.length > 1 && !inputString.includes('<#')) {
      const exactMatch = message.guild.channels.cache.find(c => c.name.toLowerCase() === inputString.toLowerCase().replace(/^#/, ''));
      if (exactMatch) targets = [inputString];
    }

    let deletedCount = 0;
    let failedCount = 0;

    for (const search of targets) {
      const channelId = search.replace(/<#|>/g, '');
      const targetChannel = message.guild.channels.cache.get(channelId) ||
        message.guild.channels.cache.find(c => c.name.toLowerCase() === search.toLowerCase().replace(/^#/, ''));

      if (targetChannel) {
        const deleted = await targetChannel.delete(`Deleted via !deletechannel by ${message.author.tag}`).catch(() => null);
        if (deleted) deletedCount++;
        else failedCount++;
      } else {
        failedCount++;
      }
    }

    if (deletedCount === 0) {
      return message.reply(cv2.danger('Error', 'Could not delete any of the specified channels. Check IDs, names, or my permissions.'));
    }

    const msg = `Successfully deleted **${deletedCount}** channel(s).` + (failedCount > 0 ? `\nFailed to delete **${failedCount}**.` : '');
    await message.reply(cv2.success('Channels Deleted', msg)).catch(() => null);
  }
};

export const createVcCmd = {
  name: 'createvc',
  aliases: ['makevc', 'createvoice', 'vccreate'],
  description: 'Creates a new voice channel in the server.',
  category: 'utility',
  permissions: [PermissionFlagsBits.ManageChannels],
  options: [
    {
      name: 'name',
      description: 'Name of the voice channel',
      type: 3,
      required: true
    },
    {
      name: 'category',
      description: 'Category to place the voice channel in',
      type: 7,
      channel_types: [ChannelType.GuildCategory],
      required: false
    },
    {
      name: 'user_limit',
      description: 'Maximum user limit (0 for unlimited, max 99)',
      type: 4,
      min_value: 0,
      max_value: 99,
      required: false
    }
  ],
  async executePrefix(message, args) {
    if (!await checkChannelAdminPerms(message.member, message.guild)) {
      return message.reply(cv2.danger('Permission Denied', 'You do not have permission to manage channels.'));
    }

    if (!args.length) {
      return message.reply(cv2.warn(
        'Missing Argument', 
        'Please provide a voice channel name.\n**Usage:** `!createvc <name> [userLimit]`\n**Examples:** `!createvc Gaming` or `!createvc Duo 2`'
      ));
    }

    let userLimit = 0;
    let tokens = [...args];
    const lastToken = tokens[tokens.length - 1];
    if (tokens.length > 1 && /^\d+$/.test(lastToken) && Number(lastToken) >= 0 && Number(lastToken) <= 99) {
      userLimit = Number(lastToken);
      tokens.pop();
    }

    const vcName = tokens.join(' ').trim();
    if (!vcName) {
      return message.reply(cv2.warn('Invalid Name', 'Voice channel name cannot be empty.'));
    }

    const parentId = message.channel.parentId || undefined;

    const newVc = await message.guild.channels.create({
      name: vcName,
      type: ChannelType.GuildVoice,
      parent: parentId,
      userLimit: userLimit,
      reason: `Created via !createvc by ${message.author.tag}`
    }).catch(() => null);

    if (!newVc) {
      return message.reply(cv2.danger('Error', 'Failed to create voice channel. Check my permissions and channel limits.'));
    }

    const fields = [
      { name: 'Channel', value: `${newVc}`, inline: true },
      { name: 'Name', value: `\`${newVc.name}\``, inline: true }
    ];
    if (newVc.parent) fields.push({ name: 'Category', value: `\`${newVc.parent.name}\``, inline: true });
    if (userLimit > 0) fields.push({ name: 'User Limit', value: `\`${userLimit} users\``, inline: true });

    await message.reply(cv2.success('Voice Channel Created', `Successfully deployed new voice channel.`, fields));
  },
  async executeSlash(interaction) {
    if (!await checkChannelAdminPerms(interaction.member, interaction.guild)) {
      return interaction.reply(cv2.danger('Permission Denied', 'You do not have permission to manage channels.'));
    }

    const name = interaction.options.getString('name');
    const category = interaction.options.getChannel('category');
    const userLimit = interaction.options.getInteger('user_limit') || 0;

    const newVc = await interaction.guild.channels.create({
      name: name,
      type: ChannelType.GuildVoice,
      parent: category?.id || undefined,
      userLimit: userLimit,
      reason: `Created via /createvc by ${interaction.user.tag}`
    }).catch(() => null);

    if (!newVc) {
      return interaction.reply(cv2.danger('Error', 'Failed to create voice channel. Check my permissions.'));
    }

    const fields = [
      { name: 'Channel', value: `${newVc}`, inline: true },
      { name: 'Name', value: `\`${newVc.name}\``, inline: true }
    ];
    if (newVc.parent) fields.push({ name: 'Category', value: `\`${newVc.parent.name}\``, inline: true });
    if (userLimit > 0) fields.push({ name: 'User Limit', value: `\`${userLimit} users\``, inline: true });

    await interaction.reply(cv2.success('Voice Channel Created', `Successfully deployed new voice channel.`, fields));
  }
};

export const deleteCategoryCmd = {
  name: 'deletecategory',
  aliases: ['delcat', 'catdelete', 'removecategory'],
  description: 'Deletes a category (preserves channels, or pass "all" to delete all channels inside).',
  category: 'utility',
  permissions: [PermissionFlagsBits.ManageChannels],
  options: [
    {
      name: 'category',
      description: 'The category to delete',
      type: 7,
      channel_types: [ChannelType.GuildCategory],
      required: true
    },
    {
      name: 'delete_channels',
      description: 'Delete all channels inside this category as well (Default: False)',
      type: 5,
      required: false
    }
  ],
  async executePrefix(message, args) {
    if (!await checkChannelAdminPerms(message.member, message.guild)) {
      return message.reply(cv2.danger('Permission Denied', 'You do not have permission to manage channels.'));
    }

    if (!args.length) {
      return message.reply(cv2.warn(
        'Missing Argument', 
        'Please specify a category name or ID.\n\n**Usage:**\n`!delcat <category>` - Delete category (keeps channels safe)\n`!delcatall <category>` - Delete category AND all its channels\n`!delcat <category> all` - Delete category AND all its channels'
      ));
    }

    let withAll = false;
    let tokens = [...args];
    const lastToken = tokens[tokens.length - 1].toLowerCase();
    if (lastToken === 'all' || lastToken === '--all' || lastToken === '-a') {
      withAll = true;
      tokens.pop();
    }

    const query = tokens.join(' ').trim();
    const targetCategory = resolveCategory(message.guild, query);
    if (!targetCategory) {
      return message.reply(cv2.warn('Category Not Found', `Could not find a category matching \`${query}\`. Make sure it is a valid category name or ID.`));
    }

    const result = await executeCategoryDeletion(message.guild, targetCategory, message.author.tag, withAll);
    await message.reply(result);
  },
  async executeSlash(interaction) {
    if (!await checkChannelAdminPerms(interaction.member, interaction.guild)) {
      return interaction.reply(cv2.danger('Permission Denied', 'You do not have permission to manage channels.'));
    }

    const targetCategory = interaction.options.getChannel('category');
    const withAll = interaction.options.getBoolean('delete_channels') || false;

    if (!targetCategory || targetCategory.type !== ChannelType.GuildCategory) {
      return interaction.reply(cv2.warn('Invalid Category', 'Selected channel is not a category.'));
    }

    const result = await executeCategoryDeletion(interaction.guild, targetCategory, interaction.user.tag, withAll);
    await interaction.reply(result);
  }
};

export const deleteCategoryAllCmd = {
  name: 'deletecategoryall',
  aliases: ['delcatall', 'catdeleteall'],
  description: 'Deletes a category AND all channels inside it.',
  category: 'utility',
  permissions: [PermissionFlagsBits.ManageChannels],
  options: [
    {
      name: 'category',
      description: 'The category to delete along with all its channels',
      type: 7,
      channel_types: [ChannelType.GuildCategory],
      required: true
    }
  ],
  async executePrefix(message, args) {
    if (!await checkChannelAdminPerms(message.member, message.guild)) {
      return message.reply(cv2.danger('Permission Denied', 'You do not have permission to manage channels.'));
    }

    if (!args.length) {
      return message.reply(cv2.warn('Missing Argument', 'Please specify a category name or ID to delete along with all its channels.\n**Usage:** `!delcatall <category>`'));
    }

    const query = args.join(' ').trim();
    const targetCategory = resolveCategory(message.guild, query);
    if (!targetCategory) {
      return message.reply(cv2.warn('Category Not Found', `Could not find a category matching \`${query}\`. Make sure it is a valid category name or ID.`));
    }

    const result = await executeCategoryDeletion(message.guild, targetCategory, message.author.tag, true);
    await message.reply(result);
  },
  async executeSlash(interaction) {
    if (!await checkChannelAdminPerms(interaction.member, interaction.guild)) {
      return interaction.reply(cv2.danger('Permission Denied', 'You do not have permission to manage channels.'));
    }

    const targetCategory = interaction.options.getChannel('category');
    if (!targetCategory || targetCategory.type !== ChannelType.GuildCategory) {
      return interaction.reply(cv2.warn('Invalid Category', 'Selected channel is not a category.'));
    }

    const result = await executeCategoryDeletion(interaction.guild, targetCategory, interaction.user.tag, true);
    await interaction.reply(result);
  }
};

export const commands = [
  createChannelCmd, 
  deleteChannelCmd, 
  createVcCmd, 
  deleteCategoryCmd, 
  deleteCategoryAllCmd
];
