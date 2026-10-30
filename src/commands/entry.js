import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  MessageFlags, 
  ChannelType 
} from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { isServerAdmin, isBotOwnerSync, getBotOwnerIds } from '../utils/helpers.js';

export const commands = [
  {
    name: 'entry',
    aliases: ['gate', 'screening', 'gatekeeper', 'serverentry'],
    description: 'Server Join Application & Gatekeeper system with Bot Owner Remote Acceptance.',
    category: 'security',
    async executePrefix(message, args) {
      const isBotOwner = isBotOwnerSync(message.author.id);
      const isDM = !message.guild;

      // DM Access is strictly for Bot Owner
      if (isDM && !isBotOwner) {
        return message.reply(cv2.danger('Access Denied', 'Remote Join Application management is restricted exclusively to the Bot Owner.'));
      }

      // In guild, non-bot-owners must be extra owners or server owner
      if (!isDM && !isBotOwner && !isServerAdmin(message.member, message.guild)) {
        return message.reply(cv2.danger('Access Denied', 'Only Extra Owners or the Server Owner can configure Server Join Applications.'));
      }

      const subcommand = args[0]?.toLowerCase() || 'status';

      // ==========================================
      // ⚡ BOT OWNER REMOTE SUPERPOWERS (ANY SERVER)
      // ==========================================
      if (subcommand === 'remote') {
        if (!isBotOwner) {
          return message.reply(cv2.danger('Access Denied', 'The remote delivery toggle is restricted exclusively to the Bot Owner.'));
        }
        const stateArg = args[1]?.toLowerCase();
        if (stateArg === 'on' || stateArg === 'enable') {
          db.setBotOwnerEntryRemote(true);
          return message.reply(cv2.success('Remote Delivery Enabled | <a:03_tick_circle:1565665642084827206>', '<a:uptime:1552608831060844575> Real-time DM review cards will be delivered to your DMs for **every join application across all servers**.'));
        } else if (stateArg === 'off' || stateArg === 'disable') {
          db.setBotOwnerEntryRemote(false);
          return message.reply(cv2.warn('Remote Delivery Disabled', 'You will no longer receive automatic DM cards for server join applications.'));
        } else {
          const current = db.isBotOwnerEntryRemote();
          return message.reply(cv2.info('Bot Owner Remote Setting', `<a:uptime:1552608831060844575> Remote DM Cards across all servers are currently **${current ? 'ENABLED' : 'DISABLED'}**.\n\nUse \`!entry remote on\` or \`!entry remote off\` to toggle.`));
        }
      }

      // ==========================================
      // LIST PENDING APPLICATIONS
      // ==========================================
      if (subcommand === 'list') {
        let targetGuildId = message.guild?.id || null;
        let isGlobal = false;

        if (isBotOwner) {
          if (args[1]?.toLowerCase() === 'all' || (isDM && !args[1])) {
            isGlobal = true;
          } else if (args[1] && /^\d{17,20}$/.test(args[1])) {
            targetGuildId = args[1];
          }
        }

        const pending = isGlobal 
          ? db.getPendingEntryApps('all') 
          : (targetGuildId ? db.getPendingEntryApps(targetGuildId) : {});

        const keys = Object.keys(pending);
        if (keys.length === 0) {
          return message.reply(cv2.info('No Pending Applications', '<a:uptime:1552608831060844575> There are currently no pending join applications under review.'));
        }

        const embed = {
          type: 17,
          components: [
            { type: 10, content: `# ${getRandomHeadingGlyph()} Pending Join Applications | <a:03_tick_circle:1565665642084827206>` },
            { type: 14, divider: true },
            { type: 10, content: `<a:uptime:1552608831060844575> Total pending applications: **${keys.length}**` },
            { type: 14, divider: true }
          ]
        };

        let count = 0;
        for (const [key, app] of Object.entries(pending)) {
          if (count >= 10) {
            embed.components.push({ type: 10, content: `*-# ...and ${keys.length - 10} more applications.*` });
            break;
          }
          const gName = app.guildName || message.client.guilds.cache.get(app.guildId)?.name || app.guildId;
          const timeAgo = `<t:${Math.floor(app.submittedAt / 1000)}:R>`;
          embed.components.push({
            type: 10,
            content: `**${count + 1}.** <@${app.userId}> (\`${app.userId}\`)\n> **Server:** ${gName} (\`${app.guildId}\`)\n> **Submitted:** ${timeAgo}`
          });
          count++;
        }

        embed.components.push({ type: 14, divider: true });
        embed.components.push({
          type: 10,
          content: `-# Use \`!entry accept <userId> [guildId]\` or \`!entry deny <userId> [guildId]\` to process applications.`
        });

        return message.reply({ components: [embed], flags: MessageFlags.IsComponentsV2 });
      }

      // ==========================================
      // ACCEPT APPLICATION REMOTELY / LOCALLY
      // ==========================================
      if (subcommand === 'accept') {
        const targetUserId = args[1]?.replace(/[<@!>]/g, '');
        if (!targetUserId || !/^\d{17,20}$/.test(targetUserId)) {
          return message.reply(cv2.warn('Invalid Usage', 'Usage: `!entry accept <userId> [guildId] [reason]`'));
        }

        let targetGuildId = message.guild?.id || null;
        let reason = 'Application approved by staff';

        // Check if 2nd arg is guild ID
        if (args[2] && /^\d{17,20}$/.test(args[2])) {
          if (!isBotOwner && args[2] !== message.guild?.id) {
            return message.reply(cv2.danger('Access Denied', 'Cross-server remote application management is restricted exclusively to the Bot Owner.'));
          }
          targetGuildId = args[2];
          if (args[3]) reason = args.slice(3).join(' ');
        } else {
          if (args[2]) reason = args.slice(2).join(' ');
        }

        // Auto-locate application across any server if Bot Owner didn't specify guildId
        let pendingApp = db.getPendingEntryApp(targetGuildId, targetUserId);
        if (!pendingApp && isBotOwner && !targetGuildId) {
          pendingApp = db.getPendingEntryApp(null, targetUserId);
          if (pendingApp) targetGuildId = pendingApp.guildId;
        }

        if (!targetGuildId) {
          return message.reply(cv2.danger('Error', 'Could not determine the target server for this application. Please specify the Guild ID.'));
        }

        const targetGuild = message.client.guilds.cache.get(targetGuildId);
        if (!targetGuild) {
          return message.reply(cv2.danger('Server Not Found', `Bot is not in server with ID \`${targetGuildId}\`.`));
        }

        const entryCfg = db.getEntryConfig(targetGuildId);
        const member = targetGuild.members.cache.get(targetUserId) || await targetGuild.members.fetch(targetUserId).catch(() => null);

        if (!member) {
          db.deletePendingEntryApp(targetGuildId, targetUserId);
          return message.reply(cv2.warn('Member Not Found', `User \`${targetUserId}\` is no longer in **${targetGuild.name}**. Application removed.`));
        }

        try {
          // 1. Grant Verified Role
          if (entryCfg.verifiedRoleId) {
            const vRole = targetGuild.roles.cache.get(entryCfg.verifiedRoleId);
            if (vRole && member.manageable) {
              await member.roles.add(vRole, `Entry Application Approved by ${message.author.tag}`);
            }
          }

          // 2. Remove Holding Role
          if (entryCfg.holdingRoleId) {
            const hRole = targetGuild.roles.cache.get(entryCfg.holdingRoleId);
            if (hRole && member.roles.cache.has(hRole.id) && member.manageable) {
              await member.roles.remove(hRole, `Entry Application Approved by ${message.author.tag}`).catch(() => null);
            }
          }

          // 3. Delete from Pending Database
          db.deletePendingEntryApp(targetGuildId, targetUserId);

          // 4. Notify Applicant via DM
          member.send(cv2.success(
            `Application Accepted | <a:03_tick_circle:1565665642084827206>`,
            `<a:uptime:1552608831060844575> Your join application for **${targetGuild.name}** has been **ACCEPTED**!\n\n**Reviewer Note:** ${reason}\n\nWelcome to the community!`
          )).catch(() => null);

          return message.reply(cv2.success(
            `Application Accepted | <a:03_tick_circle:1565665642084827206>`,
            `<a:uptime:1552608831060844575> Successfully accepted <@${targetUserId}> (\`${targetUserId}\`) into **${targetGuild.name}** remotely.\n> **Roles Updated:** Verified role granted & holding role removed.\n> **Reviewer Note:** ${reason}`
          ));
        } catch (err) {
          return message.reply(cv2.danger('Execution Error', `Failed to apply roles: ${err.message}`));
        }
      }

      // ==========================================
      // DENY APPLICATION REMOTELY / LOCALLY
      // ==========================================
      if (subcommand === 'deny' || subcommand === 'reject') {
        const targetUserId = args[1]?.replace(/[<@!>]/g, '');
        if (!targetUserId || !/^\d{17,20}$/.test(targetUserId)) {
          return message.reply(cv2.warn('Invalid Usage', 'Usage: `!entry deny <userId> [guildId] [reason]`'));
        }

        let targetGuildId = message.guild?.id || null;
        let reason = 'Application did not meet requirements';

        if (args[2] && /^\d{17,20}$/.test(args[2])) {
          if (!isBotOwner && args[2] !== message.guild?.id) {
            return message.reply(cv2.danger('Access Denied', 'Cross-server remote application management is restricted exclusively to the Bot Owner.'));
          }
          targetGuildId = args[2];
          if (args[3]) reason = args.slice(3).join(' ');
        } else {
          if (args[2]) reason = args.slice(2).join(' ');
        }

        let pendingApp = db.getPendingEntryApp(targetGuildId, targetUserId);
        if (!pendingApp && isBotOwner && !targetGuildId) {
          pendingApp = db.getPendingEntryApp(null, targetUserId);
          if (pendingApp) targetGuildId = pendingApp.guildId;
        }

        if (!targetGuildId) {
          return message.reply(cv2.danger('Error', 'Could not determine the target server for this application. Please specify the Guild ID.'));
        }

        const targetGuild = message.client.guilds.cache.get(targetGuildId);
        if (!targetGuild) {
          return message.reply(cv2.danger('Server Not Found', `Bot is not in server with ID \`${targetGuildId}\`.`));
        }

        const member = targetGuild.members.cache.get(targetUserId) || await targetGuild.members.fetch(targetUserId).catch(() => null);

        try {
          if (member) {
            // Notify applicant
            await member.send(cv2.danger(
              'Application Denied',
              `Your join application for **${targetGuild.name}** was **DENIED**.\n\n**Reason:** ${reason}`
            )).catch(() => null);

            if (member.kickable) {
              await member.kick(`Join Application Denied by ${message.author.tag}: ${reason}`).catch(() => null);
            }
          }

          db.deletePendingEntryApp(targetGuildId, targetUserId);

          return message.reply(cv2.success(
            `Application Denied | <a:03_tick_circle:1565665642084827206>`,
            `<a:uptime:1552608831060844575> Successfully denied <@${targetUserId}> (\`${targetUserId}\`) from **${targetGuild.name}**.\n> **Reason:** ${reason}\n> **Action:** User notified and kicked.`
          ));
        } catch (err) {
          return message.reply(cv2.danger('Execution Error', `Failed to deny application: ${err.message}`));
        }
      }

      // ==========================================
      // LOCAL GUILD CONFIGURATION SUBCOMMANDS
      // (Only within a guild context)
      // ==========================================
      if (isDM && !['list', 'accept', 'deny', 'remote'].includes(subcommand)) {
        return message.reply(cv2.warn('Guild Configuration', 'To configure server channels and roles for `!entry`, run this command inside the target server.'));
      }

      const guildId = message.guild.id;
      const config = db.getEntryConfig(guildId);

      // --- ENABLE / DISABLE ---
      if (subcommand === 'enable' || subcommand === 'on') {
        db.updateEntryConfig(guildId, { enabled: true });
        return message.reply(cv2.success('Server Entry Gate Enabled | <a:03_tick_circle:1565665642084827206>', '<a:uptime:1552608831060844575> Server Join Application & Gatekeeper system is now **ACTIVE**.'));
      }

      if (subcommand === 'disable' || subcommand === 'off') {
        db.updateEntryConfig(guildId, { enabled: false });
        return message.reply(cv2.warn('Server Entry Gate Disabled', 'Server Join Application & Gatekeeper system has been deactivated.'));
      }

      // --- BIND GATE CHANNEL ---
      if (subcommand === 'channel' || subcommand === 'gatechannel') {
        const targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
        if (!targetChannel) return message.reply(cv2.warn('Usage', '`!entry channel <#channel>` — Channel where users submit applications.'));
        db.updateEntryConfig(guildId, { gateChannelId: targetChannel.id });
        return message.reply(cv2.success('Gate Channel Bound | <a:03_tick_circle:1565665642084827206>', `<a:uptime:1552608831060844575> Gatekeeper channel set to <#${targetChannel.id}>.`));
      }

      // --- BIND REVIEW LOG CHANNEL ---
      if (subcommand === 'log' || subcommand === 'logchannel') {
        const targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
        if (!targetChannel) return message.reply(cv2.warn('Usage', '`!entry log <#channel>` — Channel where staff reviews applications.'));
        db.updateEntryConfig(guildId, { logChannelId: targetChannel.id });
        return message.reply(cv2.success('Review Log Bound | <a:03_tick_circle:1565665642084827206>', `<a:uptime:1552608831060844575> Local staff review channel set to <#${targetChannel.id}>.`));
      }

      // --- BIND VERIFIED MEMBER ROLE ---
      if (subcommand === 'role' || subcommand === 'verifiedrole') {
        const targetRole = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
        if (!targetRole) return message.reply(cv2.warn('Usage', '`!entry role <@role>` — Role granted when an application is accepted.'));
        db.updateEntryConfig(guildId, { verifiedRoleId: targetRole.id });
        return message.reply(cv2.success('Verified Role Bound | <a:03_tick_circle:1565665642084827206>', `<a:uptime:1552608831060844575> Role to grant upon approval set to <@&${targetRole.id}>.`));
      }

      // --- BIND HOLDING / UNVERIFIED ROLE ---
      if (subcommand === 'holding' || subcommand === 'holdingrole') {
        if (args[1]?.toLowerCase() === 'none' || args[1]?.toLowerCase() === 'clear') {
          db.updateEntryConfig(guildId, { holdingRoleId: null });
          return message.reply(cv2.success('Holding Role Cleared | <a:03_tick_circle:1565665642084827206>', 'Holding role removed. Users will not receive a temporary quarantine role upon joining.'));
        }
        const targetRole = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
        if (!targetRole) return message.reply(cv2.warn('Usage', '`!entry holding <@role>` or `!entry holding none` — Role assigned to new joiners before acceptance.'));
        db.updateEntryConfig(guildId, { holdingRoleId: targetRole.id });
        return message.reply(cv2.success('Holding Role Bound | <a:03_tick_circle:1565665642084827206>', `<a:uptime:1552608831060844575> Holding role for new joiners set to <@&${targetRole.id}>.`));
      }

      // --- DEPLOY APPLY BUTTON ---
      if (subcommand === 'deploy') {
        const targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]) || (config.gateChannelId ? message.guild.channels.cache.get(config.gateChannelId) : null);
        if (!targetChannel) {
          return message.reply(cv2.warn('Missing Gate Channel', 'Please specify a channel: `!entry deploy <#channel>` or set one first with `!entry channel <#channel>`.'));
        }

        const applyBtn = new ButtonBuilder()
          .setCustomId('btn_entry_apply')
          .setLabel('Submit Join Application')
          .setStyle(ButtonStyle.Success);
        const row = new ActionRowBuilder().addComponents(applyBtn);

        const deployEmbed = {
          type: 17,
          components: [
            { type: 10, content: `# ${getRandomHeadingGlyph()} Server Join Application | <a:03_tick_circle:1565665642084827206>` },
            { type: 14, divider: true },
            { type: 10, content: `Welcome to **${message.guild.name}**!\n\nTo maintain security and verify all members before granting server access, you must submit a brief join application.` },
            { type: 10, content: `> Please click the button below to answer the application questions honestly. Staff will review your submission and grant your roles shortly.` },
            { type: 14, divider: true },
            row.toJSON()
          ]
        };

        await targetChannel.send({ components: [deployEmbed], flags: MessageFlags.IsComponentsV2 });
        db.updateEntryConfig(guildId, { gateChannelId: targetChannel.id, enabled: true });
        return message.reply(cv2.success('Gatekeeper Deployed | <a:03_tick_circle:1565665642084827206>', `<a:uptime:1552608831060844575> Join application panel successfully deployed to <#${targetChannel.id}> and system **ENABLED**.`));
      }

      // --- QUESTIONS MANAGER ---
      if (subcommand === 'questions' || subcommand === 'q') {
        const currentQ = config.questions || [];

        const embed = {
          type: 17,
          components: [
            { type: 10, content: `# ${getRandomHeadingGlyph()} Entry Questions Configuration | <a:03_tick_circle:1565665642084827206>` },
            { type: 14, divider: true },
            { type: 10, content: `Configure the questions users must answer when applying to join **${message.guild.name}**.\n*(Maximum 5 questions enforced by Discord Modals)*` },
            { type: 14, divider: true }
          ]
        };

        if (currentQ.length > 0) {
          embed.components.push({ type: 10, content: `### Current Questionnaire (${currentQ.length}/5):` });
          currentQ.forEach((q, i) => {
            embed.components.push({ type: 10, content: `**${i + 1}.** ${q}` });
          });
          embed.components.push({ type: 14, divider: true });
        } else {
          embed.components.push({ type: 10, content: `*-# No questions configured yet.*` });
          embed.components.push({ type: 14, divider: true });
        }

        const btnAdd = new ButtonBuilder().setCustomId('entry_mngr_add_q').setLabel('Add Question').setStyle(ButtonStyle.Primary).setDisabled(currentQ.length >= 5);
        const btnClear = new ButtonBuilder().setCustomId('entry_mngr_clear_q').setLabel('Clear All Questions').setStyle(ButtonStyle.Danger);
        const btnClose = new ButtonBuilder().setCustomId('entry_mngr_close').setLabel('Done').setStyle(ButtonStyle.Secondary);
        const row = new ActionRowBuilder().addComponents(btnAdd, btnClear, btnClose);

        embed.components.push(row.toJSON());
        const reply = await message.reply({ components: [embed], flags: MessageFlags.IsComponentsV2 });

        const collector = reply.createMessageComponentCollector({ time: 300000 });
        collector.on('collect', async i => {
          if (i.user.id !== message.author.id) {
            return i.reply({ content: 'Only the command executor can use this panel.', ephemeral: true });
          }

          if (i.customId === 'entry_mngr_close') {
            await i.message.delete().catch(() => null);
            return;
          }

          if (i.customId === 'entry_mngr_clear_q') {
            db.updateEntryConfig(guildId, { questions: [] });
            return i.update(cv2.success('Questions Cleared | <a:03_tick_circle:1565665642084827206>', 'All application questions have been cleared. Run `!entry questions` to add new ones.'));
          }

          if (i.customId === 'entry_mngr_add_q') {
            const modal = new ModalBuilder().setCustomId('modal_entry_add_q').setTitle('Add Entry Question');
            const input = new TextInputBuilder()
              .setCustomId('entry_q_text')
              .setLabel('Question Text')
              .setStyle(TextInputStyle.Short)
              .setMaxLength(45)
              .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return i.showModal(modal);
          }
        });
        return;
      }

      // ==========================================
      // DEFAULT: SYSTEM STATUS OVERVIEW
      // ==========================================
      const gateCh = config.gateChannelId ? `<#${config.gateChannelId}>` : '`Not Set`';
      const logCh = config.logChannelId ? `<#${config.logChannelId}>` : '`Not Set`';
      const vRole = config.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : '`Not Set`';
      const hRole = config.holdingRoleId ? `<@&${config.holdingRoleId}>` : '`None`';
      const pendingCount = Object.keys(db.getPendingEntryApps(guildId)).length;
      const isRemoteActive = db.isBotOwnerEntryRemote();

      const statusEmbed = {
        type: 17,
        components: [
          { type: 10, content: `# ${getRandomHeadingGlyph()} Server Join Application Gatekeeper | <a:03_tick_circle:1565665642084827206>` },
          { type: 14, divider: true },
          { 
            type: 10, 
            content: `**Operational Status:** ${config.enabled ? '`ACTIVE & SCREENING` <a:03_tick_circle:1565665642084827206>' : '`DISABLED`'}\n` +
                     `**Gate Channel:** ${gateCh}\n` +
                     `**Review Log Channel:** ${logCh}\n` +
                     `**Holding Role:** ${hRole}\n` +
                     `**Verified Role:** ${vRole}\n` +
                     `**Configured Questions:** \`${(config.questions || []).length}/5\`\n` +
                     `**Pending Applications:** \`${pendingCount}\`\n` +
                     (isBotOwner ? `**Bot Owner Remote Delivery:** ${isRemoteActive ? '`ENABLED (Global DMs)`' : '`DISABLED`'}\n` : '')
          },
          { type: 14, divider: true },
          { 
            type: 10, 
            content: `### Setup & Control Commands:\n` +
                     `<a:uptime:1552608831060844575> \`!entry channel <#channel>\` — Set gatekeeper apply channel\n` +
                     `<a:uptime:1552608831060844575> \`!entry log <#channel>\` — Set staff review channel\n` +
                     `<a:uptime:1552608831060844575> \`!entry role <@role>\` — Set role granted on acceptance\n` +
                     `<a:uptime:1552608831060844575> \`!entry holding <@role/none>\` — Set temporary unverified role\n` +
                     `<a:uptime:1552608831060844575> \`!entry questions\` — Add or edit questionnaire\n` +
                     `<a:uptime:1552608831060844575> \`!entry deploy\` — Deploy join application panel\n` +
                     `<a:uptime:1552608831060844575> \`!entry list\` — View pending applications\n` +
                     `<a:uptime:1552608831060844575> \`!entry accept <userId>\` — Approve applicant\n` +
                     `<a:uptime:1552608831060844575> \`!entry deny <userId>\` — Reject & kick applicant\n` +
                     (isBotOwner ? `<a:uptime:1552608831060844575> \`!entry remote [on/off]\` — Toggle Bot Owner Global DM Delivery\n` : '')
          },
          { type: 14, divider: true }
        ]
      };

      return message.reply({ components: [statusEmbed], flags: MessageFlags.IsComponentsV2 });
    }
  }
];
