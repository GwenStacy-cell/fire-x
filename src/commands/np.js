import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
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
        return message.reply(cv2.warn(
          'Unauthorized Access',
          `You are not an authorized **NP Manager**.\n\n` +
          `> -# ${BULLET_EMOJI} **Clearance Required:** \`Designated NP Manager\` or \`Bot Owner\`\n` +
          `> -# ${BULLET_EMOJI} **System:** Global No-Prefix Management Matrix`
        )).catch(() => null);
      }

      const sub = args[0]?.toLowerCase();

      if (!sub || sub === 'guide' || sub === 'help') {
        return this.sendGuide(message);
      }

      if (sub === 'add') {
        const type = args[1]?.toLowerCase();
        if (type !== 'user' && type !== 'server') {
          return message.reply(cv2.warn(
            'Command Usage',
            `Invalid target type. Please specify \`user\` or \`server\`.\n\n` +
            `> -# ${BULLET_EMOJI} **Grant to User:** \`np add user <@user|id> [duration]\`\n` +
            `> -# ${BULLET_EMOJI} **Grant to Server:** \`np add server <guild_id> [duration]\`\n` +
            `> -# ${BULLET_EMOJI} **Duration Formats:** \`1w\`, \`1m\`, \`30d\`, or \`lifetime\``
          )).catch(() => null);
        }
        
        let targetId = args[2];
        if (!targetId) {
          return message.reply(cv2.warn(
            'Missing Target',
            `Please provide a valid user or server ID/mention.\n\n` +
            `> -# ${BULLET_EMOJI} **Example:** \`np add user @user 30d\`\n` +
            `> -# ${BULLET_EMOJI} **Example:** \`np add server 123456789012345678 lifetime\``
          )).catch(() => null);
        }
        targetId = targetId.replace(/[<@!>]/g, '');

        let durationRaw = args.slice(3).join(' ') || 'lifetime';
        let expiresAt = null;
        if (durationRaw.toLowerCase() !== 'lifetime') {
          const ms = parseDuration(durationRaw);
          if (!ms) {
            return message.reply(cv2.warn(
              'Invalid Duration',
              `The provided duration format is invalid.\n\n` +
              `> -# ${BULLET_EMOJI} **Valid Examples:** \`1d\`, \`1w\`, \`1m\`, \`1y\`, \`lifetime\``
            )).catch(() => null);
          }
          expiresAt = Date.now() + ms;
        }

        if (type === 'user') {
          db.addNpUser(targetId, expiresAt, message.author.id);
          return message.reply(cv2.success(
            'No-Prefix Granted',
            `Successfully granted No-Prefix clearance to User.\n\n` +
            `> -# ${BULLET_EMOJI} **Target Account:** <@${targetId}> (\`${targetId}\`)\n` +
            `> -# ${BULLET_EMOJI} **Duration:** \`${durationRaw}\`\n` +
            `> -# ${BULLET_EMOJI} **Appointed By:** <@${message.author.id}>`
          )).catch(() => null);
        } else {
          db.addNpServer(targetId, expiresAt, message.author.id);
          return message.reply(cv2.success(
            'No-Prefix Granted',
            `Successfully granted No-Prefix clearance to Server.\n\n` +
            `> -# ${BULLET_EMOJI} **Target Server:** \`${targetId}\`\n` +
            `> -# ${BULLET_EMOJI} **Duration:** \`${durationRaw}\`\n` +
            `> -# ${BULLET_EMOJI} **Appointed By:** <@${message.author.id}>`
          )).catch(() => null);
        }
      }

      if (sub === 'reset') {
        const type = args[1]?.toLowerCase();
        if (type !== 'user' && type !== 'server') {
          return message.reply(cv2.warn(
            'Command Usage',
            `Invalid target type. Please specify \`user\` or \`server\`.\n\n` +
            `> -# ${BULLET_EMOJI} **Usage:** \`np reset user <id>\` or \`np reset server <id>\``
          )).catch(() => null);
        }
        
        let targetId = args[2];
        if (!targetId) {
          return message.reply(cv2.warn('Missing Target', 'Please provide a valid user or server ID/mention.')).catch(() => null);
        }
        targetId = targetId.replace(/[<@!>]/g, '');

        if (type === 'user') {
          if (db.removeNpUser(targetId)) {
            return message.reply(cv2.success(
              'No-Prefix Revoked',
              `Revoked No-Prefix clearance from User <@${targetId}> (\`${targetId}\`).`
            )).catch(() => null);
          } else {
            return message.reply(cv2.warn(
              'Status Not Found',
              `User <@${targetId}> (\`${targetId}\`) does not have active No-Prefix clearance.`
            )).catch(() => null);
          }
        } else {
          if (db.removeNpServer(targetId)) {
            return message.reply(cv2.success(
              'No-Prefix Revoked',
              `Revoked No-Prefix clearance from Server \`${targetId}\`.`
            )).catch(() => null);
          } else {
            return message.reply(cv2.warn(
              'Status Not Found',
              `Server \`${targetId}\` does not have active No-Prefix clearance.`
            )).catch(() => null);
          }
        }
      }

      if (sub === 'list' || sub === 'active' || sub === 'users') {
        return this.sendListPanel(message);
      }

      if (sub === 'manager' || sub === 'managers') {
        const action = args[1]?.toLowerCase();
        if (!action || action === 'list') return this.sendManagerList(message);

        if (!isOwner) {
          return message.reply(cv2.danger(
            'Permission Denied',
            'Only the **Bot Owner** has authority to appoint or remove NP Managers.'
          )).catch(() => null);
        }
        
        let targetId = args[2];
        if (!targetId) {
          return message.reply(cv2.warn('Missing Target', 'Please provide a user ID or mention.')).catch(() => null);
        }
        targetId = targetId.replace(/[<@!>]/g, '');

        if (action === 'add') {
          db.addNpManager(targetId);
          return message.reply(cv2.success(
            'NP Manager Added',
            `Appointed <@${targetId}> (\`${targetId}\`) as an authorized NP Manager.`
          )).catch(() => null);
        }
        if (action === 'remove') {
          db.removeNpManager(targetId);
          return message.reply(cv2.success(
            'NP Manager Removed',
            `Removed <@${targetId}> (\`${targetId}\`) from authorized NP Managers.`
          )).catch(() => null);
        }
      }

      if (sub === 'cmds') {
        const action = args[1]?.toLowerCase();
        const cmdName = args[2]?.toLowerCase();
        
        if (action === 'pause') {
          db.setNpPaused(true);
          return message.reply(cv2.warn(
            'NP System Paused',
            `The Global No-Prefix system is now **PAUSED** across all servers.`
          )).catch(() => null);
        }
        if (action === 'unpause') {
          db.setNpPaused(false);
          return message.reply(cv2.success(
            'NP System Resumed',
            `The Global No-Prefix system is now **ACTIVE** across all servers.`
          )).catch(() => null);
        }
        
        if (!cmdName) {
          return message.reply(cv2.warn(
            'Command Usage',
            `Usage: \`np cmds ban <command>\` or \`np cmds unban <command>\``
          )).catch(() => null);
        }

        if (action === 'ban') {
          if (db.banNpCommand(cmdName)) {
            return message.reply(cv2.warn(
              'Command Banned',
              `Banned command \`${cmdName}\` from No-Prefix execution.`
            )).catch(() => null);
          } else {
            return message.reply(cv2.warn(
              'Already Banned',
              `Command \`${cmdName}\` is already banned from No-Prefix bypass.`
            )).catch(() => null);
          }
        }
        if (action === 'unban') {
          if (db.unbanNpCommand(cmdName)) {
            return message.reply(cv2.success(
              'Command Unbanned',
              `Restored No-Prefix execution for command \`${cmdName}\`.`
            )).catch(() => null);
          } else {
            return message.reply(cv2.warn(
              'Not Banned',
              `Command \`${cmdName}\` is not currently banned.`
            )).catch(() => null);
          }
        }
      }

      if (sub === 'show' || sub === 'check') {
        let targetId = args[1];
        if (!targetId) targetId = message.author.id;
        targetId = targetId.replace(/[<@!>]/g, '');

        const npUser = db.getNpUser(targetId);
        if (!npUser) {
          return message.reply(cv2.warn(
            'Status Not Found',
            `User <@${targetId}> (\`${targetId}\`) does not have No-Prefix status.`
          )).catch(() => null);
        }
        
        let expStr = 'Lifetime (Never Expires)';
        if (npUser.expiresAt) {
          expStr = `<t:${Math.floor(npUser.expiresAt/1000)}:R>`;
        }
        return message.reply(cv2.success(
          'No-Prefix Status',
          `No-Prefix credentials verified for <@${targetId}>.\n\n` +
          `> -# ${BULLET_EMOJI} **Account:** <@${targetId}> (\`${targetId}\`)\n` +
          `> -# ${BULLET_EMOJI} **Expiration:** ${expStr}\n` +
          `> -# ${BULLET_EMOJI} **Appointed By:** <@${npUser.appointedBy}>`
        )).catch(() => null);
      }

      // Fallback
      return this.sendGuide(message);
    },

    async sendListPanel(message) {
      const users = db.getAllNpUsers();
      const servers = db.getAllNpServers();

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

      const comps = [];
      comps.push({ type: 10, content: `# ${getRandomHeadingGlyph()} Global No-Prefix Status Panel | ${TICK_EMOJI}` });
      comps.push({ type: 14, divider: true });
      
      comps.push({ type: 10, content: `# ${getRandomHeadingGlyph()} **Granted Users (${userLines.length})**\n` + (userLines.join('\n\n') || '**None**') });
      comps.push({ type: 10, content: `# ${getRandomHeadingGlyph()} **Granted Servers (${serverLines.length})**\n` + (serverLines.join('\n\n') || '**None**') });
      comps.push({ type: 10, content: `# ${getRandomHeadingGlyph()} **Banned Users (0)**\n**None**` });
      
      comps.push({ type: 14, divider: true });
      comps.push({ type: 10, content: '-# **Athena Bulletproof Security !!!**' });

      await message.reply({ components: [{ type: 17, accent_color: 0x5865F2, components: comps }], flags: MessageFlags.IsComponentsV2 });
    },

    async sendManagerList(message) {
      const managers = db.getNpManagers();
      let lines = [];
      
      for (let i = 0; i < managers.length; i++) {
        const id = managers[i];
        lines.push(`**${i+1}.** <@${id}> ( \`${id}\` ) — Active •`);
      }

      const comps = [];
      comps.push({ type: 10, content: `# ${getRandomHeadingGlyph()} NP Managers Directory | ${TICK_EMOJI}\n-# **Active & Configured Global NP Managers**` });
      comps.push({ type: 14, divider: true });
      comps.push({ type: 10, content: lines.join('\n') || 'No NP Managers configured.' });
      comps.push({ type: 14, divider: true });
      comps.push({ type: 10, content: '-# **Athena Bulletproof Security !!!**' });

      await message.reply({ components: [{ type: 17, accent_color: 0x5865F2, components: comps }], flags: MessageFlags.IsComponentsV2 });
    },

    async sendGuide(message) {
      const buildGuideContainer = (page) => {
        const comps = [];
        
        comps.push({ type: 10, content: `# ${getRandomHeadingGlyph()} NP Manager Guide (Page ${page}/2) | ${TICK_EMOJI}\n-# Official Control & Analytics Guide for NP Managers` });
        comps.push({ type: 14, divider: true });
        
        if (page === 1) {
          comps.push({ type: 10, content: `# ${getRandomHeadingGlyph()} **NP Access Management**\n> \`np add user <@user | id> [duration]\` — Grant No-Prefix to user\n> \`np add server <guild_id> [duration]\` — Grant No-Prefix to server\n> \`np reset user <id>\` — Remove No-Prefix from user\n> \`np reset server <id>\` — Remove No-Prefix from server\n> \`np list\` / \`np active\` — View global active NP users & servers\n\n# ${getRandomHeadingGlyph()} **Command Ban Controls**\n> \`np cmds ban <command>\` — Ban a command from NP\n> \`np cmds unban <command>\` — Unban a command from NP\n> \`np cmds pause\` / \`unpause\` — Pause or unpause NP system\n\n# ${getRandomHeadingGlyph()} **Bot Server Assets**\n> \`!setguildavatar <url | attachment>\` — Set server bot avatar\n> \`!setguildbanner <url | attachment>\` — Set server bot banner` });
        } else {
          comps.push({ type: 10, content: `# ${getRandomHeadingGlyph()} **Bot Growth & Analytics Commands**\n> \`bjoins\` / \`bjoin\` / \`botjoins\` — View recent bot join statistics\n> \`bleaves\` / \`bleave\` / \`botleaves\` — View recent bot leave statistics\n> \`bsummary\` / \`bjoinssummary\` / \`bgrowth\` — View bot join & growth summary\n> \`bcmds\` / \`bcmd\` / \`botcmds\` — View command usage analytics & execution logs\n> \`btopcmds\` / \`btop\` / \`bcmdusers\` — View top executed commands & active users\n> \`bservers\` / \`bmem\` / \`bping\` — View active bot servers, memory & latency\n\n# ${getRandomHeadingGlyph()} **View & Inspection Controls**\n> \`ss\` / \`security status\` — View security status (View Only)\n> \`np actions [@user]\` — View audit log of manager actions\n> \`np manager list\` / \`np manager\` — View active NP Managers\n> \`np check <@user | id>\` — Check a specific user\'s NP status\n\n**Restrictions:** Cannot restart the bot, modify NP Managers, or edit security settings.` });
        }

        comps.push({ type: 14, divider: true });

        const btnPrev = new ButtonBuilder().setCustomId('np_guide_prev').setLabel('<').setStyle(ButtonStyle.Secondary).setDisabled(page === 1);
        const btnNext = new ButtonBuilder().setCustomId('np_guide_next').setLabel('>').setStyle(ButtonStyle.Secondary).setDisabled(page === 2);
        const btnDel = new ButtonBuilder().setCustomId('np_guide_del').setLabel('Close').setStyle(ButtonStyle.Secondary);
        
        const row = new ActionRowBuilder().addComponents(btnPrev, btnNext, btnDel);
        comps.push(row.toJSON());
        
        comps.push({ type: 14, divider: true });
        comps.push({ type: 10, content: '-# **Athena Bulletproof Security !!!**' });

        return { type: 17, accent_color: 0x5865F2, components: comps };
      };

      const reply = await message.reply({ components: [buildGuideContainer(1)], flags: MessageFlags.IsComponentsV2 });

      const collector = reply.createMessageComponentCollector({ time: 300000 });
      let page = 1;

      collector.on('collect', async (i) => {
        if (i.user.id !== message.author.id) {
          return i.reply({ ...cv2.warn('Interaction Restricted', 'You cannot use these pagination controls.'), flags: MessageFlags.Ephemeral });
        }
        
        if (i.customId === 'np_guide_del') {
          return reply.delete().catch(() => null);
        }

        if (i.customId === 'np_guide_next') page = 2;
        if (i.customId === 'np_guide_prev') page = 1;

        await i.update({ components: [buildGuideContainer(page)], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      });

      collector.on('end', () => {
        const staticContainer = buildGuideContainer(page);
        staticContainer.components = staticContainer.components.filter(c => c.type !== 1);
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
      if (!db.isNpManager(message.author.id) && !isBotOwnerSync(message.author.id)) {
        return message.reply(cv2.warn('Unauthorized Access', 'You are not an authorized NP Manager.')).catch(() => null);
      }
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
      if (!db.isNpManager(message.author.id) && !isBotOwnerSync(message.author.id)) {
        return message.reply(cv2.warn('Unauthorized Access', 'You are not an authorized NP Manager.')).catch(() => null);
      }
      
      const memory = process.memoryUsage();
      const memStr = `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`;
      const servers = message.client.guilds.cache.size;
      const ping = message.client.ws.ping;
      
      message.reply(cv2.info('Bot System Metrics', `> -# ${BULLET_EMOJI} **Servers:** \`${servers}\`\n> -# ${BULLET_EMOJI} **Memory:** \`${memStr}\`\n> -# ${BULLET_EMOJI} **Latency:** \`${ping}ms\``));
    }
  }
];
