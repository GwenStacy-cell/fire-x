import { ChannelType, PermissionFlagsBits, AuditLogEvent, EmbedBuilder } from 'discord.js';
import db from '../database.js';
import { connectToHomeVc, updateBotVcStatus } from '../utils/voice.js';
import { getVoiceConnection } from '@discordjs/voice';
import { buildControlPanel, buildSharedPanel } from '../commands/jtc.js';
import statsDB from '../statsDB.js';
import { calculateLevel, getRandomXp, getRoleMultiplier, processLevelUp } from '../utils/xpEngine.js';
import { isBotOwnerSync, getSafeUserAvatar, getSafeGuildIcon } from '../utils/helpers.js';
import { handleWarn } from '../commands/moderation.js';

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
    }
    if (newState.channelId && oldState.channelId !== newState.channelId) {
      client.vcSessions.set(sessionKey, Date.now());

      // JTC Welcome Chime Alert
      const activeJtc = db.getJtcChannel(newState.channelId);
      if (activeJtc && (activeJtc.chime || guildCfg?.jtcChime)) {
        try {
          const targetTextCh = activeJtc.textChannelId ? (guild.channels.cache.get(activeJtc.textChannelId) || await guild.channels.fetch(activeJtc.textChannelId).catch(() => null)) : newState.channel;
          if (targetTextCh && targetTextCh.isTextBased()) {
            const chimeMsg = `**Entrance Chime | <a:uptime:1552608831060844575>**\n-# > Welcome <@${userId}> to **${newState.channel.name}**!`;
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
                
                // Do not quarantine bot owner or server owner
                if (culpritId === guild.ownerId) return;
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
                  
                  // Strip extra owner
                  if (db.isExtraOwner(guild.id, culpritId)) {
                    db.removeExtraOwner(guild.id, culpritId);
                  }

                  const dmEmbed = new EmbedBuilder()
                    .setColor(accentInt)
                    .setTitle('Quarantined')
                    .setDescription(`${warnEmoji}\n-# You have been quarantined in **${guild.name}** and stripped of any extra permissions for repeatedly interrupting Theater Mode.`);
                  await culpritUser.send({ embeds: [dmEmbed] }).catch(() => null);
                  
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
        setTimeout(async () => {
          const auditLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.MemberUpdate }).catch(() => null);
          let executor = null;
          if (auditLogs) {
            const log = auditLogs.entries.find(e => e.target.id === userId && (Date.now() - e.createdTimestamp) < 15000 && (e.changes.some(c => c.key === 'mute' && c.new === true) || e.changes.some(c => c.key === 'deaf' && c.new === true)));
            if (log) executor = log.executor;
          }

          if (executor && executor.id !== client.user.id && executor.id !== userId) {
            if (isBotOwnerSync(executor.id) || executor.id === guild.ownerId) return; // bypass
            await newState.member.edit({ mute: false, deaf: false }).catch(() => null);
            
            const execMember = await guild.members.fetch(executor.id).catch(() => null);
            if (execMember) {
              await handleWarn(guild, guild.members.me, execMember, `Automated: Illegally muting/deafening protected user <@${userId}>`, true);
            }
          } else if (!executor) {
            // Revert just in case audit log missed it
            await newState.member.edit({ mute: false, deaf: false }).catch(() => null);
          }
        }, 3000);
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
            // Give audit logs a moment to register
            setTimeout(async () => {
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
                    
                    const isNewBatch = lastCount !== undefined && count > lastCount;
                    const isRecent = Math.abs(Date.now() - e.createdTimestamp) < 15000;
                    
                    const isMatch = isNewBatch || isRecent;
                    
                    if (isMatch) {
                      client.auditLogCounts.set(e.id, count);
                      return true;
                    }
                  }
                  return false;
                });

                if (moveLog) {
                  const executor = moveLog.executor;
                  if (executor.id !== client.user.id && executor.id !== userId) {
                    // Check if executor is Bot Owner or Server Owner (Bypass allowed)
                    if (isBotOwnerSync(executor.id) || executor.id === guild.ownerId) {
                      return; // Bypass move protection
                    }

                    // Restitution: Move target back to previous channel
                    await newState.member.voice.setChannel(oldChannelId).catch(err => console.error('[MoveProtection] Restitution failed:', err));

                    // Punish executor: Issue a warning
                    const execMember = await guild.members.fetch(executor.id).catch(() => null);
                    if (execMember) {
                      await handleWarn(guild, guild.members.me, execMember, `Automated: Illegally moving protected user <@${userId}>`, true);
                    }
                  }
                }
              }
            }, 3000);
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
                
                const leaveEmbed = new EmbedBuilder()
                  .setAuthor({ name: member.user.username, iconURL: getSafeUserAvatar(member, 128) })
                  .setColor('#ff0000') // Pure red
                  .setDescription(`<@${userId}> left voice channel <#${oldChannelId}>. (lasted ${durStr})`)
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
              const joinEmbed = new EmbedBuilder()
                .setAuthor({ name: member.user.username, iconURL: getSafeUserAvatar(member, 128) })
                .setColor('#00ff00') // Pure green
                .setDescription(`<@${userId}> joined voice channel <#${newChannelId}>.`)
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

      // Ensure we don't yank the bot out if it's currently playing music!
      const queues = (await import('../utils/musicManager.js')).default || new Map();
      const queue = (await import('../utils/musicManager.js')).getQueue(guild.id);
      
      if (queue && (queue.isPlaying || queue.current || queue.songs.length > 0 || queue.isPreparing)) {
         // Bot is playing music in a channel, leave it alone!
         return;
      }

      if (newState.channelId !== homeVcId) {
        console.log(`[JTC] Bot voice state changed in ${guild.name}. Force restoring home VC...`);
        
        if (!newState.channelId) {
          const shoukaku = global.client?.shoukaku;
          if (shoukaku) {
             const player = shoukaku.players.get(guild.id);
             if (player) shoukaku.leaveVoiceChannel(guild.id);
          }
          const connection = getVoiceConnection(guild.id);
          if (connection) connection.destroy();
        }

        connectToHomeVc(guild, homeVcId, false);
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

    if (jtcConfig && oldState.channelId !== newState.channelId && (newState.channelId === jtcConfig.lobbyChannelId || (jtcConfig.secondaryLobbyChannelId && newState.channelId === jtcConfig.secondaryLobbyChannelId))) {
      const member = newState.member;
      if (!member) return;

      try {
        // Create the temp voice channel
        const tempChannel = await guild.channels.create({
          name: `${member.displayName}'s Room`,
          type: ChannelType.GuildVoice,
          parent: jtcConfig.categoryId || null,
          permissionOverwrites: [
            {
              id: guild.roles.everyone,
              allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
            },
            {
              id: member.id,
              allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers, PermissionFlagsBits.SendMessages]
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
          ],
          reason: `JTC: Created by ${member.user.tag}`
        });

        // Register in database first so cleanup logic knows it's a JTC room
        db.addJtcChannel(tempChannel.id, member.id, guild.id);

        // Move the member into their new channel
        const moved = await member.voice.setChannel(tempChannel).catch(() => null);

        // Ghost channel sweeper: If they didn't move, or left instantly, purge it
        setTimeout(async () => {
          const freshChannel = await guild.channels.fetch(tempChannel.id).catch(()=>null);
          if (freshChannel && freshChannel.members.size === 0) {
            db.removeJtcChannel(tempChannel.id);
            await freshChannel.delete('JTC: User failed to move or instantly left').catch(()=>null);
            
          }
        }, 2500);

        const vcPanel = buildControlPanel(tempChannel, member);

        // ── Interface channel: ONE persistent panel, never duplicated ──
        const freshCfg = db.getJtcConfig(guild.id);
        if (freshCfg?.panelChannelId) {
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
                  const sharedPanel = buildSharedPanel(newState.guild.id);
                  const sentMsg = await panelCh.send(sharedPanel).catch(e => console.error('[JTC] Interface channel send failed:', e.message));
                  if (sentMsg) {
                    db.setPanelMessageId(guild.id, sentMsg.id);
                    console.log(`[JTC]  Created persistent panel in #${panelCh.name}`);
                  }
                }
              } finally {
                setTimeout(() => client.jtcPanelLocks.delete(guild.id), 5000); // Release lock after 5s
              }
            } else if (existingMsg) {
              console.log(`[JTC]  Reusing existing panel in #${panelCh.name}`);
            }
          }
        }

        // ── Send panel to VC text chat (delayed to let Discord init the channel) ──
        setTimeout(async () => {
          let attempt = 0;
          const sendPanel = async () => {
            try {
              const freshChannel = await guild.channels.fetch(tempChannel.id).catch(() => null);
              if (!freshChannel) { return; }
              await freshChannel.send(vcPanel);
              console.log(`[JTC]  Sent panel to VC text: ${freshChannel.name}`);
            } catch (e) {
              if (e.code === 10003 || e.message?.includes('Unknown Channel')) {
                return; // Channel was deleted when user left, abort retry
              }
              attempt++;
              if (attempt < 3) {
                console.warn(`[JTC] VC text send failed (attempt ${attempt}): ${e.message}, retrying in 2s...`);
                setTimeout(sendPanel, 2000);
              } else {
                console.error(`[JTC] VC text send failed after 3 attempts: ${e.message}`);
              }
            }
          };
          sendPanel();
        }, 3000); // 3 second initial delay

      } catch (err) {
        console.error('[JTC] Failed to create temp channel:', err);
      }
    }


    // ==========================================
    // JOIN TO CREATE — USER LEFT A CHANNEL
    // ==========================================
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      if (db.isJtcChannel(oldState.channelId)) {
        let leftChannel = guild.channels.cache.get(oldState.channelId);
        if (!leftChannel) {
          leftChannel = await guild.channels.fetch(oldState.channelId).catch(() => null);
        }

        if (leftChannel) {
          // Count real members in the channel (filter out bots, or just count all)
          const membersCount = leftChannel.members.size;
          
          if (membersCount === 0) {
            const jtcRecord = db.getJtcChannel(leftChannel.id);
            
            // Look for a linked text channel
            let textChannel = null;
            if (jtcRecord?.textChannelId) {
              textChannel = guild.channels.cache.get(jtcRecord.textChannelId) || await guild.channels.fetch(jtcRecord.textChannelId).catch(() => null);
            }
            
            // Fallback for older "zombie" text channels created before the patch:
            if (!textChannel && jtcRecord) {
               textChannel = guild.channels.cache.find(c => 
                 c.type === 0 && // GuildText
                 c.parentId === leftChannel.parentId &&
                 c.name.endsWith('-text') &&
                 c.permissionOverwrites.cache.get(jtcRecord.ownerId)?.allow.has('ManageChannels')
               );
            }

            db.removeJtcChannel(leftChannel.id);
            if (textChannel) {
              await textChannel.delete('JTC: Auto-cleanup of linked text channel').catch(() => null);
              console.log(`[JTC] ️ Deleted linked text room: ${textChannel.name}`);
            }
            await leftChannel.delete('JTC: All members left, auto-cleanup').catch(() => null);
            console.log(`[JTC] ️ Deleted empty room: ${leftChannel.name}`);
          }
        }
      }
    }
  }
};
