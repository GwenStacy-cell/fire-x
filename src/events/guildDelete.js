import db from '../database.js';

export default {
  name: 'guildDelete',
  async execute(guild) {
    if (!guild || !guild.client) return;

    try {
      // Retain all snapshots, settings, and rolling recovery buffers even if the bot leaves or is removed.
      if (!db.cache.botAnalytics) db.cache.botAnalytics = { joins: 0, leaves: 0, cmds: {} };
      if (!db.cache.botAnalytics.recentLeaves) db.cache.botAnalytics.recentLeaves = [];
      db.cache.botAnalytics.leaves++;
      db.cache.botAnalytics.recentLeaves.unshift({ id: guild.id, name: guild.name, ownerId: guild.ownerId, time: Date.now() });
      if (db.cache.botAnalytics.recentLeaves.length > 20) db.cache.botAnalytics.recentLeaves.pop();
      db.save();
    } catch (e) {
      console.error('Error in guildDelete event:', e);
    }
  }
};
