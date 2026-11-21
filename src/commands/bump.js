import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';

export const commands = [
{
  name: 'bump',
  aliases: ['disboard', 'bumpreminder'],
    slashHidden: true,
    description: 'Configure bump reminder roles.',
  permissions: [PermissionFlagsBits.ManageGuild],

  // Slash Command Definition
  slashDef: new SlashCommandBuilder()
    .setName('bump')
    .setDescription('Configure the bump reminder system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a role to be pinged for bump reminders')
      .addRoleOption(opt => opt.setName('role').setDescription('The role to ping').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a role from bump reminders')
      .addRoleOption(opt => opt.setName('role').setDescription('The role to remove').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all currently configured bump ping roles')
    )
    .addSubcommand(sub => sub
      .setName('off')
      .setDescription('Disable the bump reminder system')
    )
    .addSubcommand(sub => sub
      .setName('on')
      .setDescription('Enable the bump reminder system')
    ),

  // Prefix Command Handler
  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply(cv2.danger('Permission Denied', 'You need `ManageGuild` permissions to configure bump settings.'));
    }

    const sub = args[0]?.toLowerCase();
    const cfg = db.getGuildConfig(message.guild.id);
    if (!cfg.bumpRoleIds) cfg.bumpRoleIds = [];

    if (sub === 'add' || sub === 'remove') {
      const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
      if (!role) return message.reply(cv2.warn('Invalid Usage', `Please mention a role. Example: \`!bump ${sub} @BumpPing\``));

      if (sub === 'add') {
        if (cfg.bumpRoleIds.includes(role.id)) return message.reply(cv2.warn('Already Added', 'That role is already in the bump ping list.'));
        cfg.bumpRoleIds.push(role.id);
        db.updateGuildConfig(message.guild.id, cfg);
        return message.reply(cv2.success('Bump Role Added', `Added ${role} to the bump reminder ping list.`));
      }

      if (sub === 'remove') {
        if (!cfg.bumpRoleIds.includes(role.id)) return message.reply(cv2.warn('Not Found', 'That role is not in the bump ping list.'));
        cfg.bumpRoleIds = cfg.bumpRoleIds.filter(id => id !== role.id);
        db.updateGuildConfig(message.guild.id, cfg);
        return message.reply(cv2.success('Bump Role Removed', `Removed ${role} from the bump reminder ping list.`));
      }
    }

    if (sub === 'list') {
      if (cfg.bumpRoleIds.length === 0) return message.reply(cv2.info('Bump Roles', 'No roles are currently configured for bump reminders.'));
      const roleList = cfg.bumpRoleIds.map(id => `<@&${id}>`).join('\n');
      return message.reply(cv2.info('Bump Roles', `The following roles will be pinged when a bump is available:\n\n${roleList}`));
    }

    if (sub === 'off') {
      cfg.bumpDisabled = true;
      db.updateGuildConfig(message.guild.id, cfg);
      db.deleteBumpReminder(message.guild.id);
      return message.reply(cv2.success('Bump Reminder Disabled', 'The bump reminder system has been turned OFF.'));
    }

    if (sub === 'on') {
      cfg.bumpDisabled = false;
      db.updateGuildConfig(message.guild.id, cfg);
      return message.reply(cv2.success('Bump Reminder Enabled', 'The bump reminder system has been turned ON.'));
    }

    return message.reply(cv2.warn('Invalid Usage', 'Usage:\n`!bump add @role`\n`!bump remove @role`\n`!bump list`\n`!bump on`\n`!bump off`'));
  },

  // Slash Command Handler
  async executeSlash(interaction) {
    const sub = interaction.options.getSubcommand();
    const cfg = db.getGuildConfig(interaction.guild.id);
    if (!cfg.bumpRoleIds) cfg.bumpRoleIds = [];

    if (sub === 'add') {
      const role = interaction.options.getRole('role');
      if (cfg.bumpRoleIds.includes(role.id)) return interaction.reply(cv2.warn('Already Added', 'That role is already in the bump ping list.'));
      cfg.bumpRoleIds.push(role.id);
      db.updateGuildConfig(interaction.guild.id, cfg);
      return interaction.reply(cv2.success('Bump Role Added', `Added ${role} to the bump reminder ping list.`));
    }

    if (sub === 'remove') {
      const role = interaction.options.getRole('role');
      if (!cfg.bumpRoleIds.includes(role.id)) return interaction.reply(cv2.warn('Not Found', 'That role is not in the bump ping list.'));
      cfg.bumpRoleIds = cfg.bumpRoleIds.filter(id => id !== role.id);
      db.updateGuildConfig(interaction.guild.id, cfg);
      return interaction.reply(cv2.success('Bump Role Removed', `Removed ${role} from the bump reminder ping list.`));
    }

    if (sub === 'list') {
      if (cfg.bumpRoleIds.length === 0) return interaction.reply(cv2.info('Bump Roles', 'No roles are currently configured for bump reminders.'));
      const roleList = cfg.bumpRoleIds.map(id => `<@&${id}>`).join('\n');
      return interaction.reply(cv2.info('Bump Roles', `The following roles will be pinged when a bump is available:\n\n${roleList}`));
    }

    if (sub === 'off') {
      cfg.bumpDisabled = true;
      db.updateGuildConfig(interaction.guild.id, cfg);
      db.deleteBumpReminder(interaction.guild.id);
      return interaction.reply(cv2.success('Bump Reminder Disabled', 'The bump reminder system has been turned OFF.'));
    }

    if (sub === 'on') {
      cfg.bumpDisabled = false;
      db.updateGuildConfig(interaction.guild.id, cfg);
      return interaction.reply(cv2.success('Bump Reminder Enabled', 'The bump reminder system has been turned ON.'));
    }
  }
}
];
