import db from '../database.js';

export default {
  name: 'presenceUpdate',
  async execute(oldPresence, newPresence) {
    if (!newPresence || !newPresence.guild || !newPresence.member) return;

    // Auto-update server stats counters on presence status change (e.g. online <-> offline)
    if (oldPresence?.status !== newPresence?.status) {
      import('../commands/serverstats.js').then(m => {
        m.scheduleServerStatsUpdate(newPresence.guild, 'presenceUpdate');
      }).catch(() => null);
    }
    
    const config = db.getGuildConfig(newPresence.guild.id);
    if (!config || !config.vanityString || !config.vanityRole) return;

    // A user might have multiple activities (playing a game, custom status, etc)
    const customStatus = newPresence.activities.find(activity => activity.type === 4); // 4 = Custom Status
    
    const rawVanityRoles = Array.isArray(config.vanityRole) ? config.vanityRole : [config.vanityRole];
    const rolesToManage = [];
    for (const rId of rawVanityRoles) {
      const role = newPresence.guild.roles.cache.get(rId) || await newPresence.guild.roles.fetch(rId).catch(() => null);
      if (role && role.editable) rolesToManage.push(role);
    }
    if (rolesToManage.length === 0) return;

    const hasVanityInStatus = customStatus && customStatus.state && customStatus.state.includes(config.vanityString);
    
    if (hasVanityInStatus) {
      const rolesToAdd = rolesToManage.filter(r => !newPresence.member.roles.cache.has(r.id));
      if (rolesToAdd.length > 0) {
        await newPresence.member.roles.add(rolesToAdd, 'Athena Prime: Vanity Status Award').catch(() => null);
      }
    } else {
      const rolesToRemove = rolesToManage.filter(r => newPresence.member.roles.cache.has(r.id));
      if (rolesToRemove.length > 0) {
        await newPresence.member.roles.remove(rolesToRemove, 'Athena Prime: Vanity Status Removed').catch(() => null);
      }
    }
  }
};
