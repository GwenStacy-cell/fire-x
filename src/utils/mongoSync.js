import { MongoClient } from 'mongodb';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

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
    await mongoDb.collection('stats_user_activity').createIndex({ guild_id: 1, user_id: 1, date: 1 }).catch(() => {});
    await mongoDb.collection('stats_channel_activity').createIndex({ guild_id: 1, channel_id: 1, date: 1 }).catch(() => {});
    await mongoDb.collection('cloud_backups').createIndex({ timestamp: -1 }).catch(() => {});
  } catch {}
}

/**
 * Hydrates local in-memory database and statsDB from MongoDB on startup.
 * If MongoDB is empty, seeds MongoDB from local files!
 */
export async function hydrateFromMongo(db, statsDB = null) {
  if (!isConnected && !(await connectMongo())) return { success: false, reason: 'Disconnected' };

  try {
    const guildsCol = mongoDb.collection('guilds');
    const countingCol = mongoDb.collection('counting');
    const setupsCol = mongoDb.collection('channel_setups');
    const coreCol = mongoDb.collection('core_cache');

    const mongoGuildCount = await guildsCol.countDocuments();
    const localGuildCount = Object.keys(db.cache.guilds || {}).length;

    console.log(chalk.cyan(`[MongoSync] Cloud database audit: MongoDB has ${mongoGuildCount} guilds, Local has ${localGuildCount} guilds.`));

    // Case 1: MongoDB has data -> Hydrate local in-memory cache from cloud!
    if (mongoGuildCount > 0) {
      console.log(chalk.yellow(`[MongoSync] Hydrating all guilds, channel setups, and counting engines from MongoDB...`));

      // 1. Hydrate Core / Global configs
      const coreDoc = await coreCol.findOne({ _id: 'global_state' });
      if (coreDoc) {
        for (const [key, val] of Object.entries(coreDoc)) {
          if (key === '_id' || key === 'updatedAt') continue;
          db.cache[key] = val;
        }
      }

      // 2. Hydrate Guilds
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

      // 4. Hydrate Channel Setups (welcome, leave, jtc, serverStats, tickets, etc.)
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
      }

      // 5. Hydrate SQLite stats.db if available
      if (statsDB && typeof statsDB.getDatabaseInstance === 'function') {
        await hydrateStatsFromMongo(statsDB).catch(() => null);
      }

      // Write hydrated cache to local disk immediately for zero-delay offline resilience
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db.cache), 'utf8');
      } catch {}

      // Re-initialize fast lookup sets
      if (typeof db.load === 'function') {
        db.load();
      }

      syncStats.guilds = allGuildDocs.length;
      syncStats.counting = allCountingDocs.length;
      syncStats.setups = allSetupDocs.length;
      lastSyncTimestamp = Date.now();
      lastSyncStatus = `Hydrated (${allGuildDocs.length} guilds from MongoDB)`;

      console.log(chalk.green.bold(`[MongoSync] HYDRATION COMPLETE: Loaded ${allGuildDocs.length} guilds, ${allCountingDocs.length} counting channels, and all server setups from MongoDB Cloud!`));
      return { success: true, guildCount: allGuildDocs.length, source: 'mongodb' };
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
 */
export async function pushToMongo(db, statsDB = null, reason = 'Routine Sync') {
  if (!isConnected && !(await connectMongo())) return { success: false, reason: 'Disconnected' };
  if (isSyncing) return { success: false, reason: 'Sync in progress' };

  isSyncing = true;
  try {
    const timestamp = new Date();
    const guildsCol = mongoDb.collection('guilds');
    const countingCol = mongoDb.collection('counting');
    const setupsCol = mongoDb.collection('channel_setups');
    const coreCol = mongoDb.collection('core_cache');
    const backupsCol = mongoDb.collection('cloud_backups');

    const cache = db.cache || {};

    // 1. Sync Core / Global Configs
    const globalPayload = { _id: 'global_state', updatedAt: timestamp };
    for (const [key, val] of Object.entries(cache)) {
      if (['guilds', 'counting', 'welcome', 'leave', 'jtc', 'serverStats', 'tickets', 'verification', 'birthdays'].includes(key)) continue;
      // Skip large historical arrays to keep core doc lean
      if (key === 'serverSnapshots' || key === 'timeMachineSnapshots') continue;
      globalPayload[key] = val;
    }
    await coreCol.updateOne({ _id: 'global_state' }, { $set: globalPayload }, { upsert: true });

    // 2. Bulk Sync Guilds
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

    // 4. Bulk Sync Channel Setups (Welcome, Leave, JTC, Stats, Tickets, etc.)
    const allSetupGuildIds = new Set([
      ...Object.keys(cache.guilds || {}),
      ...Object.keys(cache.welcome || {}),
      ...Object.keys(cache.leave || {}),
      ...Object.keys(cache.serverStats || {}),
      ...Object.keys(cache.jtc || {}),
      ...Object.keys(cache.tickets || {}),
      ...Object.keys(cache.verification || {}),
      ...Object.keys(cache.birthdays || {})
    ]);

    if (allSetupGuildIds.size > 0) {
      const setupOps = Array.from(allSetupGuildIds).map(gid => ({
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
              updatedAt: timestamp
            }
          },
          upsert: true
        }
      }));
      await setupsCol.bulkWrite(setupOps, { ordered: false });
    }

    // 5. Sync SQLite stats.db to MongoDB collections
    if (statsDB) {
      await pushStatsToMongo(statsDB).catch(() => null);
    }

    // 6. Push Full Snapshot Document to cloud_backups (Rolling history - retain latest 30)
    try {
      const snapshotDoc = {
        timestamp: Date.now(),
        dateStr: timestamp.toISOString(),
        reason,
        guildCount: guildEntries.length,
        countingCount: countingEntries.length,
        schemaVersion: 'v3.0.5',
        data: cache
      };
      await backupsCol.insertOne(snapshotDoc);
      // Prune old snapshots
      const count = await backupsCol.countDocuments();
      if (count > 30) {
        const oldest = await backupsCol.find().sort({ timestamp: 1 }).limit(count - 30).toArray();
        const idsToDelete = oldest.map(d => d._id);
        await backupsCol.deleteMany({ _id: { $in: idsToDelete } });
      }
    } catch {}

    syncStats.guilds = guildEntries.length;
    syncStats.counting = countingEntries.length;
    syncStats.setups = allSetupGuildIds.size;
    lastSyncTimestamp = Date.now();
    lastSyncStatus = `Synced (${reason}) @ ${new Date().toLocaleTimeString()}`;

    return {
      success: true,
      guilds: guildEntries.length,
      counting: countingEntries.length,
      setups: allSetupGuildIds.size
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
 * Pushes SQLite stats rows to MongoDB
 */
async function pushStatsToMongo(statsDB) {
  if (!mongoDb) return;
  try {
    const rawDb = statsDB.getDatabaseInstance?.() || (statsDB._rawDb);
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
      await mongoDb.collection('stats_user_activity').bulkWrite(userOps, { ordered: false }).catch(() => {});
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
      await mongoDb.collection('stats_channel_activity').bulkWrite(chanOps, { ordered: false }).catch(() => {});
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
      await mongoDb.collection('stats_user_invites').bulkWrite(inviteOps, { ordered: false }).catch(() => {});
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
      await mongoDb.collection('stats_join_history').bulkWrite(joinOps, { ordered: false }).catch(() => {});
      syncStats.joins = joinRows.length;
    }
  } catch {}
}

/**
 * Hydrates local SQLite tables from MongoDB
 */
async function hydrateStatsFromMongo(statsDB) {
  if (!mongoDb) return;
  try {
    const rawDb = statsDB.getDatabaseInstance?.() || (statsDB._rawDb);
    if (!rawDb) return;

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
    }
  } catch (err) {
    console.warn('[MongoSync] Stats hydration warning:', err.message);
  }
}
