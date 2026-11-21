import { PermissionFlagsBits, ChannelType } from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';

const MODULES = [
  { id: 'bans', name: 'Ban Logs' },
  { id: 'kicks', name: 'Kick Logs' },
  { id: 'leaves', name: 'Leave Logs' },
  { id: 'joins', name: 'Join Logs' },
  { id: 'msgDeletes', name: 'Message Delete Logs' },
  { id: 'msgEdits', name: 'Message Edit Logs' },
  { id: 'channels', name: 'Channel Logs' },
  { id: 'roles', name: 'Role Logs' }
];

async function handleServerLogs(guild, subcommand, args) {
  const config = db.getGuildConfig(guild.id);
  const sl = config.serverLogs;

  if (subcommand === 'status' || !subcommand) {
    const fields = MODULES.map(mod => {
      const modCfg = sl.modules[mod.id];
      const hasRoute = modCfg.channelId || sl.defaultChannelId;
      const actuallyEnabled = modCfg.enabled && hasRoute;
      const statusStr = actuallyEnabled ? '<:on:1533844867191406672> **Enabled**' : '<:off:1533844858983157851> **Disabled**';
      const channelStr = modCfg.channelId ? `<#${modCfg.channelId}>` : (sl.defaultChannelId ? `<#${sl.defaultChannelId}> (Fallback)` : '`None`');
      return { name: mod.name, value: `${statusStr}\nRoute: ${channelStr}`, inline: true };
    });

    fields.unshift({
      name: 'Global Settings',
      value: `Master Switch: ${sl.enabled ? '<:on:1533844867191406672>' : '<:off:1533844858983157851>'}\nDefault Fallback Channel: ${sl.defaultChannelId ? `<#${sl.defaultChannelId}>` : '`None`'}`
    });

    return cv2.info('Server Logs Dashboard', 'Configure advanced server logging. Use `/serverlogs bind` to route events to specific channels.', fields);
  }

  if (subcommand === 'master') {
    sl.enabled = !sl.enabled;
    db.updateGuildConfig(guild.id, { serverLogs: sl });
    return cv2.success('Updated', `Master Server Logs switch is now ${sl.enabled ? '**Enabled**' : '**Disabled**'}.`);
  }

  if (subcommand === 'toggle') {
    const moduleId = args.moduleId;
    const mod = sl.modules[moduleId];
    if (!mod) return cv2.warn('Error', 'Invalid module ID.');
    
    mod.enabled = !mod.enabled;
    db.updateGuildConfig(guild.id, { serverLogs: sl });
    return cv2.success('Updated', `Module **${moduleId}** is now ${mod.enabled ? '**Enabled**' : '**Disabled**'}.`);
  }

  if (subcommand === 'bind') {
    const moduleId = args.moduleId;
    const channelId = args.channelId;
    const mod = sl.modules[moduleId];
    if (!mod) return cv2.warn('Error', 'Invalid module ID.');

    mod.channelId = channelId;
    mod.enabled = true; // Auto-enable the module when bound
    db.updateGuildConfig(guild.id, { serverLogs: sl });
    return cv2.success('Bound', `Module **${moduleId}** logs will now be routed to <#${channelId}> and has been enabled.`);
  }

  if (subcommand === 'setdefault') {
    sl.defaultChannelId = args.channelId;
    db.updateGuildConfig(guild.id, { serverLogs: sl });
    return cv2.success('Updated', `Default fallback log channel set to <#${sl.defaultChannelId}>.`);
  }

  if (subcommand === 'autosetup') {
    if (sl.defaultChannelId && guild.channels.cache.has(sl.defaultChannelId)) {
      return cv2.info('Already Setup', 'A default channel is already configured.');
    }

    try {
      let category = sl.categoryId ? guild.channels.cache.get(sl.categoryId) : null;
      if (!category) {
        category = await guild.channels.create({
          name: 'Athena Logs',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
          ]
        });
        sl.categoryId = category.id;
      }

      const logChannel = await guild.channels.create({
        name: 'server-logs',
        type: ChannelType.GuildText,
        parent: category.id
      });

      sl.defaultChannelId = logChannel.id;
      sl.enabled = true;
      db.updateGuildConfig(guild.id, { serverLogs: sl });

      return cv2.success('Auto-Setup Complete', `Created category **Athena Logs** and default fallback channel <#${logChannel.id}>. Master switch has been enabled.`);
    } catch (e) {
      return cv2.warn('<:off:1533844858983157851> Failed', `Could not create channels: ${e.message}`);
    }
  }

  return cv2.warn('Invalid Usage', 'Unknown subcommand.');
}

export const commands = [
  {
    name: 'serverlogs',
    aliases: ['slogs', 'logchannel', 'auditlogs'],
    description: 'Configure the modular Server Logging system.',
    category: 'utility',
    permissions: [PermissionFlagsBits.Administrator],
    options: [
      {
        name: 'status',
        description: 'View the current Server Logs configuration',
        type: 1
      },
      {
        name: 'master',
        description: 'Toggle the master switch for all server logs',
        type: 1
      },
      {
        name: 'autosetup',
        description: 'Automatically create a category and default log channel',
        type: 1
      },
      {
        name: 'setdefault',
        description: 'Set the default fallback channel for logs',
        type: 1,
        options: [
          { name: 'channel', description: 'The channel to use', type: 7, required: true }
        ]
      },
      {
        name: 'toggle',
        description: 'Enable or disable a specific log module',
        type: 1,
        options: [
          {
            name: 'module',
            description: 'The module to toggle',
            type: 3,
            required: true,
            choices: MODULES.map(m => ({ name: m.name, value: m.id }))
          }
        ]
      },
      {
        name: 'bind',
        description: 'Bind a specific log module to its own dedicated channel',
        type: 1,
        options: [
          {
            name: 'module',
            description: 'The module to bind',
            type: 3,
            required: true,
            choices: MODULES.map(m => ({ name: m.name, value: m.id }))
          },
          { name: 'channel', description: 'The dedicated channel', type: 7, required: true }
        ]
      }
    ],
    async executePrefix(message, args) {
      const sub = args[0]?.toLowerCase() || 'status';
      
      let modId = null;
      let chanId = null;

      if (sub === 'toggle') modId = args[1];
      if (sub === 'setdefault') chanId = message.mentions.channels.first()?.id;
      if (sub === 'bind') {
        modId = args[1];
        chanId = message.mentions.channels.first()?.id;
      }

      const result = await handleServerLogs(message.guild, sub, { moduleId: modId, channelId: chanId });
      await message.reply(result);
    },
    async executeSlash(interaction) {
      const sub = interaction.options.getSubcommand();
      let modId = null;
      let chanId = null;

      if (sub === 'toggle') modId = interaction.options.getString('module');
      if (sub === 'setdefault') chanId = interaction.options.getChannel('channel')?.id;
      if (sub === 'bind') {
        modId = interaction.options.getString('module');
        chanId = interaction.options.getChannel('channel')?.id;
      }

      const result = await handleServerLogs(interaction.guild, sub, { moduleId: modId, channelId: chanId });
      await interaction.reply(result);
    }
  }
];
