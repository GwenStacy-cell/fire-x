import { PermissionFlagsBits } from 'discord.js';
import cv2 from '../cv2.js';
import { BULLET_EMOJI } from '../utils/emojis.js';
import db from '../database.js';
import { isAuthorized, isBotOwnerSync } from '../utils/helpers.js';

async function handleMassRole(context, role, action) {
  const guild = context.guild;
  const executor = context.author || context.user;
  
  const highestBotRole = guild.members.me.roles.highest.position;
  const highestUserRole = context.member?.roles.highest.position;

  if (role.position >= highestBotRole) {
    const reply = cv2.danger('Hierarchy Error', 'My highest role must be above the role you are trying to manage.');
    return context.reply ? await context.reply(reply) : await context.editReply(reply);
  }
  
  if (!isBotOwnerSync(executor.id) && guild.ownerId !== executor.id && role.position >= highestUserRole) {
    const reply = cv2.danger('Hierarchy Error', 'Your highest role must be above the role you are trying to manage.');
    return context.reply ? await context.reply(reply) : await context.editReply(reply);
  }

  const isSlash = !!context.commandName;
  
  
  const actionName = action === 'add' ? 'Add' : action === 'remove' ? 'Remove' : action === 'strip' ? 'Strip' : 'Restore';
  
  const initialReply = cv2.success(`Mass ${actionName} Started`, `Processing \`${role.name}\`...`);
  let statusMessage;
  if (isSlash) {
    statusMessage = await context.reply({ ...initialReply, withResponse: true });
    
  } else {
    statusMessage = await context.reply(initialReply);
  }

  try {
    const members = await guild.members.fetch();
    let successCount = 0;
    let failCount = 0;
    
    let targets;
    if (action === 'add') {
      targets = members.filter(m => !m.roles.cache.has(role.id));
    } else if (action === 'remove') {
      targets = members.filter(m => m.roles.cache.has(role.id));
    } else if (action === 'strip') {
      targets = members.filter(m => m.roles.cache.has(role.id));
      const targetIds = Array.from(targets.keys());
      db.saveMassRole(guild.id, role.id, targetIds);
    } else if (action === 'restore') {
      const savedIds = db.getMassRole(guild.id, role.id) || [];
      if (savedIds.length === 0) {
        return statusMessage.edit(cv2.warn('No Backup', `No backup found for \`${role.name}\`. Nothing to restore.`)).catch(() => null);
      }
      targets = members.filter(m => savedIds.includes(m.id) && !m.roles.cache.has(role.id));
    }
    
    if (targets.size === 0) {
      const finishEmbed = cv2.success(`Mass ${actionName} Completed`, `Nobody needed the role changed!`);
      return statusMessage.edit(finishEmbed).catch(() => null);
    }
    
    const targetArray = Array.from(targets.values());
    
    for (let i = 0; i < targetArray.length; i += 50) {
      const chunk = targetArray.slice(i, i + 50);
      await Promise.allSettled(chunk.map(async m => {
        try {
          if (action === 'add' || action === 'restore') await m.roles.add(role);
          else await m.roles.remove(role);
          successCount++;
        } catch (e) {
          failCount++;
        }
      }));
    }
    
    const finishEmbed = cv2.success(
      `Mass ${actionName} Completed`, 
      `Successfully processed ${action === 'add' || action === 'restore' ? 'addition' : 'removal'} for **${successCount}** members.\nFailed: **${failCount}**`
    );
    await statusMessage.edit(finishEmbed).catch(() => null);
  } catch (err) {
    console.error(err);
    const errEmbed = cv2.danger('Execution Error', 'Something went wrong during mass role assignment.');
    await statusMessage.edit(errEmbed).catch(() => null);
  }
}



// ==========================================
// CREATEROLE INTERACTIVE PANEL
// ==========================================

const ALL_PERMISSIONS = [
  ['Administrator', 'Administrator'],
  ['ManageGuild', 'Manage Server'],
  ['ManageRoles', 'Manage Roles'],
  ['ManageChannels', 'Manage Channels'],
  ['KickMembers', 'Kick Members'],
  ['BanMembers', 'Ban Members'],
  ['MuteMembers', 'Mute Members'],
  ['DeafenMembers', 'Deafen Members'],
  ['MoveMembers', 'Move Members'],
  ['ManageMessages', 'Manage Messages'],
  ['ManageNicknames', 'Manage Nicknames'],
  ['ManageWebhooks', 'Manage Webhooks'],
  ['ManageEmojisAndStickers', 'Manage Emojis'],
  ['ViewAuditLog', 'View Audit Log'],
  ['MentionEveryone', 'Mention Everyone'],
  ['SendMessages', 'Send Messages'],
  ['ReadMessageHistory', 'Read History'],
  ['EmbedLinks', 'Embed Links'],
  ['AttachFiles', 'Attach Files'],
  ['UseExternalEmojis', 'External Emojis'],
  ['AddReactions', 'Add Reactions'],
  ['Connect', 'Connect VC'],
  ['Speak', 'Speak VC'],
  ['Stream', 'Stream'],
  ['SetVoiceChannelStatus', 'Set VC Status'],
  ['UseApplicationCommands', 'Use Slash Cmds'],
];

const PERM_PAGE_SIZE = 15;
export const createRoleStates = new Map();

export function buildCreateRolePanel(state) {
  const { name, color, perms, page, position } = state;
  const totalPages = Math.ceil(ALL_PERMISSIONS.length / PERM_PAGE_SIZE);
  const start = page * PERM_PAGE_SIZE;
  const pagePerms = ALL_PERMISSIONS.slice(start, start + PERM_PAGE_SIZE);

  const permLines = pagePerms.map(([key, label]) =>
    `${perms.includes(key) ? '<:on:1533844867191406672>' : '<:off:1533844858983157851>'} **${label}**`
  ).join('\n');

  const makeButtons = (slice) => slice.map(([key, label]) => ({
    type: 2, style: perms.includes(key) ? 3 : 2,
    custom_id: `cr_perm_${key}`, label: label.substring(0, 25)
  }));

  const rows = [];
  for (let i = 0; i < pagePerms.length; i += 5) {
    rows.push({ type: 1, components: makeButtons(pagePerms.slice(i, i + 5)) });
  }

  const container = {
    type: 17,
    components: [
      { type: 10, content: `## Create Role — Builder\n**Name:** ${name || '_Not set_'} | **Color:** ${color || '_None_'} | **Position:** ${position != null ? `#${position}` : '_Bottom_'}` },
      { type: 14, divider: true },
      { type: 10, content: `### Permissions — Page ${page + 1}/${totalPages}\n${permLines}` },
      { type: 14, divider: true },
      ...rows,
      { type: 14, divider: true },
      { type: 1, components: [
        { type: 2, style: 1, custom_id: 'cr_setname', label: 'Set Name' },
        { type: 2, style: 1, custom_id: 'cr_setcolor', label: 'Set Color' },
        { type: 2, style: 1, custom_id: 'cr_setposition', label: 'Set Position' },
        { type: 2, style: 2, custom_id: 'cr_prev', label: '← Prev' },
        { type: 2, style: 2, custom_id: 'cr_next', label: 'Next →' },
      ]},
      { type: 1, components: [
        { type: 2, style: 4, custom_id: 'cr_alloff', label: 'Clear All Perms' },
        { type: 2, style: 3, custom_id: 'cr_allon', label: 'Grant All Perms' },
        { type: 2, style: 3, custom_id: 'cr_confirm', label: 'Create Role' },
      ]},
      { type: 10, content: `-# Athena Bulletproof Security System · V1.0.0` }
    ]
  };
  return { components: [container], flags: 32768 };
}

export const commands = [
  {
    name: 'addrole',
    aliases: ['roleadd', 'giverole'],
    description: 'Adds one or more roles to a user.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageRoles],
    options: [
      { name: 'user', description: 'The user to add roles to', type: 6, required: true },
      { name: 'role1', description: 'First role to add', type: 8, required: true },
      { name: 'role2', description: 'Second role to add', type: 8, required: false },
      { name: 'role3', description: 'Third role to add', type: 8, required: false },
      { name: 'role4', description: 'Fourth role to add', type: 8, required: false },
      { name: 'role5', description: 'Fifth role to add', type: 8, required: false }
    ],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      
      const target = message.mentions.members.first();
      const roles = message.mentions.roles;
      
      if (!target || roles.size === 0) {
        return message.reply(cv2.warn('Command Error', 'Usage: `!addrole <@user> <@role1> [@role2...]`'));
      }
      
      const addedRoles = [];
      const failedRoles = [];
      
      const highestBotRole = message.guild.members.me.roles.highest.position;
      const highestUserRole = message.member.roles.highest.position;

      for (const [id, role] of roles) {
        if (role.position >= highestBotRole) {
          failedRoles.push(`${role.name} (Bot hierarchy too low)`);
          continue;
        }
        if (!isBotOwnerSync(message.author.id) && message.guild.ownerId !== message.author.id && role.position >= highestUserRole) {
          failedRoles.push(`${role.name} (Your hierarchy too low)`);
          continue;
        }
        
        try {
          await target.roles.add(role);
          addedRoles.push(role.name);
        } catch (err) {
          failedRoles.push(`${role.name} (Error)`);
        }
      }
      
      let replyTitle = addedRoles.length === 1 ? 'Role Added' : 'Roles Added';
      let replyDesc = '';
      if (addedRoles.length > 0) {
        replyDesc += `${BULLET_EMOJI} ${message.author} has given **${addedRoles.join(', ')}** to ${target}\n`;
      }
      if (failedRoles.length > 0) {
        replyDesc += `**Failed:** ${failedRoles.join(', ')}\n`;
      }
      
      await message.reply(cv2.success(replyTitle, replyDesc.trim()));
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission to use this command.'));
      }
      
      const targetUser = interaction.options.getUser('user');
      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      
      if (!target) {
        return interaction.reply(cv2.warn('Command Error', 'User not found.'));
      }
      
      const roles = [];
      for (let i = 1; i <= 5; i++) {
        const role = interaction.options.getRole(`role${i}`);
        if (role) roles.push(role);
      }
      
      const addedRoles = [];
      const failedRoles = [];
      const highestBotRole = interaction.guild.members.me.roles.highest.position;
      const highestUserRole = interaction.member.roles.highest.position;

      for (const role of roles) {
        if (role.position >= highestBotRole) {
          failedRoles.push(`${role.name} (Bot hierarchy too low)`);
          continue;
        }
        if (!isBotOwnerSync(interaction.user.id) && interaction.guild.ownerId !== interaction.user.id && role.position >= highestUserRole) {
          failedRoles.push(`${role.name} (Your hierarchy too low)`);
          continue;
        }
        try {
          await target.roles.add(role);
          addedRoles.push(role.name);
        } catch (err) {
          failedRoles.push(`${role.name} (Error)`);
        }
      }
      
      let replyTitle = addedRoles.length === 1 ? 'Role Added' : 'Roles Added';
      let replyDesc = '';
      if (addedRoles.length > 0) {
        replyDesc += `${BULLET_EMOJI} ${interaction.user} has given **${addedRoles.join(', ')}** to ${target}\n`;
      }
      if (failedRoles.length > 0) {
        replyDesc += `**Failed:** ${failedRoles.join(', ')}\n`;
      }
      
      await interaction.reply(cv2.success(replyTitle, replyDesc.trim()));
    }
  },
  {
    name: 'removerole',
    aliases: ['roledel', 'takerole'],
    description: 'Removes one or more roles from a user.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageRoles],
    options: [
      { name: 'user', description: 'The user to remove roles from', type: 6, required: true },
      { name: 'role1', description: 'First role to remove', type: 8, required: true },
      { name: 'role2', description: 'Second role to remove', type: 8, required: false },
      { name: 'role3', description: 'Third role to remove', type: 8, required: false },
      { name: 'role4', description: 'Fourth role to remove', type: 8, required: false },
      { name: 'role5', description: 'Fifth role to remove', type: 8, required: false }
    ],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      
      const target = message.mentions.members.first();
      const roles = message.mentions.roles;
      
      if (!target || roles.size === 0) {
        return message.reply(cv2.warn('Command Error', 'Usage: `!removerole <@user> <@role1> [@role2...]`'));
      }
      
      const removedRoles = [];
      const failedRoles = [];
      
      const highestBotRole = message.guild.members.me.roles.highest.position;
      const highestUserRole = message.member.roles.highest.position;

      for (const [id, role] of roles) {
        if (role.position >= highestBotRole) {
          failedRoles.push(`${role.name} (Bot hierarchy too low)`);
          continue;
        }
        if (!isBotOwnerSync(message.author.id) && message.guild.ownerId !== message.author.id && role.position >= highestUserRole) {
          failedRoles.push(`${role.name} (Your hierarchy too low)`);
          continue;
        }
        
        try {
          await target.roles.remove(role);
          removedRoles.push(role.name);
        } catch (err) {
          failedRoles.push(`${role.name} (Error)`);
        }
      }
      
      let replyTitle = removedRoles.length === 1 ? 'Role Removed' : 'Roles Removed';
      let replyDesc = '';
      if (removedRoles.length > 0) {
        replyDesc += `${BULLET_EMOJI} ${message.author} has removed **${removedRoles.join(', ')}** from ${target}\n`;
      }
      if (failedRoles.length > 0) {
        replyDesc += `**Failed:** ${failedRoles.join(', ')}\n`;
      }
      
      await message.reply(cv2.success(replyTitle, replyDesc.trim()));
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission.'));
      }
      
      const targetUser = interaction.options.getUser('user');
      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      
      if (!target) {
        return interaction.reply(cv2.warn('Command Error', 'User not found.'));
      }
      
      const roles = [];
      for (let i = 1; i <= 5; i++) {
        const role = interaction.options.getRole(`role${i}`);
        if (role) roles.push(role);
      }
      
      const removedRoles = [];
      const failedRoles = [];
      const highestBotRole = interaction.guild.members.me.roles.highest.position;
      const highestUserRole = interaction.member.roles.highest.position;

      for (const role of roles) {
        if (role.position >= highestBotRole) {
          failedRoles.push(`${role.name} (Bot hierarchy too low)`);
          continue;
        }
        if (!isBotOwnerSync(interaction.user.id) && interaction.guild.ownerId !== interaction.user.id && role.position >= highestUserRole) {
          failedRoles.push(`${role.name} (Your hierarchy too low)`);
          continue;
        }
        try {
          await target.roles.remove(role);
          removedRoles.push(role.name);
        } catch (err) {
          failedRoles.push(`${role.name} (Error)`);
        }
      }
      
      let replyTitle = removedRoles.length === 1 ? 'Role Removed' : 'Roles Removed';
      let replyDesc = '';
      if (removedRoles.length > 0) {
        replyDesc += `${BULLET_EMOJI} ${interaction.user} has removed **${removedRoles.join(', ')}** from ${target}\n`;
      }
      if (failedRoles.length > 0) {
        replyDesc += `**Failed:** ${failedRoles.join(', ')}\n`;
      }
      
      await interaction.reply(cv2.success(replyTitle, replyDesc.trim()));
    }
  },
  {
    name: 'striproles',
    aliases: ['strip', 'wipeuserroles'],
    description: 'Removes ALL roles from a user (except @everyone and managed roles).',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageRoles],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      
      const target = message.mentions.members.first();
      if (!target) {
        return message.reply(cv2.warn('Command Error', 'Usage: `!striproles <@user>`'));
      }
      
      const highestBotRole = message.guild.members.me.roles.highest.position;
      const highestUserRole = message.member.roles.highest.position;
      
      let count = 0;
      let failedCount = 0;

      const rolesToRemove = target.roles.cache.filter(role => 
        role.id !== message.guild.id && !role.managed
      );

      for (const [id, role] of rolesToRemove) {
        if (role.position >= highestBotRole || (!isBotOwnerSync(message.author.id) && message.guild.ownerId !== message.author.id && role.position >= highestUserRole)) {
          failedCount++;
          continue;
        }
        try {
          await target.roles.remove(role);
          count++;
        } catch (e) {
          failedCount++;
        }
      }
      
      await message.reply(cv2.success('Roles Stripped', `Successfully stripped **${count}** roles from ${target}. Failed to remove **${failedCount}** roles (hierarchy/permissions).`));
      await message.reply(cv2.success('Roles Stripped', `Successfully stripped **${count}** roles from ${target}. Failed to remove **${failedCount}** roles (hierarchy/permissions).`));
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission.'));
      }
      
      const targetUser = interaction.options.getUser('user');
      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      
      if (!target) {
        return interaction.reply(cv2.warn('Command Error', 'User not found.'));
      }
      
      const highestBotRole = interaction.guild.members.me.roles.highest.position;
      const highestUserRole = interaction.member.roles.highest.position;
      
      let count = 0;
      let failedCount = 0;

      const rolesToRemove = target.roles.cache.filter(role => 
        role.id !== interaction.guild.id && !role.managed
      );

      for (const [id, role] of rolesToRemove) {
        if (role.position >= highestBotRole || (!isBotOwnerSync(interaction.user.id) && interaction.guild.ownerId !== interaction.user.id && role.position >= highestUserRole)) {
          failedCount++;
          continue;
        }
        try {
          await target.roles.remove(role);
          count++;
        } catch (e) {
          failedCount++;
        }
      }
      
      await interaction.reply(cv2.success('Roles Stripped', `Successfully stripped **${count}** roles from ${target}. Failed to remove **${failedCount}** roles.`));
    }
  },
  {
    name: 'massaddrole',
    slashHidden: true,
    description: 'Adds a role to all members in the server.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.Administrator],
    options: [
      { name: 'role', description: 'The role to add to everyone', type: 8, required: true }
    ],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      
      const role = message.mentions.roles.first();
      if (!role) return message.reply(cv2.warn('Command Error', 'Usage: `!massaddrole <@role>`'));
      
      await handleMassRole(message, role, 'add');
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission.'));
      }
      const role = interaction.options.getRole('role');
      await handleMassRole(interaction, role, 'add');
    }
  },
  {
    name: 'massremoverole',
    slashHidden: true,
    description: 'Removes a role from all members in the server.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.Administrator],
    options: [
      { name: 'role', description: 'The role to remove from everyone', type: 8, required: true }
    ],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      
      const role = message.mentions.roles.first();
      if (!role) return message.reply(cv2.warn('Command Error', 'Usage: `!massremoverole <@role>`'));
      
      await handleMassRole(message, role, 'remove');
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission.'));
      }
      const role = interaction.options.getRole('role');
      await handleMassRole(interaction, role, 'remove');
    }
  },
  {
    name: 'massstrip',
    slashHidden: true,
    description: 'Removes a role from all members and saves the list to restore later.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.Administrator],
    options: [
      { name: 'role', description: 'The role to strip', type: 8, required: true }
    ],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      const role = message.mentions.roles.first();
      if (!role) return message.reply(cv2.warn('Command Error', 'Usage: `!massstrip <@role>`'));
      await handleMassRole(message, role, 'strip');
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission.'));
      }
      const role = interaction.options.getRole('role');
      await handleMassRole(interaction, role, 'strip');
    }
  },
  {
    name: 'massrestore',
    slashHidden: true,
    description: 'Restores a role to members who had it stripped via massstrip.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.Administrator],
    options: [
      { name: 'role', description: 'The role to restore', type: 8, required: true }
    ],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      const role = message.mentions.roles.first();
      if (!role) return message.reply(cv2.warn('Command Error', 'Usage: `!massrestore <@role>`'));
      await handleMassRole(message, role, 'restore');
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission.'));
      }
      const role = interaction.options.getRole('role');
      await handleMassRole(interaction, role, 'restore');
    }
  },

  {
    name: 'createrole',
    slashHidden: true,
    description: 'Create a role with custom permissions, color, and position interactively.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageRoles],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      const state = { name: '', color: null, perms: [], page: 0, position: null, guildId: message.guild.id };
      createRoleStates.set(message.author.id, state);
      const panel = buildCreateRolePanel(state);
      await message.reply(panel);
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission.'));
      }
      const state = { name: '', color: null, perms: [], page: 0, position: null, guildId: interaction.guild.id };
      createRoleStates.set(interaction.user.id, state);
      const panel = buildCreateRolePanel(state);
      await interaction.reply(panel);
    }
  },
  {
    name: 'editrole',
    aliases: ['rolecolor', 'rcolor', 'rolecolour', 'rolename', 'rname', 'roleedit'],
    slashHidden: true,
    description: 'Edit any property of a role: color, name, hoist, mentionable, position.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageRoles],
    async executePrefix(message, args) {
      if (!(await isAuthorized(message.author, message.guild))) return;

      const roleIdOrMention = args[0]?.replace(/<@&|>/g, '');
      if (!roleIdOrMention) {
        return message.reply(cv2.warn('Usage', [
          '**Edit any property of a role:**',
          '\`!editrole <@role|id> color <#hex>\` — Change role color',
          '\`!editrole <@role|id> name <new name>\` — Rename the role',
          '\`!editrole <@role|id> hoist <on|off>\` — Show separately in member list',
          '\`!editrole <@role|id> mentionable <on|off>\` — Allow @mentioning',
          '\`!editrole <@role|id> position <number>\` — Move role position',
          '',
          '**Shortcut:** \`!rolecolor <@role|id> <#hex>\`',
        ].join('\n')));
      }

      const role = message.guild.roles.cache.get(roleIdOrMention) || message.mentions.roles.first();
      if (!role) return message.reply(cv2.danger('Not Found', 'Could not find that role in this server.'));

      const property = args[1]?.toLowerCase();
      const value = args.slice(2).join(' ');

      // Backwards compat: !rolecolor @role #hex
      const isLegacyColorCall = !property || property.startsWith('#') || /^[0-9A-Fa-f]{6}$/.test(property);
      if (isLegacyColorCall) {
        const hex = args[1];
        if (!hex) return message.reply(cv2.warn('Usage', '\`!rolecolor <@role|id> <#hex>\`'));
        const hexClean = hex.startsWith('#') ? hex : '#' + hex;
        if (!/^#[0-9A-Fa-f]{6}$/.test(hexClean)) return message.reply(cv2.warn('Invalid Color', 'Use a valid hex. Example: \`#FF5733\`'));
        await role.setColor(hexClean, `Color changed by ${message.author.tag}`).catch(() => null);
        return message.reply(cv2.success('Role Updated', `**${role.name}** color set to \`${hexClean}\`.`));
      }

      if (property === 'color' || property === 'colour') {
        const hexClean = value.startsWith('#') ? value : '#' + value;
        if (!/^#[0-9A-Fa-f]{6}$/.test(hexClean)) return message.reply(cv2.warn('Invalid Color', 'Use a valid hex. Example: \`#FF5733\`'));
        await role.setColor(hexClean, `Color changed by ${message.author.tag}`).catch(() => null);
        return message.reply(cv2.success('Role Updated', `**${role.name}** color set to \`${hexClean}\`.`));
      }

      if (property === 'name') {
        if (!value) return message.reply(cv2.warn('Usage', '\`!editrole <@role|id> name <new name>\`'));
        await role.setName(value, `Name changed by ${message.author.tag}`).catch(() => null);
        return message.reply(cv2.success('Role Updated', `Role renamed to **${value}**.`));
      }

      if (property === 'hoist') {
        const on = value === 'on' || value === 'true' || value === '1';
        await role.setHoist(on, `Hoist changed by ${message.author.tag}`).catch(() => null);
        return message.reply(cv2.success('Role Updated', `**${role.name}** hoist set to **${on ? 'ON' : 'OFF'}**.`));
      }

      if (property === 'mentionable') {
        const on = value === 'on' || value === 'true' || value === '1';
        await role.setMentionable(on, `Mentionable changed by ${message.author.tag}`).catch(() => null);
        return message.reply(cv2.success('Role Updated', `**${role.name}** is now **${on ? 'mentionable' : 'not mentionable'}**.`));
      }

      if (property === 'position' || property === 'pos') {
        const pos = parseInt(value);
        if (isNaN(pos) || pos < 1) return message.reply(cv2.warn('Invalid Position', 'Provide a number >= 1.'));
        await role.setPosition(pos, { reason: `Position changed by ${message.author.tag}` }).catch(() => null);
        return message.reply(cv2.success('Role Updated', `**${role.name}** moved to position **${pos}**.`));
      }

      return message.reply(cv2.warn('Unknown Property', 'Valid properties: \`color\`, \`name\`, \`hoist\`, \`mentionable\`, \`position\`'));
    },
    async executeSlash() {}
  }

];