import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.resolve('data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db = null;
let _logMessageUser = null;
let _logMessageChannel = null;
let _logVoiceUser = null;
let _logVoiceChannel = null;
let _pruneData = null;
let _pruneChannelData = null;
let _logInvite = null;
let _recordJoin = null;
let _getInviter = null;
let _logLeave = null;
let _syncInvites = null;

// Pre-compiled prepared transactions for sub-microsecond zero-allocation activity logging
let _logMessageTx = null;
let _logVoiceTx = null;

// Pre-compiled query statements
let _getUserStatsStmt = null;
let _getServerRanksMsgStmt = null;
let _getServerRanksVcStmt = null;
let _getUserCheckStmt = null;
let _getTopMsgChannelsStmt = null;
let _getTopVcChannelsStmt = null;
let _getChartDataStmt = null;
let _getServerOverviewStatsStmt = null;
let _getTopMsgMemberStmt = null;
let _getTopVcMemberStmt = null;
let _getTopMsgChannelStmt = null;
let _getTopVcChannelStmt = null;
let _getOverviewChartRowsStmt = null;
let _getTopMembersStmt = null;
let _getTopVoiceMembersStmt = null;
let _getTopInvitesStmt = null;
let _getUserInvitesStmt = null;

function initDatabase() {
  if (db && db.open) {
    try { db.close(); } catch {}
  }

  db = new Database(path.join(DB_DIR, 'stats.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -8000'); // 8MB memory cache

  // Initialize tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_activity (
      guild_id TEXT,
      user_id TEXT,
      date TEXT,
      messages INTEGER DEFAULT 0,
      voice_seconds INTEGER DEFAULT 0,
      PRIMARY KEY (guild_id, user_id, date)
    );

    CREATE TABLE IF NOT EXISTS channel_activity (
      guild_id TEXT,
      user_id TEXT,
      channel_id TEXT,
      date TEXT,
      messages INTEGER DEFAULT 0,
      voice_seconds INTEGER DEFAULT 0,
      PRIMARY KEY (guild_id, user_id, channel_id, date)
    );

    CREATE INDEX IF NOT EXISTS idx_user_activity_date ON user_activity(date);
    CREATE INDEX IF NOT EXISTS idx_channel_activity_date ON channel_activity(date);

    CREATE TABLE IF NOT EXISTS user_invites (
      guild_id TEXT,
      user_id TEXT,
      regular INTEGER DEFAULT 0,
      leaves INTEGER DEFAULT 0,
      fake INTEGER DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS join_history (
      guild_id TEXT,
      joined_user_id TEXT,
      inviter_id TEXT,
      PRIMARY KEY (guild_id, joined_user_id)
    );
  `);

  _logMessageUser = db.prepare(`
    INSERT INTO user_activity (guild_id, user_id, date, messages)
    VALUES (?, ?, date('now'), 1)
    ON CONFLICT(guild_id, user_id, date)
    DO UPDATE SET messages = messages + 1;
  `);

  _logMessageChannel = db.prepare(`
    INSERT INTO channel_activity (guild_id, user_id, channel_id, date, messages)
    VALUES (?, ?, ?, date('now'), 1)
    ON CONFLICT(guild_id, user_id, channel_id, date)
    DO UPDATE SET messages = messages + 1;
  `);

  _logVoiceUser = db.prepare(`
    INSERT INTO user_activity (guild_id, user_id, date, voice_seconds)
    VALUES (?, ?, date('now'), ?)
    ON CONFLICT(guild_id, user_id, date)
    DO UPDATE SET voice_seconds = voice_seconds + ?;
  `);

  _logVoiceChannel = db.prepare(`
    INSERT INTO channel_activity (guild_id, user_id, channel_id, date, voice_seconds)
    VALUES (?, ?, ?, date('now'), ?)
    ON CONFLICT(guild_id, user_id, channel_id, date)
    DO UPDATE SET voice_seconds = voice_seconds + ?;
  `);

  _pruneData = db.prepare(`DELETE FROM user_activity WHERE date < date('now', '-31 days');`);
  _pruneChannelData = db.prepare(`DELETE FROM channel_activity WHERE date < date('now', '-31 days');`);

  _logInvite = db.prepare(`
    INSERT INTO user_invites (guild_id, user_id, regular)
    VALUES (?, ?, 1)
    ON CONFLICT(guild_id, user_id)
    DO UPDATE SET regular = regular + 1;
  `);

  _recordJoin = db.prepare(`
    INSERT OR REPLACE INTO join_history (guild_id, joined_user_id, inviter_id)
    VALUES (?, ?, ?);
  `);

  _getInviter = db.prepare(`
    SELECT inviter_id FROM join_history WHERE guild_id = ? AND joined_user_id = ?;
  `);

  _logLeave = db.prepare(`
    UPDATE user_invites SET leaves = leaves + 1 WHERE guild_id = ? AND user_id = ?;
  `);

  _syncInvites = db.prepare(`
    INSERT INTO user_invites (guild_id, user_id, regular)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id)
    DO UPDATE SET regular = MAX(regular, excluded.regular);
  `);

  // Pre-compile transactions once on load
  _logMessageTx = db.transaction((guildId, userId, channelId) => {
    _logMessageUser.run(guildId, userId);
    _logMessageChannel.run(guildId, userId, channelId);
  });

  _logVoiceTx = db.transaction((guildId, userId, channelId, seconds) => {
    _logVoiceUser.run(guildId, userId, seconds, seconds);
    _logVoiceChannel.run(guildId, userId, channelId, seconds, seconds);
  });

  // Pre-compile frequently accessed query statements
  _getUserStatsStmt = db.prepare(`
    SELECT 
      SUM(CASE WHEN date = date('now') THEN messages ELSE 0 END) as d1_msg,
      SUM(CASE WHEN date = date('now') THEN voice_seconds ELSE 0 END) as d1_vc,
      SUM(CASE WHEN date >= date('now', '-6 days') THEN messages ELSE 0 END) as d7_msg,
      SUM(CASE WHEN date >= date('now', '-6 days') THEN voice_seconds ELSE 0 END) as d7_vc,
      SUM(CASE WHEN date >= date('now', '-13 days') THEN messages ELSE 0 END) as d14_msg,
      SUM(CASE WHEN date >= date('now', '-13 days') THEN voice_seconds ELSE 0 END) as d14_vc,
      SUM(messages) as d30_msg,
      SUM(voice_seconds) as d30_vc
    FROM user_activity
    WHERE guild_id = ? AND user_id = ? AND date >= date('now', '-29 days')
  `);

  _getServerRanksMsgStmt = db.prepare(`
    SELECT count(*) as rank FROM (
      SELECT user_id, SUM(messages) as total FROM user_activity
      WHERE guild_id = ? AND date >= date('now', '-29 days')
      GROUP BY user_id
      HAVING total > (
        SELECT SUM(messages) FROM user_activity 
        WHERE guild_id = ? AND user_id = ? AND date >= date('now', '-29 days')
      )
    )
  `);

  _getServerRanksVcStmt = db.prepare(`
    SELECT count(*) as rank FROM (
      SELECT user_id, SUM(voice_seconds) as total FROM user_activity
      WHERE guild_id = ? AND date >= date('now', '-29 days')
      GROUP BY user_id
      HAVING total > (
        SELECT SUM(voice_seconds) FROM user_activity 
        WHERE guild_id = ? AND user_id = ? AND date >= date('now', '-29 days')
      )
    )
  `);

  _getUserCheckStmt = db.prepare(`
    SELECT SUM(messages) as m, SUM(voice_seconds) as v 
    FROM user_activity 
    WHERE guild_id = ? AND user_id = ? AND date >= date('now', '-29 days')
  `);

  _getTopMsgChannelsStmt = db.prepare(`
    SELECT channel_id, SUM(messages) as total FROM channel_activity
    WHERE guild_id = ? AND user_id = ? AND date >= date('now', '-29 days') AND messages > 0
    GROUP BY channel_id
    ORDER BY total DESC
    LIMIT 3
  `);

  _getTopVcChannelsStmt = db.prepare(`
    SELECT channel_id, SUM(voice_seconds) as total FROM channel_activity
    WHERE guild_id = ? AND user_id = ? AND date >= date('now', '-29 days') AND voice_seconds > 0
    GROUP BY channel_id
    ORDER BY total DESC
    LIMIT 3
  `);

  _getChartDataStmt = db.prepare(`
    SELECT date, messages, voice_seconds 
    FROM user_activity 
    WHERE guild_id = ? AND user_id = ? AND date >= date('now', '-29 days')
    ORDER BY date ASC
  `);

  _getServerOverviewStatsStmt = db.prepare(`
    SELECT 
      SUM(CASE WHEN date = date('now') THEN messages ELSE 0 END) as d1_msg,
      SUM(CASE WHEN date = date('now') THEN voice_seconds ELSE 0 END) as d1_vc,
      COUNT(DISTINCT CASE WHEN date = date('now') AND (messages > 0 OR voice_seconds > 0) THEN user_id ELSE NULL END) as d1_contributors,

      SUM(CASE WHEN date >= date('now', '-6 days') THEN messages ELSE 0 END) as d7_msg,
      SUM(CASE WHEN date >= date('now', '-6 days') THEN voice_seconds ELSE 0 END) as d7_vc,
      COUNT(DISTINCT CASE WHEN date >= date('now', '-6 days') AND (messages > 0 OR voice_seconds > 0) THEN user_id ELSE NULL END) as d7_contributors,

      SUM(CASE WHEN date >= date('now', '-13 days') THEN messages ELSE 0 END) as d14_msg,
      SUM(CASE WHEN date >= date('now', '-13 days') THEN voice_seconds ELSE 0 END) as d14_vc,
      COUNT(DISTINCT CASE WHEN date >= date('now', '-13 days') AND (messages > 0 OR voice_seconds > 0) THEN user_id ELSE NULL END) as d14_contributors
    FROM user_activity
    WHERE guild_id = ? AND date >= date('now', '-13 days')
  `);

  _getTopMsgMemberStmt = db.prepare(`
    SELECT user_id, SUM(messages) as total FROM user_activity
    WHERE guild_id = ? AND date >= date('now', '-13 days') AND messages > 0
    GROUP BY user_id ORDER BY total DESC LIMIT 1
  `);

  _getTopVcMemberStmt = db.prepare(`
    SELECT user_id, SUM(voice_seconds) as total FROM user_activity
    WHERE guild_id = ? AND date >= date('now', '-13 days') AND voice_seconds > 0
    GROUP BY user_id ORDER BY total DESC LIMIT 1
  `);

  _getTopMsgChannelStmt = db.prepare(`
    SELECT channel_id, SUM(messages) as total FROM channel_activity
    WHERE guild_id = ? AND date >= date('now', '-13 days') AND messages > 0
    GROUP BY channel_id ORDER BY total DESC LIMIT 1
  `);

  _getTopVcChannelStmt = db.prepare(`
    SELECT channel_id, SUM(voice_seconds) as total FROM channel_activity
    WHERE guild_id = ? AND date >= date('now', '-13 days') AND voice_seconds > 0
    GROUP BY channel_id ORDER BY total DESC LIMIT 1
  `);

  _getOverviewChartRowsStmt = db.prepare(`
    SELECT date, SUM(messages) as messages, SUM(voice_seconds) as voice_seconds
    FROM user_activity
    WHERE guild_id = ? AND date >= date('now', '-13 days')
    GROUP BY date
    ORDER BY date ASC
  `);

  _getTopMembersStmt = db.prepare(`
    SELECT user_id, SUM(messages) as total
    FROM user_activity
    WHERE guild_id = ? AND date >= date('now', '-13 days') AND messages > 0
    GROUP BY user_id
    ORDER BY total DESC
    LIMIT ?
  `);

  _getTopVoiceMembersStmt = db.prepare(`
    SELECT user_id, SUM(voice_seconds) as total
    FROM user_activity
    WHERE guild_id = ? AND date >= date('now', '-13 days') AND voice_seconds > 0
    GROUP BY user_id
    ORDER BY total DESC
    LIMIT ?
  `);

  _getTopInvitesStmt = db.prepare(`
    SELECT user_id, regular, leaves, fake, (regular - leaves - fake) as net
    FROM user_invites
    WHERE guild_id = ? AND (regular - leaves - fake) > 0
    ORDER BY net DESC
    LIMIT ?
  `);

  _getUserInvitesStmt = db.prepare(`
    SELECT regular, leaves, fake, (regular - leaves - fake) as net
    FROM user_invites
    WHERE guild_id = ? AND user_id = ?
  `);
}

// Initialize on load
initDatabase();

export function checkpoint() {
  try {
    if (db && db.open) {
      db.pragma('wal_checkpoint(TRUNCATE)');
    }
  } catch (e) {
    console.warn('[StatsDB] Checkpoint warning:', e.message);
  }
}

export function close() {
  try {
    if (db && db.open) {
      checkpoint();
      db.close();
    }
  } catch (e) {
    console.warn('[StatsDB] Close warning:', e.message);
  }
}

export function reopen() {
  initDatabase();
}

export function logMessage(guildId, userId, channelId) {
  try {
    if (_logMessageTx) {
      _logMessageTx(guildId, userId, channelId);
    }
  } catch (e) {
    console.error('Error logging message stat:', e);
  }
}

export function logVoice(guildId, userId, channelId, seconds) {
  if (seconds <= 0) return;
  try {
    if (_logVoiceTx) {
      _logVoiceTx(guildId, userId, channelId, seconds);
    }
  } catch (e) {
    console.error('Error logging voice stat:', e);
  }
}

export function pruneOldStats() {
  try {
    _pruneData.run();
    _pruneChannelData.run();
  } catch (e) {
    console.error('Error pruning old stats:', e);
  }
}

export function getUserStats(guildId, userId) {
  const row = _getUserStatsStmt ? _getUserStatsStmt.get(guildId, userId) : {};
  const data = row || {};
  return {
    msg_1d:  data.d1_msg  || 0,
    msg_7d:  data.d7_msg  || 0,
    msg_14d: data.d14_msg || 0,
    msg_30d: data.d30_msg || 0,
    vc_1d:   data.d1_vc   || 0,
    vc_7d:   data.d7_vc   || 0,
    vc_14d:  data.d14_vc  || 0,
    vc_30d:  data.d30_vc  || 0
  };
}

export function getServerRanks(guildId, userId) {
  const msgRankRow = _getServerRanksMsgStmt ? _getServerRanksMsgStmt.get(guildId, guildId, userId) : { rank: 0 };
  const vcRankRow = _getServerRanksVcStmt ? _getServerRanksVcStmt.get(guildId, guildId, userId) : { rank: 0 };
  const userCheck = _getUserCheckStmt ? _getUserCheckStmt.get(guildId, userId) : null;

  return {
    msg_rank: (userCheck && userCheck.m > 0) ? (msgRankRow.rank + 1) : null,
    vc_rank: (userCheck && userCheck.v > 0) ? (vcRankRow.rank + 1) : null
  };
}

export function getTopChannels(guildId, userId) {
  const msgChannels = _getTopMsgChannelsStmt ? _getTopMsgChannelsStmt.all(guildId, userId) : [];
  const vcChannels = _getTopVcChannelsStmt ? _getTopVcChannelsStmt.all(guildId, userId) : [];

  return {
    messages: msgChannels,
    voice: vcChannels
  };
}

export function getChartData(guildId, userId) {
  const rows = _getChartDataStmt ? _getChartDataStmt.all(guildId, userId) : [];

  const dataMap = {};
  for (const row of rows) {
    dataMap[row.date] = row;
  }

  const result = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateString = d.toISOString().split('T')[0];
    
    if (dataMap[dateString]) {
      result.push({
        date: dateString,
        messages: dataMap[dateString].messages || 0,
        voice_seconds: dataMap[dateString].voice_seconds || 0
      });
    } else {
      result.push({
        date: dateString,
        messages: 0,
        voice_seconds: 0
      });
    }
  }

  return result;
}

export function getServerOverviewStats(guildId) {
  const statsRow = _getServerOverviewStatsStmt ? (_getServerOverviewStatsStmt.get(guildId) || {}) : {};

  // Top Members
  const topMsgMember = _getTopMsgMemberStmt ? (_getTopMsgMemberStmt.get(guildId) || null) : null;
  const topVcMember = _getTopVcMemberStmt ? (_getTopVcMemberStmt.get(guildId) || null) : null;

  // Top Channels
  const topMsgChannel = _getTopMsgChannelStmt ? (_getTopMsgChannelStmt.get(guildId) || null) : null;
  const topVcChannel = _getTopVcChannelStmt ? (_getTopVcChannelStmt.get(guildId) || null) : null;

  // Chart Data
  const chartRows = _getOverviewChartRowsStmt ? _getOverviewChartRowsStmt.all(guildId) : [];

  const dataMap = {};
  for (const row of chartRows) {
    dataMap[row.date] = row;
  }

  const chart = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateString = d.toISOString().split('T')[0];
    
    if (dataMap[dateString]) {
      chart.push({
        date: dateString,
        messages: dataMap[dateString].messages || 0,
        voice_seconds: dataMap[dateString].voice_seconds || 0
      });
    } else {
      chart.push({
        date: dateString,
        messages: 0,
        voice_seconds: 0
      });
    }
  }

  return {
    overview: {
      d1_msg: statsRow.d1_msg || 0,
      d1_vc: statsRow.d1_vc || 0,
      d1_contributors: statsRow.d1_contributors || 0,
      d7_msg: statsRow.d7_msg || 0,
      d7_vc: statsRow.d7_vc || 0,
      d7_contributors: statsRow.d7_contributors || 0,
      d14_msg: statsRow.d14_msg || 0,
      d14_vc: statsRow.d14_vc || 0,
      d14_contributors: statsRow.d14_contributors || 0
    },
    topMembers: {
      messages: topMsgMember,
      voice: topVcMember
    },
    topChannels: {
      messages: topMsgChannel,
      voice: topVcChannel
    },
    chart
  };
}

export function getTopMembers(guildId, limit = 10) {
  return _getTopMembersStmt ? _getTopMembersStmt.all(guildId, limit) : [];
}

export function getTopVoiceMembers(guildId, limit = 10) {
  return _getTopVoiceMembersStmt ? _getTopVoiceMembersStmt.all(guildId, limit) : [];
}

// ============================================================
// INVITE TRACKING
// ============================================================

export function syncRetroactiveInvites(guildId, inviterId, amount) {
  try {
    _syncInvites.run(guildId, inviterId, amount);
  } catch(e) {}
}

export function logInvite(guildId, inviterId, joinedUserId) {
  try {
    _logInvite.run(guildId, inviterId);
    _recordJoin.run(guildId, joinedUserId, inviterId);
  } catch (err) {
    console.error('Database Error [logInvite]:', err);
  }
}

export function logLeave(guildId, leavingUserId) {
  try {
    const row = _getInviter.get(guildId, leavingUserId);
    if (row && row.inviter_id) {
      _logLeave.run(guildId, row.inviter_id);
    }
  } catch (err) {
    console.error('Database Error [logLeave]:', err);
  }
}

export function getTopInvites(guildId, limit = 10) {
  return _getTopInvitesStmt ? _getTopInvitesStmt.all(guildId, limit) : [];
}

export function getUserInvites(guildId, userId) {
  return _getUserInvitesStmt ? (_getUserInvitesStmt.get(guildId, userId) || { regular: 0, leaves: 0, fake: 0, net: 0 }) : { regular: 0, leaves: 0, fake: 0, net: 0 };
}


export default {
  logMessage,
  logVoice,
  pruneOldStats,
  getUserStats,
  getServerRanks,
  getTopChannels,
  getChartData,
  getServerOverviewStats,
  getTopMembers,
  getTopVoiceMembers,
  logInvite,
  logLeave,
  getTopInvites,
  getUserInvites,
  syncRetroactiveInvites,
  checkpoint,
  close,
  reopen
};
