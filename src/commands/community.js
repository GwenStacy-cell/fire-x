import { PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, RoleSelectMenuBuilder, MessageFlags } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';

export function buildVoiceRolePanel(guild) {
  const config = db.getGuildConfig(guild.id) || {};
  const voiceRoleId = config.voiceRoleId;
  const role = voiceRoleId ? (guild.roles.cache.get(voiceRoleId) || null) : null;
  const isEnabled = !!(voiceRoleId && role);

  const statusIndicator = isEnabled
    ? '<a:uptime:1552608831060844575> **ACTIVE & ENFORCING**'
    : '`OFFLINE / DISABLED`';

  const roleDisplay = role
    ? `${role} (\`${role.name}\` • ID: \`${role.id}\`)`
    : (voiceRoleId ? `\`<Deleted Role: ${voiceRoleId}>\`` : '`None (Not configured)`');

  const row1 = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('vcrole_select')
      .setPlaceholder('Select Voice Role to auto-assign...')
      .setMinValues(1)
      .setMaxValues(1)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('vcrole_disable')
      .setLabel('Disable Voice Role')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!voiceRoleId),
    new ButtonBuilder()
      .setCustomId('vcrole_close')
      .setLabel('Close')
      .setStyle(ButtonStyle.Secondary)
  );

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content:
          `# Voice Role Matrix | <a:03_tick_circle:1565665642084827206>\n` +
          `-# **__Automated Voice Channel Role Synchronization Engine__**\n\n` +
          `-# • **System Status:** ${statusIndicator}\n` +
          `-# • **Current Voice Role:** ${roleDisplay}\n` +
          `-# • **Assignment Rule:** Instantly granted upon connecting to **any** voice channel; revoked automatically upon disconnect.\n` +
          `-# • **Hierarchy Requirement:** Bot's highest role must be positioned above the bound role with **Manage Roles** permission.`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          `-# **__Command Syntax__**\n` +
          `-# • \`!voicerole <@role / ID / Name>\` - Bind a specific voice role\n` +
          `-# • \`!voicerole disable\` - Turn off automatic voice roles\n` +
          `-# • Or use the dropdown menu below to select a role directly:`
      },
      { type: 14, divider: true },
      row1.toJSON(),
      row2.toJSON(),
      { type: 14, divider: true },
      {
        type: 10,
        content: '-# Athena Prime Defense Matrix • Voice Systems'
      }
    ]
  };

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

export async function syncVoiceRoles(guild, targetRoleId, isDisabling = false) {
  if (!guild || !targetRoleId) return;
  try {
    const botMember = guild.members.me || await guild.members.fetch(guild.client.user.id).catch(() => null);
    if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return;

    const role = guild.roles.cache.get(targetRoleId) || await guild.roles.fetch(targetRoleId).catch(() => null);
    if (!role || botMember.roles.highest.position <= role.position) return;

    if (isDisabling) {
      try {
        await guild.members.fetch().catch(() => null);
      } catch {}
      for (const [, member] of role.members) {
        await member.roles.remove(role, 'Athena VoiceRole: System disabled').catch(() => null);
      }
      return;
    }

    const activeVcMemberIds = new Set();
    const voiceStates = guild.voiceStates.cache;
    for (const [memberId, vs] of voiceStates) {
      if (vs.channelId) {
        activeVcMemberIds.add(memberId);
        const member = vs.member || guild.members.cache.get(memberId) || await guild.members.fetch(memberId).catch(() => null);
        if (member && !member.roles.cache.has(role.id)) {
          await member.roles.add(role, 'Athena VoiceRole: Active voice member sync').catch(() => null);
        }
      }
    }

    // Clean up members who hold the role but are not in voice channels
    for (const [memberId, member] of role.members) {
      if (!activeVcMemberIds.has(memberId)) {
        await member.roles.remove(role, 'Athena VoiceRole: Inactive voice member cleanup').catch(() => null);
      }
    }
  } catch (err) {
    console.error('[VoiceRole] Error syncing voice roles:', err);
  }
}

export async function handleVoiceRoleInteraction(interaction) {
  if (!interaction.customId.startsWith('vcrole_')) return;

  const { isExtraOwner, isBotOwnerSync } = await import('../utils/helpers.js');
  const isAuthorized = interaction.guild.ownerId === interaction.user.id ||
    isBotOwnerSync(interaction.user.id) ||
    isExtraOwner(interaction.guild.id, interaction.user.id) ||
    interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    interaction.member.permissions.has(PermissionFlagsBits.ManageRoles);

  if (!isAuthorized) {
    return interaction.reply({ content: '-# **You do not possess the required permissions to manage this system.**', flags: 64 });
  }

  if (interaction.customId === 'vcrole_close') {
    return interaction.message.delete().catch(() => {
      interaction.update({ components: [] }).catch(() => null);
    });
  }

  if (interaction.customId === 'vcrole_disable') {
    const oldRoleId = db.getVoiceRole(interaction.guild.id);
    db.setVoiceRole(interaction.guild.id, null);
    if (oldRoleId) syncVoiceRoles(interaction.guild, oldRoleId, true).catch(() => null);
    const payload = buildVoiceRolePanel(interaction.guild);
    return interaction.update(payload).catch(() => null);
  }

  if (interaction.customId === 'vcrole_select') {
    const roleId = interaction.values[0];
    const role = interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null);

    if (!role) {
      return interaction.reply({ content: '-# **Error:** Selected role was not found.', flags: 64 });
    }

    if (role.id === interaction.guild.id) {
      return interaction.reply({ content: '-# **Error:** You cannot set `@everyone` as a voice role.', flags: 64 });
    }

    if (role.managed) {
      return interaction.reply({ content: '-# **Error:** You cannot set an integration, bot, or booster managed role as a voice role.', flags: 64 });
    }

    const botMember = interaction.guild.members.me || await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
    if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: '-# **Error:** The bot requires the **Manage Roles** permission to assign voice roles.', flags: 64 });
    }

    if (botMember.roles.highest.position <= role.position) {
      return interaction.reply({ content: `-# **Error:** The role ${role} is positioned higher than or equal to the bot's highest role. Please move the bot's role above ${role} in Server Settings.`, flags: 64 });
    }

    const oldRoleId = db.getVoiceRole(interaction.guild.id);
    db.setVoiceRole(interaction.guild.id, role.id);
    if (oldRoleId && oldRoleId !== role.id) {
      syncVoiceRoles(interaction.guild, oldRoleId, true).catch(() => null);
    }
    syncVoiceRoles(interaction.guild, role.id, false).catch(() => null);
    const payload = buildVoiceRolePanel(interaction.guild);
    return interaction.update(payload).catch(() => null);
  }
}

export const commands = [
  {
    name: 'suggest',
    aliases: ['suggestion'],
    description: 'Submit a suggestion to the server.',
    category: 'community',
    permissions: [],
    async executePrefix(message, args) {
      if (!args.length) return message.reply(cv2.info('Suggest Command', 'Usage: `!suggest [your idea]`'));
      
      const config = db.getGuildConfig(message.guild.id);
      if (!config || !config.suggestionChannelId) {
        return message.reply(cv2.warn('Suggestions Disabled', 'This server has not configured a suggestions channel yet.'));
      }
      
      const suggestionChannel = message.guild.channels.cache.get(config.suggestionChannelId);
      if (!suggestionChannel) return message.reply(cv2.danger('Error', 'The configured suggestions channel no longer exists.'));
      
      const idea = args.join(' ');
      
      const embed = new EmbedBuilder()
        .setAuthor({ name: `${message.author.tag} suggests:`, iconURL: message.author.displayAvatarURL() })
        .setDescription(idea)
        .setColor(0x2b2d31)
        .setFooter({ text: `User ID: ${message.author.id}` })
        .setTimestamp();
        
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sug_up').setEmoji('👍').setStyle(ButtonStyle.Secondary).setLabel('0'),
        new ButtonBuilder().setCustomId('sug_down').setEmoji('👎').setStyle(ButtonStyle.Secondary).setLabel('0')
      );
      
      try {
        await suggestionChannel.send({ embeds: [embed], components: [row] });
        await message.reply(cv2.success('Suggestion Submitted', `Your suggestion has been posted in <#${config.suggestionChannelId}>!`));
      } catch (err) {
        message.reply(cv2.danger('Error', 'Failed to post suggestion. Check channel permissions.'));
      }
    }
  },
  {
    name: 'setsuggestions',
    aliases: ['suggestchannel'],
    description: 'Set the channel for server suggestions.',
    category: 'admin',
    permissions: [PermissionFlagsBits.ManageGuild],
    async executePrefix(message, args) {
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply(cv2.info('Setup Suggestions', 'Usage: `!setsuggestions <#channel>`'));
      
      db.updateGuildConfig(message.guild.id, { suggestionChannelId: channel.id });
      await message.reply(cv2.success('Suggestions Enabled', `All suggestions will now be posted in ${channel}.`));
    }
  },
  {
    name: 'starboard',
    description: 'Configure the starboard system.',
    category: 'admin',
    permissions: [PermissionFlagsBits.ManageGuild],
    async executePrefix(message, args) {
      if (args[0] === 'disable') {
        db.updateGuildConfig(message.guild.id, { starboardChannelId: null });
        return message.reply(cv2.success('Starboard Disabled', 'The starboard system has been disabled.'));
      }
      
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply(cv2.info('Starboard Setup', 'Usage: `!starboard <#channel> [stars_required]`\nTo disable: `!starboard disable`'));
      
      const threshold = parseInt(args[1]) || 3;
      db.updateGuildConfig(message.guild.id, { starboardChannelId: channel.id, starboardThreshold: threshold });
      await message.reply(cv2.success('Starboard Enabled', `Messages with **${threshold} ⭐** reactions will be posted in ${channel}.`));
    }
  },
  {
    name: 'voicerole',
    aliases: ['vcrole', 'voice-role'],
    description: 'Configure a role to be automatically assigned to members in voice channels.',
    category: 'admin',
    permissions: [PermissionFlagsBits.ManageGuild],
    options: [
      {
        name: 'role',
        description: 'The role to automatically assign to members in voice channels (leave empty to view panel)',
        type: 8,
        required: false
      },
      {
        name: 'disable',
        description: 'Disable the automatic voice role system',
        type: 5,
        required: false
      }
    ],
    async executePrefix(message, args) {
      const { isExtraOwner, isBotOwnerSync } = await import('../utils/helpers.js');
      const isAuthorized = message.guild.ownerId === message.author.id ||
        isBotOwnerSync(message.author.id) ||
        isExtraOwner(message.guild.id, message.author.id) ||
        message.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
        message.member.permissions.has(PermissionFlagsBits.ManageRoles);

      if (!isAuthorized) {
        return message.reply(cv2.danger('Access Denied', 'You do not possess the required permissions to execute this command.'));
      }

      if (!args.length) {
        const payload = buildVoiceRolePanel(message.guild);
        return message.reply(payload);
      }

      const sub = args[0].toLowerCase();
      if (['disable', 'off', 'remove', 'clear', 'reset', 'none'].includes(sub)) {
        const oldRoleId = db.getVoiceRole(message.guild.id);
        db.setVoiceRole(message.guild.id, null);
        if (oldRoleId) syncVoiceRoles(message.guild, oldRoleId, true).catch(() => null);
        return message.reply(cv2.success('Voice Role Disabled', 'The automatic voice role system has been disabled.'));
      }

      let role = message.mentions.roles.first();
      if (!role && args[0]) {
        const cleanId = args[0].replace(/[<@&>]/g, '');
        role = message.guild.roles.cache.get(cleanId);
      }
      if (!role && args.length > 0) {
        const query = args.join(' ').toLowerCase();
        role = message.guild.roles.cache.find(r => r.name.toLowerCase() === query);
      }

      if (!role) {
        return message.reply(cv2.warn('Invalid Role', `Could not find a valid role matching \`${args.join(' ')}\`.\n\nUsage: \`!voicerole <@role / ID / Name>\`\nTo disable: \`!voicerole disable\``));
      }

      if (role.id === message.guild.id) {
        return message.reply(cv2.danger('Invalid Role', 'You cannot assign `@everyone` as a voice role.'));
      }

      if (role.managed) {
        return message.reply(cv2.danger('Managed Role', 'You cannot set an integration, bot, or booster managed role as a voice role.'));
      }

      const botMember = message.guild.members.me || await message.guild.members.fetch(message.client.user.id).catch(() => null);
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return message.reply(cv2.danger('Missing Permissions', 'The bot requires the **Manage Roles** permission to assign voice roles.'));
      }

      if (botMember.roles.highest.position <= role.position) {
        return message.reply(cv2.danger('Role Hierarchy Error', `The role ${role} is positioned higher than or equal to the bot's highest role. Please move the bot's role above ${role} in Server Settings.`));
      }

      const oldRoleId = db.getVoiceRole(message.guild.id);
      db.setVoiceRole(message.guild.id, role.id);
      if (oldRoleId && oldRoleId !== role.id) {
        syncVoiceRoles(message.guild, oldRoleId, true).catch(() => null);
      }
      syncVoiceRoles(message.guild, role.id, false).catch(() => null);
      await message.reply(cv2.success('Voice Role Enabled', `The role ${role} (\`${role.name}\`) will now be automatically given to members when they join any voice channel, and revoked when they disconnect.`));
    },

    async executeSlash(interaction) {
      const { isExtraOwner, isBotOwnerSync } = await import('../utils/helpers.js');
      const isAuthorized = interaction.guild.ownerId === interaction.user.id ||
        isBotOwnerSync(interaction.user.id) ||
        isExtraOwner(interaction.guild.id, interaction.user.id) ||
        interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
        interaction.member.permissions.has(PermissionFlagsBits.ManageRoles);

      if (!isAuthorized) {
        return interaction.reply({ ...cv2.danger('Access Denied', 'You do not possess the required permissions to execute this command.'), flags: 64 });
      }

      const shouldDisable = interaction.options.getBoolean('disable');
      if (shouldDisable) {
        const oldRoleId = db.getVoiceRole(interaction.guild.id);
        db.setVoiceRole(interaction.guild.id, null);
        if (oldRoleId) syncVoiceRoles(interaction.guild, oldRoleId, true).catch(() => null);
        return interaction.reply(cv2.success('Voice Role Disabled', 'The automatic voice role system has been disabled.'));
      }

      const role = interaction.options.getRole('role');
      if (!role) {
        const payload = buildVoiceRolePanel(interaction.guild);
        return interaction.reply(payload);
      }

      if (role.id === interaction.guild.id) {
        return interaction.reply({ ...cv2.danger('Invalid Role', 'You cannot assign `@everyone` as a voice role.'), flags: 64 });
      }

      if (role.managed) {
        return interaction.reply({ ...cv2.danger('Managed Role', 'You cannot set an integration, bot, or booster managed role as a voice role.'), flags: 64 });
      }

      const botMember = interaction.guild.members.me || await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({ ...cv2.danger('Missing Permissions', 'The bot requires the **Manage Roles** permission to assign voice roles.'), flags: 64 });
      }

      if (botMember.roles.highest.position <= role.position) {
        return interaction.reply({ ...cv2.danger('Role Hierarchy Error', `The role ${role} is positioned higher than or equal to the bot's highest role. Please move the bot's role above ${role} in Server Settings.`), flags: 64 });
      }

      const oldRoleId = db.getVoiceRole(interaction.guild.id);
      db.setVoiceRole(interaction.guild.id, role.id);
      if (oldRoleId && oldRoleId !== role.id) {
        syncVoiceRoles(interaction.guild, oldRoleId, true).catch(() => null);
      }
      syncVoiceRoles(interaction.guild, role.id, false).catch(() => null);
      await interaction.reply(cv2.success('Voice Role Enabled', `The role ${role} (\`${role.name}\`) will now be automatically given to members when they join any voice channel, and revoked when they disconnect.`));
    }
  }
];

export async function handleSuggestionButtons(interaction) {
  if (!interaction.customId.startsWith('sug_')) return;
  
  const msg = interaction.message;
  if (!msg.embeds.length) return;
  
  // Anti-spam logic: fetch users who clicked
  const upBtn = msg.components[0].components[0];
  const downBtn = msg.components[0].components[1];
  
  let upCount = parseInt(upBtn.label) || 0;
  let downCount = parseInt(downBtn.label) || 0;
  
  // We'll use a local cache per message to track who voted.
  if (!msg.client.suggestionVotes) msg.client.suggestionVotes = new Map();
  if (!msg.client.suggestionVotes.has(msg.id)) msg.client.suggestionVotes.set(msg.id, new Map());
  
  const voters = msg.client.suggestionVotes.get(msg.id);
  const currentVote = voters.get(interaction.user.id);
  const action = interaction.customId === 'sug_up' ? 'up' : 'down';
  
  if (currentVote === action) {
    // Retracting vote
    voters.delete(interaction.user.id);
    if (action === 'up') upCount--;
    else downCount--;
    await interaction.reply({ content: 'Vote retracted.', flags: MessageFlags.Ephemeral });
  } else {
    // Changing or new vote
    if (currentVote === 'up') upCount--;
    if (currentVote === 'down') downCount--;
    
    if (action === 'up') upCount++;
    else downCount++;
    
    voters.set(interaction.user.id, action);
    await interaction.reply({ content: 'Vote registered.', flags: MessageFlags.Ephemeral });
  }
  
  const newRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sug_up').setEmoji('👍').setStyle(ButtonStyle.Secondary).setLabel(String(upCount)),
    new ButtonBuilder().setCustomId('sug_down').setEmoji('👎').setStyle(ButtonStyle.Secondary).setLabel(String(downCount))
  );
  
  await msg.edit({ components: [newRow] }).catch(()=>null);
}
