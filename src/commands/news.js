import { PermissionFlagsBits, ChannelType } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import Parser from 'rss-parser';

const parser = new Parser();

export const commands = [
  {
    name: 'news',
    description: 'Configure automated RSS News Feeds for your server.',
    category: 'utility',
    permissions: [PermissionFlagsBits.ManageGuild],
    options: [
      {
        name: 'setup',
        description: 'Set up the channel and role for automated news feeds.',
        type: 1, 
        options: [
          {
            name: 'channel',
            description: 'The channel where news articles will be posted.',
            type: 7, 
            channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
            required: true
          },
          {
            name: 'ping_role',
            description: 'Optionally select an existing role to ping.',
            type: 8, 
            required: false
          },
          {
            name: 'create_role',
            description: 'Should I create a news alert role automatically?',
            type: 5, 
            required: false
          }
        ]
      },
      {
        name: 'add',
        description: 'Add a new RSS feed.',
        type: 1,
        options: [
          {
            name: 'preset',
            description: 'Choose a reputable pre-configured news source.',
            type: 3, 
            required: false,
            choices: [
              { name: 'BBC World News', value: 'BBC|http://feeds.bbci.co.uk/news/world/rss.xml' },
              { name: 'BBC Technology', value: 'BBC Tech|http://feeds.bbci.co.uk/news/technology/rss.xml' },
              { name: 'Al Jazeera English', value: 'Al Jazeera|https://www.aljazeera.com/xml/rss/all.xml' },
              { name: 'CNN Top Stories', value: 'CNN|http://rss.cnn.com/rss/edition.rss' }
            ]
          },
          {
            name: 'custom_url',
            description: 'Provide a direct URL to a valid RSS XML feed.',
            type: 3, 
            required: false
          }
        ]
      },
      {
        name: 'remove',
        description: 'Remove an existing RSS feed.',
        type: 1,
        options: [
          {
            name: 'url',
            description: 'The URL of the feed to remove. Use /news list to see active URLs.',
            type: 3, 
            required: true,
            autocomplete: true
          }
        ]
      },
      {
        name: 'list',
        description: 'List all currently active news feeds.',
        type: 1
      },
      {
        name: 'disable',
        description: 'Disable the news system and delete all saved configurations.',
        type: 1
      }
    ],

    async autocomplete(interaction) {
      if (interaction.options.getSubcommand() === 'remove') {
        const config = db.getNewsConfig(interaction.guild.id);
        const feeds = config.feeds || [];
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const choices = feeds.map(f => ({ name: `${f.name} - ${f.url}`.substring(0, 100), value: f.url }));
        const filtered = choices.filter(c => c.name.toLowerCase().includes(focusedValue));
        await interaction.respond(filtered.slice(0, 25));
      }
    },

    async executePrefix(message, args) {
      const cfg = db.getGuildConfig(message.guild.id);
      const prefix = cfg?.prefix || '!';
      const sub = (args[0] || '').toLowerCase();

      // Check permissions: ManageGuild or Administrator
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return message.reply(cv2.danger('Access Denied', 'You need the `Manage Server` permission to configure news feeds.'));
      }

      const config = db.getNewsConfig(message.guild.id);

      // 1. !news setup <#channel> [@pingRole]
      if (sub === 'setup') {
        const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
        if (!channel) {
          return message.reply(cv2.warn('Missing Channel', `Please specify a valid channel:\n\`${prefix}news setup #channel [@ping_role]\``));
        }

        const role = message.mentions.roles.first() || (args[2] ? message.guild.roles.cache.get(args[2].replace(/[<@&>]/g, '')) : null);
        db.setNewsSetup(message.guild.id, channel.id, role ? role.id : null);

        let desc = `Successfully configured the automated news feed system!\n**Channel:** <#${channel.id}>\n`;
        desc += `**Ping Role:** ${role ? `<@&${role.id}>` : 'None'}\n\n`;
        desc += `-# To add news feeds, run: \`${prefix}news add <bbc|tech|aljazeera|cnn|url>\``;

        return message.reply(cv2.success(`News Feed Configured | <a:03_tick_circle:1565665642084827206>`, desc));
      }

      // 2. !news disable / off
      if (sub === 'disable' || sub === 'off') {
        if (!config || (!config.channelId && (!config.feeds || config.feeds.length === 0))) {
          return message.reply(cv2.info('Not Configured', 'The news feed system is not currently active on this server.'));
        }

        db.setNewsSetup(message.guild.id, null, null);
        if (db.cache.newsFeeds[message.guild.id]) {
          db.cache.newsFeeds[message.guild.id] = { channelId: null, roleId: null, feeds: [] };
        }
        db.updateNewsGuids(message.guild.id, []);

        return message.reply(cv2.success(`System Disabled | <a:03_tick_circle:1565665642084827206>`, 'The news feed system has been disabled and all feed subscriptions have been removed.'));
      }

      // 3. !news list / feeds
      if (sub === 'list' || sub === 'feeds') {
        const feeds = config.feeds || [];
        if (feeds.length === 0) {
          return message.reply(cv2.info('No Feeds', `This server is not currently subscribed to any news feeds.\nRun \`${prefix}news add <preset|url>\` to subscribe.`));
        }

        const feedList = feeds.map((f, i) => `**${i + 1}. ${f.name}**\n<${f.url}>`).join('\n\n');
        return message.reply(cv2.info(`Active News Feeds (${feeds.length}/5)`, feedList));
      }

      // 4. !news add <preset|url>
      if (sub === 'add') {
        if (!config.channelId) {
          return message.reply(cv2.warn('Setup Required', `You must bind a news channel first using: \`${prefix}news setup #channel\``));
        }

        const target = args[1];
        if (!target) {
          return message.reply(cv2.warn('Missing Input', `Please provide a preset or RSS feed URL:\nPresets: \`bbc\`, \`tech\`, \`aljazeera\`, \`cnn\`\nUsage: \`${prefix}news add bbc\` or \`${prefix}news add <rss_url>\``));
        }

        const presets = {
          'bbc': { name: 'BBC World News', url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
          'tech': { name: 'BBC Technology', url: 'http://feeds.bbci.co.uk/news/technology/rss.xml' },
          'aljazeera': { name: 'Al Jazeera English', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
          'cnn': { name: 'CNN Top Stories', url: 'http://rss.cnn.com/rss/edition.rss' }
        };

        let name, url;
        if (presets[target.toLowerCase()]) {
          name = presets[target.toLowerCase()].name;
          url = presets[target.toLowerCase()].url;
        } else {
          url = target;
          try {
            name = new URL(url).hostname;
          } catch {
            return message.reply(cv2.warn('Invalid URL', 'Please provide a valid RSS XML URL.'));
          }
        }

        try {
          const feed = await parser.parseURL(url);
          name = feed.title || name;

          if (!config.feeds) config.feeds = [];
          if (config.feeds.length >= 5) {
            return message.reply(cv2.warn('Limit Reached', 'You can only have up to 5 news feeds per server.'));
          }

          if (config.feeds.find(f => f.url === url)) {
            return message.reply(cv2.warn('Duplicate Feed', 'This server is already subscribed to this exact feed URL.'));
          }

          db.addNewsFeed(message.guild.id, name, url);
          return message.reply(cv2.success(`Feed Added | <a:03_tick_circle:1565665642084827206>`, `Successfully subscribed to **${name}**.\n\nURL: \`${url}\`\nChannel: <#${config.channelId}>`));
        } catch (err) {
          return message.reply(cv2.danger('Invalid RSS Feed', `Failed to parse the provided URL. Make sure it is a valid XML RSS Feed.\n\nError: \`${err.message}\``));
        }
      }

      // 5. !news remove <url>
      if (sub === 'remove' || sub === 'delete' || sub === 'del') {
        const url = args[1];
        if (!url) {
          return message.reply(cv2.warn('Missing URL', `Usage: \`${prefix}news remove <feed_url>\`\nRun \`${prefix}news list\` to see active feed URLs.`));
        }

        const removed = db.removeNewsFeed(message.guild.id, url);
        if (!removed) {
          return message.reply(cv2.warn('Not Found', 'Could not find an active feed matching that URL.'));
        }

        return message.reply(cv2.success(`Feed Removed | <a:03_tick_circle:1565665642084827206>`, `Successfully unsubscribed from feed: \`${url}\``));
      }

      // Default: Display overview and syntax
      const channelText = config.channelId ? `<#${config.channelId}>` : '`Not Bound`';
      const roleText = config.roleId ? `<@&${config.roleId}>` : '`None`';
      const feedCount = (config.feeds || []).length;

      const desc = [
        `Automated RSS News Feed Engine for server announcements and live dispatches.`,
        ``,
        `**Status & Configuration:**`,
        `• **Target Channel:** ${channelText}`,
        `• **Alert Ping Role:** ${roleText}`,
        `• **Active Subscriptions:** \`${feedCount} / 5 Feeds\``,
        ``,
        `**Command Usage:**`,
        `• \`${prefix}news setup <#channel> [@role]\` \u2014 Bind posting channel & alert ping role`,
        `• \`${prefix}news add <bbc|tech|aljazeera|cnn|rss_url>\` \u2014 Subscribe to a news feed`,
        `• \`${prefix}news list\` \u2014 View all active feed subscriptions`,
        `• \`${prefix}news remove <url>\` \u2014 Remove a subscribed feed`,
        `• \`${prefix}news disable\` \u2014 Turn off automated news feed and clear subscriptions`
      ].join('\n');

      return message.reply(cv2.info(`Automated News Feeds | Athena Prime`, desc));
    },

    async executeSlash(interaction) {
      const subCommand = interaction.options.getSubcommand();
      
      if (subCommand === 'setup') {
        const channel = interaction.options.getChannel('channel');
        let role = interaction.options.getRole('ping_role');
        const createRole = interaction.options.getBoolean('create_role');

        if (!role && createRole) {
          try {
            const guildConfig = db.getGuildConfig(interaction.guild.id);
            const color = guildConfig.accentColor || '#3498db';
            role = await interaction.guild.roles.create({ name: 'News Alerts', color: color, mentionable: false, reason: 'Role for automated News Feed mentions' });
          } catch (err) {
            return interaction.reply(cv2.danger('Permission Error', 'I lack the "Manage Roles" permission to dynamically create a news ping role.'));
          }
        }
        
        db.setNewsSetup(interaction.guild.id, channel.id, role ? role.id : null);
        
        let desc = `Successfully configured the news feed system!\n**Channel:** <#${channel.id}>\n`;
        if (role) desc += `**Ping Role:** <@&${role.id}>`;
        else desc += `**Ping Role:** None`;
        
        return interaction.reply(cv2.success('News Feed Configured', desc));
      }

      if (subCommand === 'disable') {
        const config = db.getNewsConfig(interaction.guild.id);
        if (!config || (!config.channelId && (!config.feeds || config.feeds.length === 0))) {
          return interaction.reply(cv2.info('Not Configured', 'The news feed system is not currently active on this server.'));
        }
        
        db.setNewsSetup(interaction.guild.id, null, null);
        if (db.cache.newsFeeds[interaction.guild.id]) {
           db.cache.newsFeeds[interaction.guild.id] = { channelId: null, roleId: null, feeds: [] };
        }
        db.updateNewsGuids(interaction.guild.id, []);
        
        return interaction.reply(cv2.success('System Disabled', 'The news feed system has been disabled and all presets have been deleted.'));
      }

      const config = db.getNewsConfig(interaction.guild.id);
      if (!config.channelId) {
        return interaction.reply(cv2.warn('Setup Required', 'You must run `/news setup` before managing feeds.'));
      }

      if (subCommand === 'add') {
        const preset = interaction.options.getString('preset');
        const custom = interaction.options.getString('custom_url');

        if (!preset && !custom) {
          return interaction.reply(cv2.warn('Missing Input', 'You must provide either a preset or a custom URL.'));
        }

        let name, url;
        if (preset) {
          const parts = preset.split('|');
          name = parts[0];
          url = parts[1];
        } else {
          url = custom;
          name = new URL(url).hostname; 
        }

        await interaction.deferReply();

        try {
          const feed = await parser.parseURL(url);
          name = feed.title || name;
          
          if (!config.feeds) config.feeds = [];
          if (config.feeds.length >= 5) {
            return interaction.editReply(cv2.warn('Limit Reached', 'You can only have up to 5 news feeds per server.'));
          }
          
          if (config.feeds.find(f => f.url === url)) {
            return interaction.editReply(cv2.warn('Duplicate Feed', 'This server is already subscribed to this exact feed URL.'));
          }

          db.addNewsFeed(interaction.guild.id, name, url);
          return interaction.editReply(cv2.success('Feed Added', `Successfully subscribed to **${name}**.\n\nURL: \`${url}\``));
        } catch (err) {
          return interaction.editReply(cv2.danger('Invalid RSS Feed', `Failed to parse the provided URL. Make sure it is a valid XML RSS Feed.\n\nError: \`${err.message}\``));
        }
      }

      if (subCommand === 'remove') {
        const url = interaction.options.getString('url');
        const feeds = config.feeds || [];
        const index = feeds.findIndex(f => f.url === url);
        
        if (index === -1) {
          return interaction.reply(cv2.warn('Not Found', 'Could not find an active feed with that URL.'));
        }

        db.removeNewsFeed(interaction.guild.id, url);
        return interaction.reply(cv2.success('Feed Removed', `Successfully removed feed: \`${url}\``));
      }

      if (subCommand === 'list') {
        const feeds = config.feeds || [];
        if (feeds.length === 0) {
          return interaction.reply(cv2.info('No Feeds', 'This server is not currently subscribed to any news feeds.'));
        }

        const feedList = feeds.map((f, i) => `**${i+1}. ${f.name}**\n<${f.url}>`).join('\n\n');
        return interaction.reply(cv2.info('Active News Feeds', feedList));
      }
    }
  }
];
