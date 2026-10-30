import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { isBotOwnerSync, parseDuration } from '../utils/helpers.js';

export const commands = [
  {
    name: 'np',
    aliases: ['noprefix'],
    description: 'Global No-Prefix Management System',
    category: 'security',
    permissions: [],
    async executePrefix(message, args) {
      const isOwner = isBotOwnerSync(message.author.id);
      const isManager = db.isNpManager(message.author.id);
      
      if (!isOwner && !isManager) {
        return message.reply({ content: '-# You are not an authorized NP Manager.' }).catch(() => null);
      }

      const sub = args[0]?.toLowerCase();

      if (!sub || sub === 'guide' || sub === 'help') {
        return this.sendGuide(message);
      }

      if (sub === 'add') {
        const type = args[1]?.toLowerCase();
        if (type !== 'user' && type !== 'server') return message.reply({ content: '-# **Usage:** `np add user <@user|id> [duration]` or `np add server <id> [duration]`' });
        
        let targetId = args[2];
        if (!targetId) return message.reply({ content: '-# Provide an ID or mention.' });
        targetId = targetId.replace(/[<@!>]/g, '');

        let durationRaw = args.slice(3).join(' ') || 'lifetime';
        let expiresAt = null;
        if (durationRaw.toLowerCase() !== 'lifetime') {
          const ms = parseDuration(durationRaw);
          if (!ms) return message.reply({ content: '-# Invalid duration. Use formats like `1w`, `1m`, `lifetime`.' });
          expiresAt = Date.now() + ms;
        }

        if (type === 'user') {
          db.addNpUser(targetId, expiresAt, message.author.id);
          return message.reply({ content: `No-Prefix Granted | <a:03_tick_circle:1565665642084827206>\n-# Successfully granted No-Prefix to User \`${targetId}\` for \`${durationRaw}\`.` });
        } else {
          db.addNpServer(targetId, expiresAt, message.author.id);
          return message.reply({ content: `No-Prefix Granted | <a:03_tick_circle:1565665642084827206>\n-# Successfully granted No-Prefix to Server \`${targetId}\` for \`${durationRaw}\`.` });
        }
      }

      if (sub === 'reset') {
        const type = args[1]?.toLowerCase();
        if (type !== 'user' && type !== 'server') return message.reply({ content: '-# **Usage:** `np reset user <id>` or `np reset server <id>`' });
        
        let targetId = args[2];
        if (!targetId) return message.reply({ content: '-# Provide an ID or mention.' });
        targetId = targetId.replace(/[<@!>]/g, '');

        if (type === 'user') {
          if (db.removeNpUser(targetId)) return message.reply({ content: `No-Prefix Revoked | <a:03_tick_circle:1565665642084827206>\n-# Revoked No-Prefix from User \`${targetId}\`.` });
          else return message.reply({ content: `-# User \`${targetId}\` does not have No-Prefix.` });
        } else {
          if (db.removeNpServer(targetId)) return message.reply({ content: `No-Prefix Revoked | <a:03_tick_circle:1565665642084827206>\n-# Revoked No-Prefix from Server \`${targetId}\`.` });
          else return message.reply({ content: `-# Server \`${targetId}\` does not have No-Prefix.` });
        }
      }

      if (sub === 'list' || sub === 'active' || sub === 'users') {
        return this.sendListPanel(message);
      }

      if (sub === 'manager' || sub === 'managers') {
        const action = args[1]?.toLowerCase();
        if (!action || action === 'list') return this.sendManagerList(message);

        if (!isOwner) return message.reply({ content: 'Only the Bot Owner can modify NP Managers.' });
        
        let targetId = args[2];
        if (!targetId) return message.reply({ content: 'Provide a user ID.' });
        targetId = targetId.replace(/[<@!>]/g, '');

        if (action === 'add') {
          db.addNpManager(targetId);
          return message.reply({ content: `NP Manager Added | <a:03_tick_circle:1565665642084827206>\n-# User \`${targetId}\` is now an NP Manager.` });
        }
        if (action === 'remove') {
          db.removeNpManager(targetId);
          return message.reply({ content: `NP Manager Removed | <a:03_tick_circle:1565665642084827206>\n-# User \`${targetId}\` is no longer an NP Manager.` });
        }
      }

      if (sub === 'cmds') {
        const action = args[1]?.toLowerCase();
        const cmdName = args[2]?.toLowerCase();
        
        if (action === 'pause') {
          db.setNpPaused(true);
          return message.reply({ content: `NP System Paused | <a:03_tick_circle:1565665642084827206>\n-# NP System is now PAUSED globally.` });
        }
        if (action === 'unpause') {
          db.setNpPaused(false);
          return message.reply({ content: `NP System Active | <a:03_tick_circle:1565665642084827206>\n-# NP System is now ACTIVE globally.` });
        }
        
        if (!cmdName) return message.reply({ content: '-# **Usage:** `np cmds ban/unban <command>`' });

        if (action === 'ban') {
          if (db.banNpCommand(cmdName)) return message.reply({ content: `Command Banned | <a:03_tick_circle:1565665642084827206>\n-# Banned command \`${cmdName}\` from NP bypass.` });
          else return message.reply({ content: `-# Command \`${cmdName}\` is already banned.` });
        }
        if (action === 'unban') {
          if (db.unbanNpCommand(cmdName)) return message.reply({ content: `Command Unbanned | <a:03_tick_circle:1565665642084827206>\n-# Unbanned command \`${cmdName}\` from NP bypass.` });
          else return message.reply({ content: `-# Command \`${cmdName}\` is not banned.` });
        }
      }

      if (sub === 'show' || sub === 'check') {
        let targetId = args[1];
        if (!targetId) targetId = message.author.id;
        targetId = targetId.replace(/[<@!>]/g, '');

        const npUser = db.getNpUser(targetId);
        if (!npUser) return message.reply({ content: `-# User \`${targetId}\` does not have NP status.` });
        
        let expStr = 'Lifetime (Expires: Never)';
        if (npUser.expiresAt) {
          expStr = `<t:${Math.floor(npUser.expiresAt/1000)}:R>`;
        }
        return message.reply({ content: `No-Prefix Status | <a:03_tick_circle:1565665642084827206>\n-# User \`${targetId}\` has NP status.\n-# **Expires:** ${expStr}\n-# **Appointed by:** <@${npUser.appointedBy}>` });
      }

      // Fallback
      return this.sendGuide(message);
    },

    async sendListPanel(message) {
      const users = db.getAllNpUsers();
      const servers = db.getAllNpServers();
      const banned = db.getNpBannedCommands(); // Using this as placeholder for banned users if needed

      let userLines = [];
      let i = 1;
      for (const [id, data] of Object.entries(users)) {
        if (data.expiresAt && Date.now() > data.expiresAt) {
          db.removeNpUser(id);
          continue;
        }
        
        let durStr = 'Lifetime';
        let expStr = '(Expires: Never)';
        if (data.expiresAt) {
          const hoursLeft = Math.max(1, Math.floor((data.expiresAt - Date.now()) / (1000 * 60 * 60)));
          if (hoursLeft > 24) durStr = `${Math.floor(hoursLeft/24)} Days`;
          else durStr = `${hoursLeft} Hours`;
          expStr = `(Expires: in ${durStr})`;
        }

        userLines.push(`**${i}.** <@${id}> ( \`${id}\` ) — **${durStr}**\n${expStr}`);
        i++;
      }

      let serverLines = [];
      i = 1;
      for (const [id, data] of Object.entries(servers)) {
        if (data.expiresAt && Date.now() > data.expiresAt) {
          db.removeNpServer(id);
          continue;
        }
        
        let durStr = 'Lifetime';
        let expStr = '(Expires: Never)';
        if (data.expiresAt) {
          const hoursLeft = Math.max(1, Math.floor((data.expiresAt - Date.now()) / (1000 * 60 * 60)));
          if (hoursLeft > 24) durStr = `${Math.floor(hoursLeft/24)} Days`;
          else durStr = `${hoursLeft} Hours`;
          expStr = `(Expires: in ${durStr})`;
        }
        serverLines.push(`**${i}.** Server \`${id}\` — **${durStr}**\n${expStr}`);
        i++;
      }

      const cfg = db.getGuildConfig(message.guild?.id || '0');
            const comps = [];
      comps.push({ type: 10, content: `# GLOBAL NO-PREFIX STATUS PANEL` });
      comps.push({ type: 14, divider: true });
      
      comps.push({ type: 10, content: `## **Granted Users (${userLines.length})**\n` + (userLines.join('\n\n') || '**None**') });
      comps.push({ type: 10, content: `## **Granted Servers (${serverLines.length})**\n` + (serverLines.join('\n\n') || '**None**') });
      comps.push({ type: 10, content: `## **Banned Users (0)**\n**None**` });
      
      comps.push({ type: 14, divider: true });
      comps.push({ type: 10, content: '-# **Athena Bulletproof Security !!!**' });

      await message.reply({ components: [{ type: 17, components: comps }], flags: MessageFlags.IsComponentsV2 });
    },

    async sendManagerList(message) {
      const managers = db.getNpManagers();
      let lines = [];
      
      for (let i = 0; i < managers.length; i++) {
        const id = managers[i];
        lines.push(`**${i+1}.** <@${id}>\n( \`${id}\` ) — Active •`);
      }

      const cfg = db.getGuildConfig(message.guild?.id || '0');
            const comps = [];
      comps.push({ type: 10, content: `# NP Managers List\n## **Active & Configured NP Managers**` });
      comps.push({ type: 14, divider: true });
      comps.push({ type: 10, content: lines.join('\n') || 'No NP Managers configured.' });
      comps.push({ type: 14, divider: true });
      comps.push({ type: 10, content: '-# **Athena Bulletproof Security !!!**' });

      await message.reply({ components: [{ type: 17, components: comps }], flags: MessageFlags.IsComponentsV2 });
    },

    async sendGuide(message) {
      const cfg = db.getGuildConfig(message.guild?.id || '0');
            const buildGuideContainer = (page) => {
        const comps = [];
        
        comps.push({ type: 10, content: `# NP Manager Guide (Page ${page}/2)\nOfficial Control & Analytics Guide for NP Managers` });
        comps.push({ type: 14, divider: true });
        
        if (page === 1) {
          comps.push({ type: 10, content: '## **NP Access Management**\n> `np add user <@user | id> [duration]` — Grant No-Prefix to user\n> `np add server <guild_id> [duration]` — Grant No-Prefix to server\n> `np reset user <id>` — Remove No-Prefix from user\n> `np reset server <id>` — Remove No-Prefix from server\n> `np list` / `np active` — View global active NP users & servers\n\n## **Command Ban Controls**\n> `np cmds ban <command>` — Ban a command from NP\n> `np cmds unban <command>` — Unban a command from NP\n> `np cmds pause` / `unpause` — Pause or unpause NP system\n\n## **Bot Server Assets**\n> `!setguildavatar <url | attachment>` — Set server bot avatar\n> `!setguildbanner <url | attachment>` — Set server bot banner' });
        } else {
          comps.push({ type: 10, content: '## **Bot Growth & Analytics Commands**\n> `bjoins` / `bjoin` / `botjoins` — View recent bot join statistics\n> `bleaves` / `bleave` / `botleaves` — View recent bot leave statistics\n> `bsummary` / `bjoinssummary` / `bgrowth` — View bot join & growth summary\n> `bcmds` / `bcmd` / `botcmds` — View command usage analytics & execution logs\n> `btopcmds` / `btop` / `bcmdusers` — View top executed commands & active users\n> `bservers` / `bmem` / `bping` — View active bot servers, memory & latency\n\n## **View & Inspection Controls**\n> `ss` / `security status` — View security status (View Only)\n> `np actions [@user]` — View audit log of manager actions\n> `np manager list` / `np manager` — View active NP Managers\n> `np check <@user | id>` — Check a specific user\'s NP status\n\n**Restrictions:** Cannot restart the bot, modify NP Managers, or edit security settings.' });
        }

        comps.push({ type: 14, divider: true });

        const btnPrev = new ButtonBuilder().setCustomId('np_guide_prev').setLabel('<').setStyle(ButtonStyle.Secondary).setDisabled(page === 1);
        const btnNext = new ButtonBuilder().setCustomId('np_guide_next').setLabel('>').setStyle(ButtonStyle.Secondary).setDisabled(page === 2);
        const btnDel = new ButtonBuilder().setCustomId('np_guide_del').setLabel('Close').setStyle(ButtonStyle.Secondary);
        
        const row = new ActionRowBuilder().addComponents(btnPrev, btnNext, btnDel);
        comps.push(row.toJSON());
        
        comps.push({ type: 14, divider: true });
        comps.push({ type: 10, content: '-# **Athena Bulletproof Security !!!**' });

        return { type: 17, components: comps };
      };

      const reply = await message.reply({ components: [buildGuideContainer(1)], flags: MessageFlags.IsComponentsV2 });

      const collector = reply.createMessageComponentCollector({ time: 300000 });
      let page = 1;

      collector.on('collect', async (i) => {
        if (i.user.id !== message.author.id) {
          return i.reply({ content: 'You cannot use these buttons.', flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        
        if (i.customId === 'np_guide_del') {
          return reply.delete().catch(() => null);
        }

        if (i.customId === 'np_guide_next') page = 2;
        if (i.customId === 'np_guide_prev') page = 1;

        await i.update({ components: [buildGuideContainer(page)], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      });

      collector.on('end', () => {
        // Just remove the interactive buttons, keep the rest
        const staticContainer = buildGuideContainer(page);
        staticContainer.components = staticContainer.components.filter(c => c.type !== 1); // strip rows
        reply.edit({ components: [staticContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      });
    }
  },
  
  // =====================================
  // ANALYTICS STUBS (PREFIX-LESS SUPPORT)
  // =====================================
  {
    name: 'bcmds',
    aliases: ['bcmd', 'botcmds'],
    description: 'View command usage analytics',
    category: 'security',
    permissions: [],
    async executePrefix(message) {
      if (!db.isNpManager(message.author.id) && !isBotOwnerSync(message.author.id)) return;
      const stats = db.cache.botAnalytics?.cmds || {};
      const sorted = Object.entries(stats).sort((a,b) => b[1] - a[1]).slice(0, 10);
      const lines = sorted.map((s, i) => `**${i+1}.** \`${s[0]}\` — ${s[1]} uses`);
      
      message.reply(cv2.info('Top 10 Global Command Usage', lines.join('\n') || 'No commands tracked yet.'));
    }
  },
  {
    name: 'bservers',
    aliases: ['bmem', 'bping'],
    description: 'View active bot servers and memory',
    category: 'security',
    permissions: [],
    async executePrefix(message) {
      if (!db.isNpManager(message.author.id) && !isBotOwnerSync(message.author.id)) return;
      
      const memory = process.memoryUsage();
      const memStr = `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`;
      const servers = message.client.guilds.cache.size;
      const ping = message.client.ws.ping;
      
      message.reply(cv2.info('Bot System Metrics', `> **Servers:** ${servers}\n> **Memory:** ${memStr}\n> **Latency:** ${ping}ms`));
    }
  }
];
