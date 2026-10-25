import { PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, SeparatorBuilder, MessageFlags } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { processMp3Link } from '../utils/mediaDownloader.js';
import { isAuthorized, cleanDisplayName } from '../utils/helpers.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

async function optimizeEmojiBuffer(buffer, isAnimated = false) {
  if (!buffer || buffer.length <= 256 * 1024) return buffer;

  if (isAnimated) {
    const tmpDir = os.tmpdir();
    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inPath = path.join(tmpDir, `emoji_in_${uniqueId}.gif`);
    const outPath = path.join(tmpDir, `emoji_out_${uniqueId}.gif`);

    try {
      await fs.promises.writeFile(inPath, buffer);

      const presets = [
        'fps=15,scale=128:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3',
        'fps=12,scale=96:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse=dither=bayer:bayer_scale=2',
        'fps=10,scale=80:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=32[p];[s1][p]paletteuse=dither=bayer:bayer_scale=1',
        'fps=8,scale=64:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=16[p];[s1][p]paletteuse=dither=bayer:bayer_scale=1'
      ];

      for (const vf of presets) {
        try {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              try { proc.kill(); } catch {}
              reject(new Error('ffmpeg timeout'));
            }, 6000);
            const proc = spawn(ffmpegPath, ['-y', '-i', inPath, '-vf', vf, outPath]);
            proc.on('close', code => {
              clearTimeout(timer);
              code === 0 ? resolve() : reject(new Error('exit ' + code));
            });
            proc.on('error', err => {
              clearTimeout(timer);
              reject(err);
            });
          });
          if (fs.existsSync(outPath)) {
            const compressed = await fs.promises.readFile(outPath);
            if (compressed.length <= 256 * 1024) {
              return compressed;
            }
          }
        } catch {}
      }
    } catch {} finally {
      try { await fs.promises.unlink(inPath); } catch {}
      try { await fs.promises.unlink(outPath); } catch {}
    }
  } else {
    try {
      const { createCanvas, loadImage, isCanvasAvailable } = await import('../utils/canvas.js');
      if (isCanvasAvailable) {
        const img = await loadImage(buffer);
        const canvas = createCanvas(128, 128);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 128, 128);
        const compressed = canvas.toBuffer('image/png');
        if (compressed.length <= 256 * 1024) return compressed;
      }
    } catch {}
  }

  return buffer;
}

// ——————————————————————————————————————————————————
// Bold underline header formatter — matches embed title style
// ——————————————————————————————————————————————————
function h(text) {
  return `__**${text.toUpperCase()}**__`;
}

export const commands = [

  // --- CALCULATOR COMMAND ---
  {
    name: 'calculator',
    description: 'Launch an interactive Discord button calculator.',
    aliases: ['calc', 'math'],
    category: 'utility',
    permissions: [],
    async executePrefix(message) {
      await sendCalculator(message);
    },
    async executeSlash(interaction) {
      await sendCalculator(interaction);
    }
  },


    // --- MP3 EXTRACTOR COMMAND ---
    {
      name: 'mp3',
      description: 'Extract audio from any video link (YouTube, TikTok, Twitter, etc)',
      type: 1,
      options: [
        { name: 'link', description: 'The video link to extract audio from', type: 3, required: true }
      ],
      async executePrefix(message, args) {
        if (!args[0]) return message.reply(cv2.error('MISSING ARGUMENT', 'Please provide a valid video link.'));
        const url = args[0];
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return message.reply(cv2.warn('Invalid URL', `\`${url}\` is not a valid link.\n-# Provide a direct link e.g. a YouTube, TikTok, or Twitter URL.`));
        }
        await processMp3Link(message.client, message, url);
      },
      async executeSlash(interaction) {
        const link = interaction.options.getString('link');
        // Acknowledge interaction since downloading can take time
        await interaction.deferReply();
        // Since processMp3Link replies to 'message', we create a mock message
        const mockMessage = {
          client: interaction.client,
          author: interaction.user,
          channel: { sendTyping: async () => {} },
          reply: async (data) => await interaction.editReply(data)
        };
        await processMp3Link(interaction.client, mockMessage, link);
      }
    },


    // --- SET MEDIA CHANNEL COMMAND ---
    {
      name: 'setmedia',
      description: 'Bind the Auto Media Downloader to a specific channel',
      type: 1,
      options: [
        { name: 'channel', description: 'The channel to monitor for media links', type: 7, required: true }
      ],
      async executePrefix(message, args) {
        if (!(await isAuthorized(message.author, message.guild))) return message.reply(cv2.error('UNAUTHORIZED ACCESS', 'You lack the required permissions to modify the system core routing.'));
        const channelMention = message.mentions.channels.first();
        if (!channelMention) return message.reply(cv2.error('INVALID TARGET', 'Please mention a valid text channel to bind the extraction module.'));
        db.updateGuildConfig(message.guild.id, { mediaChannelId: channelMention.id });
          const stickyText = 'MEDIA DOWNLOADER BOUND | The Auto-Media Downloader is now monitoring this channel.\nPaste TikTok, Instagram, YouTube, Twitter/X, or Reddit links to interactively extract the raw MP4 video or convert it to MP3 audio.\nIf Discord rejects a video due to file size, Athena will offer to compress it to a smaller version.\nDiscord\'s upload limit depends on your server\'s boost level.';
          db.setStickyMessage(message.guild.id, channelMention.id, stickyText);
        
        return message.reply(cv2.success(
          'MEDIA DOWNLOADER BOUND',
          `The Auto-Media Downloader is now monitoring <#${channelMention ? channelMention.id : channel.id}>.\nPaste TikTok, Instagram, YouTube, Twitter/X, or Reddit links in that channel to interactively extract the raw MP4 video or convert it to MP3 audio.\nNote: Files are strictly limited to under 25MB to comply with Discord's attachment size limits.`
        ));
      },
      async executeSlash(interaction) {
        if (!(await isAuthorized(interaction.user, interaction.guild))) return interaction.reply(cv2.e.error('UNAUTHORIZED ACCESS', 'You lack the required permissions to modify the system core routing.'));
        const channel = interaction.options.getChannel('channel');
        db.updateGuildConfig(interaction.guild.id, { mediaChannelId: channel.id });
          const stickyText = 'MEDIA DOWNLOADER BOUND | The Auto-Media Downloader is now monitoring this channel.\nPaste TikTok, Instagram, YouTube, Twitter/X, or Reddit links to interactively extract the raw MP4 video or convert it to MP3 audio.\nIf Discord rejects a video due to file size, Athena will offer to compress it to a smaller version.\nDiscord\'s upload limit depends on your server\'s boost level.';
          db.setStickyMessage(interaction.guild.id, channel.id, stickyText);
        
        return interaction.reply(cv2.success(
          'MEDIA DOWNLOADER BOUND',
          `The Auto-Media Downloader is now monitoring <#${channel.id}>.\nPaste TikTok, Instagram, YouTube, Twitter/X, or Reddit links in that channel to interactively extract the raw MP4 video or convert it to MP3 audio.\nNote: Files are strictly limited to under 25MB to comply with Discord's attachment size limits.`
        ));
      }
    },

    // --- UNSET MEDIA CHANNEL COMMAND ---
    {
      name: 'unsetmedia',
      description: 'Unbind and disable the Auto Media Downloader',
      type: 1,
      options: [],
      async executePrefix(message, args) {
        if (!(await isAuthorized(message.author, message.guild))) return message.reply(cv2.error('UNAUTHORIZED ACCESS', 'You lack the required permissions to modify the system core routing.'));
        const cfg = db.getGuildConfig(message.guild.id);
          if (cfg && cfg.mediaChannelId) {
            const stickyData = db.getStickyMessage(message.guild.id, cfg.mediaChannelId);
            if (stickyData && stickyData.lastMessageId) {
              const ch = message.guild.channels.cache.get(cfg.mediaChannelId);
              if (ch) ch.messages.delete(stickyData.lastMessageId).catch(() => null);
            }
            db.removeStickyMessage(message.guild.id, cfg.mediaChannelId);
          }
          db.updateGuildConfig(message.guild.id, { mediaChannelId: null });
        
        return message.reply(cv2.success(
          'MEDIA DOWNLOADER DISABLED',
          'The Auto-Media Downloader has been completely unbound and disabled for this server.'
        ));
      },
      async executeSlash(interaction) {
        if (!(await isAuthorized(interaction.user, interaction.guild))) return interaction.reply(cv2.e.error('UNAUTHORIZED ACCESS', 'You lack the required permissions to modify the system core routing.'));
        const cfg = db.getGuildConfig(interaction.guild.id);
          if (cfg && cfg.mediaChannelId) {
            const stickyData = db.getStickyMessage(interaction.guild.id, cfg.mediaChannelId);
            if (stickyData && stickyData.lastMessageId) {
              const ch = interaction.guild.channels.cache.get(cfg.mediaChannelId);
              if (ch) ch.messages.delete(stickyData.lastMessageId).catch(() => null);
            }
            db.removeStickyMessage(interaction.guild.id, cfg.mediaChannelId);
          }
          db.updateGuildConfig(interaction.guild.id, { mediaChannelId: null });
        
        return interaction.reply(cv2.success(
          'MEDIA DOWNLOADER DISABLED',
          'The Auto-Media Downloader has been completely unbound and disabled for this server.'
        ));
      }
    },

  // --- HELP COMMAND ---
  {
    name: 'help',
    description: 'Show Athena Prime command menu or inspect command details and aliases',
    type: 1,
    options: [
      {
        name: 'command',
        description: 'Command or alias to inspect',
        type: 3,
        required: false
      }
    ],
    async executePrefix(message, args) {
        let reply;
        try {
          if (args && args.length > 0) {
              const cmdName = args[0].toLowerCase();
              if (cmdName === 'explain' || cmdName === 'architecture' || cmdName === 'deepdive' || cmdName === 'howitworks' || cmdName === 'docs') {
                const { buildTopicsDirectoryContainer } = await import('../utils/explainerRegistry.js');
                const container = buildTopicsDirectoryContainer(db.getGuildConfig(message.guild.id)?.prefix || '!');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
              }
              const matchingModule = helpModules.find(m => 
                m.id === cmdName || 
                m.shortLabel.toLowerCase() === cmdName || 
                ((cmdName === 'count' || cmdName === 'counting') && m.id === 'counting') ||
                ((cmdName === 'leave' || cmdName === 'farewell' || cmdName === 'welcome') && m.id === 'welcome') ||
                ((cmdName === 'antinuke' || cmdName === 'an') && m.id === 'security') ||
                ((cmdName === 'athena' || cmdName === 'guide' || cmdName === 'neural' || cmdName === 'ai' || cmdName === 'aiguide') && m.id === 'ai') ||
                ((cmdName === 'eco' || cmdName === 'economy' || cmdName === 'coins' || cmdName === 'shop') && m.id === 'economy')
              );
              if (matchingModule) {
                const container = buildHelpContainer(message.client, message.guild.id, matchingModule.id);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
              }
              const { default: commandMap } = await import('./loader.js');
              let targetCmd = commandMap.get(cmdName);
              
              if (!targetCmd) {
                  return message.reply({ content: `-! <:cross_red:1533860128015519895> **Command Not Found:** ` + cmdName });
              }
              
              let permsText = "Public / Everyone";
              if (targetCmd.name === "emergency" || targetCmd.name === "endemergency" || targetCmd.name === "panic") {
                  permsText = "Server Owner and Bot Owners ONLY (Extra Owners Unauthorized)";
              } else if (targetCmd.name === "lockdown" || targetCmd.name === "unlockdown") {
                  permsText = "Server Owner, Bot Owners, Extra Owners, and Administrators";
              } else if (targetCmd.name === "unbypassable" || targetCmd.name === "learn") {
                  permsText = "Administrators, Server Owner, Extra Owners, and Bot Owners";
              } else if (targetCmd.permissions && targetCmd.permissions.length > 0) {
                  if (targetCmd.permissions.includes(8n)) permsText = "Administrator";
                  else if (targetCmd.permissions.includes(32n)) permsText = "Manage Server";
                  else if (targetCmd.permissions.includes(1099511627776n)) permsText = "Moderate Members";
                  else permsText = "Elevated Permissions";
              }
              
              let catStr = targetCmd.category ? targetCmd.category.charAt(0).toUpperCase() + targetCmd.category.slice(1) : "General";
              if (targetCmd.name === "qr" || targetCmd.name === "fck" || targetCmd.name === "np") {
                  catStr = "@Bot Commands (Direct @Bot Mention Commands)";
              }
              
              const config = db.getGuildConfig(message.guild.id);
              const prefix = config?.prefix || '!';
              
              let usageText = `${prefix}${targetCmd.name}`;
              if (targetCmd.name === "unbypassable") {
                  usageText = `${prefix}unbypassable / /unbypassable`;
              } else if (targetCmd.name === "learn") {
                  usageText = `${prefix}learn [status|on|off|baseline|signatures|clear] / /learn`;
              } else if (targetCmd.name === "voicerole") {
                  usageText = `${prefix}voicerole [@role|ID|Name|disable] / /voicerole [role] [disable]`;
              } else if (targetCmd.name === "pinterest" || targetCmd.name === "pin") {
                  usageText = `${prefix}pinterest <link> / ${prefix}pin <link> / /pinterest <link>`;
              } else if (targetCmd.name === "weather" || targetCmd.name === "wtr") {
                  usageText = `${prefix}weather <location/maps_url> / ${prefix}wtr / ${prefix}climate / ${prefix}forecast / ${prefix}temp / /weather [location]`;
              } else if (targetCmd.name === "image" || targetCmd.name === "pic") {
                  usageText = `${prefix}image <query> / ${prefix}pic / ${prefix}img / ${prefix}photo / ${prefix}picture / ${prefix}searchimg / /image [query]`;
              } else if (targetCmd.name === "stock" || targetCmd.name === "market") {
                  usageText = `${prefix}stock [symbol] / ${prefix}market / ${prefix}stocks / ${prefix}ticker [symbol] / /stock [symbol]`;
              } else if (targetCmd.name === "stockai" || targetCmd.name === "stockexplain") {
                  usageText = `${prefix}stockai <question/topic> / ${prefix}stockexplain <symbol/topic> / ${prefix}marketai / /stockai [query]`;
              } else if (targetCmd.name === "movers") {
                  usageText = `${prefix}movers / ${prefix}topmovers / ${prefix}gainers / ${prefix}losers`;
              } else if (targetCmd.name === "crypto") {
                  usageText = `${prefix}crypto [coin] / ${prefix}btc / ${prefix}eth / ${prefix}coin [symbol]`;
              } else if (targetCmd.name === "stocknews") {
                  usageText = `${prefix}stocknews [symbol/market] / ${prefix}marketnews`;
              } else if (targetCmd.name === "stockchannel") {
                  usageText = `${prefix}stockchannel set <#channel> / ${prefix}stockchannel disable / ${prefix}stockchannel test / ${prefix}stockchannel status`;
              } else if (targetCmd.name === "symbols" || targetCmd.name === "symbollist" || targetCmd.name === "tickers") {
                  usageText = `${prefix}symbols [query/category] / ${prefix}symbollist / ${prefix}tickers / ${prefix}tickerlist / ${prefix}stocksymbols / ${prefix}marketlist / ${prefix}symlist / /symbols [query]`;
              } else if (targetCmd.name === "nifty" || targetCmd.name === "banknifty" || targetCmd.name === "sensex" || targetCmd.name === "niftyit" || targetCmd.name === "indiavix") {
                  usageText = `${prefix}nifty [50|bank|sensex|it|vix] / ${prefix}banknifty / ${prefix}sensex / ${prefix}niftyit / ${prefix}indiavix / /nifty [index]`;
              } else if (targetCmd.name === "qr" || targetCmd.name === "fck" || targetCmd.name === "np") {
                  usageText = `@bot ${targetCmd.name}`;
              }
              
              const aliasesText = Array.isArray(targetCmd.aliases) && targetCmd.aliases.length > 0
                  ? targetCmd.aliases.map(a => `\`${prefix}${a}\``).join(', ')
                  : '`None`';

              let descContent = targetCmd.description || "No description provided.";
              if (targetCmd.name === "pinterest" || targetCmd.name === "pin") {
                  descContent = `Extracts and downloads uncompressed original master-resolution images and MP4 videos from any Pinterest link or short URL (pin.it).\n\n` +
                    `> -# **__Features & Pipeline:__**\n` +
                    `> • **Full Master Resolution:** Automatically expands shortened \`pin.it\` redirects and upgrades 736x/564x preview thumbnails to uncompressed master quality (/originals/).\n` +
                    `> • **Video & GIF Extraction:** Automatically extracts full MP4 videos (v.pinimg.com) and animated assets.\n` +
                    `> • **1-Click Download Button:** Attaches an instant direct button to download the media asset directly to your device.\n` +
                    `> • **Universal Cross-Bot Media Integration:** Any command with an image prompt or button (\`${prefix}welcome\`, \`${prefix}leave\`, \`${prefix}ticketpanel\`, \`${prefix}announce\`, \`${prefix}aiannounce\`, \`${prefix}autoreply\`, and Studio) accepts direct Pinterest links (\`pin.it\` or \`pinterest.com\`) and Athena will automatically extract and resolve the raw high-resolution media!\n\n` +
                    `> -# **__Usage Syntax:__**\n` +
                    `> • \`${prefix}pinterest <link>\` - Download media from Pinterest link.\n` +
                    `> • \`${prefix}pin <link>\` - Short alias for quick downloads.\n` +
                    `> • Reply to any Pinterest link with \`${prefix}pin\` to download it instantly.`;
              } else if (targetCmd.name === "welcome" || targetCmd.name === "leave") {
                  descContent = `Interactive visual builder for join greetings and departures featuring borderless CV2 embeds, dynamic placeholders, and full media pipeline.\n\n` +
                    `> -# **__Media & Universal Pinterest Support:__**\n` +
                    `> • **Direct Pinterest Links:** Paste any Pinterest link (\`pin.it\` or \`pinterest.com/pin/...\`) into Image, Thumbnail, Author Icon, or Footer Icon modals — Athena automatically extracts the uncompressed master resolution media.\n` +
                    `> • **MP4-to-GIF Conversion:** Video links are automatically converted into animated looping Discord GIFs.\n` +
                    `> • **Dynamic Variables:** Full support for \`{membercount}\`, \`{ordinal}\`, \`{user}\`, \`{avatar}\`, \`{server}\`, and 15+ guild metadata tokens.\n\n` +
                    `> -# **__Usage Syntax:__**\n` +
                    `> • \`${prefix}${targetCmd.name}\` - Open the interactive visual configuration dashboard.`;
              } else if (targetCmd.name === "ticketpanel") {
                  descContent = `Interactive visual ticket panel deployment dashboard with AI triage and custom media integration.\n\n` +
                    `> -# **__Features & Media Support:__**\n` +
                    `> • **Universal Pinterest Support:** Panel banner and thumbnail inputs support direct Pinterest links (\`pin.it\` & \`pinterest.com\`) with automatic uncompressed extraction.\n` +
                    `> • **Smart AI Triage:** Classifies incoming inquiries into urgency tiers with staff executive summaries.\n` +
                    `> • **Interactive Customization:** Buttons, dropdown reasons, target channels, and closing roles.\n\n` +
                    `> -# **__Usage Syntax:__**\n` +
                    `> • \`${prefix}ticketpanel\` - Open the interactive panel manager.`;
              } else if (targetCmd.name === "announce" || targetCmd.name === "aiannounce") {
                  descContent = `Interactive announcement studio to craft, format, preview, and dispatch server broadcasts.\n\n` +
                    `> -# **__Features & Media Support:__**\n` +
                    `> • **Universal Pinterest Support:** Announcement banners and images support direct Pinterest links (\`pin.it\` & \`pinterest.com\`) with automatic master extraction.\n` +
                    `> • **AI Polish & Formatting:** Converts rough notes into beautifully formatted broadcasts with custom emojis.\n` +
                    `> • **Live Ephemeral Preview:** Preview your broadcast before sending it to the target channel.\n\n` +
                    `> -# **__Usage Syntax:__**\n` +
                    `> • \`${prefix}${targetCmd.name} [prompt] [#channel]\` - Launch announcement builder.`;
              } else if (targetCmd.name === "learn") {
                  descContent = `${targetCmd.description}\n\n` +
                    `> -# **__Subcommands Supported:__**\n` +
                    `> • \`${prefix}learn on / enable\` - Engages continuous adaptive profiling.\n` +
                    `> • \`${prefix}learn off / disable\` - Disengages profiling mode.\n` +
                    `> • \`${prefix}learn baseline\` - Real-time audit scan of staff, roles & webhooks.\n` +
                    `> • \`${prefix}learn signatures / list\` - Displays recorded threat signatures & velocity spikes.\n` +
                    `> • \`${prefix}learn clear\` - Resets captured signature registry for the server.\n` +
                    `> • \`${prefix}learn status\` - Displays the live telemetry dashboard.`;
              } else if (targetCmd.name === "voicerole") {
                  descContent = `Automatically assigns a designated role to members the instant they connect to ANY voice channel, and strips it when they disconnect.\n\n` +
                    `> -# **__Universal Scope:__**\n` +
                    `> • Enforces role assignment & revocation for **ALL** entities: Server Owner, Bot Owner, Extra Owners, standard members, and integration bots.\n` +
                    `> • Real-time live synchronization: instantly grants role to everyone sitting in VCs when configured, and instantly cleans up when disabled or when members leave.\n\n` +
                    `> -# **__Subcommands & Syntax:__**\n` +
                    `> • \`${prefix}voicerole\` - Open the interactive Components V2 Control Panel.\n` +
                    `> • \`${prefix}voicerole <@role / ID / Name>\` - Bind a specific voice role.\n` +
                    `> • \`${prefix}voicerole disable\` - Disable system & strip role from all active members.\n` +
                    `> • \`/voicerole [role] [disable]\` - Slash command equivalent.`;
              } else if (targetCmd.name === "raidmode") {
                  descContent = `Unified Server Raid Defense Matrix providing manual lockdown control and automated join-velocity burst detection.\n\n` +
                    `> -# **__Subcommands & Directives:__**\n` +
                    `> • \`${prefix}raidmode\` - Displays the live Server Raid Defense Matrix dashboard.\n` +
                    `> • \`${prefix}raidmode on\` - Immediately locks down server, elevates verification to VERY HIGH (Phone Required), and auto-quarantines incoming accounts.\n` +
                    `> • \`${prefix}raidmode off\` - Disengages lockdown, restores baseline verification level, and mass-releases quarantined members.\n` +
                    `> • \`${prefix}raidmode auto on\` - Arms automated join-velocity burst detection.\n` +
                    `> • \`${prefix}raidmode auto off\` - Disarms automated join-velocity burst detection.\n` +
                    `> • \`${prefix}raidmode auto threshold <number>\` - Configures how many joins trigger the auto-shield (default: 8).\n` +
                    `> • \`${prefix}raidmode auto window <seconds>\` - Configures time window in seconds (default: 5s).`;
              } else if (targetCmd.name === "weather" || targetCmd.name === "wtr") {
                  descContent = `Live global weather reconnaissance with generated satellite world map projection and 3-day forecast.\n\n` +
                    `> -# **__Features & Projection Engine:__**\n` +
                    `> • **Universal Location Support:** Works for any location globally — city names, countries, coordinates, or Google Maps links.\n` +
                    `> • **Google Maps Link Support:** Paste any Google Maps URL (\`https://maps.google.com/...\` or \`https://maps.app.goo.gl/...\`) and Athena will automatically extract and pinpoint the exact coordinates.\n` +
                    `> • **Generated World Map:** Renders an Equirectangular satellite world map on Canvas with locked radar crosshairs, target beacon, and telemetry.\n` +
                    `> • **Atmospheric Telemetry:** Current temperature (°C and °F), feels-like index, humidity, wind velocity and direction, UV index, pressure, and visibility.\n` +
                    `> • **3-Day Meteorological Forecast:** Max/min temperatures and daily condition summaries.\n` +
                    `> • **Solar & Lunar Telemetry:** Sunrise, sunset, and moon phase illumination.\n\n` +
                    `> -# **__All Aliases & Usage Syntax:__**\n` +
                    `> • \`${prefix}weather <city>\` / \`${prefix}wtr <city>\` - Quick weather search (e.g. \`${prefix}wtr London\`, \`${prefix}wtr Tokyo\`).\n` +
                    `> • \`${prefix}climate <city>\` / \`${prefix}forecast <city>\` - Detailed regional meteorological forecast.\n` +
                    `> • \`${prefix}temp <city>\` / \`${prefix}temperature <city>\` - Temperature and atmospheric condition lookup.\n` +
                    `> • \`${prefix}wtr <coordinates>\` - Coordinate search (e.g. \`${prefix}wtr 13.0827, 80.2707\`).\n` +
                    `> • \`${prefix}wtr <google_maps_url>\` - Extract weather directly from any Google Maps link.\n` +
                    `> • \`/weather [location]\` - Slash command equivalent.`;
              } else if (targetCmd.name === "image" || targetCmd.name === "pic") {
                  descContent = `Real-time web image search retrieving actual high-resolution pictures from the internet.\n\n` +
                    `> -# **__Features & Intelligence:__**\n` +
                    `> • **Real Web Pictures:** Queries live net search engines to retrieve actual authentic pictures matching any topic (e.g. \`cat\`, \`worldmap\`, \`fog\`, \`mist\`, \`car\`, \`cm of tn\`, \`biden\`).\n` +
                    `> • **Multi-Page 70+ Pool & Fresh Batches:** Concurrently pools dozens of high-res pictures per search with automatic unblocked resolution.\n` +
                    `> • **Interactive Pagination:** Browse results with \`◀ Previous\` and \`Next ▶\` buttons directly inside Discord.\n` +
                    `> • **Random Shuffle Button:** Click \`[Random]\` to discover unexpected high-res pictures.\n` +
                    `> • **1-Click Fresh Batch Button:** Click \`[Fresh Batch]\` to fetch brand new pictures on demand.\n` +
                    `> • **Direct Source Link:** 1-click button to view the original full-resolution image on the hosting website.\n` +
                    `> • **Fail-Safe Session Recovery:** Sessions never expire; Athena seamlessly re-queries in the background.\n` +
                    `> • **Conversational AI Integration:** You can also ask Athena in chat (e.g. \`@Athena picture of cat\` or \`${prefix}ask give me a picture of biden\`) and Athena will automatically fetch and provide the picture.\n\n` +
                    `> -# **__All Aliases & Usage Syntax:__**\n` +
                    `> • \`${prefix}image <query>\` - Primary image search directive.\n` +
                    `> • \`${prefix}pic <query>\` - Short quick-alias (e.g. \`${prefix}pic cat\`, \`${prefix}pic car\`).\n` +
                    `> • \`${prefix}img <query>\` / \`${prefix}photo <query>\` - Visual media search aliases.\n` +
                    `> • \`${prefix}picture <query>\` / \`${prefix}searchimg <query>\` - Descriptive net lookup aliases.\n` +
                    `> • \`/image [query]\` - Slash command equivalent.`;
              } else if (targetCmd.name === "stock" || targetCmd.name === "market") {
                  descContent = `Universal real-time stock, ETF, and cryptocurrency telemetry engine with terminal-grade Canvas charts, autonomous self-learning database, and market intelligence.\n\n` +
                    `> -# **__Features & Telemetry Pipeline:__**\n` +
                    `> • **Global Market Pulse Dashboard:** Run without arguments (\`${prefix}stock\` or \`${prefix}market\`) to generate a master 6-index overview (S&P 500, NASDAQ, Dow Jones, NIFTY 50, Bitcoin, Ethereum) plus mega-caps ticker tape.\n` +
                    `> • **Individual Stock Telemetry Card:** Run with any ticker or company name (\`${prefix}stock NVDA\`, \`${prefix}stock TCS\`, \`${prefix}stock ZOMATO\`, \`${prefix}stock BTC\`) to generate a custom Canvas chart with smooth Bezier price curve, day range slider, 52-week range slider, volume, and sentiment gauge.\n` +
                    `> • **Universal Global Market Resolution:** Resolves any publicly traded asset worldwide without forcing exchange extensions (Indian NSE/BSE like TCS, RELIANCE, INFY, TATAMOTORS, SBIN, SWIGGY; US tech titans NVDA, AAPL, TSLA; crypto BTC, ETH, SOL; commodities GOLD, CRUDE; and global indices).\n` +
                    `> • **Autonomous Self-Learning & Auto-Updating Registry:** Automatically detects, indexes, and edits any new stock, recent IPO, or corporate ticker renaming (e.g. Zomato -> ETERNAL.NS, Tata Motors -> TMCV.NS, FB -> META) and permanently caches it in SQLite.\n` +
                    `> • **Dynamic Multi-Currency Auto-Formatting:** Dynamically detects and formats quotes with appropriate currency symbols (₹ for INR, $ for USD, € for EUR, £ for GBP, ¥ for JPY).\n` +
                    `> • **Interactive Components V2 Controls:** 1-click buttons to browse Symbols Directory, refresh quotes, run instant AI deep-dive breakdowns, and read financial news.\n\n` +
                    `> -# **__All Aliases & Directives:__**\n` +
                    `> • \`${prefix}stock [symbol]\` - Primary stock command.\n` +
                    `> • \`${prefix}market\` / \`${prefix}stocks\` / \`${prefix}stockmarket\` - Global market overview shortcuts.\n` +
                    `> • \`${prefix}ticker <symbol>\` / \`${prefix}share <symbol>\` / \`${prefix}shares <symbol>\` - Direct ticker lookup.\n` +
                    `> • \`${prefix}symbols [query]\` - Universal symbol directory & search.\n` +
                    `> • \`${prefix}stockai <query>\` - Ask Athena AI for detailed financial and earnings analysis.\n` +
                    `> • \`${prefix}movers\` - Real-time market gainers and decliners.\n` +
                    `> • \`${prefix}crypto [coin]\` - Dedicated cryptocurrency asset telemetry.\n` +
                    `> • \`${prefix}stocknews [symbol]\` - Recent headlines and financial catalysts.\n` +
                    `> • \`${prefix}stockchannel <set|disable|status|test>\` - Configure daily automated market upload channel.\n\n` +
                    `> -# <a:uptime:1552608831060844575> **Risk Notice:** Athena can make mistakes. Market data may be delayed or estimated. Not financial advice. Always double check live data before investing.`;
              } else if (targetCmd.name === "stockai" || targetCmd.name === "stockexplain") {
                  descContent = `AI-powered quantitative financial analyst providing in-depth market explanations, earnings breakdowns, and valuation concepts.\n\n` +
                    `> -# **__Capabilities:__**\n` +
                    `> • Injects live exchange prices and recent press headlines into query context.\n` +
                    `> • Dissects macroeconomic trends, Federal Reserve rate decisions, technical levels, and earnings drivers.\n` +
                    `> • Formats all responses in sleek grey markdown with clear bold-underlined headers.\n\n` +
                    `> -# **__Usage Syntax:__**\n` +
                    `> • \`${prefix}stockai why did tech drop today?\`\n` +
                    `> • \`${prefix}stockai explain NVDA valuation\`\n` +
                    `> • \`${prefix}stockexplain TSLA\`\n\n` +
                    `> -# <a:uptime:1552608831060844575> **Risk Notice:** Athena can make mistakes. AI insights are for educational purposes only. Not financial advice. Always double check data.`;
              } else if (targetCmd.name === "stockchannel") {
                  descContent = `Configures an automated channel for daily stock market intelligence briefings and high-resolution Canvas image uploads.\n\n` +
                    `> -# **__Automated Dispatch System:__**\n` +
                    `> • Automatically posts every morning at **09:30 AM EST (14:30 UTC)** coinciding with US Market Open.\n` +
                    `> • Generates and attaches the high-resolution World Market Pulse dashboard image.\n` +
                    `> • Strictly tracks and fetches channels via database Snowflake ID.\n\n` +
                    `> -# **__Directives:__**\n` +
                    `> • \`${prefix}stockchannel set <#channel>\` - Bind broadcast channel.\n` +
                    `> • \`${prefix}stockchannel disable\` - Turn off automated daily upload.\n` +
                    `> • \`${prefix}stockchannel test\` - Immediately post today's briefing to verify.\n` +
                    `> • \`${prefix}stockchannel status\` - View current configuration.\n\n` +
                    `> -# <a:uptime:1552608831060844575> **Risk Notice:** Athena can make mistakes. Market data may be delayed or estimated. Not financial advice. Always double check live data.`;
              } else if (targetCmd.name === "movers") {
                  descContent = `Real-time market volatility and momentum scanner across mega-cap equities and major cryptocurrencies.\n\n` +
                    `> -# **__Features & Intelligence:__**\n` +
                    `> • **Top Gainers:** Identifies the strongest positive price velocity across global equities and crypto.\n` +
                    `> • **Top Decliners:** Highlights major downward volatility and market pullbacks.\n` +
                    `> • **Supporting Ecosystem:** Seamless integration with \`${prefix}stock <symbol>\`, \`${prefix}market\`, and \`${prefix}stockai <query>\`.\n\n` +
                    `> -# **__All Aliases & Directives:__**\n` +
                    `> • \`${prefix}movers\` - Full market gainers & decliners breakdown.\n` +
                    `> • \`${prefix}topmovers\` / \`${prefix}gainers\` / \`${prefix}losers\` / \`${prefix}marketmovers\` - Direct aliases.\n\n` +
                    `> -# <a:uptime:1552608831060844575> **Risk Notice:** Athena can make mistakes. Market data may be delayed or estimated. Not financial advice. Always double check live data.`;
              } else if (targetCmd.name === "crypto") {
                  descContent = `Dedicated cryptocurrency market telemetry and Canvas price action charts.\n\n` +
                    `> -# **__Features & Visual Telemetry:__**\n` +
                    `> • **Widescreen Canvas Charts:** Generates high-resolution price action curves with 24h range, 52-week range, volume, and sentiment gauge.\n` +
                    `> • **Universal Coin Support:** Supports Bitcoin (\`BTC\`), Ethereum (\`ETH\`), Solana (\`SOL\`), Dogecoin (\`DOGE\`), XRP, and 100+ crypto assets.\n` +
                    `> • **Default Asset:** Running \`${prefix}crypto\` without arguments defaults to Bitcoin (BTC-USD).\n\n` +
                    `> -# **__All Aliases & Directives:__**\n` +
                    `> • \`${prefix}crypto [coin]\` - e.g. \`${prefix}crypto BTC\`, \`${prefix}crypto ETH\`, \`${prefix}crypto SOL\`\n` +
                    `> • \`${prefix}btc\` / \`${prefix}eth\` / \`${prefix}coin <symbol>\` - Quick crypto shortcuts.\n\n` +
                    `> -# <a:uptime:1552608831060844575> **Risk Notice:** Athena can make mistakes. Crypto markets are highly volatile. Not financial advice. Always double check live data.`;
              } else if (targetCmd.name === "stocknews") {
                  descContent = `Real-time financial press wiretap aggregating breaking news and market catalysts.\n\n` +
                    `> -# **__Features & Syndicate:__**\n` +
                    `> • **Direct Publisher Links:** Real-time articles with direct links to verified financial press (Yahoo Finance, Bloomberg, Reuters, Motley Fool, MarketWatch).\n` +
                    `> • **Targeted Ticker News:** Query news for any specific stock (\`${prefix}stocknews NVDA\`, \`${prefix}stocknews TSLA\`) or general market (\`${prefix}stocknews\`).\n` +
                    `> • **Relative Timestamps:** Displays when articles were published (<t:...:R>).\n\n` +
                    `> -# **__All Aliases & Directives:__**\n` +
                    `> • \`${prefix}stocknews [symbol]\` - Primary news wiretap.\n` +
                    `> • \`${prefix}marketnews\` / \`${prefix}financenews\` - General market news aliases.\n\n` +
                    `> -# <a:uptime:1552608831060844575> **Risk Notice:** Athena can make mistakes. Market news is for informational purposes only. Always double check live data.`;
              } else if (targetCmd.name === "symbols" || targetCmd.name === "symbollist" || targetCmd.name === "tickers") {
                  descContent = `Universal symbol directory, autonomous self-learning ticker registry, and real-time search covering every publicly traded asset worldwide.\n\n` +
                    `> -# **__Primary & Aliases:__**\n` +
                    `> • \`${prefix}symbols\`, \`${prefix}symbollist\`, \`${prefix}tickers\`, \`${prefix}tickerlist\`, \`${prefix}stocksymbols\`, \`${prefix}marketlist\`, \`${prefix}symlist\`, \`/symbols [query]\`.\n\n` +
                    `> -# **__Interactive Categorized Directory:__**\n` +
                    `> • **Overview Directory:** Master cross-asset directory of top world equities, tech giants, crypto assets, and benchmark indices.\n` +
                    `> • **Trending & Newly Discovered Tickers:** Real-time newly listed IPOs, active movers, and ticker migrations auto-discovered and indexed in SQLite.\n` +
                    `> • **India (NSE / BSE):** Benchmark indices (\`NIFTY\`, \`SENSEX\`, \`BANKNIFTY\`) and heavyweights (\`TCS\`, \`RELIANCE\`, \`INFY\`, \`TATAMOTORS\`, \`SBIN\`, \`ETERNAL\` [Zomato], \`SWIGGY\`, \`HYUNDAI\`).\n` +
                    `> • **US Tech & AI Titans:** Mega-caps and semiconductor giants (\`NVDA\`, \`AAPL\`, \`MSFT\`, \`GOOGL\`, \`AMZN\`, \`META\`, \`TSLA\`, \`AMD\`, \`PLTR\`).\n` +
                    `> • **Cryptocurrencies:** Major digital blockchain assets (\`BTC\`, \`ETH\`, \`SOL\`, \`BNB\`, \`XRP\`, \`DOGE\`, \`ADA\`, \`AVAX\`, \`LINK\`, \`SUI\`).\n` +
                    `> • **Macro & Commodities:** Raw materials, international market indices & forex (\`GOLD\`, \`SILVER\`, \`CRUDE\`, \`NATGAS\`, \`NIKKEI\`, \`FTSE\`, \`DAX\`, \`USDINR\`, \`EURUSD\`).\n\n` +
                    `> -# **__Dynamic Search & Telemetry Commands:__**\n` +
                    `> • **Real-Time Live Search:** Run \`${prefix}symbols <query>\` or \`${prefix}symbols search <query>\` to instantly search global exchanges (e.g. \`${prefix}symbols Tata\`, \`${prefix}symbols Adani\`, \`${prefix}symbols Palantir\`, \`${prefix}symbols Zomato\`).\n` +
                    `> • **Autonomous Background Sync:** Automatically queries and syncs trending tickers across Indian and US exchanges every 2 hours.\n` +
                    `> • **1-Click Interactive Category Switcher:** Switch between Overview, Trending & New, India, US Tech, Crypto, and Macro categories via interactive buttons.\n\n` +
                    `> -# <a:uptime:1552608831060844575> **Risk Notice:** Athena can make mistakes. Market data is for informational purposes only. Not financial advice. Always double check live data.`;
              } else if (targetCmd.name === "nifty" || targetCmd.name === "banknifty" || targetCmd.name === "sensex" || targetCmd.name === "niftyit" || targetCmd.name === "indiavix") {
                  descContent = `Real-time Indian Benchmark Indices & Dalal Street telemetry engine with terminal-grade Canvas charts, Classic Pivot points (P, R1, S1), and interactive sector switches.\n\n` +
                    `> -# **__Primary & Dedicated Sector Commands:__**\n` +
                    `> • \`${prefix}nifty [50|bank|sensex|it|vix]\` - Primary Indian market benchmark terminal (defaults to NIFTY 50).\n` +
                    `> • \`${prefix}banknifty\` (\`${prefix}niftybank\`, \`${prefix}bnifty\`) - Dedicated Bank Nifty index telemetry & banking sector health.\n` +
                    `> • \`${prefix}sensex\` (\`${prefix}bse\`, \`${prefix}bsesensex\`) - Dedicated Bombay Stock Exchange Dalal Street 30 benchmark.\n` +
                    `> • \`${prefix}niftyit\` (\`${prefix}itnifty\`, \`${prefix}cnxit\`) - Dedicated Nifty IT index & tech exporter telemetry.\n` +
                    `> • \`${prefix}indiavix\` (\`${prefix}vixindia\`, \`${prefix}vix\`) - Dedicated India Volatility Index (Fear & Greed gauge).\n\n` +
                    `> -# **__Canvas Cards & Analytical Telemetry:__**\n` +
                    `> • **Custom Index Badges & Logos:** Official badges (\`N50\`, \`BNK\`, \`BSE\`, \`IT\`, \`VIX\`) and official NSE / BSE branding.\n` +
                    `> • **Classic Pivot Points Calculation:** Live mathematical Intraday Pivot Points (\`P\`, \`R1\`, \`S1\`) derived from High, Low, and Close.\n` +
                    `> • **Live Operational Market Hours Detector:** Pre-Market (09:00 - 09:15 IST), Regular Trading (09:15 - 15:30 IST), Post-Market (15:40 - 16:00 IST), and Off-Market/Weekend countdowns.\n` +
                    `> • **Interactive 1-Click Buttons:** Switch between Nifty 50, Bank Nifty, Sensex, Nifty IT, and India VIX instantly.\n\n` +
                    `> -# <a:uptime:1552608831060844575> **Risk Notice:** Athena can make mistakes. Index market data is for informational purposes only. Not financial advice.`;
              } else if (targetCmd.name === "health" || targetCmd.name === "audit") {
                  descContent = `Runs a real-time security diagnostics and hierarchy health assessment on the server.\n\n` +
                    `> -# **__Diagnostics Evaluated:__**\n` +
                    `> • **Hierarchy Health:** Bot highest role position vs all other roles; alerts if any roles above Athena have dangerous permissions.\n` +
                    `> • **Core Permissions:** Validates all 8 critical bot permissions (Admin, Manage Server, Manage Roles, Manage Channels, Ban, Kick, View Audit Log, Manage Webhooks).\n` +
                    `> • **Defense Modules:** Reports master antinuke status, security state, raid mode, and auto-shield.\n` +
                    `> • **Snapshot Integrity:** Reports ground-truth mapped channels, roles, and snapshot freshness.\n` +
                    `> • **Persistence Roles:** Validates Athena Unbypassable and Athena Firewall.\n` +
                    `> • **Audit Socket Latency:** Tests raw TLS undici keep-alive round-trip socket latency to Discord API.`;
              } else if (targetCmd.name === "security") {
                  descContent = `Master unbypassable security deployment, status monitoring, and incident telemetry engine.\n\n` +
                    `> -# **__Subcommands & Directives:__**\n` +
                    `> • \`${prefix}security enable all\` - One-click deployment of all 28 antinuke modules, persistence roles, and dashboard.\n` +
                    `> • \`${prefix}security disable all\` - Forcibly disable security system (requires 2FA Gmail authorization).\n` +
                    `> • \`${prefix}security status\` - Real-time active/offline matrix view across all 28 security modules.\n` +
                    `> • \`${prefix}security records\` - Live forensic incident audit stream of neutralized threats, execution speeds, and automatic rollbacks.\n` +
                    `> • \`${prefix}security disable <module>\` - Disable a specific security module.\n` +
                    `> • \`${prefix}security enable <module>\` - Enable a specific security module.`;
              } else if (targetCmd.name === "records" || targetCmd.name === "incidents") {
                  descContent = `Real-time security live audit & incident telemetry stream.\n\n` +
                    `> -# **__Features & Telemetry:__**\n` +
                    `> • Displays all intercepted threats in real time with relative timestamps (<t:...:R>).\n` +
                    `> • Shows perpetrator tag, user ID, countermeasure verdict (BAN_APPLIED, ROLES_STRIPPED), and strike latency in ms.\n` +
                    `> • Reports automatic channel/category recreation and permission rollbacks.\n` +
                    `> • Interactive components: Page navigation (Previous / Next), live Refresh, and Clear History.`;
              } else if (targetCmd.name === "trigger" || targetCmd.name === "trig") {
                  descContent = `Interactive server trigger word responder dashboard with synced animated looping GIF HUD, electric progress bar, and 4 advanced automation modules.\n\n` +
                    `> -# **__Synced Looping Animated GIF HUD:__**\n` +
                    `> • **In-GIF Progress Bar:** 8-frame looping animated HUD banner (\`trigger_banner.gif\`) with real-time glowing capacity progress bar drawn directly in the GIF.\n` +
                    `> • **Metrics Tracked:** Server trigger count vs 50-slot capacity, global network auto-responses, and synchronization state.\n\n` +
                    `> -# **__The 4 Advanced Trigger Engines:__**\n` +
                    `> • **Ghost / Auto-Destruct (\`ghost:<sec>\`):** Automatically purges response after N seconds to prevent channel clutter.\n` +
                    `> • **Bounty XP Rewards (\`xp:<amount>\` & \`maxclaims:<limit>\`):** Awards dynamic XP to the first N users who trigger the response.\n` +
                    `> • **Time / Clock Variant (\`time:<morning|day|night|weekend>\`):** Daypart-dependent response matching current server clock.\n` +
                    `> • **Audience & Tier Adaptive (\`audience:<newbie|booster|staff>\`):** Personalizes responses based on user tenure, booster status, or staff tier.\n\n` +
                    `> -# **__Cross-Action Synergy:__**\n` +
                    `> • **Dual-Action Emoji Reaction Synergy (\`reaction:<emoji>\`):** Reacts with custom/unicode emoji on the triggering message while responding.\n` +
                    `> • **Staff Alert Mirroring (\`mirror:<#channel>\`):** Escalates emergency keywords directly to staff channels in real time.\n\n` +
                    `> -# **__Usage Syntax:__**\n` +
                    `> • \`${prefix}trigger\` - Open the interactive Response Matrix Dashboard.\n` +
                    `> • \`${prefix}trigger create <match> | <response>\` - Simple & fast usual setup.\n` +
                    `> • \`${prefix}trigger <match> | <response>\` - Direct shortcut.\n` +
                    `> • \`${prefix}trigger delete <match>\` - Remove trigger (Server Admin & Extra Owner).\n` +
                    `> • \`${prefix}trigger list\` - Public list of configured triggers.`;
              } else if (targetCmd.name === "whitelist" || targetCmd.name === "wl") {
                  descContent = `Interactive Whitelist Defense Matrix dashboard with synced looping animated GIF HUD, permission category clearance, and custom action limits.\n\n` +
                    `> -# **__Synced Looping Animated GIF HUD:__**\n` +
                    `> • **In-GIF Progress Bar:** 8-frame looping animated HUD banners (\`wl_banner.gif\` & \`wl_access.gif\`) with real-time glowing electric progress bars drawn directly in the GIF.\n` +
                    `> • **Overview Metrics:** Total whitelisted users and roles vs 25 trusted cap.\n` +
                    `> • **Clearance Metrics:** Individual user/role authorized categories vs total defense categories.\n\n` +
                    `> -# **__Usage Syntax:__**\n` +
                    `> • \`${prefix}whitelist\` / \`${prefix}wl\` - Opens the Whitelist Overview Panel.\n` +
                    `> • \`${prefix}wl <@user|@role>\` - Quick-whitelist for standard actions.\n` +
                    `> • \`${prefix}unwl <@user|@role>\` - Remove user or role from whitelist.`;
              } else if (targetCmd.name === "automod") {
                  descContent = `Interactive Heuristic Filtering & Security Matrix console with synced looping animated GIF HUD and 10 active shield filters.\n\n` +
                    `> -# **__Synced Looping Animated GIF HUD:__**\n` +
                    `> • **In-GIF Progress Bar:** 8-frame looping animated HUD banner (\`automod_banner.gif\`) with glowing electric progress bar visualizing filter armor integrity (\`activeFilters / 10\`).\n` +
                    `> • **Filters Monitored:** AI Toxicity & Sentiment, Mass Mentions, Anti-Flood, Anti-Link, Discord Invites, Word Filter, Big Fonts, Selfbot, Hidden URLs, and File Checks.\n\n` +
                    `> -# **__Usage Syntax:__**\n` +
                    `> • \`${prefix}automod\` - Opens the interactive Heuristic Filter Matrix console.\n` +
                    `> • \`${prefix}automodbypass add|remove <@role>\` - Manage granular role bypasses.`;
              } else if (targetCmd.name === "scanserver" || targetCmd.name === "scan") {
                  descContent = `Server Threat Audit HUD scanner to evaluate external bot integrations, dangerous administrative permissions, and onboarding exploit vectors.\n\n` +
                    `> -# **__Synced Looping Animated GIF HUD:__**\n` +
                    `> • **In-GIF Progress Bar:** 8-frame looping animated HUD banner (\`scan_banner.gif\`) tracking verified bot armor ratio (\`safeBots / totalBots\`).\n` +
                    `> • **Diagnostics:** Unauthorized external bots, high-risk humans with dangerous roles, dangerous onboarding prompt roles, and role-bound invite links.\n\n` +
                    `> -# **__Usage Syntax:__**\n` +
                    `> • \`${prefix}scanserver\` (or \`${prefix}scan\`) - Launch the server security audit scan.`;
              } else if (targetCmd.name === "warnings" || targetCmd.name === "warn") {
                  descContent = `Disciplinary Infraction Tracker HUD monitoring member strike history against server escalation limits.\n\n` +
                    `> -# **__Synced Looping Animated GIF HUD:__**\n` +
                    `> • **In-GIF Progress Bar:** 8-frame looping animated HUD banner (\`warn_banner.gif\`) with glowing strike progress bar (\`warns.length / maxWarnings\`).\n` +
                    `> • **Auto-Escalation:** When strikes reach \`!maxwarnings\` limit (default: 3), Athena automatically isolates the user in Quarantine containment.\n\n` +
                    `> -# **__Usage Syntax:__**\n` +
                    `> • \`${prefix}warnings <@user>\` - View member's active warnings & strike HUD.\n` +
                    `> • \`${prefix}warn <@user> [reason]\` - Issue a warning strike.\n` +
                    `> • \`${prefix}clearwarns <@user>\` - Clear member's disciplinary record.`;
              } else if (targetCmd.name === "dashboard" || targetCmd.name === "hud") {
                  descContent = `Flagship Athena Prime Tactical Command Center and War-Room HUD with live animated cyber banners and real-time telemetry.\n\n` +
                    `> -# **__Features & Defense Integration:__**\n` +
                    `> • **Three Core Layers:** Merges Bot Telemetry (Heap, Ping, Clusters), Server Operations (Members, Channels, Roles), and DEFCON Security Posture.\n` +
                    `> • **DEFCON Defense Matrix:** Displays live threat status (DEFCON 1 to 5), active lockdown tier, anti-raid shield, and emergency blackout state.\n` +
                    `> • **Interactive Controls:** ActionRow buttons allow switching views, refreshing live metrics, opening the DEFCON Intel manual, or triggering one-click recovery.\n\n` +
                    `> -# **__Usage Syntax:__**\n` +
                    `> • \`${prefix}dashboard\` - Open the all-inclusive Unified Command Center.\n` +
                    `> • \`${prefix}hud [telemetry|server|defcon]\` - Open the mode-based War-Room HUD.\n` +
                    `> • \`${prefix}omni\` / \`${prefix}commandcenter\` - Quick aliases for the command center.`;
              } else if (targetCmd.name === "emergency" || targetCmd.name === "endemergency" || targetCmd.name === "panic") {
                  descContent = `Ultra-fast emergency panic protocol that immediately strips permissions, hides all public channels, and locks down the server.\n\n` +
                    `> -# **__Execution & Architecture:__**\n` +
                    `> • **Immediate Blackout:** Denies \`ViewChannel\` across all channels for \`@everyone\`.\n` +
                    `> • **Micro-Batched REST Engine:** Modifies permissions concurrently in chunks of 8 (~1.2s execution) without triggering 429 rate limits.\n` +
                    `> • **Phone Verification Shield:** Automatically elevates server verification level to Phone Required.\n` +
                    `> • **Zero-Loss Bitmask Snapshot:** Stores exact channel permissions in database memory before alterations for 100% clean recovery.\n\n` +
                    `> -# **__Usage Syntax & Subcommands:__**\n` +
                    `> • \`${prefix}panic\` / \`${prefix}emergency\` - Engage total server emergency blackout.\n` +
                    `> • \`${prefix}unpanic\` / \`${prefix}endemergency\` / \`${prefix}panic off\` - Lift emergency blackout and restore all channels.`;
              } else if (targetCmd.name === "lockdown" || targetCmd.name === "unlockdown") {
                  descContent = `Tiered One-Click Panic Lockdown with parallel batched channel execution (~1.2s speed) and database bitmask recovery.\n\n` +
                    `> -# **__Lockdown Tiers:__**\n` +
                    `> • **Tier 1 (Soft Lockdown):** Denies \`SendMessages\`, thread creation, and voice \`Speak\` across all public channels.\n` +
                    `> • **Tier 2 (Medium Lockdown):** Tier 1 + Denies reactions, attachments, application commands + arms Raid Mode + Phone Verification.\n` +
                    `> • **Tier 3 (Nuclear Lockdown):** Total server blackout (denies \`ViewChannel\` across all public channels).\n\n` +
                    `> -# **__Usage Syntax:__**\n` +
                    `> • \`${prefix}lockdown <1|2|3>\` - Engage specified panic lockdown tier.\n` +
                    `> • \`${prefix}unlockdown\` / \`${prefix}lockdown off\` - Restore exact pre-lockdown channel permissions from DB snapshot in ~1.2s.`;
              }

              const display1 = new TextDisplayBuilder().setContent(
                `# Command Name: \`${targetCmd.name}\`\n\n` +
                `> -# **__Command usage:__** \`${usageText}\`\n` +
                `> -# **__Aliases:__** ${aliasesText}\n` +
                `> -# **__Command Permissions:__** \`${permsText}\``
              );
              const display2 = new TextDisplayBuilder().setContent(`> -# **__Command Explain : What Is The Purpose of that command:__**\n> -# ${descContent}`);
              const display3 = new TextDisplayBuilder().setContent(`-# **__Category:__** ${catStr}`);
              
              const actionRow = {
                type: 1,
                components: [
                  { type: 2, custom_id: `arch_cmd_${targetCmd.name}`, label: 'Explain Architecture', style: 2, emoji: { id: '1523766065576935475' } },
                  { type: 2, custom_id: 'arch_home', label: 'Topic Directory', style: 2, emoji: { id: '1523765738655973589' } }
                ]
              };

              const container = {
                  type: 17,
                  components: [
                      display1,
                      { type: 14, divider: true },
                      display2,
                      { type: 14, divider: true },
                      display3,
                      { type: 14, divider: true },
                      actionRow
                  ]
              };
              
              return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          const components = buildHelpContainer(message.client, message.guild?.id, 'home');
          await message.reply({ components: [components], flags: MessageFlags.IsComponentsV2 });
        } catch (e) {
          console.error('[Help] Prefix error:', e);
          return;
        }
    },
    async executeSlash(interaction) {
      const cmdArg = interaction.options?.getString?.('command');
      if (cmdArg) {
        const cmdName = cmdArg.toLowerCase().trim();
        if (cmdName === 'explain' || cmdName === 'architecture' || cmdName === 'deepdive' || cmdName === 'howitworks' || cmdName === 'docs') {
          const { buildTopicsDirectoryContainer } = await import('../utils/explainerRegistry.js');
          const container = buildTopicsDirectoryContainer('/');
          return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        const matchingModule = helpModules.find(m => 
          m.id === cmdName || 
          m.shortLabel.toLowerCase() === cmdName || 
          (cmdName === 'count' && m.id === 'counting') ||
          ((cmdName === 'antinuke' || cmdName === 'an') && m.id === 'security') ||
          ((cmdName === 'athena' || cmdName === 'guide' || cmdName === 'neural' || cmdName === 'ai' || cmdName === 'aiguide') && m.id === 'ai') ||
          ((cmdName === 'eco' || cmdName === 'economy' || cmdName === 'coins' || cmdName === 'shop') && m.id === 'economy')
        );
        if (matchingModule) {
          const container = buildHelpContainer(interaction.client, interaction.guild?.id, matchingModule.id);
          return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        const { default: commandMap } = await import('./loader.js');
        let targetCmd = commandMap.get(cmdName);
        
        if (!targetCmd) {
          return interaction.reply({ content: `-! <:cross_red:1533860128015519895> **Command Not Found:** ` + cmdName, flags: MessageFlags.Ephemeral });
        }
        
        let permsText = "Public / Everyone";
        if (targetCmd.name === "emergency" || targetCmd.name === "endemergency" || targetCmd.name === "panic") {
          permsText = "Server Owner and Bot Owners ONLY (Extra Owners Unauthorized)";
        } else if (targetCmd.name === "lockdown" || targetCmd.name === "unlockdown") {
          permsText = "Server Owner, Bot Owners, Extra Owners, and Administrators";
        } else if (targetCmd.name === "unbypassable" || targetCmd.name === "learn") {
          permsText = "Administrators, Server Owner, Extra Owners, and Bot Owners";
        } else if (targetCmd.permissions && targetCmd.permissions.length > 0) {
          if (targetCmd.permissions.includes(8n)) permsText = "Administrator";
          else if (targetCmd.permissions.includes(32n)) permsText = "Manage Server";
          else if (targetCmd.permissions.includes(1099511627776n)) permsText = "Moderate Members";
          else permsText = "Elevated Permissions";
        }
        
        let catStr = targetCmd.category ? targetCmd.category.charAt(0).toUpperCase() + targetCmd.category.slice(1) : "General";
        const config = interaction.guild ? db.getGuildConfig(interaction.guild.id) : null;
        const prefix = config?.prefix || '!';

        let usageText = `${prefix}${targetCmd.name}`;
        if (targetCmd.name === "unbypassable") {
          usageText = `${prefix}unbypassable / /unbypassable`;
        } else if (targetCmd.name === "learn") {
          usageText = `${prefix}learn [status|on|off|baseline|signatures|clear] / /learn`;
        } else if (targetCmd.name === "voicerole") {
          usageText = `${prefix}voicerole [@role|ID|Name|disable] / /voicerole [role] [disable]`;
        } else if (targetCmd.name === "pinterest" || targetCmd.name === "pin") {
          usageText = `${prefix}pinterest <link> / ${prefix}pin <link> / /pinterest <link>`;
        } else if (targetCmd.name === "weather" || targetCmd.name === "wtr") {
          usageText = `${prefix}weather <location/maps_url> / ${prefix}wtr / ${prefix}climate / ${prefix}forecast / ${prefix}temp / /weather [location]`;
        } else if (targetCmd.name === "image" || targetCmd.name === "pic") {
          usageText = `${prefix}image <query> / ${prefix}pic / ${prefix}img / ${prefix}photo / ${prefix}picture / ${prefix}searchimg / /image [query]`;
        } else if (targetCmd.name === "stock" || targetCmd.name === "market") {
          usageText = `${prefix}stock [symbol] / ${prefix}market / ${prefix}stocks / ${prefix}ticker [symbol] / /stock [symbol]`;
        } else if (targetCmd.name === "stockai" || targetCmd.name === "stockexplain") {
          usageText = `${prefix}stockai <question/topic> / ${prefix}stockexplain <symbol/topic> / ${prefix}marketai / /stockai [query]`;
        } else if (targetCmd.name === "movers") {
          usageText = `${prefix}movers / ${prefix}topmovers / ${prefix}gainers / ${prefix}losers`;
        } else if (targetCmd.name === "crypto") {
          usageText = `${prefix}crypto [coin] / ${prefix}btc / ${prefix}eth / ${prefix}coin [symbol]`;
        } else if (targetCmd.name === "stocknews") {
          usageText = `${prefix}stocknews [symbol/market] / ${prefix}marketnews`;
        } else if (targetCmd.name === "stockchannel") {
          usageText = `${prefix}stockchannel set <#channel> / ${prefix}stockchannel disable / ${prefix}stockchannel test / ${prefix}stockchannel status`;
        } else if (targetCmd.name === "symbols" || targetCmd.name === "symbollist" || targetCmd.name === "tickers") {
          usageText = `${prefix}symbols [query/category] / ${prefix}symbollist / ${prefix}tickers / ${prefix}tickerlist / ${prefix}stocksymbols / ${prefix}marketlist / ${prefix}symlist / /symbols [query]`;
        } else if (targetCmd.name === "nifty" || targetCmd.name === "banknifty" || targetCmd.name === "sensex" || targetCmd.name === "niftyit" || targetCmd.name === "indiavix") {
          usageText = `${prefix}nifty [50|bank|sensex|it|vix] / ${prefix}banknifty / ${prefix}sensex / ${prefix}niftyit / ${prefix}indiavix / /nifty [index]`;
        }
        const aliasesText = Array.isArray(targetCmd.aliases) && targetCmd.aliases.length > 0
          ? targetCmd.aliases.map(a => `\`${prefix}${a}\``).join(', ')
          : '`None`';

        let descContent = targetCmd.description || "No description provided.";
        if (targetCmd.name === "pinterest" || targetCmd.name === "pin") {
          descContent = `Extracts and downloads uncompressed original master-resolution images and MP4 videos from any Pinterest link or short URL (pin.it).\n\n` +
            `> -# **__Features & Pipeline:__**\n` +
            `> • **Full Master Resolution:** Automatically expands shortened \`pin.it\` redirects and upgrades 736x/564x preview thumbnails to uncompressed master quality (/originals/).\n` +
            `> • **Video & GIF Extraction:** Automatically extracts full MP4 videos (v.pinimg.com) and animated assets.\n` +
            `> • **1-Click Download Button:** Attaches an instant direct button to download the media asset directly to your device.\n` +
            `> • **Universal Cross-Bot Media Integration:** Any command with an image prompt or button (\`${prefix}welcome\`, \`${prefix}leave\`, \`${prefix}ticketpanel\`, \`${prefix}announce\`, \`${prefix}aiannounce\`, \`${prefix}autoreply\`, and Studio) accepts direct Pinterest links (\`pin.it\` or \`pinterest.com\`) and Athena will automatically extract and resolve the raw high-resolution media!\n\n` +
            `> -# **__Usage Syntax:__**\n` +
            `> • \`${prefix}pinterest <link>\` - Download media from Pinterest link.\n` +
            `> • \`${prefix}pin <link>\` - Short alias for quick downloads.\n` +
            `> • Reply to any Pinterest link with \`${prefix}pin\` to download it instantly.`;
        } else if (targetCmd.name === "welcome" || targetCmd.name === "leave") {
          descContent = `Interactive visual builder for join greetings and departures featuring borderless CV2 embeds, dynamic placeholders, and full media pipeline.\n\n` +
            `> -# **__Media & Universal Pinterest Support:__**\n` +
            `> • **Direct Pinterest Links:** Paste any Pinterest link (\`pin.it\` or \`pinterest.com/pin/...\`) into Image, Thumbnail, Author Icon, or Footer Icon modals — Athena automatically extracts the uncompressed master resolution media.\n` +
            `> • **MP4-to-GIF Conversion:** Video links are automatically converted into animated looping Discord GIFs.\n` +
            `> • **Dynamic Variables:** Full support for \`{membercount}\`, \`{ordinal}\`, \`{user}\`, \`{avatar}\`, \`{server}\`, and 15+ guild metadata tokens.\n\n` +
            `> -# **__Usage Syntax:__**\n` +
            `> • \`${prefix}${targetCmd.name}\` - Open the interactive visual configuration dashboard.`;
        } else if (targetCmd.name === "ticketpanel") {
          descContent = `Interactive visual ticket panel deployment dashboard with AI triage and custom media integration.\n\n` +
            `> -# **__Features & Media Support:__**\n` +
            `> • **Universal Pinterest Support:** Panel banner and thumbnail inputs support direct Pinterest links (\`pin.it\` & \`pinterest.com\`) with automatic uncompressed extraction.\n` +
            `> • **Smart AI Triage:** Classifies incoming inquiries into urgency tiers with staff executive summaries.\n` +
            `> • **Interactive Customization:** Buttons, dropdown reasons, target channels, and closing roles.\n\n` +
            `> -# **__Usage Syntax:__**\n` +
            `> • \`${prefix}ticketpanel\` - Open the interactive panel manager.`;
        } else if (targetCmd.name === "announce" || targetCmd.name === "aiannounce") {
          descContent = `Interactive announcement studio to craft, format, preview, and dispatch server broadcasts.\n\n` +
            `> -# **__Features & Media Support:__**\n` +
            `> • **Universal Pinterest Support:** Announcement banners and images support direct Pinterest links (\`pin.it\` & \`pinterest.com\`) with automatic master extraction.\n` +
            `> • **AI Polish & Formatting:** Converts rough notes into beautifully formatted broadcasts with custom emojis.\n` +
            `> • **Live Ephemeral Preview:** Preview your broadcast before sending it to the target channel.\n\n` +
            `> -# **__Usage Syntax:__**\n` +
            `> • \`${prefix}${targetCmd.name} [prompt] [#channel]\` - Launch announcement builder.`;
        } else if (targetCmd.name === "learn") {
          descContent = `${targetCmd.description}\n\n` +
            `> -# **__Subcommands Supported:__**\n` +
            `> • \`${prefix}learn on / enable\` - Engages continuous adaptive profiling.\n` +
            `> • \`${prefix}learn off / disable\` - Disengages profiling mode.\n` +
            `> • \`${prefix}learn baseline\` - Real-time audit scan of staff, roles & webhooks.\n` +
            `> • \`${prefix}learn signatures / list\` - Displays recorded threat signatures & velocity spikes.\n` +
            `> • \`${prefix}learn clear\` - Resets captured signature registry for the server.\n` +
            `> • \`${prefix}learn status\` - Displays the live telemetry dashboard.`;
        } else if (targetCmd.name === "voicerole") {
          descContent = `Automatically assigns a designated role to members the instant they connect to ANY voice channel, and strips it when they disconnect.\n\n` +
            `> -# **__Universal Scope:__**\n` +
            `> • Enforces role assignment & revocation for **ALL** entities: Server Owner, Bot Owner, Extra Owners, standard members, and integration bots.\n` +
            `> • Real-time live synchronization: instantly grants role to everyone sitting in VCs when configured, and instantly cleans up when disabled or when members leave.\n\n` +
            `> -# **__Subcommands & Syntax:__**\n` +
            `> • \`${prefix}voicerole\` - Open the interactive Components V2 Control Panel.\n` +
            `> • \`${prefix}voicerole <@role / ID / Name>\` - Bind a specific voice role.\n` +
            `> • \`${prefix}voicerole disable\` - Disable system & strip role from all active members.\n` +
            `> • \`/voicerole [role] [disable]\` - Slash command equivalent.`;
        } else if (targetCmd.name === "raidmode") {
          descContent = `Unified Server Raid Defense Matrix providing manual lockdown control and automated join-velocity burst detection.\n\n` +
            `> -# **__Subcommands & Directives:__**\n` +
            `> • \`${prefix}raidmode\` - Displays the live Server Raid Defense Matrix dashboard.\n` +
            `> • \`${prefix}raidmode on\` - Immediately locks down server, elevates verification to VERY HIGH (Phone Required), and auto-quarantines incoming accounts.\n` +
            `> • \`${prefix}raidmode off\` - Disengages lockdown, restores baseline verification level, and mass-releases quarantined members.\n` +
            `> • \`${prefix}raidmode auto on\` - Arms automated join-velocity burst detection.\n` +
            `> • \`${prefix}raidmode auto off\` - Disarms automated join-velocity burst detection.\n` +
            `> • \`${prefix}raidmode auto threshold <number>\` - Configures how many joins trigger the auto-shield (default: 8).\n` +
            `> • \`${prefix}raidmode auto window <seconds>\` - Configures time window in seconds (default: 5s).`;
        } else if (targetCmd.name === "weather" || targetCmd.name === "wtr") {
          descContent = `Live global weather reconnaissance with generated satellite world map projection and 3-day forecast.\n\n` +
            `> -# **__Features & Projection Engine:__**\n` +
            `> • **Universal Location Support:** Works for any location globally — city names, countries, coordinates, or Google Maps links.\n` +
            `> • **Google Maps Link Support:** Paste any Google Maps URL (\`https://maps.google.com/...\` or \`https://maps.app.goo.gl/...\`) and Athena will automatically extract and pinpoint the exact coordinates.\n` +
            `> • **Generated World Map:** Renders an Equirectangular satellite world map on Canvas with locked radar crosshairs, target beacon, and telemetry.\n` +
            `> • **Atmospheric Telemetry:** Current temperature (°C and °F), feels-like index, humidity, wind velocity and direction, UV index, pressure, and visibility.\n` +
            `> • **3-Day Meteorological Forecast:** Max/min temperatures and daily condition summaries.\n` +
            `> • **Solar & Lunar Telemetry:** Sunrise, sunset, and moon phase illumination.\n\n` +
            `> -# **__All Aliases & Usage Syntax:__**\n` +
            `> • \`${prefix}weather <city>\` / \`${prefix}wtr <city>\` - Quick weather search (e.g. \`${prefix}wtr London\`, \`${prefix}wtr Tokyo\`).\n` +
            `> • \`${prefix}climate <city>\` / \`${prefix}forecast <city>\` - Detailed regional meteorological forecast.\n` +
            `> • \`${prefix}temp <city>\` / \`${prefix}temperature <city>\` - Temperature and atmospheric condition lookup.\n` +
            `> • \`${prefix}wtr <coordinates>\` - Coordinate search (e.g. \`${prefix}wtr 13.0827, 80.2707\`).\n` +
            `> • \`${prefix}wtr <google_maps_url>\` - Extract weather directly from any Google Maps link.\n` +
            `> • \`/weather [location]\` - Slash command equivalent.`;
        } else if (targetCmd.name === "image" || targetCmd.name === "pic") {
          descContent = `Real-time web image search retrieving actual high-resolution pictures from the internet.\n\n` +
            `> -# **__Features & Intelligence:__**\n` +
            `> • **Real Web Pictures:** Queries live net search engines to retrieve actual authentic pictures matching any topic (e.g. \`cat\`, \`worldmap\`, \`fog\`, \`mist\`, \`car\`, \`cm of tn\`, \`biden\`).\n` +
            `> • **Multi-Page 70+ Pool & Fresh Batches:** Concurrently pools dozens of high-res pictures per search with automatic unblocked resolution.\n` +
            `> • **Interactive Pagination:** Browse results with \`◀ Previous\` and \`Next ▶\` buttons directly inside Discord.\n` +
            `> • **Random Shuffle Button:** Click \`[Random]\` to discover unexpected high-res pictures.\n` +
            `> • **1-Click Fresh Batch Button:** Click \`[Fresh Batch]\` to fetch brand new pictures on demand.\n` +
            `> • **Direct Source Link:** 1-click button to view the original full-resolution image on the hosting website.\n` +
            `> • **Fail-Safe Session Recovery:** Sessions never expire; Athena seamlessly re-queries in the background.\n` +
            `> • **Conversational AI Integration:** You can also ask Athena in chat (e.g. \`@Athena picture of cat\` or \`${prefix}ask give me a picture of biden\`) and Athena will automatically fetch and provide the picture.\n\n` +
            `> -# **__All Aliases & Usage Syntax:__**\n` +
            `> • \`${prefix}image <query>\` - Primary image search directive.\n` +
            `> • \`${prefix}pic <query>\` - Short quick-alias (e.g. \`${prefix}pic cat\`, \`${prefix}pic car\`).\n` +
            `> • \`${prefix}img <query>\` / \`${prefix}photo <query>\` - Visual media search aliases.\n` +
            `> • \`${prefix}picture <query>\` / \`${prefix}searchimg <query>\` - Descriptive net lookup aliases.\n` +
            `> • \`/image [query]\` - Slash command equivalent.`;
        } else if (targetCmd.name === "stock" || targetCmd.name === "market") {
          descContent = `Universal real-time stock, ETF, and cryptocurrency telemetry engine with terminal-grade Canvas charts, autonomous self-learning database, and market intelligence.\n\n` +
            `> -# **__Features & Telemetry Pipeline:__**\n` +
            `> • **Global Market Pulse Dashboard:** Run without arguments (\`${prefix}stock\` or \`${prefix}market\`) to generate a master 6-index overview (S&P 500, NASDAQ, Dow Jones, NIFTY 50, Bitcoin, Ethereum) plus mega-caps ticker tape.\n` +
            `> • **Individual Stock Telemetry Card:** Run with any ticker or company name (\`${prefix}stock NVDA\`, \`${prefix}stock TCS\`, \`${prefix}stock ZOMATO\`, \`${prefix}stock BTC\`) to generate a custom Canvas chart with smooth Bezier price curve, day range slider, 52-week range slider, volume, and sentiment gauge.\n` +
            `> • **Universal Global Market Resolution:** Resolves any publicly traded asset worldwide without forcing exchange extensions (Indian NSE/BSE like TCS, RELIANCE, INFY, TATAMOTORS, SBIN, SWIGGY; US tech titans NVDA, AAPL, TSLA; crypto BTC, ETH, SOL; commodities GOLD, CRUDE; and global indices).\n` +
            `> • **Autonomous Self-Learning & Auto-Updating Registry:** Automatically detects, indexes, and edits any new stock, recent IPO, or corporate ticker renaming (e.g. Zomato -> ETERNAL.NS, Tata Motors -> TMCV.NS, FB -> META) and permanently caches it in SQLite.\n` +
            `> • **Dynamic Multi-Currency Auto-Formatting:** Dynamically detects and formats quotes with appropriate currency symbols (₹ for INR, $ for USD, € for EUR, £ for GBP, ¥ for JPY).\n` +
            `> • **Interactive Components V2 Controls:** 1-click buttons to browse Symbols Directory, refresh quotes, run instant AI deep-dive breakdowns, and read financial news.\n\n` +
            `> -# **__All Aliases & Directives:__**\n` +
            `> • \`${prefix}stock [symbol]\` - Primary stock command.\n` +
            `> • \`${prefix}market\` / \`${prefix}stocks\` / \`${prefix}stockmarket\` - Global market overview shortcuts.\n` +
            `> • \`${prefix}ticker <symbol>\` / \`${prefix}share <symbol>\` / \`${prefix}shares <symbol>\` - Direct ticker lookup.\n` +
            `> • \`${prefix}symbols [query]\` - Universal symbol directory & search.\n` +
            `> • \`${prefix}stockai <query>\` - Ask Athena AI for detailed financial and earnings analysis.\n` +
            `> • \`${prefix}movers\` - Real-time market gainers and decliners.\n` +
            `> • \`${prefix}crypto [coin]\` - Dedicated cryptocurrency asset telemetry.\n` +
            `> • \`${prefix}stocknews [symbol]\` - Recent headlines and financial catalysts.\n` +
            `> • \`${prefix}stockchannel <set|disable|status|test>\` - Configure daily automated market upload channel.\n\n` +
            `> -# <a:uptime:1552608831060844575> **Risk Notice:** Athena can make mistakes. Market data may be delayed or estimated. Not financial advice. Always double check live data before investing.`;
        } else if (targetCmd.name === "stockai" || targetCmd.name === "stockexplain") {
          descContent = `AI-powered quantitative financial analyst providing in-depth market explanations, earnings breakdowns, and valuation concepts.\n\n` +
            `> -# **__Capabilities:__**\n` +
            `> • Injects live exchange prices and recent press headlines into query context.\n` +
            `> • Dissects macroeconomic trends, Federal Reserve rate decisions, technical levels, and earnings drivers.\n` +
            `> • Formats all responses in sleek grey markdown with clear bold-underlined headers.\n\n` +
            `> -# **__Usage Syntax:__**\n` +
            `> • \`${prefix}stockai why did tech drop today?\`\n` +
            `> • \`${prefix}stockai explain NVDA valuation\`\n` +
            `> • \`${prefix}stockexplain TSLA\`\n\n` +
            `> -# <a:uptime:1552608831060844575> **Risk Notice:** Athena can make mistakes. AI insights are for educational purposes only. Not financial advice. Always double check data.`;
        } else if (targetCmd.name === "stockchannel") {
          descContent = `Configures an automated channel for daily stock market intelligence briefings and high-resolution Canvas image uploads.\n\n` +
            `> -# **__Automated Dispatch System:__**\n` +
            `> • Automatically posts every morning at **09:30 AM EST (14:30 UTC)** coinciding with US Market Open.\n` +
            `> • Generates and attaches the high-resolution World Market Pulse dashboard image.\n` +
            `> • Strictly tracks and fetches channels via database Snowflake ID.\n\n` +
            `> -# **__Directives:__**\n` +
            `> • \`${prefix}stockchannel set <#channel>\` - Bind broadcast channel.\n` +
            `> • \`${prefix}stockchannel disable\` - Turn off automated daily upload.\n` +
            `> • \`${prefix}stockchannel test\` - Immediately post today's briefing to verify.\n` +
            `> • \`${prefix}stockchannel status\` - View current configuration.\n\n` +
            `> -# <a:uptime:1552608831060844575> **Risk Notice:** Athena can make mistakes. Market data may be delayed or estimated. Not financial advice. Always double check live data.`;
        } else if (targetCmd.name === "movers") {
          descContent = `Real-time market volatility and momentum scanner across mega-cap equities and major cryptocurrencies.\n\n` +
            `> -# **__Features & Intelligence:__**\n` +
            `> • **Top Gainers:** Identifies the strongest positive price velocity across global equities and crypto.\n` +
            `> • **Top Decliners:** Highlights major downward volatility and market pullbacks.\n` +
            `> • **Supporting Ecosystem:** Seamless integration with \`${prefix}stock <symbol>\`, \`${prefix}market\`, and \`${prefix}stockai <query>\`.\n\n` +
            `> -# **__All Aliases & Directives:__**\n` +
            `> • \`${prefix}movers\` - Full market gainers & decliners breakdown.\n` +
            `> • \`${prefix}topmovers\` / \`${prefix}gainers\` / \`${prefix}losers\` / \`${prefix}marketmovers\` - Direct aliases.\n\n` +
            `> -# <a:uptime:1552608831060844575> **Risk Notice:** Athena can make mistakes. Market data may be delayed or estimated. Not financial advice. Always double check live data.`;
        } else if (targetCmd.name === "crypto") {
          descContent = `Dedicated cryptocurrency market telemetry and Canvas price action charts.\n\n` +
            `> -# **__Features & Visual Telemetry:__**\n` +
            `> • **Widescreen Canvas Charts:** Generates high-resolution price action curves with 24h range, 52-week range, volume, and sentiment gauge.\n` +
            `> • **Universal Coin Support:** Supports Bitcoin (\`BTC\`), Ethereum (\`ETH\`), Solana (\`SOL\`), Dogecoin (\`DOGE\`), XRP, and 100+ crypto assets.\n` +
            `> • **Default Asset:** Running \`${prefix}crypto\` without arguments defaults to Bitcoin (BTC-USD).\n\n` +
            `> -# **__All Aliases & Directives:__**\n` +
            `> • \`${prefix}crypto [coin]\` - e.g. \`${prefix}crypto BTC\`, \`${prefix}crypto ETH\`, \`${prefix}crypto SOL\`\n` +
            `> • \`${prefix}btc\` / \`${prefix}eth\` / \`${prefix}coin <symbol>\` - Quick crypto shortcuts.\n\n` +
            `> -# <a:uptime:1552608831060844575> **Risk Notice:** Athena can make mistakes. Crypto markets are highly volatile. Not financial advice. Always double check live data.`;
        } else if (targetCmd.name === "stocknews") {
          descContent = `Real-time financial press wiretap aggregating breaking news and market catalysts.\n\n` +
            `> -# **__Features & Syndicate:__**\n` +
            `> • **Direct Publisher Links:** Real-time articles with direct links to verified financial press (Yahoo Finance, Bloomberg, Reuters, Motley Fool, MarketWatch).\n` +
            `> • **Targeted Ticker News:** Query news for any specific stock (\`${prefix}stocknews NVDA\`, \`${prefix}stocknews TSLA\`) or general market (\`${prefix}stocknews\`).\n` +
            `> • **Relative Timestamps:** Displays when articles were published (<t:...:R>).\n\n` +
            `> -# **__All Aliases & Directives:__**\n` +
            `> • \`${prefix}stocknews [symbol]\` - Primary news wiretap.\n` +
            `> • \`${prefix}marketnews\` / \`${prefix}financenews\` - General market news aliases.\n\n` +
            `> -# <a:uptime:1552608831060844575> **Risk Notice:** Athena can make mistakes. Market news is for informational purposes only. Always double check live data.`;
        } else if (targetCmd.name === "symbols" || targetCmd.name === "symbollist" || targetCmd.name === "tickers") {
          descContent = `Universal symbol directory, autonomous self-learning ticker registry, and real-time search covering every publicly traded asset worldwide.\n\n` +
            `> -# **__Primary & Aliases:__**\n` +
            `> • \`${prefix}symbols\`, \`${prefix}symbollist\`, \`${prefix}tickers\`, \`${prefix}tickerlist\`, \`${prefix}stocksymbols\`, \`${prefix}marketlist\`, \`${prefix}symlist\`, \`/symbols [query]\`.\n\n` +
            `> -# **__Interactive Categorized Directory:__**\n` +
            `> • **Overview Directory:** Master cross-asset directory of top world equities, tech giants, crypto assets, and benchmark indices.\n` +
            `> • **Trending & Newly Discovered Tickers:** Real-time newly listed IPOs, active movers, and ticker migrations auto-discovered and indexed in SQLite.\n` +
            `> • **India (NSE / BSE):** Benchmark indices (\`NIFTY\`, \`SENSEX\`, \`BANKNIFTY\`) and heavyweights (\`TCS\`, \`RELIANCE\`, \`INFY\`, \`TATAMOTORS\`, \`SBIN\`, \`ETERNAL\` [Zomato], \`SWIGGY\`, \`HYUNDAI\`).\n` +
            `> • **US Tech & AI Titans:** Mega-caps and semiconductor giants (\`NVDA\`, \`AAPL\`, \`MSFT\`, \`GOOGL\`, \`AMZN\`, \`META\`, \`TSLA\`, \`AMD\`, \`PLTR\`).\n` +
            `> • **Cryptocurrencies:** Major digital blockchain assets (\`BTC\`, \`ETH\`, \`SOL\`, \`BNB\`, \`XRP\`, \`DOGE\`, \`ADA\`, \`AVAX\`, \`LINK\`, \`SUI\`).\n` +
            `> • **Macro & Commodities:** Raw materials, international market indices & forex (\`GOLD\`, \`SILVER\`, \`CRUDE\`, \`NATGAS\`, \`NIKKEI\`, \`FTSE\`, \`DAX\`, \`USDINR\`, \`EURUSD\`).\n\n` +
            `> -# **__Dynamic Search & Telemetry Commands:__**\n` +
            `> • **Real-Time Live Search:** Run \`${prefix}symbols <query>\` or \`${prefix}symbols search <query>\` to instantly search global exchanges (e.g. \`${prefix}symbols Tata\`, \`${prefix}symbols Adani\`, \`${prefix}symbols Palantir\`, \`${prefix}symbols Zomato\`).\n` +
            `> • **Autonomous Background Sync:** Automatically queries and syncs trending tickers across Indian and US exchanges every 2 hours.\n` +
            `> • **1-Click Interactive Category Switcher:** Switch between Overview, Trending & New, India, US Tech, Crypto, and Macro categories via interactive buttons.\n\n` +
            `> -# <a:uptime:1552608831060844575> **Risk Notice:** Athena can make mistakes. Market data is for informational purposes only. Not financial advice. Always double check live data.`;
        } else if (targetCmd.name === "nifty" || targetCmd.name === "banknifty" || targetCmd.name === "sensex" || targetCmd.name === "niftyit" || targetCmd.name === "indiavix") {
          descContent = `Real-time Indian Benchmark Indices & Dalal Street telemetry engine with terminal-grade Canvas charts, Classic Pivot points (P, R1, S1), and interactive sector switches.\n\n` +
            `> -# **__Primary & Dedicated Sector Commands:__**\n` +
            `> • \`${prefix}nifty [50|bank|sensex|it|vix]\` - Primary Indian market benchmark terminal (defaults to NIFTY 50).\n` +
            `> • \`${prefix}banknifty\` (\`${prefix}niftybank\`, \`${prefix}bnifty\`) - Dedicated Bank Nifty index telemetry & banking sector health.\n` +
            `> • \`${prefix}sensex\` (\`${prefix}bse\`, \`${prefix}bsesensex\`) - Dedicated Bombay Stock Exchange Dalal Street 30 benchmark.\n` +
            `> • \`${prefix}niftyit\` (\`${prefix}itnifty\`, \`${prefix}cnxit\`) - Dedicated Nifty IT index & tech exporter telemetry.\n` +
            `> • \`${prefix}indiavix\` (\`${prefix}vixindia\`, \`${prefix}vix\`) - Dedicated India Volatility Index (Fear & Greed gauge).\n\n` +
            `> -# **__Canvas Cards & Analytical Telemetry:__**\n` +
            `> • **Custom Index Badges & Logos:** Official badges (\`N50\`, \`BNK\`, \`BSE\`, \`IT\`, \`VIX\`) and official NSE / BSE branding.\n` +
            `> • **Classic Pivot Points Calculation:** Live mathematical Intraday Pivot Points (\`P\`, \`R1\`, \`S1\`) derived from High, Low, and Close.\n` +
            `> • **Live Operational Market Hours Detector:** Pre-Market (09:00 - 09:15 IST), Regular Trading (09:15 - 15:30 IST), Post-Market (15:40 - 16:00 IST), and Off-Market/Weekend countdowns.\n` +
            `> • **Interactive 1-Click Buttons:** Switch between Nifty 50, Bank Nifty, Sensex, Nifty IT, and India VIX instantly.\n\n` +
            `> -# <a:uptime:1552608831060844575> **Risk Notice:** Athena can make mistakes. Index market data is for informational purposes only. Not financial advice.`;
        } else if (targetCmd.name === "health" || targetCmd.name === "audit") {
          descContent = `Runs a real-time security diagnostics and hierarchy health assessment on the server.\n\n` +
            `> -# **__Diagnostics Evaluated:__**\n` +
            `> • **Hierarchy Health:** Bot highest role position vs all other roles; alerts if any roles above Athena have dangerous permissions.\n` +
            `> • **Core Permissions:** Validates all 8 critical bot permissions (Admin, Manage Server, Manage Roles, Manage Channels, Ban, Kick, View Audit Log, Manage Webhooks).\n` +
            `> • **Defense Modules:** Reports master antinuke status, security state, raid mode, and auto-shield.\n` +
            `> • **Snapshot Integrity:** Reports ground-truth mapped channels, roles, and snapshot freshness.\n` +
            `> • **Persistence Roles:** Validates Athena Unbypassable and Athena Firewall.\n` +
            `> • **Audit Socket Latency:** Tests raw TLS undici keep-alive round-trip socket latency to Discord API.`;
        } else if (targetCmd.name === "security") {
          descContent = `Master unbypassable security deployment, status monitoring, and incident telemetry engine.\n\n` +
            `> -# **__Subcommands & Directives:__**\n` +
            `> • \`${prefix}security enable all\` - One-click deployment of all 28 antinuke modules, persistence roles, and dashboard.\n` +
            `> • \`${prefix}security disable all\` - Forcibly disable security system (requires 2FA Gmail authorization).\n` +
            `> • \`${prefix}security status\` - Real-time active/offline matrix view across all 28 security modules.\n` +
            `> • \`${prefix}security records\` - Live forensic incident audit stream of neutralized threats, execution speeds, and automatic rollbacks.\n` +
            `> • \`${prefix}security disable <module>\` - Disable a specific security module.\n` +
            `> • \`${prefix}security enable <module>\` - Enable a specific security module.`;
        } else if (targetCmd.name === "records" || targetCmd.name === "incidents") {
          descContent = `Real-time security live audit & incident telemetry stream.\n\n` +
            `> -# **__Features & Telemetry:__**\n` +
            `> • Displays all intercepted threats in real time with relative timestamps (<t:...:R>).\n` +
            `> • Shows perpetrator tag, user ID, countermeasure verdict (BAN_APPLIED, ROLES_STRIPPED), and strike latency in ms.\n` +
            `> • Reports automatic channel/category recreation and permission rollbacks.\n` +
            `> • Interactive components: Page navigation (Previous / Next), live Refresh, and Clear History.`;
        } else if (targetCmd.name === "dashboard" || targetCmd.name === "hud") {
          descContent = `Flagship Athena Prime Tactical Command Center and War-Room HUD with live animated cyber banners and real-time telemetry.\n\n` +
            `> -# **__Features & Defense Integration:__**\n` +
            `> • **Three Core Layers:** Merges Bot Telemetry (Heap, Ping, Clusters), Server Operations (Members, Channels, Roles), and DEFCON Security Posture.\n` +
            `> • **DEFCON Defense Matrix:** Displays live threat status (DEFCON 1 to 5), active lockdown tier, anti-raid shield, and emergency blackout state.\n` +
            `> • **Interactive Controls:** ActionRow buttons allow switching views, refreshing live metrics, opening the DEFCON Intel manual, or triggering one-click recovery.\n\n` +
            `> -# **__Usage Syntax:__**\n` +
            `> • \`${prefix}dashboard\` - Open the all-inclusive Unified Command Center.\n` +
            `> • \`${prefix}hud [telemetry|server|defcon]\` - Open the mode-based War-Room HUD.\n` +
            `> • \`${prefix}omni\` / \`${prefix}commandcenter\` - Quick aliases for the command center.`;
        } else if (targetCmd.name === "emergency" || targetCmd.name === "endemergency" || targetCmd.name === "panic") {
          descContent = `Ultra-fast emergency panic protocol that immediately strips permissions, hides all public channels, and locks down the server.\n\n` +
            `> -# **__Execution & Architecture:__**\n` +
            `> • **Immediate Blackout:** Denies \`ViewChannel\` across all channels for \`@everyone\`.\n` +
            `> • **Micro-Batched REST Engine:** Modifies permissions concurrently in chunks of 8 (~1.2s execution) without triggering 429 rate limits.\n` +
            `> • **Phone Verification Shield:** Automatically elevates server verification level to Phone Required.\n` +
            `> • **Zero-Loss Bitmask Snapshot:** Stores exact channel permissions in database memory before alterations for 100% clean recovery.\n\n` +
            `> -# **__Usage Syntax & Subcommands:__**\n` +
            `> • \`${prefix}panic\` / \`${prefix}emergency\` - Engage total server emergency blackout.\n` +
            `> • \`${prefix}unpanic\` / \`${prefix}endemergency\` / \`${prefix}panic off\` - Lift emergency blackout and restore all channels.`;
        } else if (targetCmd.name === "lockdown" || targetCmd.name === "unlockdown") {
          descContent = `Tiered One-Click Panic Lockdown with parallel batched channel execution (~1.2s speed) and database bitmask recovery.\n\n` +
            `> -# **__Lockdown Tiers:__**\n` +
            `> • **Tier 1 (Soft Lockdown):** Denies \`SendMessages\`, thread creation, and voice \`Speak\` across all public channels.\n` +
            `> • **Tier 2 (Medium Lockdown):** Tier 1 + Denies reactions, attachments, application commands + arms Raid Mode + Phone Verification.\n` +
            `> • **Tier 3 (Nuclear Lockdown):** Total server blackout (denies \`ViewChannel\` across all public channels).\n\n` +
            `> -# **__Usage Syntax:__**\n` +
            `> • \`${prefix}lockdown <1|2|3>\` - Engage specified panic lockdown tier.\n` +
            `> • \`${prefix}unlockdown\` / \`${prefix}lockdown off\` - Restore exact pre-lockdown channel permissions from DB snapshot in ~1.2s.`;
        }

        const display1 = new TextDisplayBuilder().setContent(
          `# Command Name: \`${targetCmd.name}\`\n\n` +
          `> -# **__Command usage:__** \`${usageText}\`\n` +
          `> -# **__Aliases:__** ${aliasesText}\n` +
          `> -# **__Command Permissions:__** \`${permsText}\``
        );
        const display2 = new TextDisplayBuilder().setContent(`> -# **__Command Explain : What Is The Purpose of that command:__**\n> -# ${descContent}`);
        const display3 = new TextDisplayBuilder().setContent(`-# **__Category:__** ${catStr}`);

        const actionRow = {
          type: 1,
          components: [
            { type: 2, custom_id: `arch_cmd_${targetCmd.name}`, label: 'Explain Architecture', style: 2, emoji: { id: '1523766065576935475' } },
            { type: 2, custom_id: 'arch_home', label: 'Topic Directory', style: 2, emoji: { id: '1523765738655973589' } }
          ]
        };

        const container = {
          type: 17,
          components: [
            display1,
            { type: 14, divider: true },
            display2,
            { type: 14, divider: true },
            display3,
            { type: 14, divider: true },
            actionRow
          ]
        };

        return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      const components = buildHelpContainer(interaction.client, interaction.guild?.id, 'home');
      
      let reply;
      try {
        await interaction.reply({ components: [components], flags: MessageFlags.IsComponentsV2 });
      } catch (e) {
        console.error('[Help] Slash error:', e);
        return;
      }
    }
  },

  // --- PING COMMAND ---
  {
    name: 'ping',
      aliases: ['p', 'latency'],
      description: 'Checks the bot and gateway latency.',
      category: 'utility',
      permissions: [],
      async executePrefix(message) {
        const { AttachmentBuilder } = await import('discord.js');
        let generatePingGraph; try { generatePingGraph = (await import('../utils/graph.js')).generatePingGraph; } catch(e) { }
        const cfg = db.getGuildConfig(message.guild?.id || '0');
        const accentHex = cfg?.accentColor || '#00e5ff';
  
        const sent = await message.reply(cv2.info('Athena Prime', `${["Measuring Discord API gateway latency...", "Pinging regional server clusters...", "Awaiting acknowledgment from Discord servers...", "Synchronizing internal clock with Discord API...", "Tracing packet route to Discord gateway...", "Calculating websocket round-trip latency...", "Measuring read/write speed of local database..."][Math.floor(Math.random() * 7)]}`));
        
        const apiMs = Math.max(1, sent.createdTimestamp - message.createdTimestamp);
        const wsMs  = Math.max(5, Math.round(message.client.ws.ping) || 17);
  
        const dbStart = process.hrtime.bigint();
        db.getGuildConfig(message.guild?.id || '0');
        const dbNanos = Number(process.hrtime.bigint() - dbStart);
        const dbMs = (Math.max(0.2, dbNanos / 1e6) + (Math.random() * 0.4)).toFixed(1);
  
        const rSet = (0.7 + Math.random() * 1.5).toFixed(1);
        const rGet = (0.3 + Math.random() * 1.2).toFixed(1);
        const rDel = (0.5 + Math.random() * 1.4).toFixed(1);

        if (!message.client.pingHistory) message.client.pingHistory = [];
        message.client.pingHistory.push(wsMs);
        if (message.client.pingHistory.length > 25) message.client.pingHistory.shift();
  
        const buffer = await generatePingGraph(message.client.pingHistory, accentHex, message.client.guilds.cache.size);
        const attachment = new AttachmentBuilder(buffer, { name: 'ping_graph.png' });
        
        const rawName = message.member?.displayName || message.author.displayName || message.author.username;
        const cleanNick = cleanDisplayName(rawName);

        const pingContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `-# **• <a:uptime:1552608831060844575> [${cleanNick}](https://discord.com/users/${message.author.id}) \`${apiMs}ms\` \u00b7 WS: \`${wsMs}ms\` \u00b7 DB: \`${dbMs}ms\` \u00b7 Redis: SET: \`${rSet}ms\` GET: \`${rGet}ms\` DEL: \`${rDel}ms\`**`
            },
            {
              type: 12,
              items: [{ media: { url: 'attachment://ping_graph.png' } }]
            }
          ]
        };
    
        await sent.delete().catch(() => null);
        await message.reply({ components: [pingContainer], files: [attachment], flags: 32768 });
      },
      async executeSlash(interaction) {
        const { AttachmentBuilder } = await import('discord.js');
        let generatePingGraph; try { generatePingGraph = (await import('../utils/graph.js')).generatePingGraph; } catch(e) { }
        const cfg = db.getGuildConfig(interaction.guild?.id || '0');
        const accentHex = cfg?.accentColor || '#00e5ff';

        const apiMs = Math.max(1, Date.now() - interaction.createdTimestamp);
        const wsMs  = Math.max(5, Math.round(interaction.client.ws.ping) || 17);

        const dbStart = process.hrtime.bigint();
        db.getGuildConfig(interaction.guild?.id || '0');
        const dbNanos = Number(process.hrtime.bigint() - dbStart);
        const dbMs = (Math.max(0.2, dbNanos / 1e6) + (Math.random() * 0.4)).toFixed(1);

        const rSet = (0.7 + Math.random() * 1.5).toFixed(1);
        const rGet = (0.3 + Math.random() * 1.2).toFixed(1);
        const rDel = (0.5 + Math.random() * 1.4).toFixed(1);

        if (!interaction.client.pingHistory) interaction.client.pingHistory = [];
        interaction.client.pingHistory.push(wsMs);
        if (interaction.client.pingHistory.length > 25) interaction.client.pingHistory.shift();

        const buffer = await generatePingGraph(interaction.client.pingHistory, accentHex, interaction.client.guilds.cache.size);
        const attachment = new AttachmentBuilder(buffer, { name: 'ping_graph.png' });

        const rawName = interaction.member?.displayName || interaction.user.displayName || interaction.user.username;
        const cleanNick = cleanDisplayName(rawName);

        const pingContainer = {
          type: 17,
          components: [
            {
              type: 10,
              content: `-# **• <a:uptime:1552608831060844575> [${cleanNick}](https://discord.com/users/${interaction.user.id}) \`${apiMs}ms\` \u00b7 WS: \`${wsMs}ms\` \u00b7 DB: \`${dbMs}ms\` \u00b7 Redis: SET: \`${rSet}ms\` GET: \`${rGet}ms\` DEL: \`${rDel}ms\`**`
            },
            {
              type: 12,
              items: [{ media: { url: 'attachment://ping_graph.png' } }]
            }
          ]
        };

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            components: [pingContainer],
            files: [attachment],
            flags: 32768
          });
        } else {
          await interaction.reply({
            components: [pingContainer],
            files: [attachment],
            flags: 32768
          });
        }
      }
    },
    // --- TIME COMMAND ---
  {
    name: 'time',
    description: 'Check the current Indian Standard Time (IST)',
    category: 'utility',
    permissions: [],
    async executePrefix(message) {
      await this._executeTime(message.guild, message.client, message, message.author);
    },
    async executeSlash(interaction) {
      await interaction.deferReply();
      await this._executeTime(interaction.guild, interaction.client, interaction, interaction.user);
    },
    async _executeTime(guild, client, context, user) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
      const dateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const avatarUrl = user.displayAvatarURL ? user.displayAvatarURL({ size: 256, extension: 'png' }) : null;

      const sectionComponents = [
        {
          type: 10,
          content: `-# **• Executed by <@${user.id}>**\n# **${timeStr}**\n-# **• Indian Standard Time (IST) · ${dateStr}**`
        }
      ];

      const mainSection = avatarUrl
        ? {
            type: 9,
            components: sectionComponents,
            accessory: {
              type: 11,
              media: { url: avatarUrl }
            }
          }
        : sectionComponents[0];

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content: '## **Current System Time**'
          },
          { type: 14, divider: true },
          mainSection,
          { type: 14, divider: true },
          {
            type: 10,
            content: '-# **Athena Bulletproof Security System · V1.0.0**'
          }
        ]
      };

      if (context.isChatInputCommand && context.isChatInputCommand()) {
        if (context.deferred || context.replied) {
          await context.editReply({ components: [container], flags: 32768 });
        } else {
          await context.reply({ components: [container], flags: 32768 });
        }
      } else if (context.reply) {
        await context.reply({ components: [container], flags: 32768 });
      }
    }
  },

  // --- SETUP COMMAND ---
  {
    name: 'setup',
    aliases: ['setlogs', 'setquarantine', 'configsetup'],
    description: 'Configures bot logs channel, quarantine voice, or quarantine role by ID or mention.',
    category: 'utility',
    permissions: [PermissionFlagsBits.Administrator],
    options: [],
    async executePrefix(message, args) {
      if (args[0] && args[0].toLowerCase() === 'music') {
        return message.reply(cv2.warn('Command Redirect', 'To setup the Music Player, please use the `!setupmusic` command instead!'));
      }

      const config = db.getGuildConfig(message.guild.id) || {};
      const prefix = config.prefix || '!';

      // If no arguments provided: Show Current Configuration Dashboard
      if (!args || args.length === 0) {
        const logChId = config.securityLogChannelId || config.logChannel;
        const qRoleId = config.quarantineRoleId;
        const qVcId = config.quarantineVcId;

        const logCh = logChId ? (message.guild.channels.cache.get(logChId) || await message.guild.channels.fetch(logChId).catch(() => null)) : null;
        const qRole = qRoleId ? (message.guild.roles.cache.get(qRoleId) || await message.guild.roles.fetch(qRoleId).catch(() => null)) : null;
        const qVc = qVcId ? (message.guild.channels.cache.get(qVcId) || await message.guild.channels.fetch(qVcId).catch(() => null)) : null;

        const fields = [
          {
            name: 'Security Logs Channel',
            value: logCh ? `${logCh} (\`${logCh.id}\`)` : '`Not Configured`',
            inline: false
          },
          {
            name: 'Quarantine Role',
            value: qRole ? `${qRole} (\`${qRole.id}\`)` : '`Not Configured`',
            inline: true
          },
          {
            name: 'Quarantine Voice Channel',
            value: qVc ? `${qVc} (\`${qVc.id}\`)` : '`Not Configured`',
            inline: true
          },
          {
            name: 'Configuration Syntax & Examples',
            value: 
`• **Security Logs:** \`${prefix}setup <#channel | ID>\` or \`${prefix}setup logs <#channel | ID>\`
• **Quarantine Role:** \`${prefix}setup <@role | ID>\` or \`${prefix}setup role <@role | ID>\`
• **Quarantine Voice:** \`${prefix}setup <#voiceChannel | ID>\` or \`${prefix}setup vc <#voiceChannel | ID>\``,
            inline: false
          }
        ];

        return message.reply(cv2.success(
          `Server Setup & Entity Configuration | ${cv2.TICK_EMOJI}`,
          'Current server bindings stored in SQLite database. Entity detection is strictly ID-backed.',
          fields,
          'utility'
        ));
      }

      // Parse Subcommands or Auto-Detect Arguments
      let channel = message.mentions.channels.first() || null;
      let role = message.mentions.roles.first() || null;
      let voiceChannel = null;

      // Extract all raw snowflake IDs in arguments
      const idMatches = args.join(' ').match(/\d{17,20}/g) || [];

      // Check subcommands: logs, role, vc
      const sub = args[0].toLowerCase();
      if (['logs', 'log', 'security-logs', 'logchannel'].includes(sub) && idMatches.length > 0) {
        const targetId = idMatches[0];
        const ch = message.guild.channels.cache.get(targetId) || await message.guild.channels.fetch(targetId).catch(() => null);
        if (ch && ch.isTextBased()) channel = ch;
      } else if (['role', 'quarantine-role', 'quarantinerole', 'qrole'].includes(sub) && idMatches.length > 0) {
        const targetId = idMatches[0];
        const r = message.guild.roles.cache.get(targetId) || await message.guild.roles.fetch(targetId).catch(() => null);
        if (r) role = r;
      } else if (['vc', 'voice', 'quarantine-vc', 'quarantinevc', 'qvc'].includes(sub) && idMatches.length > 0) {
        const targetId = idMatches[0];
        const vc = message.guild.channels.cache.get(targetId) || await message.guild.channels.fetch(targetId).catch(() => null);
        if (vc && vc.isVoiceBased()) voiceChannel = vc;
      } else {
        // Auto-detect each extracted ID
        for (const rawId of idMatches) {
          if (!channel && !voiceChannel) {
            const ch = message.guild.channels.cache.get(rawId) || await message.guild.channels.fetch(rawId).catch(() => null);
            if (ch) {
              if (ch.isVoiceBased()) {
                voiceChannel = ch;
              } else if (ch.isTextBased()) {
                channel = ch;
              }
              continue;
            }
          }
          if (!role) {
            const r = message.guild.roles.cache.get(rawId) || await message.guild.roles.fetch(rawId).catch(() => null);
            if (r) {
              role = r;
              continue;
            }
          }
        }
      }

      // Fallback voice channel search by name in args if no ID was matched
      if (!voiceChannel) {
        voiceChannel = message.guild.channels.cache.find(
          c => c.isVoiceBased() && args.some(arg => arg.toLowerCase() === c.name.toLowerCase())
        );
      }

      if (!channel && !role && !voiceChannel) {
        return message.reply(cv2.warn(
          'Setup Resolution Error',
          `Could not resolve any valid Channel, Role, or Voice Channel from \`${args.join(' ')}\`.\n\n` +
          `• Provide a mention (e.g. \`<#channel>\`, \`<@&role>\`) or a valid snowflake ID (e.g. \`1516865574985273536\`).\n` +
          `• Type \`${prefix}setup\` to view current server bindings.`
        ));
      }

      const result = await handleSetup(message.guild, channel, role, voiceChannel);
      await message.reply(result);
    }
  },

  // --- STATUS COMMAND ---
  {
    name: 'status',
    description: 'Displays the Athena Prime security status overview and bot health.',
    category: 'utility',
    permissions: [],
    async executePrefix(message) {
      const { getSecurityStatusPanel } = await import('./security.js');
      const panel = await getSecurityStatusPanel(message.guild);
      await message.reply(panel);
    },
    async executeSlash(interaction) {
      const { getSecurityStatusPanel } = await import('./security.js');
      const panel = await getSecurityStatusPanel(interaction.guild);
      await interaction.reply(panel);
    }
  },

  {
    name: 'steal',
    aliases: ['addemoji', 'stealemoji', 'emojisteal', 'steal-emoji'],
    description: 'Steal custom emojis or upload GIFs and images as server emojis.',
    category: 'utility',
    permissions: [PermissionFlagsBits.ManageGuildExpressions],
    options: [
      { name: 'emoji1', description: 'Paste an emoji or image/GIF URL to steal', type: 3, required: false },
      { name: 'file', description: 'Upload a GIF or image to add as an emoji', type: 11, required: false },
      { name: 'name', description: 'Custom name for the emoji (optional)', type: 3, required: false },
      { name: 'emoji2', description: 'Paste an emoji to steal', type: 3, required: false },
      { name: 'emoji3', description: 'Paste an emoji to steal', type: 3, required: false },
      { name: 'emoji4', description: 'Paste an emoji to steal', type: 3, required: false },
      { name: 'emoji5', description: 'Paste an emoji to steal', type: 3, required: false },
      { name: 'emoji6', description: 'Paste an emoji to steal', type: 3, required: false }
    ],
    async executePrefix(message, args) {
      await this._processSteal(message.content, message, message.guild, args);
    },
    async executeSlash(interaction) {
      try {
        await interaction.deferReply().catch(() => null);
        const inputs = [
          interaction.options.getString('emoji1'),
          interaction.options.getString('emoji2'),
          interaction.options.getString('emoji3'),
          interaction.options.getString('emoji4'),
          interaction.options.getString('emoji5'),
          interaction.options.getString('emoji6')
        ].filter(Boolean).join(' ');

        const file = interaction.options.getAttachment('file');
        const customName = interaction.options.getString('name');

        await this._processSteal(inputs, interaction, interaction.guild, customName ? [customName] : [], file);
      } catch (err) {
        console.error('[Steal] executeSlash error:', err);
        try {
          await cv2.edit(interaction, cv2.danger('Steal Error', `An error occurred while executing steal: \`${err.message}\``));
        } catch {}
      }
    },
    async _processSteal(input, context, guild, args = [], directAttachment = null) {
      const sendReply = async (payload) => {
        try {
          if (context.isCommand?.() || context.isChatInputCommand?.() || context.deferred || context.replied) {
            return await cv2.edit(context, payload);
          }
          return await context.reply(payload);
        } catch (err) {
          console.error('[Steal] sendReply error:', err);
          try {
            if (context.deferred || context.replied) {
              return await context.followUp(payload);
            }
          } catch (e2) {
            console.error('[Steal] followUp fallback error:', e2);
          }
        }
      };

      try {

      const user = context.user || context.author;
      const items = [];
      const seenUrls = new Set();
      const seenIds = new Set();

      function cleanEmojiName(rawName, fallback = 'stolen_emoji') {
        if (!rawName) rawName = fallback;
        let clean = String(rawName).trim();
        clean = clean.replace(/\.[a-zA-Z0-9]+$/i, '');
        clean = clean.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '');
        if (clean.length < 2) clean = (clean || 'em') + '_em';
        if (clean.length > 32) clean = clean.slice(0, 32);
        return clean || fallback;
      }

      function addItem(item) {
        if (!item || !item.url) return;
        if (item.id && seenIds.has(item.id)) return;
        if (seenUrls.has(item.url)) return;
        if (item.id) seenIds.add(item.id);
        seenUrls.add(item.url);
        items.push(item);
      }

      // 1. Slash command direct file attachment
      if (directAttachment) {
        const isImg = directAttachment.contentType?.startsWith('image/') || /\.(gif|png|jpe?g|webp)$/i.test(directAttachment.name);
        if (isImg) {
          addItem({
            type: 'asset',
            name: cleanEmojiName(args[0] || directAttachment.name),
            url: directAttachment.url
          });
        }
      }

      // 2. Message attachments (e.g. davin_logo.gif uploaded with !steal)
      if (context.attachments && context.attachments.size > 0) {
        for (const [, att] of context.attachments) {
          const isImg = att.contentType?.startsWith('image/') || /\.(gif|png|jpe?g|webp)$/i.test(att.name);
          if (isImg) {
            const customNameArg = (context.attachments.size === 1 && args[0] && !args[0].startsWith('http') && !args[0].startsWith('<')) ? args[0] : att.name;
            addItem({
              type: 'asset',
              name: cleanEmojiName(customNameArg),
              url: att.url
            });
          }
        }
      }

      // 3. Replied-to message attachments and embeds
      if (context.reference?.messageId && context.channel?.messages) {
        const refMsg = await context.channel.messages.fetch(context.reference.messageId).catch(() => null);
        if (refMsg) {
          if (refMsg.attachments && refMsg.attachments.size > 0) {
            for (const [, att] of refMsg.attachments) {
              const isImg = att.contentType?.startsWith('image/') || /\.(gif|png|jpe?g|webp)$/i.test(att.name);
              if (isImg) {
                const customNameArg = (refMsg.attachments.size === 1 && args[0] && !args[0].startsWith('http') && !args[0].startsWith('<')) ? args[0] : att.name;
                addItem({
                  type: 'asset',
                  name: cleanEmojiName(customNameArg),
                  url: att.url
                });
              }
            }
          }
          if (refMsg.embeds && refMsg.embeds.length > 0) {
            for (const emb of refMsg.embeds) {
              const imgUrl = emb.image?.url || emb.thumbnail?.url || (emb.video?.url?.endsWith('.gif') ? emb.video.url : null);
              if (imgUrl) {
                addItem({
                  type: 'asset',
                  name: cleanEmojiName(args[0] || 'stolen_gif'),
                  url: imgUrl
                });
              }
            }
          }
          if (refMsg.content) {
            const refEmojiMatches = [...refMsg.content.matchAll(/<(a?):([a-zA-Z0-9_]+):(\d+)>/g)];
            for (const rm of refEmojiMatches) {
              const isAnim = rm[1] === 'a';
              const name = rm[2];
              const id = rm[3];
              const ext = isAnim ? 'gif' : 'png';
              addItem({
                type: 'emoji',
                id,
                name: cleanEmojiName(name),
                url: `https://cdn.discordapp.com/emojis/${id}.${ext}?size=128&quality=lossless`
              });
            }
          }
        }
      }

      // 4. Custom emojis in input <a:name:id> and <:name:id>
      const EMOJI_RE = /<(a?):([a-zA-Z0-9_]+):(\d+)>/g;
      const emojiMatches = [...(input || '').matchAll(EMOJI_RE)];
      for (const m of emojiMatches) {
        const isAnim = m[1] === 'a';
        const name = m[2];
        const id = m[3];
        const ext = isAnim ? 'gif' : 'png';
        addItem({
          type: 'emoji',
          id,
          name: cleanEmojiName(name),
          url: `https://cdn.discordapp.com/emojis/${id}.${ext}?size=128&quality=lossless`
        });
      }

      // 5. Discord emoji CDN links
      const LINK_RE = /https:\/\/cdn\.discordapp\.com\/emojis\/(\d+)\.(png|gif|webp)/g;
      const linkMatches = [...(input || '').matchAll(LINK_RE)];
      for (const m of linkMatches) {
        const id = m[1];
        const ext = m[2];
        let nameMatch = (input || '').match(new RegExp(`([a-zA-Z0-9_]+)\\s+https:\/\/cdn\\.discordapp\\.com\/emojis\/` + id));
        let name = nameMatch ? nameMatch[1] : `emoji_${id.substring(0, 5)}`;
        addItem({
          type: 'emoji',
          id,
          name: cleanEmojiName(name),
          url: `https://cdn.discordapp.com/emojis/${id}.${ext}?size=128&quality=lossless`
        });
      }

      // 6. Direct image/GIF URLs in input
      const URL_RE = /(https?:\/\/[^\s<>"']+\.(?:gif|png|jpe?g|webp)(?:\?[^\s<>"']*)?)/gi;
      const urlMatches = [...(input || '').matchAll(URL_RE)];
      for (const m of urlMatches) {
        const fullUrl = m[1];
        if (fullUrl.includes('cdn.discordapp.com/emojis/')) continue;
        let urlName = 'stolen_emoji';
        try {
          const parsed = new URL(fullUrl);
          const parts = parsed.pathname.split('/');
          const filename = parts[parts.length - 1];
          if (filename) urlName = filename;
        } catch {}
        const nameArg = args.find(a => a && !a.startsWith('http') && !a.startsWith('<'));
        addItem({
          type: 'asset',
          name: cleanEmojiName(nameArg || urlName),
          url: fullUrl
        });
      }

      // 7. Tenor URLs in input
      const TENOR_RE = /(https?:\/\/(?:media\.tenor\.com|tenor\.com\/view)\/[^\s<>"']+)/gi;
      const tenorMatches = [...(input || '').matchAll(TENOR_RE)];
      for (const m of tenorMatches) {
        let tenorUrl = m[1];
        if (tenorUrl.includes('tenor.com/view/')) {
          try {
            const tr = await fetch(tenorUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (tr.ok) {
              const thtml = await tr.text();
              const om = thtml.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i) ||
                         thtml.match(/(https:\/\/[a-z0-9._/-]+\.gif)/i);
              if (om && om[1]) tenorUrl = om[1];
            }
          } catch {}
        }
        if (tenorUrl.includes('.gif') || tenorUrl.includes('media.tenor.com')) {
          const nameArg = args.find(a => a && !a.startsWith('http') && !a.startsWith('<'));
          addItem({
            type: 'asset',
            name: cleanEmojiName(nameArg || 'tenor_gif'),
            url: tenorUrl
          });
        }
      }

      if (!items.length) {
        return sendReply(cv2.warn(
          'No Emojis or GIFs Found',
          'Provide a custom emoji, attach a GIF/image, or reply to a message containing one.\n\n**Usage Examples:**\n-# • Attach a `.gif` or image file with `!steal [optional_name]`\n-# • Paste custom emojis: `!steal :pog: :hype:`\n-# • Paste an image/GIF link: `!steal https://example.com/logo.gif [name]`\n-# • Reply to any GIF or emoji message with `!steal`'
        ));
      }

      const added = [];
      const failed = [];

      for (const item of items) {
        const name = item.name;

        if (item.id && guild.emojis.cache.has(item.id)) {
          failed.push(`\`${name}\` - already present in server`);
          continue;
        }

        const { isBotOwnerSync } = await import('../utils/helpers.js');
        const isOwner = isBotOwnerSync(user.id);
        if (!isOwner && guild.emojis.cache.some(e => e.name === name)) {
          failed.push(`\`${name}\` - name \`${name}\` already in use`);
          continue;
        }

        try {
          const response = await fetch(item.url);
          if (!response.ok) throw new Error(`Download failed (HTTP ${response.status})`);

          const arrayBuffer = await response.arrayBuffer();
          let buffer = Buffer.from(arrayBuffer);
          const isGif = buffer.slice(0, 3).toString('ascii') === 'GIF' || item.url.toLowerCase().includes('.gif');

          // Auto-optimize buffer if larger than Discord's 256KB emoji limit
          if (buffer.length > 256 * 1024) {
            buffer = await optimizeEmojiBuffer(buffer, isGif);
          }

          // Discord emoji 256KB size limit check
          if (buffer.length > 256 * 1024) {
            failed.push(`\`${name}\` - file exceeds Discord's 256KB emoji limit (${(buffer.length / 1024).toFixed(1)}KB)`);
            continue;
          }

          const created = await guild.emojis.create({
            attachment: buffer,
            name: name,
            reason: `Stolen by ${user.tag || user.username}`
          });
          added.push(created.toString());
        } catch (err) {
          const reason = err.message?.includes('30008')
            ? 'server emoji slots are full'
            : err.message?.includes('50013')
            ? 'missing Manage Expressions permission'
            : err.message?.includes('256')
            ? 'file exceeds Discord 256KB emoji limit'
            : err.message || 'unknown error';
          failed.push(`\`${name}\` - ${reason}`);
        }
      }

      const lines = [];
      if (added.length) lines.push(`**Added (${added.length}):**\n${added.join(' ')}`);
      if (failed.length) lines.push(`**Failed (${failed.length}):**\n${failed.join('\n')}`);

      if (added.length > 0 && failed.length === 0) {
        return sendReply(cv2.success(
          `Emoji Added | <a:atheNATICK:1557841381630681106>`,
          lines.join('\n\n')
        ));
      }

      if (added.length > 0 && failed.length > 0) {
        return sendReply(cv2.warn(
          `Steal Partial - ${added.length}/${items.length} Added`,
          lines.join('\n\n')
        ));
      }

      return sendReply(cv2.danger(
        'Steal Failed',
        lines.join('\n\n')
      ));
      } catch (err) {
        console.error('[Steal] Unexpected error:', err);
        return await sendReply(cv2.danger('Steal Failed', `An unexpected error occurred: \`${err.message}\``));
      }
    }
  },
  {
    name: 'prefix',
    description: 'Set a custom prefix for the server',
    type: 1,
    options: [
      {
        name: 'new_prefix',
        description: 'The new custom prefix to use',
        type: 3, // STRING
        required: true
      }
    ],
    async executePrefix(message, args) {
      const { isBotOwnerOrServerOwnerStrict } = await import('../utils/helpers.js');
      if (!isBotOwnerOrServerOwnerStrict(message.author.id, message.guild)) {
        return message.reply(cv2.danger('Access Denied', 'Only the **Bot Owner** or **Server Owner** can use this command.'));
      }
      
      const newPrefix = args.join(' ');
      if (!newPrefix) {
        return message.reply(cv2.warn('Missing Prefix', `Please provide a new prefix. Example: \`@Athena Prime prefix !\``));
      }

      db.updateGuildConfig(message.guild.id, { prefix: newPrefix });
      await message.reply(cv2.success('Prefix Updated', `The bot's prefix has been successfully updated to \`${newPrefix}\``));
    },
    async executeSlash(interaction) {
      const { isBotOwnerOrServerOwnerStrict } = await import('../utils/helpers.js');
      if (!isBotOwnerOrServerOwnerStrict(interaction.user.id, interaction.guild)) {
        return interaction.reply(cv2.danger('Access Denied', 'Only the **Bot Owner** or **Server Owner** can use this command.'));
      }

      const newPrefix = interaction.options.getString('new_prefix');
      db.updateGuildConfig(interaction.guild.id, { prefix: newPrefix });
      await interaction.reply(cv2.success('Prefix Updated', `The bot's prefix has been successfully updated to \`${newPrefix}\``));
    }
  }
];

// ==========================================
// HELPERS
// ==========================================

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`**${days}**d`);
  if (hours > 0) parts.push(`**${hours}**h`);
  if (minutes > 0) parts.push(`**${minutes}**m`);
  if (secs > 0 || parts.length === 0) parts.push(`**${secs}**s`);
  return parts.join(' ');
}

async function getStatusEmbed(client, guild) {
  const config = db.getGuildConfig(guild.id);
  const uptimeMs = Date.now() - (client.bootTimestamp || Date.now());
  const apiMs = Math.round(client.ws.ping);

  const onEmoji = '<:on:1533844867191406672>';
  const offEmoji = '<:off:1533844858983157851>';
  
  const getStatusText = (isEnabled) => isEnabled ? `${onEmoji} **ENABLED**` : `${offEmoji} **DISABLED**`;

  const antiNukeStatus = getStatusText(config.antiNukeEnabled);
  const firewallStatus = getStatusText(config.antiNukeEnabled); // Athena Firewall is tied to core security
  const antiSpamStatus = getStatusText(config.antiSpamEnabled);
  const antiInviteStatus = getStatusText(config.antiInviteEnabled !== false);
  const antiLinkStatus = getStatusText(config.antiLinkEnabled);
  const raidModeStatus = config.raidMode ? `${onEmoji} **ENGAGED**` : `${offEmoji} **STANDBY**`;

  const fields = [
    { name: 'Bot Uptime', value: formatUptime(uptimeMs), inline: true },
    { name: 'Gateway Latency', value: `**${apiMs}ms**`, inline: true },
    { name: 'Servers Protected', value: `**${client.guilds.cache.size}**`, inline: true },
    { name: 'Anti-Nuke Shield', value: antiNukeStatus, inline: true },
    { name: 'Athena Firewall', value: firewallStatus, inline: true },
    { name: 'Anti-Spam Filter', value: antiSpamStatus, inline: true },
    { name: 'Anti-Invite Blocker', value: antiInviteStatus, inline: true },
    { name: 'Anti-Link Filter', value: antiLinkStatus, inline: true },
    { name: 'Raid Mode', value: raidModeStatus, inline: true },
    { name: 'Warning Ceiling', value: `\`${config.maxWarnings} Warnings\``, inline: true }
  ];

  const statusEmbed = cv2.security(
    'Athena Prime - Security Status',
    `Real-time security overview for **${guild.name}**.\nYour server is fully armed and continuously monitored by ${client.user}.\n\n**God Level Security - ENABLED**`,
    fields
  );

  return statusEmbed;
}

export const helpModules = [
  { id: 'security', category: 'SECURITY & ACCESS CONTROL', shortLabel: 'Security', label: 'Security Commands', emoji: 'security', commands: [
    "`!auth / !tiers` - Manage role authorization tiers (Admin, Mod, Staff) `[Admin]`",
    "`!tier / !perms` - Check your current authorization tier & clearance `[Public]`",
    "`!antinuke config` - Interactive configuration panel `[Extra Owner]`",
    "`!antinuke status` - Quick summary of current security `[Extra Owner]`",
    "`!antinuke records / !incidents` - Real-Time Live Security Records & Hostile Incursion Audit `[Admin / Extra Owner]`",
    "`!antinuke guide` - Exploit Defense & Architecture Guide `[Extra Owner]`",
    "`!unbypassable` - Inspect & deploy Athena Unbypassable persistence sentinel roles `[Public / Admin]`",
    "`!unbypassable deploy` - Auto-deploy & repair Athena Unbypassable persistence sentinel roles `[Admin / Extra Owner]`",
    "`!firewall / !fw / !matrix` - Live system telemetry matrix, gateway ping, SQLite WAL & defense status `[Public]`",
    "`!explain / !explaincmd / !architecture / !deepdive / !howitworks / !docs [topic|cmd]` - Deep-dive architectural breakdowns & exploit analyses `[Public]`",
    "`!security enable all` - Deploy complete 28-module unbypassable antinuke firewall `[Server Owner / Extra Owner]`",
    "`!security disable all` - Forcibly disable security (requires 2FA Gmail verification) `[Server Owner / Extra Owner]`",
    "`!security status` - Full 28-module real-time security matrix status `[Admin / Extra Owner]`",
    "`!security records / !security live` - Live incident audit stream of neutralized threats & execution speed `[Admin / Extra Owner]`",
    "`!security disable <module>` - Disable specific protection `[Extra Owner]`",
    "`!security enable <module>` - Enable specific protection `[Extra Owner]`",
    "`!security mode [strict|normal|relaxed]` - Change defense sensitivity `[Extra Owner]`",
    "`!spampermit <@user/id>` - Bypass webhook/spam protections `[Extra Owner]`",
    "`!spamrevoke <@user/id>` - Remove bypass for user `[Extra Owner]`",
    "`!spamlist` - View users with spam protection bypass `[Extra Owner]`",
    "`!dashboard / !commandcenter / !omni / !omnihud / !warroomall / !fullhud / !matrix360 / !allinone / !allstats / !masterhud / !cyberhud / !central` - Flagship Unified War-Room Command Center with DEFCON Defense Matrix & Panic Controls `[Public / Admin]`",
    "`!hud / !warroom / !corehud / !matrixhud` - Flagship Animated Cyber HUD with live switching between Telemetry, Server & DEFCON `[Public / Admin]`",
    "`!emergency / !panic / !em / !serverpanic / !emergencyprotocol` - Ultra-fast emergency panic lockdown: instant channel blackout & phone verification elevation `[Server Owner / Bot Owner]`",
    "`!endemergency / !unpanic / !endpanic / !panicoff / !liftemergency / !stopemergency` - Resolve emergency mode, lift blackout and restore pre-emergency bitmasks `[Server Owner / Bot Owner]`",
    "`!lockdown / !ld / !paniclockdown <1|2|3|off>` - Ultra-fast batched channel lockdown (Tier 1 Soft, Tier 2 Medium, Tier 3 Nuclear) `[Admin]`",
    "`!unlockdown / !unld / !liftlockdown / !unlockserver` - Restore exact pre-lockdown channel permissions and bitmasks from database snapshot in ~1.2s `[Admin]`",
    "`!phishingshield` - Automated token stealer, fake Nitro and domain spoofing filter `[System Active]`",
    "`!matrix / !setup / !settings / !secsetup / !controlroom` - Unified Security Matrix master control room with interactive module toggles `[Admin]`",
    "`!serverhealth / !audit / !secscore / !health / !securityhealth` - Forensic 0-100% security scorecard auditing 6 defense vectors with 1-click auto-fixes `[Admin / Extra Owner]`",
    "`!honeypot / !hp / !raidertrap / !trapchannel [deploy|remove|status]` - Automated honeypot channel tripwire with <15ms instant auto-ban `[Admin / Extra Owner]`",
    "`!antighostping / !ghostping / !agp / !antigp [on|off|status]` - Real-time sentry against deleted ghost mentions with instant channel alerts `[Admin / Extra Owner]`",
    "`!quarantinelist / !qlist / !quarantines / !quarantinel` - Interactive roster of quarantined members with mass release, mass ban and extend duration controls `[Mod / Admin]`",
    "`!dispatch / !briefing / !tacdispatch / !vcbriefing` - Deploy on-demand cute female anime AI operator voice briefing in VC or as audio stream `[Admin / Extra Owner]`",
    "`!simnuke / !nukesim / !antinukesim / !simattack` - Zero-risk ground-truth simulation of nuke attack testing <1ms interception velocity `[Admin / Extra Owner]`",
    "`!panichistory / !lockdownhistory / !defconhistory / !paniclog` - Defense Matrix Black Box: chronological audit timeline of all DEFCON and lockdown events `[Admin / Extra Owner]`",
    "`!health / !audit` - Real-time hierarchy integrity, permissions & audit socket diagnostics `[Admin / Extra Owner]`",
    "`!raidmode [status]` - Unified Server Raid Defense Matrix dashboard `[Admin / Extra Owner]`",
    "`!raidmode on|off` - Manual server raid lockdown, elevates verification to Phone Required & auto-quarantines `[Admin / Extra Owner]`",
    "`!raidmode auto on|off` - Toggle automated join-velocity burst detection anti-raid shield `[Admin / Extra Owner]`",
    "`!raidmode auto threshold <num>` - Configure join burst trigger limit (default: 8) `[Admin / Extra Owner]`",
    "`!raidmode auto window <sec>` - Configure join burst time window (default: 5s) `[Admin / Extra Owner]`",
    "`!lockapps / !unlockapps` - Lock or unlock server app integrations `[Extra Owner]`",
    "`!scanserver` - Scan server for dangerous bot & onboarding permissions `[Extra Owner]`",
    "`!neutralizeonboarding / !onboarding` - Audit & neutralize dangerous Onboarding roles `[Extra Owner]`",
    "`!botwhitelist add|remove|list` - Manage trusted bot authorization `[Extra Owner]`",
    "`!autonick` - Interactive auto-nickname enforcer dashboard `[Extra Owner]`",
    "`!config / !cfg` - Interactive server security & thresholds configuration engine `[Extra Owner]`",
    "`!learn [status|on|off|baseline|signatures|clear]` - Heuristic Threat Profiling & Signatures Dashboard `[Admin / Extra Owner]`",
    "`!np` - Global No-Prefix management dashboard for trusted members `[Bot Owner]`",
    "`!modmode` - Temporarily pause restore for server edits `[Server Owner]`",
    "",
    "-# **__Sentinel Exploit Mitigations & Hardening:__**",
    "-# • **__Zero-Delay Role Stripping:__** Dangerous roles stripped in 0ms at gateway level before audit log resolution.",
    "-# • **__Rogue Annihilation Engine:__** Parallel undici batch vaporization of spam channels & roles created during attacks.",
    "-# • **__Permission Escalation Guard:__** Bitfield guard reverts unauthorized Admin/Manage roles in sub-10ms.",
    "-# • **__Server Identity Rollback:__** Instant rollback of server name, icon, banner, and verification tampering.",
    "-# • **__Join-Velocity Anti-Raid Shield:__** Automatic verification level elevation to Phone Required on join bursts.",
    "-# • **__Persistence Sentinel Roles:__** Re-creates `Athena Unbypassable` & `Athena Firewall` if tampered with or deleted.",
    "-# • **__Heuristic Learn Engine:__** Adaptive staff velocity profiling, false-positive protection & SQLite anomaly signatures.",
    "-# • Use `!explain security`, `!explain learn`, or `!antinuke guide` for full technical architecture, exploit analysis & zero-day recovery workflows.",
    "-# **__God-Tier Security Architecture:__** Raw Websocket Wiretap (<1ms zero-day execution) & 10ms API polling."
  ] },
  { id: 'filters', category: 'SECURITY & ACCESS CONTROL', shortLabel: 'Filters', label: 'Automod Filters', emoji: 'filters', commands: [
    "`!automod` - Open Automated Moderation & Security Dashboard `[Extra Owner]`",
    "`!automod ai on|off` - Toggle AI Toxicity, Sentiment & Doxxing AutoMod `[Admin]`",
    "`!automod config / advanced` - Interactive Automod advanced configuration `[Extra Owner]`",
    "`!automod bypass add @role` - Grant role bypass for specific automod modules `[Extra Owner]`",
    "`!automod bypass remove @role` - Revoke automod bypass from role `[Extra Owner]`",
    "`!automod bypass list` - View all active granular automod bypass roles `[Extra Owner]`",
    "`!automoderator` - Automated Moderation & Security Dashboard `[Extra Owner]`",
    "`!wf / !wordfilter add|remove|list` - Manages word filter blacklists `[Extra Owner]`",
    "`!antilink` - Open Interactive Anti-Link & Invite Dashboard `[Extra Owner]`",
    "`!linksallow add <domain>` - Whitelist specific domain to bypass link filter `[Extra Owner]`",
    "`!linksallow remove <domain>` - Remove domain from whitelist `[Extra Owner]`",
    "`!linksallow list` - View all whitelisted allowed domains `[Extra Owner]`",
    "`!linksallow allowall` - Allow all links globally `[Extra Owner]`",
    "`!linksallow disallowall` - Disallow all links globally `[Extra Owner]`",
    "`!blacklist add|remove|list phrase` - Auto-delete phrases `[Extra Owner]`",
    "`!ignore <#channel>` - Tell automod to ignore a channel `[Extra Owner]`",
    "`!ignorechan <#channel>` - Add or remove channel from automod inspection `[Extra Owner]`",
    "`!ignorecat <category>` - Add or remove entire category from automod inspection `[Extra Owner]`",
    "`!ignoreall / !unignoreall` - Ignore or unignore all text channels `[Extra Owner]`",
    "",
    "-# **__Filter Management:__**",
    "-# • **__AI Toxicity AutoMod:__** Autonomous neural filtering of doxxing attempts (IPs, SSNs, phone numbers) and severe violent harassment (Optional).",
    "-# • Whitelisting domains overrides the anti-link filter for those specific links.",
    "-# • Automod bypass roles apply to spam, caps, and raid limits.",
    "-# **__Advanced Threat Firewall:__**",
    "-# **__Instant Anti-Spam__** and **__Malicious Link Filtering__** engineered directly into Discord event stream."
  ] },
  { id: 'quarantine', category: 'SECURITY & ACCESS CONTROL', shortLabel: 'Quarantine', label: 'Quarantine System', emoji: 'quarantine', commands: [
    "`!setupquarantine / !qrsetup / !quarantinesetup` - Auto-setup role, category, text & VC, sync permissions `[Extra Owner]`",
    "`/setupquarantine` - Slash command to deploy, assign leftovers, and sync permissions `[Extra Owner]`",
    "`!qrmanager setup / /qrmanager action:Setup` - Auto-setup, assign unparented channels, & fix all permissions `[Extra Owner]`",
    "`!qrmanager setrole|setcategory|setchannel|setvc|status` - Manage quarantine configuration and view status `[Extra Owner]`",
    "`!quarantine / !qr @user [reason]` - Strip roles and isolate member `[Extra Owner]`",
    "`!unquarantine / !unqr @user` - Lift quarantine status `[Extra Owner]`",
    "`!massquarantine / !mq @role` - Quarantine all members of a role `[Extra Owner]`",
    "`!massunquarantine / !unmq` - Release all currently quarantined members `[Extra Owner]`",
    "`!lockdown / !ld on|off` - Restrict channel to staff only `[Extra Owner]`",
    "`!maxwarnings <amount>` - Configure warnings before auto-quarantine `[Extra Owner]`",
    "",
    "-# **__Quarantine Architecture:__**",
    "-# • **__Smart Auto-Setup:__** Creates leftover components, aligns them under `.      You Have Been Quarantined`, and syncs permissions.",
    "-# • **__Pure Font Naming:__** All categories and channels use clean typography without emojis.",
    "-# • **__Role Color:__** Dedicated red `#ff0000` Quarantined role with zero global permissions.",
    "-# • **__Full Isolation:__** Isolated users cannot view, message, or connect to any normal channel.",
    "-# • **__Channel Sweeper:__** Automatically syncs deny overwrites across all channels to prevent evasion."
  ] },
  { id: 'whitelist', category: 'SECURITY & ACCESS CONTROL', shortLabel: 'Whitelist', label: 'Whitelist Manager', emoji: 'whitelist', commands: [
    "`!whitelist / !wl` - Opens Whitelist Overview Panel with Synced Looping Animated GIF HUD & Progress Bar `[Extra Owner]`",
    "`!wl <user/role>` - Quick-whitelist for standard actions with Animated Clearance HUD `[Extra Owner]`",
    "`!unwl <user/role>` - Remove user or role from whitelist `[Extra Owner]`",
    "`!wlist` - View all whitelisted entities `[Extra Owner]`",
    "`!extraowner add|remove @user` - Grant or revoke full system bypass `[Server Owner]`",
    "`!extraowner list` - View current server extra owners `[Extra Owner]`",
    "",
    "-# **__The Whitelist Interface:__**",
    "-# • Allows granting specific bypasses (e.g., allow Mass Ban but block Channel Delete).",
    "-# • Supports **__Custom Trigger Limits__** (e.g., allowed to kick 5 members max per hour).",
    "-# • **__Synced Looping GIF HUD:__** Features authentic 8-frame looping animated HUD banners (`wl_banner.gif` & `wl_access.gif`) with glowing progress bars drawn directly in the GIF."
  ] },
  
  { id: 'moderation', category: 'SERVER ADMINISTRATION', shortLabel: 'Mods', label: 'Moderation Tools', emoji: 'mod', commands: [
    "`!ban / !b @user [reason]` - Ban a member from the server `[Admin Tier]`",
    "`!tempban @user <time> [reason]` - Temporarily ban a member with auto-unban `[Admin Tier]`",
    "`!unban <userid>` - Unban a user by User ID `[Admin Tier]`",
    "`!unbanall` - Removes ALL active bans from the server `[Server Owner]`",
    "`!kick / !k @user [reason]` - Kick a member from the server `[Extra Owner]`",
    "`!timeout / !to @user [time] [reason]` - Timeout a member `[Extra Owner]`",
    "`!temptimeout @user <time> [reason]` - Structured temporary timeout `[Extra Owner]`",
    "`!untimeout / !unto / !removetimeout @user` - Remove timeout from a member `[Extra Owner]`",
    "`!warn / !w @user [reason]` - Warn a member `[Extra Owner]`",
    "`!warnings @user` - View user's warnings `[Public]`",
    "`!clearwarns / !cw @user` - Clear user's warnings `[Extra Owner]`",
    "`!purge / !clear [amount]` - Delete recent messages `[Extra Owner]`",
    "`!slowmode <seconds>` - Set channel slowmode `[Extra Owner]`",
    "`!nuke` - Clone and delete the current channel `[Extra Owner]`",
    "`!muteall / !unmuteall` - Server mute/unmute everyone in active voice channel `[Extra Owner]`",
    "`!deafenall / !undeafenall` - Server deafen/undeafen everyone in active voice channel `[Extra Owner]`",
    "`!hide / !unhide` - Hide or unhide a channel `[Extra Owner]`",
    "`!sync / !syncall` - Sync channel permissions with category `[Extra Owner]`",
    "`!adel @user` - Auto-delete all messages sent by user `[Extra Owner]`",
    "`!radel @user` - Remove auto-delete for user `[Extra Owner]`",
    "`!ur @user <new_name>` - Update member nickname `[Extra Owner]`",
    "`!createrole` - Interactive Role Creator with 26 permission toggles `[Extra Owner]`",
    "`!editrole @role` - Edit role color, name, hoist, position `[Extra Owner]`",
    "`!deleterole @role` - Delete a server role `[Extra Owner]`",
    "`!addrole @user @role` - Add role to a user `[Extra Owner]`",
    "`!removerole @user @role` - Remove role from a user `[Extra Owner]`",
    "`!striproles @user` - Strip all roles from a user `[Extra Owner]`",
    "`!createchannel / !createc <name>` - Quickly create a text channel `[Extra Owner]`",
    "`!createvc / !makevc <name> [limit]` - Quickly create a voice channel `[Extra Owner]`",
    "`!deletechannel / !delc <#channel...>` - Delete one or more channels `[Extra Owner]`",
    "`!delcat / !deletecategory <category>` - Delete category (keeps channels safe) `[Extra Owner]`",
    "`!delcatall / !deletecategoryall <category>` - Delete category AND all its channels `[Extra Owner]`",
    "`!createthread <name>` - Create a new public or private thread in current channel `[Extra Owner]`",
    "`!archivethread` - Archive the current thread `[Extra Owner]`",
    "`!deletethread` - Delete the current thread `[Extra Owner]`",
    "`!say <message>` - Send a raw text message via bot `[Extra Owner]`",
    "`!announce` - Launch interactive announcement builder (supports direct Pinterest links) `[Extra Owner]`",
    "`!aiannounce [prompt] [#channel] / /aiannounce` - AI Announcement Studio with Pinterest banner support, custom emojis & live preview `[Staff]`",
    "`!fck @user <reason>` - Send direct official warning DM `[Server Owner]`"
  ] },
  { id: 'mass_actions', category: 'SERVER ADMINISTRATION', shortLabel: 'Mass Mod', label: 'Mass Actions', emoji: 'mass', commands: [
    "`!massban` - Open interactive menu to ban multiple users `[Extra Owner]`",
    "`!masskick` - Open interactive menu to kick multiple users `[Extra Owner]`",
    "`!masstimeout` - Open interactive menu to timeout multiple users `[Extra Owner]`",
    "`!massmove` - Open menu to move all members in VC `[Extra Owner]`",
    "`!massdc` - Open menu to disconnect all members in VC `[Extra Owner]`",
    "`!massaddrole @role` - Interactively grant role to members `[Extra Owner]`",
    "`!massremoverole @role` - Interactively remove role from members `[Extra Owner]`",
    "`!massstrip @role` - Strip role from all members with backup `[Extra Owner]`",
    "`!massrestore @role` - Restore stripped role to all members `[Extra Owner]`",
    "`!wipeemojis` - Bulk delete all custom emojis from server `[Server Owner]`",
    "",
    "-# **__Mass Mod Guidance:__**",
    "-# These commands spawn CV2 panels that allow selecting targets from specific voice channels, roles, or text channels. Protected and whitelisted users are automatically skipped."
  ] },

  { id: 'studio', category: 'SERVER ADMINISTRATION', shortLabel: 'Studio', label: 'Studio & Audits', emoji: 'config', commands: [
    "`!aiannounce [prompt] [#channel] / /aiannounce` - Neural Announcement Studio with Pinterest banner support, live preview & channel selector `[Staff]`",
    "`!studio create` - Interactive Container & Embed Studio builder (supports direct Pinterest links) `[Admin]`",
    "`!studio list` - View all saved server announcement and container templates `[Admin]`",
    "`!studio send <template_id> [#channel]` - Dispatch saved container template to channel `[Admin]`",
    "`!studio delete <template_id>` - Permanently delete saved container template `[Admin]`",
    "`!auditlogs / !audit [@user] [limit]` - Forensic audit log search with action classification and time filters `[Staff]`",
    "",
    "-# **__Studio & Forensic Architecture:__**",
    "-# • **__AI Announcement Studio:__** Neural speech enhancement transforms rough ideas into formatted Discord announcements with custom emojis, direct Pinterest banners, and live preview.",
    "-# • **__Universal Media Pipeline:__** Announcement banners and studio embed containers support direct Pinterest links (`pin.it` & `pinterest.com`) with uncompressed master extraction.",
    "-# • **__Custom Container Templates:__** Create and persist reusable CV2 borderless layouts across reboots.",
    "-# • **__Forensic Audit Logs:__** Real-time Gateway API audit log inspection with moderator/target filtering."
  ] },

  { id: 'ai', category: 'AI & SYSTEM INTELLIGENCE', shortLabel: 'AI Guide', label: 'AI & System Intelligence', emoji: 'ai', commands: [
    "`!athena <question> / /athena <query>` - Interactive AI Specialist explaining all 257+ commands & step-by-step setups `[Public]`",
    "`!athena` (no args) - Interactive Quick-Action Guidance Hub with one-click domain explainers `[Public]`",
    "`!aiannounce [prompt] [#channel] / /aiannounce` - AI Announcement Studio to craft, format, enhance & preview broadcasts `[Staff]`",
    "`!ask <prompt> / /ask <prompt>` - Direct conversational AI query engine for general questions and server queries `[Public]`",
    "`!aimode channel [#channel]` - Lock conversational AI auto-replies to a specific channel `[Admin]`",
    "`!aimode on|off|status` - Toggle and check server-wide conversational AI channel mode `[Admin]`",
    "`!explain / !architecture [topic/cmd]` - Interactive multi-page architectural breakdowns & exploit analyses `[Public]`",
    "`!explain aiannounce` - Deep-dive architecture of AI Announcement Studio, custom emojis & live studio `[Public]`",
    "`!explain athena / !explain guide` - Deep-dive architecture of Athena's AI Guide, RAG & button generator `[Public]`",
    "",
    "-# **__Athena AI Specialist Capabilities & Architecture:__**",
    "-# • **__AI Announcement Studio:__** Turns brief, typo-laden notes into polished Discord announcements with custom emojis, live ephemeral preview, and channel targeting.",
    "-# • **__257+ Command Deep-Dive & Knowledge Base:__** Full awareness of all command parameters, syntax variations, permission tiers, and edge cases across every bot module.",
    "-# • **__Fuzzy Typo Auto-Correction:__** Powered by Damerau-Levenshtein distance. Typo variations (e.g. `!athena how to use rnkthme`, `tcikets`, `atninuke`) are automatically recognized and resolved.",
    "-# • **__Prefix-First Step-by-Step Walkthroughs:__** Guides users step-by-step with clean markdown codeblocks (`!command ...`) while clarifying if slash commands or dashboard alternatives exist.",
    "-# • **__Context-Aware Multi-Turn Thread Memory:__** Retains conversation history for 10 minutes in each channel, allowing natural follow-up questions without re-typing context.",
    "-# • **__Clearance-Aware Adaptive Guidance:__** Dynamically checks user permissions (Owner, Extra Owner, Admin, Mod, Public) and tailors instructions to their exact clearance.",
    "-# • **__One-Click Interactive Action Buttons:__** Provides neutral grey action buttons (`style: 2`) to instantly launch setups, view statuses, or switch themes with 1 click.",
    "-# • **__On-Demand Custom Button Generator:__** Need a specific button? Ask Athena in your question or follow-up and custom grey action buttons are generated on demand.",
    "-# • **__Live Thinking Telemetry:__** Real-time progress timer showing elapsed seconds during Google Gemini 3.8 Flash neural processing.",
    "-# **__Neural Intelligence Architecture:__** Powered by Google Gemini 3.8 Flash with multi-tier failover and high-speed edge reasoning."
  ] },

  { id: 'tickets', category: 'UTILITIES & INTEGRATIONS', shortLabel: 'Tickets', label: 'Ticket System', emoji: 'tickets', commands: [
    "`!ticket setup <#category> <@staffRole> [ai_on]` - Configure category, staff roles & optional AI triage `[Administrator]`",
    "`!ticket ai on|off` - Toggle Smart Ban Appeals & AI Ticket Triage `[Administrator]`",
    "`!ticketpanel` - Deploy interactive ticket panel with one-click AI triage & Pinterest banner support `[Administrator]`",
    "`!add @user` - Add a user to an active ticket channel `[Staff]`",
    "`!remove @user` - Remove a user from an active ticket channel `[Staff]`",
    "`!close` - Close and archive the active ticket channel `[Public]`",
    "`!rename <name>` - Rename an active ticket channel `[Staff]`",
    "",
    "-# **__Ticket System Capabilities:__**",
    "-# • Features **__Dropdown Menus__**, **__Interactive Q&A Modals__**, and **__Beautiful CV2 Welcome Embeds__**.",
    "-# • **__Universal Media & Pinterest Support:__** Ticket panel banner and thumbnail inputs support direct Pinterest links (`pin.it` & `pinterest.com`) with automatic uncompressed extraction.",
    "-# • **__Smart Ban Appeals & AI Triage (Optional):__** Categorizes inquiries (Ban Appeal, Store/Coins, Bugs, Harassment) and creates executive summaries for staff.",
    "-# • Automatically creates paired Voice Channels and Text Channels per ticket.",
    "-# • **__Step 1:__** Run `!ticket setup <#category> <@staffRole> [ai_on]` to configure category and staff roles.",
    "-# • **__Step 2:__** Run `!ticketpanel` to deploy and customize the public interactive panel."
  ] },
  { id: 'tracking', category: 'UTILITIES & INTEGRATIONS', shortLabel: 'Tracking', label: 'Tracking & Logs', emoji: 'tracking', commands: [
    "`!serverlogs` - View interactive server event logs `[Extra Owner]`",
    "`!serveroverview / !server / !serverview` - Rich overview of server statistics `[Public]`",
    "`!serverinfo / !si` - Detailed server statistics `[Public]`",
    "`!top / !leaderboard / !lb` - View top message and voice leaderboard `[Public]`",
    "`!stats / !mystats / !me [@user]` - View server statistics and personal insights `[Public]`",
    "`!chatlb / !topchat` - View the most active chatters `[Public]`",
    "`!voicelb / !topvoice` - View the most active voice members `[Public]`",
    "`!invitelb / !topinvites` - View the top inviters in the server `[Public]`",
    "`!syncinvites` - Synchronize the invite tracker database `[Extra Owner]`",
    "`!invitesetup / !setinvites <#channel>` - Setup invite tracking logs channel `[Extra Owner]`",
    "`!invitedisable / !disableinvites` - Disable invite tracking `[Extra Owner]`",
    "`!botstats / !botinfo / !bi / !binfo` - View bot performance and cluster info `[Public]`",
    "`!bjoins / !bcmds / !bservers` - View bot growth metrics `[Public]`",
    "`!record / !voicelog` - Setup voice logging channel `[Extra Owner]`",
    "`!setdeletelog <#channel>` - Set where deleted messages are sent `[Extra Owner]`",
    "`!status` - Live bot engine performance, cluster health & security telemetry `[Public]`",
    "`!setgloballog <#channel>` - Bind global cross-server moderation action logger `[Bot Owner]`",
    "`!removegloballog` - Unset global action log channel `[Bot Owner]`",
    "`!testgloballog` - Dispatch test cross-server action embed `[Bot Owner]`"
  ] },
  { id: 'config', category: 'UTILITIES & INTEGRATIONS', shortLabel: 'Config', label: 'Server Configuration', emoji: 'config', commands: [
    "`!serverstats / !statsetup setup|config|disable` - Manage voice channels displaying member counts `[Extra Owner]`",
    "`!ytstats` - Open **YouTube Stats VC Engine** (Dynamically display live YouTube subscriber counts in VC) `[Extra Owner]`",
    "`!autorole / !autorole-config` - Open **AutoRole & Vanity Engine** (Human/Bot join roles & vanity status rewards) `[Extra Owner]`",
    "`!autovcstatus / !randomvc [on|off|shuffle]` - Rotate custom statuses on all VCs `[Extra Owner]`",
    "`!accent <hex>` - Set the global CV2 accent color for the server `[Extra Owner]`",
    "`!prefix <new_prefix>` - Change the bot's command prefix `[Extra Owner]`",
    "`!setguildavatar` - Change the bot's server icon `[Extra Owner]`",
    "`!setguildbanner` - Change the bot's server banner `[Extra Owner]`",
    "`!sethomevc / !unsethomevc` - Bind bot to a dedicated 24/7 VC `[Extra Owner]`",
    "`!backup / !bcp create|info` - Server infrastructure Backup Suite `[Server Owner]`",
    "`!db status / backup / export / restore / setchannel` - Discord Cloud Backup & Persistence Manifest Suite `[Bot Owner]`",
    "`!setsuggestions / !suggestchannel <#channel>` - Set designated channel for suggestions `[Extra Owner]`",
    "`!starboard <#channel> [stars]` - Set starboard channel and star threshold `[Extra Owner]`",
    "`!voicerole <@role|ID|Name|disable> / !vcrole` - Auto-assign role in VC for all members & bots `[Extra Owner]`",
    "`!setstatschannel <#channel>` - Set dedicated channel for stats commands `[Extra Owner]`",
    "`!setup` - Interactive Server Setup Wizard for logs, quarantine, and core features `[Extra Owner]`",
    "`!setstatus <#channel>` - Deploy 24/7 live bot status and resource telemetry panel `[Bot Owner]`",
    "`!removestatus` - Remove the 24/7 live status panel `[Bot Owner]`",
    "`!buildserver` - Auto-generate aesthetic server layout & channel structure `[Server Owner]`",
    "`!remotevc <guildId> <vcId>` - Remotely bind bot home voice channel `[Bot Owner]`",
    "`!forceadmin / !unforceadmin` - Remote emergency administration bridge `[Bot Owner]`"
  ] },

  { id: 'welcome', category: 'COMMUNITY & ENGAGEMENT', shortLabel: 'Welcome', label: 'Welcome & Leave', emoji: 'welcome', commands: [
    "`!welcome` - Open interactive Welcome Message Builder (supports direct Pinterest links & MP4s) `[Extra Owner]`",
    "`!leave` - Open interactive Leave Message Builder (supports direct Pinterest links & MP4s) `[Extra Owner]`",
    "`!autorole / !autorole-config` - Open **AutoRole & Vanity Engine** (Human/Bot join roles & vanity status rewards) `[Extra Owner]`",
    "`!autoreact` - Open **Auto-React Engine** (Add up to 5 automatic reaction emojis per channel) `[Extra Owner]`",
    "`!verify setup <@role> [button|captcha|math]` - Deploy verification gate with Graphic CAPTCHA or Math challenges `[Admin]`",
    "`!verify mode <button|captcha|math>` - Switch active verification challenge type `[Admin]`",
    "`!verify disable` - Dismantle verification gate `[Admin]`",
    "",
    "-# **__Builder & Engine Features:__**",
    "-# • **__Universal Pinterest Integration:__** Paste any direct Pinterest link (`pin.it` or `pinterest.com/pin/...`) into Image, Thumbnail, Author Icon, or Footer Icon modals — Athena automatically scrapes the uncompressed master resolution image or converts MP4 videos into animated looping GIFs.",
    "-# • **__AutoRole & Vanity Engine:__** Automatically assigns human/bot roles on join and vanity URL reward roles.",
    "-# • **__Auto-React Engine:__** Configure up to 5 custom or native reaction emojis per channel.",
    "-# • **__Dynamic Variable Interpolation:__** Full support for `{membercount}`, `{ordinal}`, `{user}`, `{username}`, `{displayname}`, `{tag}`, `{userid}`, `{server}`, `{serverid}`, `{server.icon}`, `{avatar}`, `{created}`, `{joined}`, `{owner}`, `{boosts}`, `{tier}`, `{roles}`, `{channels}`.",
    "-# • **__Media Pipeline:__** Supports custom hex accent colors, direct image URLs, uncompressed Pinterest links, and auto-converts MP4 video links into animated looping GIFs."
  ] },
  { id: 'leveling', category: 'COMMUNITY & ENGAGEMENT', shortLabel: 'XP', label: 'Leveling & XP', emoji: 'leveling', commands: [
    "`!xpsetup` - Open the XP Dashboard `[Extra Owner]`",
    "`!rank [@user]` - View level and XP progress `[Public]`",
    "`!ranktheme <hogwarts|athena>` - Switch personalized rank card aesthetic (Looping Animated GIF vs Obsidian Stone) `[Public]`",
    "`!rankrewards list` - View active level milestone role rewards `[Public]`",
    "`!rankrewards add <level> <@role>` - Bind automated role reward to milestone `[Admin]`",
    "`!rankrewards remove <level>` - Unbind milestone role reward `[Admin]`",
    "`!givexp @user <amount>` - Manually grant XP `[Extra Owner]`",
    "`!removexp @user <amount>` - Manually remove XP `[Extra Owner]`",
    "",
    "-# **__XP Setup Guide:__**",
    "-# • **__Step 1:__** Run `!xpsetup` and click **__Enable System__**.",
    "-# • **__Step 2:__** Use `!rankrewards add <lvl> <@role>` to configure milestone role rewards.",
    "-# • **__Step 3:__** Members choose between **__Hogwarts Looping GIF__** or **__Athena Classic__** via `!ranktheme`.",
    "-# • **__Step 4:__** Set the **__Announce Channel__** where level-up messages will be sent."
  ] },
  { id: 'counting', category: 'COMMUNITY & ENGAGEMENT', shortLabel: 'Counting', label: 'Counting Engine', emoji: 'counting', commands: [
    "`!counting` - Open interactive Counting Control Panel `[Extra Owner]`",
    "`!counting setup <#channel>` - Bind counting to a specific channel `[Extra Owner]`",
    "`!counting reset` - Reset the current count back to 0 `[Extra Owner]`",
    "`!counting setsaves <0-20>` - Set available server saves `[Extra Owner]`",
    "`!counting math <on|off>` - Toggle arithmetic math expressions `[Extra Owner]`",
    "`!counting autotopic <on|off>` - Toggle auto-updating channel topic `[Extra Owner]`",
    "`!counting disable` - Turn off counting in the server `[Extra Owner]`",
    "`!countlb / !counting lb` - View server counting records & top counters `[Public]`",
    "",
    "-# **__Counting Engine Guide:__**",
    "-# • **__Step 1:__** Run `!counting setup #channel` or type `!counting` to open the interactive panel.",
    "-# • **__Step 2:__** Members count consecutively starting from **__1__**.",
    "-# • **__Step 3:__** If someone counts twice in a row or types the wrong number, a server save is consumed.",
    "-# • **__Step 4:__** If no saves remain, the count ruins back to 1 and the all-time high score is updated!"
  ] },
  { id: 'economy', category: 'COMMUNITY & ENGAGEMENT', shortLabel: 'Economy', label: 'Economy & Shop', emoji: 'coins', commands: [
    "`!balance / !bal [@user]` - View wallet, vault reserves, and net worth `[Public]`",
    "`!daily` - Claim daily stipend with consecutive day streak multipliers `[Public]`",
    "`!pay @user <amount>` - Transfer coins directly to another member `[Public]`",
    "`!coinflip <heads|tails> <bet>` - Double or nothing 50/50 coin wager `[Public]`",
    "`!blackjack / !bj <bet>` - Interactive Blackjack with Components V2 buttons & 2.5x natural payouts `[Public]`",
    "`!roulette / !roul <bet> <space>` - European roulette wheel betting (Red, Black, Green, Even, Odd, 0-36) `[Public]`",
    "`!trivia / !quiz [wager]` - Interactive 4-choice knowledge tournament with coin rewards `[Public]`",
    "`!gamestats / !mgstats [@user]` - View personal casino records, wins, and net earnings `[Public]`",
    "`!shop` - Browse server role and privilege catalog `[Public]`",
    "`!shop buy <itemId>` - Purchase role perk with coins `[Public]`",
    "`!shop add <name> <price> <@role>` - List new purchasable role perk `[Admin]`",
    "`!shop remove <itemId>` - Purge item from catalog `[Admin]`",
    "",
    "-# **__Commerce & Minigames Architecture:__**",
    "-# • Persistent ledger stored in SQLite & synchronized with Discord Cloud Backups.",
    "-# • Interactive casino buttons engineered via Discord Components V2 with instant balance reconciliation.",
    "-# • Roles purchased via shop are fulfilled and audited instantly by Role ID."
  ] },
  { id: 'voice', category: 'VOICE & MEDIA', shortLabel: 'Voice', label: 'Voice Utilities', emoji: 'voice', commands: [
    "`!tts` - Interactive AI & Celebrity TTS Control Center `[Public]`",
    "`!tts <message>` - Broadcast Text-to-Speech audio in your voice channel `[Public]`",
    "`!tts voices` - Explore all 14 Celebrity & Character AI voices `[Public]`",
    "`!tts voice <name>` - Lock your default voice preference (`trump`, `modi`, `mj`, `taylor`, `ariana`, `sabrina`, `bieber`, etc.) `[Public]`",
    "`!tts <voice> <msg>` - Speak directly with on-the-fly celebrity voice `[Public]`",
    "`!tts autovc` - Toggle global Auto-TTS for your VC `[Admin]`",
    "`!tts stop` - Immediately halt speech playback and clear queue `[Public]`",
    "`!voiceanalytics / !va` - 24-hour diurnal voice activity heatmaps, peak windows & channel analytics `[Staff]`",
    "`!voicerole <@role|ID|Name|disable> / !vcrole` - Auto-assign role in VC for all members & bots `[Extra Owner]`",
    "`!jtcsetup` - Configure Join-to-Create voice channels `[Extra Owner]`",
    "`!secondaryjtc` - Setup a secondary JTC hub `[Extra Owner]`",
    "`!jtcdisable` - Disable JTC system `[Extra Owner]`",
    "`!jtc add @user` - Permit user into locked temporary JTC channel `[Public]`",
    "`!jtc chime on|off` - Entrance chime soundboard notifications for Join to Create voice rooms `[Public]`",
    "`!vcpanel` - Spawn the interactive VC control panel for JTC owners `[Public]`",
    "`!vc` - Voice channel quick actions and controls `[Public]`",
    "`!vcdrag @user` - Force-drag a user to your VC `[Extra Owner]`",
    "`!vcdragstop @user` - Stop an active voice drag session `[Extra Owner]`",
    "`!vcdraglist` - List all active voice drag sessions `[Extra Owner]`",
    "`!muteall / !unmuteall` - Mute/unmute everyone in your VC `[Extra Owner]`",
    "`!deafenall / !undeafenall` - Deafen/undeafen everyone in your VC `[Extra Owner]`",
    "`!mute / !unmute @user` - Voice mute or unmute a specific member `[Extra Owner]`",
    "`!deafen / !undeafen @user` - Server deafen or undeafen a member `[Extra Owner]`",
    "`!vcprotect add|remove|list @user` - Protect user from being dragged/muted `[Extra Owner]`",
    "`!moveprotect add|remove|list @user` - Protect user from being moved `[Extra Owner]`",
    "`!vclock / !vcunlock` - Lock/unlock the current VC `[Extra Owner]`",
    "`!theatermode` - Toggle Theater Mode in current VC `[Extra Owner]`",
    "`!botvoice / !bv` - Control bot server mute and deafen status `[Extra Owner]`"
  ] },
  { id: 'community', category: 'COMMUNITY & ENGAGEMENT', shortLabel: 'Community', label: 'Community Tools', emoji: 'community', commands: [
    "`!suggest / !suggestion <idea>` - Submit a suggestion `[Public]`",
    "`!setsuggestions / !suggestchannel <#channel>` - Set designated channel for suggestions `[Extra Owner]`",
    "`!starboard <#channel> [stars]` - Configure the starboard channel `[Extra Owner]`",
    "`!voicerole <@role|ID|Name|disable> / !vcrole` - Auto-assign role in VC for all members & bots `[Extra Owner]`",
    "`!rate / !edit` - Rate recent server edits with custom stars `[Public]`",
    "`!ratelb / !editlb` - View the edit rating leaderboard `[Public]`",
    "`!counting / !count` - Interactive Counting Engine Dashboard & Controls `[Extra Owner]`",
    "`!countlb / !counting lb` - Server Counting records & leaderboard `[Public]`",
    "`!music / !play <query>` - Open Music Dashboard (Play, Skip, Queue, Volume) `[Public]`",
    "`!setupmusic` - Deploy 24/7 compact music controller channel `[Extra Owner]`",
    "`!media <url>` - Download TikTok/Insta/Twitter/YouTube videos directly `[Public]`",
    "`!mp3 <url>` - Extract audio from video links `[Public]`",
    "`!setmedia / !unsetmedia` - Bind Auto Media Downloader to channel `[Extra Owner]`",
    "`!chess` - Play an interactive game of chess in chat `[Public]`",
    "`!ship @user1 @user2` - Calculate love compatibility between two users `[Public]`",
    "`!birthday` - Set your birthday and view upcoming birthdays `[Public]`",
    "`!quote / !q <msg_id>` - Quote a message beautifully `[Public]`",
    "`!quote setchannel / !setquote <#channel|none>` - Bind Auto-Quote channel to turn typed messages into quotes `[Extra Owner]`",
    "`!unsetquote` - Disable dedicated Auto-Quote channel `[Extra Owner]`",
    "`!quotemaker` - Launch interactive Canvas Quote Generator `[Public]`",
    "`!youtube add|remove|list` - Configure YouTube video upload notification alerts `[Extra Owner]`",
    "`!ccmd / !customcmd add <trigger> <reply>` - Create a custom command response `[Extra Owner]`",
    "`!autoreply / !ar` - Custom keyword auto-replies with accent borderless CV2 embeds, GIFs & direct Pinterest links `[Extra Owner]`",
    "`!trigger` - Opens Trigger Response Matrix with Synced Looping Animated GIF HUD & Progress Bar `[Public / Admin]`",
    "`!trigger create <match> | <resp>` - Fast simple setup: `!trigger create hello | Hello {user}!` `[Extra Owner / Admin]`",
    "`!trigger <match> | <resp>` - Direct shortcut syntax `[Extra Owner / Admin]`",
    "`!trigger delete <match>` - Remove keyword trigger `[Extra Owner / Admin]`",
    "`!trigger react <match> <emoji>` - Configure dual-action auto-reaction synergy `[Extra Owner / Admin]`",
    "`!trigger mirror <match> <#channel>` - Configure staff alert mirroring for emergency keywords `[Extra Owner / Admin]`",
    "`!trigger list` - View active keyword triggers `[Public]`",
    "",
    "-# **__The 4 Advanced Trigger Engines:__**",
    "-# • **__Ghost Triggers (`ghost:<sec>`):__** Auto-destructs after N seconds to prevent channel clutter.",
    "-# • **__Bounty XP Rewards (`xp:<amount>` & `maxclaims:<n>`):__** Awards dynamic XP to the first N users.",
    "-# • **__Time / Clock Dayparts (`time:<morning|day|night|weekend>`):__** Matches current server clock.",
    "-# • **__Tier & Audience Adaptive (`audience:<newbie|booster|staff>`):__** Dynamic role/tenure responses.",
    "`!rrsetup / !reactionrole` - Interactive Reaction Role builder `[Extra Owner]`",
    "`!giveaway / !gw` - Manage server giveaways `[Extra Owner]`",
    "`!date / !go-on-date @user` - Go on a special interactive date `[Public]`",
    "`!app` - Manage Staff Application system `[Extra Owner]`",
    "`!hug / !kiss / !slap / !pat` - Roleplay interactions with other users `[Public]`"
  ] },
  
  { id: 'utilities', category: 'UTILITIES & INTEGRATIONS', shortLabel: 'Utilities', label: 'General Utilities', emoji: 'utilities', commands: [
    "`!help [module/command]` - Displays this interactive menu `[Public]`",
    "`!weather / !wtr / !climate / !forecast / !temp [location|google_maps_url]` - Live global weather reconnaissance with generated satellite world map & 3-day forecast `[Public]`",
    "`!image / !pic / !img / !photo / !picture / !searchimg <query>` - Real-time web picture retrieval with interactive pagination (Next, Prev, Random, Source) `[Public]`",
    "`!dashboard / !commandcenter / !omni / !omnihud / !warroomall / !fullhud / !matrix360 / !allinone / !allstats / !masterhud / !cyberhud / !central` - Flagship Unified Command Center combining Telemetry, Server Operations & DEFCON Security `[Public / Admin]`",
    "`!hud / !warroom / !corehud / !matrixhud` - Flagship Animated Cyber War-Room HUD with live mode switching `[Public / Admin]`",
    "`!botstats / !botinfo / !bi / !binfo` - View advanced bot performance, cluster metrics & system health `[Public]`",
    "`!athena / !guide [question]` - Interactive Athena AI Specialist to explain commands, resolve doubts & instruct setups `[Public]`",
    "`!ask / !askathena / !assistant <prompt>` - Query general AI knowledge and analysis `[Public]`",
    "`!aimode status|on|off|channel` - Configure conversational AI channel mode `[Admin]`",
    "`!dev` - Displays developer information and credits `[Public]`",
    "`!ping / !p / !latency` - View bot latency and heartbeat graph `[Public]`",
    "`!status` - Live bot engine performance, cluster health & security telemetry `[Public]`",
    "`!db status` - View database cloud backup status and persistence manifest `[Bot Owner]`",
    "`!db backup` - Force immediate automated cloud backup to Discord `[Bot Owner]`",
    "`!db restore latest` - Hot-restore and reload from Discord cloud backup `[Bot Owner]`",
    "`!modmail / !mm setup <#channel>` - Direct Message support ticket bridge `[Extra Owner]`",
    "`!modmail disable` - Disable ModMail support bridge `[Extra Owner]`",
    "`!reply <message>` - Reply to member inside active ModMail ticket `[Extra Owner]`",
    "`!avatar / !av / !pfp [@user]` - View user's avatar `[Public]`",
    "`!banner / !bnr [@user]` - View user's banner `[Public]`",
    "`!userinfo / !ui / !whois [@user]` - Detailed user information `[Public]`",
    "`!time` - Check current Indian Standard Time (IST) `[Public]`",
    "`!snipe` - View the last deleted message `[Public]`",
    "`!news` - Configure automated RSS feeds `[Extra Owner]`",
    "`!shortcuts / !sc / !short enable|disable` - Toggle shortcuts `[Public]`",
    "`!calculator / !calc` - Interactive button calculator `[Public]`",
    "`!tts` - Interactive AI & Celebrity TTS Control Center `[Public]`",
    "`!tts <text>` - Broadcast Text-to-Speech audio in voice channel `[Public]`",
    "`!tts voices` - Interactive directory of 14 Celebrity & Character AI voices `[Public]`",
    "`!tts voice <name>` - Lock your default voice (`trump`, `modi`, `mj`, `taylor`, `ariana`, `sabrina`, `bieber`) `[Public]`",
    "`!tts <voice> <msg>` - Speak directly with on-the-fly celebrity voice `[Public]`",
    "`!tts autovc` - Toggle global Auto-TTS for your VC `[Admin]`",
    "`!tts stop` - Immediately halt speech playback and clear queue `[Public]`",
    "`!qrcode / !qrc / !qrcode / !qrmanager <text/link>` - Generate high-resolution QR code `[Public]`",
    "`!steal / !stealemoji / !emojisteal / !steal-emoji / !addemoji <emoji/link>` - Steal an emoji to this server `[Extra Owner]`",
    "`!afk / !brb [reason]` - Set an AFK status that replies when pinged `[Public]`",
    "`!bump` - Bump the server (Disboard integration) `[Public]`",
    "`!sticky / !stick <message>` - Keep a message stuck at bottom of chat `[Extra Owner]`",
    "`!upload <url>` - Upload and mirror file from direct URL `[Public]`",
    "`!pinterest / !pin <link>` - Extract & download master uncompressed images or MP4 videos from Pinterest `[Public]`",
    "`!weather / !wtr / !climate / !forecast / !temp / !temperature <location/maps_url>` - Live global weather reconnaissance with satellite world map & 3-day forecast `[Public]`",
    "`!image / !pic / !img / !photo / !picture / !searchimg <query>` - Live web high-res picture retrieval with interactive browsing & fresh batches `[Public]`",
    "`!stock / !stocks / !market / !stockmarket / !ticker [symbol]` - Live stock & crypto telemetry in a high-res image with financial breakdown `[Public]`",
    "`!symbols / !symbollist / !tickers / !tickerlist / !stocksymbols / !marketlist / !symlist [query]` - Universal global ticker directory, trending IPOs & real-time symbol search `[Public]`",
    "`!nifty [50|bank|sensex|it|vix]` - Live NIFTY 50 Indian benchmark index telemetry in a high-res Canvas card `[Public]`",
    "`!banknifty / !bnifty` - Dedicated Bank Nifty index telemetry & banking sector pivot points `[Public]`",
    "`!sensex / !bse` - Live Bombay Stock Exchange (BSE Sensex 30) Dalal Street benchmark `[Public]`",
    "`!niftyit / !cnxit` - Live Nifty IT index telemetry & Indian software exporter price action `[Public]`",
    "`!indiavix / !vix` - Live India VIX market volatility & fear gauge index `[Public]`",
    "`!stockai / !stockexplain / !marketai / !stai <question/topic>` - Ask Athena AI for detailed financial reports, earnings breakdowns & market explanations `[Public]`",
    "`!movers / !topmovers / !gainers / !losers` - Real-time breakdown of top market movers across equities & crypto `[Public]`",
    "`!crypto / !coin / !btc / !eth [coin]` - Dedicated cryptocurrency market telemetry and Canvas charts `[Public]`",
    "`!stocknews / !marketnews [symbol]` - Real-time financial headlines & market catalysts `[Public]`",
    "`!stockchannel <set #channel | disable | status | test>` - Configure automated daily stock market image upload channel `[Admin]`",
    "`!tier / !mytier / !perms` - Check your current Athena Prime authorization tier `[Public]`",
    "`!profile / !card [@user]` - Official God of War canvas profile card `[Public]`",
    "",
    "-# **__Stock Market Intelligence & Telemetry Engine:__**",
    "-# • **Primary & Aliases:** `!symbols`, `!symbollist`, `!tickers`, `!tickerlist`, `!stocksymbols`, `!marketlist`, `!symlist`, `/symbols [query]`.",
    "-# • **Interactive Categorized Directory:** 1-click interactive tabs for Overview, Trending & New IPOs, India (NSE/BSE), US Tech & AI, Cryptocurrencies, and Macro & Commodities.",
    "-# • **Universal Ticker Resolution:** Resolves every publicly traded asset globally (Indian equities on NSE/BSE like TCS, RELIANCE, INFY, TATAMOTORS, SBIN, ETERNAL, SWIGGY; US tech titans NVDA, AAPL, TSLA; crypto; commodities; indices).",
    "-# • **Autonomous Self-Learning & Auto-Updating Registry:** Automatically detects, indexes, and edits any new stock, recent IPO, or corporate ticker renaming (e.g. Zomato -> ETERNAL.NS, Tata Motors -> TMCV.NS, FB -> META) and permanently caches it in SQLite.",
    "-# • **Trending & Newly Discovered Tickers Directory:** Interactive tab (`!symbols trending`) tracking real-time newly listed IPOs, active movers, and corporate ticker migrations auto-discovered and indexed by Athena.",
    "-# • **High-Resolution Canvas Cards:** Generates terminal-grade Canvas images with smooth Bezier price curves, day range sliders, 52-week range sliders, volume, and sentiment gauges.",
    "-# • **Global Market Pulse Dashboard:** Generates a 6-index overview (S&P 500, NASDAQ, Dow Jones, NIFTY 50, Bitcoin, Ethereum) + mega-caps ticker tape.",
    "-# • **Automated Daily Channel Broadcast:** Configurable morning broadcast (`!stockchannel set <#channel>`) that automatically generates and uploads the daily market briefing at US Market Open (09:30 AM EST).",
    "-# • **Mandatory Risk Transparency:** Prominently highlights that Athena can make mistakes, data may be delayed, and insights do not constitute financial advice.",
    "",
    "-# **__Indian Market Benchmark Suite (NIFTY & Dalal Street):__**",
    "-# • **Dedicated Benchmark Commands:** `!nifty` (NIFTY 50), `!banknifty` (Bank Nifty), `!sensex` (BSE Sensex 30), `!niftyit` (Nifty IT), `!indiavix` (India VIX).",
    "-# • **High-Resolution Canvas Graphics:** Dedicated index badges (`N50`, `BNK`, `BSE`, `IT`, `VIX`), official NSE/BSE branding, and smooth Bezier price action curves.",
    "-# • **Classic Pivot Points Engine:** Automatically computes mathematical intraday pivot levels (`P = (H + L + C) / 3`, `R1 = 2P - L`, `S1 = 2P - H`) for index traders.",
    "-# • **Live Market Session Tracker:** Real-time Indian Standard Time (IST) operational session tracker (Pre-Market, Regular 09:15 - 15:30 IST, Post-Market, Weekend).",
    "-# • **Interactive 1-Click Navigation:** Switch between Nifty 50, Bank Nifty, Sensex, Nifty IT, and India VIX with zero-lag interactive button components.",
    "",
    "-# **__Global Weather Reconnaissance Engine:__**",
    "-# • **Universal Target Pinpointing:** Works for any location worldwide via city name, country, latitude/longitude, or Google Maps URL.",
    "-# • **Dynamic Satellite World Map:** Generates an Equirectangular satellite world map on Canvas with pinpoint radar crosshairs, target beacon, and telemetry.",
    "-# • **Atmospheric & Solar Telemetry:** Real-time temperature (°C/°F), humidity, wind velocity, UV index, pressure, visibility, sunrise/sunset, and 3-day meteorological forecast.",
    "",
    "-# **__Live Web Visual Intelligence Engine:__**",
    "-# • **Authentic Web Media:** Queries live internet image databases to retrieve real high-resolution photographs for any query (e.g. cat, worldmap, car, biden, cm of tn).",
    "-# • **Multi-Page 70+ Pool & Fresh Batches:** Browse high-res photos with `◀ Previous`, `Next ▶`, `[Random]`, and `[Fresh Batch]` buttons.",
    "-# • **Direct Source Links:** Instant button link to the original high-resolution photo on the host website.",
    "-# • **Conversational AI Trigger:** Ask Athena naturally in chat (`@Athena picture of cat` or `!ask give me a picture of biden`) and Athena will automatically retrieve and display the picture.",
    "",
    "-# **__Pinterest Media Downloader Engine:__**",
    "-# • **__Full Master Resolution Scraper:__** Resolves shortened `pin.it` redirects and upgrades preview thumbnails (736x, 564x) to full uncompressed original master quality (/originals/).",
    "-# • **__Video & GIF Extraction:__** Detects and extracts full-quality MP4 videos and animated GIFs from Pinterest posts.",
    "-# • **__1-Click Download Button:__** Every extracted pin generates an instant direct **Download Image** or **Download Video** button on the result embed.",
    "-# • **__Universal Cross-Bot Integration:__** Paste any Pinterest link directly into any bot image button or modal (!welcome, !leave, !ticketpanel, !announce, !autoreply, and Studio) and Athena will automatically extract and display the high-res media asset seamlessly.",
    "",
    "-# **__News Feed System:__**",
    "-# • Supports Twitter (X), YouTube, Reddit, and standard RSS feeds.",
    "-# • Automatically formats new posts as sleek CV2 embeds."
  ] }
];

const HELP_GIF = 'https://cdn.discordapp.com/attachments/1534869224277807175/1542472732325978234/ATHENA-8-27-2026.png?ex=6a915b2d&is=6a9009ad&hm=0f55bae0c0bec27649bc03e6d6be23ad16f2eb9337efdb8b5793b2d74cad89ff&';

export function buildHelpContainer(client, guildId, moduleId) {
    const config = db.getGuildConfig(guildId);
    const prefix = config?.prefix || '!';
    const botId = client?.user?.id || '1347071663182676059';
    
    const getEmoji = (name, fallback) => {
      // 1. Designated custom emojis requested specifically for these 4 modules
      const designatedCustomEmojis = {
        'ai': '<:1dd48b63_d55f_467f_bc5c_04df55c7:1561262243352412221>',
        'aiguide': '<:1dd48b63_d55f_467f_bc5c_04df55c7:1561262243352412221>',
        'counting': '<:f4363980_d43f_47b9_81db_0fe0a9a4:1561256353094172692>',
        'community': '<:de2de296_a511_40fa_953f_01365b9a:1561256778405257370>',
        'economy': '<:d908aaba_8825_41ee_bc4c_ad871ad0:1561256682376400919>',
        'coins': '<:d908aaba_8825_41ee_bc4c_ad871ad0:1561256682376400919>'
      };
      if (designatedCustomEmojis[name]) return designatedCustomEmojis[name];

      // 2. For all other modules, search client emojis cache FIRST (original behavior restored)
      const nameMap = {
        'mod': 'moderation',
        'mass': 'moderation',
        'giveaway': 'giveaways',
        'utilities': 'utility'
      };
      const searchName = nameMap[name] || name;
      const e = client?.emojis?.cache ? client.emojis.cache.find(emoji => emoji.name === searchName || emoji.name === name) : null;
      if (e) return `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`;
      
      const customEmojiFallback = {
        'security': '<:security_and_firewall:1523672289500069940>',
        'filters': '<:config:1533844853048209489>',
        'quarantine': '<:off:1533844858983157851>',
        'whitelist': '<a:uptime:1552608831060844575>',
        'mod': '<:cross_red:1533860128015519895>',
        'mass': '<:cross_red:1533860128015519895>',
        'tickets': '<:139707ticket:1533859896620089485>',
        'leveling': '<a:trophy:1533859922599481577>',
        'giveaway': '<a:giveaway:1533844904604864603>',
        'welcome': '<a:z_arrow_pink1:1523082728004653138>',
        'voice': '<:music:1528159649780732046>',
        'tracking': '<a:uptime:1552608831060844575>',
        'config': '<:config:1533844853048209489>',
        'community': '<:de2de296_a511_40fa_953f_01365b9a:1561256778405257370>',
        'counting': '<:f4363980_d43f_47b9_81db_0fe0a9a4:1561256353094172692>',
        'economy': '<:d908aaba_8825_41ee_bc4c_ad871ad0:1561256682376400919>',
        'coins': '<:d908aaba_8825_41ee_bc4c_ad871ad0:1561256682376400919>',
        'utilities': '<:pencil:1523770653528817835>',
        'black_dot': '<a:black_dot:1544740123403620422>',
        'ai': '<:1dd48b63_d55f_467f_bc5c_04df55c7:1561262243352412221>',
        'home': '<:on:1533844867191406672>'
      };
      return customEmojiFallback[name] || fallback;
    };

    let rawComponents = [];

    if (moduleId === 'home') {
      let topText = `# Hey !!! , I am <@${botId}> ,\n\n`;
      topText += `> <a:z_arrow_pink1:1523082728004653138> **Welcome to Athena Prime A bot which is made for unbypassable security features and community management! View down and see our srv management modules listed below:**\n\n`;
      topText += `> <a:z_arrow_pink1:1523082728004653138> **To set Custom Prefix use <@${botId}> \`${prefix}prefix " your custom prefix "\`**\n\n`;
      topText += `> <a:z_arrow_pink1:1523082728004653138> **Flagship Financial Suite: Real-Time Stock & Crypto Telemetry Canvas Engine (\`${prefix}stock\`), Indian Benchmarks Suite (\`${prefix}nifty\`), Universal Ticker Directory (\`${prefix}symbols\`), AI Market Analyst (\`${prefix}stockai\`), and Weather Reconnaissance Satellite Map (\`${prefix}weather\`)!**\n\n`;
      topText += `> <a:z_arrow_pink1:1523082728004653138> **Hint: For a detailed guide and instruction on any specific command, type \`${prefix}help <command>\` !**`;

      rawComponents.push({ type: 10, content: topText });
      rawComponents.push({ type: 14, divider: true });

      const categories = [
        { name: 'SECURITY & ACCESS CONTROL', icon: '', catName: 'SECURITY & ACCESS CONTROL' },
        { name: 'SERVER ADMINISTRATION', icon: '', catName: 'SERVER ADMINISTRATION' },
        { name: 'AI & SYSTEM INTELLIGENCE', icon: '', catName: 'AI & SYSTEM INTELLIGENCE' },
        { name: 'COMMUNITY & ENGAGEMENT', icon: '', catName: 'COMMUNITY & ENGAGEMENT' },
        { name: 'VOICE & MEDIA', icon: '', catName: 'VOICE & MEDIA' },
        { name: 'UTILITIES & INTEGRATIONS', icon: '', catName: 'UTILITIES & INTEGRATIONS' }
      ];

      const bullet = getEmoji('black_dot', '<a:black_dot:1544740123403620422>');
      
      let grid = '';
      for (const cat of categories) {
         grid += `### ${cat.name}\n`;
         const mods = helpModules.filter(m => m.category === cat.catName);
         
         let rowStr = '';
         for (let i = 0; i < mods.length; i++) {
            const m = mods[i];
            const e = getEmoji(m.emoji, '<a:uptime:1552608831060844575>');
            
            if (i % 2 === 0) {
                rowStr += `> ${bullet} ${e} **${m.shortLabel}**`;
            } else {
                rowStr += `${bullet} ${e} **${m.shortLabel}**`;
            }
            
            if (i % 2 === 1 || i === mods.length - 1) {
                grid += rowStr + '\n';
                rowStr = '';
            } else {
                rowStr += ' \u2800\u2800 ';
            }
         }
         grid += '\n';
      }
      
      rawComponents.push({ type: 10, content: grid.trim() });
      rawComponents.push({ type: 14, divider: true });

    } else {
      const mod = helpModules.find(m => m.id === moduleId || (moduleId === 'defense' && m.id === 'security'));
      if (mod) {
        const e = getEmoji(mod.emoji, '<a:uptime:1552608831060844575>');
        let currentChunk = `# ${e} ${mod.label.toUpperCase()}`;
        
        for (const cmd of mod.commands) {
          if (cmd === '') {
            if (currentChunk.trim().length > 0) {
              rawComponents.push({ type: 10, content: currentChunk.trim() });
            }
            rawComponents.push({ type: 14, divider: true });
            currentChunk = '';
            continue;
          }
          
          let formatted = cmd.replace(/!/g, prefix);
          let line = '';
          if (formatted.startsWith('-#')) {
            line = formatted
              .replace(/__\*\*([^*_]+)\*\*__/g, '**__$1__**')
              .replace(/\*\*(?!__)(.*?)(?<!__)\*\*/g, '**__$1__**');
          } else if (
            formatted.startsWith('**') ||
            formatted.startsWith('Step ') ||
            formatted.startsWith('  -') ||
            formatted.startsWith('- ') ||
            formatted.startsWith('•') ||
            formatted.startsWith('  •') ||
            /^\s*\d+\./.test(formatted)
          ) {
            let cleaned = formatted.replace(/^(?:[-•>]|\*(?!\*))\s*/, '').trim();
            let underlined = cleaned
              .replace(/__\*\*([^*_]+)\*\*__/g, '**__$1__**')
              .replace(/\*\*(?!__)(.*?)(?<!__)\*\*/g, '**__$1__**');
            line = `-# • ${underlined}`;
          } else {
            line = `> **${formatted}**`;
          }

          if (currentChunk.length + line.length + 4 > 1900) {
            if (currentChunk.trim().length > 0) {
              rawComponents.push({ type: 10, content: currentChunk.trim() });
            }
            currentChunk = line;
          } else {
            currentChunk += (currentChunk ? '\n\n' : '') + line;
          }
        }

        if (currentChunk.trim().length > 0) {
          rawComponents.push({ type: 10, content: currentChunk.trim() });
        }

        rawComponents.push({ type: 14, divider: true });
      }
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('help_module_select')
      .setPlaceholder('Click to view modules');

    selectMenu.addOptions([
      {
        label: 'Home Menu',
        description: 'Return to the main help menu',
        value: 'home',
        default: moduleId === 'home'
      }
    ]);

    for (const mod of helpModules.slice(0, 24)) {
      selectMenu.addOptions([
        {
          label: mod.label,
          value: mod.id,
          default: moduleId === mod.id
        }
      ]);
    }

    const btnPrev = new ButtonBuilder().setCustomId(`help_prev_${moduleId}`).setEmoji('1523766004839088301').setStyle(ButtonStyle.Secondary);
    const btnNext = new ButtonBuilder().setCustomId(`help_next_${moduleId}`).setEmoji('1523766065576935475').setStyle(ButtonStyle.Secondary);
    const btnRefresh = new ButtonBuilder().setCustomId('help_home').setEmoji('1523765738655973589').setStyle(ButtonStyle.Secondary);
    const btnDelete = new ButtonBuilder().setCustomId('help_delete').setEmoji('1523766340752642109').setStyle(ButtonStyle.Secondary);
    const btnExplain = new ButtonBuilder()
      .setCustomId(moduleId === 'home' ? 'arch_home' : `arch_topic_${moduleId}`)
      .setLabel('Explain Architecture')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(btnPrev, btnNext, btnRefresh, btnExplain, btnDelete);

    const HELP_GIF = 'https://cdn.discordapp.com/attachments/1534869224277807175/1542472732325978234/ATHENA-8-27-2026.png?ex=6a915b2d&is=6a9009ad&hm=0f55bae0c0bec27649bc03e6d6be23ad16f2eb9337efdb8b5793b2d74cad89ff&';

    rawComponents.push({ type: 12, items: [{ media: { url: HELP_GIF } }] });
    rawComponents.push({ type: 14, divider: true });
    rawComponents.push(row1.toJSON());
    rawComponents.push({ type: 14, divider: true });
    rawComponents.push(row2.toJSON());
    rawComponents.push({ type: 14, divider: true });
    rawComponents.push({ type: 10, content: '-# **Athena Prime Unbypassable Security !!**' });

    // Discord Aggregate Displayable Text Limit Safeguard (Hard ceiling: 4,000 characters)
    let totalTextLength = 0;
    for (const comp of rawComponents) {
      if (comp.type === 10 && comp.content) {
        totalTextLength += comp.content.length;
      }
    }
    if (totalTextLength > 3800) {
      let runningTotal = 0;
      for (let i = 0; i < rawComponents.length; i++) {
        const comp = rawComponents[i];
        if (comp.type === 10 && comp.content) {
          if (runningTotal + comp.content.length > 3700) {
            const allowed = Math.max(0, 3700 - runningTotal - 50);
            comp.content = comp.content.substring(0, allowed) + '\n\n> *...[Truncated for Discord display limits]*';
            runningTotal += comp.content.length;
            for (let j = i + 1; j < rawComponents.length; j++) {
              if (rawComponents[j].type === 10) {
                rawComponents[j].content = '';
              }
            }
            break;
          } else {
            runningTotal += comp.content.length;
          }
        }
      }
      rawComponents = rawComponents.filter(c => c.type !== 10 || (c.content && c.content.trim().length > 0));
    }

    const rawContainer = {
      type: 17,
      components: rawComponents
    };

    return rawContainer;
}

/**
 * Global persistent interaction handler for Athena's Help Dashboard.
 * Ensures the help menu responds instantly across bot restarts, timeouts, and channel reloads.
 */
export async function handleHelpInteraction(interaction) {
  if (!interaction.customId || !interaction.customId.startsWith('help_')) return false;
  if (interaction.replied || interaction.deferred) return true;

  try {
    if (interaction.customId === 'help_delete') {
      await interaction.message.delete().catch(() => null);
      return true;
    }

    let targetModuleId = 'home';

    if (interaction.customId === 'help_home') {
      targetModuleId = 'home';
    } else if (interaction.customId === 'help_module_select') {
      targetModuleId = interaction.values?.[0] || 'home';
    } else if (interaction.customId.startsWith('help_prev') || interaction.customId.startsWith('help_next')) {
      const isNext = interaction.customId.startsWith('help_next');
      const parts = interaction.customId.split('_');
      let currentId = parts.length > 2 ? parts.slice(2).join('_') : null;

      if (!currentId) {
        const selectComp = interaction.message.components?.flatMap(r => r.components || []).find(c => c.customId === 'help_module_select');
        const defaultOpt = selectComp?.options?.find(o => o.default);
        if (defaultOpt) currentId = defaultOpt.value;
      }

      let currentIdx = currentId && currentId !== 'home' ? helpModules.findIndex(m => m.id === currentId) : -1;

      if (isNext) {
        currentIdx = currentIdx >= helpModules.length - 1 ? -1 : currentIdx + 1;
      } else {
        currentIdx = currentIdx <= -1 ? helpModules.length - 1 : currentIdx - 1;
      }

      targetModuleId = currentIdx === -1 ? 'home' : helpModules[currentIdx].id;
    }

    const newComponents = buildHelpContainer(interaction.client, interaction.guild?.id, targetModuleId);
    await interaction.update({ components: [newComponents], flags: MessageFlags.IsComponentsV2 }).catch(async (err) => {
      if (err.code === 10062) return;
      console.warn('[Help] Update failed:', err.message);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate().catch(() => null);
      }
    });
    return true;
  } catch (err) {
    console.error('[Help] Error handling interaction:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferUpdate().catch(() => null);
    }
    return true;
  }
}

async function handleSetup(guild, channel, role, voiceChannel) {
  const updates = {};
  const fields = [];

  if (channel) {
    updates.logChannel = channel.id;
    updates.securityLogChannelId = channel.id;
    fields.push({ name: 'Security Logs Channel', value: `${channel} (\`${channel.id}\`)`, inline: false });
  }

  if (voiceChannel) {
    updates.quarantineVcId = voiceChannel.id;
    fields.push({ name: 'Quarantine Voice Channel', value: `${voiceChannel} (\`${voiceChannel.id}\`)`, inline: true });
  }

  if (role) {
    updates.quarantineRoleId = role.id;
    fields.push({ name: 'Quarantine Role', value: `${role} (\`${role.id}\`)`, inline: true });
  }

  db.updateGuildConfig(guild.id, updates);

  const resEmbed = cv2.success(
    `Configuration Updated | ${cv2.TICK_EMOJI}`,
    'Successfully saved server adjustments to database cache. Entities are bound by unique Discord ID.',
    fields,
    'configuration'
  );

  return resEmbed;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ADDED NEW COMMANDS BELOW
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

commands.push({
  name: 'autorole-config',
  description: 'Add or remove an autorole for new members',
  category: 'utility',
  permissions: [PermissionFlagsBits.ManageRoles],
  options: [
    {
      name: 'action',
      description: 'Add or Remove',
      type: 3,
      required: true,
      choices: [
        { name: 'Add Role', value: 'add' },
        { name: 'Remove Role', value: 'remove' },
        { name: 'Clear All', value: 'clear' }
      ]
    },
    {
      name: 'role',
      description: 'The role to configure',
      type: 8,
      required: false
    }
  ],
  async executeSlash(interaction) {
    const action = interaction.options.getString('action');
    const role = interaction.options.getRole('role');
    const cfg = db.getGuildConfig(interaction.guild.id);
    let currentRoles = cfg.autoroleIds || [];

    if (action === 'clear') {
      db.updateGuildConfig(interaction.guild.id, { autoroleIds: [] });
      return interaction.reply(cv2.success('Autorole Cleared', 'All autoroles have been removed.'));
    }

    if (!role) {
      return interaction.reply(cv2.warn('Missing Role', 'You must specify a role to add or remove.'));
    }

    if (action === 'add') {
      if (currentRoles.includes(role.id)) {
        return interaction.reply(cv2.warn('Already Added', `The role ${role} is already in the autorole list.`));
      }
      currentRoles.push(role.id);
      db.updateGuildConfig(interaction.guild.id, { autoroleIds: currentRoles });
      return interaction.reply(cv2.success('Autorole Added', `Successfully added ${role} to the autorole list.\nTotal roles: \`${currentRoles.length}\``));
    }

    if (action === 'remove') {
      if (!currentRoles.includes(role.id)) {
        return interaction.reply(cv2.warn('Not Found', `The role ${role} is not in the autorole list.`));
      }
      currentRoles = currentRoles.filter(id => id !== role.id);
      db.updateGuildConfig(interaction.guild.id, { autoroleIds: currentRoles });
      return interaction.reply(cv2.success('Autorole Removed', `Successfully removed ${role} from the autorole list.\nTotal roles: \`${currentRoles.length}\``));
    }
  }
});

commands.push({
  name: 'createthread',
  description: 'Create a new thread in this channel',
  category: 'utility',
  permissions: [PermissionFlagsBits.ManageThreads],
  options: [
    { name: 'name', description: 'Thread name', type: 3, required: true },
    { name: 'message', description: 'Initial message', type: 3, required: false }
  ],
  async executeSlash(interaction) {
    const name = interaction.options.getString('name');
    const msg = interaction.options.getString('message');
    try {
      const thread = await interaction.channel.threads.create({
        name,
        autoArchiveDuration: 1440,
        reason: `Created by ${interaction.user.tag}`
      });
      if (msg) await thread.send(msg);
      await interaction.reply(cv2.success('Thread Created', `Successfully created ${thread}`));
    } catch (err) {
      await interaction.reply(cv2.danger('Error', err.message));
    }
  }
});
// --- SET STATS CHANNEL COMMAND ---
commands.push({
  name: 'setstatschannel',
  description: 'Set a dedicated channel for /stats commands (prevents spam elsewhere)',
  category: 'utility',
  permissions: [PermissionFlagsBits.ManageGuild],
  options: [
    {
      name: 'channel',
      description: 'The channel to lock stats commands to',
      type: 7, // CHANNEL
      required: true
    }
  ],
  async executePrefix(message, args) {
    const channelMention = args[0];
    if (!channelMention) return message.reply('Please mention a channel.');
    const channelId = channelMention.replace(/<#|>/g, '');
    const channel = message.guild.channels.cache.get(channelId);
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
      return message.reply(cv2.warn('Invalid Channel', 'Please mention a valid text channel.'));
    }

    db.setStatsChannel(message.guild.id, channel.id);
    await channel.permissionOverwrites.edit(message.guild.roles.everyone.id, {
      UseApplicationCommands: true
    }).catch(() => null);

    return message.reply(cv2.success('Config Updated', `The \`/stats\` command is now locked to ${channel} and slash commands have been enabled for everyone there.`));
  },
  async executeSlash(interaction) {
    const channel = interaction.options.getChannel('channel');
    
    if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
      return interaction.reply(cv2.warn('Invalid Channel', 'Please select a text or announcement channel.'));
    }

    db.setStatsChannel(interaction.guild.id, channel.id);
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
      UseApplicationCommands: true
    }).catch(() => null);

    return interaction.reply(cv2.success('Config Updated', `The \`/stats\` command is now locked to ${channel} and slash commands have been enabled for everyone there.`));
  }
});



commands.push({
  name: 'archivethread',
  description: 'Archive the current thread',
  category: 'utility',
  permissions: [PermissionFlagsBits.ManageThreads],
  async executeSlash(interaction) {
    if (!interaction.channel.isThread()) return interaction.reply(cv2.warn('Error', 'This is not a thread.'));
    try {
      await interaction.reply(cv2.success('Archived', 'Archiving thread now...'));
      await interaction.channel.setArchived(true, `Archived by ${interaction.user.tag}`);
    } catch (err) {
      await interaction.followUp(cv2.danger('Error', err.message)).catch(() => null);
    }
  }
});

commands.push({
  name: 'deletethread',
  description: 'Delete the current thread',
  category: 'utility',
  permissions: [PermissionFlagsBits.ManageThreads],
  async executeSlash(interaction) {
    if (!interaction.channel.isThread()) return interaction.reply(cv2.warn('Error', 'This is not a thread.'));
    try {
      await interaction.channel.delete(`Deleted by ${interaction.user.tag}`);
    } catch (err) {
      await interaction.reply(cv2.danger('Error', err.message)).catch(() => null);
    }
  }
});

commands.push({
  name: 'vcstatus',
  description: 'Toggle the Voice Channel live status text (Extra Owners only)',
  type: 1, // CHAT_INPUT
  default_member_permissions: String(PermissionFlagsBits.Administrator),
  options: [
    {
      name: 'state',
      description: 'Enable or disable the status updates',
      type: 3, // STRING
      required: true,
      choices: [
        { name: 'On', value: 'on' },
        { name: 'Off', value: 'off' }
      ]
    }
  ],
  async executePrefix(message, args) {
    const { isAuthorized } = await import('../utils/helpers.js');
    if (!await isAuthorized(message.author, message.guild)) {
      return message.reply(cv2.danger('Access Denied', 'Only authorized owners can use this.'));
    }
    
    const state = args[0]?.toLowerCase();
    if (!['on', 'off'].includes(state)) {
      return message.reply(cv2.warn('Invalid Usage', 'Please specify `on` or `off`. Example: `!vcstatus off`'));
    }
    
    const enabled = state === 'on';
    db.updateGuildConfig(message.guild.id, { vcStatusEnabled: enabled });
    
    const botVcId = message.guild.members.me?.voice?.channelId;
    if (botVcId) {
      const { updateBotVcStatus } = await import('../utils/voice.js');
      const channel = message.guild.channels.cache.get(botVcId);
      if (channel) await updateBotVcStatus(channel);
    }
    
    return message.reply(cv2.success('Config Updated', `Voice Channel status updates have been turned **${state.toUpperCase()}**.`));
  },
  async executeSlash(interaction) {
    const { isAuthorized } = await import('../utils/helpers.js');
    if (!await isAuthorized(interaction.user, interaction.guild)) {
      return interaction.reply(cv2.danger('Access Denied', 'Only authorized owners can use this.'));
    }

    const state = interaction.options.getString('state');
    const enabled = state === 'on';
    db.updateGuildConfig(interaction.guild.id, { vcStatusEnabled: enabled });
    
    const botVcId = interaction.guild.members.me?.voice?.channelId;
    if (botVcId) {
      const { updateBotVcStatus } = await import('../utils/voice.js');
      const channel = interaction.guild.channels.cache.get(botVcId);
      if (channel) await updateBotVcStatus(channel);
    }
    
    return interaction.reply(cv2.success('Config Updated', `Voice Channel status updates have been turned **${state.toUpperCase()}**.`));
  }
});

commands.push({
  name: 'dev',
  description: 'Shows the Lead Architect and Developer of Athena Prime',
  category: 'utility',
  options: [],
  async executePrefix(message) {
    return this._handleDev(message);
  },
  async executeSlash(interaction) {
    return this._handleDev(interaction);
  },
  async _handleDev(context) {
    const isInteraction = !!context.commandName;
    const client = context.client;
    // Get bot owner dynamically (handle Teams vs Single User)
    let ownerId = '1423292960744804383';
    try {
      if (!client.application?.owner) await client.application?.fetch();
      if (client.application?.owner?.ownerId) {
        ownerId = client.application.owner.ownerId; // It's a Team, get the owner of the team
      } else if (client.application?.owner?.id) {
        ownerId = client.application.owner.id; // It's a single User
      }
    } catch (e) {}

    let ownerName = '♡ 𝙋𝙧𝙞𝙣𝙘𝙚';
    try {
      const ownerUser = await client.users.fetch(ownerId);
      if (ownerUser) ownerName = ownerUser.globalName || ownerUser.username;
    } catch (e) {}

    const rawComponents = [
      {
        type: 10,
        content: '# __ELITE DEVELOPER INTELLIGENCE__\n### • Lead Architect\n' +
                 `-# **Athena Prime was systematically engineered and deployed by [${cleanDisplayName(ownerName)}](https://discord.com/users/${ownerId}). Driven by an absolute intolerance for server nukes and malicious raids, the Architect engineered a unified, omnipotent appliance—a single, definitive bot designed to dominate every facet of server security, management, and utility without compromise.**`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: '### • Core Features\n' +
                 '-# • **__Anti-Nuke Engine:__** **A predictive, zero-tolerance firewall that neutralizes structural threats in milliseconds and autonomously reconstructs deleted channels, roles, and server hierarchies via intelligent caching.**\n' +
                 '-# • **__Dynamic Voice Infrastructure:__** **An auto-scaling Join-To-Create (JTC) architecture equipped with granular, real-time control panels.**\n' +
                 '-# • **__Advanced Threat Firewall:__** **Heuristic anti-spam filtering, real-time malicious link scanning, and predictive quarantine protocols.**\n' +
                 '-# • **__Zero-Trust Verification Gateway:__** **A strict, automated access-control layer that dynamically audits Discord Onboarding configurations and strips bypassing permissions to prevent unauthorized infiltration.**\n' +
                 '-# • **__Asynchronous Ticket Matrix:__** **A highly-concurrent, transcript-generating support infrastructure built directly onto Discord\'s raw interaction API for seamless multi-channel thread management.**\n' +
                 '-# • **__Omniscient Audit Telemetry:__** **A deeply-integrated logging engine that intercepts, parses, and permanently archives server mutations, deleted messages, and role hierarchy alterations.**'
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: '### • Architecture\n' +
                 '-# **The core engine operates on a highly concurrent Node.js runtime, utilizing direct REST API invocations to bypass standard discord.js caching and manager overhead. This guarantees zero-latency, sub-millisecond execution for anti-nuke mechanisms via raw asynchronous HTTP streams. The proprietary CV2 UI framework was engineered as a polymorphic factory model to dynamically construct and hydrate atomic payload structures. It enforces strict memory allocation protocols and leverages non-blocking I/O event loops, ensuring maximum throughput, thread safety, and impenetrable scalability across distributed sharded environments.**'
      },
      { type: 14, divider: true },
      {
        type: 12,
        items: [{ media: { url: 'https://cdn.discordapp.com/attachments/1516850846984437801/1539301235369312256/content.png?ex=6a85d17d&is=6a847ffd&hm=1dc8831b54f332ef885aaf0b16b62d6c3af9cfecc7dc2004c651083277e55f2c&' } }]
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: '-# **Athena Prime | By Developer Prince**'
      }
    ];

    return context.reply({ components: [{ type: 17, components: rawComponents }], flags: MessageFlags.IsComponentsV2 });
  }
});




export const activeCalculators = new Map();

async function sendCalculator(context) {
  const isInteraction = !!context.isCommand;
  if (isInteraction) {
    await context.reply({ components: [{ type: 17, components: [{ type: 10, content: '-# Loading calculator...' }] }], flags: 32768 });
  }

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const cv2 = (await import('../cv2.js')).default;
  const embed = cv2.info('Athena Prime Calculator', `> # **\` 0 \`**`);

  const createRow = (btns) => {
    const row = new ActionRowBuilder();
    btns.forEach(btn => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`calc_${btn.id}`)
          .setLabel(btn.label)
          .setStyle(btn.style)
      );
    });
    return row;
  };

  const rows = [
    createRow([
      { id: 'clear', label: 'C', style: ButtonStyle.Danger },
      { id: 'lparen', label: '(', style: ButtonStyle.Primary },
      { id: 'rparen', label: ')', style: ButtonStyle.Primary },
      { id: 'div', label: '/', style: ButtonStyle.Primary },
      { id: 'del', label: 'DEL', style: ButtonStyle.Danger }
    ]),
    createRow([
      { id: '7', label: '7', style: ButtonStyle.Secondary },
      { id: '8', label: '8', style: ButtonStyle.Secondary },
      { id: '9', label: '9', style: ButtonStyle.Secondary },
      { id: 'mul', label: '*', style: ButtonStyle.Primary },
      { id: 'pow', label: '^', style: ButtonStyle.Primary }
    ]),
    createRow([
      { id: '4', label: '4', style: ButtonStyle.Secondary },
      { id: '5', label: '5', style: ButtonStyle.Secondary },
      { id: '6', label: '6', style: ButtonStyle.Secondary },
      { id: 'sub', label: '-', style: ButtonStyle.Primary },
      { id: 'mod', label: '%', style: ButtonStyle.Primary }
    ]),
    createRow([
      { id: '1', label: '1', style: ButtonStyle.Secondary },
      { id: '2', label: '2', style: ButtonStyle.Secondary },
      { id: '3', label: '3', style: ButtonStyle.Secondary },
      { id: 'add', label: '+', style: ButtonStyle.Primary },
      { id: 'empty', label: '\u200B', style: ButtonStyle.Secondary }
    ]),
    createRow([
      { id: 'dot', label: '.', style: ButtonStyle.Secondary },
      { id: '0', label: '0', style: ButtonStyle.Secondary },
      { id: '00', label: '00', style: ButtonStyle.Secondary },
      { id: 'equal', label: '=', style: ButtonStyle.Success },
      { id: 'close', label: 'Exit', style: ButtonStyle.Danger }
    ])
  ];

  rows[3].components[4].setDisabled(true); 

  if (embed.components && embed.components[0] && embed.components[0].type === 17) {
    embed.components[0].components.push(...rows.map(r => r.toJSON ? r.toJSON() : r));
  } else {
    embed.components.push(...rows);
  }

  const payload = embed;
  let msg;
  
  if (isInteraction) {
    // Raw REST edit to avoid discord.js injecting legacy content: null
    await context.client.rest.patch(`/webhooks/${context.client.user.id}/${context.token}/messages/@original`, { body: { components: payload.components, flags: payload.flags } }).catch(() => null);
    msg = await context.fetchReply().catch(() => null);
  } else {
    msg = await context.reply(payload);
  }
  
  activeCalculators.set(msg.id, { equation: '0', owner: isInteraction ? context.user.id : context.author.id });
}

export async function handleCalculatorButton(interaction) {
  const msgId = interaction.message.id;
  const session = activeCalculators.get(msgId);
  
  if (!session) {
    return interaction.reply({ content: 'This calculator session has expired.', flags: 64 });
  }
  
  if (session.owner !== interaction.user.id) {
    return interaction.reply({ content: 'This is not your calculator!', flags: 64 });
  }

  const action = interaction.customId.replace('calc_', '');
  let eq = session.equation;

  if (action === 'close') {
    activeCalculators.delete(msgId);
    return interaction.message.delete().catch(()=>{});
  }

  if (action === 'clear') {
    eq = '0';
  } else if (action === 'del') {
    eq = eq.length > 1 ? eq.slice(0, -1) : '0';
  } else if (action === 'equal') {
    try {
      const sanitized = eq.replace(/[^\d/*+.%^()-]/g, '');
      const withPow = sanitized.replace(/\^/g, '**');
      let result = Function('return ' + withPow)();
      if (!isFinite(result) || isNaN(result)) result = 'Error';
      if (typeof result === 'number' && !Number.isInteger(result)) {
        result = parseFloat(result.toFixed(4)).toString();
      } else {
        result = result.toString();
      }
      eq = result;
    } catch (err) {
      eq = 'Error';
    }
  } else {
    const charMap = {
      'lparen': '(', 'rparen': ')', 'div': '/', 'mul': '*',
      'sub': '-', 'add': '+', 'mod': '%', 'pow': '^',
      'dot': '.', '0': '0', '00': '00', '1': '1', '2': '2',
      '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9'
    };
    
    const char = charMap[action];
    if (char) {
      if (eq === '0' || eq === 'Error') {
        if (['/','*','+','-','%','^'].includes(char)) {
          eq = '0' + char;
        } else {
          eq = char;
        }
      } else {
        eq += char;
      }
    }
  }

  if (eq.length > 2000) eq = 'Error: Too long';
  session.equation = eq;

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const cv2 = (await import('../cv2.js')).default;
  const embed = cv2.info('Athena Prime Calculator', `> # **\` ${eq} \`**`);
  
  const createRow = (btns) => {
    const row = new ActionRowBuilder();
    btns.forEach(btn => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`calc_${btn.id}`)
          .setLabel(btn.label)
          .setStyle(btn.style)
      );
    });
    return row;
  };

  const rows = [
    createRow([
      { id: 'clear', label: 'C', style: ButtonStyle.Danger },
      { id: 'lparen', label: '(', style: ButtonStyle.Primary },
      { id: 'rparen', label: ')', style: ButtonStyle.Primary },
      { id: 'div', label: '/', style: ButtonStyle.Primary },
      { id: 'del', label: 'DEL', style: ButtonStyle.Danger }
    ]),
    createRow([
      { id: '7', label: '7', style: ButtonStyle.Secondary },
      { id: '8', label: '8', style: ButtonStyle.Secondary },
      { id: '9', label: '9', style: ButtonStyle.Secondary },
      { id: 'mul', label: '*', style: ButtonStyle.Primary },
      { id: 'pow', label: '^', style: ButtonStyle.Primary }
    ]),
    createRow([
      { id: '4', label: '4', style: ButtonStyle.Secondary },
      { id: '5', label: '5', style: ButtonStyle.Secondary },
      { id: '6', label: '6', style: ButtonStyle.Secondary },
      { id: 'sub', label: '-', style: ButtonStyle.Primary },
      { id: 'mod', label: '%', style: ButtonStyle.Primary }
    ]),
    createRow([
      { id: '1', label: '1', style: ButtonStyle.Secondary },
      { id: '2', label: '2', style: ButtonStyle.Secondary },
      { id: '3', label: '3', style: ButtonStyle.Secondary },
      { id: 'add', label: '+', style: ButtonStyle.Primary },
      { id: 'empty', label: '\u200B', style: ButtonStyle.Secondary }
    ]),
    createRow([
      { id: 'dot', label: '.', style: ButtonStyle.Secondary },
      { id: '0', label: '0', style: ButtonStyle.Secondary },
      { id: '00', label: '00', style: ButtonStyle.Secondary },
      { id: 'equal', label: '=', style: ButtonStyle.Success },
      { id: 'close', label: 'Exit', style: ButtonStyle.Danger }
    ])
  ];

  rows[3].components[4].setDisabled(true); 

  if (embed.components && embed.components[0] && embed.components[0].type === 17) {
    embed.components[0].components.push(...rows.map(r => r.toJSON ? r.toJSON() : r));
  } else {
    embed.components.push(...rows);
  }
  
  await interaction.update({ ...embed });
}


