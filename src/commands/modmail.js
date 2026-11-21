import { PermissionFlagsBits, ChannelType } from 'discord.js';
import db from '../database.js';

export const commands = [
  {
    name: 'modmail',
    aliases: ['mm'],
    description: 'Configure the server ModMail direct support bridge.',
    category: 'admin',
    permissions: [PermissionFlagsBits.ManageGuild],
    options: [
      { name: 'channel', description: 'Designated channel or category for incoming tickets', type: 7, required: false }
    ],
    async executePrefix(message, args) {
      const sub = (args[0] || '').toLowerCase();
      const cfg = db.getGuildConfig(message.guild.id) || {};

      if (sub === 'setup') {
        const channel = message.mentions.channels.first() || 
          message.guild.channels.cache.get(args[1]) || 
          message.channel;

        db.updateGuildConfig(message.guild.id, { modmailChannelId: channel.id, modmailEnabled: true });

        const setupContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `# ModMail Bridge Configured\n` +
                `-# • **Status:** <a:uptime:1552608831060844575> **__Active & Online__**\n` +
                `-# • **Dispatch Channel:** ${channel}\n` +
                `-# • **Bridge Mechanism:** **Direct messages from members will automatically spawn support threads in this channel.**`
            }
          ]
        };
        return message.reply({ components: [setupContainer], flags: 32768 });
      }

      if (sub === 'disable' || sub === 'off') {
        db.updateGuildConfig(message.guild.id, { modmailEnabled: false });
        const offContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `# ModMail Bridge Deactivated\n` +
                `-# • **Status:** <:off:1533844858983157851> **__Disabled for this server__**`
            }
          ]
        };
        return message.reply({ components: [offContainer], flags: 32768 });
      }

      const status = cfg.modmailEnabled && cfg.modmailChannelId ? '<a:uptime:1552608831060844575> Enabled' : '<:off:1533844858983157851> Disabled';
      const channelText = cfg.modmailChannelId ? `<#${cfg.modmailChannelId}>` : '`Not Set`';

      const panelContainer = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `# ModMail Management Hub\n` +
              `-# **__Direct Message Support Ticket Bridge__**\n\n` +
              `-# • **System Status:** ${status}\n` +
              `-# • **Inbox Channel:** ${channelText}\n\n` +
              `-# **__Configuration Commands__**\n` +
              `-# • \`!modmail setup <#channel>\` - Bind ModMail tickets to a staff channel\n` +
              `-# • \`!modmail disable\` - Turn off ModMail bridge\n` +
              `-# • \`!reply <message>\` - Reply to the user from within a ModMail thread\n` +
              `-# • \`!close\` - Close and archive the active ModMail ticket`
          }
        ]
      };
      return message.reply({ components: [panelContainer], flags: 32768 });
    },
    async executeSlash(interaction) {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      db.updateGuildConfig(interaction.guild.id, { modmailChannelId: channel.id, modmailEnabled: true });

      const setupContainer = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `# ModMail Bridge Configured\n` +
              `-# • **Status:** <a:uptime:1552608831060844575> **__Active & Online__**\n` +
              `-# • **Dispatch Channel:** ${channel}\n` +
              `-# • **Bridge Mechanism:** **Direct messages from members will automatically spawn support threads in this channel.**`
          }
        ]
      };
      return interaction.reply({ components: [setupContainer], flags: 32768 });
    }
  },

  {
    name: 'reply',
    aliases: ['r', 'ticketreply', 'mreply'],
    description: 'Relay a message back to the user from within an active ModMail thread.',
    category: 'admin',
    permissions: [PermissionFlagsBits.ManageMessages],
    options: [
      { name: 'message', description: 'Message to send to user', type: 3, required: true }
    ],
    async executePrefix(message, args) {
      if (!message.channel.isThread()) {
        const errorContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `# Reply Error\n` +
                `-# • **Issue:** **__This command can only be used inside an active ModMail ticket thread.__**`
            }
          ]
        };
        return message.reply({ components: [errorContainer], flags: 32768 });
      }

      const match = message.channel.name.match(/^mm-(\d{17,20})$/);
      if (!match) {
        const errorContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `# Reply Error\n` +
                `-# • **Issue:** **__This thread is not recognized as an active ModMail ticket.__**`
            }
          ]
        };
        return message.reply({ components: [errorContainer], flags: 32768 });
      }

      const userId = match[1];
      const replyText = args.join(' ');
      if (!replyText) {
        const errorContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `# Reply Error\n` +
                `-# • **Issue:** **__Please specify the message content to send.__**\n` +
                `-# • **Usage:** \`!reply <your message>\``
            }
          ]
        };
        return message.reply({ components: [errorContainer], flags: 32768 });
      }

      try {
        const targetUser = await message.client.users.fetch(userId);
        const dmContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `# Support Response — ${message.guild.name}\n` +
                `-# • **Staff Member:** **${message.author.username}**\n\n` +
                `> ${replyText}\n\n` +
                `-# **__Reply directly to this DM to continue the ticket.__**`
            }
          ]
        };
        await targetUser.send({ components: [dmContainer], flags: 32768 });

        const confirmContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `# Response Dispatched\n` +
                `-# • **Recipient:** <@${userId}> (\`${userId}\`)\n` +
                `-# • **Sent Content:** ${replyText}`
            }
          ]
        };
        return message.reply({ components: [confirmContainer], flags: 32768 });
      } catch (err) {
        const failContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `# Transmission Failed\n` +
                `-# • **Issue:** **__Could not deliver DM to user (DMs closed or blocked).__**\n` +
                `-# • **Error:** \`${err.message}\``
            }
          ]
        };
        return message.reply({ components: [failContainer], flags: 32768 });
      }
    }
  }
];
