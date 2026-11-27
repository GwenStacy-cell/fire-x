import { ChannelType, PermissionFlagsBits, AuditLogEvent, EmbedBuilder } from 'discord.js';
import db from '../database.js';
import { connectToHomeVc, updateBotVcStatus } from '../utils/voice.js';
import { getVoiceConnection } from '@discordjs/voice';
import { buildControlPanel, buildSharedPanel, setVoiceChannelStatus, scheduleJtcLobbyStatusSync, cleanupJtcRoomIfEmpty } from '../commands/jtc.js';
import { evaluateTagDragForMember, updateUserPrimaryGuildCache, isUserInDragSession } from '../commands/vcdrag.js';
import { PACHA_ARROW } from '../utils/emojis.js';
import statsDB from '../statsDB.js';
import { calculateLevel, getRandomXp, getRoleMultiplier, processLevelUp } from '../utils/xpEngine.js';
import { isBotOwnerSync, getSafeUserAvatar, getSafeGuildIcon, sendGuildMemberDM, formatUserLink, formatChannelLink } from '../utils/helpers.js';
import { handleWarn } from '../commands/moderation.js';
import { getQueue } from '../utils/musicManager.js';
import { activeVoiceSessions } from '../utils/soundboardEngine.js';
import { isGuildUnderAttack, markRestorationQueued, markPendingSelfCreate, getRecentAuditEntry, sharedFetchAuditLogs } from '../utils/antinuke.js';

const theaterStrikes = new Map();

export function clearTheaterStrikes(guildId) {
  for (const key of theaterStrikes.keys()) {
    if (key.startsWith(`${guildId}:`)) {
      theaterStrikes.delete(key);
    }
  }
}

export default {
  name: 'voiceStateUpdate',
  once: false,
  async execute(oldState, newState) {
    const client = newState.client;
    const guild = newState.guild || oldState.guild;
    const userId = newState.id;
    const member = newState.member;

    // Simple lock to prevent multiple shared panels from being created simultaneously
    if (!client.jtcPanelLocks) client.jtcPanelLocks = new Set();
    if (!client.vcSessions) client.vcSessions = new Map();

    const guildCfg = db.getGuildConfig(guild.id);

    // ==========================================
    // VOICE ANALYTICS DURATION TRACKING
    // ==========================================
    const sessionKey = `${guild.id}-${userId}`;
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      const joinTime = client.vcSessions.get(sessionKey);
      if (joinTime) {
        const elapsedMinutes = Math.max(1, Math.round((Date.now() - joinTime) / 60000));
        db.recordVoiceActivity(guild.id, oldState.channelId, userId, elapsedMinutes);
        client.vcSessions.delete(sessionKey);
      }
      scheduleJtcLobbyStatusSync(guild, oldState.channelId, 1500);
      // Run empty JTC temp-room cleanup before ANY early returns (cooldown/attack/HomeVC)
      cleanupJtcRoomIfEmpty(guild, oldState.channelId, {
        scheduleBotOnlyGraceMs: 10_000,
        reason: 'JTC: All members left, auto-cleanup'
      }).catch(() => null);
    }
    if (newState.channelId && oldState.channelId !== newState.channelId) {
      client.vcSessions.set(sessionKey, Date.now());

      if (newState.member?.user) {
        updateUserPrimaryGuildCache(newState.member.user);
      }
      if (newState.member && !newState.member.user?.bot) {
        evaluateTagDragForMember(newState.member, { reason: 'voiceStateUpdate: joined or switched VC' }).catch(() => null);
      }

      // JTC Welcome Chime Alert
      const activeJtc = db.getJtcChannel(newState.channelId);
      if (activeJtc && (activeJtc.chime || guildCfg?.jtcChime)) {
        try {
          const targetTextCh = activeJtc.textChannelId ? (guild.channels.cache.get(activeJtc.textChannelId) || await guild.channels.fetch(activeJtc.textChannelId).catch(() => null)) : newState.channel;
          if (targetTextCh && targetTextCh.isTextBased()) {
            const userLink = formatUserLink(newState.member || userId, guild);
            const chLink = formatChannelLink(newState.channel, guild);
            const chimeMsg = `**Entrance Chime | <a:03_tick_circle:1565665642084827206>**\n-# > Welcome ${userLink} to ${chLink}!`;
            targetTextCh.send({ content: chimeMsg }).catch(() => null);
          }
        } catch {}
      }
    }

    // ==========================================
    // VOICE ROLE ENFORCEMENT (Auto Assign / Remove)
    // Applies to ALL members: Server Owner, Bot Owner, Users & Bots
    // ==========================================
    const voiceRoleId = db.getVoiceRole ? db.getVoiceRole(guild.id) : guildCfg?.voiceRoleId;
    if (voiceRoleId) {
      const targetMember = newState.member || oldState.member || guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
      if (targetMember) {
        try {
          const botMember = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null);
          if (botMember && botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            const role = guild.roles.cache.get(voiceRoleId) || await guild.roles.fetch(voiceRoleId).catch(() => null);
            if (role && botMember.roles.highest.position > role.position) {
              const isInVc = !!newState.channelId;
              const hasRole = targetMember.roles.cache.has(voiceRoleId);

              if (isInVc && !hasRole) {
                await targetMember.roles.add(role, 'Athena VoiceRole: Connected to voice channel').catch(() => null);
              } else if (!isInVc && hasRole) {
                await targetMember.roles.remove(role, 'Athena VoiceRole: Disconnected from voice channel').catch(() => null);
              }
            }
          }
        } catch (err) {
          console.error('[VoiceRole] Error enforcing voice role:', err);
        }
      }
    }

    const theaterVcId = guildCfg?.theaterModeVcId;
    if (theaterVcId && member && !member.user.bot) {
      import('../utils/helpers.js').then(async ({ isAuthorized }) => {
        if (!(await isAuthorized(member.user, guild))) {
          // If joined Theater VC
          if (newState.channelId === theaterVcId && oldState.channelId !== theaterVcId) {
             if (!newState.serverMute || !newState.serverDeaf) {
               await member.edit({ mute: true, deaf: true }).catch(() => null);
             }
          }
          // If left Theater VC
          else if (oldState.channelId === theaterVcId && newState.channelId !== theaterVcId) {
             if (newState.channelId) {
               // They joined another VC
               const updates = {};
               if (newState.serverMute) updates.mute = false;
               if (newState.serverDeaf) updates.deaf = false;
               if (Object.keys(updates).length > 0) {
                 await member.edit(updates).catch(() => null);
               }
             } else {
               // They fully disconnected. Voice state can't be mutated.
             }
          }
          // If in Theater VC and voice state changed (e.g. unmuted by someone else or exploiting glitch)
          else if (newState.channelId === theaterVcId && oldState.channelId === theaterVcId) {
             if (!newState.serverMute || !newState.serverDeaf) {
                // Evasion detected
                await member.edit({ mute: true, deaf: true }).catch(() => null);
                
                let culpritId = member.id;
                let culpritUser = member.user;

                // Function to fetch Audit Logs with retry for speed & accuracy
                const findCulprit = async () => {
                  try {
                    let auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberUpdate });
                    let entry = auditLogs.entries.first();
                    if (entry && entry.target.id === member.id && (Date.now() - entry.createdTimestamp) < 10000) {
                      return entry.executor;
                    }
                    // Wait and retry if API was too slow
                    await new Promise(r => setTimeout(r, 800));
                    auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberUpdate });
                    entry = auditLogs.entries.first();
                    if (entry && entry.target.id === member.id && (Date.now() - entry.createdTimestamp) < 10000) {
                      return entry.executor;
                    }
                  } catch(e) {}
                  return null;
                };

                const executor = await findCulprit();
                if (executor) {
                  if (executor.id === client.user.id) return; // Bot did it, ignore
                  culpritId = executor.id;
                  culpritUser = executor;
                }
                
                // Do not quarantine bot owner, server owner, extra owner, or whitelisted members
                if (culpritId === guild.ownerId) return;
                if (db.isExtraOwner(guild.id, culpritId)) return;
                if (db.isWhitelisted(guild, culpritId, 'all')) return;
                const { isBotOwnerSync } = await import('../utils/helpers.js');
                if (isBotOwnerSync(culpritId)) return;
                
                const strikeKey = `${guild.id}:${culpritId}`;
                const strikes = (theaterStrikes.get(strikeKey) || 0) + 1;
                theaterStrikes.set(strikeKey, strikes);
                
                const { EmbedBuilder } = await import('discord.js');
                const accentHex = guildCfg.accentColor || '#3b82f6';
                const accentInt = parseInt(accentHex.replace('#', ''), 16);
                
                const channel = guild.channels.cache.get(newState.channelId);
                const warnEmoji = '<a:exclamation_outline1:1565666739356827759>';

                if (strikes < 3) {
                  // WARNING
                  const warnEmbed = new EmbedBuilder()
                    .setColor(accentInt)
                    .setTitle('Theater Mode Interruption')
                    .setDescription(`${warnEmoji} <@${culpritId}>\n-# kindly refrain from unmuting or undeafening members during a Theater Mode session. (\`Strike ${strikes}/3\`)`);
                  
                  if (channel) {
                    await channel.send({ content: `<@${culpritId}>`, embeds: [warnEmbed] }).catch(() => null);
                  }
                } else {
                  // QUARANTINE
                  theaterStrikes.delete(strikeKey);
                  const { executeQuarantine } = await import('../commands/security.js');

                  const dmEmbed = new EmbedBuilder()
                    .setColor(accentInt)
                    .setTitle('Quarantined')
                    .setDescription(`${warnEmoji}\n-# You have been quarantined in **${guild.name}** for repeatedly interrupting Theater Mode.`);
                  await sendGuildMemberDM(guild.id, culpritUser, { embeds: [dmEmbed] });
                  
                  const qRole = guildCfg.quarantineRoleId;
                  if (qRole) {
                     const role = guild.roles.cache.get(qRole);
                     if (role) {
                        const qEmbed = new EmbedBuilder()
                          .setColor(accentInt)
                          .setDescription(`${warnEmoji} <@${culpritId}>\n-# has been **Quarantined** for attempting to interrupt Theater Mode.`);
                        if (channel) {
                          await channel.send({ embeds: [qEmbed] }).catch(() => null);
                        }
                        
                        const culpritMember = await guild.members.fetch(culpritId).catch(() => null);
                        if (culpritMember) {
                          await executeQuarantine(guild, culpritMember, guild.members.me, 'Repeatedly interrupting Theater Mode (3 Strikes)', null, client);
                        }
                     }
                  }
                }
             }
          }
        }
      });
    }
    // ==========================================
    // VC PROTECTION INTERCEPTOR (Mute & Deafen)
    // ==========================================
    if (newState.channelId && db.isVcProtected(guild.id, userId)) {
      const becameMuted = !oldState.serverMute && newState.serverMute;
      const becameDeafened = !oldState.serverDeaf && newState.serverDeaf;

      if (becameMuted || becameDeafened) {
        console.log(`[VcProtect] Protected user ${userId} was muted/deafened. Reverting...`);
        (async () => {
          let ring = getRecentAuditEntry(guild.id, AuditLogEvent.MemberUpdate, userId);
          if (!ring) await new Promise(r => setTimeout(r, 350));
          ring = ring || getRecentAuditEntry(guild.id, AuditLogEvent.MemberUpdate, userId);
          let executor = ring?.executor || null;

          if (!executor) {
            const rawLogs = await sharedFetchAuditLogs(guild.id, client.token, AuditLogEvent.MemberUpdate).catch(() => null);
            const entries = rawLogs?.audit_log_entries || [];
            const match = entries.find(e =>
              e.target_id === userId &&
              (Date.now() - (Number(BigInt(e.id) >> 22n) + 1420070400000) < 15000) &&
              e.changes?.some(c => (c.key === 'mute' && c.new_value === true) || (c.key === 'deaf' && c.new_value === true))
            );
            if (match?.user_id) {
              const u = rawLogs?.users?.find(usr => usr.id === match.user_id);
              executor = u ? { id: u.id, tag: u.username } : { id: match.user_id };
            }
          }

          if (executor && executor.id !== client.user.id && executor.id !== userId) {
            if (isBotOwnerSync(executor.id) || executor.id === guild.ownerId) return; // bypass
            await newState.member.edit({ mute: false, deaf: false }).catch(() => null);
            
            const execMember = await guild.members.fetch(executor.id).catch(() => null);
            if (execMember) {
              await handleWarn(guild, guild.members.me, execMember, `Automated: Illegally muting/deafening protected user <@${userId}>`, true);
            }
          } else if (!executor) {
            await newState.member.edit({ mute: false, deaf: false }).catch(() => null);
          }
        })().catch(() => null);
      }
    }
    // ==========================================
    // STATS TRACKER & VOICE XP
    // ==========================================
    if (!newState.member?.user.bot) {
      const oldChannelId = oldState.channelId;
      const newChannelId = newState.channelId;

      if (oldChannelId !== newChannelId) {

        // ==========================================
        // MOVE PROTECTION INTERCEPTOR
        // ==========================================
        if (oldChannelId && newChannelId) {
          if (db.isMoveProtected(guild.id, userId)) {
            (async () => {
              let ring = getRecentAuditEntry(guild.id, AuditLogEvent.MemberMove, userId);
              if (!ring) await new Promise(r => setTimeout(r, 350));
              ring = ring || getRecentAuditEntry(guild.id, AuditLogEvent.MemberMove, userId);

              let executor = ring?.executor || null;
              if (!executor) {
                const auditLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.MemberMove }).catch(err => {
                  console.error('[MoveProtection] Error fetching audit logs:', err);
                  return null;
                });

                if (auditLogs) {
                  if (!client.auditLogCounts) client.auditLogCounts = new Map();

                  const moveLog = auditLogs.entries.find(e => {
                    if (e.extra && e.extra.channel && e.extra.channel.id === newChannelId) {
                      const count = e.extra.count || 1;
                      const lastCount = client.auditLogCounts.get(e.id);
                      const isRecent = Math.abs(Date.now() - e.createdTimestamp) < 15000;
                      const isNewMove = lastCount !== undefined ? count > lastCount : isRecent;

                      if (isNewMove) {
                        client.auditLogCounts.set(e.id, count);
                        if (e.executor?.id === client.user?.id || e.executor?.id === userId) {
                          return false;
                        }
                        return true;
                      }
                    }
                    return false;
                  });
                  if (moveLog) executor = moveLog.executor;
                }
              }

              if (executor && executor.id !== client.user.id && executor.id !== userId) {
                if (isBotOwnerSync(executor.id) || executor.id === guild.ownerId) {
                  return;
                }
                await newState.member.voice.setChannel(oldChannelId).catch(err => console.error('[MoveProtection] Restitution failed:', err));
                const execMember = await guild.members.fetch(executor.id).catch(() => null);
                if (execMember) {
                  await handleWarn(guild, guild.members.me, execMember, `Automated: Illegally moving protected user <@${userId}>`, true);
                }
              }
            })().catch(() => null);
          }
        }
        // User left or switched channels
        if (oldChannelId) {
          const session = client.vcSessions.get(userId);
          if (session && session.channelId === oldChannelId) {
            const seconds = Math.floor((Date.now() - session.joinTime) / 1000);
            statsDB.logVoice(guild.id, userId, oldChannelId, seconds);
            
            // --- VOICE XP ---
            const xpSystem = db.getXpSystem(guild.id);
            if (xpSystem && xpSystem.enabled) {
              const minutes = Math.floor(seconds / 60);
              if (minutes > 0) {
                const userXp = db.getUserXp(guild.id, userId);
                const mult = getRoleMultiplier(guild.id, oldState.member || newState.member);
                
                // Award XP equivalent to typing a message every 2 minutes
                // Example: 1 minute = (getRandomXp() / 2) * mult
                const totalXpGained = Math.floor(minutes * (getRandomXp() / 1.5) * mult);
                
                userXp.xp += totalXpGained;
                const newLevel = calculateLevel(userXp.xp);
                if (newLevel > userXp.level) {
                  userXp.level = newLevel;
                  processLevelUp(client, guild, oldState.member || newState.member, newLevel).catch(() => null);
                }
                db.setUserXp(guild.id, userId, userXp);
              }
            }
            // --- VOICE LOGGING (Leave) ---
            if (guildCfg && guildCfg.voiceLogChannel) {
              const logChannel = guild.channels.cache.get(guildCfg.voiceLogChannel);
              if (logChannel) {
                const s = seconds % 60;
                const m = Math.floor(seconds / 60) % 60;
                const h = Math.floor(seconds / 3600);
                let durStr = '';
                if (h > 0) durStr = `${h}h ${m}m ${s}s`;
                else if (m > 0) durStr = `${m}m ${s}s`;
                else durStr = `${s}s`;
                
                const userLink = formatUserLink(member || userId, guild);
                const oldChannelLink = formatChannelLink(oldChannelId, guild);
                const leaveEmbed = new EmbedBuilder()
                  .setAuthor({ name: member.user.username, iconURL: getSafeUserAvatar(member, 128) })
                  .setColor('#ff0000') // Pure red
                  .setDescription(`${userLink} left voice channel ${oldChannelLink}. (lasted ${durStr})`)
                  .setFooter({ text: guild.name, iconURL: getSafeGuildIcon(guild, 128) || undefined })
                  .setTimestamp();
                logChannel.send({ embeds: [leaveEmbed] }).catch(() => null);
              }
            }
          }
          client.vcSessions.delete(userId);
        }
        
        // User joined or switched to a new channel
        if (newChannelId) {
          client.vcSessions.set(userId, {
            channelId: newChannelId,
            joinTime: Date.now()
          });
          
          // --- VOICE LOGGING (Join) ---
          if (guildCfg && guildCfg.voiceLogChannel) {
            const logChannel = guild.channels.cache.get(guildCfg.voiceLogChannel);
            if (logChannel) {
              const userLink = formatUserLink(member || userId, guild);
              const newChannelLink = formatChannelLink(newChannelId, guild);
              const joinEmbed = new EmbedBuilder()
                .setAuthor({ name: member.user.username, iconURL: getSafeUserAvatar(member, 128) })
                .setColor('#00ff00') // Pure green
                .setDescription(`${userLink} joined voice channel ${newChannelLink}.`)
                .setFooter({ text: guild.name, iconURL: getSafeGuildIcon(guild, 128) || undefined })
                .setTimestamp();
              logChannel.send({ embeds: [joinEmbed] }).catch(() => null);
            }
          }
        }
      }
    }

    // ==========================================
    // BOT HOME VC RESTORE (Instant Reconnect)
    // ==========================================
    if (userId === client.user.id) {
      const config = db.getGuildConfig(guild.id);
      const homeVcId = config.homeVcId;
      if (!homeVcId) return;

      // Ensure we don't yank the bot out if it's currently playing music or soundboard!
      const queue = getQueue(guild.id);
      if (queue && (queue.isPlaying || queue.current || queue.songs.length > 0 || queue.isPreparing)) {
         // Bot is playing music in a channel, leave it alone!
         return;
      }

      if (activeVoiceSessions && activeVoiceSessions.has(guild.id)) {
         // Bot is playing soundboard SFX or streaming radio, leave it alone!
         return;
      }

      if (newState.channelId !== homeVcId) {
        console.log(`[HomeVC] Bot voice state changed in ${guild.name} (channel: ${newState.channelId}). Restoring home VC...`);
        
        setTimeout(async () => {
          try {
            const freshGuild = client.guilds.cache.get(guild.id);
            if (!freshGuild) return;
            const currentVcId = freshGuild.members.me?.voice?.channelId;
            if (currentVcId !== homeVcId) {
              await connectToHomeVc(freshGuild, homeVcId, true);
            }
          } catch (e) {}
        }, 1500);
      }
      return;
    }

    // ==========================================
    // BOT HOME VC DYNAMIC STATUS SYNC
    // ==========================================
    const config = db.getGuildConfig(guild.id);
    const homeVcId = config.homeVcId;
    if (homeVcId) {
      const homeChannel = guild.channels.cache.get(homeVcId);
      if (homeChannel) {
        updateBotVcStatus(homeChannel);
      }
    }

    // ==========================================
    // JOIN TO CREATE — USER JOINED A CHANNEL
    // ==========================================
    const jtcConfig = db.getJtcConfig(guild.id);
    const tierInfo = db.getTierInfo(guild.id, newState.channelId);
    const isStandardLobby = jtcConfig && (newState.channelId === jtcConfig.lobbyChannelId || (jtcConfig.secondaryLobbyChannelId && newState.channelId === jtcConfig.secondaryLobbyChannelId));

    if (oldState.channelId !== newState.channelId && (isStandardLobby || tierInfo)) {
      const member = newState.member;
      if (!member) return;

      // Skip JTC room creation if user is actively in a VCDrag / TagDrag loop
      if (isUserInDragSession(guild.id, member.id)) return;

      // ⚡ SECURITY FAST-PATH: Do not create channels during active server attacks
      // Allocates 100% of network throughput and REST rate limits to the Anti-Nuke defense engine
      if (isGuildUnderAttack(guild.id)) return;

      // ⚡ ANTI-SPAM FLOOD GATEWAY: Cooldown per user to prevent rapid channel spawn abuse
      if (!client.jtcCreationCooldowns) client.jtcCreationCooldowns = new Map();
      const cooldownKey = `${guild.id}-${member.id}`;
      const now = Date.now();
      if (client.jtcCreationCooldowns.has(cooldownKey) && now - client.jtcCreationCooldowns.get(cooldownKey) < 3000) {
        return;
      }
      client.jtcCreationCooldowns.set(cooldownKey, now);

      try {
        const tieredCfg = tierInfo ? db.getTieredJtcConfig(guild.id) : null;
        const targetCategoryId = tierInfo ? (tieredCfg?.categoryId || newState.channel.parentId || null) : (jtcConfig?.categoryId || newState.channel.parentId || null);

        let channelName = `${member.displayName}'s Room`;
        let userLimit = 0;

        if (tierInfo) {
          userLimit = tierInfo.userLimit;
          if (tierInfo.tier === 'solo') channelName = `${member.displayName}'s Solo`;
          else if (tierInfo.tier === 'duo') channelName = `${member.displayName}'s Duo`;
          else if (tierInfo.tier === 'trio') channelName = `${member.displayName}'s Trio`;
          else if (tierInfo.tier === 'squad') channelName = `${member.displayName}'s Squad`;
          else if (tierInfo.tier === 'unlimited') channelName = `${member.displayName}'s Room`;
        }

        // Build secure permission overwrites
        const overwrites = [
          {
            id: guild.roles.everyone.id,
            allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
          },
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.Connect, 
              PermissionFlagsBits.Speak, 
              PermissionFlagsBits.ViewChannel, 
              PermissionFlagsBits.MuteMembers, 
              PermissionFlagsBits.DeafenMembers, 
              PermissionFlagsBits.SendMessages
            ]
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.Connect, 
              PermissionFlagsBits.ManageChannels, 
              PermissionFlagsBits.MoveMembers, 
              PermissionFlagsBits.ViewChannel, 
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.UseApplicationCommands
            ]
          }
        ];

        // ⚡ ATOMIC QUARANTINE INTEGRATION: Auto-deny quarantined rogue accounts with zero extra REST requests
        const guildCfg = db.getGuildConfig(guild.id);
        if (guildCfg?.quarantineRoleId) {
          overwrites.push({
            id: guildCfg.quarantineRoleId,
            deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
          });
        }

        // Create the temp voice channel (pre-mark before create to avoid WS race)
        markPendingSelfCreate(guild.id, 'channel', channelName);
        const tempChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildVoice,
          userLimit: userLimit,
          parent: targetCategoryId,
          permissionOverwrites: overwrites,
          reason: `JTC: Created by ${member.user.tag}${tierInfo ? ` (${tierInfo.label})` : ''}`
        });

        // ⚡ ANTI-NUKE SYNCHRONIZATION: Mark channel handled to bypass Anti-Nuke locks & audit spikes
        markRestorationQueued(tempChannel.id);
        db.addJtcChannel(tempChannel.id, member.id, guild.id, tierInfo?.tier || null);

        // Set initial dynamic voice room status
        const roomStatus = `${PACHA_ARROW} ${tierInfo ? tierInfo.label : 'Private'} VC`;
        setVoiceChannelStatus(guild.client, tempChannel.id, roomStatus).catch(() => null);

        // Move the member into their new channel
        const lobbyChannelId = newState.channelId;
        const lobbyName = newState.channel?.name || 'JTC Lobby';
        const moved = await member.voice.setChannel(
          tempChannel,
          `JTC: Auto-created ${tierInfo ? tierInfo.label : 'Private'} room after ${member.user.tag} joined ${lobbyName}`
        ).then(() => true).catch(() => false);
        scheduleJtcLobbyStatusSync(guild, lobbyChannelId, 1500);

        if (!moved) {
          await cleanupJtcRoomIfEmpty(guild, tempChannel.id, {
            purgeBotOnly: false,
            reason: 'JTC: User disconnected before move'
          }).catch(() => null);
          return;
        }

        // Ghost channel sweeper: If they didn't move, or left instantly, purge cleanly
        setTimeout(() => {
          cleanupJtcRoomIfEmpty(guild, tempChannel.id, {
            purgeBotOnly: false,
            reason: 'JTC: User failed to move or instantly left'
          }).catch(() => null);
        }, 3000);

        const vcPanel = buildControlPanel(tempChannel, member);

        // ── Interface channel: ONE persistent panel, never duplicated ──
        const freshCfg = db.getJtcConfig(guild.id);
        if (freshCfg?.panelChannelId && isStandardLobby) {
          const panelCh = guild.channels.cache.get(freshCfg.panelChannelId);
          if (panelCh) {
            let existingMsg = null;
            if (freshCfg.panelMessageId) {
              existingMsg = await panelCh.messages.fetch(freshCfg.panelMessageId).catch(() => null);
            }
            if (!existingMsg && !client.jtcPanelLocks.has(guild.id)) {
              client.jtcPanelLocks.add(guild.id);
              try {
                // Fetch again to be absolutely sure no other process created it in the last few ms
                const freshCfgCheck = db.getJtcConfig(guild.id);
                const stillNoMsg = freshCfgCheck.panelMessageId ? await panelCh.messages.fetch(freshCfgCheck.panelMessageId).catch(() => null) : null;
                
                if (!stillNoMsg) {
                  const sharedPanel = buildSharedPanel(guild);
                  const sentMsg = await panelCh.send(sharedPanel).catch(e => console.error('[JTC] Interface channel send failed:', e.message));
                  if (sentMsg) {
                    db.setPanelMessageId(guild.id, sentMsg.id);
                    console.log(`[JTC] Created persistent panel in #${panelCh.name}`);
                  }
                }
              } finally {
                setTimeout(() => client.jtcPanelLocks.delete(guild.id), 5000); // Release lock after 5s
              }
            }
          }
        }

        // ── Send panel to VC text chat (only if channel still exists and has members) ──
        setTimeout(async () => {
          try {
            const freshChannel = guild.channels.cache.get(tempChannel.id) || await guild.channels.fetch(tempChannel.id).catch(() => null);
            if (!freshChannel || freshChannel.members.size === 0) return;
            await freshChannel.send(vcPanel).catch((err) => {
              if (err?.code !== 10003) {
                console.warn(`[JTC] Failed to send VC control panel in ${freshChannel.id}:`, err?.message || err);
              }
            });
          } catch {}
        }, 1500);

      } catch (err) {
        console.error('[JTC] Failed to create temp channel:', err);
      }
    }

    // ==========================================
    // AUTO-UPDATE SERVER STATS (VC Users & Active VC)
    // ==========================================
    if (oldState.channelId !== newState.channelId && guild) {
      import('../commands/serverstats.js').then(m => {
        m.scheduleServerStatsUpdate(guild, 'voiceStateUpdate');
      }).catch(() => null);
    }
  }
};
