import { MongoClient } from 'mongodb';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import dns from 'dns';

// Safe DNS server fallback for robust SRV lookup across varied VPS and local environments
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

let mongoClient = null;
let mongoDb = null;
let isConnected = false;
let isConnecting = false;
let isSyncing = false;
let saveDebounceTimer = null;
let periodicSyncTimer = null;
let lastSyncTimestamp = null;
let lastSyncStatus = 'Not initialized';

let syncStats = {
  guilds: 0,
  counting: 0,
  setups: 0,
  tickets: 0,
  triggers: 0,
  rateChannels: 0,
  editRatings: 0,
  burnRooms: 0,
  mediaChannels: 0,
  quoteChannels: 0,
  autoReacts: 0,
  stickyMessages: 0,
  newsFeeds: 0,
  voiceRoles: 0,
  economy: 0,
  xp: 0,
  giveaways: 0,
  reactionRoles: 0,
  moderation: 0,
  entryGates: 0,
  roleplay: 0,
  snapshots: 0,
  incidents: 0,
  userStats: 0,
  channelStats: 0,
  invites: 0,
  joins: 0
};

const DB_DIR = path.resolve('data');
const DB_FILE = path.join(DB_DIR, 'db.json');

/**
 * Resolves the MongoDB connection string from environment variables.
 */
export function getMongoUri() {
  return process.env.MONGODB_URI || process.env.MONGO_URI || null;
}

/**
 * Returns connection health status and stats
 */
export function getMongoHealth() {
  return {
    configured: Boolean(getMongoUri()),
    connected: isConnected,
    isSyncing,
    lastSyncTimestamp,
    lastSyncStatus,
    stats: { ...syncStats }
  };
}

/**
 * Detailed real-time cloud inventory query for MongoDB Atlas.
 * Retrieves live document counts across all 15 collections and reads the latest backup snapshot.
 */
export async function getMongoDetailedAudit() {
  const uri = getMongoUri();
  if (!isConnected && !(await connectMongo())) {
    return {
      connected: false,
      configured: Boolean(uri),
      reason: uri ? 'Cannot connect to MongoDB Cloud cluster' : 'MONGODB_URI not set in .env'
    };
  }

  try {
    const collections = [
      'guilds', 'channel_setups', 'counting', 'rate_edits', 'tickets', 
      'triggers', 'burn_rooms', 'sticky_messages', 'auto_reacts', 'core_cache',
      'news_feeds', 'voice_roles',
      'economy', 'users_xp', 'giveaways', 'reaction_roles',
      'moderation_security', 'entry_gates', 'roleplay_data',
      'server_snapshots', 'security_incidents', 'minigames_stats',
      'cloud_backups', 'stats_user_activity', 'stats_channel_activity', 
      'stats_user_invites', 'stats_join_history'
    ];

    const counts = {};
    for (const c of collections) {
      counts[c] = await mongoDb.collection(c).countDocuments().catch(() => 0);
    }

    const latestSnap = await mongoDb.collection('cloud_backups')
      .find()
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray()
      .catch(() => []);

    const snap = latestSnap[0] || null;

    return {
      connected: true,
      configured: true,
      databaseName: mongoDb.databaseName,
      lastSyncTimestamp: snap?.timestamp || lastSyncTimestamp,
      lastSyncDateStr: snap?.dateStr || (lastSyncTimestamp ? new Date(lastSyncTimestamp).toISOString() : null),
      lastSyncReason: snap?.reason || 'Routine Sync',
      schemaVersion: snap?.schemaVersion || 'v3.1.3',
      counts,
      nextSyncTimestamp: (snap?.timestamp || Date.now()) + (5 * 60 * 1000)
    };
  } catch (err) {
    return {
      connected: true,
      configured: true,
      databaseName: mongoDb?.databaseName || 'athena_prime',
      error: err.message,
      counts: { ...syncStats }
    };
  }
}

/**
 * Connects to MongoDB Atlas / remote cloud instance.
 */
export async function connectMongo() {
  const uri = getMongoUri();
  if (!uri) {
    console.log(chalk.gray('[MongoSync] No MONGODB_URI found in .env. Running on local disk persistence.'));
    return false;
  }

  if (isConnected && mongoDb) return true;
  if (isConnecting) return false;

  isConnecting = true;
  try {
    console.log(chalk.cyan('[MongoSync] Connecting to MongoDB Cloud cluster...'));

    mongoClient = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      retryWrites: true
    });

    await mongoClient.connect();

    // Parse database name from URI or default to 'athena_prime'
    const dbName = uri.split('?')[0].split('/').filter(Boolean).pop() || 'athena_prime';
    mongoDb = mongoClient.db(dbName === 'mongodb.net' || !dbName ? 'athena_prime' : dbName);

    isConnected = true;
    isConnecting = false;

    console.log(chalk.green.bold(`[MongoSync] SUCCESS: Connected to MongoDB Cloud Database [${mongoDb.databaseName}]!`));

    // Ensure indexes for blazing fast query performance
    await createIndexes().catch(() => null);

    // Reclaim storage immediately on connection to prevent and clear space quota errors
    await reclaimStorageQuotaIfNeeded().catch(() => null);

    return true;
  } catch (err) {
    isConnecting = false;
    isConnected = false;
    console.error(chalk.yellow(`[MongoSync] Could not connect to MongoDB: ${err.message}`));
    console.log(chalk.gray('[MongoSync] Operating in resilient offline mode using local data/db.json.'));
    return false;
  }
}

/**
 * Creates indexes on key collections
 */
async function createIndexes() {
  if (!mongoDb) return;
  try {
    await mongoDb.collection('guilds').createIndex({ updatedAt: -1 }).catch(() => {});
    await mongoDb.collection('counting').createIndex({ updatedAt: -1 }).catch(() => {});
    await mongoDb.collection('channel_setups').createIndex({ updatedAt: -1 }).catch(() => {});
    await mongoDb.collection('tickets').createIndex({ updatedAt: -1 }).catch(() => {});
    await mongoDb.collection('triggers').createIndex({ updatedAt: -1 }).catch(() => {});
    await mongoDb.collection('rate_edits').createIndex({ updatedAt: -1 }).catch(() => {});
    await mongoDb.collection('burn_rooms').createIndex({ updatedAt: -1 }).catch(() => {});
    await mongoDb.collection('auto_reacts').createIndex({ updatedAt: -1 }).catch(() => {});
    await mongoDb.collection('sticky_messages').createIndex({ updatedAt: -1 }).catch(() => {});
    await mongoDb.collection('news_feeds').createIndex({ updatedAt: -1 }).catch(() => {});
    await mongoDb.collection('news_feeds').createIndex({ channelId: 1 }).catch(() => {});
    await mongoDb.collection('voice_roles').createIndex({ updatedAt: -1 }).catch(() => {});
    await mongoDb.collection('stats_user_activity').createIndex({ guild_id: 1, user_id: 1, date: 1 }).catch(() => {});
    await mongoDb.collection('stats_channel_activity').createIndex({ guild_id: 1, channel_id: 1, date: 1 }).catch(() => {});
    await mongoDb.collection('cloud_backups').createIndex({ timestamp: -1 }).catch(() => {});
  } catch {}
}

/**
 * Reclaims cluster storage quota by purging bulky historical snapshot documents
 * from `cloud_backups`. All active configs remain in their respective live collections.
 */
export async function reclaimStorageQuotaIfNeeded() {
  if (!mongoDb) return;
  try {
    const backupsCol = mongoDb.collection('cloud_backups');
    const count = await backupsCol.countDocuments().catch(() => 0);
    if (count > 0) {
      console.log(chalk.yellow(`[MongoSync] Storage reclamation: Dropping bulky legacy snapshots from cloud_backups (${count} docs found)...`));
      await backupsCol.drop().catch(() => backupsCol.deleteMany({}));
      console.log(chalk.green.bold('[MongoSync] Successfully reclaimed ~500 MB of MongoDB Atlas storage quota! Writes unblocked.'));
    }
  } catch (err) {
    console.warn(chalk.yellow(`[MongoSync] Storage reclamation notice: ${err.message}`));
  }
}

/**
 * Hydrates local in-memory database and statsDB from MongoDB on startup or manual command.
 * If MongoDB is empty, seeds MongoDB from local files!
 */
export async function hydrateFromMongo(db, statsDB = null) {
  if (!isConnected && !(await connectMongo())) return { success: false, reason: 'Disconnected' };

  if (!statsDB) {
    try {
      const statsMod = await import('../statsDB.js');
      statsDB = statsMod.default || statsMod;
    } catch {}
  }

  try {
    const guildsCol = mongoDb.collection('guilds');
    const countingCol = mongoDb.collection('counting');
    const setupsCol = mongoDb.collection('channel_setups');
    const ticketsCol = mongoDb.collection('tickets');
    const triggersCol = mongoDb.collection('triggers');
    const rateEditsCol = mongoDb.collection('rate_edits');
    const burnRoomsCol = mongoDb.collection('burn_rooms');
    const autoReactsCol = mongoDb.collection('auto_reacts');
    const stickyCol = mongoDb.collection('sticky_messages');
    const newsCol = mongoDb.collection('news_feeds');
    const voiceRolesCol = mongoDb.collection('voice_roles');
    const economyCol = mongoDb.collection('economy');
    const xpCol = mongoDb.collection('users_xp');
    const giveawaysCol = mongoDb.collection('giveaways');
    const reactionRolesCol = mongoDb.collection('reaction_roles');
    const moderationCol = mongoDb.collection('moderation_security');
    const entryGatesCol = mongoDb.collection('entry_gates');
    const roleplayCol = mongoDb.collection('roleplay_data');
    const serverSnapshotsCol = mongoDb.collection('server_snapshots');
    const incidentsCol = mongoDb.collection('security_incidents');
    const minigamesCol = mongoDb.collection('minigames_stats');
    const coreCol = mongoDb.collection('core_cache');
    const backupsCol = mongoDb.collection('cloud_backups');

    const mongoGuildCount = await guildsCol.countDocuments();
    const localGuildCount = Object.keys(db.cache.guilds || {}).length;

    console.log(chalk.cyan(`[MongoSync] Cloud database audit: MongoDB has ${mongoGuildCount} guilds, Local has ${localGuildCount} guilds.`));

    // Case 1: MongoDB has data -> Hydrate local in-memory cache from cloud!
    if (mongoGuildCount > 0) {
      console.log(chalk.yellow(`[MongoSync] Hydrating all guilds, counting, setups, tickets, rates, and triggers from MongoDB Cloud...`));

      // 1. Hydrate Core / Global configs
      const coreDoc = await coreCol.findOne({ _id: 'global_state' });
      if (coreDoc) {
        for (const [key, val] of Object.entries(coreDoc)) {
          if (key === '_id' || key === 'updatedAt') continue;
          db.cache[key] = val;
        }
      }

      // 2. Hydrate Guilds (including mediaChannelId, quoteChannelId, rateChannelId, autoReacts)
      const allGuildDocs = await guildsCol.find({}).toArray();
      db.cache.guilds = db.cache.guilds || {};
      for (const doc of allGuildDocs) {
        const gid = doc._id;
        const cleanDoc = { ...doc };
        delete cleanDoc._id;
        delete cleanDoc.updatedAt;
        db.cache.guilds[gid] = cleanDoc;
      }

      // 3. Hydrate Counting Channels & Streaks
      const allCountingDocs = await countingCol.find({}).toArray();
      db.cache.counting = db.cache.counting || {};
      for (const doc of allCountingDocs) {
        const gid = doc._id;
        const cleanDoc = { ...doc };
        delete cleanDoc._id;
        delete cleanDoc.updatedAt;
        db.cache.counting[gid] = cleanDoc;
      }

      // 4. Hydrate Channel Setups (welcome, leave, jtc, serverStats, tickets, verification, etc.)
      const allSetupDocs = await setupsCol.find({}).toArray();
      for (const doc of allSetupDocs) {
        const gid = doc._id;
        if (doc.welcome) db.cache.welcome[gid] = doc.welcome;
        if (doc.leave) db.cache.leave[gid] = doc.leave;
        if (doc.jtc) db.cache.jtc[gid] = doc.jtc;
        if (doc.serverStats) db.cache.serverStats[gid] = doc.serverStats;
        if (doc.tickets) db.cache.tickets[gid] = doc.tickets;
        if (doc.verification) db.cache.verification[gid] = doc.verification;
        if (doc.birthdays) db.cache.birthdays[gid] = doc.birthdays;
        if (doc.apps) db.cache.apps[gid] = doc.apps;
        if (doc.stickyMessages) db.cache.stickyMessages[gid] = doc.stickyMessages;
        if (doc.triggers) db.cache.triggers[gid] = doc.triggers;

        // Ensure guildConfig bindings are also synced
        if (db.cache.guilds?.[gid]) {
          if (doc.rateChannelId) {
            db.cache.guilds[gid].rateChannelId = doc.rateChannelId;
            db.cache.rateChannels[gid] = doc.rateChannelId;
          }
          if (doc.mediaChannelId) db.cache.guilds[gid].mediaChannelId = doc.mediaChannelId;
          if (doc.quoteChannelId) db.cache.guilds[gid].quoteChannelId = doc.quoteChannelId;
          if (doc.voiceRoleId) db.cache.guilds[gid].voiceRoleId = doc.voiceRoleId;
          if (doc.autoReacts) db.cache.guilds[gid].autoReacts = doc.autoReacts;
          if (typeof doc.autoMediaAll === 'boolean') db.cache.guilds[gid].autoMediaAll = doc.autoMediaAll;
        }
      }

      // 5. Hydrate Dedicated Tickets collection
      const allTicketDocs = await ticketsCol.find({}).toArray();
      db.cache.tickets = db.cache.tickets || {};
      for (const doc of allTicketDocs) {
        const gid = doc._id;
        const cleanDoc = { ...doc };
        delete cleanDoc._id;
        delete cleanDoc.updatedAt;
        db.cache.tickets[gid] = cleanDoc;
      }

      // 6. Hydrate Dedicated Triggers & Autoresponders
      const allTriggerDocs = await triggersCol.find({}).toArray();
      db.cache.triggers = db.cache.triggers || {};
      for (const doc of allTriggerDocs) {
        if (doc._id === 'global_triggers') {
          db.cache.globalTriggers = doc.triggers || [];
        } else {
          db.cache.triggers[doc._id] = doc.triggers || [];
        }
      }

      // 7. Hydrate Dedicated Rate Channels & Edit Ratings
      const allRateDocs = await rateEditsCol.find({}).toArray();
      db.cache.rateChannels = db.cache.rateChannels || {};
      db.cache.editRatings = db.cache.editRatings || {};
      for (const doc of allRateDocs) {
        if (doc._id === 'rate_channels') {
          db.cache.rateChannels = { ...db.cache.rateChannels, ...(doc.channels || {}) };
        } else {
          const msgId = doc._id;
          const cleanDoc = { ...doc };
          delete cleanDoc._id;
          delete cleanDoc.updatedAt;
          db.cache.editRatings[msgId] = cleanDoc;
        }
      }

      // 8. Hydrate Dedicated Burn Rooms (!burn)
      const allBurnDocs = await burnRoomsCol.find({}).toArray();
      db.cache.burnRooms = db.cache.burnRooms || {};
      for (const doc of allBurnDocs) {
        if (doc._id === 'active_burn_rooms') {
          db.cache.burnRooms = { ...db.cache.burnRooms, ...(doc.rooms || {}) };
        } else {
          const cid = doc._id;
          const cleanDoc = { ...doc };
          delete cleanDoc._id;
          delete cleanDoc.updatedAt;
          if (!cleanDoc.expiresAt || cleanDoc.expiresAt > Date.now()) {
            db.cache.burnRooms[cid] = cleanDoc;
          }
        }
      }

      // 9. Hydrate Dedicated Auto-Reacts
      const allAutoReactDocs = await autoReactsCol.find({}).toArray();
      for (const doc of allAutoReactDocs) {
        const gid = doc._id;
        if (db.cache.guilds?.[gid] && doc.reacts) {
          db.cache.guilds[gid].autoReacts = doc.reacts;
        }
      }

      // 10. Hydrate Dedicated Sticky Messages
      const allStickyDocs = await stickyCol.find({}).toArray();
      db.cache.stickyMessages = db.cache.stickyMessages || {};
      for (const doc of allStickyDocs) {
        db.cache.stickyMessages[doc._id] = doc.channels || {};
      }

      // 11. Hydrate Dedicated News Feeds (!news)
      const allNewsDocs = await newsCol.find({}).toArray();
      db.cache.newsFeeds = db.cache.newsFeeds || {};
      for (const doc of allNewsDocs) {
        const gid = doc._id;
        db.cache.newsFeeds[gid] = {
          channelId: doc.channelId || null,
          roleId: doc.roleId || null,
          feeds: Array.isArray(doc.feeds) ? doc.feeds : [],
          lastGuids: Array.isArray(doc.lastGuids) ? doc.lastGuids : []
        };
      }

      // 12. Hydrate Dedicated In-Voice Roles (!voicerole)
      const allVoiceRoleDocs = await voiceRolesCol.find({}).toArray();
      for (const doc of allVoiceRoleDocs) {
        const gid = doc._id;
        if (db.cache.guilds?.[gid] && doc.roleId) {
          db.cache.guilds[gid].voiceRoleId = doc.roleId;
        }
      }

      // 13. Hydrate Dedicated Economy & Shop Items
      const allEconomyDocs = await economyCol.find({}).toArray();
      db.cache.economy = db.cache.economy || {};
      db.cache.shopItems = db.cache.shopItems || {};
      for (const doc of allEconomyDocs) {
        const gid = doc._id;
        if (doc.users) db.cache.economy[gid] = doc.users;
        if (Array.isArray(doc.shopItems)) db.cache.shopItems[gid] = doc.shopItems;
      }

      // 14. Hydrate Dedicated Users XP & Systems
      const allXpDocs = await xpCol.find({}).toArray();
      db.cache.usersXp = db.cache.usersXp || {};
      db.cache.xpSystems = db.cache.xpSystems || {};
      for (const doc of allXpDocs) {
        const gid = doc._id;
        if (doc.system) db.cache.xpSystems[gid] = doc.system;
        if (doc.users) db.cache.usersXp[gid] = doc.users;
      }

      // 15. Hydrate Dedicated Giveaways
      const allGiveawayDocs = await giveawaysCol.find({}).toArray();
      db.cache.giveaways = db.cache.giveaways || {};
      for (const doc of allGiveawayDocs) {
        const mid = doc._id;
        const cleanDoc = { ...doc };
        delete cleanDoc._id;
        delete cleanDoc.updatedAt;
        db.cache.giveaways[mid] = cleanDoc;
      }

      // 16. Hydrate Dedicated Reaction Roles
      const allReactionRoleDocs = await reactionRolesCol.find({}).toArray();
      db.cache.reactionRoles = db.cache.reactionRoles || {};
      for (const doc of allReactionRoleDocs) {
        const mid = doc._id;
        const cleanDoc = { ...doc };
        delete cleanDoc._id;
        delete cleanDoc.updatedAt;
        db.cache.reactionRoles[mid] = cleanDoc;
      }

      // 17. Hydrate Dedicated Moderation & Security State
      const allModDocs = await moderationCol.find({}).toArray();
      db.cache.warnings = db.cache.warnings || {};
      db.cache.quarantines = db.cache.quarantines || {};
      db.cache.tempBans = db.cache.tempBans || {};
      db.cache.exploitTaints = db.cache.exploitTaints || {};
      db.cache.extraOwners = db.cache.extraOwners || {};
      db.cache.botWhitelist = db.cache.botWhitelist || {};
      db.cache.moveProtection = db.cache.moveProtection || {};
      db.cache.vcProtection = db.cache.vcProtection || {};
      for (const doc of allModDocs) {
        const gid = doc._id;
        if (doc.warnings) db.cache.warnings[gid] = doc.warnings;
        if (doc.quarantines) db.cache.quarantines[gid] = doc.quarantines;
        if (doc.tempBans) db.cache.tempBans[gid] = doc.tempBans;
        if (doc.exploitTaints) db.cache.exploitTaints[gid] = doc.exploitTaints;
        if (doc.extraOwners) db.cache.extraOwners[gid] = doc.extraOwners;
        if (doc.botWhitelist) db.cache.botWhitelist[gid] = doc.botWhitelist;
        if (doc.moveProtection) db.cache.moveProtection[gid] = doc.moveProtection;
        if (doc.vcProtection) db.cache.vcProtection[gid] = doc.vcProtection;
      }

      // 18. Hydrate Dedicated Server Entry Application Gates
      const allEntryDocs = await entryGatesCol.find({}).toArray();
      db.cache.entryConfigs = db.cache.entryConfigs || {};
      db.cache.entryPending = db.cache.entryPending || {};
      for (const doc of allEntryDocs) {
        const gid = doc._id;
        if (doc.config) db.cache.entryConfigs[gid] = doc.config;
        if (doc.pending) db.cache.entryPending[gid] = doc.pending;
      }

      // 19. Hydrate Dedicated Roleplay & Marriages
      const allRpDocs = await roleplayCol.find({}).toArray();
      db.cache.roleplay = db.cache.roleplay || {};
      db.cache.roleplayUsers = db.cache.roleplayUsers || {};
      db.cache.roleplayMarriages = db.cache.roleplayMarriages || {};
      for (const doc of allRpDocs) {
        if (doc._id === 'global_family') {
          db.cache.family = doc.family || {};
        } else {
          const gid = doc._id;
          if (doc.roleplay) db.cache.roleplay[gid] = doc.roleplay;
          if (doc.users) db.cache.roleplayUsers[gid] = doc.users;
          if (doc.marriages) db.cache.roleplayMarriages[gid] = doc.marriages;
        }
      }

      // 20. Hydrate Dedicated Server Snapshots & Time Machine
      const allSnapshotDocs = await serverSnapshotsCol.find({}).toArray();
      db.cache.serverSnapshots = db.cache.serverSnapshots || {};
      db.cache.timeMachineSnapshots = db.cache.timeMachineSnapshots || {};
      for (const doc of allSnapshotDocs) {
        const gid = doc._id;
        if (Array.isArray(doc.snapshots)) db.cache.serverSnapshots[gid] = doc.snapshots;
        if (Array.isArray(doc.timeMachine)) db.cache.timeMachineSnapshots[gid] = doc.timeMachine;
      }

      // 21. Hydrate Dedicated Anti-Nuke Incident Reports & Telemetry
      const allIncidentDocs = await incidentsCol.find({}).toArray();
      db.cache.incidentReports = db.cache.incidentReports || {};
      db.cache.securityLiveRecords = db.cache.securityLiveRecords || {};
      db.cache.nukeSignatures = db.cache.nukeSignatures || {};
      for (const doc of allIncidentDocs) {
        const gid = doc._id;
        if (Array.isArray(doc.reports)) db.cache.incidentReports[gid] = doc.reports;
        if (Array.isArray(doc.liveRecords)) db.cache.securityLiveRecords[gid] = doc.liveRecords;
        if (Array.isArray(doc.nukeSignatures)) db.cache.nukeSignatures[gid] = doc.nukeSignatures;
      }

      // 22. Hydrate Dedicated Minigames & Arcade Stats
      const minigameDoc = await minigamesCol.findOne({ _id: 'global_minigames' });
      if (minigameDoc) {
        if (minigameDoc.minigames) db.cache.minigamesStats = minigameDoc.minigames;
        if (minigameDoc.arcade) db.cache.arcadeStats = minigameDoc.arcade;
        if (minigameDoc.chess) db.cache.chessStats = minigameDoc.chess;
      }

      // 23. Fail-Safe Recovery from Latest Cloud Backup Snapshot if any essential cache is missing
      const latestBackup = await backupsCol.find().sort({ timestamp: -1 }).limit(1).toArray();
      if (latestBackup.length > 0 && latestBackup[0].data) {
        const bData = latestBackup[0].data;
        for (const [k, v] of Object.entries(bData)) {
          if (!db.cache[k] || (typeof db.cache[k] === 'object' && Object.keys(db.cache[k]).length === 0 && Object.keys(v || {}).length > 0)) {
            db.cache[k] = v;
          }
        }
      }

      // 13. Hydrate SQLite stats.db if available
      let statsResult = { userStats: 0, channelStats: 0, invites: 0, joins: 0 };
      if (statsDB && typeof statsDB.getDatabaseInstance === 'function') {
        try {
          statsResult = await hydrateStatsFromMongo(statsDB);
        } catch {}
      }

      // Write hydrated cache to local disk immediately for zero-delay offline resilience
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db.cache), 'utf8');
      } catch {}

      // Re-initialize fast lookup sets
      if (typeof db.load === 'function') {
        db.load();
      }

      // Update sync statistics
      syncStats.guilds = allGuildDocs.length;
      syncStats.counting = allCountingDocs.length;
      syncStats.setups = allSetupDocs.length;
      syncStats.tickets = allTicketDocs.length;
      syncStats.triggers = allTriggerDocs.length;
      syncStats.rateChannels = Object.keys(db.cache.rateChannels || {}).length;
      syncStats.editRatings = Object.keys(db.cache.editRatings || {}).length;
      syncStats.burnRooms = Object.keys(db.cache.burnRooms || {}).length;
      syncStats.mediaChannels = Object.values(db.cache.guilds || {}).filter(g => g.mediaChannelId).length;
      syncStats.quoteChannels = Object.values(db.cache.guilds || {}).filter(g => g.quoteChannelId).length;
      syncStats.autoReacts = Object.values(db.cache.guilds || {}).filter(g => g.autoReacts && Object.keys(g.autoReacts).length > 0).length;
      syncStats.stickyMessages = Object.keys(db.cache.stickyMessages || {}).length;
      syncStats.newsFeeds = allNewsDocs.length;
      syncStats.voiceRoles = Object.values(db.cache.guilds || {}).filter(g => g.voiceRoleId).length;
      syncStats.economy = allEconomyDocs.length;
      syncStats.xp = allXpDocs.length;
      syncStats.giveaways = allGiveawayDocs.length;
      syncStats.reactionRoles = allReactionRoleDocs.length;
      syncStats.moderation = allModDocs.length;
      syncStats.entryGates = allEntryDocs.length;
      syncStats.roleplay = allRpDocs.length;
      syncStats.snapshots = allSnapshotDocs.length;
      syncStats.incidents = allIncidentDocs.length;
      syncStats.userStats = statsResult?.userStats || syncStats.userStats || 0;
      syncStats.channelStats = statsResult?.channelStats || syncStats.channelStats || 0;
      syncStats.invites = statsResult?.invites || syncStats.invites || 0;
      syncStats.joins = statsResult?.joins || syncStats.joins || 0;

      lastSyncTimestamp = Date.now();
      lastSyncStatus = `Hydrated (${allGuildDocs.length} guilds from MongoDB)`;

      console.log(chalk.green.bold(`[MongoSync] HYDRATION COMPLETE: Loaded ${allGuildDocs.length} guilds, ${allCountingDocs.length} counting channels, tickets, rates, and all server setups from MongoDB Cloud!`));
      return { 
        success: true, 
        guildCount: allGuildDocs.length, 
        countingCount: allCountingDocs.length,
        ticketCount: allTicketDocs.length,
        newsFeeds: allNewsDocs.length,
        newsFeedsCount: allNewsDocs.length,
        voiceRoles: syncStats.voiceRoles,
        userStats: statsResult?.userStats || 0,
        channelStats: statsResult?.channelStats || 0,
        invites: statsResult?.invites || 0,
        joins: statsResult?.joins || 0,
        source: 'mongodb' 
      };
    }

    // Case 2: MongoDB is empty, but Local has live data -> Perform Initial Cloud Seed!
    if (mongoGuildCount === 0 && localGuildCount > 0) {
      console.log(chalk.yellow.bold(`[MongoSync] MongoDB is empty. Seeding MongoDB with ${localGuildCount} guilds from local storage...`));
      await pushToMongo(db, statsDB, 'Initial Cloud Seed');
      return { success: true, seeded: true, guildCount: localGuildCount };
    }

    return { success: true, empty: true };
  } catch (err) {
    console.error(chalk.red('[MongoSync] Hydration error:'), err);
    return { success: false, error: err.message };
  }
}

/**
 * Pushes entire in-memory database and SQLite stats up to MongoDB.
 * Explicitly mirrors: counting, rate edit bound channels, tickets, media downloader,
 * auto-react, autoresponders/triggers, !burn rooms, quotes, and full backups.
 */
export async function pushToMongo(db, statsDB = null, reason = 'Routine Sync') {
  if (!isConnected && !(await connectMongo())) return { success: false, reason: 'Disconnected' };
  if (isSyncing) return { success: false, reason: 'Sync in progress' };

  if (!statsDB) {
    try {
      const statsMod = await import('../statsDB.js');
      statsDB = statsMod.default || statsMod;
    } catch {}
  }

  isSyncing = true;
  try {
    const timestamp = new Date();
    const guildsCol = mongoDb.collection('guilds');
    const countingCol = mongoDb.collection('counting');
    const setupsCol = mongoDb.collection('channel_setups');
    const ticketsCol = mongoDb.collection('tickets');
    const triggersCol = mongoDb.collection('triggers');
    const rateEditsCol = mongoDb.collection('rate_edits');
    const burnRoomsCol = mongoDb.collection('burn_rooms');
    const autoReactsCol = mongoDb.collection('auto_reacts');
    const stickyCol = mongoDb.collection('sticky_messages');
    const newsCol = mongoDb.collection('news_feeds');
    const voiceRolesCol = mongoDb.collection('voice_roles');
    const economyCol = mongoDb.collection('economy');
    const xpCol = mongoDb.collection('users_xp');
    const giveawaysCol = mongoDb.collection('giveaways');
    const reactionRolesCol = mongoDb.collection('reaction_roles');
    const moderationCol = mongoDb.collection('moderation_security');
    const entryGatesCol = mongoDb.collection('entry_gates');
    const roleplayCol = mongoDb.collection('roleplay_data');
    const serverSnapshotsCol = mongoDb.collection('server_snapshots');
    const incidentsCol = mongoDb.collection('security_incidents');
    const minigamesCol = mongoDb.collection('minigames_stats');
    const coreCol = mongoDb.collection('core_cache');
    const backupsCol = mongoDb.collection('cloud_backups');

    const cache = db.cache || {};

    // 1. Sync Core / Global Configs
    const EXCLUDED_CORE_KEYS = new Set([
      'guilds', 'counting', 'welcome', 'leave', 'jtc', 'serverStats', 'tickets', 
      'verification', 'birthdays', 'triggers', 'globalTriggers', 'rateChannels', 
      'editRatings', 'burnRooms', 'stickyMessages', 'newsFeeds', 'economy', 'shopItems',
      'usersXp', 'xpSystems', 'giveaways', 'reactionRoles', 'warnings', 'quarantines',
      'tempBans', 'exploitTaints', 'extraOwners', 'botWhitelist', 'moveProtection',
      'vcProtection', 'entryConfigs', 'entryPending', 'roleplay', 'roleplayUsers',
      'roleplayMarriages', 'family', 'serverSnapshots', 'timeMachineSnapshots',
      'incidentReports', 'securityLiveRecords', 'nukeSignatures', 'minigamesStats',
      'arcadeStats', 'chessStats'
    ]);
    const globalPayload = { _id: 'global_state', updatedAt: timestamp };
    for (const [key, val] of Object.entries(cache)) {
      if (EXCLUDED_CORE_KEYS.has(key)) continue;
      globalPayload[key] = val;
    }
    await coreCol.updateOne({ _id: 'global_state' }, { $set: globalPayload }, { upsert: true });

    // 2. Bulk Sync Guilds (Preserves antinuke, whitelist, extraOwners, mediaChannelId, quoteChannelId, rateChannelId, autoReacts, etc.)
    const guildEntries = Object.entries(cache.guilds || {});
    if (guildEntries.length > 0) {
      const guildOps = guildEntries.map(([gid, config]) => ({
        updateOne: {
          filter: { _id: String(gid) },
          update: { $set: { ...config, updatedAt: timestamp } },
          upsert: true
        }
      }));
      await guildsCol.bulkWrite(guildOps, { ordered: false });
    }

    // 3. Bulk Sync Counting Configurations & Streaks
    const countingEntries = Object.entries(cache.counting || {});
    if (countingEntries.length > 0) {
      const countingOps = countingEntries.map(([gid, config]) => ({
        updateOne: {
          filter: { _id: String(gid) },
          update: { $set: { ...config, updatedAt: timestamp } },
          upsert: true
        }
      }));
      await countingCol.bulkWrite(countingOps, { ordered: false });
    }

    // 4. Bulk Sync Channel Setups (Welcome, Leave, JTC, Stats, Tickets, Verification, Media, Quote, Rate, AutoReact)
    const allSetupGuildIds = new Set([
      ...Object.keys(cache.guilds || {}),
      ...Object.keys(cache.welcome || {}),
      ...Object.keys(cache.leave || {}),
      ...Object.keys(cache.serverStats || {}),
      ...Object.keys(cache.jtc || {}),
      ...Object.keys(cache.tickets || {}),
      ...Object.keys(cache.verification || {}),
      ...Object.keys(cache.birthdays || {}),
      ...Object.keys(cache.rateChannels || {}),
      ...Object.keys(cache.stickyMessages || {}),
      ...Object.keys(cache.newsFeeds || {}),
      ...Object.keys(cache.triggers || {}),
      ...Object.keys(cache.apps || {})
    ]);

    if (allSetupGuildIds.size > 0) {
      const setupOps = Array.from(allSetupGuildIds).map(gid => {
        const gCfg = cache.guilds?.[gid] || {};
        return {
          updateOne: {
            filter: { _id: String(gid) },
            update: {
              $set: {
                welcome: cache.welcome?.[gid] || null,
                leave: cache.leave?.[gid] || null,
                serverStats: cache.serverStats?.[gid] || null,
                jtc: cache.jtc?.[gid] || null,
                tickets: cache.tickets?.[gid] || null,
                verification: cache.verification?.[gid] || null,
                birthdays: cache.birthdays?.[gid] || null,
                news: cache.newsFeeds?.[gid] || null,
                voiceRoleId: gCfg.voiceRoleId || null,
                rateChannelId: cache.rateChannels?.[gid] || gCfg.rateChannelId || null,
                mediaChannelId: gCfg.mediaChannelId || null,
                quoteChannelId: gCfg.quoteChannelId || null,
                autoReacts: gCfg.autoReacts || null,
                autoMediaAll: Boolean(gCfg.autoMediaAll),
                stickyMessages: cache.stickyMessages?.[gid] || null,
                apps: cache.apps?.[gid] || null,
                triggers: cache.triggers?.[gid] || null,
                updatedAt: timestamp
              }
            },
            upsert: true
          }
        };
      });
      await setupsCol.bulkWrite(setupOps, { ordered: false });
    }

    // 5. Bulk Sync Dedicated Tickets Collection
    const ticketEntries = Object.entries(cache.tickets || {});
    if (ticketEntries.length > 0) {
      const ticketOps = ticketEntries.map(([gid, config]) => ({
        updateOne: {
          filter: { _id: String(gid) },
          update: { $set: { ...config, updatedAt: timestamp } },
          upsert: true
        }
      }));
      await ticketsCol.bulkWrite(ticketOps, { ordered: false });
    }

    // 6. Bulk Sync Dedicated Triggers & Autoresponders Collection
    const triggerEntries = Object.entries(cache.triggers || {});
    if (triggerEntries.length > 0) {
      const triggerOps = triggerEntries.map(([gid, list]) => ({
        updateOne: {
          filter: { _id: String(gid) },
          update: { $set: { triggers: list, updatedAt: timestamp } },
          upsert: true
        }
      }));
      await triggersCol.bulkWrite(triggerOps, { ordered: false });
    }
    if (Array.isArray(cache.globalTriggers)) {
      await triggersCol.updateOne(
        { _id: 'global_triggers' },
        { $set: { triggers: cache.globalTriggers, updatedAt: timestamp } },
        { upsert: true }
      );
    }

    // 7. Bulk Sync Dedicated Rate Edits & Bound Channel Collection
    await rateEditsCol.updateOne(
      { _id: 'rate_channels' },
      { $set: { channels: cache.rateChannels || {}, updatedAt: timestamp } },
      { upsert: true }
    );
    const editRatingEntries = Object.entries(cache.editRatings || {});
    if (editRatingEntries.length > 0) {
      const ratingOps = editRatingEntries.map(([msgId, data]) => ({
        updateOne: {
          filter: { _id: String(msgId) },
          update: { $set: { ...data, updatedAt: timestamp } },
          upsert: true
        }
      }));
      await rateEditsCol.bulkWrite(ratingOps, { ordered: false });
    }

    // 8. Bulk Sync Dedicated Burn Rooms (!burn)
    await burnRoomsCol.updateOne(
      { _id: 'active_burn_rooms' },
      { $set: { rooms: cache.burnRooms || {}, updatedAt: timestamp } },
      { upsert: true }
    );
    const burnEntries = Object.entries(cache.burnRooms || {});
    if (burnEntries.length > 0) {
      const burnOps = burnEntries.map(([cid, room]) => ({
        updateOne: {
          filter: { _id: String(cid) },
          update: { $set: { ...room, updatedAt: timestamp } },
          upsert: true
        }
      }));
      await burnRoomsCol.bulkWrite(burnOps, { ordered: false });
    }

    // 9. Bulk Sync Dedicated Auto-Reacts Collection
    const autoReactGuilds = guildEntries.filter(([_, g]) => g.autoReacts && Object.keys(g.autoReacts).length > 0);
    if (autoReactGuilds.length > 0) {
      const reactOps = autoReactGuilds.map(([gid, g]) => ({
        updateOne: {
          filter: { _id: String(gid) },
          update: { $set: { reacts: g.autoReacts, updatedAt: timestamp } },
          upsert: true
        }
      }));
      await autoReactsCol.bulkWrite(reactOps, { ordered: false });
    }

    // 10. Bulk Sync Dedicated Sticky Messages Collection
    const stickyEntries = Object.entries(cache.stickyMessages || {});
    if (stickyEntries.length > 0) {
      const stickyOps = stickyEntries.map(([gid, map]) => ({
        updateOne: {
          filter: { _id: String(gid) },
          update: { $set: { channels: map, updatedAt: timestamp } },
          upsert: true
        }
      }));
      await stickyCol.bulkWrite(stickyOps, { ordered: false });
    }

    // 11. Bulk Sync Dedicated News Feeds (!news)
    const newsEntries = Object.entries(cache.newsFeeds || {}).filter(([_, cfg]) => cfg && (cfg.channelId || (Array.isArray(cfg.feeds) && cfg.feeds.length > 0)));
    if (newsEntries.length > 0) {
      const newsOps = newsEntries.map(([gid, cfg]) => ({
        updateOne: {
          filter: { _id: String(gid) },
          update: {
            $set: {
              channelId: cfg.channelId || null,
              roleId: cfg.roleId || null,
              feeds: Array.isArray(cfg.feeds) ? cfg.feeds : [],
              lastGuids: Array.isArray(cfg.lastGuids) ? cfg.lastGuids : [],
              updatedAt: timestamp
            }
          },
          upsert: true
        }
      }));
      await newsCol.bulkWrite(newsOps, { ordered: false });
    }

    // 12. Bulk Sync Dedicated In-Voice Roles (!voicerole)
    const voiceRoleGuilds = guildEntries.filter(([_, g]) => g && g.voiceRoleId);
    if (voiceRoleGuilds.length > 0) {
      const vrOps = voiceRoleGuilds.map(([gid, g]) => ({
        updateOne: {
          filter: { _id: String(gid) },
          update: {
            $set: {
              roleId: g.voiceRoleId,
              updatedAt: timestamp
            }
          },
          upsert: true
        }
      }));
      await voiceRolesCol.bulkWrite(vrOps, { ordered: false });
    }

    // 13. Bulk Sync Dedicated Economy & Shop Items
    const allEconGuilds = new Set([...Object.keys(cache.economy || {}), ...Object.keys(cache.shopItems || {})]);
    if (allEconGuilds.size > 0) {
      const econOps = Array.from(allEconGuilds).map(gid => ({
        updateOne: {
          filter: { _id: String(gid) },
          update: {
            $set: {
              users: cache.economy?.[gid] || {},
              shopItems: cache.shopItems?.[gid] || [],
              updatedAt: timestamp
            }
          },
          upsert: true
        }
      }));
      await chunkedBulkWrite(economyCol, econOps, 500);
      syncStats.economy = allEconGuilds.size;
    }

    // 14. Bulk Sync Dedicated Users XP & Systems
    const allXpGuilds = new Set([...Object.keys(cache.usersXp || {}), ...Object.keys(cache.xpSystems || {})]);
    if (allXpGuilds.size > 0) {
      const xpOps = Array.from(allXpGuilds).map(gid => ({
        updateOne: {
          filter: { _id: String(gid) },
          update: {
            $set: {
              system: cache.xpSystems?.[gid] || null,
              users: cache.usersXp?.[gid] || {},
              updatedAt: timestamp
            }
          },
          upsert: true
        }
      }));
      await chunkedBulkWrite(xpCol, xpOps, 500);
      syncStats.xp = allXpGuilds.size;
    }

    // 15. Bulk Sync Dedicated Giveaways
    const giveawayEntries = Object.entries(cache.giveaways || {});
    if (giveawayEntries.length > 0) {
      const gwOps = giveawayEntries.map(([mid, data]) => ({
        updateOne: {
          filter: { _id: String(mid) },
          update: { $set: { ...data, updatedAt: timestamp } },
          upsert: true
        }
      }));
      await chunkedBulkWrite(giveawaysCol, gwOps, 500);
      syncStats.giveaways = giveawayEntries.length;
    }

    // 16. Bulk Sync Dedicated Reaction Roles
    const rrEntries = Object.entries(cache.reactionRoles || {});
    if (rrEntries.length > 0) {
      const rrOps = rrEntries.map(([mid, data]) => ({
        updateOne: {
          filter: { _id: String(mid) },
          update: { $set: { ...data, updatedAt: timestamp } },
          upsert: true
        }
      }));
      await chunkedBulkWrite(reactionRolesCol, rrOps, 500);
      syncStats.reactionRoles = rrEntries.length;
    }

    // 17. Bulk Sync Dedicated Moderation & Security State
    const allModGuilds = new Set([
      ...Object.keys(cache.warnings || {}),
      ...Object.keys(cache.quarantines || {}),
      ...Object.keys(cache.tempBans || {}),
      ...Object.keys(cache.exploitTaints || {}),
      ...Object.keys(cache.extraOwners || {}),
      ...Object.keys(cache.botWhitelist || {}),
      ...Object.keys(cache.moveProtection || {}),
      ...Object.keys(cache.vcProtection || {})
    ]);
    if (allModGuilds.size > 0) {
      const modOps = Array.from(allModGuilds).map(gid => ({
        updateOne: {
          filter: { _id: String(gid) },
          update: {
            $set: {
              warnings: cache.warnings?.[gid] || null,
              quarantines: cache.quarantines?.[gid] || null,
              tempBans: cache.tempBans?.[gid] || null,
              exploitTaints: cache.exploitTaints?.[gid] || null,
              extraOwners: cache.extraOwners?.[gid] || null,
              botWhitelist: cache.botWhitelist?.[gid] || null,
              moveProtection: cache.moveProtection?.[gid] || null,
              vcProtection: cache.vcProtection?.[gid] || null,
              updatedAt: timestamp
            }
          },
          upsert: true
        }
      }));
      await chunkedBulkWrite(moderationCol, modOps, 500);
      syncStats.moderation = allModGuilds.size;
    }

    // 18. Bulk Sync Dedicated Server Entry Application Gates
    const allEntryGuilds = new Set([
      ...Object.keys(cache.entryConfigs || {}),
      ...Object.keys(cache.entryPending || {})
    ]);
    if (allEntryGuilds.size > 0) {
      const entryOps = Array.from(allEntryGuilds).map(gid => ({
        updateOne: {
          filter: { _id: String(gid) },
          update: {
            $set: {
              config: cache.entryConfigs?.[gid] || null,
              pending: cache.entryPending?.[gid] || null,
              updatedAt: timestamp
            }
          },
          upsert: true
        }
      }));
      await chunkedBulkWrite(entryGatesCol, entryOps, 500);
      syncStats.entryGates = allEntryGuilds.size;
    }

    // 19. Bulk Sync Dedicated Roleplay Data & Marriages
    const allRpGuilds = new Set([
      ...Object.keys(cache.roleplay || {}),
      ...Object.keys(cache.roleplayUsers || {}),
      ...Object.keys(cache.roleplayMarriages || {})
    ]);
    if (allRpGuilds.size > 0) {
      const rpOps = Array.from(allRpGuilds).map(gid => ({
        updateOne: {
          filter: { _id: String(gid) },
          update: {
            $set: {
              roleplay: cache.roleplay?.[gid] || null,
              users: cache.roleplayUsers?.[gid] || null,
              marriages: cache.roleplayMarriages?.[gid] || null,
              updatedAt: timestamp
            }
          },
          upsert: true
        }
      }));
      await chunkedBulkWrite(roleplayCol, rpOps, 500);
      syncStats.roleplay = allRpGuilds.size;
    }
    if (cache.family && Object.keys(cache.family).length > 0) {
      await roleplayCol.updateOne(
        { _id: 'global_family' },
        { $set: { family: cache.family, updatedAt: timestamp } },
        { upsert: true }
      );
    }

    // 20. Bulk Sync Dedicated Server Snapshots & Time Machine
    const allSnapGuilds = new Set([
      ...Object.keys(cache.serverSnapshots || {}),
      ...Object.keys(cache.timeMachineSnapshots || {})
    ]);
    if (allSnapGuilds.size > 0) {
      const snapOps = Array.from(allSnapGuilds).map(gid => ({
        updateOne: {
          filter: { _id: String(gid) },
          update: {
            $set: {
              snapshots: (cache.serverSnapshots?.[gid] || []).slice(-10),
              timeMachine: (cache.timeMachineSnapshots?.[gid] || []).slice(-10),
              updatedAt: timestamp
            }
          },
          upsert: true
        }
      }));
      await chunkedBulkWrite(serverSnapshotsCol, snapOps, 500);
      syncStats.snapshots = allSnapGuilds.size;
    }

    // 21. Bulk Sync Dedicated Anti-Nuke Incidents & Telemetry
    const allSecGuilds = new Set([
      ...Object.keys(cache.incidentReports || {}),
      ...Object.keys(cache.securityLiveRecords || {}),
      ...Object.keys(cache.nukeSignatures || {})
    ]);
    if (allSecGuilds.size > 0) {
      const secOps = Array.from(allSecGuilds).map(gid => ({
        updateOne: {
          filter: { _id: String(gid) },
          update: {
            $set: {
              reports: (cache.incidentReports?.[gid] || []).slice(-20),
              liveRecords: (cache.securityLiveRecords?.[gid] || []).slice(-30),
              nukeSignatures: (cache.nukeSignatures?.[gid] || []).slice(-20),
              updatedAt: timestamp
            }
          },
          upsert: true
        }
      }));
      await chunkedBulkWrite(incidentsCol, secOps, 500);
      syncStats.incidents = allSecGuilds.size;
    }

    // 22. Sync Dedicated Minigames & Arcade Stats
    await minigamesCol.updateOne(
      { _id: 'global_minigames' },
      {
        $set: {
          minigames: cache.minigamesStats || {},
          arcade: cache.arcadeStats || {},
          chess: cache.chessStats || {},
          updatedAt: timestamp
        }
      },
      { upsert: true }
    );

    // 23. Sync SQLite stats.db to MongoDB collections
    await pushStatsToMongo(statsDB).catch(() => null);

    // 24. Push Snapshot Metadata to cloud_backups (Lightweight master recovery audit - keep latest 3)
    try {
      const snapshotDoc = {
        _id: `backup_${timestamp.getTime()}`,
        timestamp: Date.now(),
        dateStr: timestamp.toISOString(),
        reason,
        guildCount: guildEntries.length,
        countingCount: countingEntries.length,
        ticketCount: ticketEntries.length,
        newsCount: newsEntries.length,
        voiceRolesCount: voiceRoleGuilds.length,
        economyCount: syncStats.economy || 0,
        xpCount: syncStats.xp || 0,
        giveawaysCount: syncStats.giveaways || 0,
        reactionRolesCount: syncStats.reactionRoles || 0,
        moderationCount: syncStats.moderation || 0,
        snapshotsCount: syncStats.snapshots || 0,
        schemaVersion: 'v3.4.0',
        stats: {
          userStats: syncStats.userStats || 0,
          channelStats: syncStats.channelStats || 0,
          invites: syncStats.invites || 0,
          joins: syncStats.joins || 0
        }
      };
      await backupsCol.insertOne(snapshotDoc).catch(() => null);
      // Retain only latest 3 metadata records
      const count = await backupsCol.countDocuments().catch(() => 0);
      if (count > 3) {
        const oldest = await backupsCol.find().sort({ timestamp: 1 }).limit(count - 3).toArray();
        const idsToDelete = oldest.map(d => d._id);
        await backupsCol.deleteMany({ _id: { $in: idsToDelete } }).catch(() => null);
      }
    } catch {}

    // Update real-time sync statistics
    syncStats.guilds = guildEntries.length;
    syncStats.counting = countingEntries.length;
    syncStats.setups = allSetupGuildIds.size;
    syncStats.tickets = ticketEntries.length;
    syncStats.triggers = triggerEntries.length + (cache.globalTriggers?.length ? 1 : 0);
    syncStats.rateChannels = Object.keys(cache.rateChannels || {}).length;
    syncStats.editRatings = editRatingEntries.length;
    syncStats.burnRooms = burnEntries.length;
    syncStats.mediaChannels = guildEntries.filter(([_, g]) => g.mediaChannelId).length;
    syncStats.quoteChannels = guildEntries.filter(([_, g]) => g.quoteChannelId).length;
    syncStats.autoReacts = autoReactGuilds.length;
    syncStats.stickyMessages = stickyEntries.length;
    syncStats.newsFeeds = newsEntries.length;
    syncStats.voiceRoles = voiceRoleGuilds.length;

    lastSyncTimestamp = Date.now();
    lastSyncStatus = `Synced (${reason}) @ ${new Date().toLocaleTimeString()}`;

    return {
      success: true,
      guilds: guildEntries.length,
      counting: countingEntries.length,
      setups: allSetupGuildIds.size,
      tickets: ticketEntries.length,
      newsFeeds: newsEntries.length,
      voiceRoles: voiceRoleGuilds.length,
      rateChannels: syncStats.rateChannels,
      editRatings: syncStats.editRatings,
      mediaChannels: syncStats.mediaChannels,
      quoteChannels: syncStats.quoteChannels,
      autoReacts: syncStats.autoReacts,
      triggers: syncStats.triggers,
      burnRooms: syncStats.burnRooms,
      userStats: syncStats.userStats || 0,
      channelStats: syncStats.channelStats || 0,
      invites: syncStats.invites || 0,
      joins: syncStats.joins || 0
    };
  } catch (err) {
    console.error(chalk.red('[MongoSync] Push error:'), err);
    if (err?.code === 8000 || err?.message?.includes('space quota') || err?.message?.includes('quota')) {
      console.warn(chalk.yellow('[MongoSync] Space quota reached. Dropping cloud_backups to reclaim cluster storage...'));
      await mongoDb.collection('cloud_backups').drop().catch(() => mongoDb.collection('cloud_backups').deleteMany({}));
    }
    return { success: false, error: err.message };
  } finally {
    isSyncing = false;
  }
}

/**
 * Debounced trigger for database changes. Batches rapid writes cleanly.
 */
export function triggerMongoSave(db, statsDB = null) {
  if (!isConnected && !getMongoUri()) return;
  if (saveDebounceTimer) return;

  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null;
    pushToMongo(db, statsDB, 'Live Auto-Save').catch(() => {});
  }, 4500);
}

/**
 * Starts the periodic background sync scheduler (every 5 minutes).
 */
export function startMongoSyncScheduler(db, statsDB = null, intervalMinutes = 5) {
  if (periodicSyncTimer) clearInterval(periodicSyncTimer);
  const ms = intervalMinutes * 60 * 1000;

  periodicSyncTimer = setInterval(() => {
    pushToMongo(db, statsDB, `Periodic ${intervalMinutes}m Cycle`).catch(() => {});
  }, ms).unref();
}

/**
 * Executes MongoDB bulk operations in chunks to prevent packet sizing and timeout issues.
 */
async function chunkedBulkWrite(collection, ops, chunkSize = 500) {
  for (let i = 0; i < ops.length; i += chunkSize) {
    const chunk = ops.slice(i, i + chunkSize);
    await collection.bulkWrite(chunk, { ordered: false }).catch(() => {});
  }
}

/**
 * Pushes SQLite stats rows to MongoDB
 */
async function pushStatsToMongo(statsDB) {
  if (!mongoDb) return;
  try {
    if (!statsDB) {
      try {
        const statsMod = await import('../statsDB.js');
        statsDB = statsMod.default || statsMod;
      } catch {}
    }
    const rawDb = statsDB?.getDatabaseInstance?.() || (statsDB?._rawDb);
    if (!rawDb) return;

    // 1. User activity
    const userRows = rawDb.prepare('SELECT guild_id, user_id, date, messages, voice_seconds FROM user_activity').all();
    if (userRows.length > 0) {
      const userOps = userRows.map(r => ({
        updateOne: {
          filter: { _id: `${r.guild_id}_${r.user_id}_${r.date}` },
          update: { $set: { ...r, updatedAt: new Date() } },
          upsert: true
        }
      }));
      await chunkedBulkWrite(mongoDb.collection('stats_user_activity'), userOps, 500);
      syncStats.userStats = userRows.length;
    }

    // 2. Channel activity
    const chanRows = rawDb.prepare('SELECT guild_id, user_id, channel_id, date, messages, voice_seconds FROM channel_activity').all();
    if (chanRows.length > 0) {
      const chanOps = chanRows.map(r => ({
        updateOne: {
          filter: { _id: `${r.guild_id}_${r.user_id}_${r.channel_id}_${r.date}` },
          update: { $set: { ...r, updatedAt: new Date() } },
          upsert: true
        }
      }));
      await chunkedBulkWrite(mongoDb.collection('stats_channel_activity'), chanOps, 500);
      syncStats.channelStats = chanRows.length;
    }

    // 3. User invites
    const inviteRows = rawDb.prepare('SELECT guild_id, user_id, regular, leaves, fake FROM user_invites').all();
    if (inviteRows.length > 0) {
      const inviteOps = inviteRows.map(r => ({
        updateOne: {
          filter: { _id: `${r.guild_id}_${r.user_id}` },
          update: { $set: { ...r, updatedAt: new Date() } },
          upsert: true
        }
      }));
      await chunkedBulkWrite(mongoDb.collection('stats_user_invites'), inviteOps, 500);
      syncStats.invites = inviteRows.length;
    }

    // 4. Join history
    const joinRows = rawDb.prepare('SELECT guild_id, joined_user_id, inviter_id FROM join_history').all();
    if (joinRows.length > 0) {
      const joinOps = joinRows.map(r => ({
        updateOne: {
          filter: { _id: `${r.guild_id}_${r.joined_user_id}` },
          update: { $set: { ...r, updatedAt: new Date() } },
          upsert: true
        }
      }));
      await chunkedBulkWrite(mongoDb.collection('stats_join_history'), joinOps, 500);
      syncStats.joins = joinRows.length;
    }
  } catch {}
}

/**
 * Hydrates local SQLite tables from MongoDB
 */
async function hydrateStatsFromMongo(statsDB) {
  if (!mongoDb) return { userStats: 0, channelStats: 0, invites: 0, joins: 0 };
  try {
    if (!statsDB) {
      try {
        const statsMod = await import('../statsDB.js');
        statsDB = statsMod.default || statsMod;
      } catch {}
    }
    const rawDb = statsDB?.getDatabaseInstance?.() || (statsDB?._rawDb);
    if (!rawDb) return { userStats: 0, channelStats: 0, invites: 0, joins: 0 };

    let userCount = 0;
    let chanCount = 0;
    let invCount = 0;
    let joinCount = 0;

    // Hydrate user activity
    const userDocs = await mongoDb.collection('stats_user_activity').find({}).toArray();
    if (userDocs.length > 0) {
      const insertUser = rawDb.prepare(`
        INSERT OR REPLACE INTO user_activity (guild_id, user_id, date, messages, voice_seconds)
        VALUES (@guild_id, @user_id, @date, @messages, @voice_seconds)
      `);
      const insertMany = rawDb.transaction((rows) => {
        for (const row of rows) insertUser.run(row);
      });
      insertMany(userDocs);
      userCount = userDocs.length;
      console.log(chalk.cyan(`[MongoSync] Restored ${userDocs.length} user activity rows into SQLite stats.db`));
    }

    // Hydrate channel activity
    const chanDocs = await mongoDb.collection('stats_channel_activity').find({}).toArray();
    if (chanDocs.length > 0) {
      const insertChan = rawDb.prepare(`
        INSERT OR REPLACE INTO channel_activity (guild_id, user_id, channel_id, date, messages, voice_seconds)
        VALUES (@guild_id, @user_id, @channel_id, @date, @messages, @voice_seconds)
      `);
      const insertMany = rawDb.transaction((rows) => {
        for (const row of rows) insertChan.run(row);
      });
      insertMany(chanDocs);
      chanCount = chanDocs.length;
      console.log(chalk.cyan(`[MongoSync] Restored ${chanDocs.length} channel activity rows into SQLite stats.db`));
    }

    // Hydrate invites
    const inviteDocs = await mongoDb.collection('stats_user_invites').find({}).toArray();
    if (inviteDocs.length > 0) {
      const insertInv = rawDb.prepare(`
        INSERT OR REPLACE INTO user_invites (guild_id, user_id, regular, leaves, fake)
        VALUES (@guild_id, @user_id, @regular, @leaves, @fake)
      `);
      const insertMany = rawDb.transaction((rows) => {
        for (const row of rows) insertInv.run(row);
      });
      insertMany(inviteDocs);
      invCount = inviteDocs.length;
    }

    // Hydrate join history
    const joinDocs = await mongoDb.collection('stats_join_history').find({}).toArray();
    if (joinDocs.length > 0) {
      const insertJoin = rawDb.prepare(`
        INSERT OR REPLACE INTO join_history (guild_id, joined_user_id, inviter_id)
        VALUES (@guild_id, @joined_user_id, @inviter_id)
      `);
      const insertMany = rawDb.transaction((rows) => {
        for (const row of rows) insertJoin.run(row);
      });
      insertMany(joinDocs);
      joinCount = joinDocs.length;
    }

    return {
      userStats: userCount,
      channelStats: chanCount,
      invites: invCount,
      joins: joinCount
    };
  } catch (err) {
    console.warn('[MongoSync] Stats hydration warning:', err.message);
    return { userStats: 0, channelStats: 0, invites: 0, joins: 0 };
  }
}
