import { PermissionFlagsBits, EmbedBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, SectionBuilder, ThumbnailBuilder, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import db from '../database.js';
import embed, { setGuildContext } from '../embed.js';
import cv2 from '../cv2.js';
import commandMap from '../commands/loader.js';
import { executeQuarantine } from '../commands/security.js';
import { handleEzal, handleBackup } from '../commands/ezal.js';
import statsDB from '../statsDB.js';
import { canModerate, logToSecurityChannel, isAuthorized, isBotOwnerSync, getPresenceStatus, findClosestCommand, getUserTierName, cleanDisplayName, checkCommandClearance } from '../utils/helpers.js';
import { logServerEvent } from '../utils/serverLogger.js';
import { isBotAuthorized, rawDeleteWebhook } from '../utils/antinuke.js';
import { calculateLevel, getRandomXp, getRoleMultiplier, processLevelUp } from '../utils/xpEngine.js';
import { Client } from 'nekos-best.js';
import fetch from 'node-fetch';
import { createRateMessage } from '../commands/rate.js';
import { scanImageForScam, scanTextForScam, flaggedMessages } from '../utils/antiScam.js';
import { createMockInteraction } from '../utils/mockInteraction.js';
import { processMediaLink, cacheMediaUrl } from '../utils/mediaDownloader.js';
import { buildAutoReplyPreview } from '../commands/trigger.js';
import { handleCountingMessage } from '../utils/countingEngine.js';
import { scanForPhishing } from '../utils/phishingShield.js';
import { scanToxicityAndSentiment } from '../utils/ai.js';
import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI } from '../utils/emojis.js';

const triggerRegexCache = new Map();
function getTriggerRegex(keyword) {
  let cached = triggerRegexCache.get(keyword);
  if (!cached) {
    if (triggerRegexCache.size > 2000) triggerRegexCache.clear();
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cached = new RegExp('(^|\\s|[^a-zA-Z0-9_])' + escaped + '($|\\s|[^a-zA-Z0-9_])', 'i');
    triggerRegexCache.set(keyword, cached);
  }
  return cached;
}

function matchesTrigger(messageContent, triggerKeyword) {
  if (!messageContent || !triggerKeyword) return false;
  const content = messageContent.trim().toLowerCase();
  const keyword = triggerKeyword.trim().toLowerCase();
  if (content === keyword) return true;
  if (!content.includes(keyword)) return false; // Microsecond pre-flight
  return getTriggerRegex(keyword).test(content);
}

export { getCachedGif } from '../utils/roleplayEngine.js';

const massMentionCache = new Map();
const globalBanCooldowns = new Map();

// Safely load config
const configPath = path.resolve('config.json');
let config = {
  antiSpam: { enabled: true, maxMessages: 5, intervalMs: 3000 },
  antiInvite: { enabled: true, deleteInvites: true }
};
try {
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (error) {
  console.error('Failed to load config in message event:', error);
}

// In-memory maps for anti-spam trackers
const spamCache = new Map(); // key: guildId-userId -> array of timestamps
const spamCooldown = new Map(); // key: guildId-userId -> cooldown timestamp
const masterPingCooldowns = new Map(); // key: guildId -> timestamp

export default {
  name: 'messageCreate',
  async execute(message) {
    // ⚡ ZERO-TOLERANCE WEBHOOK MASS-PING / SPAM INTERCEPT (0ms Execution)
    if (message.guild && message.webhookId) {
      const cfg = db.getGuildConfig(message.guild.id);
      if (cfg?.securityEnabled || cfg?.antiNukeEnabled) {
        if (cfg?.antinukeModules?.antiWebhooks !== false) {
          const content = message.content || '';
          const isMassPing = content.includes('@everyone') || content.includes('@here');
          const hasInvite = /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|io|me|li)|discord(?:app)?\.com\/invite)\/[a-zA-Z0-9]+/i.test(content);
          
          if (isMassPing || hasInvite) {
            // Delete spam message immediately
            message.delete().catch(() => null);
            // Annihilate the rogue webhook immediately
            rawDeleteWebhook(message.webhookId, message.client.token, '[ATHENA SENTINEL] Rogue Webhook Spam Intercepted').catch(() => null);
            return;
          }
        }
      }
    }

    // ⚡ ATHENA PRIME HONEYPOT RAIDER TRAP (<15ms Execution)
    if (message.guild) {
      db.recordChannelActivity(message.guild.id, message.channel.id);
      const cfg = db.getGuildConfig(message.guild.id);
      if (cfg?.honeypotChannelId && message.channel.id === cfg.honeypotChannelId) {
        const isExempt = isBotOwnerSync(message.author.id) || 
                         message.author.id === message.guild.ownerId || 
                         db.isExtraOwner(message.guild.id, message.author.id) ||
                         message.author.id === message.client.user.id;
        if (!isExempt) {
          message.delete().catch(() => null);

          // ⚡ Instant Permanent Direct Ban (Single API call, zero role-strip overhead)
          message.guild.client.rest.put(Routes.guildBan(message.guild.id, message.author.id), {
            body: { delete_message_seconds: 604800 },
            reason: '[ATHENA HONEYPOT] Raider / Scraper Canary Triggered'
          }).catch(() => null);

          // Record forensic incident
          db.recordIncident(message.guild.id, {
            type: 'HONEYPOT_TRIGGER',
            attackerId: message.author.id,
            attackerTag: message.author.tag || message.author.id,
            actionsAttempted: 1,
            actionsBlocked: 1,
            latencyMs: 7,
            status: 'NEUTRALIZED (DIRECT BAN)',
            details: `Unauthorized message sent into Canary Trap channel <#${message.channel.id}>. Payload: "${message.content?.substring(0, 100) || 'Attachment'}"`
          });

          const alertCard = {
            type: 17,
            components: [
              {
                type: 10,
                content: `# ${getRandomHeadingGlyph()} Honeypot Intruder Neutralized | <a:03_tick_circle:1565665642084827206>\n` +
                         `> -# <a:uptime:1552608831060844575> **Target Banned:** <@${message.author.id}> (\`${message.author.tag || message.author.id}\`)\n` +
                         `> -# ${BULLET_EMOJI} **Trap Channel:** <#${message.channel.id}>\n` +
                         `> -# ${BULLET_EMOJI} **Trigger Payload:** \`${message.content?.substring(0, 150) || 'Attachment/Media'}\`\n` +
                         `> -# ${BULLET_EMOJI} **Enforcement Action:** Instant Permanent Direct Ban (\`<10ms\`)`
              },
              { type: 14, divider: true },
              { type: 10, content: `-# **Athena Prime Defense Matrix \u2022 Honeypot Sentry**` }
            ]
          };
          logToSecurityChannel(message.guild, alertCard).catch(() => null);
          return;
        }
      }
    }

    // --- COUNTING CHANNEL SYSTEM ---
    if (message.guild && !message.author.bot) {
      const countingCfg = db.getCounting(message.guild.id);
      if (countingCfg && countingCfg.channelId === message.channel.id) {
        const cfg = db.getGuildConfig(message.guild.id);
        const prefix = cfg?.prefix || '!';
        const isCmd = message.content.startsWith(prefix) || message.content.startsWith('!');
        if (!isCmd) {
          await handleCountingMessage(message, countingCfg);
          return;
        }
      }
    }

    // --- AUTO-QUOTE CHANNEL SYSTEM ---
    if (message.guild && !message.author.bot) {
      const cfg = db.getGuildConfig(message.guild.id);
      const prefix = cfg?.prefix || '!';
      const isCmd = message.content.startsWith(prefix) || message.content.startsWith('!');
      if (cfg && cfg.quoteChannelId === message.channel.id && !isCmd && message.content.trim().length > 0) {
        // Intercept message immediately
          try {
            if (!message.client.ignoredDeletes) message.client.ignoredDeletes = new Set();
            message.client.ignoredDeletes.add(message.id);
            message.delete().catch(() => null);
          const loadingMsg = await message.channel.send("<a:loading:1542155051286396938> **Forging aesthetic quote...**");
          
          import('../utils/canvasQuote.js').then(async (canvasQuote) => {
            function formatDiscordTimestamp(date) {
              const d = new Date(date);
              let hours = d.getHours();
              const ampm = hours >= 12 ? 'PM' : 'AM';
              hours = hours % 12;
              hours = hours ? hours : 12;
              const minutes = d.getMinutes().toString().padStart(2, '0');
              const now = new Date();
              if (d.getDate() === now.getDate() && d.getMonth() === now.getMonth()) {
                return `Today at ${hours}:${minutes} ${ampm}`;
              }
              return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
            }
            
            const buffer = await canvasQuote.generateQuoteBuffer(
              message.member ? message.member.displayName : message.author.username,
              message.author.displayAvatarURL({ extension: 'png', size: 128 }),
              message.content || ' ',
              formatDiscordTimestamp(Date.now()),
              'dark',
              message.member ? message.member.displayHexColor : '#FFFFFF',
              message.author.username
            );
            
            const { AttachmentBuilder } = await import('discord.js');
            const attachment = new AttachmentBuilder(buffer, { name: 'quote.png' });
            
            await loadingMsg.edit({ content: null, files: [attachment] });
          }).catch(() => loadingMsg.delete().catch(() => null));
        } catch (err) {}
        return; // Stop further processing
      }
    }
      
      // --- AUTO-REACT ---
      if (message.guild && !message.author.bot) {
        const cfg = db.getGuildConfig(message.guild.id);
        if (cfg && cfg.autoReacts && cfg.autoReacts[message.channel.id]) {
          const emojis = cfg.autoReacts[message.channel.id];
          for (const emoji of emojis) {
            const match = emoji.match(/<a?:.+?:(\d+)>/);
            const reactId = match ? match[1] : emoji;
            message.react(reactId).catch(() => null);
          }
        }
      }

      // --- ADEL: Auto-delete messages from tracked users ---

      if (message.guild) {
        const adelList = db.getAdelList(message.guild.id, message.channel.id);
        if (adelList.includes(message.author.id)) {
          message.delete().catch(() => {});
          return;
        }
      }

      if (message.guild && !message.author.bot && message.content) {
        const cfg = db.getGuildConfig(message.guild.id);
        const isOwner = isBotOwnerSync(message.author.id);
        const isMediaActive = cfg && (cfg.mediaChannelId === message.channel.id || cfg.autoMediaAll === true);
        if (isMediaActive) {
          const urlRegex = /(https?:\/\/[^\s]+)/g;
          const urls = message.content.match(urlRegex);
          if (urls) {
            for (const url of urls) {
              if (url.includes('tiktok.com') || url.includes('instagram.com') || url.includes('instagr.am') || url.includes('twitter.com') || url.includes('x.com') || url.includes('reddit.com') || url.includes('youtube.com') || url.includes('youtu.be') || url.includes('pinterest.com') || url.includes('pin.it') || url.includes('facebook.com') || url.includes('fb.watch')) {
                const success = await processMediaLink(message.client, message, url);
                if (success) return;
              }
            }
          }
        }
      }
    // Disboard Bump Detection
    if (message.author.id === '302050872383242240' && message.embeds.length > 0) {
      const embedDesc = message.embeds[0].description || '';
      if (embedDesc.includes('Bump done!') || embedDesc.includes('Check it out on DISBOARD')) {
        let bumperId = null;
        if (message.interaction && message.interaction.user) {
          bumperId = message.interaction.user.id;
        }
        
        if (message.guild) {
          const cfg = db.getGuildConfig(message.guild.id);
          if (cfg && cfg.bumpDisabled) return;

          db.setBumpReminder(message.guild.id, {
            channelId: message.channel.id,
            ownerId: message.guild.ownerId,
            bumperId: bumperId,
            expiresAt: Date.now() + 7200000 // 2 hours
          });
          
          // Send a confirmation so they know it worked
          message.channel.send({ content: `**Bump detected!** I've set a timer and will remind the configured roles in 2 hours.` }).catch(() => null);
        }
      }
    }

    // --- UNAUTHORIZED NUKE BOT SPAM AUTO-DELETE ---
    // Only intercepts malicious spam attacks (mass pings @everyone/@here, raid invites, or flood bursts).
    // Legitimate server bot messages (e.g. Rythm playing music, VC announcements, player embeds) are completely preserved!
    if (message.guild && message.author.bot && message.author.id !== message.client.user.id && !message.webhookId) {
        try {
            const config = db.getGuildConfig(message.guild.id);
            if (config && (config.securityEnabled || config.antiNukeEnabled)) {
                const mods = config.antinukeModules || {};
                if (mods.antiBotAdd !== false) {
                    // Check if bot is authorized
                    let authorized = false;
                    try {
                        const m = await import('../utils/antinuke.js');
                        if (m.isBotAuthorized) authorized = m.isBotAuthorized(message.guild, message.author.id);
                    } catch(e) {}
                    
                    if (!authorized) {
                        const content = message.content || '';
                        const isMassPing = content.includes('@everyone') || content.includes('@here');
                        const hasInvite = /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|io|me|li)|discord(?:app)?\.com\/invite)\/[a-zA-Z0-9]+/i.test(content);
                        
                        // Track rapid-fire flood bursts from unauthorized bots (> 5 messages in 2 seconds)
                        if (!message.client.botFloodTracker) message.client.botFloodTracker = new Map();
                        const floodKey = `${message.guild.id}-${message.author.id}`;
                        const now = Date.now();
                        const timestamps = (message.client.botFloodTracker.get(floodKey) || []).filter(t => now - t < 2000);
                        timestamps.push(now);
                        message.client.botFloodTracker.set(floodKey, timestamps);
                        const isFlooding = timestamps.length > 5;

                        // ONLY delete if the bot is actually committing malicious spam/raid activity
                        if (isMassPing || hasInvite || isFlooding) {
                            await message.delete().catch(() => null);
                            
                            if (!message.client.nukeSpamLogs) message.client.nukeSpamLogs = new Set();
                            if (!message.client.nukeSpamLogs.has(message.author.id)) {
                                message.client.nukeSpamLogs.add(message.author.id);
                                setTimeout(() => message.client.nukeSpamLogs.delete(message.author.id), 60000);
                                
                                const reasonText = isMassPing 
                                    ? 'Unauthorized Mass Mention (@everyone/@here)' 
                                    : (hasInvite ? 'Unauthorized Discord Invite Link' : 'Rapid Message Flood Burst (>5 msgs/2s)');
                                const embed = cv2.warn(
                                    'ATHENA FIREWALL — UNAUTHORIZED BOT SPAM BLOCKED',
                                    `An unauthorized bot <@${message.author.id}> attempted malicious spam (${reasonText}). Athena intercepted and instantly deleted the spam message.`,
                                    [
                                        { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                                        { name: 'Attack Type', value: `\`${reasonText}\``, inline: true }
                                    ],
                                    'shield'
                                );
                                
                                // Dynamically import logToSecurityChannel to avoid circular deps if needed
                                import('../utils/antinuke.js').then(m => {
                                    if (m.logToSecurityChannel) m.logToSecurityChannel(message.guild, embed).catch(()=>{});
                                }).catch(()=>{});
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Nuke bot spam auto-delete error:', e);
        }
    }

    // Ignore bots and webhooks
    if (message.author.bot || message.webhookId) return;

    // --- CHESS ENGINE INTERCEPTOR ---
    if (message.client.chessGames && message.client.chessGames.has(message.author.id)) {
        import('../commands/chess.js').then(m => {
            if (m.handleChessMove) m.handleChessMove(message).catch(()=>{});
        }).catch(()=>{});
    }

    // ==========================================
    // GLOBALLY BLACKLISTED USER ENFORCEMENT
    // ==========================================
    if (db.isUserBotBlacklisted(message.author.id)) {
      if (!isBotOwnerSync(message.author.id)) {
        const cleanContent = message.content.trim();
        const gConfig = message.guild ? db.getGuildConfig(message.guild.id) : null;
        const prefix = gConfig?.prefix || '!';
        const botId = message.client.user?.id;
        const botMention = `<@${botId}>`;
        const botMentionNick = `<@!${botId}>`;

        const isPrefixed = cleanContent.startsWith(prefix) || 
                           cleanContent.startsWith('!') || 
                           cleanContent.startsWith('?') || 
                           cleanContent.startsWith('.') || 
                           cleanContent.startsWith('$') || 
                           cleanContent.startsWith('+') || 
                           cleanContent.startsWith('-') || 
                           cleanContent.startsWith('>');
        const isMention = botId ? (cleanContent.startsWith(botMention) || cleanContent.startsWith(botMentionNick)) : false;
        const isDM = !message.guild;
        const stripped = cleanContent.replace(/^[!?.+$>\-#@%^&*~]+/, '').trim();
        const firstWord = stripped.split(/ +/)[0].toLowerCase();
        const isKnownCmd = commandMap.has(firstWord) || commandMap.has(cleanContent.split(/ +/)[0].toLowerCase());

        // If blacklisted user attempts to run ANY command (even !help, !ping, whatever it is, even if server owner)
        if (isPrefixed || isMention || isDM || isKnownCmd) {
          const lastNotice = globalBanCooldowns.get(message.author.id) || 0;
          if (Date.now() - lastNotice > 4000) {
            globalBanCooldowns.set(message.author.id, Date.now());
            const bData = db.cache.botBlacklistData?.[message.author.id];
            const reason = bData?.reason || 'Violation of Athena Bot Rules & Security Protocols';
            const banNotice = cv2.danger(
              'Globally Blacklisted',
              `-# **__Security Notice:__** You are globally banned from using Athena.\n\n` +
              `> -# **__Account:__** <@${message.author.id}> (\`${message.author.id}\`)\n` +
              `> -# **__Status:__** \`Permanently Blacklisted\`\n` +
              `> -# **__Reason:__** \`${reason}\`\n` +
              `> -# **__Enforcement:__** All commands (\`!help\`, \`!ping\`, modules) are permanently locked for your account across all servers, including server-owner privileges.\n` +
              `> -# **__Appeal:__** If you believe this is an error, please contact the Bot Owner.`
            );
            message.reply(banNotice).catch(() => null);
          }
        }
        return;
      }
    }

    // ==========================================
    // AFK SYSTEM INTERCEPTION
    // ==========================================
    if (message.guild) {
      // 1. Check if author is AFK and remove status
      const afkStatus = db.getAfk(message.author.id);
      if (afkStatus) {
        db.removeAfk(message.author.id);
        const timeAgoStr = `<t:${Math.floor(afkStatus.timestamp / 1000)}:R>`;
        const authorName = cleanDisplayName(message.member?.displayName || message.author.displayName || message.author.username);
        const textContent = 
          `# Welcome Back\n` +
          `-# **[${authorName}](https://discord.com/users/${message.author.id}) removed their Afk**\n` +
          `-# **Was AFK for: ${timeAgoStr}**`;
          
        const wbDisplay = new TextDisplayBuilder().setContent(textContent);
        const wbContainer = new ContainerBuilder().addTextDisplayComponents(wbDisplay);
        message.reply({ components: [wbContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      }

      // 2. Check if mentioned users are AFK
      if (message.mentions.users.size > 0) {
        message.mentions.users.forEach(user => {
          const mentionedAfk = db.getAfk(user.id);
          if (mentionedAfk && user.id !== message.author.id) {
            const timeAgoStr = `<t:${Math.floor(mentionedAfk.timestamp / 1000)}:R>`;
            const targetName = cleanDisplayName(message.guild?.members.cache.get(user.id)?.displayName || user.displayName || user.username);
            const textContent = 
              `# User is AFK\n` +
              `-# **[${targetName}](https://discord.com/users/${user.id}) is Afk**\n` +
              `-# **Reason: ${mentionedAfk.reason}**\n` +
              `-# **Went AFK: ${timeAgoStr}**`;
              
            const mentionDisplay = new TextDisplayBuilder().setContent(textContent);
            const mentionContainer = new ContainerBuilder().addTextDisplayComponents(mentionDisplay);
            message.reply({ components: [mentionContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
            }
          });
        }
      // 3. ATHENA DM NOTIFICATION FOR TAGS
      if (message.guild && message.mentions.users.size > 0) {
        if (!db.isTagDmEnabled(message.guild.id)) return;
        message.mentions.users.forEach(async (user) => {
          if (user.id === message.author.id || user.bot) return;
          
          const blockedServers = db.getPingAlertBlocks(user.id) || [];
          if (blockedServers.includes(message.guild.id)) return;
  
          try {
              let cleanNick = (message.member?.displayName || message.author.displayName || message.author.username)
                .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
                .replace(/^[\s\-_]+/, '')
                .replace(/[\s\-_]+$/, '')
                .replace(/\s+/g, ' ')
                .trim();
              if (!cleanNick) cleanNick = message.author.username.replace(/[\[\]\(\)]/g, '').trim() || 'User';

              const cleanChannel = message.channel.name
                .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
                .replace(/^[\s\-_]+/, '')
                .replace(/[\s\-_]+$/, '')
                .replace(/\s+/g, ' ')
                .trim() || 'channel';

              let snippet = message.cleanContent || message.content || '';
              if (snippet.length > 60) snippet = snippet.substring(0, 57) + '...';
              if (!snippet.trim()) snippet = 'Attachment/Embed only';
  
              const iconUrl = message.guild.iconURL({ extension: 'png', size: 128 }) || message.author.displayAvatarURL({ extension: 'png', size: 128 });
  
              const glyph1 = getRandomHeadingGlyph();
              const glyph2 = getRandomHeadingGlyph();

              const container = {
                  type: 17,
                  components: [
                      { 
                        type: 9, 
                        components: [{ type: 10, content: `# ${glyph1} Athena Notification : ${message.guild.name}` }], 
                        accessory: { type: 11, media: { url: iconUrl } } 
                      },
                      { type: 14, divider: true },
                      { 
                        type: 10, 
                        content: `${glyph2} **Tagged By:** <@${message.author.id}>\n-# Channel: [#${cleanChannel}](https://discord.com/channels/${message.guild.id}/${message.channel.id})\n-# Message: \`${snippet}\`` 
                      },
                      { type: 14, divider: true },
                      {
                          type: 1,
                          components: [
                              { type: 2, style: 5, label: 'Jump to Channel', url: message.url },
                              { type: 2, style: 2, label: 'Ack', custom_id: 'ping_ack' },
                              { type: 2, style: 2, label: isBotOwnerSync(user.id) ? 'Reply (Owner)' : 'Reply', custom_id: 'ping_reply_' + message.channel.id + '_' + message.id },
                              { type: 2, style: 2, label: 'Block Server Messages', custom_id: 'ping_block_' + message.guild.id }
                          ]
                      },
                      { type: 14, divider: true },
                      { type: 10, content: '-# Athena Prime Notification' }
                  ]
              };
  
              await user.send({ components: [container], flags: 32768 }).catch(() => null);
          } catch(e) {}
        });
      }
    }

    // ==========================================
    // STICKY MESSAGE LOGIC
    // ==========================================
    if (message.guild) {
      const guildId = message.guild.id;
      const channelId = message.channel.id;
      setTimeout(() => {
        const stickyData = db.getStickyMessage(guildId, channelId);
        if (stickyData) {
          const COOLDOWN = 1000; // 1 second
          const now = Date.now();
          if (now - stickyData.lastSentAt > COOLDOWN) {
            // Delete old sticky message if it exists
            if (stickyData.lastMessageId) {
              message.channel.messages.delete(stickyData.lastMessageId).catch(() => null);
            }
            
            let title = '';
            let desc = stickyData.content;
            if (stickyData.content.includes('|')) {
              const parts = stickyData.content.split('|');
              title = parts.shift().trim();
              desc = parts.join('|').trim();
            }
            
            const stickyPayload = cv2.success(title, desc);

            // Send new sticky and update DB
            message.channel.send(stickyPayload).then(sentMessage => {
              db.updateStickyMessageData(message.guild.id, message.channel.id, sentMessage.id, now);
            }).catch(() => null);
          }
        }
      }, 1500); // 1.5s delay ensures it falls below command responses
    }
    
    // ==========================================
    // ANTI-SCAM TEXT & IMAGE SCANNER
    // ==========================================
    if (message.guild) {
      // 1. Text & Link Scanning
      if (message.content && scanTextForScam(message.content)) {
        if (!flaggedMessages.has(message.id)) {
          flaggedMessages.add(message.id);
          
          await message.delete().catch(() => null);
          
          // Channel Warning
          const scamEmbed = cv2.danger('Scam Detected', `<a:emoji_35:1533024049926639699> <@${message.author.id}>, your message was flagged as a scam and removed.`);
          if (message.channel && message.channel.send) await message.channel.send({ embeds: [scamEmbed] }).catch(() => null); else return;
          
          const logEmbed = cv2.danger('LOG: MALICIOUS SCAM TEXT DELETED', `**User:** <@${message.author.id}> (${message.author.tag})\n**Action:** Posted fraudulent text/link containing known scam keywords (Mr. Beast/Kasowin/Helawin/Crypto Casino).\n\n**Channel:** <#${message.channel.id}>`);
          
          logToSecurityChannel(message.guild, logEmbed);
          
          // DM Server Owner
          try {
            const owner = await message.guild.members.fetch(message.guild.ownerId);
            if (owner) {
              const dmEmbed = new EmbedBuilder()
                .setColor('#ff0000') // Pure red for owner warning
                .setTitle('<a:emoji_35:1533024049926639699> Automated Scam Intervention')
                .setDescription(`Hello **${owner.user.username}**,\nI have successfully intercepted and deleted a fraudulent scam message in your server **${message.guild.name}**.\n\n**Offender:** <@${message.author.id}>\n**Location:** <#${message.channel.id}>\n**Detected Keywords:** Mr. Beast / Kasowin / Helawin / Crypto Casino`)
                .setFooter({ text: 'Athena Bulletproof Security System � V1.0.0' });
              await owner.send({ embeds: [dmEmbed] }).catch(() => null);
            }
          } catch (e) {}
        }
        return; // Stop processing further for scam messages
      }

      const urlsToScan = [];
      
      // 2. Regular Attachments
      if (message.attachments.size > 0) {
        message.attachments.forEach(att => urlsToScan.push(att.url));
      }
      
      // 2. Embeds (URL Previews like x.com)
      if (message.embeds.length > 0) {
        message.embeds.forEach(embed => {
          if (embed.image) urlsToScan.push(embed.image.url);
          if (embed.thumbnail) urlsToScan.push(embed.thumbnail.url);
        });
      }
      
      // 3. Forwarded Messages
      if (message.messageSnapshots && message.messageSnapshots.size > 0) {
        message.messageSnapshots.forEach(snap => {
          if (snap.message && snap.message.attachments) {
            snap.message.attachments.forEach(att => urlsToScan.push(att.url));
          }
        });
      }
      
      // 4. Raw Text Links (e.g. pasted media links)
      if (message.content) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const links = message.content.match(urlRegex);
        if (links) {
          links.forEach(link => {
            if (link.match(/\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i) || link.includes('cdn.discordapp.com/attachments/') || link.includes('media.discordapp.net/attachments/')) {
              urlsToScan.push(link);
            }
          });
        }
      }
      
      if (urlsToScan.length > 0) {
        for (const url of urlsToScan) {
           scanImageForScam(url).then(async (isScam) => {
             if (isScam && !flaggedMessages.has(message.id)) {
               flaggedMessages.add(message.id);
               
               await message.delete().catch(() => null);
               
               // 1. Channel Warning
               const scamEmbed = new EmbedBuilder()
                 .setColor('#ff0000') // Pure red
                 .setDescription(`<a:emoji_35:1533024049926639699> <@${message.author.id}>, your image was flagged as a scam and removed.`);
               if (message.channel && message.channel.send) await message.channel.send({ embeds: [scamEmbed] }).catch(() => null); else return;
               
               // 2. Security Channel Log
               const logEmbed = new EmbedBuilder()
                 .setColor('#2b2d31') // Typical aesthetic dark theme accent, or fallback to default
                 .setTitle('LOG: MALICIOUS SCAM IMAGE DELETED')
                 .setDescription(`**User:** <@${message.author.id}> (${message.author.tag})\n**Action:** Posted a fraudulent image containing known scam keywords (Mr. Beast/Kasowin/Helawin/Crypto Casino).`)
                 .addFields([{ name: 'Channel', value: `[${message.channel.name.replace(/[^\p{L}\p{N}\s\-_|]/gu, '').replace(/^[\s\-_|]+/, '').trim() || 'channel'}](https://discord.com/channels/${guildId}/${message.channel.id})` }])
                 .setFooter({ text: 'Athena Bulletproof Security System � V1.0.0' })
                 .setTimestamp();
               
               // Inherit server context accent color if possible by using the helper embed
               try {
                 const { default: db } = await import('../database.js');
                 const config = db.getGuildConfig(message.guild.id);
                 if (config && config.accentColor) {
                   logEmbed.setColor(config.accentColor);
                 }
               } catch(e) {}
               
               logToSecurityChannel(message.guild, logEmbed);
               
               // 3. DM Server Owner
               try {
                 const owner = await message.guild.members.fetch(message.guild.ownerId);
                 if (owner) {
                   const dmEmbed = new EmbedBuilder()
                     .setColor('#ff0000') // Pure red for owner warning
                     .setTitle('<a:emoji_35:1533024049926639699> Automated Scam Intervention')
                     .setDescription(`Hello **${owner.user.username}**,\nI have successfully intercepted and deleted a fraudulent scam image in your server **${message.guild.name}**.\n\n**Offender:** <@${message.author.id}>\n**Location:** <#${message.channel.id}>\n**Detected Keywords:** Mr. Beast / Kasowin / Helawin / Crypto Casino`)
                     .setFooter({ text: 'Athena Bulletproof Security System � V1.0.0' });
                   await owner.send({ embeds: [dmEmbed] }).catch(() => null);
                 }
               } catch (e) {
                 // Ignore if owner can't be DMed
               }
             }
           });
        }
      }
    }

    // ==========================================
    // AUTO-RATE LOGIC
    // ==========================================
    if (message.guild) {
      const configuredRateChannel = db.getRateChannel(message.guild.id);
      if (configuredRateChannel && message.channel.id === configuredRateChannel) {
        let mediaUrl = null;
        if (message.attachments.size > 0) {
          mediaUrl = message.attachments.first().url;
        } else {
          const urlMatch = message.content.match(/(https?:\/\/[^\s]+)/);
          if (urlMatch) mediaUrl = urlMatch[0];
        }

        if (mediaUrl) {
          const prefix = db.getGuildConfig(message.guild.id)?.prefix || '!';
          if (!message.content.startsWith(prefix) || !message.content.toLowerCase().includes('rate')) {
            // It's a media upload without the !rate command, automate it!
            return createRateMessage(message, mediaUrl);
          }
        }
      }
    }

    // ==========================================
    // DM CONTEXT - spam commands for permitted users / bot owner
    // Works with or without the ! prefix (e.g. "spam @user hi" or "!spam @user hi")
    // ==========================================
    if (!message.guild) {
      const isBotOwner = isBotOwnerSync(message.author.id);
      const isPermitted = db.isSpamPermitted(message.author.id);

      // Strip leading ! prefix if present
      let rawContent = message.content.trim();
      if (rawContent.startsWith('!')) rawContent = rawContent.slice(1).trimStart();

      const lower = rawContent.toLowerCase();
      const parts = rawContent.split(/ +/);
      const cmdName = parts[0].toLowerCase();
      const args = parts.slice(1);
      
      const cmd = commandMap.get(cmdName);

      // Spam command - permitted users and bot owner
      if (cmdName === 'spam' && (isBotOwner || isPermitted)) {
        if (cmd) await cmd.executePrefix(message, args).catch(() => null);
        return;
      }

      // ----------------------------------------------------
      // BOT OWNER FULL DM ACCESS & AUTO-REMOTE CONTROL
      // ----------------------------------------------------
      if (isBotOwner && cmdName === 'ezal') {
          await handleEzal(message);
          return;
      }
      
      if (isBotOwner && cmd) {
          
          // 1. Check for Auto-Remote Control (if args[0] is a Guild ID)
          if (args[0] && /^\d{17,20}$/.test(args[0])) {
              const targetGuild = message.client.guilds.cache.get(args[0]);
              if (targetGuild) {
                  // We found a guild! Mock the message object to trick the command!
                  let targetMember = await targetGuild.members.fetch(message.author.id).catch(() => targetGuild.members.me);
                  
                  const mockMessage = new Proxy(message, {
                      get(target, prop) {
                          if (prop === 'guild') return targetGuild;
                          if (prop === 'guildId') return targetGuild.id;
                          if (prop === 'member') return targetMember;
                          return Reflect.get(target, prop);
                      }
                  });
                  
                  const newArgs = args.slice(1);
                  await message.reply(cv2.log('Remote Execution', `Executing \`${cmd.name}\` in **${targetGuild.name}**...`));
                  
                  try {
                      if (cmd.executePrefix) {
                          await cmd.executePrefix(mockMessage, newArgs);
                      }
                  } catch (e) {
                      await message.reply(cv2.danger('Remote Error', `\`${e.message}\``));
                  }
                  return;
              }
          }
          
          // 2. Standard Native Execution (e.g. record start <ID> or botvoice active all)
          try {
              if (cmd.executePrefix) {
                  await cmd.executePrefix(message, args);
              }
          } catch (e) {
              await message.reply(cv2.danger('DM Execution Error', `\`${e.message}\``));
          }
          return;
      }

      // ----------------------------------------------------
      // MODMAIL DM SUPPORT TICKET RELAY
      // ----------------------------------------------------
      try {
        // Find mutual guilds where modmail is enabled
        const activeGuilds = message.client.guilds.cache.filter(g => {
          const cfg = db.getGuildConfig(g.id);
          return cfg?.modmailEnabled && cfg?.modmailChannelId && g.members.cache.has(message.author.id);
        });

        if (activeGuilds.size > 0) {
          const targetGuild = activeGuilds.first();
          const cfg = db.getGuildConfig(targetGuild.id);
          const channel = targetGuild.channels.cache.get(cfg.modmailChannelId);

          if (channel) {
            const threadName = `mm-${message.author.id}`;
            let thread = channel.threads?.cache.find(t => t.name === threadName && !t.archived);

            if (!thread) {
              const activeThreads = await channel.threads?.fetchActive().catch(() => null);
              thread = activeThreads?.threads?.find(t => t.name === threadName);
            }

            if (!thread) {
              thread = await channel.threads.create({
                name: threadName,
                autoArchiveDuration: 1440,
                reason: `ModMail ticket opened by ${message.author.tag}`
              }).catch(() => null);

              if (thread) {
                const headerContainer = {
                  type: 17,
                  components: [
                    {
                      type: 10,
                      content:
                        `# New ModMail Ticket\n` +
                        `-#  **Applicant:** ${message.author} (\`${message.author.id}\`)\n` +
                        `-#  **Account Created:** <t:${Math.floor(message.author.createdTimestamp / 1000)}:R>\n` +
                        `-#  **Staff Instructions:** Use \`!reply <message>\` to respond back to the user.`
                    }
                  ]
                };
                await thread.send({ components: [headerContainer], flags: 32768 }).catch(() => null);
              }
            }

            if (thread) {
              const msgContainer = {
                type: 17,
                components: [
                  {
                    type: 10,
                    content:
                      `# Incoming User Message\n` +
                      `-#  **From:** ${message.author}\n\n` +
                      `> ${message.content || '*(Attachment / Media)*'}`
                  }
                ]
              };
              await thread.send({ components: [msgContainer], flags: 32768 }).catch(() => null);
              await message.react('<a:uptime:1552608831060844575>').catch(() => null);
            }
          }
        }
      } catch (err) {
        console.error('[ModMail] Relay error:', err);
      }

      return; // Ignore all other messages in DMs
    }

    const guildId = message.guild.id;
    const userId = message.author.id;
    const cacheKey = `${guildId}-${userId}`;

    // Set guild context so all embed calls in this command chain use the correct accent color
    setGuildContext(guildId);

    // Load server configurations
    const dbConfig = db.getGuildConfig(guildId);

    // ==========================================
    // MUSIC PLAYER INTERCEPT
    // ==========================================
    if (dbConfig.musicChannelId && message.channel.id === dbConfig.musicChannelId) {
      // It's in the music channel. Delete the user message immediately.
      message.delete().catch(() => null);
      
      // If they sent text, treat it as a song request
      if (message.content.trim().length > 0) {
        import('../utils/musicManager.js').then(async (musicManager) => {
          const res = await musicManager.enqueue(message.guild, message.member, message.content.trim());
          if (res.success) {
             const cfg = db.getGuildConfig(message.guild.id);
             const msgData = musicManager.buildAddedToQueueMsg(res.trackObj, cfg.accentColor);
             const m = await message.channel.send(msgData);
             setTimeout(() => m.delete().catch(()=>null), 10000);
          } else if (!res.success) {
             const m = await message.channel.send({ content: `${message.author}, ${res.message}` });
             setTimeout(() => m.delete().catch(()=>null), 5000);
          }
        }).catch(err => console.error('Failed to load musicManager:', err));
      }
      return; // Do not process as a normal command
    }

    // ==========================================
    // XP & LEVELING (TEXT)
    // ==========================================
    const xpSystem = db.getXpSystem(guildId);
    if (xpSystem && xpSystem.enabled && !message.content.startsWith(dbConfig.prefix)) {
      const userXp = db.getUserXp(guildId, userId);
      const now = Date.now();
      
      // 60-second cooldown to prevent spamming XP
      if (now - userXp.lastMessageAt >= 10000) {
        const mult = getRoleMultiplier(guildId, message.member);
        const gained = Math.floor(getRandomXp() * mult);
        
        userXp.xp += gained;
        userXp.lastMessageAt = now;
        
        const newLevel = calculateLevel(userXp.xp);
        if (newLevel > userXp.level) {
          userXp.level = newLevel;
          processLevelUp(message.client, message.guild, message.member, newLevel, message.channel).catch(() => null);
        }
        
        db.setUserXp(guildId, userId, userXp);
      }
    }

    // ==========================================
    // 0.5. ROLEPLAY / REACTION SYSTEM (MENTION TRIGGER)
    // ==========================================
    const botMentionSpaceRegex = new RegExp(`^<@!?${message.client.user.id}>\\s+`);
    if (botMentionSpaceRegex.test(message.content)) {
      const args = message.content.replace(botMentionSpaceRegex, '').trim().split(/ +/);
      const actionRaw = args[0]?.toLowerCase();
      
      if (actionRaw) {
        const { ACTION_MAP, buildRoleplayPayload } = await import('../utils/roleplayEngine.js');
        const actionObj = ACTION_MAP.get(actionRaw);
        
        if (actionObj) {
          const targetUser = message.mentions.users.find(u => u.id !== message.client.user.id) || null;
          const payload = await buildRoleplayPayload(message.guild, message.author, targetUser, actionObj.id);
          await message.reply(payload).catch(() => null);
          return;
        }
      }
    }

    // ==========================================
    // 0. OWNER MENTION DETECTION
    // ==========================================
    const ownerId = process.env.OWNER_ID;
    if (ownerId && userId !== ownerId && message.mentions.has(ownerId)) {
      try {
        // React to the message instantly
        await message.react('1522714425235210400').catch(() => null);

        // DM the owner
        const ownerUser = await message.client.users.fetch(ownerId).catch(() => null);
        if (ownerUser) {
          const dmEmbed = cv2.info(
            'You were tagged!',
            null,
            [
              { name: 'Tagger', value: `[${message.author.tag}](https://discord.com/users/${userId})`, inline: true },
              { name: 'Server', value: `${message.guild.name}`, inline: true },
              { name: 'Channel', value: `[${message.channel.name.replace(/[^\p{L}\p{N}\s\-_|]/gu, '').replace(/^[\s\-_|]+/, '').trim() || 'channel'}](https://discord.com/channels/${guildId}/${message.channel.id})`, inline: true },
              { name: 'Message Link', value: `[Jump to Message](https://discord.com/channels/${guildId}/${message.channel.id}/${message.id})` }
            ]
          );
          await ownerUser.send(dmEmbed).catch(() => null);
        }
      } catch (err) {
        console.error('[Owner Mention]', err);
      }

      // Removed premature return to allow auto-mod to run
    }

    const hasAntiInviteImmunity = db.isWhitelisted(message.guild, userId, 'antiinvite');
    const hasAntiLinkImmunity = db.isWhitelisted(message.guild, userId, 'antilink');
    const hasAntiSpamImmunity = db.isWhitelisted(message.guild, userId, 'antispam');

      // ==========================================
      // AUTOMATED MODERATION & SECURITY MATRIX
      // ==========================================
      const isBotOwner = isBotOwnerSync(message.author.id);
      const isExtraOwner = db.isExtraOwner(message.guild.id, message.author.id);
      const isServerOwner = message.author.id === message.guild.ownerId;
      const isAdmin = message.member.permissions.has(PermissionFlagsBits.ManageMessages);
      
      const checkBypass = (filterName, hasImmunity = false) => {
        if (message.author.id === message.client.user.id || isBotOwner || isExtraOwner || isServerOwner || isAdmin || hasImmunity) return true;
        const bypasses = dbConfig.automodBypasses || {};
        const memberRoles = message.member.roles.cache;
        
        for (const [roleId, allowedFilters] of Object.entries(bypasses)) {
          if (memberRoles.has(roleId) && allowedFilters.includes(filterName)) {
            return true;
          }
        }
        return false;
      };

      const maxWarnings = dbConfig.maxWarnings || 3;

      // ==========================================
      // HONEYPOT TRAP PROTOCOL
      // ==========================================
      if (dbConfig.honeypotChannelId && message.channel.id === dbConfig.honeypotChannelId) {
        if (!checkBypass('Honeypot Trap')) {
          await message.delete().catch(() => null);
          const action = dbConfig.honeypotAction || 'quarantine';
          let actionTaken = `Timeout (${dbConfig.honeypotTimeoutMinutes || 15}m)`;

          if (action === 'ban' && message.member?.bannable) {
            await message.member.ban({ reason: '[Honeypot Trap] Unauthorized message in decoy channel' }).catch(() => null);
            actionTaken = 'Banned';
          } else if (action === 'quarantine') {
            const qRole = await getOrCreateQuarantineRole(message.guild).catch(() => null);
            if (qRole && message.member) {
              await message.member.roles.set([qRole.id], 'Honeypot Trap Triggered').catch(() => null);
              actionTaken = 'Quarantined';
            } else if (message.member?.moderatable) {
              await message.member.timeout(15 * 60 * 1000, 'Automod: Honeypot Trap Triggered').catch(() => null);
              actionTaken = 'Timeout (15m)';
            }
          } else if (message.member?.moderatable) {
            const timeoutMinutes = dbConfig.honeypotTimeoutMinutes || 15;
            await message.member.timeout(timeoutMinutes * 60 * 1000, 'Automod: Honeypot Trap Triggered').catch(() => null);
            actionTaken = `Timeout (${timeoutMinutes}m)`;
          }

          const authorTier = getUserTierName(message.guild, message.member || message.author);
          logToSecurityChannel(message.guild, cv2.log(
            'Honeypot Trap Triggered',
            `Member triggered honeypot trap channel <#${message.channel.id}>. Message instantly purged and offender penalized.`,
            [
              { name: 'Offender', value: `${message.author.tag} (\`${userId}\`) [${authorTier}]`, inline: true },
              { name: 'Trap Channel', value: `<#${message.channel.id}> (\`${message.channel.id}\`)`, inline: true },
              { name: 'Penalty Action', value: `\`${actionTaken}\``, inline: true },
              { name: 'Intercepted Content', value: `\`\`\`${(message.content || 'No text content').slice(0, 250)}\`\`\`` }
            ],
            'danger'
          ));
          return;
        }
      }
      
      const applyWarning = async (logReason, actionStr, headingStr, extraData = null) => {
          const authorTier = getUserTierName(message.guild, message.member || message.author);
          const warns = db.addWarning(guildId, userId, message.client.user.id, logReason);
          const fields = [
            { name: 'Member', value: `<@${userId}> (\`${userId}\`) [${authorTier}]`, inline: true },
            { name: 'Channel', value: `${message.channel}`, inline: true },
            { name: 'Warn Increment', value: `\`${warns.length}\` / ${maxWarnings}` }
          ];

          if (Array.isArray(extraData) && extraData.length > 0) {
            fields.push({ name: 'Filtered URL(s)', value: extraData.map(u => `\`||${u}||\``).join(', ').slice(0, 500), inline: false });
          } else if (typeof extraData === 'string' && extraData.trim()) {
            fields.push({ name: 'Filtered Item', value: extraData.slice(0, 500), inline: false });
          }

          logToSecurityChannel(message.guild, cv2.log(
            headingStr,
            logReason,
            fields,
            'warning'
          ));
          if (warns.length >= maxWarnings) {
            const qRes = await executeQuarantine(message.guild, message.member, message.guild.members.me, `Automated: ${headingStr} limit reached`);
            db.clearWarnings(guildId, userId);
            
            const c = new ContainerBuilder();
            const textContent = `-# > Reason: . <@${message.author.id}> , **Maximum Warnings Exceeded**\n-# > \u2800\u2800\u2800\u2800\u2570\u203A has been automatically quarantined. ${qRes.message || ''}`;
            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**Security Quarantine | <a:exclamation_outline1:1565666739356827759>**`),
                    new TextDisplayBuilder().setContent(textContent)
                )
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(message.author.displayAvatarURL({ extension: 'png', size: 128 })));
            c.addSectionComponents(section);
            await message.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
          } else {
            const c = new ContainerBuilder();
            const textContent = `-# > Reason: . <@${message.author.id}> , **${actionStr}**\n-# > \u2800\u2800\u2800\u2800\u2570\u203A has been warned " Your Limit is ${warns.length}/${maxWarnings} " Exceeding the limits will leads to punishments ,`;
            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**${headingStr} | <a:exclamation_outline1:1565666739356827759>**`),
                    new TextDisplayBuilder().setContent(textContent)
                )
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(message.author.displayAvatarURL({ extension: 'png', size: 128 })));
            c.addSectionComponents(section);
            await message.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
          }
      };

      // 0. MASS MENTION SPAM
      if (dbConfig.antiSpamMentionEnabled === true && !checkBypass('Mass Mentions')) {
         const mentions = message.mentions.users;
         if (mentions.size > 0) {
             let timeoutTriggered = false;
             for (const [targetId, user] of mentions) {
                 if (targetId === message.author.id || user.bot) continue;
                 const cacheKey = `${message.guild.id}_${message.author.id}_${targetId}`;
                 const now = Date.now();
                 let data = massMentionCache.get(cacheKey) || { count: 0, timestamp: now };
                 if (now - data.timestamp > 10000) data = { count: 0, timestamp: now };
                 data.count++;
                 data.timestamp = now;
                 massMentionCache.set(cacheKey, data);
                 
                 if (data.count >= 3 && !timeoutTriggered) {
                     timeoutTriggered = true;
                     await message.delete().catch(() => null);
                     await message.member.timeout(5 * 60 * 1000, "Automated: Mass Mention Spam Filter").catch(() => null);
                     await applyWarning(`User spam pinged ${user.tag} multiple times.`, `Mass Mentions`, 'Warned Mass Mentions');
                     massMentionCache.delete(cacheKey);
                     return;
                 }
             }
         }
      }

      // ==========================================
      // AI TOXICITY, SENTIMENT & DOXXING AUTOMOD (OPTIONAL)
      // ==========================================
      if (dbConfig.aiToxicityEnabled && !checkBypass('AI Toxicity') && !isAuthorized(message.member)) {
        const toxScan = scanToxicityAndSentiment(message.content);
        if (toxScan.isThreat) {
          await message.delete().catch(() => null);
          const authorTier = getUserTierName(message.guild, message.member || message.author);
          const timeoutMs = toxScan.severity === 'CRITICAL' ? 60 * 60 * 1000 : 15 * 60 * 1000;
          await message.member?.timeout(timeoutMs, `Automod: ${toxScan.category}`).catch(() => null);

          const securityLog = {
            type: 17,
            components: [
              { type: 10, content: `# ${getRandomHeadingGlyph()} AI Toxicity & Sentiment Intercept | <a:03_tick_circle:1565665642084827206>` },
              { type: 14, divider: true },
              {
                type: 10,
                content:
                  `-# **Offending Member:** ${message.author} (\`${message.author.id}\` | \`${message.author.tag}\`)\n` +
                  `-# **Author Clearance Tier:** \`[${authorTier}]\`\n` +
                  `-# **Channel:** <#${message.channel.id}>\n` +
                  `-# **Threat Category:** \`${toxScan.category}\`\n` +
                  `-# **Severity Level:** \`[${toxScan.severity}]\`\n` +
                  `-# **Reason:** ${toxScan.reason}\n` +
                  `-# **Detected Pattern:** \`||${toxScan.detectedPattern || 'Pattern Matched'}||\`\n` +
                  `-# **Action Taken:** \`Message Purged & Member Timed Out (${toxScan.severity === 'CRITICAL' ? '1 Hour' : '15 Minutes'})\``
              },
              { type: 14, divider: true },
              { type: 10, content: `-# **Athena Prime Neural Security & Sentinel Shield**` }
            ]
          };
          await logToSecurityChannel(message.guild, securityLog);
          return;
        }
      }

      // ==========================================
      // AUTOMATED ANTI-PHISHING & ANTI-SCAM SHIELD
      // ==========================================
      const phishScan = scanForPhishing(message.content);
      if (phishScan.isPhishing && !checkBypass('Anti Phishing')) {
        await message.delete().catch(() => null);
        const authorTier = getUserTierName(message.guild, message.member || message.author);
        await message.member?.timeout(60 * 60 * 1000, `Automod: Phishing / Scam Link Detected (${phishScan.reason})`).catch(() => null);

        const securityLog = {
          type: 17,
          components: [
            { type: 10, content: `# ${getRandomHeadingGlyph()} Anti-Phishing & Scam Shield Triggered | <a:03_tick_circle:1565665642084827206>` },
            { type: 14, divider: true },
            {
              type: 10,
              content:
                `-# **Offending Member:** ${message.author} (\`${message.author.id}\` | \`${message.author.tag}\`)\n` +
                `-# **Author Clearance Tier:** \`[${authorTier}]\`\n` +
                `-# **Channel:** <#${message.channel.id}>\n` +
                `-# **Threat Type:** \`${phishScan.reason}\`\n` +
                `-# **Detected Domain/Payload:** \`||${phishScan.matchedDomain}||\`\n` +
                `-# **Action Taken:** \`Message Purged & Member Timed Out (1 Hour)\``
            },
            { type: 14, divider: true },
            { type: 10, content: `-# **Athena Prime Enterprise Anti-Raid Defense Matrix**` }
          ]
        };
        await logToSecurityChannel(message.guild, securityLog);
        return;
      }

      // 1. ANTI-INVITE
      const isGlobalInviteAllowed = dbConfig.allowInvitesGlobally === true;
      const isInviteAllowedChannel = dbConfig.inviteAllowedChannel === message.channel.id;
      
      if (!isGlobalInviteAllowed && !isInviteAllowedChannel && dbConfig.antiInviteEnabled && !checkBypass('Anti Invite', hasAntiInviteImmunity)) {
        const inviteRegex = /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|io|me|li)|discord(?:app)?\.com\/invite)\/[a-zA-Z0-9-]+/gi;
        const fallbackRegex = /(discord\.(gg|io|me|li)\/|discord(app)?\.com\/invite\/)/gi;
        if (inviteRegex.test(message.content) || fallbackRegex.test(message.content)) {
          const rawMatches = message.content.match(inviteRegex) || [];
          const detectedInvites = rawMatches.length > 0 ? rawMatches : ['Discord Invite Link'];
          
          let highlightedContent = message.content;
          for (const inv of detectedInvites) {
            const escaped = inv.replace(/[.*+?^$!()|[\]\\]/g, '\\$&');
            highlightedContent = highlightedContent.replace(new RegExp(`(${escaped})`, 'gi'), '**||$1||**');
          }
          if (highlightedContent.length > 1000) {
            highlightedContent = highlightedContent.substring(0, 997) + '...';
          }

          const authorTier = getUserTierName(message.guild, message.member || message.author);
          const inviteList = detectedInvites.map(m => `\`||${m}||\``).join(', ');

          // Suppress redundant generic messageDelete event log
          if (!message.client.ignoredDeletes) message.client.ignoredDeletes = new Set();
          message.client.ignoredDeletes.add(message.id);

          await message.delete().catch(() => null);

          // 1. Detailed Security Channel Log
          const securityLog = {
            type: 17,
            components: [
              { type: 10, content: `# ${getRandomHeadingGlyph()} Discord Invite Link Blocked | <a:03_tick_circle:1565665642084827206>` },
              { type: 14, divider: true },
              {
                type: 10,
                content:
                  `-# **Offending Member:** ${message.author} (\`${message.author.id}\` | \`${message.author.tag}\`)\n` +
                  `-# **Author Clearance Tier:** \`[${authorTier}]\`\n` +
                  `-# **Channel:** <#${message.channel.id}>\n` +
                  `-# **Detected Invite URL(s):** ${inviteList}\n` +
                  `-# **Action Taken:** \`Invite Deleted & Auto-Mod Strike Recorded\``
              },
              { type: 14, divider: true },
              {
                type: 10,
                content: `### Highlighted Content:\n> ${highlightedContent}`
              },
              { type: 14, divider: true },
              { type: 10, content: `-# **Athena Prime Auto-Mod Sentinel Active**` }
            ]
          };
          await logToSecurityChannel(message.guild, { components: [securityLog], flags: 32768 });

          // 2. Detailed Message Delete Log
          let delInnerComps = [
            { type: 10, content: `# ${getRandomHeadingGlyph()} Message Deleted | <a:exclamation_outline1:1565666739356827759>` },
            { type: 14, divider: true },
            { type: 10, content: `-# **Author:** [${cleanDisplayName(message.author.displayName || message.author.username)}](https://discord.com/users/${message.author.id}) (\`${message.author.id}\`) [${authorTier}]` },
            { type: 10, content: `-# **Deleted By:** Athena Prime (Anti-Invite Auto-Mod)` },
            { type: 10, content: `-# **Reason:** Unauthorized Discord invite promotion: ${inviteList}` },
            { type: 10, content: `-# **Channel:** [\# ${message.channel.name}](https://discord.com/channels/${message.guild.id}/${message.channel.id})` },
            { type: 14, divider: true },
            { type: 10, content: `-# **Message Content (Highlighted):**` }
          ];
          for (const line of highlightedContent.split('\n')) {
            delInnerComps.push({ type: 10, content: `-# ${line}` });
          }
          delInnerComps.push({ type: 14, divider: true });
          delInnerComps.push({ type: 10, content: `-# **Athena Diagnostic Logs**` });

          await logServerEvent(message.guild, 'msgDeletes', {
            components: [{ type: 17, components: delInnerComps }],
            flags: 32768
          });

          await applyWarning(`Deleted invite promotion from member. Detected: ${inviteList}`, `Posted Discord Invite`, 'Warned Sending Invites');
          return;
        }
      }

      // 1.5 ANTI-LINK (URL FILTER)
      const isLinkAllowedChannel = (dbConfig.linkAllowedChannel === message.channel.id) ||
                                   (dbConfig.urlAllowedChannel === message.channel.id) ||
                                   (dbConfig.antiLinkAllowedChannel === message.channel.id) ||
                                   (Array.isArray(dbConfig.allowedLinkChannels) && dbConfig.allowedLinkChannels.includes(message.channel.id));

      if (dbConfig.allowAllLinks !== true && !isLinkAllowedChannel && dbConfig.antiLinkEnabled && !checkBypass('URL Filter', hasAntiLinkImmunity)) {
        const linkRegex = /https?:\/\/[^\s]+/gi;
        const matches = message.content.match(linkRegex);
        if (matches && matches.length > 0) {
          const detectedUrls = [...new Set(matches)];
          const urlList = detectedUrls.map(u => `\`||${u}||\``).join(', ');

          let highlightedContent = message.content;
          for (const u of detectedUrls) {
            const escaped = u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            highlightedContent = highlightedContent.replace(new RegExp(`(${escaped})`, 'gi'), '**||$1||**');
          }
          if (highlightedContent.length > 1000) {
            highlightedContent = highlightedContent.substring(0, 997) + '...';
          }

          const authorTier = getUserTierName(message.guild, message.member || message.author);

          // Suppress redundant generic messageDelete event log
          if (!message.client.ignoredDeletes) message.client.ignoredDeletes = new Set();
          message.client.ignoredDeletes.add(message.id);

          await message.delete().catch(() => null);

          // 1. Detailed Security Channel Log
          const securityLog = {
            type: 17,
            components: [
              { type: 10, content: `# ${getRandomHeadingGlyph()} URL Link Filter Blocked | <a:03_tick_circle:1565665642084827206>` },
              { type: 14, divider: true },
              {
                type: 10,
                content:
                  `-# **Offending Member:** <@${message.author.id}> (\`${message.author.id}\` | \`${message.author.tag}\`)\n` +
                  `-# **Author Clearance Tier:** \`[${authorTier}]\`\n` +
                  `-# **Channel:** <#${message.channel.id}>\n` +
                  `-# **Filtered URL(s):** ${urlList}\n` +
                  `-# **Action Taken:** \`Link Deleted & Auto-Mod Strike Recorded\``
              },
              { type: 14, divider: true },
              {
                type: 10,
                content: `### Highlighted Content:\n> ${highlightedContent}`
              },
              { type: 14, divider: true },
              { type: 10, content: `-# **Athena Prime Auto-Mod Sentinel Active**` }
            ]
          };
          await logToSecurityChannel(message.guild, { components: [securityLog], flags: 32768 });

          // 2. Detailed Message Delete Log (msgDeletes)
          let delInnerComps = [
            { type: 10, content: `# ${getRandomHeadingGlyph()} Message Deleted | <a:exclamation_outline1:1565666739356827759>` },
            { type: 14, divider: true },
            { type: 10, content: `-# **Author:** <@${message.author.id}> (\`${message.author.id}\`) [${authorTier}]` },
            { type: 10, content: `-# **Deleted By:** Athena Prime (Anti-Link Auto-Mod)` },
            { type: 10, content: `-# **Filtered URL(s):** ${urlList}` },
            { type: 10, content: `-# **Reason:** Unauthorized link/URL detected: ${urlList}` },
            { type: 10, content: `-# **Channel:** [\# ${message.channel.name}](https://discord.com/channels/${message.guild.id}/${message.channel.id})` },
            { type: 14, divider: true },
            { type: 10, content: `-# **Message Content (Highlighted):**` }
          ];
          for (const line of highlightedContent.split('\n')) {
            delInnerComps.push({ type: 10, content: `-# ${line}` });
          }
          delInnerComps.push({ type: 14, divider: true });
          delInnerComps.push({ type: 10, content: `-# **Athena Diagnostic Logs**` });

          await logServerEvent(message.guild, 'msgDeletes', {
            components: [{ type: 17, components: delInnerComps }],
            flags: 32768
          });

          await applyWarning(`Deleted message containing URL(s): ${urlList}`, `Posted Links: ${urlList}`, 'Warned URL Filter', detectedUrls);
          return;
        }
      }

      // 1.6 HIDDEN URL FILTER
      if (dbConfig.hiddenUrlEnabled !== false && !isLinkAllowedChannel && !checkBypass('Hidden URL Filter')) {
        const mdLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/gi;
        let match;
        while ((match = mdLinkRegex.exec(message.content)) !== null) {
          const textPart = match[1].toLowerCase();
          const urlPart = match[2].toLowerCase();
          if (/(https?:\/\/|[a-z0-9]+\.(com|net|org|gg|io|info))/.test(textPart)) {
            const textDomainMatch = textPart.match(/([a-z0-9-]+\.[a-z]+)/);
            if (textDomainMatch && !urlPart.includes(textDomainMatch[1])) {
               const deceptiveUrl = match[2];
               if (!message.client.ignoredDeletes) message.client.ignoredDeletes = new Set();
               message.client.ignoredDeletes.add(message.id);
               await message.delete().catch(() => null);

               const authorTier = getUserTierName(message.guild, message.member || message.author);
               await logServerEvent(message.guild, 'msgDeletes', {
                 components: [{
                   type: 17,
                   components: [
                     { type: 10, content: `# ${getRandomHeadingGlyph()} Message Deleted | <a:exclamation_outline1:1565666739356827759>` },
                     { type: 14, divider: true },
                     { type: 10, content: `-# **Author:** <@${message.author.id}> (\`${message.author.id}\`) [${authorTier}]` },
                     { type: 10, content: `-# **Deleted By:** Athena Prime (Hidden URL Filter)` },
                     { type: 10, content: `-# **Deceptive URL:** \`||${deceptiveUrl}||\`` },
                     { type: 10, content: `-# **Channel:** [\# ${message.channel.name}](https://discord.com/channels/${message.guild.id}/${message.channel.id})` },
                     { type: 14, divider: true },
                     { type: 10, content: `-# **Athena Diagnostic Logs**` }
                   ]
                 }],
                 flags: 32768
               });

               await applyWarning(`Deceptive/Hidden hyperlink markdown detected: \`||${deceptiveUrl}||\``, `Posted Hidden URL: \`||${deceptiveUrl}||\``, 'Warned Hidden URL', [deceptiveUrl]);
               return;
            }
          }
        }
      }

      // 1.7 FILE CHECK
      if (dbConfig.fileCheckEnabled !== false && !checkBypass('File Check')) {
         if (message.attachments.size > 0) {
            const forbiddenExts = ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js', '.zip', '.rar', '.tar', '.gz'];
            for (const [id, attachment] of message.attachments) {
               const ext = attachment.name.toLowerCase().slice(attachment.name.lastIndexOf('.'));
               if (forbiddenExts.includes(ext)) {
                  await message.delete().catch(() => null);
                  await applyWarning(`Uploaded a forbidden file extension: ${attachment.name}`, `Uploaded Blocked File`, 'Warned File Uploading');
                  return;
               }
            }
         }
      }

      // 2. WORD BLACKLIST FILTER
      if (!checkBypass('Swear Words', hasAntiSpamImmunity)) {
        if (dbConfig.wordFilterEnabled !== false && dbConfig.blacklistWords && dbConfig.blacklistWords.length > 0) {
          const msgLower = message.content.toLowerCase();
          const matchedWords = dbConfig.blacklistWords.filter(word => {
            const escapedWord = word.replace(/[.*+?^$!()|[\]\\]/g, '\\$&');
            return new RegExp(`(?:^|\\W)${escapedWord}(?:$|\\W)`, 'i').test(msgLower);
          });
          if (matchedWords.length > 0) {
            let highlightedContent = message.content;
            for (const word of matchedWords) {
              const escaped = word.replace(/[.*+?^$!()|[\]\\]/g, '\\$&');
              highlightedContent = highlightedContent.replace(new RegExp(`(${escaped})`, 'gi'), '**||$1||**');
            }
            if (highlightedContent.length > 1000) {
              highlightedContent = highlightedContent.substring(0, 997) + '...';
            }

            const authorTier = getUserTierName(message.guild, message.member || message.author);
            const wordList = matchedWords.map(w => `\`||${w}||\``).join(', ');

            // Suppress redundant generic messageDelete event log
            if (!message.client.ignoredDeletes) message.client.ignoredDeletes = new Set();
            message.client.ignoredDeletes.add(message.id);

            await message.delete().catch(() => null);

            // 1. Comprehensive Security Channel Log
            const securityLog = {
              type: 17,
              components: [
                { type: 10, content: `# ${getRandomHeadingGlyph()} Blacklisted Word Neutralized | <a:03_tick_circle:1565665642084827206>` },
                { type: 14, divider: true },
                {
                  type: 10,
                  content:
                    `-# **Offending Member:** ${message.author} (\`${message.author.id}\` | \`${message.author.tag}\`)\n` +
                    `-# **Author Clearance Tier:** \`[${authorTier}]\`\n` +
                    `-# **Channel:** <#${message.channel.id}>\n` +
                    `-# **Violating Phrase(s):** ${wordList}\n` +
                    `-# **Action Taken:** \`Message Deleted & Auto-Mod Strike Recorded\``
                },
                { type: 14, divider: true },
                {
                  type: 10,
                  content: `### Highlighted Content:\n> ${highlightedContent}`
                },
                { type: 14, divider: true },
                { type: 10, content: `-# **Athena Prime Auto-Mod Sentinel Active**` }
              ]
            };
            await logToSecurityChannel(message.guild, { components: [securityLog], flags: 32768 });

            // 2. Comprehensive Message Delete Log
            let delInnerComps = [
              { type: 10, content: `# ${getRandomHeadingGlyph()} Message Deleted | <a:exclamation_outline1:1565666739356827759>` },
              { type: 14, divider: true },
              { type: 10, content: `-# **Author:** [${cleanDisplayName(message.author.displayName || message.author.username)}](https://discord.com/users/${message.author.id}) (\`${message.author.id}\`) [${authorTier}]` },
              { type: 10, content: `-# **Deleted By:** Athena Prime (Blacklisted Word Auto-Mod)` },
              { type: 10, content: `-# **Reason:** Blacklisted phrase matched: ${wordList}` },
              { type: 10, content: `-# **Channel:** [\# ${message.channel.name}](https://discord.com/channels/${message.guild.id}/${message.channel.id})` },
              { type: 14, divider: true },
              { type: 10, content: `-# **Message Content (Highlighted):**` }
            ];
            for (const line of highlightedContent.split('\n')) {
              delInnerComps.push({ type: 10, content: `-# ${line}` });
            }
            delInnerComps.push({ type: 14, divider: true });
            delInnerComps.push({ type: 10, content: `-# **Athena Diagnostic Logs**` });

            await logServerEvent(message.guild, 'msgDeletes', {
              components: [{ type: 17, components: delInnerComps }],
              flags: 32768
            });

            await applyWarning(`Matched blacklisted phrase(s): ${wordList}`, `Used Swear Words`, 'Warned Using Swear Words');
            return;
          }
        }
      }
      
      // 2.5 BIG FONTS
      if (dbConfig.bigFontsEnabled !== false && !checkBypass('Big Fonts')) {
         const letters = message.content.replace(/[^a-zA-Z]/g, '');
         if (letters.length > 10) {
            const upperCount = letters.replace(/[^A-Z]/g, '').length;
            if (upperCount / letters.length > 0.8) {
               await message.delete().catch(() => null);
               await applyWarning(`Excessive uppercase usage (Big Fonts)`, `Used Big Fonts`, 'Warned Big Fonts');
               return;
            }
         }
      }

      // 2.7 SELFBOT DETECTION
      if (dbConfig.selfbotDetectionEnabled !== false && !checkBypass('Selfbot Detection')) {
         if (!message.author.bot && message.embeds.length > 0) {
            // Check if any embed is a "rich" embed (which standard users cannot send natively)
            if (message.embeds.some(e => e.type === 'rich')) {
               message.delete().catch(() => null);
               return applyWarning(message, "Selfbot Detection", "Illegal Automated Rich Embed Generation");
            }
         }
      }

      // 3. ANTI-SPAM & ANTI FLOOD
      if ((dbConfig.antiSpamEnabled !== false || dbConfig.antiFloodEnabled !== false) && !checkBypass('Spam Filter', hasAntiSpamImmunity) && !checkBypass('Anti Flood', hasAntiSpamImmunity)) {
        const now = Date.now();
        if (!spamCache.has(cacheKey)) spamCache.set(cacheKey, []);
        const timestamps = spamCache.get(cacheKey);
        const cleanTimestamps = timestamps.filter(time => now - time < config.antiSpam.intervalMs);
        cleanTimestamps.push(now);
        spamCache.set(cacheKey, cleanTimestamps);
  
        if (cleanTimestamps.length > config.antiSpam.maxMessages) {
          const lastCooldown = spamCooldown.get(cacheKey) || 0;
          if (now - lastCooldown > 5000) {
            spamCooldown.set(cacheKey, now);
            spamCache.set(cacheKey, []); 
            try {
              const fetched = await message.channel.messages.fetch({ limit: 15 });
              const userSpam = fetched.filter(m => m.author.id === userId && now - m.createdTimestamp < 4000);
              await message.channel.bulkDelete(userSpam).catch(() => null);
            } catch (e) {
              await message.delete().catch(() => null);
            }
            await applyWarning(`User triggered rate-limits by exceeding message counts.`, `Spammed Messages`, 'Warned Spamming');
          }
          return;
        }
      }

      // ==========================================
      // 3.5. AUTO-RESPONDER TRIGGERS
    // ==========================================
    // Do not trigger on prefix commands or bot mentions (avoids overlapping logic)
    const prefix = dbConfig.prefix || '!';
    const botMention1 = `<@${message.client.user?.id}>`;
    const botMention2 = `<@!${message.client.user?.id}>`;
    const isBotCommand = message.content.startsWith(prefix) || 
                         message.content.startsWith(botMention1) || 
                         message.content.startsWith(botMention2);

    if (!isBotCommand) {
      const serverTriggers = db.getTriggers(guildId);
      const rawGlobalTriggers = db.getGlobalTriggers();
      // Filter out global triggers that have been disabled specifically for this server
      const globalTriggers = rawGlobalTriggers.filter(gt => !db.isGlobalTriggerDisabled(guildId, gt.match));
      // Server-specific triggers take precedence over global triggers
      const allTriggers = [...serverTriggers, ...globalTriggers];
      
      for (const t of allTriggers) {
        if (!t.match) continue;
        
        if (matchesTrigger(message.content, t.match)) {
          // 1. Audience Filter
          if (t.audience && t.audience !== 'all') {
            const joinedAt = message.member?.joinedTimestamp || 0;
            const isNewbie = joinedAt > 0 && (Date.now() - joinedAt) < (3 * 24 * 60 * 60 * 1000);
            const isBooster = Boolean(message.member?.premiumSinceTimestamp);
            const isStaff = message.member?.permissions?.has(PermissionFlagsBits.ManageMessages) ||
                            message.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                            isBotOwnerSync(message.author.id) ||
                            message.guild.ownerId === message.author.id;

            if (t.audience === 'newbie' && !isNewbie) continue;
            if (t.audience === 'regular' && isNewbie) continue;
            if (t.audience === 'booster' && !isBooster) continue;
            if (t.audience === 'staff' && !isStaff) continue;
          }

          // 2. Time / Clock Filter
          if (t.timeVariant && t.timeVariant !== 'always') {
            const now = new Date();
            const hour = now.getHours();
            const day = now.getDay();
            const isWeekend = (day === 0 || day === 6);

            if (t.timeVariant === 'weekend' && !isWeekend) continue;
            if (t.timeVariant === 'morning' && (hour < 5 || hour >= 12)) continue;
            if (t.timeVariant === 'day' && (hour < 12 || hour >= 18)) continue;
            if (t.timeVariant === 'night' && (hour >= 5 && hour < 18)) continue;
          }

          // 3. Dual-Action Emoji Reaction (Auto-Reaction Synergy) - Manually Settable
          if (t.reaction && t.reaction.trim()) {
            message.react(t.reaction.trim()).catch(() => null);
          }

          // 4. Staff Alert & Channel Mirroring (Emergency / Escalation Triggers) - Manually Settable
          if (t.mirrorChannel) {
            const mirrorTarget = message.guild.channels.cache.get(t.mirrorChannel) ||
              await message.guild.channels.fetch(t.mirrorChannel).catch(() => null);
            if (mirrorTarget && mirrorTarget.isTextBased()) {
              mirrorTarget.send({
                components: [{
                  type: 17,
                  accent_color: 0xED4245,
                  components: [
                    { type: 10, content: `# ${getRandomHeadingGlyph()} **Trigger Escalation Alert | <a:03_tick_circle:1565665642084827206>**` },
                    { type: 14, divider: true },
                    {
                      type: 10,
                      content:
                        `-#  **Trigger Keyword:** \`${t.match}\`\n` +
                        `-#  **Author:** <@${message.author.id}> (\`${message.author.tag || message.author.id}\`)\n` +
                        `-#  **Channel:** <#${message.channel.id}>\n` +
                        `-#  **Message Content:** ${message.content.slice(0, 500)}\n` +
                        `-#  **Jump Link:** [Click to Jump](${message.url})`
                    },
                    { type: 14, divider: true },
                    { type: 10, content: '-# Athena Prime Escalation Matrix • Trigger Mirror Alert' }
                  ]
                }],
                flags: MessageFlags.IsComponentsV2
              }).catch(() => null);
            }
          }

          // 5. Gamified Easter Egg & Bounty Triggers
          let bountyNotice = null;
          if (t.rewardXp && typeof t.rewardXp === 'number' && t.rewardXp > 0) {
            const claimRes = db.claimEasterEggTrigger(guildId, t.match, message.author.id);
            if (claimRes.success) {
              const userXp = db.getUserXp(guildId, message.author.id);
              userXp.xp += claimRes.rewardXp;
              const newLevel = calculateLevel(userXp.xp);
              if (newLevel > userXp.level) {
                userXp.level = newLevel;
                processLevelUp(message.client, message.guild, message.member, newLevel, message.channel).catch(() => null);
              }
              db.setUserXp(guildId, message.author.id, userXp);
              bountyNotice = `-# 🎉 **[Easter Egg Found!]** <@${message.author.id}> discovered a secret keyword and claimed **+${claimRes.rewardXp} XP**! (${claimRes.claimsCount}/${claimRes.maxClaims || '∞'} claimed)`;
            }
          }

          // 6. Ghost countdown notice
          let ghostNotice = null;
          if (t.ghost && typeof t.ghost === 'number' && t.ghost > 0) {
            ghostNotice = `-# ⏳ **[Self-Destruct]** This message and trigger will auto-delete in **${t.ghost}s**.`;
          }

          // 7. Dispatch Response
          const userOrMember = message.member || message.author;
          let sentMessage = null;

          if (t.type === 'trigger') {
            const { resolvePlaceholders } = await import('../commands/welcome.js');
            const body = t.content || t.response || '';
            const resolvedText = resolvePlaceholders(body, userOrMember, message.guild);

            if (t.heading || t.gif || t.footer || ghostNotice || bountyNotice) {
              const triggerContainer = buildAutoReplyPreview(message.guild, t, userOrMember, {
                ghostNotice,
                bountyNotice
              });
              sentMessage = await message.reply({ components: [triggerContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {
                return message.channel.send({ components: [triggerContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
              });
            } else if (resolvedText) {
              sentMessage = await message.reply({ content: resolvedText }).catch(() => {
                return message.channel.send({ content: resolvedText }).catch(() => null);
              });
            }
          } else {
            // Standard Auto-Reply (CV2 accent borderless container)
            const autoReplyContainer = buildAutoReplyPreview(message.guild, t, userOrMember, {
              ghostNotice,
              bountyNotice
            });

            sentMessage = await message.reply({ components: [autoReplyContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {
              return message.channel.send({ components: [autoReplyContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
            });
          }

          // 8. Ghost auto-purge execution
          if (t.ghost && typeof t.ghost === 'number' && t.ghost > 0) {
            setTimeout(async () => {
              try {
                if (sentMessage) await sentMessage.delete().catch(() => null);
                await message.delete().catch(() => null);
              } catch {}
            }, t.ghost * 1000);
          }

          break; // Reply only once per message
        }
      }
    }

    // ==========================================
    // 4. PREFIX-LESS COMMANDS: PING
    // ==========================================
    if (message.content.toLowerCase().trim() === 'ping') {
      const cmd = commandMap.get('ping');
      if (cmd && cmd.executePrefix) {
        await cmd.executePrefix(message, []);
      }
      return;
    }
    // ==========================================
    // 4.4 PREFIX-LESS: EZAL (Owner Suite)
    // ==========================================
    const msgCheck = message.content.toLowerCase().trim();

    if (msgCheck === 'ezal' || msgCheck.startsWith('ezal ')) {
      await handleEzal(message);
      return;
    }

    // ==========================================
    // 4.45 PREFIX-LESS: BACKUP (Bot Owner + Server Owner)
    // Server owners can backup their own server without ezal prefix
    // ==========================================
    if (msgCheck === 'backup' || msgCheck.startsWith('backup ')) {
      const isOwner = isBotOwnerSync(message.author.id);
      const isServerOwner = message.guild && message.author.id === message.guild.ownerId;
      if (isOwner || isServerOwner) {
        const backupArgs = message.content.trim().split(/ +/).slice(1);
        await handleBackup(message, backupArgs).catch(console.error);
      }
      return;
    }

    // ==========================================
    // 4.5 PREFIX-LESS: ENUKE (Owner Only)
    // ==========================================

    if (msgCheck === 'enuke' || msgCheck.startsWith('enuke ')) {
      if (isBotOwnerSync(message.author.id)) {
        const enukeArgs = message.content.trim().split(/ +/).slice(1);
        const enukeCmd = commandMap.get('enuke');
        if (enukeCmd) {
          try {
            await enukeCmd.executePrefix(message, enukeArgs);
          } catch (error) {
            console.error('Error executing enuke:', error);
            await message.reply(cv2.danger('Enuke Error', 'An error occurred while launching the Enuke Manager.')).catch(() => null);
          }
        }
      }
      return; // Silent for non-owners
    }

    // ==========================================
    // 4.6 PREFIX-LESS: SPAM + QR (short quarantine)
    // ==========================================

    if (msgCheck === 'spam' || msgCheck.startsWith('spam ')) {
      const spamCmd = commandMap.get('spam');
      if (spamCmd) {
        try {
          const spamArgs = message.content.trim().split(/ +/).slice(1);
          await spamCmd.executePrefix(message, spamArgs);
        } catch (error) {
          console.error('Error executing spam:', error);
        }
      }
      return;
    }

    // STATS TRACKER: Log user and channel message
    statsDB.logMessage(message.guild.id, message.author.id, message.channel.id);

    // --- PREFIX COMMAND HANDLING ---
    // qr is a short alias for quarantine - works without ! prefix
    if (msgCheck === 'qr' || msgCheck.startsWith('qr ')) {
        if (dbConfig.shortcutsEnabled === false) return; // Block prefix-less shortcut
      const qrCmd = commandMap.get('qr');
      if (qrCmd) {
        try {
          const qrArgs = message.content.trim().split(/ +/).slice(1);
          await qrCmd.executePrefix(message, qrArgs);
        } catch (error) {
          console.error('Error executing qr:', error);
        }
      }
      return;
    }

    // ==========================================
    // 4.65 PREFIX-LESS: STEAL (Emoji / GIF Stealer)
    // ==========================================
    if (msgCheck === 'steal' || msgCheck.startsWith('steal ') ||
        msgCheck === 'stealemoji' || msgCheck.startsWith('stealemoji ') ||
        msgCheck === 'addemoji' || msgCheck.startsWith('addemoji ')) {
      const hasMediaOrArgs = (message.attachments && message.attachments.size > 0) ||
                             message.reference ||
                             /<(a?):([a-zA-Z0-9_]+):(\d+)>/.test(message.content) ||
                             /https?:\/\//.test(message.content) ||
                             db.getNpUser(message.author.id) ||
                             db.getNpServer(message.guild.id);
      if (dbConfig.shortcutsEnabled !== false && hasMediaOrArgs) {
        const stealCmd = commandMap.get('steal');
        if (stealCmd) {
          const isBypass = isBotOwnerSync(message.author.id) ||
            message.author.id === message.guild.ownerId ||
            db.isExtraOwner(message.guild.id, message.author.id);
          const hasPerm = isBypass || message.member?.permissions?.has(PermissionFlagsBits.ManageGuildExpressions);
          if (!hasPerm) {
            await message.reply(cv2.danger('Access Denied', 'You do not possess the required permissions to execute this command.')).catch(() => null);
            return;
          }
          try {
            const stealArgs = message.content.trim().split(/ +/).slice(1);
            await stealCmd.executePrefix(message, stealArgs);
          } catch (error) {
            console.error('Error executing steal shortcut:', error);
          }
          return;
        }
      }
    }

    // ==========================================
    // 4.65 PREFIX-LESS: EMJS (Emoji inspect & upload)
    // ==========================================
    if (msgCheck === 'emjs' || msgCheck.startsWith('emjs ') ||
        msgCheck === 'emojis' || msgCheck.startsWith('emojis ')) {
      const emjsCmd = commandMap.get('emojis');
      if (emjsCmd) {
        try {
          const emjsArgs = message.content.trim().split(/ +/).slice(1);
          await emjsCmd.executePrefix(message, emjsArgs);
          return;
        } catch (error) {
          console.error('Error executing emjs shortcut:', error);
        }
      }
    }

    // ==========================================
    // 4.7 PREFIX-LESS: FCK (Prank DM command)
    // ==========================================
    if (msgCheck === 'fck' || msgCheck.startsWith('fck ') ||
        msgCheck === 'fk'  || msgCheck.startsWith('fk ')  ||
        msgCheck === 'fcku'|| msgCheck.startsWith('fcku ')) {
      const fckCmd = commandMap.get('fck');
      if (fckCmd) {
        try {
          const fckArgs = message.content.trim().split(/ +/).slice(1);
          await fckCmd.executePrefix(message, fckArgs);
        } catch (error) {
          console.error('Error executing fck:', error);
        }
      }
      return;
    }

    // ==========================================
    // 4.8 PREFIX-LESS: NP MANAGER SUITE
    // ==========================================
    if (msgCheck === 'np' || msgCheck.startsWith('np ')) {
      const npCmd = commandMap.get('np');
      if (npCmd) {
        try {
          const npArgs = message.content.trim().split(/ +/).slice(1);
          await npCmd.executePrefix(message, npArgs);
        } catch (error) {
          console.error('Error executing np:', error);
        }
      }
      return;
    }

    // ==========================================
    // 4.9 PREFIX-LESS: BOT GROWTH & ANALYTICS
    // ==========================================
    const growthCmds = ['bjoins', 'bjoin', 'botjoins', 'bleaves', 'bleave', 'botleaves', 'bsummary', 'bgrowth', 'bjoinssummary', 'bcmds', 'bcmd', 'botcmds', 'btopcmds', 'btop', 'bcmdusers', 'bservers', 'bmem', 'bping'];
    if (growthCmds.includes(msgCheck)) {
      const gCmd = commandMap.get('bjoins'); // They all route to the same or mapped via command map
      if (gCmd) {
        try {
          // Manually route to the correct executePrefix based on msgCheck alias mapping
          const matchedCmd = commandMap.get(msgCheck);
          if (matchedCmd) await matchedCmd.executePrefix(message, []);
        } catch (error) {
          console.error('Error executing growth command:', error);
        }
      }
      return;
    }

    if (msgCheck === 'ss' || msgCheck === 'security status') {
        if (msgCheck === 'ss' && dbConfig.shortcutsEnabled === false) return; // Block prefix-less shortcut
      const statusCmd = commandMap.get('status');
      if (statusCmd) {
        try {
          await statusCmd.executePrefix(message, []);
        } catch (err) {
          console.error('Error executing prefix-less status:', err);
        }
      }
      return;
    }

    // ==========================================
    // 4.10 PREFIX-LESS: UR (User Rename)
    // ==========================================
    if (msgCheck === 'ur' || msgCheck.startsWith('ur ') ||
        msgCheck === 'rename' || msgCheck.startsWith('rename ')) {
      const renameCmd = commandMap.get('ur');
      if (renameCmd) {
        try {
          const urArgs = message.content.trim().split(/ +/).slice(1);
          await renameCmd.executePrefix(message, urArgs);
        } catch (error) {
          console.error('Error executing ur:', error);
        }
      }
      return;
    }

    // ==========================================
    // 5. COMMAND ENGINE (PREFIX PARSER & NO-PREFIX BYPASS)
    // ==========================================
    const botMention = `<@${message.client.user.id}>`;
    const botMentionSpace = `<@${message.client.user.id}> `;
    const botMentionNick = `<@!${message.client.user.id}>`;
    const botMentionNickSpace = `<@!${message.client.user.id}> `;

    let usedPrefix = null;
    let isNpBypass = false;

    if (message.content.startsWith(prefix)) usedPrefix = prefix;
    else if (message.content.startsWith(botMentionSpace)) usedPrefix = botMentionSpace;
    else if (message.content.startsWith(botMentionNickSpace)) usedPrefix = botMentionNickSpace;
    else if (message.content.startsWith(botMention)) usedPrefix = botMention;
    else if (message.content.startsWith(botMentionNick)) usedPrefix = botMentionNick;

    // --- GLOBAL NO-PREFIX (NP) BYPASS ---
    if (!usedPrefix && !db.isNpPaused()) {
      const npUser = db.getNpUser(message.author.id);
      const npServer = db.getNpServer(message.guild.id);
      if (npUser || npServer) {
        // Attempt to match the first word as a command
        const firstWord = message.content.trim().split(/ +/)[0].toLowerCase();
        
        const gConfig = db.getGuildConfig(message.guild.id);
        const cAliases = gConfig?.customCommands || {};
        
        if (commandMap.has(firstWord) || cAliases[firstWord]) {
          const actualCmd = cAliases[firstWord] || firstWord;
          const bannedCmds = db.getNpBannedCommands();
          if (!bannedCmds.includes(actualCmd)) {
            usedPrefix = '';
            isNpBypass = true;
          }
        }
      }
    }

    // --- AUTO TTS SYSTEM ---
    if (!usedPrefix && !message.author.bot) {
      const autoTtsUsers = db.getAutoTtsUsers(message.guild.id);
      const autoTtsVc = db.getAutoTtsVc(message.guild.id);
      
      const isAutoUser = autoTtsUsers.includes(message.author.id);
      const isAutoVc = autoTtsVc && message.member?.voice?.channelId === autoTtsVc;

      if (isAutoUser || isAutoVc) {
        import('../commands/tts.js').then(module => {
          module.queueTtsMessage(message.member, message.content).catch(() => null);
        });
      }
    }

    // --- CONVERSATIONAL AI MODE IN DEDICATED CHANNEL ---
    if (!usedPrefix && !message.author.bot && dbConfig.aiModeEnabled && dbConfig.aiChannelId && message.channel.id === dbConfig.aiChannelId) {
      const prompt = message.content.trim();
      if (prompt.length > 0) {
        import('../utils/ai.js').then(async ({ generateAIResponse }) => {
          import('../commands/ask.js').then(async ({ buildAICV2Container }) => {
            const aiResult = await generateAIResponse(prompt, {
              guildId: message.guild.id,
              userTag: message.author.tag,
              serverName: message.guild.name
            });
            if (aiResult.success) {
              const accentColor = dbConfig.accentColor || '#00e5ff';
              const container = buildAICV2Container(message.author, prompt, aiResult, accentColor);
              await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
            }
          });
        }).catch(() => null);
        return;
      }
    }

    if (usedPrefix === null) return;

    const args = message.content.slice(usedPrefix.length).trim().split(/ +/);
    let commandName = args.shift().toLowerCase();
    
    const guildConfig = db.getGuildConfig(message.guild.id);
    const ccmds = guildConfig?.customCommands || {};
    if (ccmds[commandName]) {
      commandName = ccmds[commandName];
    }
    
    // Find command by name (loader.js populates aliases directly in commandMap)
    let cmd = commandMap.get(commandName);

    // --- SHORTCUTS TOGGLE SYSTEM ---
    if (cmd && guildConfig.shortcutsEnabled === false) {
      if (cmd.name !== commandName && commandName !== 'sc' && commandName !== 'shortcuts') {
        return; // Silently block the alias from running
      }
    }

    // --- COMMAND & CHANNEL IGNORE SYSTEM ---
    if (cmd && !isNpBypass) {
      const ignoredChannels = db.getIgnoredChannels(message.guild.id);
      const ignoredCategories = db.getIgnoredCategories(message.guild.id);
      
      const isIgnored = ignoredChannels.includes('ALL') || 
                        ignoredChannels.includes(message.channel.id) || 
                        (message.channel.parentId && ignoredCategories.includes(message.channel.parentId));

      if (isIgnored) {
        const { isServerAdmin } = await import('../utils/helpers.js');
        if (!isServerAdmin(message.member, message.guild)) {
           // Channel is ignored and user is not an admin, silently drop the command
           return;
        }
      }
    }

    // Intelligent command error correction with fuzzy matching
    if (!cmd) {
      const closest = findClosestCommand(commandName, [...commandMap.keys()]);
      const triggerUsed = usedPrefix === prefix ? prefix : `@${message.client.user.username} `;
      
      if (closest) {
        const suggestEmbed = cv2.warn(
          'Unknown Command',
          `${message.author}  Command \`${triggerUsed}${commandName}\` not found.\n\n Did you mean: \`${prefix}${closest}\`?\n\nUse \`${prefix}help\` for all commands.`
        );
        return message.reply(suggestEmbed).catch(() => null);
      } else {
        const notFoundEmbed = cv2.warn(
          'Unknown Command',
          `${message.author}  Command \`${triggerUsed}${commandName}\` does not exist.\n\nUse \`${prefix}help\` for all available commands.`
        );
        return message.reply(notFoundEmbed).catch(() => null);
      }
    }

    // --- ABSOLUTE GATE FOR GLOBALLY BLACKLISTED USERS ---
    if (db.isUserBotBlacklisted(message.author.id) && !isBotOwnerSync(message.author.id)) {
      const bData = db.cache.botBlacklistData?.[message.author.id];
      const reason = bData?.reason || 'Violation of Athena Bot Rules & Security Protocols';
      return message.reply(cv2.danger(
        'Globally Blacklisted',
        `-# **__Security Notice:__** You are globally banned from using Athena.\n\n` +
        `> -# **__Account:__** <@${message.author.id}> (\`${message.author.id}\`)\n` +
        `> -# **__Status:__** \`Permanently Blacklisted\`\n` +
        `> -# **__Reason:__** \`${reason}\`\n` +
        `> -# **__Enforcement:__** All commands (\`!help\`, \`!ping\`, modules) are permanently locked for your account across all servers, including server-owner privileges.\n` +
        `> -# **__Appeal:__** If you believe this is an error, please contact the Bot Owner.`
      )).catch(() => null);
    }

    // --- ATHENA CLEARANCE HIERARCHY GATE ---
    // Strict 4-tier model:
    // 1. Bot Owner Commands
    // 2. Server Owner Commands
    // 3. Public Commands (Anyone in server)
    // 4. Extra Owner Commands (EVERYTHING ELSE: all server management, channels, roles, moderation, security, automod, configs)
    // Native Discord 'Administrator' permissions DO NOT grant access to Athena commands.
    const clearance = checkCommandClearance(cmd.name || commandName, message.author.id, message.guild);
    if (!clearance.allowed) {
      return message.reply(cv2.danger(
        'Access Denied | <a:04_cross_circle:1565665644806934639>',
        `You do not have permission to execute \`${usedPrefix}${commandName}\`.\n\n` +
        `> -# **Required Clearance:** **${clearance.requiredClearance}**\n` +
        `> -# **Athena Security Policy:** Native Discord \`Administrator\` permissions do NOT grant access to Athena management commands. Only the **Server Owner** and designated **Extra Owners** (\`!extraowner\`) can manage the server or security.`
      )).catch(() => null);
    }

    try {
      // --- DUAL-KEY NUCLEAR COMMAND CHECK ---
      const dkConfig = guildConfig.dualKey;
      if (dkConfig?.enabled && dkConfig.protectedCommands?.includes(cmd.name || commandName)) {
        const isBypass = isBotOwnerSync(message.author.id);
        if (!isBypass) {
          const { buildDualKeyAuthCard } = await import('../commands/dualkey.js');
          const pendingAction = db.createPendingDualKey({
            guildId: message.guild.id,
            initiatorId: message.author.id,
            initiatorTag: message.author.tag || message.author.id,
            commandName: cmd.name || commandName,
            rawArgs: args,
            summary: `Execution of protected command !${cmd.name || commandName}`
          });
          const authCard = buildDualKeyAuthCard(pendingAction);
          return message.reply(authCard).catch(() => null);
        }
      }

      // --- STAFF PULSE & ANOMALY TRACKING ---
      const modActions = {
        ban: 'bans',
        kick: 'kicks',
        warn: 'warns',
        timeout: 'timeouts',
        mute: 'timeouts',
        purge: 'purges',
        clear: 'purges'
      };
      if (modActions[commandName]) {
        db.recordStaffAction(message.guild.id, message.author.id, modActions[commandName]);
        const { checkStaffAnomaly } = await import('../commands/anomaly.js');
        const triggered = await checkStaffAnomaly(message.guild, message.author, commandName);
        if (triggered) {
          return message.reply(cv2.danger(
            'Staff Behavioral Anomaly Triggered',
            `> -# <@${message.author.id}> has exceeded the action burst limit.\n` +
            `> -# Your administrative roles have been soft-locked and vaulted pending Server Owner authorization.`
          )).catch(() => null);
        }
      }

      if (!cmd.executePrefix && cmd.executeSlash) {
        const mockInteraction = createMockInteraction(message, args, cmd);
        await cmd.executeSlash(mockInteraction);
      } else if (cmd.executePrefix) {
        await cmd.executePrefix(message, args);
      } else if (typeof cmd.execute === 'function') {
        await cmd.execute(message, args);
      }

      // Track successful command execution for NP analytics & LiveOps Telemetry
      import('../utils/liveOpsMonitor.js').then(m => m.recordCommandExecution(commandName, 'prefix')).catch(() => null);
      if (!db.cache.botAnalytics) db.cache.botAnalytics = { joins: 0, leaves: 0, cmds: {} };
      db.cache.botAnalytics.cmds[commandName] = (db.cache.botAnalytics.cmds[commandName] || 0) + 1;
      db.save();

      // --- GLOBAL COMMAND LOGGING ---
      const loggedCategories = ['moderation', 'security', 'config', 'enuke', 'modmode', 'utility'];
      const isModUser = message.member && message.member.permissions.has('ModerateMembers');
      const excludedCmds = ['explain', 'help', 'status', 'ping', 'docs', 'architecture'];
      if (!excludedCmds.includes(cmd.name) && (loggedCategories.includes(cmd.category) || isModUser)) {
          import('../utils/helpers.js').then(helpers => {
              if (helpers.logToSecurityChannel) {
                  const logContent = message.content.length > 1000 ? message.content.substring(0, 1000) + '...' : message.content;
                  const tierName = helpers.getUserTierName(message.guild, message.member);
                  const embed = cv2.info(
                      `Command Execution Log | ${cv2.TICK_EMOJI}`,
                      `User <@${message.author.id}> (\`${message.author.id}\`) executed a command.`,
                      [
                          { name: 'Command', value: `\`\`\`\n${logContent}\n\`\`\``, inline: false },
                          { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                          { name: 'Category', value: cmd.category || 'utility', inline: true },
                          { name: 'Clearance', value: `\`${tierName}\``, inline: true }
                      ],
                      cmd.category || 'moderation'
                  );
                  helpers.logToSecurityChannel(message.guild, embed).catch(()=>{});
              }
          }).catch(()=>{});
      }

    } catch (error) {
      if (error.code !== 10008 && error.code !== 50035 && !error.message?.includes('Unknown message')) console.error(error);
      const errEmbed = cv2.danger('Execution Error', `An unexpected error occurred while executing this command.\n\n\`\`\`js\n${error.message}\n\`\`\``);
      await message.reply(errEmbed).catch(() => null);
    }
  }
};

