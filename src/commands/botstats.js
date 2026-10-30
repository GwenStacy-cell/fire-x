import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { MessageFlags } from 'discord.js';
import db from '../database.js';
import os from 'os';
import path from 'path';
import fs from 'fs';

let cachedCodebaseStats = null;

function getCodebaseStats() {
  if (cachedCodebaseStats) return cachedCodebaseStats;
  
  let stats = { files: 0, js: 0, json: 0, md: 0, lines: 0, words: 0 };
  
  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (['node_modules', '.git', 'data', '.vscode', '.idea'].includes(file)) continue;
      
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else {
          const ext = path.extname(file).toLowerCase();
          if (['.js', '.json', '.md'].includes(ext)) {
            stats.files++;
            if (ext === '.js') stats.js++;
            else if (ext === '.json') stats.json++;
            else if (ext === '.md') stats.md++;
            
            const content = fs.readFileSync(fullPath, 'utf8');
            stats.lines += content.split('\n').length;
            stats.words += content.split(/\s+/).length;
          }
        }
      } catch (e) {}
    }
  }
  
  try {
    scanDir(process.cwd());
    // Format large numbers
    stats.linesStr = stats.lines.toLocaleString();
    stats.wordsStr = "~" + (Math.round(stats.words / 1000) * 1000).toLocaleString();
    cachedCodebaseStats = stats;
  } catch (e) {
    cachedCodebaseStats = { files: 184, js: 180, json: 3, md: 1, linesStr: '41,006', wordsStr: '~295,000' };
  }
  return cachedCodebaseStats;
}

export const commands = [
  {
    name: 'botstats',
    description: 'View advanced bot statistics and information',
    aliases: ['botinfo', 'bi', 'binfo'],
    category: 'utility',
    
    async executePrefix(message) {
      await this.execute(message);
    },

    async execute(messageOrInteraction) {
      const client = messageOrInteraction.client;
      const uptime = Math.floor(process.uptime());
      const d = Math.floor(uptime / 86400);
      const h = Math.floor((uptime % 86400) / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const s = uptime % 60;
      const uptimeStr = `${d}d ${h}h ${m}m ${s}s`;

      const memory = process.memoryUsage();
      const heapUsed = (memory.heapUsed / 1024 / 1024).toFixed(2);
      const freeMem = (os.freemem() / 1024 / 1024).toFixed(0);
      const totalMem = (os.totalmem() / 1024 / 1024).toFixed(0);
      
      const totalServers = client.guilds.cache.size;
      const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
      const totalChannels = client.channels.cache.size;
      const emojis = client.emojis.cache.size;
      const stickers = client.guilds.cache.reduce((acc, guild) => acc + guild.stickers.cache.size, 0);
      
      const botAnalytics = db.cache.botAnalytics || { joins: 0, leaves: 0, cmds: {} };
      
      // True command count
      let uniqueCommands = 85;
      try {
        const { commandMap } = await import('./loader.js');
        if (commandMap) uniqueCommands = new Set(commandMap.values()).size;
      } catch (e) {}

      let ownerTag = `<@1509084068619489331>`; // Default fallback
      let ownerName = `Dev Prince`;
      try {
        if (!client.application.owner) await client.application.fetch();
        const owner = client.application.owner;
        if (owner) {
          if (owner.members) {
            ownerTag = `<@${owner.ownerId}>`;
          } else {
            ownerTag = `<@${owner.id}>`;
            ownerName = owner.username;
          }
        }
      } catch (e) {}

      const container1 = {
        type: 17,
        components: [
          { type: 10, content: `# ${getRandomHeadingGlyph()} **${client.user.username} Information.**` },
          {
            type: 9,
            components: [{
              type: 10,
              content: `-# **Name :** **${client.user.username}**\n-# **Bot ID :** **${client.user.id}**\n-# **Owner :** **${ownerName}**\n-# **Owner ID :** ${ownerTag}\n-# **Hosting Partner :** **Obsidian Hosting**\n-# **Uptime :** **${uptimeStr}**\n-# **Ping :** **${client.ws.ping}ms**`
            }],
            accessory: { type: 11, media: { url: client.user.displayAvatarURL() } }
          },
          { type: 10, content: `# ${getRandomHeadingGlyph()} **Server & User Stats**` },
          {
            type: 10,
            content: `-# **Total Servers :** **${totalServers.toLocaleString()}**\n-# **Total Users :** **${totalUsers.toLocaleString()}**\n-# **Total Channels :** **${totalChannels.toLocaleString()}**\n-# **Emojis Tracked :** **${emojis.toLocaleString()}**\n-# **Stickers Tracked :** **${stickers.toLocaleString()}**\n-# **Total Commands :** **${uniqueCommands}**\n-# **Daily Usage :** **Active**`
          }
        ]
      };

      const container2 = {
        type: 17,
        components: [
          { type: 10, content: `# ${getRandomHeadingGlyph()} **Active Modules**` },
          {
            type: 10,
            content: `-# **Defense & AntiNuke :** **Active (${totalServers} Servers Enabled)**\n-# **AutoLogging System :** **Active (21 Log Categories)**\n-# **AutoMod Engine :** **Active (Anti-Spam & Honeypot)**\n-# **Ticket Management :** **Active (Panels & Transcripts)**\n-# **Giveaway System :** **Active (Auto-Roll & Reroll)**\n-# **Reaction & Activity Roles :** **Active (Auto-Assign & VC)**\n-# **Custom Triggers & AutoResponder :** **Active (Prefix & Keywords)**\n-# **Voice & VC Controls :** **Active (J2C & Panel Controls)**\n-# **Leveling & XP System :** **Active (XP Gain & Rewards)**\n-# **YouTube & Media Notifications :** **Active (Auto-Post & Feeds)**\n-# **Backup & Restore Manager :** **Active (Server Cloner & Backups)**\n-# **Blacklist & Quarantine :** **Active (User & Domain Protection)**`
          }
        ]
      };

      const cb = getCodebaseStats();
      const container3 = {
        type: 17,
        components: [
          { type: 10, content: `# ${getRandomHeadingGlyph()} **System Resources**` },
          {
            type: 10,
            content: `-# **Node.js :** **${process.version}**\n-# **Discord.js :** **v14.14.1**\n-# **Heap Memory :** **${heapUsed} MB**\n-# **Free RAM :** **${freeMem}/${totalMem} MB**\n-# **CPU Cores :** **${os.cpus().length} Cores**\n-# **Architecture :** **${os.arch()}**`
          },
          { type: 10, content: `# ${getRandomHeadingGlyph()} **Codebase**` },
          {
            type: 10,
            content: `-# **Total Files :** **${cb.files}**\n-# **Total Languages :** **1 (JavaScript)**\n-# **JS Files :** **${cb.js} JS**\n-# **JSON Configs :** **${cb.json}**\n-# **Markdown Docs :** **${cb.md}**\n-# **Total Lines :** **${cb.linesStr}**\n-# **Total Words :** **${cb.wordsStr}**`
          }
        ]
      };

      const payload = {
        components: [container1, container2, container3],
        flags: MessageFlags.IsComponentsV2
      };

      if (messageOrInteraction.reply) {
        await messageOrInteraction.reply(payload);
      } else {
        await messageOrInteraction.channel.send(payload);
      }
    }
  }
];
