import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from './emojis.js';
import { EmbedBuilder, AttachmentBuilder, AuditLogEvent, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import db from '../database.js';
import { generateDashboard, generateTimeoutCard, generateAutomodCard } from './dashboardCanvas.js';

function formatLogTime(date) {
  return `[${date.getUTCHours().toString().padStart(2, '0')}:${date.getUTCMinutes().toString().padStart(2, '0')}]`;
}

export async function fetchDashboardStats(guild) {
  // Roles
  const roles = guild.roles.cache;
  const adminRoles = roles.filter(r => r.permissions.has(PermissionFlagsBits.Administrator));
  const threatRoles = roles.filter(r => {
    return !r.permissions.has(PermissionFlagsBits.Administrator) &&
           (r.permissions.has(PermissionFlagsBits.BanMembers) ||
            r.permissions.has(PermissionFlagsBits.KickMembers) ||
            r.permissions.has(PermissionFlagsBits.ManageChannels) ||
            r.permissions.has(PermissionFlagsBits.ManageRoles));
  });

  // Users
  const members = await guild.members.fetch().catch(() => guild.members.cache);
  const privileged = members.filter(m => m.permissions.has(PermissionFlagsBits.Administrator));
  const threatUsers = members.filter(m => {
    return !m.permissions.has(PermissionFlagsBits.Administrator) &&
           (m.permissions.has(PermissionFlagsBits.BanMembers) ||
            m.permissions.has(PermissionFlagsBits.KickMembers) ||
            m.permissions.has(PermissionFlagsBits.ManageChannels) ||
            m.permissions.has(PermissionFlagsBits.ManageRoles));
  });

  // Channels & Integrations
  const channels = guild.channels.cache.size;
  const integrations = (await guild.fetchIntegrations().catch(() => new Map())).size;

  // Assets (Emojis + Stickers)
  const totalAssets = guild.emojis.cache.size + guild.stickers.cache.size;
  
  // Firewall Status
  const cfg = db.getGuildConfig(guild.id);
  const isSecured = Boolean(cfg.securityEnabled && cfg.antiNukeEnabled);
  const firewall = isSecured ? 'Active' : 'Offline';

  // Integrity Index Calculation (0-100%)
  // Start at 100%. Deduct for high ratios of admins to members, threat roles, offline firewall.
  let integrity = 100;
  if (!isSecured) integrity -= 30;
  if (adminRoles.size > 10) integrity -= 10;
  if (threatRoles.size > 5) integrity -= Math.min(20, threatRoles.size * 2);
  if (threatUsers.size > 10) integrity -= Math.min(20, threatUsers.size * 2);
  if (integrity < 10) integrity = 10;

  // Recent Activity (Audit Logs)
  const logs = [];
  const timeoutLogs = [];
  try {
    const auditLogs = await guild.fetchAuditLogs({ limit: 20 });
    
    for (const entry of auditLogs.entries.values()) {
      const timeStr = formatLogTime(entry.createdAt);
      const user = entry.executor ? entry.executor.username : 'Unknown';

      // General Monitoring Core
      if ([
        AuditLogEvent.ChannelCreate, AuditLogEvent.ChannelDelete,
        AuditLogEvent.RoleCreate, AuditLogEvent.RoleDelete,
        AuditLogEvent.MemberBanAdd, AuditLogEvent.MemberKick
      ].includes(entry.action)) {
        if (logs.length < 6) {
          const actionStr = AuditLogEvent[entry.action].replace(/([A-Z])/g, ' $1').trim().toUpperCase();
          const target = entry.target ? (entry.target.username || entry.target.name || 'Unknown') : 'Unknown';
          logs.push(`${timeStr} ${actionStr} > ${user} > ${target}`);
        }
      }

      // Timeout Logs
      if (entry.action === AuditLogEvent.MemberUpdate) {
        const timeoutChange = entry.changes.find(c => c.key === 'communication_disabled_until');
        if (timeoutChange) {
          if (timeoutLogs.length < 4) {
            const target = entry.target ? entry.target.username : 'Unknown';
            const actionStr = timeoutChange.new ? 'TIMEOUT ADDED' : 'TIMEOUT REMOVED';
            timeoutLogs.push(`${timeStr} ${actionStr} > ${user} > ${target}`);
          }
        }
      }
    }
  } catch (err) {
    if (err && err.code !== 'UND_ERR_CONNECT_TIMEOUT' && !err.message?.includes('Connect Timeout')) {
      console.error('Failed to fetch audit logs for dashboard:', err);
    }
  }

  return {
    integrity,
    metrics: {
      roles: roles.size,
      adminRoles: adminRoles.size,
      threatRoles: threatRoles.size,
      permRisk: threatRoles.size + threatUsers.size,
      channels,
      privileged: privileged.size,
      threatUsers: threatUsers.size,
      integrations,
      totalAssets,
      threatAssets: 0, // Placeholder
      activity: 'Tracking', 
      firewall
    },
    logs,
    timeoutLogs,
    automodLogs: [] // Can be hooked into Automod rules if needed
  };
}

export const _dashboardLocks = new Set();

export async function updateDashboardMessage(guild, client) {
  const cfg = db.getGuildConfig(guild.id);
  if (!cfg.dashboardChannelId) return;

  if (_dashboardLocks.has(guild.id)) return; // Prevent concurrent syncs
  _dashboardLocks.add(guild.id);

  try {
    const channel = guild.channels.cache.get(cfg.dashboardChannelId);
    if (!channel) return;

    const stats = await fetchDashboardStats(guild);
    const accentColor = cfg.accentColor || '#00FFFF'; // Fallback to cyan
    const accentInt = parseInt(accentColor.replace('#', ''), 16);

    const dbBuffer = await generateDashboard(stats, accentColor);
    const toBuffer = await generateTimeoutCard(stats.timeoutLogs, accentColor);
    const amBuffer = await generateAutomodCard(stats.automodLogs, accentColor);

    const timestamp = Date.now();
    const fileDb = new AttachmentBuilder(dbBuffer, { name: `dashboard_${timestamp}.png` });
    const fileTo = new AttachmentBuilder(toBuffer, { name: `timeout_${timestamp}.png` });
    const fileAm = new AttachmentBuilder(amBuffer, { name: `automod_${timestamp}.png` });

    const cardDb = {
      type: 17,
      components: [
        {
          type: 10,
          content: `<a:uptime:1552608831060844575> **[Live Sync Active]**\n` +
                   `## **ATHENA'S SECURITY DASHBOARD**\n` +
                   `-# **• __Status:__ \`${stats.metrics.firewall === 'Active' ? 'PROTECTED' : 'VULNERABLE'}\`**\n` +
                   `-# **• __Last Sync:__ <t:${Math.floor(Date.now() / 1000)}:R>**\n` +
                   `-# **• __Live Monitoring:__ \`Active\`**`
        },
        { type: 14, divider: true },
        {
          type: 12,
          items: [{ media: { url: `attachment://${fileDb.name}` } }]
        },
        { type: 14, divider: true },
        {
          type: 10,
          content: `-# **Athena Bulletproof Security System • V1.0.0**`
        }
      ]
    };

    const cardTo = {
      type: 17,
      components: [
        {
          type: 10,
          content: `# ${getRandomHeadingGlyph()} **ADMIN INTERVENTION & TIMEOUTS**`
        },
        { type: 14, divider: true },
        {
          type: 12,
          items: [{ media: { url: `attachment://${fileTo.name}` } }]
        },
        { type: 14, divider: true },
        {
          type: 10,
          content: `-# **Athena Bulletproof Security System • V1.0.0**`
        }
      ]
    };

    const cardAm = {
      type: 17,
      components: [
        {
          type: 10,
          content: `# ${getRandomHeadingGlyph()} **AUTOMATED SECURITY EVENTS**`
        },
        { type: 14, divider: true },
        {
          type: 12,
          items: [{ media: { url: `attachment://${fileAm.name}` } }]
        },
        { type: 14, divider: true },
        {
          type: 10,
          content: `-# **Athena Bulletproof Security System • V1.0.0**`
        }
      ]
    };

    let msgIds = cfg.dashboardMessageIds || [];
    
    // Check if we need to post new messages or edit existing
    if (msgIds.length === 3) {
      try {
        let m1, m2, m3;
        try { m1 = await channel.messages.fetch(msgIds[0]); } catch(e) { throw new Error(`Fetch m1 failed: ${e.code}`); }
        try { m2 = await channel.messages.fetch(msgIds[1]); } catch(e) { throw new Error(`Fetch m2 failed: ${e.code}`); }
        try { m3 = await channel.messages.fetch(msgIds[2]); } catch(e) { throw new Error(`Fetch m3 failed: ${e.code}`); }
        
        // If existing messages do not have type 12 media gallery, purge and recreate cleanly
        const needsRecreate = [m1, m2, m3].some(m => {
          const comps = m?.components?.[0]?.components || [];
          return !comps.some(c => c.type === 12);
        });
        if (needsRecreate) {
          await Promise.allSettled([m1.delete().catch(() => {}), m2.delete().catch(() => {}), m3.delete().catch(() => {})]);
          throw new Error('Purged old dashboard messages to recreate clean accent borderless CV2 containers');
        }

        try { await m1.edit({ components: [cardDb], files: [fileDb], attachments: [], flags: MessageFlags.IsComponentsV2 }); } catch(e) { throw new Error(`Edit m1 failed: ${e.code}`); }
        try { await m2.edit({ components: [cardTo], files: [fileTo], attachments: [], flags: MessageFlags.IsComponentsV2 }); } catch(e) { throw new Error(`Edit m2 failed: ${e.code}`); }
        try { await m3.edit({ components: [cardAm], files: [fileAm], attachments: [], flags: MessageFlags.IsComponentsV2 }); } catch(e) { throw new Error(`Edit m3 failed: ${e.code}`); }
        
        // Cleanup duplicates if any exist
        const fetched = await channel.messages.fetch({ limit: 50 }).catch(() => null);
        if (fetched) {
          const rogueMessages = fetched.filter(m => m.author.id === client.user.id && !msgIds.includes(m.id));
          for (const m of rogueMessages.values()) {
            await m.delete().catch(() => {});
          }
        }

        return; // Success
      } catch (err) {
        if (err.message.includes('10008')) {
          console.log(`[Dashboard Sync] Old messages not found in ${guild.id}. (msgIds: ${msgIds.join(', ')}). Error: ${err.message}. Reposting dashboard...`);
        } else {
          console.log(`[Dashboard Sync] Edit failed in ${guild.id}, recreating dashboard...`);
        }
      }
    }

    // Post new messages if missing, OR adopt existing ones
    // First check if there are already valid bot messages in the channel
    const fetched = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (fetched) {
      const botMessages = fetched.filter(m => m.author.id === client.user.id).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      
      // If we found exactly 3 bot messages, maybe they are the dashboard! Let's adopt them instead of deleting.
      if (botMessages.size === 3) {
        const msgs = [...botMessages.values()];
        const needsRecreate = msgs.some(m => {
          const comps = m?.components?.[0]?.components || [];
          return !comps.some(c => c.type === 12);
        });
        if (!needsRecreate) {
          try {
            await msgs[0].edit({ components: [cardDb], files: [fileDb], attachments: [], flags: MessageFlags.IsComponentsV2 });
            await msgs[1].edit({ components: [cardTo], files: [fileTo], attachments: [], flags: MessageFlags.IsComponentsV2 });
            await msgs[2].edit({ components: [cardAm], files: [fileAm], attachments: [], flags: MessageFlags.IsComponentsV2 });
            db.setDashboardInfo(guild.id, channel.id, [msgs[0].id, msgs[1].id, msgs[2].id]);
            return; // Adopted successfully
          } catch (e) {
            // If edit fails, we fall through to delete and repost
          }
        }
      }

      // Otherwise, clear old messages in channel
      for (const m of botMessages.values()) {
        await m.delete().catch(() => {});
      }
    }

    const m1 = await channel.send({ components: [cardDb], files: [fileDb], flags: MessageFlags.IsComponentsV2 });
    const m2 = await channel.send({ components: [cardTo], files: [fileTo], flags: MessageFlags.IsComponentsV2 });
    const m3 = await channel.send({ components: [cardAm], files: [fileAm], flags: MessageFlags.IsComponentsV2 });

    db.setDashboardInfo(guild.id, channel.id, [m1.id, m2.id, m3.id]);

  } catch (err) {
    console.error(`Failed to update dashboard for ${guild.id}:`, err);
  } finally {
    _dashboardLocks.delete(guild.id);
  }
}

export async function setupDashboardChannel(guild, client) {
  const cfg = db.getGuildConfig(guild.id);
  
  // 1. ALWAYS check database ID first to detect dashboard channel
  let targetChannel = cfg.dashboardChannelId
    ? (guild.channels.cache.get(cfg.dashboardChannelId) || await guild.channels.fetch(cfg.dashboardChannelId).catch(() => null))
    : null;

  const allDashChannels = guild.channels.cache.filter(c => c.name === 'athenas-dashboard');
  if (allDashChannels.size > 1) {
    const sorted = [...allDashChannels.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    targetChannel = targetChannel || sorted[0]; // Prefer DB channel, otherwise keep oldest
    for (const c of sorted) {
      if (c.id !== targetChannel.id) {
        await c.delete().catch(() => {});
      }
    }
  } else if (allDashChannels.size === 1) {
    targetChannel = targetChannel || allDashChannels.first();
  }

  // 2. If we found a valid channel, update it and return
  if (targetChannel) {
    if (cfg.dashboardChannelId !== targetChannel.id) {
      db.setDashboardInfo(guild.id, targetChannel.id, []);
    }
    
    // Ensure existing channels have the correct permissions (visible to everyone)
    try {
      await targetChannel.permissionOverwrites.edit(guild.id, {
        ViewChannel: true,
        SendMessages: false,
        AddReactions: false
      });
      await targetChannel.permissionOverwrites.edit(client.user.id, {
        ViewChannel: true,
        SendMessages: true,
        EmbedLinks: true,
        AttachFiles: true,
        ReadMessageHistory: true,
        ManageMessages: true
      });
    } catch (e) {
      console.error('Failed to update dashboard channel permissions:', e);
    }

    return updateDashboardMessage(guild, client);
  }

  // Create channel
  try {
    const channel = await guild.channels.create({
      name: "athenas-dashboard",
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.id,
          allow: [PermissionFlagsBits.ViewChannel],
          deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions]
        },
        {
          id: client.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
        }
      ]
    });

    db.setDashboardInfo(guild.id, channel.id, []);
    await updateDashboardMessage(guild, client);
  } catch (err) {
    if (err.code === 30013 || err.code === 50013) {
      console.log(`[Dashboard] Skipped creating dashboard in ${guild.name} (${err.code === 30013 ? '500 Channel Limit Reached' : 'Missing Permissions'})`);
    } else {
      console.error('Failed to create dashboard channel:', err);
    }
  }
}
