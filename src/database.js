import fs from 'fs';
import path from 'path';

const DB_DIR = path.resolve('data');
const DB_FILE = path.join(DB_DIR, 'db.json');
const BACKUPS_DIR = path.join(DB_DIR, 'backups');

// Ensure database directories exist
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

const DEFAULT_SCHEMA = {
  guilds: {},        // guildId -> config
  afk: {},           // userId -> { reason, timestamp }
  warnings: {},      // guildId -> { userId -> [...] }
  quarantines: {},   // guildId -> { userId -> { roles, quarantinedAt, reason, expiresAt } }
  exploitTaints: {}, // guildId -> { userId -> { taintedAt, reason } }
  tempBans: {},      // guildId -> { userId -> { bannedAt, expiresAt, reason, bannedBy } }
  extraOwners: {},   // guildId -> [ userId... ]
  spamPermitted: [], // global list
  backups: {},       // backupId -> backup data
  guildBackupMap: {},// guildId -> backupId (for overwrite detection)
  modModes: {},      // guildId -> { expiresAt, startedBy }
  triggers: {},      // guildId -> [ {match, response} ]
  globalTriggers: [], // global list -> [ {match, heading, content, gif, footer} ]
  jtc: {},           // guildId -> { lobbyChannelId, categoryId }
  jtcChannels: {},   // channelId -> { ownerId, guildId }
  botWhitelist: {},  // guildId -> [ botId... ]
  emergencies: {},   // guildId -> { roles: [{id, perms}], channels: [{id, overwrites}] }
  reactionRoles: {}, // messageId -> { guildId, channelId, title, mappings: [{emoji, roleId}] }
  serverStats: {},   // guildId -> { categoryId, totalId, humansId, botsId }
  birthdays: {},     // guildId -> { channelId, users: { userId -> { day, month } } }
  giveaways: {},     // messageId -> { guildId, channelId, hostId, prize, winnersCount, endsAt, participants: [] }
  newsFeeds: {},     // guildId -> { channelId, roleId, feeds: [{name, url}], lastGuids: [] }
  verification: {},  // guildId -> { roleId, messageId, channelId }
  tickets: {},       // guildId -> { categoryId, staffRoleIds: [], ticketCount: 0, activeTickets: {} } // ticketId -> { textId, voiceId, ownerId }
  xpSystems: {},     // guildId -> { enabled: false, announceChannelId: null, cmdChannelId: null, roleRewards: { level -> roleId }, multipliers: { roleId -> multiplier } }
  usersXp: {},       // guildId -> { userId -> { xp: 0, level: 0, lastMessageAt: 0, voiceJoinAt: 0 } }
  moveProtection: {},// guildId -> [userIds]
  botBlacklist: [],  // global list of userIds
  botBlacklistData: {}, // userId -> { userId, reason, timestamp }
  bumpReminders: {}, // guildId -> { channelId, bumperId, expiresAt }
  editRatings: {},   // messageId -> { authorId, authorName, mediaUrl, votes: {} }
  rateChannels: {},  // guildId -> channelId
  likedSongs: {},    // userId -> [ { title, url, duration, artworkUrl } ]
  bannedServers: [], // global list of banned guild IDs
  stickyMessages: {}, // guildId -> { channelId -> { content, lastMessageId, lastSentAt } }
  massRoles: {},      // guildId -> { roleId -> [userIds] }
  npManagers: [],     // global list of NP Manager user IDs
  npUsers: {},        // userId -> { expiresAt, appointedBy, addedAt }
  npServers: {},      // guildId -> { expiresAt, appointedBy, addedAt }
  npBannedUsers: [],  // global list of user IDs banned from NP
  npBannedCommands: [],// global list of command names banned from NP
  npPaused: false,    // boolean to pause entire NP system
  adelList: {},       // guildId -> { channelId -> [userId...] }
  botAnalytics: { joins: 0, leaves: 0, cmds: {} }, // global stats tracking
  welcome: {},        // guildId -> welcome config
  leave: {},          // guildId -> leave config
  vcProtection: {},   // guildId -> [userIds]
  apps: {},           // guildId -> staff application config
  pingAlertBlocks: {},// userId -> [guildIds]
  likedSongs: {},     // userId -> [song objects]
  bannedServers: [],  // [guildIds]
  tts: { users: {}, autoTts: {} },
  dbBackupChannelId: null,
  vcDrags: {},        // guildId -> { userId -> { initiatorId, targetTag, startedAt, intervalSec } }
  counting: {},       // guildId -> counting config
  nukeSignatures: {}, // guildId -> [ { id, timestamp, executorId, action, eventType } ]
  baselineProfiles: {}, // guildId -> { actionsRecorded, staffTracked: [], lastAction, lastUpdated }
  economy: {},        // guildId -> { userId -> { wallet, bank, lastDaily, streak } }
  shopItems: {},      // guildId -> [ { id, name, price, roleId, description } ]
  userRankThemes: {}, // userId -> themeName ('hogwarts' | 'athena')
  lockdownSnapshots: {}, // guildId -> { tier, timestamp, channels: [], roles: [] }
  channelLockSnapshots: {}, // `${guildId}-${channelId}` -> { timestamp, overwrites: [] }
  panicHistory: {},         // guildId -> [ { id, timestamp, type, moderatorId, ... } ]
  studioTemplates: {},   // guildId -> { templateId -> { id, name, title, description, color, fields, footer } }
  minigamesStats: {},    // guildId -> { userId -> { blackjackWins, rouletteWins, triviaWins, totalWagered, totalWon } }
  voiceAnalytics: {},    // guildId -> { hourly: {}, channels: {}, users: {} }
  dynamicStockSymbols: {} // cleanQuery -> { symbol, name, exchange, currency, assetType, updatedAt }
};

class Database {
  constructor() {
    this.cache = DEFAULT_SCHEMA;
    this.saveTimeout = null;
    this.isSaving = false;
    this.needsSave = false;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        let data;
        try {
          data = fs.readFileSync(DB_FILE, 'utf8');
          this.cache = JSON.parse(data);
        } catch (parseErr) {
          console.warn('[Database] db.json could not be parsed. Checking local rotating snapshots...');
          const b1 = path.join(BACKUPS_DIR, 'db_backup_1.json');
          const b2 = path.join(BACKUPS_DIR, 'db_backup_2.json');
          if (fs.existsSync(b1)) {
            data = fs.readFileSync(b1, 'utf8');
            this.cache = JSON.parse(data);
            fs.writeFileSync(DB_FILE, data, 'utf8');
            console.log('[Database] Successfully recovered from local snapshot #1.');
          } else if (fs.existsSync(b2)) {
            data = fs.readFileSync(b2, 'utf8');
            this.cache = JSON.parse(data);
            fs.writeFileSync(DB_FILE, data, 'utf8');
            console.log('[Database] Successfully recovered from local snapshot #2.');
          } else {
            throw parseErr;
          }
        }
        
        // Ensure standard structure is always present
        this.cache.guilds        = this.cache.guilds        || {};
        this.cache.afk           = this.cache.afk           || {};
        this.cache.warnings      = this.cache.warnings      || {};
        this.cache.quarantines   = this.cache.quarantines   || {};
        this.cache.exploitTaints = this.cache.exploitTaints || {};
        this.cache.tempBans      = this.cache.tempBans      || {};
        this.cache.extraOwners   = this.cache.extraOwners   || {};
        this.cache.spamPermitted = this.cache.spamPermitted || [];
        this.cache.backups        = this.cache.backups        || {};
        this.cache.guildBackupMap = this.cache.guildBackupMap || {};
        this.cache.modModes       = this.cache.modModes       || {};
        this.cache.triggers       = this.cache.triggers       || {};
        this.cache.globalTriggers = this.cache.globalTriggers || [];
        this.cache.jtc            = this.cache.jtc            || {};
        this.cache.botBlacklist   = this.cache.botBlacklist   || [];
        this.cache.botBlacklistData = this.cache.botBlacklistData || {};
        this.cache.jtcChannels    = this.cache.jtcChannels    || {};
        this.cache.botWhitelist   = this.cache.botWhitelist   || {};
        this.cache.emergencies    = this.cache.emergencies    || {};
        this.cache.reactionRoles  = this.cache.reactionRoles  || {};
        this.cache.serverStats    = this.cache.serverStats    || {};
        this.cache.birthdays      = this.cache.birthdays      || {};
          this.cache.afk = this.cache.afk || {};
        this.cache.giveaways      = this.cache.giveaways      || {};
        this.cache.newsFeeds      = this.cache.newsFeeds      || {};
        this.cache.verification   = this.cache.verification   || {};
        this.cache.tickets        = this.cache.tickets        || {};
        this.cache.xpSystems      = this.cache.xpSystems      || {};
        this.cache.usersXp        = this.cache.usersXp        || {};
        this.cache.moveProtection = this.cache.moveProtection || {};
        this.cache.editRatings    = this.cache.editRatings    || {};
        this.cache.rateChannels   = this.cache.rateChannels   || {};
        this.cache.massRoles      = this.cache.massRoles      || {};
        this.cache.npManagers     = this.cache.npManagers     || [];
        this.cache.tts            = this.cache.tts            || { users: {}, autoTts: {} };
        this.cache.npUsers        = this.cache.npUsers        || {};
        this.cache.npServers      = this.cache.npServers      || {};
        this.cache.npBannedUsers  = this.cache.npBannedUsers  || [];
        this.cache.npBannedCommands = this.cache.npBannedCommands || [];
        this.cache.npPaused       = this.cache.npPaused       || false;
        this.cache.adelList       = this.cache.adelList       || {};
        this.cache.botAnalytics   = this.cache.botAnalytics   || { joins: 0, leaves: 0, cmds: {} };
        this.cache.welcome        = this.cache.welcome        || {};
        this.cache.leave          = this.cache.leave          || {};
        this.cache.vcProtection   = this.cache.vcProtection   || {};
        this.cache.apps           = this.cache.apps           || {};
        this.cache.pingAlertBlocks = this.cache.pingAlertBlocks || {};
        this.cache.likedSongs     = this.cache.likedSongs     || {};
        this.cache.bannedServers  = this.cache.bannedServers  || [];
        this.cache.dbBackupChannelId = this.cache.dbBackupChannelId || null;
        this.cache.vcDrags        = this.cache.vcDrags        || {};
        this.cache.counting       = this.cache.counting       || {};
        this.cache.nukeSignatures = this.cache.nukeSignatures || {};
        this.cache.baselineProfiles = this.cache.baselineProfiles || {};
        this.cache.economy        = this.cache.economy        || {};
        this.cache.shopItems      = this.cache.shopItems      || {};
        this.cache.userRankThemes = this.cache.userRankThemes || {};
        this.cache.lockdownSnapshots = this.cache.lockdownSnapshots || {};
        this.cache.channelLockSnapshots = this.cache.channelLockSnapshots || {};
        this.cache.panicHistory         = this.cache.panicHistory         || {};
        this.cache.studioTemplates = this.cache.studioTemplates || {};
        this.cache.minigamesStats = this.cache.minigamesStats || {};
        this.cache.voiceAnalytics = this.cache.voiceAnalytics || {};
        this.cache.bumpReminders  = this.cache.bumpReminders  || {};
        this.cache.stickyMessages = this.cache.stickyMessages || {};

        // Dynamic safety: ensure every key defined in DEFAULT_SCHEMA exists in this.cache
        let needsSave = false;
        for (const [key, defaultVal] of Object.entries(DEFAULT_SCHEMA)) {
          if (this.cache[key] === undefined) {
            this.cache[key] = Array.isArray(defaultVal) ? [] : typeof defaultVal === 'object' && defaultVal !== null ? { ...defaultVal } : defaultVal;
            needsSave = true;
          }
        }
        if (needsSave) {
          this.save();
        }
      } else {
        this.save();
      }
    } catch (error) {
      console.error('Error loading database:', error);
      this.cache = DEFAULT_SCHEMA;
    }
  }

  save() {
    this.needsSave = true;
    if (this.saveTimeout) return; // Debounce already in progress
    
    // Debounce the save by 1 second to batch multiple rapid changes
    this.saveTimeout = setTimeout(async () => {
      this.saveTimeout = null;
      if (this.isSaving) {
        // If a save is currently writing to disk, try again next tick
        this.save();
        return;
      }
      
      this.isSaving = true;
      this.needsSave = false;
      
      try {
        const replacer = (key, value) => {
          if (typeof value === 'bigint') return value.toString();
          // Skip circular Discord.js references if any sneak in
          if (value && typeof value === 'object' && value.client) return undefined;
          return value;
        };
        const dataStr = JSON.stringify(this.cache, replacer, 2);
        await fs.promises.writeFile(DB_FILE, dataStr, 'utf8');

        // Maintain local rotating snapshots (last 3 copies)
        try {
          const b1 = path.join(BACKUPS_DIR, 'db_backup_1.json');
          const b2 = path.join(BACKUPS_DIR, 'db_backup_2.json');
          const b3 = path.join(BACKUPS_DIR, 'db_backup_3.json');
          if (fs.existsSync(b2)) fs.copyFileSync(b2, b3);
          if (fs.existsSync(b1)) fs.copyFileSync(b1, b2);
          await fs.promises.writeFile(b1, dataStr, 'utf8');
        } catch {}
      } catch (error) {
        console.error('Error saving database:', error);
      } finally {
        this.isSaving = false;
        if (this.needsSave) this.save(); // Process any changes that happened during the async write
      }
    }, 1000);
  }

  // Guild Configurations

  // ==========================================
  // AUTH TIERS
  // ==========================================
  getAuthRoles(guildId) {
    const config = this.getGuildConfig(guildId);
    if (!config.authRoles) {
      config.authRoles = { admin: [], mod: [], staff: [] };
      this.save();
    }
    return config.authRoles;
  }

  updateAuthRoles(guildId, tier, roleIds) {
    const config = this.getGuildConfig(guildId);
    if (!config.authRoles) config.authRoles = { admin: [], mod: [], staff: [] };
    config.authRoles[tier] = roleIds;
    this.save();
  }

  getPrefix(guildId) {
    if (!guildId) return process.env.DEFAULT_PREFIX || '!';
    return this.getGuildConfig(guildId)?.prefix || process.env.DEFAULT_PREFIX || '!';
  }

  getGuildConfig(guildId) {
    if (!this.cache.guilds[guildId]) {
      this.cache.guilds[guildId] = {
        prefix: process.env.DEFAULT_PREFIX || '!',
        logChannel: null,
        voiceLogChannel: null,
        muteRoleId: null,
        quarantineRoleId: null,
        quarantineChannelId: null,
        quarantineVcId: null,
        quarantineCategoryId: null,
        homeVcId: null,
        inviteChannelId: null,
        stockChannelId: null,
        dailyStockEnabled: false,
        lastDailyStockSentDate: null,
        linkBypassRoles: [],
        inviteBypassRoles: [],
        allowInvitesGlobally: false,
        antiSpamEnabled: false,
        antiSpamMentionEnabled: false,
        antiSpamMentionBypassRoles: [],
        antiLinkEnabled: false,
        antiInviteEnabled: false,
        wordFilterEnabled: false,
        bigFontsEnabled: false,
        antiFloodEnabled: false,
        automodBypasses: {},
        honeypotChannelId: null,
        honeypotTimeoutMinutes: 15,
        raidMode: false,
        raidAutoShield: false,
        raidJoinThreshold: 8,
        raidJoinWindowMs: 5000,
        preRaidVerificationLevel: null,
        twoFactorEmail: null,
        twoFactorVerified: false,
        pendingTwoFactorCode: null,
        antiNukeEnabled: false,
        securityEnabled: false,
        botOwnerBypass: false,
        antinukeModules: {
          antiRoleCreate: false,
          antiRoleDelete: false,
          antiRoleUpdate: false,
          antiRolePermUpdate: false,
          antiMemberRoleUpdate: false,
          antiRoleReorder: false,
          antiChannelCreate: false,
          antiChannelDelete: false,
          antiChannelUpdate: false,
          antiChannelPermUpdate: false,
          antiChannelReorder: false,
          antiChannelNameMod: false,
          antiEmojiCreate: false,
          antiEmojiDelete: false,
          antiEmojiUpdate: false,
          antiWebhooks: false,
          antiBotAdd: false,
          antiServerUpdate: false,
          antiBan: false,
          antiKick: false,
          antiUnban: false,
          antiInvite: false,
          antiScheduledEvents: false,
          antiMemberPurge: false,
          antiMassBan: false,
          antiAutomodUpdate: false,
          antiAppCommands: false,
          antiLinkedRole: false
        },
        antiNukePunishment: 'ban',
        antiNukeThreshold: 1,
        maxWarnings: 3,
        blacklistWords: [],
        whitelist: { users: {}, roles: {} },
        allowedLinks: [],
        accentColor: null,
        rrDmsEnabled: true,
        serverLogs: {
          enabled: false,
          defaultChannelId: null,
          categoryId: null,
          modules: {
            bans: { enabled: true, channelId: null },
            kicks: { enabled: true, channelId: null },
            leaves: { enabled: true, channelId: null },
            joins: { enabled: true, channelId: null },
            msgDeletes: { enabled: true, channelId: null },
            msgEdits: { enabled: true, channelId: null },
            channels: { enabled: true, channelId: null },
            roles: { enabled: true, channelId: null }
          }
        },
        autonick: {
          enabled: false,
          prefix: '',
          suffix: ''
        },
        voiceRoleId: null
      };
      this.save();
    } else {
      // Self-heal/Backwards compatibility check for existing configs
      const cfg = this.cache.guilds[guildId];
      let updated = false;

      if (cfg.antiNukeEnabled === undefined) { cfg.antiNukeEnabled = false; updated = true; }
      if (cfg.securityEnabled === undefined) { cfg.securityEnabled = false; updated = true; }
      if (cfg.botOwnerBypass === undefined) { cfg.botOwnerBypass = false; updated = true; }
      if (cfg.antinukeModules === undefined) {
        cfg.antinukeModules = {
          antiRoleCreate: false, antiRoleDelete: false, antiRoleUpdate: false, antiRolePermUpdate: false, antiMemberRoleUpdate: false, antiRoleReorder: false,
          antiChannelCreate: false, antiChannelDelete: false, antiChannelUpdate: false, antiChannelPermUpdate: false, antiChannelReorder: false, antiChannelNameMod: false,
          antiEmojiCreate: false, antiEmojiDelete: false, antiEmojiUpdate: false, antiWebhooks: false, antiBotAdd: false, antiServerUpdate: false,
          antiBan: false, antiKick: false, antiUnban: false, antiInvite: false, antiScheduledEvents: false, antiMemberPurge: false,
          antiMassBan: false, antiAutomodUpdate: false, antiAppCommands: false, antiLinkedRole: false
        };
        updated = true;
      }
      if (cfg.antinukeModules.antiLinkedRole === undefined) {
        cfg.antinukeModules.antiLinkedRole = false;
        updated = true;
      }

      // If security is disabled, ensure orphaned antiNukeEnabled and modules are reset to false
      if (!cfg.securityEnabled) {
        if (cfg.antiNukeEnabled) {
          cfg.antiNukeEnabled = false;
          updated = true;
        }
        if (cfg.botOwnerBypass) {
          cfg.botOwnerBypass = false;
          updated = true;
        }
        const antinukeKeys = [
          'antiRoleCreate', 'antiRoleDelete', 'antiRoleUpdate', 'antiRolePermUpdate', 'antiMemberRoleUpdate', 'antiRoleReorder',
          'antiChannelCreate', 'antiChannelDelete', 'antiChannelUpdate', 'antiChannelPermUpdate', 'antiChannelReorder', 'antiChannelNameMod',
          'antiEmojiCreate', 'antiEmojiDelete', 'antiEmojiUpdate', 'antiWebhooks', 'antiBotAdd', 'antiServerUpdate',
          'antiBan', 'antiKick', 'antiUnban', 'antiInvite', 'antiScheduledEvents', 'antiMemberPurge',
          'antiMassBan', 'antiAutomodUpdate', 'antiAppCommands', 'antiLinkedRole'
        ];
        for (const k of antinukeKeys) {
          if (cfg.antinukeModules[k] !== false) {
            cfg.antinukeModules[k] = false;
            updated = true;
          }
        }
      }
      if (cfg.maxWarnings === undefined) { cfg.maxWarnings = 3; updated = true; }
      if (cfg.blacklistWords === undefined) { cfg.blacklistWords = []; updated = true; }
      if (cfg.whitelist === undefined || Array.isArray(cfg.whitelist) || !cfg.whitelist.users) { 
        // Migrate old array format or old object format to granular object format
        const oldData = cfg.whitelist;
        cfg.whitelist = { users: {}, roles: {} }; 
        if (Array.isArray(oldData)) {
          oldData.forEach(id => {
            cfg.whitelist.users[id] = { modules: ['all'], triggerLimit: 0, currentUsage: 0 };
          });
        } else if (typeof oldData === 'object' && oldData !== null) {
          Object.keys(oldData).forEach(id => {
            // Keep old format if it was the string array type from the last update
            cfg.whitelist.users[id] = { modules: ['all'], triggerLimit: 0, currentUsage: 0 };
          });
        }
        updated = true; 
      }
      if (cfg.autonick === undefined) { cfg.autonick = { enabled: false, prefix: '', suffix: '', layout: '{name}' }; updated = true; }
      else if (cfg.autonick.layout === undefined) { cfg.autonick.layout = '{name}'; updated = true; }
      if (cfg.quarantineVcId === undefined) { cfg.quarantineVcId = null; updated = true; }
      if (cfg.quarantineCategoryId === undefined) { cfg.quarantineCategoryId = null; updated = true; }
      if (cfg.homeVcId === undefined) { cfg.homeVcId = null; updated = true; }
      if (cfg.theaterModeVcId === undefined) { cfg.theaterModeVcId = null; updated = true; }
      if (cfg.inviteChannelId === undefined) { cfg.inviteChannelId = null; updated = true; }
      if (cfg.stockChannelId === undefined) { cfg.stockChannelId = null; updated = true; }
      if (cfg.dailyStockEnabled === undefined) { cfg.dailyStockEnabled = false; updated = true; }
      if (cfg.lastDailyStockSentDate === undefined) { cfg.lastDailyStockSentDate = null; updated = true; }
      if (cfg.linkBypassRoles === undefined) { cfg.linkBypassRoles = []; updated = true; }
      if (cfg.inviteBypassRoles === undefined) { cfg.inviteBypassRoles = []; updated = true; }
      if (cfg.allowInvitesGlobally === undefined) { cfg.allowInvitesGlobally = false; updated = true; }
      if (cfg.antiNukePunishment === undefined) { cfg.antiNukePunishment = 'ban'; updated = true; }
      if (cfg.antiNukeThreshold === undefined) { cfg.antiNukeThreshold = 1; updated = true; }
      if (cfg.antiLinkEnabled === undefined) { cfg.antiLinkEnabled = false; updated = true; }
        if (cfg.wordFilterEnabled === undefined) { cfg.wordFilterEnabled = true; updated = true; }
        if (cfg.bigFontsEnabled === undefined) { cfg.bigFontsEnabled = true; updated = true; }
        if (cfg.antiFloodEnabled === undefined) { cfg.antiFloodEnabled = true; updated = true; }
        if (cfg.automodBypasses === undefined) { cfg.automodBypasses = {}; updated = true; }
        if (cfg.honeypotChannelId === undefined) { cfg.honeypotChannelId = null; updated = true; }
        if (cfg.honeypotTimeoutMinutes === undefined) { cfg.honeypotTimeoutMinutes = 15; updated = true; }
      if (cfg.antiSpamMentionEnabled === undefined) { cfg.antiSpamMentionEnabled = false; updated = true; }
      if (cfg.antiSpamMentionBypassRoles === undefined) { cfg.antiSpamMentionBypassRoles = []; updated = true; }
      if (cfg.antiInviteEnabled === undefined) { cfg.antiInviteEnabled = true; updated = true; }
      if (cfg.allowedLinks === undefined) { cfg.allowedLinks = []; updated = true; }
      if (cfg.accentColor === undefined) { cfg.accentColor = null; updated = true; }
      if (cfg.rrDmsEnabled === undefined) { cfg.rrDmsEnabled = true; updated = true; }
      if (cfg.serverLogs === undefined) { 
        cfg.serverLogs = {
          enabled: false,
          defaultChannelId: null,
          categoryId: null,
          modules: {
            bans: { enabled: true, channelId: null },
            kicks: { enabled: true, channelId: null },
            leaves: { enabled: true, channelId: null },
            joins: { enabled: true, channelId: null },
            msgDeletes: { enabled: true, channelId: null },
            msgEdits: { enabled: true, channelId: null },
            channels: { enabled: true, channelId: null },
            roles: { enabled: true, channelId: null }
          }
        }; 
        updated = true; 
      }
      if (cfg.musicChannelId === undefined) { cfg.musicChannelId = null; updated = true; }
      if (cfg.musicMessageId === undefined) { cfg.musicMessageId = null; updated = true; }
      if (cfg.musicCoverImage === undefined) { cfg.musicCoverImage = null; updated = true; }
      if (cfg.youtubeNotifiers === undefined) { cfg.youtubeNotifiers = []; updated = true; }
      if (cfg.autoroleIds === undefined) { 
        cfg.autoroleIds = []; 
        if (cfg.autoroleId) {
          cfg.autoroleIds.push(cfg.autoroleId);
          delete cfg.autoroleId;
        }
        updated = true; 
      }

      if (updated) this.save();
    }
    return this.cache.guilds[guildId];
  }

  updateGuildConfig(guildId, updates) {
    const config = this.getGuildConfig(guildId);
    Object.assign(config, updates);
    this.save();
    return config;
  }

  getVoiceRole(guildId) {
    if (!guildId) return null;
    return this.getGuildConfig(guildId)?.voiceRoleId || null;
  }

  setVoiceRole(guildId, roleId) {
    if (!guildId) return null;
    return this.updateGuildConfig(guildId, { voiceRoleId: roleId || null });
  }

  // Reaction Roles
  getReactionRoleMenu(messageId) {
    return this.cache.reactionRoles[messageId];
  }

  saveReactionRoleMenu(messageId, data) {
    this.cache.reactionRoles[messageId] = data;
    this.save();
  }

  deleteReactionRoleMenu(messageId) {
    if (this.cache.reactionRoles[messageId]) {
      delete this.cache.reactionRoles[messageId];
      this.save();
    }
  }

  // -------------------------
  // News Feeds Configuration
  // -------------------------
  getNewsConfig(guildId) {
    if (!this.cache.newsFeeds[guildId]) {
      this.cache.newsFeeds[guildId] = { channelId: null, roleId: null, feeds: [], lastGuids: [] };
      this.save();
    }
    return this.cache.newsFeeds[guildId];
  }

  setNewsSetup(guildId, channelId, roleId) {
    const cfg = this.getNewsConfig(guildId);
    cfg.channelId = channelId;
    cfg.roleId = roleId;
    this.save();
  }

  addNewsFeed(guildId, name, url) {
    if (typeof name === 'object' && name !== null) {
      url = name.url;
      name = name.name;
    }
    const cfg = this.getNewsConfig(guildId);
    if (!cfg.feeds.find(f => f.url === url)) {
      cfg.feeds.push({ name, url });
      this.save();
      return true;
    }
    return false;
  }

  removeNewsFeed(guildId, url) {
    const cfg = this.getNewsConfig(guildId);
    const initialLen = cfg.feeds.length;
    cfg.feeds = cfg.feeds.filter(f => f.url !== url);
    if (cfg.feeds.length < initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  updateNewsGuids(guildId, guidsArray) {
    const cfg = this.getNewsConfig(guildId);
    // Keep only the last 200 guids to prevent infinite DB growth
    cfg.lastGuids = [...new Set([...guidsArray, ...cfg.lastGuids])].slice(0, 200);
    this.save();
  }

  // -------------------------
  // Server Stats
  // -------------------------
  getServerStats(guildId) {
    return this.cache.serverStats[guildId] || null;
  }

  saveServerStats(guildId, data) {
    this.cache.serverStats[guildId] = data;
    this.save();
  }

  deleteServerStats(guildId) {
    if (this.cache.serverStats[guildId]) {
      delete this.cache.serverStats[guildId];
      this.save();
    }
  }

  // Whitelist Manager
  isWhitelisted(guild, memberOrId, eventType = 'all') {
    if (!guild || !memberOrId) return false;
    const userId = typeof memberOrId === 'string' ? memberOrId : memberOrId.id;
    if (userId === guild.ownerId) return true; // Owner is always immune/whitelisted
    
    // Bot owner is ALWAYS whitelisted/immune
    const ownerIdEnv = process.env.OWNER_ID;
    if (ownerIdEnv && userId === ownerIdEnv) return true;
    
    // Extra owners are always whitelisted/immune
    if (this.isExtraOwner(guild.id, userId)) return true;

    const config = this.getGuildConfig(guild.id);
    if (!config.whitelist) return false;
    if (!config.securityEnabled && !config.antiNukeEnabled) return true; // If security is globally disabled, everyone is effectively whitelisted/allowed

    let wData = null;
    let isUserWhitelist = false;
    let targetId = null;
    let typeStr = null;

    if (config.whitelist.users && config.whitelist.users[userId]) {
      const uData = config.whitelist.users[userId];
      if (uData.modules.includes('all') || uData.modules.includes(eventType)) {
        wData = uData;
        isUserWhitelist = true;
        targetId = userId;
        typeStr = 'users';
      }
    }

    if (!wData && typeof memberOrId === 'object' && memberOrId.roles && config.whitelist.roles) {
      for (const [roleId, rData] of Object.entries(config.whitelist.roles)) {
        if (memberOrId.roles.cache.has(roleId)) {
          if (rData.modules.includes('all') || rData.modules.includes(eventType)) {
            wData = rData;
            targetId = roleId;
            typeStr = 'roles';
            break;
          }
        }
      }
    }

    if (!wData) return false;

    // Trigger limit check (0 means infinite)
    if (wData.triggerLimit > 0) {
      if (wData.currentUsage >= wData.triggerLimit) {
        // Limit exceeded, delete entry
        delete config.whitelist[typeStr][targetId];
        this.updateGuildConfig(guild.id, { whitelist: config.whitelist });
        return false;
      }
      
      // Valid action, increment usage
      wData.currentUsage++;
      this.updateGuildConfig(guild.id, { whitelist: config.whitelist });
    }
    return true;
  }

  getWhitelist(guildId, targetId, type = 'users') {
    const config = this.getGuildConfig(guildId);
    if (!config.whitelist || !config.whitelist[type]) return null;
    return config.whitelist[type][targetId] || null;
  }

  getAllWhitelists(guildId) {
    const config = this.getGuildConfig(guildId);
    if (!config.whitelist) return { users: {}, roles: {} };
    return {
      users: config.whitelist.users || {},
      roles: config.whitelist.roles || {}
    };
  }

  updateWhitelist(guildId, targetId, type, data) {
    // type is 'users' or 'roles'
    const config = this.getGuildConfig(guildId);
    if (!config.whitelist) config.whitelist = { users: {}, roles: {} };
    if (!config.whitelist[type]) config.whitelist[type] = {};
    
    if (data === null) {
      delete config.whitelist[type][targetId];
    } else {
      config.whitelist[type][targetId] = data;
    }
    
    this.updateGuildConfig(guildId, { whitelist: config.whitelist });
    return true;
  }

  // Blacklist Words Manager
  addBlacklistWord(guildId, word) {
    const config = this.getGuildConfig(guildId);
    const cleanWord = word.trim().toLowerCase();
    if (!config.blacklistWords.includes(cleanWord)) {
      config.blacklistWords.push(cleanWord);
      this.updateGuildConfig(guildId, { blacklistWords: config.blacklistWords });
      return true;
    }
    return false;
  }

  removeBlacklistWord(guildId, word) {
    const config = this.getGuildConfig(guildId);
    const cleanWord = word.trim().toLowerCase();
    const index = config.blacklistWords.indexOf(cleanWord);
    if (index !== -1) {
      config.blacklistWords.splice(index, 1);
      this.updateGuildConfig(guildId, { blacklistWords: config.blacklistWords });
      return true;
    }
    return false;
  }

  // Extra Owners Manager
  getExtraOwners(guildId) {
    if (!this.cache.extraOwners[guildId]) {
      this.cache.extraOwners[guildId] = [];
    }
    return this.cache.extraOwners[guildId];
  }

  isExtraOwner(guildId, userId) {
    if (!this.cache.extraOwners[guildId]) return false;
    return this.cache.extraOwners[guildId].includes(userId);
  }

  addExtraOwner(guildId, userId) {
    if (!this.cache.extraOwners[guildId]) {
      this.cache.extraOwners[guildId] = [];
    }
    if (!this.cache.extraOwners[guildId].includes(userId)) {
      this.cache.extraOwners[guildId].push(userId);
      this.save();
      return true;
    }
    return false;
  }

  removeExtraOwner(guildId, userId) {
    if (!this.cache.extraOwners[guildId]) return false;
    const index = this.cache.extraOwners[guildId].indexOf(userId);
    if (index !== -1) {
      this.cache.extraOwners[guildId].splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  // --- THREAT SIGNATURES & HEURISTIC LEARN MODE ---
  getNukeSignatures(guildId) {
    if (!this.cache.nukeSignatures) this.cache.nukeSignatures = {};
    if (Array.isArray(this.cache.nukeSignatures)) {
      const oldArr = this.cache.nukeSignatures;
      this.cache.nukeSignatures = {};
      for (const sig of oldArr) {
        if (sig.guildId) {
          if (!this.cache.nukeSignatures[sig.guildId]) this.cache.nukeSignatures[sig.guildId] = [];
          this.cache.nukeSignatures[sig.guildId].push(sig);
        }
      }
    }
    return this.cache.nukeSignatures[guildId] || [];
  }

  addNukeSignature(guildId, signature) {
    if (!this.cache.nukeSignatures) this.cache.nukeSignatures = {};
    if (Array.isArray(this.cache.nukeSignatures)) {
      this.cache.nukeSignatures = {};
    }
    if (!this.cache.nukeSignatures[guildId]) {
      this.cache.nukeSignatures[guildId] = [];
    }
    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: Date.now(),
      ...signature
    };
    this.cache.nukeSignatures[guildId].unshift(entry);
    if (this.cache.nukeSignatures[guildId].length > 50) {
      this.cache.nukeSignatures[guildId] = this.cache.nukeSignatures[guildId].slice(0, 50);
    }
    this.save();
    return entry;
  }

  clearNukeSignatures(guildId) {
    if (!this.cache.nukeSignatures) this.cache.nukeSignatures = {};
    if (Array.isArray(this.cache.nukeSignatures)) this.cache.nukeSignatures = {};
    this.cache.nukeSignatures[guildId] = [];
    this.save();
    return true;
  }

  updateNukeSignature(guildId, signatureId, updates) {
    if (!this.cache.nukeSignatures || !this.cache.nukeSignatures[guildId]) return false;
    const sig = this.cache.nukeSignatures[guildId].find(s => s.id === signatureId);
    if (!sig) return false;
    Object.assign(sig, updates);
    this.save();
    return sig;
  }

  getNukeFlaws(guildId) {
    const list = this.getNukeSignatures(guildId);
    return list.filter(s => s.flawDetected);
  }

  clearNukeFlaws(guildId) {
    if (!this.cache.nukeSignatures || !this.cache.nukeSignatures[guildId]) return true;
    for (const sig of this.cache.nukeSignatures[guildId]) {
      if (sig.flawDetected) sig.flawDetected = false;
    }
    this.save();
    return true;
  }

  // --- REAL-TIME SECURITY LIVE AUDIT & INCIDENT RECORDS ---
  getSecurityLiveRecords(guildId, limit = 50) {
    if (!this.cache.securityLiveRecords) this.cache.securityLiveRecords = {};
    if (Array.isArray(this.cache.securityLiveRecords)) {
      this.cache.securityLiveRecords = {};
    }
    const list = this.cache.securityLiveRecords[guildId] || [];
    return list.slice(0, limit);
  }

  addSecurityLiveRecord(guildId, record) {
    if (!this.cache.securityLiveRecords) this.cache.securityLiveRecords = {};
    if (Array.isArray(this.cache.securityLiveRecords)) {
      this.cache.securityLiveRecords = {};
    }
    if (!this.cache.securityLiveRecords[guildId]) {
      this.cache.securityLiveRecords[guildId] = [];
    }
    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      executorTag: record.executorTag || 'Unknown',
      executorId: record.executorId || 'Unknown',
      eventType: record.eventType || 'Security Alert',
      verdict: record.verdict || 'Neutralized',
      rollback: record.rollback || 'Completed',
      latencyMs: record.latencyMs || 1,
      severity: record.severity || 'high'
    };
    this.cache.securityLiveRecords[guildId].unshift(entry);
    if (this.cache.securityLiveRecords[guildId].length > 100) {
      this.cache.securityLiveRecords[guildId] = this.cache.securityLiveRecords[guildId].slice(0, 100);
    }
    this.save();
    return entry;
  }

  clearSecurityLiveRecords(guildId) {
    if (!this.cache.securityLiveRecords) this.cache.securityLiveRecords = {};
    if (Array.isArray(this.cache.securityLiveRecords)) this.cache.securityLiveRecords = {};
    this.cache.securityLiveRecords[guildId] = [];
    this.save();
    return true;
  }

  getLearnBaseline(guildId) {
    if (!this.cache.baselineProfiles) this.cache.baselineProfiles = {};
    return this.cache.baselineProfiles[guildId] || {
      actionsRecorded: 0,
      staffTracked: [],
      lastAction: null,
      lastUpdated: 0
    };
  }

  recordBaselineAction(guildId, executorId, eventType) {
    if (!this.cache.baselineProfiles) this.cache.baselineProfiles = {};
    if (!this.cache.baselineProfiles[guildId]) {
      this.cache.baselineProfiles[guildId] = {
        actionsRecorded: 0,
        staffTracked: [],
        lastAction: null,
        lastUpdated: 0
      };
    }
    const profile = this.cache.baselineProfiles[guildId];
    profile.actionsRecorded = (profile.actionsRecorded || 0) + 1;
    if (!profile.staffTracked.includes(executorId)) {
      profile.staffTracked.push(executorId);
      if (profile.staffTracked.length > 50) profile.staffTracked.shift();
    }
    profile.lastAction = { executorId, eventType, timestamp: Date.now() };
    profile.lastUpdated = Date.now();
    this.save();
    return profile;
  }

  setBaselineProfile(guildId, profileData) {
    if (!this.cache.baselineProfiles) this.cache.baselineProfiles = {};
    this.cache.baselineProfiles[guildId] = {
      ...(this.cache.baselineProfiles[guildId] || {}),
      ...profileData,
      lastUpdated: Date.now()
    };
    this.save();
    return this.cache.baselineProfiles[guildId];
  }

  // Warning System
  getWarnings(guildId, userId) {
    if (!this.cache.warnings[guildId]) {
      this.cache.warnings[guildId] = {};
    }
    return this.cache.warnings[guildId][userId] || [];
  }

  addWarning(guildId, userId, warnerId, reason) {
    if (!this.cache.warnings[guildId]) {
      this.cache.warnings[guildId] = {};
    }
    if (!this.cache.warnings[guildId][userId]) {
      this.cache.warnings[guildId][userId] = [];
    }

    const warning = {
      warnerId,
      reason,
      timestamp: Date.now()
    };

    this.cache.warnings[guildId][userId].push(warning);
    this.save();
    return this.cache.warnings[guildId][userId];
  }

  clearWarnings(guildId, userId) {
    if (this.cache.warnings[guildId] && this.cache.warnings[guildId][userId]) {
      this.cache.warnings[guildId][userId] = [];
      this.save();
      return true;
    }
    return false;
  }

  // Quarantine System
  getQuarantine(guildId, userId) {
    if (!this.cache.quarantines[guildId]) {
      return null;
    }
    return this.cache.quarantines[guildId][userId] || null;
  }

  addQuarantine(guildId, userId, roles, reason, previousVoiceChannelId = null, expiresAt = null) {
    if (!this.cache.quarantines[guildId]) {
      this.cache.quarantines[guildId] = {};
    }
    this.cache.quarantines[guildId][userId] = {
      roles,
      quarantinedAt: Date.now(),
      reason,
      previousVoiceChannelId,
      expiresAt   // null = permanent, timestamp = auto-unquarantine at this time
    };
    this.save();
  }

  removeQuarantine(guildId, userId) {
    if (this.cache.quarantines[guildId] && this.cache.quarantines[guildId][userId]) {
      const data = this.cache.quarantines[guildId][userId];
      delete this.cache.quarantines[guildId][userId];
      this.save();
      return data;
    }
    return null;
  }

  // Returns flat array of { guildId, userId, ...record } for all quarantined users
  getAllQuarantinedUsers() {
    const results = [];
    for (const [guildId, users] of Object.entries(this.cache.quarantines || {})) {
      for (const [userId, record] of Object.entries(users || {})) {
        results.push({ guildId, userId, ...record });
      }
    }
    return results;
  }

  getQuarantinedInGuild(guildId) {
    const guild = this.cache.quarantines?.[guildId] || {};
    return Object.entries(guild).map(([userId, record]) => ({ userId, ...record }));
  }

  // Exploit Taint System (Permanent restriction on dangerous/iconic permissions)
  addExploitTaint(guildId, userId, reason = 'Exploit violation') {
    if (!this.cache.exploitTaints) this.cache.exploitTaints = {};
    if (!this.cache.exploitTaints[guildId]) this.cache.exploitTaints[guildId] = {};
    this.cache.exploitTaints[guildId][userId] = {
      taintedAt: Date.now(),
      reason
    };
    this.save();
  }

  isExploitTainted(guildId, userId) {
    if (!this.cache.exploitTaints || !this.cache.exploitTaints[guildId]) return false;
    return Boolean(this.cache.exploitTaints[guildId][userId]);
  }

  removeExploitTaint(guildId, userId) {
    if (this.cache.exploitTaints?.[guildId]?.[userId]) {
      delete this.cache.exploitTaints[guildId][userId];
      this.save();
      return true;
    }
    return false;
  }

  getExploitTaint(guildId, userId) {
    return this.cache.exploitTaints?.[guildId]?.[userId] || null;
  }

  getExploitTaintedUsers(guildId) {
    const guild = this.cache.exploitTaints?.[guildId] || {};
    return Object.entries(guild).map(([userId, record]) => ({ userId, ...record }));
  }

  // Temporary Ban System
  addTempBan(guildId, userId, expiresAt, reason = 'No reason provided', bannedBy = null) {
    if (!this.cache.tempBans) this.cache.tempBans = {};
    if (!this.cache.tempBans[guildId]) this.cache.tempBans[guildId] = {};
    this.cache.tempBans[guildId][userId] = {
      bannedAt: Date.now(),
      expiresAt,
      reason,
      bannedBy
    };
    this.save();
  }

  removeTempBan(guildId, userId) {
    if (this.cache.tempBans?.[guildId]?.[userId]) {
      const data = this.cache.tempBans[guildId][userId];
      delete this.cache.tempBans[guildId][userId];
      this.save();
      return data;
    }
    return null;
  }

  getAllTempBans() {
    const results = [];
    for (const [guildId, users] of Object.entries(this.cache.tempBans || {})) {
      for (const [userId, record] of Object.entries(users || {})) {
        results.push({ guildId, userId, ...record });
      }
    }
    return results;
  }

  // ==========================================
  // SPAM PERMIT SYSTEM (Global)
  // ==========================================

  addSpamPermit(userId) {
    this.cache.spamPermitted = this.cache.spamPermitted || [];
    if (!this.cache.spamPermitted.includes(userId)) {
      this.cache.spamPermitted.push(userId);
      this.save();
      return true;
    }
    return false; // already permitted
  }

  removeSpamPermit(userId) {
    this.cache.spamPermitted = this.cache.spamPermitted || [];
    const idx = this.cache.spamPermitted.indexOf(userId);
    if (idx !== -1) {
      this.cache.spamPermitted.splice(idx, 1);
      this.save();
      return true;
    }
    return false; // not found
  }

  isSpamPermitted(userId) {
    this.cache.spamPermitted = this.cache.spamPermitted || [];
    return this.cache.spamPermitted.includes(userId);
  }

  getSpamPermitted() {
    return this.cache.spamPermitted || [];
  }

  // ==========================================
  // ALLOWED LINKS SYSTEM (per guild)
  // Domains that bypass the anti-link filter
  // ==========================================

  addAllowedLink(guildId, domain) {
    const config = this.getGuildConfig(guildId);
    const clean = domain.trim().toLowerCase();
    if (!config.allowedLinks) config.allowedLinks = [];
    if (!config.allowedLinks.includes(clean)) {
      config.allowedLinks.push(clean);
      this.updateGuildConfig(guildId, { allowedLinks: config.allowedLinks });
      return true;
    }
    return false;
  }

  removeAllowedLink(guildId, domain) {
    const config = this.getGuildConfig(guildId);
    const clean = domain.trim().toLowerCase();
    if (!config.allowedLinks) return false;
    const idx = config.allowedLinks.indexOf(clean);
    if (idx !== -1) {
      config.allowedLinks.splice(idx, 1);
      this.updateGuildConfig(guildId, { allowedLinks: config.allowedLinks });
      return true;
    }
    return false;
  }

  getAllowedLinks(guildId) {
    const config = this.getGuildConfig(guildId);
    return config.allowedLinks || [];
  }

  // ==========================================
  // SERVER BACKUP SYSTEM
  // ==========================================

  saveBackup(backupId, data) {
    // If guild already has a backup, delete old one first
    const oldId = this.cache.guildBackupMap[data.guildId];
    if (oldId && oldId !== backupId) {
      delete this.cache.backups[oldId];
    }
    this.cache.backups[backupId] = data;
    this.cache.guildBackupMap[data.guildId] = backupId;
    this.save();
  }

  getBackup(backupId) {
    return this.cache.backups[backupId] || null;
  }

  getBackupByGuild(guildId) {
    const id = this.cache.guildBackupMap[guildId];
    return id ? this.cache.backups[id] : null;
  }

  deleteBackup(backupId) {
    const backup = this.cache.backups[backupId];
    if (backup) {
      delete this.cache.guildBackupMap[backup.guildId];
      delete this.cache.backups[backupId];
      this.save();
      return true;
    }
    return false;
  }

  getAllBackups() {
    return Object.entries(this.cache.backups || {}).map(([id, data]) => ({ id, ...data }));
  }

  // ==========================================
  // MODIFICATION MODE
  // ==========================================

  setModMode(guildId, expiresAt, startedBy) {
    this.cache.modModes = this.cache.modModes || {};
    this.cache.modModes[guildId] = { expiresAt, startedBy };
    this.save();
  }

  getModMode(guildId) {
    return this.cache.modModes?.[guildId] || null;
  }

  clearModMode(guildId) {
    if (this.cache.modModes?.[guildId]) {
      delete this.cache.modModes[guildId];
      this.save();
    }
  }

  isModModeActive(guildId) {
    const mm = this.cache.modModes?.[guildId];
    if (!mm) return false;
    if (Date.now() > mm.expiresAt) {
      this.clearModMode(guildId);
      return false;
    }
    return true;
  }

  // ==========================================
  // TRIGGERS (Auto-Responder)
  // ==========================================

  getTriggers(guildId) {
    if (!this.cache.triggers) this.cache.triggers = {};
    return this.cache.triggers[guildId] || [];
  }

  getTrigger(guildId, match) {
    if (!this.cache.triggers || !this.cache.triggers[guildId]) return null;
    return this.cache.triggers[guildId].find(t => t.match.toLowerCase() === match.toLowerCase()) || null;
  }

  setTrigger(guildId, triggerData) {
    if (!this.cache.triggers) this.cache.triggers = {};
    if (!this.cache.triggers[guildId]) this.cache.triggers[guildId] = [];

    const matchLower = triggerData.match.trim().toLowerCase();
    const index = this.cache.triggers[guildId].findIndex(t => t.match.toLowerCase() === matchLower);

    const formatted = {
      match: triggerData.match.trim(),
      heading: triggerData.heading || null,
      content: triggerData.content || triggerData.response || '',
      gif: triggerData.gif || null,
      footer: triggerData.footer || null,
      type: triggerData.type || 'ar',
      reaction: triggerData.reaction || null,
      mirrorChannel: triggerData.mirrorChannel || null,
      ghost: typeof triggerData.ghost === 'number' ? triggerData.ghost : (triggerData.ghost ? parseInt(triggerData.ghost, 10) || null : null),
      rewardXp: typeof triggerData.rewardXp === 'number' ? triggerData.rewardXp : (triggerData.rewardXp ? parseInt(triggerData.rewardXp, 10) || null : null),
      maxClaims: typeof triggerData.maxClaims === 'number' ? triggerData.maxClaims : (triggerData.maxClaims ? parseInt(triggerData.maxClaims, 10) || null : null),
      claims: Array.isArray(triggerData.claims) ? triggerData.claims : [],
      timeVariant: triggerData.timeVariant || 'always',
      audience: triggerData.audience || 'all',
      helpfulCount: typeof triggerData.helpfulCount === 'number' ? triggerData.helpfulCount : 0,
      unhelpfulCount: typeof triggerData.unhelpfulCount === 'number' ? triggerData.unhelpfulCount : 0,
      helpfulVoters: Array.isArray(triggerData.helpfulVoters) ? triggerData.helpfulVoters : [],
      updatedAt: Date.now()
    };

    if (index !== -1) {
      const existing = this.cache.triggers[guildId][index];
      if (!triggerData.claims && existing.claims) formatted.claims = existing.claims;
      if (triggerData.helpfulCount === undefined && existing.helpfulCount !== undefined) formatted.helpfulCount = existing.helpfulCount;
      if (triggerData.unhelpfulCount === undefined && existing.unhelpfulCount !== undefined) formatted.unhelpfulCount = existing.unhelpfulCount;
      if (!triggerData.helpfulVoters && existing.helpfulVoters) formatted.helpfulVoters = existing.helpfulVoters;
      this.cache.triggers[guildId][index] = formatted;
    } else {
      this.cache.triggers[guildId].push(formatted);
    }
    this.save();
    return true;
  }

  claimEasterEggTrigger(guildId, match, userId) {
    if (!this.cache.triggers || !this.cache.triggers[guildId]) return { success: false, reason: 'not_found' };
    const matchLower = (match || '').trim().toLowerCase();
    const trigger = this.cache.triggers[guildId].find(t => t.match.toLowerCase() === matchLower);
    if (!trigger || !trigger.rewardXp) return { success: false, reason: 'not_bounty' };

    if (!Array.isArray(trigger.claims)) trigger.claims = [];
    if (trigger.claims.includes(userId)) {
      return { success: false, reason: 'already_claimed', rewardXp: trigger.rewardXp, claimsCount: trigger.claims.length, maxClaims: trigger.maxClaims };
    }
    if (trigger.maxClaims && trigger.claims.length >= trigger.maxClaims) {
      return { success: false, reason: 'max_reached', rewardXp: trigger.rewardXp, claimsCount: trigger.claims.length, maxClaims: trigger.maxClaims };
    }

    trigger.claims.push(userId);
    this.save();
    return {
      success: true,
      rewardXp: trigger.rewardXp,
      claimsCount: trigger.claims.length,
      maxClaims: trigger.maxClaims
    };
  }

  rateTrigger(guildId, match, isHelpful = true, userId = null) {
    if (!this.cache.triggers || !this.cache.triggers[guildId]) return { helpful: 0, unhelpful: 0, changed: false };
    const matchLower = (match || '').trim().toLowerCase();
    const trigger = this.cache.triggers[guildId].find(t => t.match.toLowerCase() === matchLower);
    if (!trigger) return { helpful: 0, unhelpful: 0, changed: false };

    if (!Array.isArray(trigger.helpfulVoters)) trigger.helpfulVoters = [];
    if (userId && trigger.helpfulVoters.includes(userId)) {
      return { helpful: trigger.helpfulCount || 0, unhelpful: trigger.unhelpfulCount || 0, changed: false, alreadyVoted: true };
    }

    if (userId) trigger.helpfulVoters.push(userId);
    if (isHelpful) {
      trigger.helpfulCount = (trigger.helpfulCount || 0) + 1;
    } else {
      trigger.unhelpfulCount = (trigger.unhelpfulCount || 0) + 1;
    }
    this.save();
    return { helpful: trigger.helpfulCount, unhelpful: trigger.unhelpfulCount, changed: true, alreadyVoted: false };
  }

  addTrigger(guildId, match, response, extra = {}) {
    return this.setTrigger(guildId, {
      match,
      content: response,
      heading: extra.heading || null,
      gif: extra.gif || null,
      footer: extra.footer || null
    });
  }

  updateTrigger(guildId, match, updates = {}) {
    const existing = this.getTrigger(guildId, match);
    if (!existing) return false;
    return this.setTrigger(guildId, { ...existing, ...updates, match: updates.match || existing.match });
  }

  removeTrigger(guildId, match) {
    if (!this.cache.triggers) return false;
    if (!this.cache.triggers[guildId]) return false;

    const initialLength = this.cache.triggers[guildId].length;
    this.cache.triggers[guildId] = this.cache.triggers[guildId].filter(
      t => t.match.toLowerCase() !== match.toLowerCase()
    );

    if (this.cache.triggers[guildId].length !== initialLength) {
      this.save();
      return true;
    }
    return false;
  }

  clearTriggers(guildId) {
    if (!this.cache.triggers) return false;
    this.cache.triggers[guildId] = [];
    this.save();
    return true;
  }

  clearAutoReplies(guildId) {
    if (!this.cache.triggers || !this.cache.triggers[guildId]) return false;
    this.cache.triggers[guildId] = this.cache.triggers[guildId].filter(t => t.type === 'trigger');
    this.save();
    return true;
  }

  clearTriggersOnly(guildId) {
    if (!this.cache.triggers || !this.cache.triggers[guildId]) return false;
    this.cache.triggers[guildId] = this.cache.triggers[guildId].filter(t => t.type !== 'trigger');
    this.save();
    return true;
  }

  getAutoReplies(guildId) {
    if (!this.cache.triggers || !this.cache.triggers[guildId]) return [];
    return this.cache.triggers[guildId].filter(t => t.type !== 'trigger');
  }

  getTriggersOnly(guildId) {
    if (!this.cache.triggers || !this.cache.triggers[guildId]) return [];
    return this.cache.triggers[guildId].filter(t => t.type === 'trigger');
  }

  getAutoReply(guildId, match) {
    if (!this.cache.triggers || !this.cache.triggers[guildId]) return null;
    const matchLower = (match || '').trim().toLowerCase();
    return this.cache.triggers[guildId].find(t => t.match.toLowerCase() === matchLower && t.type !== 'trigger') || null;
  }

  getTriggerOnly(guildId, match) {
    if (!this.cache.triggers || !this.cache.triggers[guildId]) return null;
    const matchLower = (match || '').trim().toLowerCase();
    return this.cache.triggers[guildId].find(t => t.match.toLowerCase() === matchLower && t.type === 'trigger') || null;
  }

  isGlobalTriggerDisabled(guildId, match) {
    const config = this.getGuildConfig(guildId);
    if (!config || !Array.isArray(config.disabledGlobalTriggers)) return false;
    const matchLower = (match || '').trim().toLowerCase();
    return config.disabledGlobalTriggers.some(m => m.toLowerCase() === matchLower);
  }

  disableGlobalTriggerForGuild(guildId, match) {
    const config = this.getGuildConfig(guildId);
    const matchLower = (match || '').trim().toLowerCase();
    const list = Array.isArray(config?.disabledGlobalTriggers) ? [...config.disabledGlobalTriggers] : [];
    if (!list.some(m => m.toLowerCase() === matchLower)) {
      list.push(matchLower);
      this.updateGuildConfig(guildId, { disabledGlobalTriggers: list });
    }
    return true;
  }

  enableGlobalTriggerForGuild(guildId, match) {
    const config = this.getGuildConfig(guildId);
    if (!config || !Array.isArray(config?.disabledGlobalTriggers)) return true;
    const matchLower = (match || '').trim().toLowerCase();
    const list = config.disabledGlobalTriggers.filter(m => m.toLowerCase() !== matchLower);
    this.updateGuildConfig(guildId, { disabledGlobalTriggers: list });
    return true;
  }

  // ==========================================
  // GLOBAL TRIGGERS (Bot Owner Only - Across all servers)
  // ==========================================

  getGlobalTriggers() {
    if (!this.cache.globalTriggers) this.cache.globalTriggers = [];
    return this.cache.globalTriggers;
  }

  getGlobalTrigger(match) {
    if (!this.cache.globalTriggers) return null;
    return this.cache.globalTriggers.find(t => t.match.toLowerCase() === match.toLowerCase()) || null;
  }

  setGlobalTrigger(triggerData) {
    if (!this.cache.globalTriggers) this.cache.globalTriggers = [];
    const matchLower = triggerData.match.trim().toLowerCase();
    const index = this.cache.globalTriggers.findIndex(t => t.match.toLowerCase() === matchLower);

    const formatted = {
      match: triggerData.match.trim(),
      heading: triggerData.heading || null,
      content: triggerData.content || triggerData.response || '',
      gif: triggerData.gif || null,
      footer: triggerData.footer || null,
      isGlobal: true,
      updatedAt: Date.now()
    };

    if (index !== -1) {
      this.cache.globalTriggers[index] = formatted;
    } else {
      this.cache.globalTriggers.push(formatted);
    }
    this.save();
    return true;
  }

  removeGlobalTrigger(match) {
    if (!this.cache.globalTriggers) return false;
    const initialLength = this.cache.globalTriggers.length;
    this.cache.globalTriggers = this.cache.globalTriggers.filter(
      t => t.match.toLowerCase() !== match.toLowerCase()
    );

    if (this.cache.globalTriggers.length !== initialLength) {
      this.save();
      return true;
    }
    return false;
  }

  clearGlobalTriggers() {
    this.cache.globalTriggers = [];
    this.save();
    return true;
  }

  // ==========================================
  // JOIN TO CREATE (JTC)
  // ==========================================

  getJtcConfig(guildId) {
    if (!this.cache.jtc) this.cache.jtc = {};
    return this.cache.jtc[guildId] || null;
  }

  setJtcConfig(guildId, lobbyChannelId, categoryId, panelChannelId = null) {
    if (!this.cache.jtc) this.cache.jtc = {};
    // Preserve existing panelMessageId if panel channel hasn't changed
    const existing = this.cache.jtc[guildId];
    const sameChannel = existing?.panelChannelId === panelChannelId;
    const panelMessageId = (sameChannel ? existing?.panelMessageId : null) || null;
    const secondaryLobbyChannelId = existing?.secondaryLobbyChannelId || null;
    this.cache.jtc[guildId] = { lobbyChannelId, categoryId, panelChannelId, panelMessageId, secondaryLobbyChannelId };
    this.save();
  }

  setPanelMessageId(guildId, messageId) {
    if (!this.cache.jtc?.[guildId]) return;
    this.cache.jtc[guildId].panelMessageId = messageId;
    this.cache.jtc[guildId].panelMessageId = messageId;
    this.save();
  }

  setSecondaryJtcConfig(guildId, secondaryLobbyChannelId) {
    if (!this.cache.jtc) this.cache.jtc = {};
    if (!this.cache.jtc[guildId]) {
      this.cache.jtc[guildId] = { lobbyChannelId: null, categoryId: null, panelChannelId: null, panelMessageId: null };
    }
    this.cache.jtc[guildId].secondaryLobbyChannelId = secondaryLobbyChannelId;
    this.save();
  }

  clearJtcConfig(guildId) {
    if (!this.cache.jtc) return;
    delete this.cache.jtc[guildId];
    this.save();
  }

  // Active temp channels
  getJtcChannel(channelId) {
    if (!this.cache.jtcChannels) this.cache.jtcChannels = {};
    return this.cache.jtcChannels[channelId] || null;
  }

  addJtcChannel(channelId, ownerId, guildId) {
    if (!this.cache.jtcChannels) this.cache.jtcChannels = {};
    this.cache.jtcChannels[channelId] = { ownerId, guildId };
    this.save();
  }

  removeJtcChannel(channelId) {
    if (!this.cache.jtcChannels) return;
    delete this.cache.jtcChannels[channelId];
    this.save();
  }

  setJtcOwner(channelId, ownerId) {
    if (!this.cache.jtcChannels?.[channelId]) return;
    this.cache.jtcChannels[channelId].ownerId = ownerId;
    this.save();
  }

  setJtcTextChannel(channelId, textChannelId) {
    if (!this.cache.jtcChannels?.[channelId]) return;
    this.cache.jtcChannels[channelId].textChannelId = textChannelId;
    this.save();
  }

  isJtcChannel(channelId) {
    return !!(this.cache.jtcChannels?.[channelId]);
  }

  getAllJtcChannels() {
    if (!this.cache.jtcChannels) return [];
    return Object.entries(this.cache.jtcChannels).map(([channelId, data]) => ({ channelId, ...data }));
  }

  // ==========================================
  // WELCOME / LEAVE CONFIG
  // ==========================================
  getWelcomeConfig(guildId) {
    return this.cache.welcome?.[guildId] || null;
  }

  setWelcomeConfig(guildId, config) {
    if (!this.cache.welcome) this.cache.welcome = {};
    this.cache.welcome[guildId] = config;
    this.save();
  }

  getLeaveConfig(guildId) {
    return this.cache.leave?.[guildId] || null;
  }

  setLeaveConfig(guildId, config) {
    if (!this.cache.leave) this.cache.leave = {};
    this.cache.leave[guildId] = config;
    this.save();
  }

  // ==========================================
  // BOT WHITELIST (per-guild trusted bots)
  // ==========================================
  getBotWhitelist(guildId) {
    if (!this.cache.botWhitelist) this.cache.botWhitelist = {};
    return this.cache.botWhitelist[guildId] || [];
  }

  addBotToWhitelist(guildId, botId) {
    if (!this.cache.botWhitelist) this.cache.botWhitelist = {};
    if (!this.cache.botWhitelist[guildId]) this.cache.botWhitelist[guildId] = [];
    if (!this.cache.botWhitelist[guildId].includes(botId)) {
      this.cache.botWhitelist[guildId].push(botId);
      this.save();
    }
  }

  removeBotFromWhitelist(guildId, botId) {
    if (!this.cache.botWhitelist[guildId]) return;
    this.cache.botWhitelist[guildId] = this.cache.botWhitelist[guildId].filter(id => id !== botId);
    this.save();
  }

  // Emergency State
  getEmergencyState(guildId) {
    return this.cache.emergencies[guildId] || null;
  }

  saveEmergencyState(guildId, state) {
    this.cache.emergencies[guildId] = state;
    this.save();
  }

  clearEmergencyState(guildId) {
    if (this.cache.emergencies[guildId]) {
      delete this.cache.emergencies[guildId];
      this.save();
    }
  }

  isBotWhitelisted(guildId, botId) {
    return (this.cache.botWhitelist?.[guildId] || []).includes(botId);
  }

  // ==========================================
  // BIRTHDAY WISHING SYSTEM
  // ==========================================
  getBirthdayConfig(guildId) {
    if (!this.cache.birthdays) this.cache.birthdays = {};
    if (!this.cache.birthdays[guildId]) {
      this.cache.birthdays[guildId] = { channelId: null, users: {} };
      this.save();
    }
    return this.cache.birthdays[guildId];
  }

  setBirthdayChannel(guildId, channelId) {
    const config = this.getBirthdayConfig(guildId);
    config.channelId = channelId;
    this.save();
  }

  setWelcomeChannel(guildId, channelId) {
    this.getGuildConfig(guildId);
    this.cache.guilds[guildId].welcomeChannel = channelId;
    this.save();
  }

  setStatsChannel(guildId, channelId) {
    this.getGuildConfig(guildId);
    this.cache.guilds[guildId].statsChannelId = channelId;
    this.save();
  }

  setDashboardInfo(guildId, channelId, messageIds = []) {
    this.getGuildConfig(guildId);
    this.cache.guilds[guildId].dashboardChannelId = channelId;
    this.cache.guilds[guildId].dashboardMessageIds = messageIds;
    this.save();
  }

  setBirthday(guildId, userId, day, month) {
    const config = this.getBirthdayConfig(guildId);
    if (!config.users) config.users = {};
    config.users[userId] = { day, month };
    this.save();
  }

  removeBirthday(guildId, userId) {
    const config = this.getBirthdayConfig(guildId);
    if (config.users && config.users[userId]) {
      delete config.users[userId];
      this.save();
      return true;
    }
    return false;
  }

  // ==========================================
  // TICKET SYSTEM
  // ==========================================
  getTickets(guildId) {
    if (!this.cache.tickets[guildId]) {
      this.cache.tickets[guildId] = {
        categoryId: null,
        staffRoleIds: [],
        ticketCount: 0,
        activeTickets: {},
        panelMessageId: null,
        panelChannelId: null,
        panelTitle: 'Support Tickets',
        panelDescription: 'Need help? Select an option from the dropdown below to open a private ticket.',
        panelImage: null,
        panelThumbnail: null,
        panelPlaceholder: 'Select a reason...',
        panelOptions: [] // { label, description, emoji, value }
      };
      this.save();
    }
    return this.cache.tickets[guildId];
  }

  updateTicketConfig(guildId, updates) {
    const config = this.getTickets(guildId);
    Object.assign(config, updates);
    this.save();
    return config;
  }

  createTicket(guildId, textId, voiceId, ownerId) {
    const config = this.getTickets(guildId);
    config.ticketCount = (config.ticketCount || 0) + 1;
    const ticketId = config.ticketCount.toString().padStart(4, '0');
    
    config.activeTickets[ticketId] = {
      textId,
      voiceId,
      ownerId,
      createdAt: Date.now()
    };
    
    this.save();
    return ticketId;
  }

  closeTicket(guildId, ticketId) {
    const config = this.getTickets(guildId);
    if (config.activeTickets && config.activeTickets[ticketId]) {
      const ticketData = config.activeTickets[ticketId];
      delete config.activeTickets[ticketId];
      this.save();
      return ticketData;
    }
    return null;
  }

  // ==========================================
  // GIVEAWAY SYSTEM
  // ==========================================

  // Verification System
  getVerification(guildId) {
    if (!this.cache.verification) this.cache.verification = {};
    return this.cache.verification[guildId] || {};
  }

  updateVerification(guildId, data) {
    if (!this.cache.verification) this.cache.verification = {};
    this.cache.verification[guildId] = data;
    this.save();
  }

  deleteVerification(guildId) {
    if (!this.cache.verification) return;
    delete this.cache.verification[guildId];
    this.save();
  }

  getGiveaway(messageId) {
    if (!this.cache.giveaways) this.cache.giveaways = {};
    return this.cache.giveaways[messageId] || null;
  }

  saveGiveaway(messageId, data) {
    if (!this.cache.giveaways) this.cache.giveaways = {};
    this.cache.giveaways[messageId] = data;
    this.save();
  }

  saveGiveaways() {
    this.save();
  }

  removeGiveaway(messageId) {
    if (!this.cache.giveaways) return;
    if (this.cache.giveaways[messageId]) {
      delete this.cache.giveaways[messageId];
      this.save();
    }
  }

  addGiveawayParticipant(messageId, userId) {
    const gw = this.getGiveaway(messageId);
    if (!gw) return false;
    
    if (!gw.participants.includes(userId)) {
      gw.participants.push(userId);
      this.save();
      return true; // Joined
    } else {
      // User is already in it, remove them (toggle functionality)
      gw.participants = gw.participants.filter(id => id !== userId);
      this.save();
      return false; // Left
    }
  }

  getActiveGiveaways() {
    if (!this.cache.giveaways) return [];
    return Object.entries(this.cache.giveaways).map(([messageId, data]) => ({ messageId, ...data }));
  }
  // --------------------------------------------------------------------------
  // XP & Leveling System
  // --------------------------------------------------------------------------

  getXpSystem(guildId) {
    if (!this.cache.xpSystems[guildId]) {
      this.cache.xpSystems[guildId] = {
        enabled: false,
        announceChannelId: null,
        cmdChannelId: null,
        roleRewards: {}, // level (string) -> roleId
        multipliers: {}  // roleId -> multiplier (number)
      };
      this.save();
    }
    return this.cache.xpSystems[guildId];
  }

  setXpSystem(guildId, data) {
    this.cache.xpSystems[guildId] = data;
    this.save();
  }

  getUserXp(guildId, userId) {
    if (!this.cache.usersXp[guildId]) {
      this.cache.usersXp[guildId] = {};
    }
    if (!this.cache.usersXp[guildId][userId]) {
      this.cache.usersXp[guildId][userId] = {
        xp: 0,
        level: 0,
        lastMessageAt: 0,
        voiceJoinAt: 0
      };
      this.save();
    }
    return this.cache.usersXp[guildId][userId];
  }

  setUserXp(guildId, userId, data) {
    if (!this.cache.usersXp[guildId]) {
      this.cache.usersXp[guildId] = {};
    }
    this.cache.usersXp[guildId][userId] = data;
    this.save();
  }

  getTopUsersXp(guildId, limit = 10) {
    if (!this.cache.usersXp[guildId]) return [];
    
    return Object.entries(this.cache.usersXp[guildId])
      .map(([userId, data]) => ({ userId, ...data }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, limit);
  }

  getAllUsersXp(guildId) {
    if (!this.cache.usersXp || !this.cache.usersXp[guildId]) return [];
    return Object.entries(this.cache.usersXp[guildId]).map(([userId, data]) => ({
      userId,
      ...data
    }));
  }

  // --------------------------------------------------------------------------
  // Move Protection System
  // --------------------------------------------------------------------------
  getMoveProtectedUsers(guildId) {
    if (!this.cache.moveProtection[guildId]) {
      this.cache.moveProtection[guildId] = [];
      this.save();
    }
    return this.cache.moveProtection[guildId];
  }

  isMoveProtected(guildId, userId) {
    const protectedUsers = this.getMoveProtectedUsers(guildId);
    return protectedUsers.includes(userId);
  }

  addMoveProtectedUser(guildId, userId) {
    const protectedUsers = this.getMoveProtectedUsers(guildId);
    if (!protectedUsers.includes(userId)) {
      protectedUsers.push(userId);
      this.save();
      return true;
    }
    return false;
  }

  removeMoveProtectedUser(guildId, userId) {
    let protectedUsers = this.getMoveProtectedUsers(guildId);
    const initialLen = protectedUsers.length;
    this.cache.moveProtection[guildId] = protectedUsers.filter(id => id !== userId);
    if (this.cache.moveProtection[guildId].length < initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // VC Protection System (Mute/Deafen)
  // --------------------------------------------------------------------------
  getVcProtectedUsers(guildId) {
    if (!this.cache.vcProtection) this.cache.vcProtection = {};
    if (!this.cache.vcProtection[guildId]) {
      this.cache.vcProtection[guildId] = [];
      this.save();
    }
    return this.cache.vcProtection[guildId];
  }

  isVcProtected(guildId, userId) {
    const protectedUsers = this.getVcProtectedUsers(guildId);
    return protectedUsers.includes(userId);
  }

  addVcProtectedUser(guildId, userId) {
    const protectedUsers = this.getVcProtectedUsers(guildId);
    if (!protectedUsers.includes(userId)) {
      protectedUsers.push(userId);
      this.save();
      return true;
    }
    return false;
  }

  removeVcProtectedUser(guildId, userId) {
    let protectedUsers = this.getVcProtectedUsers(guildId);
    const initialLen = protectedUsers.length;
    this.cache.vcProtection[guildId] = protectedUsers.filter(id => id !== userId);
    if (this.cache.vcProtection[guildId].length < initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Mass Role System
  // --------------------------------------------------------------------------
  saveMassRole(guildId, roleId, userIds) {
    if (!this.cache.massRoles) this.cache.massRoles = {};
    if (!this.cache.massRoles[guildId]) this.cache.massRoles[guildId] = {};
    this.cache.massRoles[guildId][roleId] = userIds;
    this.save();
    return true;
  }

  getMassRole(guildId, roleId) {
    if (!this.cache.massRoles || !this.cache.massRoles[guildId]) return [];
    return this.cache.massRoles[guildId][roleId] || [];
  }
  // Global Bot Blacklist (Flags)
  getBotBlacklist() {
    return this.cache.botBlacklist || [];
  }

  getBotBlacklistData() {
    return this.cache.botBlacklistData || {};
  }

  isUserBotBlacklisted(userId) {
    if (!this.cache.botBlacklist) this.cache.botBlacklist = [];
    return this.cache.botBlacklist.includes(userId);
  }

  addUserToBotBlacklist(userId, reason = null) {
    if (!this.cache.botBlacklist) this.cache.botBlacklist = [];
    if (!this.cache.botBlacklistData) this.cache.botBlacklistData = {};
    if (!this.cache.botBlacklist.includes(userId)) {
      this.cache.botBlacklist.push(userId);
    }
    this.cache.botBlacklistData[userId] = {
      userId,
      reason: reason || 'Violation of Athena Bot Rules & Security Protocols',
      timestamp: Date.now()
    };
    this.save();
    return true;
  }

  removeUserFromBotBlacklist(userId) {
    if (!this.cache.botBlacklist) this.cache.botBlacklist = [];
    const initialLen = this.cache.botBlacklist.length;
    this.cache.botBlacklist = this.cache.botBlacklist.filter(id => id !== userId);
    if (this.cache.botBlacklistData && this.cache.botBlacklistData[userId]) {
      delete this.cache.botBlacklistData[userId];
    }
    if (this.cache.botBlacklist.length < initialLen || this.cache.botBlacklistData) {
      this.save();
      return true;
    }
    return false;
  }

  // --- Bump Reminders ---
  getBumpReminders() {
    if (!this.cache.bumpReminders) this.cache.bumpReminders = {};
    return this.cache.bumpReminders;
  }

  setBumpReminder(guildId, data) {
    if (!this.cache.bumpReminders) this.cache.bumpReminders = {};
    this.cache.bumpReminders[guildId] = data;
    this.save();
  }

  deleteBumpReminder(guildId) {
    if (!this.cache.bumpReminders) this.cache.bumpReminders = {};
    if (this.cache.bumpReminders[guildId]) {
      delete this.cache.bumpReminders[guildId];
      this.save();
    }
  }
  // --- Edit Ratings ---
  getEditRating(messageId) {
    if (!this.cache.editRatings) this.cache.editRatings = {};
    return this.cache.editRatings[messageId];
  }

  getAllEditRatings() {
    if (!this.cache.editRatings) this.cache.editRatings = {};
    return this.cache.editRatings;
  }

  createEditRating(messageId, data) {
    if (!this.cache.editRatings) this.cache.editRatings = {};
    this.cache.editRatings[messageId] = {
      authorId: data.authorId,
      authorName: data.authorName,
      mediaUrl: data.mediaUrl,
      votes: {}
    };
    this.save();
  }

  updateEditRating(messageId, userId, userName, starCount) {
    if (!this.cache.editRatings) this.cache.editRatings = {};
    if (this.cache.editRatings[messageId]) {
      this.cache.editRatings[messageId].votes[userId] = { stars: starCount, name: userName };
      this.save();
      return true;
    }
    return false;
  }

  deleteEditRating(messageId) {
    if (!this.cache.editRatings) this.cache.editRatings = {};
    if (this.cache.editRatings[messageId]) {
      delete this.cache.editRatings[messageId];
      this.save();
    }
  }

  // --- Rate Channels ---
  getRateChannel(guildId) {
    if (!this.cache.rateChannels) this.cache.rateChannels = {};
    return this.cache.rateChannels[guildId] || null;
  }

  setRateChannel(guildId, channelId) {
    if (!this.cache.rateChannels) this.cache.rateChannels = {};
    this.cache.rateChannels[guildId] = channelId;
    this.save();
  }

  // --- Liked Songs ---

    // --- PING ALERTS ---
    getPingAlertBlocks(userId) {
      if (!this.cache.pingAlertBlocks) this.cache.pingAlertBlocks = {};
      return this.cache.pingAlertBlocks[userId] || [];
    }
    
    addPingAlertBlock(userId, guildId) {
      if (!this.cache.pingAlertBlocks) this.cache.pingAlertBlocks = {};
      if (!this.cache.pingAlertBlocks[userId]) this.cache.pingAlertBlocks[userId] = [];
      if (!this.cache.pingAlertBlocks[userId].includes(guildId)) {
        this.cache.pingAlertBlocks[userId].push(guildId);
        this.save();
        return true;
      }
      return false;
    }

  getLikedSongs(userId) {
    if (!this.cache.likedSongs) this.cache.likedSongs = {};
    return this.cache.likedSongs[userId] || [];
  }

  toggleLikedSong(userId, song) {
    if (!this.cache.likedSongs) this.cache.likedSongs = {};
    if (!this.cache.likedSongs[userId]) this.cache.likedSongs[userId] = [];
    
    const idx = this.cache.likedSongs[userId].findIndex(s => s.url === song.url);
    let added = false;
    if (idx !== -1) {
      this.cache.likedSongs[userId].splice(idx, 1);
    } else {
      this.cache.likedSongs[userId].push({
         title: song.title,
         url: song.url,
         duration: song.duration,
         artworkUrl: song.artworkUrl,
         encoded: song.encoded
      });
      added = true;
    }
    this.save();
    return added;
  }

  // ==========================================
  // SERVER BANNING
  // ==========================================
  addBannedServer(guildId) {
    if (!this.cache.bannedServers) this.cache.bannedServers = [];
    if (!this.cache.bannedServers.includes(guildId)) {
      this.cache.bannedServers.push(guildId);
      this.save();
      return true;
    }
    return false;
  }

  removeBannedServer(guildId) {
    if (!this.cache.bannedServers) return false;
    const idx = this.cache.bannedServers.indexOf(guildId);
    if (idx > -1) {
      this.cache.bannedServers.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  isServerBanned(guildId) {
    if (!this.cache.bannedServers) return false;
    return this.cache.bannedServers.includes(guildId);
  }

  // --- STICKY MESSAGES ---
  
  getStickyMessage(guildId, channelId) {
    if (!this.cache.stickyMessages) this.cache.stickyMessages = {};
    if (!this.cache.stickyMessages[guildId]) return null;
    return this.cache.stickyMessages[guildId][channelId] || null;
  }

  setStickyMessage(guildId, channelId, content) {
    if (!this.cache.stickyMessages) this.cache.stickyMessages = {};
    if (!this.cache.stickyMessages[guildId]) {
      this.cache.stickyMessages[guildId] = {};
    }
    const existing = this.cache.stickyMessages[guildId][channelId] || {};
    this.cache.stickyMessages[guildId][channelId] = {
      content: content,
      footerText: existing.footerText || null,
      lastMessageId: existing.lastMessageId || null,
      lastSentAt: 0
    };
    this.save();
    return true;
  }

  setStickyFooter(guildId, channelId, footerText) {
    if (!this.cache.stickyMessages) return false;
    if (!this.cache.stickyMessages[guildId]) return false;
    if (this.cache.stickyMessages[guildId][channelId]) {
      this.cache.stickyMessages[guildId][channelId].footerText = footerText;
      this.cache.stickyMessages[guildId][channelId].lastSentAt = 0;
      this.save();
      return true;
    }
    return false;
  }

  removeStickyMessage(guildId, channelId) {
    if (!this.cache.stickyMessages) return false;
    if (!this.cache.stickyMessages[guildId]) return false;
    if (this.cache.stickyMessages[guildId][channelId]) {
      delete this.cache.stickyMessages[guildId][channelId];
      if (Object.keys(this.cache.stickyMessages[guildId]).length === 0) {
        delete this.cache.stickyMessages[guildId];
      }
      this.save();
      return true;
    }
    return false;
  }

  updateStickyMessageData(guildId, channelId, messageId, sentAt) {
    if (!this.cache.stickyMessages) return;
    if (!this.cache.stickyMessages[guildId]) return;
    if (this.cache.stickyMessages[guildId][channelId]) {
      this.cache.stickyMessages[guildId][channelId].lastMessageId = messageId;
      this.cache.stickyMessages[guildId][channelId].lastSentAt = sentAt;
      this.save();
    }
  }
  // --------------------------------------------------------------------------
  // AFK SYSTEM
  // --------------------------------------------------------------------------
  
  setAfk(userId, reason, timestamp) {
    this.cache.afk[userId] = { reason, timestamp };
    this.save();
  }

  getAfk(userId) {
    return this.cache.afk[userId] || null;
  }

  removeAfk(userId) {
    if (this.cache.afk[userId]) {
      delete this.cache.afk[userId];
      this.save();
      return true;
    }
    return false;
  }

  // --- YouTube Notifier Config ---
  getYouTubeNotifiers(guildId) {
    return this.getGuildConfig(guildId).youtubeNotifiers || [];
  }

  addYouTubeNotifier(guildId, data) {
    const config = this.getGuildConfig(guildId);
    if (!config.youtubeNotifiers) config.youtubeNotifiers = [];
    config.youtubeNotifiers.push(data);
    this.save();
  }

  removeYouTubeNotifier(guildId, youtubeId) {
    const config = this.getGuildConfig(guildId);
    if (!config.youtubeNotifiers) return false;
    const initialLen = config.youtubeNotifiers.length;
    config.youtubeNotifiers = config.youtubeNotifiers.filter(n => n.youtubeId !== youtubeId);
    if (config.youtubeNotifiers.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  updateYouTubeNotifier(guildId, youtubeId, discordChannelId, lastVideoId) {
    const config = this.getGuildConfig(guildId);
    if (!config.youtubeNotifiers) return;
    const notifier = config.youtubeNotifiers.find(n => n.youtubeId === youtubeId && n.discordChannelId === discordChannelId);
    if (notifier) {
      if (!notifier.recentVideoIds) {
        notifier.recentVideoIds = notifier.lastVideoId ? [notifier.lastVideoId] : [];
      }
      notifier.lastVideoId = lastVideoId;
      notifier.recentVideoIds.unshift(lastVideoId);
      // Keep only last 10
      if (notifier.recentVideoIds.length > 10) {
        notifier.recentVideoIds.pop();
      }
      this.save();
    }
  }
  // --- NP SYSTEM METHODS ---
  
  getNpManagers() {
    return this.cache.npManagers || [];
  }

  isNpManager(userId) {
    return (this.cache.npManagers || []).includes(userId);
  }

  addNpManager(userId) {
    if (!this.cache.npManagers) this.cache.npManagers = [];
    if (!this.cache.npManagers.includes(userId)) {
      this.cache.npManagers.push(userId);
      this.save();
    }
  }

  removeNpManager(userId) {
    if (this.cache.npManagers) {
      this.cache.npManagers = this.cache.npManagers.filter(id => id !== userId);
      this.save();
    }
  }

  getNpUser(userId) {
    const user = (this.cache.npUsers || {})[userId];
    if (user && user.expiresAt && Date.now() > user.expiresAt) {
      this.removeNpUser(userId);
      return null;
    }
    return user || null;
  }

  getAllNpUsers() {
    return this.cache.npUsers || {};
  }

  addNpUser(userId, expiresAt, appointedBy) {
    if (!this.cache.npUsers) this.cache.npUsers = {};
    this.cache.npUsers[userId] = {
      expiresAt: expiresAt,
      appointedBy: appointedBy,
      addedAt: Date.now()
    };
    this.save();
  }

  removeNpUser(userId) {
    if (this.cache.npUsers && this.cache.npUsers[userId]) {
      delete this.cache.npUsers[userId];
      this.save();
      return true;
    }
    return false;
  }

  getNpServer(guildId) {
    const server = (this.cache.npServers || {})[guildId];
    if (server && server.expiresAt && Date.now() > server.expiresAt) {
      this.removeNpServer(guildId);
      return null;
    }
    return server || null;
  }

  getAllNpServers() {
    return this.cache.npServers || {};
  }

  addNpServer(guildId, expiresAt, appointedBy) {
    if (!this.cache.npServers) this.cache.npServers = {};
    this.cache.npServers[guildId] = {
      expiresAt: expiresAt,
      appointedBy: appointedBy,
      addedAt: Date.now()
    };
    this.save();
  }

  removeNpServer(guildId) {
    if (this.cache.npServers && this.cache.npServers[guildId]) {
      delete this.cache.npServers[guildId];
      this.save();
      return true;
    }
    return false;
  }

  isNpPaused() {
    return !!this.cache.npPaused;
  }

  setNpPaused(paused) {
    this.cache.npPaused = paused;
    this.save();
  }

  getNpBannedCommands() {
    return this.cache.npBannedCommands || [];
  }

  banNpCommand(commandName) {
    if (!this.cache.npBannedCommands) this.cache.npBannedCommands = [];
    const name = commandName.toLowerCase();
    if (!this.cache.npBannedCommands.includes(name)) {
      this.cache.npBannedCommands.push(name);
      this.save();
      return true;
    }
    return false;
  }

  unbanNpCommand(commandName) {
    if (!this.cache.npBannedCommands) return false;
    const name = commandName.toLowerCase();
    const initialLen = this.cache.npBannedCommands.length;
    this.cache.npBannedCommands = this.cache.npBannedCommands.filter(c => c !== name);
    if (this.cache.npBannedCommands.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // --- ADEL (Auto-Delete) SYSTEM ---
  getAdelList(guildId, channelId) {
    if (!this.cache.adelList) this.cache.adelList = {};
    if (!this.cache.adelList[guildId]) return [];
    return this.cache.adelList[guildId][channelId] || [];
  }

  addAdel(guildId, channelId, userId) {
    if (!this.cache.adelList) this.cache.adelList = {};
    if (!this.cache.adelList[guildId]) this.cache.adelList[guildId] = {};
    if (!this.cache.adelList[guildId][channelId]) this.cache.adelList[guildId][channelId] = [];
    if (!this.cache.adelList[guildId][channelId].includes(userId)) {
      this.cache.adelList[guildId][channelId].push(userId);
      this.save();
      return true;
    }
    return false;
  }

  removeAdel(guildId, channelId, userId) {
    if (!this.cache.adelList) return false;
    if (!this.cache.adelList[guildId]) return false;
    if (!this.cache.adelList[guildId][channelId]) return false;
    const idx = this.cache.adelList[guildId][channelId].indexOf(userId);
    if (idx > -1) {
      this.cache.adelList[guildId][channelId].splice(idx, 1);
      if (this.cache.adelList[guildId][channelId].length === 0) {
        delete this.cache.adelList[guildId][channelId];
        if (Object.keys(this.cache.adelList[guildId]).length === 0) {
          delete this.cache.adelList[guildId];
        }
      }
      this.save();
      return true;
    }
    return false;
  }

  // --- IGNORE SYSTEM ---
  getIgnoredChannels(guildId) {
    const config = this.getGuildConfig(guildId);
    if (!config.ignoredChannels) {
      config.ignoredChannels = [];
      this.save();
    }
    return config.ignoredChannels;
  }

  updateIgnoredChannels(guildId, channels) {
    const config = this.getGuildConfig(guildId);
    config.ignoredChannels = channels;
    this.save();
  }

  getIgnoredCategories(guildId) {
    const config = this.getGuildConfig(guildId);
    if (!config.ignoredCategories) {
      config.ignoredCategories = [];
      this.save();
    }
    return config.ignoredCategories;
  }

  updateIgnoredCategories(guildId, categories) {
    const config = this.getGuildConfig(guildId);
    config.ignoredCategories = categories;
    this.save();
  }
  // --- TTS SYSTEM ---
  getAutoTtsVc(guildId) {
    if (!this.cache.tts) this.cache.tts = { users: {}, autoTts: {}, autoVc: {} };
    if (!this.cache.tts.autoVc) this.cache.tts.autoVc = {};
    return this.cache.tts.autoVc[guildId] || null;
  }

  setAutoTtsVc(guildId, vcId) {
    if (!this.cache.tts) this.cache.tts = { users: {}, autoTts: {}, autoVc: {} };
    if (!this.cache.tts.autoVc) this.cache.tts.autoVc = {};
    this.cache.tts.autoVc[guildId] = vcId;
    this.save();
  }

  getTtsPrefs(userId) {
    if (!this.cache.tts) this.cache.tts = { users: {}, autoTts: {} };
    if (!this.cache.tts.users[userId]) {
      this.cache.tts.users[userId] = { lang: 'en' };
    }
    return this.cache.tts.users[userId];
  }

  updateTtsPrefs(userId, prefs) {
    if (!this.cache.tts) this.cache.tts = { users: {}, autoTts: {} };
    this.cache.tts.users[userId] = { ...this.getTtsPrefs(userId), ...prefs };
    this.save();
  }

  getAutoTtsUsers(guildId) {
    if (!this.cache.tts) this.cache.tts = { users: {}, autoTts: {} };
    if (!this.cache.tts.autoTts[guildId]) {
      this.cache.tts.autoTts[guildId] = [];
    }
    return this.cache.tts.autoTts[guildId];
  }

  // --- STOCK MARKET SYSTEM ---
  setStockChannel(guildId, channelId) {
    const config = this.getGuildConfig(guildId);
    config.stockChannelId = channelId;
    config.dailyStockEnabled = !!channelId;
    this.save();
    return true;
  }

  getStockChannel(guildId) {
    const config = this.getGuildConfig(guildId);
    return config?.stockChannelId || null;
  }

  isDailyStockEnabled(guildId) {
    const config = this.getGuildConfig(guildId);
    return !!(config?.dailyStockEnabled && config?.stockChannelId);
  }

  setLastDailyStockSent(guildId, dateStr) {
    const config = this.getGuildConfig(guildId);
    config.lastDailyStockSentDate = dateStr;
    this.save();
    return true;
  }

  getAllStockChannels() {
    const results = [];
    if (!this.cache?.guilds) return results;
    for (const [guildId, cfg] of Object.entries(this.cache.guilds)) {
      if (cfg?.stockChannelId && cfg?.dailyStockEnabled) {
        results.push({ guildId, channelId: cfg.stockChannelId, lastSent: cfg.lastDailyStockSentDate });
      }
    }
    return results;
  }

  // --- DYNAMIC STOCK & TICKER REGISTRY ---

  getDynamicStockSymbol(query) {
    if (!query) return null;
    const clean = String(query).trim().toUpperCase();
    if (!this.cache.dynamicStockSymbols) this.cache.dynamicStockSymbols = {};

    if (this.cache.dynamicStockSymbols[clean]) {
      return this.cache.dynamicStockSymbols[clean];
    }

    // Pre-seeded rebrand & demerger fallbacks
    const KNOWN_RENAME_SEED = {
      'ZOMATO': { symbol: 'ETERNAL.NS', name: 'ETERNAL LIMITED (Zomato)', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'ETERNAL': { symbol: 'ETERNAL.NS', name: 'ETERNAL LIMITED', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'TATAMOTORS': { symbol: 'TMCV.NS', name: 'TATA MOTORS LIMITED', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'TMCV': { symbol: 'TMCV.NS', name: 'TATA MOTORS LIMITED', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'TMPV': { symbol: 'TMPV.NS', name: 'TATA MOTORS PASSENGER VEHICLES', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'SWIGGY': { symbol: 'SWIGGY.NS', name: 'SWIGGY LIMITED', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'HYUNDAI': { symbol: 'HYUNDAI.NS', name: 'HYUNDAI MOTOR INDIA LTD', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'OLAELEC': { symbol: 'OLAELEC.NS', name: 'OLA ELECTRIC MOBILITY', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'OLA': { symbol: 'OLAELEC.NS', name: 'OLA ELECTRIC MOBILITY', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'BAJAJHFL': { symbol: 'BAJAJHFL.NS', name: 'BAJAJ HOUSING FINANCE', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'PAYTM': { symbol: 'PAYTM.NS', name: 'ONE97 COMMUNICATIONS (Paytm)', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'ONE97': { symbol: 'PAYTM.NS', name: 'ONE97 COMMUNICATIONS (Paytm)', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'NYKAA': { symbol: 'NYKAA.NS', name: 'FSN E-COMMERCE (Nykaa)', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'FSN': { symbol: 'NYKAA.NS', name: 'FSN E-COMMERCE (Nykaa)', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'DELHIVERY': { symbol: 'DELHIVERY.NS', name: 'DELHIVERY LIMITED', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'POLICYBZR': { symbol: 'POLICYBZR.NS', name: 'PB FINTECH (Policybazaar)', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'POLICYBAZAAR': { symbol: 'POLICYBZR.NS', name: 'PB FINTECH (Policybazaar)', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'PBFINTECH': { symbol: 'POLICYBZR.NS', name: 'PB FINTECH (Policybazaar)', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'PALANTIR': { symbol: 'PLTR', name: 'Palantir Technologies Inc.', exchange: 'NASDAQ', currency: 'USD', assetType: 'EQUITY' },
      'FB': { symbol: 'META', name: 'Meta Platforms, Inc.', exchange: 'NASDAQ', currency: 'USD', assetType: 'EQUITY' },
      'FACEBOOK': { symbol: 'META', name: 'Meta Platforms, Inc.', exchange: 'NASDAQ', currency: 'USD', assetType: 'EQUITY' },
      'TWTR': { symbol: 'X', name: 'X Corp (formerly Twitter)', exchange: 'GLOBAL', currency: 'USD', assetType: 'EQUITY' },
      'TWITTER': { symbol: 'X', name: 'X Corp (formerly Twitter)', exchange: 'GLOBAL', currency: 'USD', assetType: 'EQUITY' },
      'GOOGLE': { symbol: 'GOOGL', name: 'Alphabet Inc. (Google)', exchange: 'NASDAQ', currency: 'USD', assetType: 'EQUITY' },
      'ALPHABET': { symbol: 'GOOGL', name: 'Alphabet Inc. (Google)', exchange: 'NASDAQ', currency: 'USD', assetType: 'EQUITY' },
      'APPLE': { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', currency: 'USD', assetType: 'EQUITY' },
      'MICROSOFT': { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', currency: 'USD', assetType: 'EQUITY' },
      'TESLA': { symbol: 'TSLA', name: 'Tesla, Inc.', exchange: 'NASDAQ', currency: 'USD', assetType: 'EQUITY' },
      'NVIDIA': { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', currency: 'USD', assetType: 'EQUITY' },
      'AMAZON': { symbol: 'AMZN', name: 'Amazon.com, Inc.', exchange: 'NASDAQ', currency: 'USD', assetType: 'EQUITY' },
      'HDFC': { symbol: 'HDFCBANK.NS', name: 'HDFC Bank Ltd', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'IDFC': { symbol: 'IDFCFIRSTB.NS', name: 'IDFC First Bank Ltd', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'IDFCFIRST': { symbol: 'IDFCFIRSTB.NS', name: 'IDFC First Bank Ltd', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'LTI': { symbol: 'LTIM.NS', name: 'LTIMindtree Limited', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' },
      'MINDTREE': { symbol: 'LTIM.NS', name: 'LTIMindtree Limited', exchange: 'NSI', currency: 'INR', assetType: 'EQUITY' }
    };

    if (KNOWN_RENAME_SEED[clean]) {
      const item = { ...KNOWN_RENAME_SEED[clean], updatedAt: Date.now() };
      this.cache.dynamicStockSymbols[clean] = item;
      this.save();
      return item;
    }

    return null;
  }

  saveDynamicStockSymbol(query, resolvedSymbol, meta = {}) {
    if (!query || !resolvedSymbol) return false;
    const clean = String(query).trim().toUpperCase();
    if (!this.cache.dynamicStockSymbols) this.cache.dynamicStockSymbols = {};

    const entry = {
      symbol: resolvedSymbol,
      name: meta.name || clean,
      exchange: meta.exchange || 'GLOBAL',
      currency: meta.currency || 'USD',
      assetType: meta.assetType || 'EQUITY',
      updatedAt: Date.now()
    };

    this.cache.dynamicStockSymbols[clean] = entry;

    const cleanResolved = resolvedSymbol.toUpperCase();
    if (clean !== cleanResolved) {
      this.cache.dynamicStockSymbols[cleanResolved] = entry;
    }

    this.save();
    return true;
  }

  deleteDynamicStockSymbol(query) {
    if (!query) return false;
    const clean = String(query).trim().toUpperCase();
    if (this.cache.dynamicStockSymbols && this.cache.dynamicStockSymbols[clean]) {
      delete this.cache.dynamicStockSymbols[clean];
      this.save();
      return true;
    }
    return false;
  }

  getAllDynamicStockSymbols(limit = 100) {
    if (!this.cache.dynamicStockSymbols) return [];
    return Object.entries(this.cache.dynamicStockSymbols)
      .map(([query, data]) => ({ query, ...data }))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, limit);
  }

  addAutoTtsUser(guildId, userId) {
    const list = this.getAutoTtsUsers(guildId);
    if (!list.includes(userId)) {
      list.push(userId);
      this.save();
    }
  }

  removeAutoTtsUser(guildId, userId) {
    let list = this.getAutoTtsUsers(guildId);
    this.cache.tts.autoTts[guildId] = list.filter(id => id !== userId);
    this.save();
  }

  // --- APP BUILDER SYSTEM ---
  getAppConfig(guildId) {
    if (!this.cache.apps) this.cache.apps = {};
    if (!this.cache.apps[guildId]) {
      this.cache.apps[guildId] = {
        logChannel: null,
        questions: ["Why do you want to be staff?", "What is your timezone?", "Do you have prior experience?"]
      };
    }
    return this.cache.apps[guildId];
  }

  updateAppConfig(guildId, data) {
    const config = this.getAppConfig(guildId);
    this.cache.apps[guildId] = { ...config, ...data };
    this.save();
  }

  // --- VC Drag Sessions Persistence ---
  getActiveVcDrags() {
    return this.cache.vcDrags || {};
  }

  saveActiveVcDrag(guildId, userId, data) {
    if (!this.cache.vcDrags) this.cache.vcDrags = {};
    if (!this.cache.vcDrags[guildId]) this.cache.vcDrags[guildId] = {};
    this.cache.vcDrags[guildId][userId] = data;
    this.save();
  }

  removeActiveVcDrag(guildId, userId) {
    if (!this.cache.vcDrags || !this.cache.vcDrags[guildId]) return;
    delete this.cache.vcDrags[guildId][userId];
    if (Object.keys(this.cache.vcDrags[guildId]).length === 0) {
      delete this.cache.vcDrags[guildId];
    }
    this.save();
  }

  // --- Counting Engine ---
  getCounting(guildId) {
    if (!this.cache.counting) this.cache.counting = {};
    if (!this.cache.counting[guildId]) {
      this.cache.counting[guildId] = {
        channelId: null,
        currentCount: 0,
        highScore: 0,
        lastUserId: null,
        lastMessageId: null,
        saves: 2,
        maxSaves: 2,
        allowMath: true,
        autoTopic: true,
        users: {}
      };
    }
    return this.cache.counting[guildId];
  }

  updateCounting(guildId, data) {
    const config = this.getCounting(guildId);
    this.cache.counting[guildId] = { ...config, ...data };
    this.save();
    return this.cache.counting[guildId];
  }

  resetCounting(guildId) {
    const config = this.getCounting(guildId);
    config.currentCount = 0;
    config.lastUserId = null;
    config.lastMessageId = null;
    this.save();
    return config;
  }

  // ==========================================
  // ECONOMY & SERVER SHOP SYSTEM
  // ==========================================
  getUserEconomy(guildId, userId) {
    if (!this.cache.economy) this.cache.economy = {};
    if (!this.cache.economy[guildId]) this.cache.economy[guildId] = {};
    if (!this.cache.economy[guildId][userId]) {
      this.cache.economy[guildId][userId] = {
        wallet: 250,
        bank: 0,
        lastDaily: 0,
        streak: 0
      };
    }
    return this.cache.economy[guildId][userId];
  }

  updateUserEconomy(guildId, userId, data) {
    const eco = this.getUserEconomy(guildId, userId);
    this.cache.economy[guildId][userId] = { ...eco, ...data };
    this.save();
    return this.cache.economy[guildId][userId];
  }

  addWallet(guildId, userId, amount) {
    const eco = this.getUserEconomy(guildId, userId);
    eco.wallet = Math.max(0, (eco.wallet || 0) + Number(amount));
    this.save();
    return eco.wallet;
  }

  removeWallet(guildId, userId, amount) {
    const eco = this.getUserEconomy(guildId, userId);
    if ((eco.wallet || 0) < amount) return false;
    eco.wallet -= Number(amount);
    this.save();
    return true;
  }

  getShopItems(guildId) {
    if (!this.cache.shopItems) this.cache.shopItems = {};
    if (!this.cache.shopItems[guildId]) this.cache.shopItems[guildId] = [];
    return this.cache.shopItems[guildId];
  }

  addShopItem(guildId, { name, price, roleId, description }) {
    const items = this.getShopItems(guildId);
    const id = 'item_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
    const newItem = { id, name, price: Number(price), roleId, description: description || '' };
    items.push(newItem);
    this.save();
    return newItem;
  }

  removeShopItem(guildId, itemId) {
    const items = this.getShopItems(guildId);
    const idx = items.findIndex(it => it.id === itemId);
    if (idx === -1) return false;
    items.splice(idx, 1);
    this.save();
    return true;
  }

  // ==========================================
  // RANK THEMES
  // ==========================================
  getUserRankTheme(userId) {
    if (!this.cache.userRankThemes) this.cache.userRankThemes = {};
    return this.cache.userRankThemes[userId] || 'hogwarts';
  }

  setUserRankTheme(userId, theme) {
    if (!this.cache.userRankThemes) this.cache.userRankThemes = {};
    this.cache.userRankThemes[userId] = theme;
    this.save();
    return theme;
  }

  // ==========================================
  // LOCKDOWN SNAPSHOTS
  // ==========================================
  getLockdownSnapshot(guildId) {
    if (!this.cache.lockdownSnapshots) this.cache.lockdownSnapshots = {};
    return this.cache.lockdownSnapshots[guildId] || null;
  }

  saveLockdownSnapshot(guildId, data) {
    if (!this.cache.lockdownSnapshots) this.cache.lockdownSnapshots = {};
    this.cache.lockdownSnapshots[guildId] = { ...data, timestamp: Date.now() };
    this.save();
    return this.cache.lockdownSnapshots[guildId];
  }

  clearLockdownSnapshot(guildId) {
    if (!this.cache.lockdownSnapshots) this.cache.lockdownSnapshots = {};
    const old = this.cache.lockdownSnapshots[guildId];
    delete this.cache.lockdownSnapshots[guildId];
    this.save();
    return old;
  }

  getChannelLockSnapshot(guildId, channelId) {
    if (!this.cache.channelLockSnapshots) this.cache.channelLockSnapshots = {};
    return this.cache.channelLockSnapshots[`${guildId}-${channelId}`] || null;
  }

  saveChannelLockSnapshot(guildId, channelId, data) {
    if (!this.cache.channelLockSnapshots) this.cache.channelLockSnapshots = {};
    this.cache.channelLockSnapshots[`${guildId}-${channelId}`] = { ...data, timestamp: Date.now() };
    this.save();
    return this.cache.channelLockSnapshots[`${guildId}-${channelId}`];
  }

  clearChannelLockSnapshot(guildId, channelId) {
    if (!this.cache.channelLockSnapshots) this.cache.channelLockSnapshots = {};
    const old = this.cache.channelLockSnapshots[`${guildId}-${channelId}`];
    delete this.cache.channelLockSnapshots[`${guildId}-${channelId}`];
    this.save();
    return old;
  }

  // ==========================================
  // PANIC & DEFCON TELEMETRY HISTORY
  // ==========================================
  recordPanicEvent(guildId, data) {
    if (!this.cache.panicHistory) this.cache.panicHistory = {};
    if (!this.cache.panicHistory[guildId]) this.cache.panicHistory[guildId] = [];
    const event = {
      id: 'defcon_' + Date.now().toString(36),
      timestamp: Date.now(),
      ...data
    };
    this.cache.panicHistory[guildId].unshift(event);
    if (this.cache.panicHistory[guildId].length > 30) {
      this.cache.panicHistory[guildId] = this.cache.panicHistory[guildId].slice(0, 30);
    }
    this.save();
    return event;
  }

  getPanicHistory(guildId) {
    if (!this.cache.panicHistory) this.cache.panicHistory = {};
    return this.cache.panicHistory[guildId] || [];
  }

  clearPanicHistory(guildId) {
    if (!this.cache.panicHistory) this.cache.panicHistory = {};
    this.cache.panicHistory[guildId] = [];
    this.save();
    return true;
  }

  // ==========================================
  // EMBED & CONTAINER STUDIO
  // ==========================================
  getStudioTemplates(guildId) {
    if (!this.cache.studioTemplates) this.cache.studioTemplates = {};
    if (!this.cache.studioTemplates[guildId]) this.cache.studioTemplates[guildId] = {};
    return this.cache.studioTemplates[guildId];
  }

  saveStudioTemplate(guildId, templateId, template) {
    if (!this.cache.studioTemplates) this.cache.studioTemplates = {};
    if (!this.cache.studioTemplates[guildId]) this.cache.studioTemplates[guildId] = {};
    this.cache.studioTemplates[guildId][templateId] = {
      ...template,
      id: templateId,
      updatedAt: Date.now()
    };
    this.save();
    return this.cache.studioTemplates[guildId][templateId];
  }

  deleteStudioTemplate(guildId, templateId) {
    if (!this.cache.studioTemplates?.[guildId]) return false;
    delete this.cache.studioTemplates[guildId][templateId];
    this.save();
    return true;
  }

  // ==========================================
  // MINIGAMES STATS
  // ==========================================
  getMinigameStats(guildId, userId) {
    if (!this.cache.minigamesStats) this.cache.minigamesStats = {};
    if (!this.cache.minigamesStats[guildId]) this.cache.minigamesStats[guildId] = {};
    if (!this.cache.minigamesStats[guildId][userId]) {
      this.cache.minigamesStats[guildId][userId] = {
        blackjackWins: 0,
        rouletteWins: 0,
        triviaWins: 0,
        totalWagered: 0,
        totalWon: 0
      };
    }
    return this.cache.minigamesStats[guildId][userId];
  }

  recordMinigameResult(guildId, userId, game, won, amount) {
    const stats = this.getMinigameStats(guildId, userId);
    stats.totalWagered += Number(amount) || 0;
    if (won) {
      stats.totalWon += Number(amount) || 0;
      if (game === 'blackjack') stats.blackjackWins = (stats.blackjackWins || 0) + 1;
      else if (game === 'roulette') stats.rouletteWins = (stats.rouletteWins || 0) + 1;
      else if (game === 'trivia') stats.triviaWins = (stats.triviaWins || 0) + 1;
    }
    this.save();
    return stats;
  }

  // ==========================================
  // VOICE ANALYTICS
  // ==========================================
  recordVoiceActivity(guildId, channelId, userId, durationMinutes) {
    if (!this.cache.voiceAnalytics) this.cache.voiceAnalytics = {};
    if (!this.cache.voiceAnalytics[guildId]) {
      this.cache.voiceAnalytics[guildId] = { hourly: {}, channels: {}, users: {} };
    }
    const va = this.cache.voiceAnalytics[guildId];
    const hour = new Date().getHours();
    va.hourly[hour] = (va.hourly[hour] || 0) + durationMinutes;
    va.channels[channelId] = (va.channels[channelId] || 0) + durationMinutes;
    va.users[userId] = (va.users[userId] || 0) + durationMinutes;
    this.save();
  }

  getVoiceAnalytics(guildId) {
    if (!this.cache.voiceAnalytics) this.cache.voiceAnalytics = {};
    return this.cache.voiceAnalytics[guildId] || { hourly: {}, channels: {}, users: {} };
  }
}
const dbInstance = new Database();
export default dbInstance;
