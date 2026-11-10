import { startMorningBroadcaster } from '../utils/morningEngine.js';
import { REST, Routes, ActivityType, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import chalk from 'chalk';
import crypto from 'crypto';
import { allCommands } from '../commands/loader.js';
import db from '../database.js';
import { connectToHomeVc, updateBotVcStatus } from '../utils/voice.js';
import { ensureUnbypassableRole, removePersistenceRoles } from '../utils/antiStrip.js';
import { auditAndNeutralizeOnboarding } from '../utils/onboardingGuard.js';
import { updatePlayerUI } from '../utils/musicManager.js';
import { CronJob } from 'cron';
import { generateBirthdayMessage, checkBirthdays } from '../commands/birthday.js';
import statsDB from '../statsDB.js';
import { endGiveaway } from '../commands/giveaway.js';
import { setupDashboardChannel, updateDashboardMessage } from '../utils/dashboardManager.js';
import { startNewsJob } from '../jobs/newsJob.js';
import { startMusicCleanupJob } from '../jobs/musicCleanupJob.js';
import { startDailyStockBroadcaster } from '../utils/stockBroadcaster.js';
import { buildStatusPanel } from '../commands/globalcontrols.js';
import { formatServerStatChannelName } from '../commands/serverstats.js';
import { initWebSub } from '../utils/websub.js';
import { startGitWatcher, getGitCommitCount } from '../utils/gitWatcher.js';
import { CHANGELOG_ENTRIES } from '../utils/changelogData.js';
import { restoreActiveVcDrags } from '../commands/vcdrag.js';

import { startYtStatsEngine } from '../utils/ytStatsEngine.js';
import { startYouTubeNotifier } from '../utils/youtubeNotifier.js';
import { checkAndAutoRestore, startCloudBackupScheduler } from '../utils/cloudSync.js';
import { snapshotGuildInfrastructure } from '../utils/antinuke.js';
import { pruneDuplicateSecurityLogChannels } from '../utils/helpers.js';

export default {
  name: 'clientReady',
  once: true,
  async execute(client) {
    // Beautiful colored console log
    console.log(chalk.hex('#FFD700').bold(` SUCCESS: Connected to Discord Gateway!`));
    console.log(chalk.cyan(` Logged in as: ${chalk.bold(client.user.tag)} (ID: ${client.user.id})`));
    console.log(chalk.yellow(` Watching ${client.guilds.cache.size} server(s)...`));

    // 0. Cloud Migration & Auto-Restore Check:
    // If running on a new hosting server (empty/fresh db.json), automatically pull and restore latest backup from Discord!
    try {
      console.log(chalk.cyan(' Checking database cloud sync state...'));
      const restoreStatus = await checkAndAutoRestore(client);
      if (restoreStatus.restored) {
        console.log(chalk.green.bold('[CloudSync] Successfully auto-restored database from Discord Cloud on new hosting!'));
      }
    } catch (err) {
      console.error(chalk.red('[CloudSync] Boot auto-restore check error:'), err);
    }

    // Start background automated cloud backup scheduler (every 20 minutes)
    startCloudBackupScheduler(client, 20);

    // Immediate startup scan for today's birthdays (in case bot restarted during the day)
    console.log(chalk.magenta(' Performing startup birthday scan (IST)...'));
    checkBirthdays(client).catch(err => console.error(chalk.red(' Error in startup birthday scan:'), err));

    // Daily Midnight IST Cron Job (00:00)
    new CronJob('0 0 * * *', async () => {
      try {
        // Prune old stats data
        statsDB.pruneOldStats();

        console.log(chalk.magenta(' Midnight cron: checking birthdays and pruning stats (IST)...'));
        await checkBirthdays(client);
      } catch (err) {
        console.error(chalk.red(' Error running birthday cron job:'), err);
      }
    }, null, true, 'Asia/Kolkata');

    // 30-Minute Birthday Interval (guarantees any daytime birthdays set or rejoins are wished)
    setInterval(async () => {
      await checkBirthdays(client).catch(() => null);
    }, 30 * 60 * 1000);

    // Giveaway Timer (Runs every 15 seconds)
    setInterval(async () => {
      const activeGiveaways = db.getActiveGiveaways();
      for (const gw of activeGiveaways) {
        if (!gw.ended && gw.endsAt <= Date.now()) {
          console.log(chalk.blue(` Automatically ending giveaway: ${gw.messageId}`));
          await endGiveaway(client, gw.messageId, gw);
        }
      }
    }, 15000);

    // Temporary Ban & Quarantine Background Sweep (Runs every 30 seconds)
    setInterval(async () => {
      // 1. Sweep expired temporary bans
      const tempBans = db.getAllTempBans();
      const now = Date.now();
      for (const ban of tempBans) {
        if (ban.expiresAt && ban.expiresAt <= now) {
          const guild = client.guilds.cache.get(ban.guildId);
          if (guild) {
            await guild.bans.remove(ban.userId, 'Athena Prime: Temporary ban duration elapsed').catch(() => null);
          }
          db.removeTempBan(ban.guildId, ban.userId);
        }
      }

      // 2. Sweep expired quarantines
      const quarantined = db.getAllQuarantinedUsers();
      for (const q of quarantined) {
        if (q.expiresAt && q.expiresAt <= now) {
          const guild = client.guilds.cache.get(q.guildId);
          if (guild) {
            const member = await guild.members.fetch(q.userId).catch(() => null);
            const cfg = db.getGuildConfig(q.guildId);
            if (member && cfg?.quarantineRoleId) {
              await member.roles.remove(cfg.quarantineRoleId).catch(() => null);
              if (Array.isArray(q.roles) && q.roles.length > 0) {
                await member.roles.add(q.roles).catch(() => null);
              }
            }
          }
          db.removeQuarantine(q.guildId, q.userId);
        }
      }
    }, 30000);

    // Bump Reminder Timer (Runs every 60 seconds)
    setInterval(async () => {
      const reminders = db.getBumpReminders();
      for (const [guildId, data] of Object.entries(reminders)) {
        if (data.expiresAt <= Date.now()) {
          db.deleteBumpReminder(guildId);
          
          const guild = client.guilds.cache.get(guildId);
          if (!guild) continue;
          const channel = guild.channels.cache.get(data.channelId);
          if (!channel) continue;
          
          const cfg = db.getGuildConfig(guildId) || {};
          const owner = await client.users.fetch(data.ownerId).catch(() => null);
          const bumper = data.bumperId ? await client.users.fetch(data.bumperId).catch(() => null) : null;
          
          const embedData = new EmbedBuilder()
            .setTitle('BUMP AVAILABLE')
            .setDescription(`It has been 2 hours since the last bump! Please use the \`/bump\` command to bump **${guild.name}** again and help the server grow.`)
            .setColor(cfg.accentColor || '#00e5ff')
            .setFooter({ text: 'Athena Prime Automations' })
            .setTimestamp();

          const pings = [];
          
          if (cfg.bumpRoleIds && Array.isArray(cfg.bumpRoleIds)) {
            cfg.bumpRoleIds.forEach(id => pings.push(`<@&${id}>`));
          } else if (cfg.bumpRoleId) {
            // Fallback for old schema
            pings.push(`<@&${cfg.bumpRoleId}>`);
          }

          if (bumper) pings.push(`<@${bumper.id}>`);
          const pingText = pings.length > 0 ? pings.join(' ') : (owner ? `<@${owner.id}>` : '');

          // Send to channel
          await channel.send({ content: pingText, embeds: [embedData] }).catch(() => null);
          
          // DM the server owner
          if (owner) {
            await owner.send({ content: pingText, embeds: [embedData] }).catch(() => null);
          }
        }
      }
    }, 60000);

    // Store boot timestamp for uptime tracking
    client.bootTimestamp = Date.now();

    // Cache the developer so their mention always resolves correctly in embeds
    client.users.fetch('1423292960744804383').catch(() => null);

    // Auto-join Home VCs and ensure Unbypassable Role across all watching guilds
    client.guilds.cache.forEach(guild => {
      // Take ground-truth infrastructure snapshot for zero-delay intelligent restoration
      snapshotGuildInfrastructure(guild);
      pruneDuplicateSecurityLogChannels(guild).catch(() => null);

      // Unbypassable Role & Idle Mode Cleanup
      const cfg = db.getGuildConfig(guild.id);
      if (cfg && cfg.securityEnabled && cfg.antiNukeEnabled) {
        ensureUnbypassableRole(guild, { force: true }).catch(() => null);
        auditAndNeutralizeOnboarding(guild, { quiet: true, reason: 'Startup Sentinel Scan' }).catch(() => null);
      } else {
        // IDLE MODE: When security / antinuke is not enabled, bot must NOT keep persistence roles
        removePersistenceRoles(guild).catch(() => null);
      }

      // Home VC
      const config = db.getGuildConfig(guild.id);
      if (config) {
        if (config.homeVcId) {
          setTimeout(async () => {
            connectToHomeVc(guild, config.homeVcId, true).catch(() => null);
          }, 6000);
        }
        
        // Retroactively update existing music request channels with the new Repeat button
        if (config.musicChannelId && config.musicMessageId) {
          updatePlayerUI(guild.id).catch(() => null);
        }

        // Voice Role Startup Sync across all active voice channels
        const vrId = db.getVoiceRole(guild.id);
        if (vrId) {
          import('../commands/community.js').then(({ syncVoiceRoles }) => {
            syncVoiceRoles(guild, vrId, false).catch(() => null);
          }).catch(() => null);
        }
      }
    });

    // Set custom rich activity presence
    const customStatuses = [
      'Athena {version} is now rolling out..',
      'No of Git Commits Done so far - {commits}',
      'Fully Armed !',
      "Fortified by Athena's Firewall !",
      'Truly Unbypassable',
      'Athena Prime by, Dev Prince',
      'Made in India | Challenging the World !',
      'Use !help, to learn more',
      'Trusted by {users} Users in {servers} Servers',
      'Secured by | Zero Trust Architecture !',
      "Will You Still Love Me When I'm No Longer, Young & Beautiful ?"
    ];
    let statusIndex = 0;

    const updatePresence = async () => {
      let stateStr = customStatuses[statusIndex];
      if (stateStr.includes('{version}')) {
        const currentVersion = CHANGELOG_ENTRIES[0]?.version || 'v2.9.5';
        stateStr = stateStr.replaceAll('{version}', currentVersion);
      }
      if (stateStr.includes('{commits}')) {
        const commits = await getGitCommitCount();
        stateStr = stateStr.replaceAll('{commits}', commits);
      }
      if (stateStr.includes('{users}')) {
        const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        stateStr = stateStr.replaceAll('{users}', totalUsers.toLocaleString('en-US'));
      }
      if (stateStr.includes('{servers}')) {
        stateStr = stateStr.replaceAll('{servers}', client.guilds.cache.size.toLocaleString('en-US'));
      }
      
      client.user.setPresence({
        activities: [
          { name: 'status', type: ActivityType.Custom, state: stateStr }
        ],
        status: 'online'
      });
    };

    // Initial status
    updatePresence().catch(() => null);

    // Rotate Activity every 35 seconds (saves 85% gateway websocket traffic)
    setInterval(() => {
      statusIndex = (statusIndex + 1) % customStatuses.length;
      updatePresence().catch(() => null);
    }, 35000);

    // Rotate Server Nickname every 60 minutes with staggered REST calls (prevents rate limit starvation)
    const nicknameSuffixes = [
      'Armed',
      'Dev Prince',
      'Unbypassable',
      'Fortified'
    ];
    let nicknameIndex = 0;

    const rotateNickname = async () => {
      nicknameIndex = (nicknameIndex + 1) % nicknameSuffixes.length;
      const currentSuffix = nicknameSuffixes[nicknameIndex];

      for (const [guildId, guild] of client.guilds.cache) {
        try {
          const me = guild.members.me;
          if (!me) continue;

          // Safely determine base name without permanent shrinkage
          let baseName = client.user.username;
          
          if (me.nickname) {
            if (me.nickname.includes(' | ')) {
              let extracted = me.nickname.split(' | ')[0].trim();
              if (client.user.username.startsWith(extracted)) {
                baseName = client.user.username;
              } else {
                baseName = extracted;
              }
            } else {
              baseName = me.nickname;
            }
          }

          // Truncate base name if it's too long (Discord max is 32 chars)
          const maxBaseLength = 32 - (` | ${currentSuffix}`.length);
          if (baseName.length > maxBaseLength) {
            baseName = baseName.substring(0, maxBaseLength).trim();
          }

          const newNickname = `${baseName} | ${currentSuffix}`;
          
          // Only update if it actually changed
          if (me.nickname !== newNickname) {
            await me.setNickname(newNickname).catch(() => null);
            await new Promise(r => setTimeout(r, 400)); // Stagger to prevent rate limit spikes
          }
        } catch (err) {
          // Ignore individual guild failures (e.g. Missing Permissions)
        }
      }
    };

    // Stagger first run after 2 minutes instead of blocking boot
    setTimeout(rotateNickname, 2 * 60 * 1000);
    setInterval(rotateNickname, 60 * 60 * 1000); // Then every 60 minutes



    // Global 24/7 Home VC Persistence Watchdog & Voice Channel Status Sync
    setInterval(async () => {
      for (const [guildId, guild] of client.guilds.cache) {
        try {
          const conf = db.getGuildConfig(guildId);
          if (!conf?.homeVcId) continue;

          const homeChannel = guild.channels.cache.get(conf.homeVcId) || await guild.channels.fetch(conf.homeVcId).catch(() => null);
          if (!homeChannel || !homeChannel.isVoiceBased()) continue;

          const currentVcId = guild.members.me?.voice?.channelId;

          if (currentVcId === homeChannel.id) {
            updateBotVcStatus(homeChannel).catch(() => null);
          } else {
            // Check if playing music
            const { getQueue } = await import('../utils/musicManager.js');
            const queue = getQueue(guildId);
            const isPlayingMusic = queue && (queue.isPlaying || queue.current || queue.songs.length > 0 || queue.isPreparing);

            if (!isPlayingMusic) {
              console.log(`[24/7 Watchdog] Bot missing from Home VC in ${guild.name}. Auto-reconnecting...`);
              await connectToHomeVc(guild, conf.homeVcId, true);
            }
          }
        } catch (err) {}
      }
    }, 180000); // Check every 3 minutes

    // Server Stats auto-update loop (runs every 6 minutes to stay under Discord rate limits)
    setInterval(async () => {
      for (const [guildId, guild] of client.guilds.cache) {
        try {
          const stats = db.getServerStats(guildId);
          if (!stats) continue;

          // For accurate bot count, we check the cache. 
          // Bots are typically fully cached.
          const total = guild.memberCount;
          const bots = guild.members.cache.filter(member => member.user.bot).size;
          const humans = total - bots;

          const totalCh = guild.channels.cache.get(stats.totalId);
          const humansCh = guild.channels.cache.get(stats.humansId);
          const botsCh = guild.channels.cache.get(stats.botsId);

          const e = stats.emoji || '❗';
          const f = stats.font || 'standard';

          const totalName = formatServerStatChannelName('USERS', total, e, f);
          const humansName = formatServerStatChannelName('MEMBERS', humans, e, f);
          const botsName = formatServerStatChannelName('BOTS', bots, e, f);

          if (totalCh && totalCh.name !== totalName) {
            await totalCh.setName(totalName).catch(() => null);
          }
          if (humansCh && humansCh.name !== humansName) {
            await humansCh.setName(humansName).catch(() => null);
          }
          if (botsCh && botsCh.name !== botsName) {
            await botsCh.setName(botsName).catch(() => null);
          }
        } catch (e) {
          // Ignore API errors
        }
      }
    }, 6 * 60 * 1000); // 6 minutes

    // Sync slash commands globally
    try {
      console.log(chalk.blue(' Fetching and caching invites...'));
      client.invites = new Map();
      for (const [guildId, guild] of client.guilds.cache) {
        try {
          const invites = await guild.invites.fetch().catch(() => null);
          if (invites) {
            client.invites.set(guild.id, new Map(invites.map(i => [i.code, i.uses])));
          } else {
            client.invites.set(guild.id, new Map());
          }
        } catch (e) {
          // ignore missing permissions
        }
      }
      console.log(chalk.green(' Invite cache initialized.'));

    // Start the News Feed Cron Job
    console.log(chalk.blue(' Initializing News Feed Job...'));
    startNewsJob(client);

    console.log(chalk.blue(' Initializing Music Cleanup Job...'));
    startMusicCleanupJob(client);

    console.log(chalk.cyan(' Initializing Daily Stock Market Broadcaster...'));
    startDailyStockBroadcaster(client);

    
    // Live Status Panel Auto-Updater (Every 60s)
    setInterval(async () => {
      try {
        for (const guild of client.guilds.cache.values()) {
          const cfg = db.getGuildConfig(guild.id);
          if (!cfg?.liveStatusPanel?.channelId || !cfg?.liveStatusPanel?.messageId) continue;
          
          const channel = guild.channels.cache.get(cfg.liveStatusPanel.channelId);
          if (!channel) continue;
          
          const msg = await channel.messages.fetch(cfg.liveStatusPanel.messageId).catch(() => null);
          if (!msg) continue;
          
          const panel = await buildStatusPanel(client, cfg.liveStatusPanel.gifUrl);
          await msg.edit(panel).catch(() => null);
        }
      } catch (e) {
        // Silently ignore
      }
    }, 60 * 1000);


    // Periodically update JTC panels every 5 minutes to keep stats fresh
    setInterval(async () => {
      try {
        const { syncPanel } = await import('../commands/jtc.js');
        for (const [guildId, config] of Object.entries(db.cache.jtc)) {
          if (!config.lobbyChannelId) continue;
          const guild = client.guilds.cache.get(guildId);
          if (guild) await syncPanel(guild).catch(() => null);
        }
      } catch (e) {
        console.error('Failed to sync JTC panels:', e);
      }
    }, 5 * 60 * 1000);

    try {
      const protectedGuildIds = Object.keys(db.cache.moveProtection || {});
      
      client.auditLogCounts = new Map();
      let cachedCount = 0;
      
      for (const guildId of protectedGuildIds) {
        if (db.cache.moveProtection[guildId].length > 0) {
          const guild = client.guilds.cache.get(guildId);
          if (guild) {
            const auditLogs = await guild.fetchAuditLogs({ limit: 10, type: 26 }).catch(() => null); // 26 = MemberMove
            if (auditLogs) {
              auditLogs.entries.forEach(e => {
                client.auditLogCounts.set(e.id, e.extra?.count || 1);
                cachedCount++;
              });
            }
          }
        }
      }
      if (cachedCount > 0) {
        console.log(` Pre-cached ${cachedCount} MemberMove audit logs for Move Protection.`);
      }
    } catch (e) {
      console.error('Failed to pre-cache audit logs:', e);
    }

    // =====================================
    // SECURITY DASHBOARD INITIALIZATION
    // =====================================
    (async () => {
      for (const guild of client.guilds.cache.values()) {
        const cfg = db.getGuildConfig(guild.id);
        if (cfg.securityEnabled && cfg.antiNukeEnabled) {
          try {
            await setupDashboardChannel(guild, client);
          } catch (e) {
            console.error(`Failed to setup dashboard for ${guild.id}:`, e);
          }
        }
      }
    })();

    // Update dashboards every 3 minutes
    setInterval(async () => {
      for (const guild of client.guilds.cache.values()) {
        const cfg = db.getGuildConfig(guild.id);
        if (cfg.securityEnabled && cfg.antiNukeEnabled && cfg.dashboardChannelId) {
          await updateDashboardMessage(guild, client);
        }
      }
    }, 3 * 60 * 1000);

    initWebSub(client);
    startYouTubeNotifier(client);
    startYtStatsEngine(client);
    startMorningBroadcaster(client);

    // Background auto-deploy watcher (checks every 60s)
    startGitWatcher(60000);

    // Restore active unended VC drag sessions from database
    restoreActiveVcDrags(client).catch(() => {});

    // Automated Social Wiretap Broadcaster (every 4 minutes)
    import('../utils/wiretapEngine.js').then(({ pollWiretaps }) => {
      setInterval(() => {
        pollWiretaps(client).catch(() => {});
      }, 4 * 60 * 1000);
      setTimeout(() => {
        pollWiretaps(client).catch(() => {});
      }, 30000);
    }).catch(() => {});

      console.log(chalk.blue(' Updating permissions for existing stats channels...'));
      try {
        for (const guild of client.guilds.cache.values()) {
          const cfg = db.getGuildConfig(guild.id);
          if (cfg.statsChannelId) {
            const ch = guild.channels.cache.get(cfg.statsChannelId);
            if (ch) {
              await ch.permissionOverwrites.edit(guild.roles.everyone.id, {
                UseApplicationCommands: true
              }).catch(() => null);
            }
          }
        }
      } catch (err) {
        console.error('Error updating existing stats channels:', err);
      }

      console.log(chalk.blue(' Syncing slash commands globally...'));

      const prioritySlash = ['athena', 'ask', 'security', 'antinuke', 'news', 'ticket', 'ticketpanel', 'verify', 'welcome', 'autorole', 'panic', 'rate', 'stats'];
      const eligibleSlash = allCommands.filter(cmd => !cmd.hidden && !cmd.slashHidden && typeof cmd.executeSlash === 'function');
      eligibleSlash.sort((a, b) => {
        const aPri = prioritySlash.indexOf(a.name);
        const bPri = prioritySlash.indexOf(b.name);
        if (aPri !== -1 && bPri !== -1) return aPri - bPri;
        if (aPri !== -1) return -1;
        if (bPri !== -1) return 1;
        return 0;
      });

      // Deduplicate slash commands strictly by name (case-insensitive) to prevent DiscordAPIError[50035]
      const seenSlashNames = new Set();
      const uniqueEligibleSlash = [];
      for (const cmd of eligibleSlash) {
        if (!cmd.name || typeof cmd.name !== 'string') continue;
        const normalizedName = cmd.name.toLowerCase().trim();
        if (seenSlashNames.has(normalizedName)) continue;
        seenSlashNames.add(normalizedName);
        uniqueEligibleSlash.push(cmd);
      }

      const slashData = uniqueEligibleSlash
        .map(cmd => {
          // Map options and build proper REST format
          if (cmd.slashDef && typeof cmd.slashDef.toJSON === 'function') {
            return cmd.slashDef.toJSON();
          }
          
          return {
            name: cmd.name,
            description: (cmd.description || 'No description').slice(0, 100),
            options: (cmd.options || []).map(opt => ({
              ...opt,
              description: (opt.description || 'Option description').slice(0, 100)
            })),
            default_member_permissions: (() => {
              if (!cmd.permissions || !cmd.permissions.length) return null;
              try {
                let mask = 0n;
                for (const perm of cmd.permissions) {
                  if (typeof perm === 'bigint') {
                    mask |= perm;
                  } else if (typeof perm === 'number') {
                    mask |= BigInt(perm);
                  } else if (typeof perm === 'string') {
                    if (PermissionFlagsBits && PermissionFlagsBits[perm] !== undefined) {
                      mask |= BigInt(PermissionFlagsBits[perm]);
                    } else {
                      try { mask |= BigInt(perm); } catch {}
                    }
                  }
                }
                return mask > 0n ? mask.toString() : null;
              } catch {
                return null;
              }
            })()
          };
        }).slice(0, 100);

      // ⚡ Zero-Latency Hash Matching: Avoid redundant global REST registration if commands haven't changed!
      const currentSlashHash = crypto.createHash('sha256').update(JSON.stringify(slashData)).digest('hex');
      if (db.cache.lastSlashHash === currentSlashHash) {
        console.log(chalk.green(` All ${slashData.length} Slash Commands are already synchronized (0ms hash match).`));
      } else {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN || client.token);

        await rest.put(
          Routes.applicationCommands(client.user.id),
          { body: slashData }
        );

        db.cache.lastSlashHash = currentSlashHash;
        db.save();
        console.log(chalk.hex('#FFD700').bold(` Successfully synced all ${slashData.length} Slash Commands with Discord Gateway.`));
      }

      console.log(chalk.hex('#FFD700').bold('\n============================================='));
      console.log(chalk.hex('#FFD700').bold('️  Athena Bulletproof Security System · V1.0.0  ️'));
      console.log(chalk.hex('#FFD700').bold('=============================================\n'));
    } catch (error) {
      console.error(chalk.red(' Error registering Slash Commands:'), error);
    }
  }
};
