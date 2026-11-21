import { PermissionFlagsBits } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { isBotOwnerSync } from '../utils/helpers.js';
import { isUserInDragSession } from './vcdrag.js';

export const commands = [
  {
    name: 'moveprotect',
    aliases: ['antimove', 'vclockdownprotection', 'mp'],
    description: 'Manage move protection for users (Server Owner & Bot Owner only).',
    category: 'admin',
    permissions: [PermissionFlagsBits.Administrator],
    options: [
      {
        name: 'add',
        description: 'Add a user to the move protection list.',
        type: 1, // SUB_COMMAND
        options: [
          { name: 'user', description: 'The user to protect', type: 6, required: true }
        ]
      },
      {
        name: 'remove',
        description: 'Remove a user from the move protection list.',
        type: 1, // SUB_COMMAND
        options: [
          { name: 'user', description: 'The user to unprotect', type: 6, required: true }
        ]
      },
      {
        name: 'list',
        description: 'List all move-protected users.',
        type: 1 // SUB_COMMAND
      }
    ],
    async executeSlash(interaction) {
      // Security Check: Only Server Owner and Bot Owner
      if (interaction.user.id !== interaction.guild.ownerId && !isBotOwnerSync(interaction.user.id)) {
        return interaction.reply(cv2.danger('Access Denied', 'Only the **Server Owner** and **Bot Owner** can use the move protection command.'));
      }

      const subCommand = interaction.options.getSubcommand();

      if (subCommand === 'add') {
        const target = interaction.options.getUser('user');
        if (target.bot) return interaction.reply(cv2.warn('Invalid Target', 'You cannot move-protect bots.'));

        if (isUserInDragSession(interaction.guild.id, target.id)) {
          return interaction.reply(cv2.danger('Action Blocked', `Cannot protect **${target.tag}** because they are currently in an active VC drag session. Stop the drag session first.`));
        }

        const added = db.addMoveProtectedUser(interaction.guild.id, target.id);
        if (added) {
          return interaction.reply(cv2.success('Move Protection Enabled', `**${target.tag}** is now protected. If an admin attempts to move them, they will be instantly dragged back and the admin will be warned/punished.`));
        } else {
          return interaction.reply(cv2.warn('Already Protected', `**${target.tag}** is already on the move protection list.`));
        }
      }

      if (subCommand === 'remove') {
        const target = interaction.options.getUser('user');
        
        const removed = db.removeMoveProtectedUser(interaction.guild.id, target.id);
        if (removed) {
          return interaction.reply(cv2.success('Move Protection Disabled', `**${target.tag}** has been removed from the move protection list.`));
        } else {
          return interaction.reply(cv2.warn('Not Protected', `**${target.tag}** is not on the move protection list.`));
        }
      }

      if (subCommand === 'list') {
        const protectedIds = db.getMoveProtectedUsers(interaction.guild.id);
        if (!protectedIds || protectedIds.length === 0) {
          return interaction.reply(cv2.info('Move Protection List', 'No users are currently protected.'));
        }

        const userList = protectedIds.map(id => `<@${id}>`).join('\n');
        return interaction.reply(cv2.info('Move Protected Users', userList));
      }
    },
    async executePrefix(message, args) {
      if (message.author.id !== message.guild.ownerId && !isBotOwnerSync(message.author.id)) {
        return message.reply(cv2.danger('Access Denied', 'Only the **Server Owner** and **Bot Owner** can use the move protection command.'));
      }

      const subCommand = args[0]?.toLowerCase();

      if (subCommand === 'add') {
        const target = message.mentions.users.first();
        if (!target) return message.reply(cv2.warn('Command Error', 'Please mention a user to protect.'));
        if (target.bot) return message.reply(cv2.warn('Invalid Target', 'You cannot move-protect bots.'));

        if (isUserInDragSession(message.guild.id, target.id)) {
          return message.reply(cv2.danger('Action Blocked', `Cannot protect **${target.tag}** because they are currently in an active VC drag session. Stop the drag session first.`));
        }

        const added = db.addMoveProtectedUser(message.guild.id, target.id);
        if (added) {
          return message.reply(cv2.success('Move Protection Enabled', `**${target.tag}** is now protected.`));
        } else {
          return message.reply(cv2.warn('Already Protected', `**${target.tag}** is already on the move protection list.`));
        }
      }

      if (subCommand === 'remove') {
        const target = message.mentions.users.first();
        if (!target) return message.reply(cv2.warn('Command Error', 'Please mention a user to unprotect.'));
        
        const removed = db.removeMoveProtectedUser(message.guild.id, target.id);
        if (removed) {
          return message.reply(cv2.success('Move Protection Disabled', `**${target.tag}** has been removed from the move protection list.`));
        } else {
          return message.reply(cv2.warn('Not Protected', `**${target.tag}** is not on the move protection list.`));
        }
      }

      if (subCommand === 'list' || !subCommand) {
        const protectedIds = db.getMoveProtectedUsers(message.guild.id);
        if (!protectedIds || protectedIds.length === 0) {
          return message.reply(cv2.info('Move Protection List', 'No users are currently protected.'));
        }

        const userList = protectedIds.map(id => `<@${id}>`).join('\n');
        return message.reply(cv2.info('Move Protected Users', userList));
      }
    }
  }
];
