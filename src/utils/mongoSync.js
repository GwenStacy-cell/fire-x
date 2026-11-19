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
    await mongoDb.collection('stats_user_activity').createIndex({ guild_id: 1, user_id: 1, date: 1 }).catch(() => {});
    await mongoDb.collection('stats_channel_activity').createIndex({ guild_id: 1, channel_id: 1, date: 1 }).catch(() => {});
    await mongoDb.collection('cloud_backups').createIndex({ timestamp: -1 }).catch(() => {});
  } catch {}
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

      // 11. Fail-Safe Recovery from Latest Cloud Backup Snapshot if any essential cache is missing
      const latestBackup = await backupsCol.find().sort({ timestamp: -1 }).limit(1).toArray();
      if (latestBackup.length > 0 && latestBackup[0].data) {
        const bData = latestBackup[0].data;
        for (const [k, v] of Object.entries(bData)) {
          if (!db.cache[k] || (typeof db.cache[k] === 'object' && Object.keys(db.cache[k]).length === 0 && Object.keys(v || {}).length > 0)) {
            db.cache[k] = v;
          }
        }
      }

      // 12. Hydrate SQLite stats.db if available
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
    const coreCol = mongoDb.collection('core_cache');
    const backupsCol = mongoDb.collection('cloud_backups');

    const cache = db.cache || {};

    // 1. Sync Core / Global Configs
    const globalPayload = { _id: 'global_state', updatedAt: timestamp };
    for (const [key, val] of Object.entries(cache)) {
      if (['guilds', 'counting', 'welcome', 'leave', 'jtc', 'serverStats', 'tickets', 'verification', 'birthdays', 'triggers', 'globalTriggers', 'rateChannels', 'editRatings', 'burnRooms', 'stickyMessages'].includes(key)) continue;
      // Skip heavy historical rolling snapshots to keep core state agile
      if (key === 'serverSnapshots' || key === 'timeMachineSnapshots') continue;
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

    // 11. Sync SQLite stats.db to MongoDB collections
    await pushStatsToMongo(statsDB).catch(() => null);

    // 12. Push Full Snapshot Document to cloud_backups (Rolling master recovery history - retain latest 30)
    try {
      const snapshotDoc = {
        timestamp: Date.now(),
        dateStr: timestamp.toISOString(),
        reason,
        guildCount: guildEntries.length,
        countingCount: countingEntries.length,
        ticketCount: ticketEntries.length,
        schemaVersion: 'v3.1.8',
        stats: {
          userStats: syncStats.userStats || 0,
          channelStats: syncStats.channelStats || 0,
          invites: syncStats.invites || 0,
          joins: syncStats.joins || 0
        },
        data: cache
      };
      await backupsCol.insertOne(snapshotDoc);
      // Prune old snapshots beyond 30
      const count = await backupsCol.countDocuments();
      if (count > 30) {
        const oldest = await backupsCol.find().sort({ timestamp: 1 }).limit(count - 30).toArray();
        const idsToDelete = oldest.map(d => d._id);
        await backupsCol.deleteMany({ _id: { $in: idsToDelete } });
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

    lastSyncTimestamp = Date.now();
    lastSyncStatus = `Synced (${reason}) @ ${new Date().toLocaleTimeString()}`;

    return {
      success: true,
      guilds: guildEntries.length,
      counting: countingEntries.length,
      setups: allSetupGuildIds.size,
      tickets: ticketEntries.length,
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
