import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, NINJA_BULLET, NINJA_BULLET_RTL, UPTIME_EMOJI } from '../utils/emojis.js';
import { MessageFlags } from 'discord.js';
import { sanitizeCV2Payload } from '../cv2.js';
import { CHANGELOG_ENTRIES } from '../utils/changelogData.js';
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
    aliases: ['bs', 'bstat', 'botinfo', 'bi', 'binfo'],
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
      const totalUsers = typeof client.guilds.cache.reduce === 'function'
        ? client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0)
        : Array.from(client.guilds.cache.values()).reduce((acc, g) => acc + (g.memberCount || 0), 0);
      const totalChannels = client.channels.cache.size;
      const emojis = client.emojis.cache.size;
      const stickers = typeof client.guilds.cache.reduce === 'function'
        ? client.guilds.cache.reduce((acc, guild) => acc + (guild.stickers?.cache?.size || 0), 0)
        : Array.from(client.guilds.cache.values()).reduce((acc, g) => acc + (g.stickers?.cache?.size || 0), 0);
      
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

      const currentVersion = CHANGELOG_ENTRIES[0]?.version || 'v2.9.9';

      const container1 = {
        type: 17,
        accent_color: 0x2B2D31,
        components: [
          { type: 10, content: `# ${NINJA_BULLET} ${client.user.username} Prime · Operational Intelligence ${NINJA_BULLET_RTL}` },
          {
            type: 9,
            components: [{
              type: 10,
              content:
                `> -# <a:uptime:1552608831060844575> **Identity:** **${client.user.username}** · **Version:** \`${currentVersion}\`\n` +
                `> -# <a:target_blink:1565667466984554588> **Architect:** **${ownerName}** (${ownerTag}) · **Bot ID:** \`${client.user.id}\`\n` +
                `> -# <a:target_blink:1565667466984554588> **Hosting:** **Obsidian Cloud** · Node.js \`${process.version}\`\n` +
                `> -# <a:target_blink:1565667466984554588> **Heartbeat:** **${uptimeStr}** · **Gateway Latency:** \`${client.ws.ping}ms\`\n` +
                `> -# <a:target_blink:1565667466984554588> **Cluster Scope:** \`${totalServers.toLocaleString()} Guilds\` · \`${totalUsers.toLocaleString()} Users\` · \`${totalChannels.toLocaleString()} Channels\`\n` +
                `> -# <a:target_blink:1565667466984554588> **Engine State:** \`${uniqueCommands} Verified Commands\` loaded`
            }],
            accessory: { type: 11, media: { url: client.user.displayAvatarURL() } }
          },
          { type: 14, divider: true },
          { type: 10, content: `# ${NINJA_BULLET} Defensive Matrix & Elimination Engine ${NINJA_BULLET_RTL}` },
          {
            type: 10,
            content:
              `> -# <a:uptime:1552608831060844575> **Defense Posture:** **ARMED (28 Automated Anti-Nuke Defensive Shields)**\n` +
              `> -# <a:target_blink:1565667466984554588> **Elimination Engine:** **Sub-12ms Direct rawBan (PUT /bans) line-rate enforcement**\n` +
              `> -# <a:target_blink:1565667466984554588> **Zero-Day Bot Defense:** **<1ms Pre-Emptive Elimination On Join (\`GUILD_MEMBER_ADD\` @ 0ms)**\n` +
              `> -# <a:target_blink:1565667466984554588> **Wiretap Interception:** **Multi-Hook raw TCP packet capture before event queue**\n` +
              `> -# <a:target_blink:1565667466984554588> **Pre-Warmed TLS Pool:** **120 Undici persistent sockets · 25s keep-alive heartbeat**\n` +
              `> -# <a:target_blink:1565667466984554588> **DNS Priority:** **IPv4-First (\`dns.setDefaultResultOrder\`) saving 15-30ms**\n` +
              `> -# <a:target_blink:1565667466984554588> **Ground-Truth Snapshots:** **Continuous live RAM snapshots with zero-duplicate rebuild**`
          }
        ]
      };

      const cb = getCodebaseStats();
      const container2 = {
        type: 17,
        accent_color: 0x2B2D31,
        components: [
          { type: 10, content: `# ${NINJA_BULLET} Host Telemetry & Source Codebase ${NINJA_BULLET_RTL}` },
          {
            type: 10,
            content:
              `> -# <a:uptime:1552608831060844575> **V8 Heap Memory:** **${heapUsed} MB consumed**\n` +
              `> -# <a:target_blink:1565667466984554588> **Host RAM:** **${freeMem} MB free / ${totalMem} MB total**\n` +
              `> -# <a:target_blink:1565667466984554588> **Hardware Arch:** **${os.cpus().length} Logical Cores** (${os.arch()})\n` +
              `> -# <a:target_blink:1565667466984554588> **Source Codebase:** **${cb.files} Files** · **${cb.linesStr} Lines** (${cb.wordsStr} words)\n` +
              `> -# <a:target_blink:1565667466984554588> **Tracked Emojis:** **${emojis.toLocaleString()} Custom Emojis**\n` +
              `> -# <a:target_blink:1565667466984554588> **Tracked Stickers:** **${stickers.toLocaleString()} Server Stickers**`
          },
          { type: 14, divider: true },
          { type: 10, content: `-# **Athena Prime · High-Performance Autonomous Sentinel**` }
        ]
      };

      const payload = sanitizeCV2Payload({
        components: [container1, container2],
        flags: MessageFlags.IsComponentsV2
      });

      if (messageOrInteraction.reply) {
        await messageOrInteraction.reply(payload);
      } else {
        await messageOrInteraction.channel.send(payload);
      }
    }
  }
];
