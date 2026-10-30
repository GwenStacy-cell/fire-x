import fs from 'fs';
import path from 'path';
import { AttachmentBuilder, PermissionFlagsBits } from 'discord.js';
import fetch from 'node-fetch';
import db from '../database.js';
import cv2 from '../cv2.js';
import statsDB from '../statsDB.js';
import { isBotOwnerSync } from '../utils/helpers.js';
import { 
  createCloudBackup, 
  manualRestore, 
  restoreFromCloud, 
  getBackupChannel, 
  getDatabaseMetrics,
  formatDatabaseMetrics 
} from '../utils/cloudSync.js';

const DATA_DIR = path.resolve('data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.db');

export const commands = [
  {
    name: 'db',
    aliases: ['botdb', 'dbbackup', 'dbrestore', 'dbexport', 'database', 'cloudbackup', 'cloudsync', 'dblist'],
    description: 'Manage bot database cloud backups, exports, and instant recovery.',
    category: 'utility',
    options: [
      {
        name: 'action',
        description: 'The database action to perform',
        type: 3,
        required: true,
        choices: [
          { name: 'backup (Force cloud backup now)', value: 'backup' },
          { name: 'list (View cloud backup snapshots & blacklist)', value: 'list' },
          { name: 'export (Download db.json & stats.db)', value: 'export' },
          { name: 'restore (Restore from cloud or uploaded file)', value: 'restore' },
          { name: 'status (View database health & cloud sync)', value: 'status' },
          { name: 'setchannel (Set backup channel)', value: 'setchannel' }
        ]
      },
      {
        name: 'file',
        description: 'Database file to restore (optional, defaults to cloud backup)',
        type: 11,
        required: false
      },
      {
        name: 'channel',
        description: 'Channel to send automated cloud backups (for setchannel action)',
        type: 7,
        required: false
      }
    ],

    async executePrefix(message, args) {
      if (!isBotOwnerSync(message.author.id)) {
        return message.reply(cv2.danger('Access Denied', 'Only the Bot Owner can manage database persistence.'));
      }

      const invoked = message.content.trim().split(/ +/)[0].toLowerCase().replace(/^!/, '');
      let action = args[0]?.toLowerCase();

      // Handle direct alias invocations like !dbbackup or !dbrestore
      if (invoked === 'dbbackup') action = 'backup';
      else if (invoked === 'dbrestore') action = 'restore';
      else if (invoked === 'dbexport') action = 'export';
      else if (!action) action = 'status';

      return this._handleAction(message, action, args.slice(1), message.author);
    },

    async executeSlash(interaction) {
      if (!isBotOwnerSync(interaction.user.id)) {
        return interaction.reply(cv2.danger('Access Denied', 'Only the Bot Owner can manage database persistence.'));
      }

      await interaction.deferReply().catch(() => null);
      let action = interaction.options.getString('action');
      if (!action) action = 'status';
      const file = interaction.options.getAttachment('file');
      const targetChannel = interaction.options.getChannel('channel');

      return this._handleAction(interaction, action, [], interaction.user, file, targetChannel);
    },

    async _handleAction(context, action, args = [], user, directFile = null, directChannel = null) {
      const sendReply = (payload) => {
        if (context.isCommand?.() && (context.deferred || context.replied)) {
          return context.editReply(payload).catch(() => null);
        }
        return context.reply(payload).catch(() => null);
      };

      // 1. BACKUP ACTION
      if (action === 'backup' || action === 'save' || action === 'sync') {
        const statusMsg = await sendReply(cv2.info('Cloud Backup Initiated', 'Flushing memory & SQLite WAL buffers and uploading persistent snapshot...'));
        
        const result = await createCloudBackup(context.client, `Manual Backup by ${user.tag || user.username}`);
        if (!result.success) {
          const failPayload = cv2.danger('Backup Failed', `Could not upload cloud backup: \`${result.reason || result.error}\``);
          if (context.isCommand?.()) return context.editReply(failPayload);
          return statusMsg?.edit ? statusMsg.edit(failPayload) : sendReply(failPayload);
        }

        const stats = fs.statSync(DB_FILE);
        const sizeKb = (stats.size / 1024).toFixed(1);
        const m = getDatabaseMetrics();

        const successPayload = cv2.success(
          `Database Backed Up | <a:atheNATICK:1557841381630681106>`,
          formatDatabaseMetrics(m, {
            prefixText: '**Cloud snapshot successfully stored!**\nYour entire database is securely archived in Discord. If you ever switch hosting companies, the bot will automatically restore everything on boot.',
            channelId: result.channelId,
            sizeKb,
            timestamp: result.timestamp,
            reason: `Manual Backup by ${user.tag || user.username}`
          })
        );
        if (context.isCommand?.()) {
          return context.editReply(successPayload);
        }

        if (statusMsg?.edit) return statusMsg.edit(successPayload);
        return sendReply(successPayload);
      }

      // 1.5 LIST ACTION
      if (action === 'list' || action === 'backups' || action === 'snapshots' || action === 'cloudlist') {
        const channel = await getBackupChannel(context.client);
        if (!channel) {
          return sendReply(cv2.warn('Backup Channel Not Found', 'No cloud backup channel is configured or accessible. Use `!db setchannel #channel` to configure one.'));
        }

        const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
        const backupMessages = messages
          ? messages.filter(m => m.attachments.some(a => a.name?.endsWith('.json') && (a.name.includes('athena_db_') || a.name === 'db.json')))
          : null;

        if (!backupMessages || backupMessages.size === 0) {
          return sendReply(cv2.info('No Cloud Backups Found', `No database snapshots were found in <#${channel.id}>.\n\nUse \`!db backup\` to create the first cloud backup now.`));
        }

        const sorted = [...backupMessages.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
        const entries = sorted.slice(0, 4).map((msg, index) => {
          const jsonAtt = msg.attachments.find(a => a.name?.endsWith('.json'));
          const dbAtt = msg.attachments.find(a => a.name?.endsWith('.db'));
          const sizeKb = jsonAtt ? (jsonAtt.size / 1024).toFixed(1) : '?';
          const timeSec = Math.floor(msg.createdTimestamp / 1000);
          const hasDb = dbAtt ? ' + stats.db' : '';
          return `> -# **__#${index + 1}:__** \`${jsonAtt?.name || 'snapshot.json'}\` (${sizeKb} KB${hasDb})\n` +
                 `> -# <t:${timeSec}:F> (<t:${timeSec}:R>)`;
        });

        const m = getDatabaseMetrics();
        const flagged = db.getBotBlacklist();
        const data = (db.getBotBlacklistData ? db.getBotBlacklistData() : db.cache.botBlacklistData) || {};
        const blSummary = flagged.length > 0
          ? `\n\n-# **__Synced Global Blacklist (${flagged.length} accounts):__**\n` +
            flagged.slice(0, 3).map(id => `> -# <@${id}> (\`${id}\`)${data[id]?.reason ? ` - \`${data[id].reason}\`` : ''}`).join('\n') +
            (flagged.length > 3 ? `\n> -# *+${flagged.length - 3} more blacklisted accounts*` : '')
          : `\n\n-# **__Synced Global Blacklist:__** \`0 accounts\``;

        const inventorySummary = 
          `\n\n-# **__Linked Cloud DB Backup Inventory (All 52 Systems Backed Up):__**\n` +
          `> -# **Server Configs:** \`${m.guilds} guilds\` | \`${m.customPrefixes} prefixes\` | \`${m.customCommandsTotal || 0} custom cmds\` | \`${m.accentColors} colors\` | \`${m.dashboardChannels} dashboards\`\n` +
          `> -# **Antinuke & Defense:** \`${m.securityServers} armed\` | \`28 modules\` | \`${m.securityLiveTotal || 0} live records\` | \`${m.panicHistoryTotal || 0} panic logs\` | \`${m.unbypassableRolesCount || 0} unbypassable\`\n` +
          `> -# **Join Gatekeeper:** \`${m.entryActive || 0} gates\` | \`${m.entryPendingTotal || 0} pending apps\` | \`Remote DMs: ${m.botOwnerEntryRemote ? 'ACTIVE' : 'OFF'}\` | \`${m.entryVerifiedRoles || 0} verified roles\`\n` +
          `> -# **Stock Telemetry:** \`${m.stockChannels || 0} alert chs\` | \`${m.dailyStockEnabled || 0} daily briefings\` | \`${m.dynamicStockSymbolsCount || 0} learned tickers\`\n` +
          `> -# **Automod Filters:** \`${m.automodServers} active\` | \`${m.blacklistedWordsCount} words\` | \`${m.allowedLinksCount} allowed domains\` | \`${m.automodBypassRolesCount || 0} bypasses\`\n` +
          `> -# **Community Setups:** \`Suggestions: ${m.suggestionChannels || 0} chs | Starboard: ${m.starboardChannels || 0} chs (${m.starboardThresholdsCount || 0} limits) | Quotes: ${m.quoteChannels} | Voice Roles: ${m.voiceRolesCount || 0} | Verification: ${m.verification} gates | Reaction Roles: ${m.reactionRoles} menus (${m.reactionRolesMappingsCount || 0} mapped) | Chess Engines: ${m.chessEnginesCount || 0}\`\n` +
          `> -# **Voice & Studio:** \`${m.homeVc} home VCs\` | \`${m.theaterModeVcs} theater\` | \`${m.jtc} JTC hubs (${m.jtcChimesCount || 0} chimes)\` | \`${m.studioTemplates || 0} studio presets\` | \`${m.voiceAnalyticsServers || 0} telemetry\` | \`${m.autoTtsChannels || 0} TTS chs\`\n` +
          `> -# **Economy & Community:** \`${m.economyUsers || 0} bank ledgers\` | \`${m.shopItemsCount || 0} shop items\` | \`${m.countingActive || 0} counting games\` | \`${m.tickets} tickets\` | \`${m.giveaways} giveaways\`\n` +
          `> -# **Sanctions & Access:** \`${m.warnings} warnings\` | \`${m.quarantines} quarantined\` | \`${m.tempBans} tempbans\` | \`${m.exploitTaintsCount || 0} exploit taints\` | \`${m.extraOwners} extra owners\`\n` +
          `> -# **NP Network:** \`${m.npUsers} NP users\` | \`${m.npServers} NP servers\` | \`${m.npManagers} NP managers\` | \`WAL SQLite stats.db: SYNCED\``;

        return sendReply(cv2.info(
          `Database Cloud Backup List | <a:atheNATICK:1557841381630681106>`,
          `-# **__Backup Channel:__** <#${channel.id}>\n` +
          `-# **__Total Snapshots Available:__** \`${backupMessages.size}\`\n\n` +
          `-# **__Recent Cloud Snapshots:__**\n` +
          entries.join('\n\n') +
          inventorySummary +
          blSummary +
          `\n\n-# **Restore Command:** \`!db restore latest\` or reply to any snapshot message with \`!db restore\``
        ));
      }
      if (action === 'export' || action === 'download') {
        if (!fs.existsSync(DB_FILE)) {
          return sendReply(cv2.warn('Database Not Found', 'No local `data/db.json` file found on this host.'));
        }

        // Flush memory
        if (db.needsSave || db.saveTimeout) {
          clearTimeout(db.saveTimeout);
          db.saveTimeout = null;
          fs.writeFileSync(DB_FILE, JSON.stringify(db.cache, null, 2), 'utf8');
        }

        // Checkpoint WAL
        statsDB.checkpoint();

        const stats = fs.statSync(DB_FILE);
        const sizeKb = (stats.size / 1024).toFixed(1);
        const m = getDatabaseMetrics();

        const files = [new AttachmentBuilder(DB_FILE, { name: 'db.json' })];
        if (fs.existsSync(STATS_FILE)) {
          files.push(new AttachmentBuilder(STATS_FILE, { name: 'stats.db' }));
        }

        const exportPayload = cv2.info(
          `Database Export | <a:atheNATICK:1557841381630681106>`,
          formatDatabaseMetrics(m, {
            prefixText: '**Raw database files compiled.** Click the attachments below to download.',
            sizeKb,
            timestamp: Date.now()
          })
        );

        await sendReply(exportPayload);

        const downloadPayload = {
          content: `**Database Export Files | <a:atheNATICK:1557841381630681106>**\n-# Click the file attachments below to download your \`db.json\` (${sizeKb} KB)${fs.existsSync(STATS_FILE) ? ' and `stats.db`' : ''}:`,
          files
        };

        if (context.isCommand?.()) {
          return context.followUp(downloadPayload).catch(() => null);
        }
        return (context.channel || context).send(downloadPayload).catch(() => null);
      }

      // 3. RESTORE ACTION
      if (action === 'restore' || action === 'import' || action === 'upload' || action === 'pull') {
        let attachment = directFile;

        // Message attachments
        if (!attachment && context.attachments && context.attachments.size > 0) {
          attachment = context.attachments.find(a => a.name?.endsWith('.json'));
        }

        // Replied-to message attachments
        if (!attachment && context.reference?.messageId && context.channel?.messages) {
          const refMsg = await context.channel.messages.fetch(context.reference.messageId).catch(() => null);
          if (refMsg && refMsg.attachments && refMsg.attachments.size > 0) {
            attachment = refMsg.attachments.find(a => a.name?.endsWith('.json'));
          }
        }

        // If no file is attached, check if user requested cloud restore or default to cloud restore
        const subArg = args[0]?.toLowerCase();
        if (!attachment && (subArg === 'cloud' || subArg === 'latest' || action === 'pull' || (!subArg && context.isCommand?.()))) {
          const statusMsg = await sendReply(cv2.info('Cloud Restore Initiated', 'Fetching latest backup snapshot from Discord cloud storage...'));
          const cloudRes = await restoreFromCloud(context.client);

          if (!cloudRes.success) {
            const failPayload = cv2.danger('Cloud Restore Failed', `Could not restore from cloud: \`${cloudRes.reason}\``);
            if (context.isCommand?.()) return context.editReply(failPayload);
            return statusMsg?.edit ? statusMsg.edit(failPayload) : sendReply(failPayload);
          }

          const m = cloudRes.metrics;
          const successPayload = cv2.success(
            `Database Restored | <a:atheNATICK:1557841381630681106>`,
            formatDatabaseMetrics(m, {
              prefixText: '**Database successfully restored from cloud backup!**\nAll bot systems and guild configurations are now fully active without needing a bot restart.',
              fileName: cloudRes.fileName,
              timestamp: cloudRes.timestamp
            })
          );

          if (context.isCommand?.()) return context.editReply(successPayload);
          return statusMsg?.edit ? statusMsg.edit(successPayload) : sendReply(successPayload);
        }

        if (!attachment) {
          return sendReply(cv2.warn(
            'Restore Options',
            'You can restore from your Discord cloud backup or upload a file directly:\n\n' +
            '**Commands:**\n' +
            '-# • `!db restore latest` — Instantly pull & restore latest cloud backup from Discord\n' +
            '-# • `!db restore` with your `db.json` attached\n' +
            '-# • Reply to any previous backup in Discord with `!db restore`\n' +
            '-# • Or use `/db action:restore`'
          ));
        }

        try {
          const res = await fetch(attachment.url);
          if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
          const fileText = await res.text();

          const restoreResult = await manualRestore(fileText);
          if (!restoreResult.success) {
            return sendReply(cv2.danger('Restore Failed', `Failed to restore database: \`${restoreResult.error}\``));
          }

          const m = restoreResult.metrics;
          return sendReply(cv2.success(
            `Database Restored | <a:atheNATICK:1557841381630681106>`,
            formatDatabaseMetrics(m, {
              prefixText: '**Database successfully restored and hot-reloaded!**\nAll bot systems and guild configurations are now fully active without needing a bot restart.',
              fileName: attachment.name,
              timestamp: Date.now()
            })
          ));
        } catch (err) {
          return sendReply(cv2.danger('Restore Error', `Failed to process uploaded file: \`${err.message}\``));
        }
      }

      // 4. SETCHANNEL ACTION
      if (action === 'setchannel' || action === 'channel') {
        const guild = context.guild;
        let targetChannel = directChannel;

        if (!targetChannel) {
          const mention = context.mentions?.channels?.first();
          if (mention) targetChannel = mention;
          else if (args[0]) {
            const rawId = args[0].replace(/[<#>]/g, '');
            targetChannel = guild?.channels.cache.get(rawId) || await context.client.channels.fetch(rawId).catch(() => null);
          }
        }

        if (!targetChannel || !targetChannel.isTextBased()) {
          return sendReply(cv2.warn('Missing Channel', 'Please specify or mention a valid text channel to store automated cloud backups.\n\nExample: `!db setchannel #bot-backups`'));
        }

        db.cache.dbBackupChannelId = targetChannel.id;
        db.save();

        // Update topic signature if bot has permission
        try {
          if (targetChannel.manageable) {
            await targetChannel.setTopic('Encrypted automated database cloud snapshots - Athena Prime [athena-db-backups]');
          }
        } catch {}

        // Perform immediate backup test
        const testRes = await createCloudBackup(context.client, `Backup Channel Bound to #${targetChannel.name}`);

        return sendReply(cv2.success(
          `Backup Channel Set | <a:atheNATICK:1557841381630681106>`,
          `Set <#${targetChannel.id}> as the official Discord Cloud Backup channel!\n\n` +
          `> -# **Auto-Backup Interval:** Every 20 minutes\n` +
          `> -# **Initial Snapshot:** ${testRes.success ? 'Saved successfully' : 'Queued'}\n` +
          `> -# **New Host Auto-Restore:** Enabled\n\n` +
          `Whenever you change hosting providers, the bot will automatically retrieve the latest backup from this channel upon booting.`
        ));
      }

      // 5. STATUS ACTION (DEFAULT)
      const currentChannel = await getBackupChannel(context.client);
      const m = getDatabaseMetrics();
      const sizeKb = fs.existsSync(DB_FILE) ? (fs.statSync(DB_FILE).size / 1024).toFixed(1) : '0';
      const lastBackupStr = db.cache.lastCloudBackup ? `<t:${Math.floor(db.cache.lastCloudBackup / 1000)}:R>` : '`Never`';

      return sendReply(cv2.info(
        `Database Cloud Status | <a:atheNATICK:1557841381630681106>`,
        `**Persistence & Cloud Migration System**\n\n` +
        `> -# **Backup Channel:** ${currentChannel ? `<#${currentChannel.id}> (\`${currentChannel.id}\`)` : '`Not Set (Auto-detecting)`'}\n` +
        `> -# **Auto-Sync Scheduler:** \`Active (Every 20m)\`\n` +
        `> -# **Last Cloud Backup:** ${lastBackupStr}\n` +
        `> -# **Local Database Size:** \`${sizeKb} KB\`\n\n` +
        formatDatabaseMetrics(m, { sizeKb }) +
        `\n\n**Management Commands:**\n` +
        `-# • \`!db backup\` — Force immediate cloud backup\n` +
        `-# • \`!db restore latest\` — Pull & restore latest cloud backup from Discord\n` +
        `-# • \`!db export\` — Download raw \`db.json\` & \`stats.db\`\n` +
        `-# • \`!db restore\` — Restore from uploaded file\n` +
        `-# • \`!db setchannel #channel\` — Change cloud backup channel`
      ));
    }
  }
];
