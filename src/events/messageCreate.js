import { PermissionFlagsBits, EmbedBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, SectionBuilder, ThumbnailBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import db from '../database.js';
import embed, { setGuildContext } from '../embed.js';
import cv2 from '../cv2.js';
import commandMap from '../commands/loader.js';
import { executeQuarantine } from '../commands/security.js';
import { handleEzal, handleBackup } from '../commands/ezal.js';
import statsDB from '../statsDB.js';
import { canModerate, logToSecurityChannel, isAuthorized, isBotOwnerSync, getPresenceStatus, findClosestCommand, getUserTierName, cleanDisplayName } from '../utils/helpers.js';
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

function matchesTrigger(messageContent, triggerKeyword) {
  if (!messageContent || !triggerKeyword) return false;
  const content = messageContent.trim().toLowerCase();
  const keyword = triggerKeyword.trim().toLowerCase();
  if (content === keyword) return true;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('(^|\\s|[^a-zA-Z0-9_])' + escaped + '($|\\s|[^a-zA-Z0-9_])', 'i');
  return regex.test(content);
}

export { getCachedGif };

const nbClient = new Client();
const gifCache = new Map();
const massMentionCache = new Map();
const globalBanCooldowns = new Map();

function mapAnimeAction(action) {
  const map = {
    date: ['kiss', 'hug', 'cuddle'],
    propose: ['kiss', 'hug'],
    arrest: ['slap', 'bite'],
    jail: ['cry', 'bored'],
    trash: ['yeet', 'slap', 'kick'],
    fry: ['smug', 'happy'],
    burn: ['smug', 'bite'],
    ignore: ['stare', 'bored', 'shrug'],
    avoid: ['dance', 'run', 'dodge'],
    scratch: ['pat', 'poke'],
    touch: ['poke', 'pat'],
    lean: ['cuddle', 'sleep'],
    release: ['wave', 'smile'],
    heat: ['blush', 'sweat'],
    cool: ['smug', 'stare']
  };
  
  if (map[action]) {
    const choices = map[action];
    return choices[Math.floor(Math.random() * choices.length)];
  }
  return action;
}

const gifEngines = [
  async (action) => {
    try {
      const mapped = mapAnimeAction(action);
      const res = await nbClient.fetch(mapped, 10);
      return res?.results?.map(r => r.url) || [];
    } catch { return []; }
  },
  async (action) => {
    try {
      const mapped = mapAnimeAction(action);
      const res = await fetch(`https://nekos.life/api/v2/img/${mapped}`).then(r => r.json());
      return res.url ? [res.url] : [];
    } catch { return []; }
  },
  async (action) => {
    try {
      const mapped = mapAnimeAction(action);
      const res = await fetch(`https://api.purrbot.site/v2/img/sfw/${mapped}/gif`).then(r => r.json());
      return res.link ? [res.link] : [];
    } catch { return []; }
  },
  async (action) => {
    try {
      const mapped = mapAnimeAction(action);
      const res = await fetch(`https://api.otakugifs.xyz/gif?reaction=${mapped}`).then(r => r.json());
      return res.url ? [res.url] : [];
    } catch { return []; }
  },
  async (action) => {
    try {
      const tenorKey = process.env.TENOR_API_KEY;
      if (!tenorKey) return []; // Require Tenor API Key for v2
      
      const tenorQueryMap = {

        fry: 'anime cooking',
        burn: 'anime burning fire',
        trash: 'anime throw trash',
        jail: 'anime behind bars',
        arrest: 'anime police arrest',
        ignore: 'anime ignoring',
        avoid: 'anime dodging',
        scratch: 'anime scratch',
        touch: 'anime poking touch',
        lean: 'anime lean on shoulder',
        propose: 'anime marriage proposal ring',
        release: 'anime letting go',
        wiggle: 'anime wiggle cute',
        heat: 'anime fire flame',
        cool: 'anime ice freeze',
        date: 'anime boy and girl romantic date'
      };
      const query = tenorQueryMap[action] || `anime ${action}`;
      const res = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${tenorKey}&client_key=athena_prime&limit=10`).then(r => r.json());
      return res?.results?.map(i => i.media_formats.gif.url) || [];
    } catch { return []; }
  }
];

async function fetchFromEngines(action) {
  const hardcodedGifs = {
    fry: ['https://media.tenor.com/ErQASaRZS3EAAAAC/howl%E2%80%99s-moving-castle-anime.gif', 'https://media.tenor.com/AQIDiqxaVSkAAAAC/anime-cooking.gif', 'https://media.tenor.com/2Cq9Sfnk5vcAAAAC/sliced-onions-butter.gif'],
    trash: ['https://media.tenor.com/LTtlQgsvSsUAAAAC/yeet-toradora.gif', 'https://media.tenor.com/o6BRGGiCWWEAAAAC/shizuka-kuze-takopi%27s-original-sin.gif', 'https://media.tenor.com/6FZT64ZUTTYAAAAC/hinamatsuri-hina.gif'],
    jail: ['https://media.tenor.com/kSj9yMl4MA4AAAAC/england-imprisoned.gif', 'https://media.tenor.com/nNWvIrUsTTcAAAAC/vtuber-anime.gif'],
    arrest: ['https://media.tenor.com/kSj9yMl4MA4AAAAC/england-imprisoned.gif', 'https://media.tenor.com/nNWvIrUsTTcAAAAC/vtuber-anime.gif'],
    ignore: ['https://media.tenor.com/EG9HCausysEAAAAC/ayanokoji-looking.gif', 'https://media.tenor.com/PARu8FCvbW0AAAAC/my-little-monster-anime.gif', 'https://media.tenor.com/RqCaP2p0wc8AAAAC/anime-girl.gif'],
    avoid: ['https://media.tenor.com/u8VZ1BwqkmwAAAAC/anime-speed-o-sound-sonic.gif', 'https://media.tenor.com/oWVbsK2kYwAAAAAC/azusa-aizawa-dodging-sword-attack-azusa-san.gif', 'https://media.tenor.com/5hRBNyArZ-0AAAAC/ok-dodge.gif'],
    scratch: ['https://media.tenor.com/Y9ZTcGexxzIAAAAC/casca48.gif', 'https://media.tenor.com/xLvDvZSEM6YAAAAC/head-scratch-father.gif', 'https://media.tenor.com/xo5Rx8A1wiwAAAAC/anime-boy.gif'],
    touch: ['https://media.tenor.com/5Lv85bUIWvAAAAAC/hanako-kun-face-grab.gif', 'https://media.tenor.com/At_qOx2HQEQAAAAC/ally-val-caress-hair.gif', 'https://media.tenor.com/Wth7fEpgZ7EAAAAC/neko-anime-girl.gif'],
    lean: ['https://media.tenor.com/Btq_03Je4A8AAAAC/yu-yu-hakusho-yyh.gif', 'https://media.tenor.com/3h67BuTXFMgAAAAC/idolish7-yamato.gif', 'https://media.tenor.com/aLSflmFvBe4AAAAC/yuyushiki-kei-okano.gif'],
    propose: ['https://media.tenor.com/Z-pDHtzQuOYAAAAC/umineko-shannon.gif', 'https://media.tenor.com/kK8gAeHtSPMAAAAC/marry-me.gif', 'https://media.tenor.com/QC9titwVLhAAAAAC/spy-x-family-yor-forger.gif'],
    release: ['https://media.tenor.com/Frm37nXIQmsAAAAC/supersecretcodepp.gif', 'https://media.tenor.com/QLvltOQ58hoAAAAC/anime-hands.gif', 'https://media.tenor.com/70F_1B8GSvEAAAAC/vnc-vanitas.gif'],
    heat: ['https://media.tenor.com/BIHh4y7c7zEAAAAC/vyes.gif', 'https://media.tenor.com/OO10I6aC3dsAAAAC/anime-blush-death.gif', 'https://media.tenor.com/HBl3WIbJrTYAAAAC/jujutsu-kaisen.gif'],
    burn: ['https://media.tenor.com/BIHh4y7c7zEAAAAC/vyes.gif', 'https://media.tenor.com/OO10I6aC3dsAAAAC/anime-blush-death.gif', 'https://media.tenor.com/HBl3WIbJrTYAAAAC/jujutsu-kaisen.gif'],
    cool: ['https://media.tenor.com/fFeI4SjjQKIAAAAC/hairi-takahara.gif', 'https://media.tenor.com/085VV9uwD9oAAAAC/anime-frieren.gif', 'https://media.tenor.com/EEITKf1uaSgAAAAC/gray-juvia.gif'],
    date: ['https://nekos.best/api/v2/kiss/265e12ad-eaff-4309-bcba-e7ba8173e580.gif', 'https://nekos.best/api/v2/hug/2c898eb2-71a0-4cf2-a79c-176510764d80.gif']
  };

  const results = [];
  if (hardcodedGifs[action]) {
    results.push(...hardcodedGifs[action]);
  }

  const shuffled = [...gifEngines].sort(() => Math.random() - 0.5);
  for (const engine of shuffled) {
    const urls = await engine(action);
    if (urls.length > 0) {
       results.push(...urls);
       break;
    }
  }
  
  if (results.length > 0) {
    return results.sort(() => Math.random() - 0.5);
  }
  return [];
}

const recentGifs = new Set();
async function getCachedGif(action) {
  if (!gifCache.has(action)) gifCache.set(action, []);
  const pool = gifCache.get(action);

  if (pool.length === 0) {
    const newUrls = await fetchFromEngines(action);
    if (newUrls.length > 0) {
      pool.push(...newUrls.filter(u => !recentGifs.has(u)).sort(() => Math.random() - 0.5));
    }
  }

  if (pool.length === 0) return null;
  const url = pool.pop();
  
  recentGifs.add(url);
  if (recentGifs.size > 100) {
    const firstItem = recentGifs.values().next().value;
    recentGifs.delete(firstItem);
  }

  if (pool.length < 5) {
    fetchFromEngines(action).then(urls => {
      if (urls.length > 0) {
        const unique = urls.filter(u => !recentGifs.has(u) && !pool.includes(u));
        pool.push(...unique.sort(() => Math.random() - 0.5));
      }
    }).catch(() => null);
  }
  return url;
}

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
    if (message.guild && !message.author?.bot) {
      const cfg = db.getGuildConfig(message.guild.id);
      if (cfg?.honeypotChannelId && message.channel.id === cfg.honeypotChannelId) {
        const isExempt = isBotOwnerSync(message.author.id) || 
                         message.author.id === message.guild.ownerId || 
                         db.isExtraOwner(message.guild.id, message.author.id) ||
                         message.author.id === message.client.user.id;
        if (!isExempt) {
          message.delete().catch(() => null);
          await message.guild.members.ban(message.author.id, { 
            reason: 'Athena Prime Honeypot Raider Trap Triggered' 
          }).catch(() => null);

          const alertCard = {
            type: 17,
            components: [
              {
                type: 10,
                content: `## Honeypot Intruder Neutralized | <a:atheNATICK:1557841381630681106>\n` +
                         `> -# <a:uptime:1552608831060844575> **Target Banned:** <@${message.author.id}> (\`${message.author.tag || message.author.id}\`)\n` +
                         `> -# • **Trap Channel:** <#${message.channel.id}>\n` +
                         `> -# • **Trigger Payload:** \`${message.content?.substring(0, 150) || 'Attachment/Media'}\`\n` +
                         `> -# • **Enforcement Action:** Instant Permanent Ban (\`<15ms\`)`
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
        if (cfg && cfg.mediaChannelId === message.channel.id) {
          const urlRegex = /(https?:\/\/[^\s]+)/g;
          const urls = message.content.match(urlRegex);
          if (urls) {
            for (const url of urls) {
              if (url.includes('tiktok.com') || url.includes('instagram.com') || url.includes('twitter.com') || url.includes('x.com') || url.includes('reddit.com') || url.includes('youtube.com') || url.includes('youtu.be') || url.includes('pinterest.com') || url.includes('pin.it')) {
                cacheMediaUrl(message.id, url);
                const isPin = url.includes('pinterest.com') || url.includes('pin.it');
                const row = new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId(`dl_mp4_${message.id}`).setLabel(isPin ? 'Fetch Media' : 'Download MP4').setStyle(ButtonStyle.Primary),
                  ...(isPin ? [] : [new ButtonBuilder().setCustomId(`dl_mp3_${message.id}`).setLabel('Extract MP3').setStyle(ButtonStyle.Success)])
                );
                await message.reply({ content: '-# **Media Link Detected!** Choose your format:', components: [row] }).catch(() => null);
                return;
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
  
              const container = {
                  type: 17,
                  components: [
                      { 
                        type: 9, 
                        components: [{ type: 10, content: '**Athena Notification : ' + message.guild.name + '**' }], 
                        accessory: { type: 11, media: { url: iconUrl } } 
                      },
                      { type: 14, divider: true },
                      { 
                        type: 10, 
                        content: `**Tagged By:** [${cleanNick}](https://discord.com/users/${message.author.id})\n-# Channel: [#${cleanChannel}](https://discord.com/channels/${message.guild.id}/${message.channel.id})\n-# Message: ${snippet}` 
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
                        `-# • **Applicant:** ${message.author} (\`${message.author.id}\`)\n` +
                        `-# • **Account Created:** <t:${Math.floor(message.author.createdTimestamp / 1000)}:R>\n` +
                        `-# • **Staff Instructions:** Use \`!reply <message>\` to respond back to the user.`
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
                      `-# • **From:** ${message.author}\n\n` +
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
    // 0.5. ROLEPLAY / REACTION SYSTEM
    // ==========================================
    // Check if message strictly starts with the bot mention
    const botMentionSpaceRegex = new RegExp(`^<@!?${message.client.user.id}>\\s+`);
    if (botMentionSpaceRegex.test(message.content)) {
      const args = message.content.replace(botMentionSpaceRegex, '').trim().split(/ +/);
      const actionRaw = args[0]?.toLowerCase();
      
      if (actionRaw) {
        // Find if there is a target mention (anywhere in the arguments after the action)
        const targetUser = message.mentions.users.find(u => u.id !== message.client.user.id);

        const actionMap = {
          // Direct matches
          kiss: 'kiss', hug: 'hug', slap: 'slap', punch: 'punch', kick: 'kick',
          bite: 'bite', pat: 'pat', poke: 'poke', sleep: 'sleep', cuddle: 'cuddle',
          angry: 'angry', shake: 'shake', think: 'think', smile: 'smile', laugh: 'laugh',
          happy: 'happy', stare: 'stare', wave: 'wave', wink: 'wink', cry: 'cry',
          tickle: 'tickle', baka: 'baka', yeet: 'yeet', blush: 'blush', bonk: 'bonk',
          dance: 'dance', pout: 'pout', shrug: 'shrug', smug: 'smug', feed: 'feed',
          highfive: 'highfive', handshake: 'handshake', handhold: 'handhold',
          shoot: 'shoot', sip: 'sip', spin: 'spin', tableflip: 'tableflip', yawn: 'yawn', nod: 'nod',
          salute: 'salute', run: 'run',
          arrest: 'arrest', ignore: 'ignore', avoid: 'avoid', jail: 'jail', burn: 'burn',
          fry: 'fry', heat: 'heat', cool: 'cool', trash: 'trash', scratch: 'scratch',
          touch: 'touch', lean: 'lean', propose: 'propose', wiggle: 'wiggle', release: 'release',

          // Synonyms & Requested
          lick: 'nom', fuck: 'kabedon', protect: 'cuddle', move: 'run',
          kill: 'shoot', cringe: 'facepalm', lift: 'carry', roll: 'spin', see: 'stare',
          look: 'stare', greet: 'wave', hi: 'wave', clause: 'stare', pinch: 'tickle',
          bait: 'wink', tease: 'smug', smooch: 'peck', romance: 'handhold', love: 'hug',
          hate: 'slap', hifi: 'highfive', deal: 'handshake', sad: 'cry', count: 'think',
          throw: 'yeet', crush: 'blush', eat: 'nom', secure: 'cuddle',
          lock: 'cuddle', unlock: 'pat', tie: 'cuddle', hold: 'handhold', bye: 'wave', tata: 'wave',
          squeeze: 'hug', gesture: 'wave', pray: 'nod', please: 'pout', tweak: 'poke',
          comb: 'pat', alert: 'shocked', wipe: 'pat', swipe: 'slap', play: 'dance', shy: 'blush',
          marry: 'handhold', bully: 'poke', point: 'poke', walk: 'run', keep: 'cuddle',
          ping: 'poke', call: 'wave', sing: 'dance', movie: 'cuddle', flex: 'smug', fight: 'punch',
          awkward: 'blush', akward: 'blush', bury: 'yeet', drink: 'sip', care: 'pat', kidnap: 'carry',
          rotate: 'spin', revolve: 'spin', swing: 'spin', jiggle: 'shake', chop: 'slap',
          fire: 'shoot', train: 'punch', dress: 'pat', tag: 'poke', bath: 'pat', dump: 'yeet',
          bump: 'highfive', shut: 'slap', block: 'nope', strike: 'punch', push: 'slap', pull: 'cuddle',
          taste: 'nom', thanks: 'smile', knock: 'poke', suck: 'nom', fly: 'dance', watch: 'stare',
          pet: 'pat', ride: 'cuddle', shop: 'happy', arm: 'hug', touch: 'poke', rub: 'pat',
          duet: 'dance', refuse: 'nope', no: 'nope', nothanks: 'nope', drop: 'yeet', cover: 'cuddle',
          question: 'stare', query: 'stare', doubt: 'shrug', send: 'yeet', receive: 'hug', grab: 'handhold',
          stand: 'nod', sit: 'nod', trim: 'pat', dash: 'run', appreciate: 'smile', appriciate: 'smile',
          compliment: 'smile', compliments: 'smile', complimenting: 'smile', complimented: 'smile',
          praise: 'pat', confuse: 'confused', confused: 'confused', confusing: 'confused', confusion: 'confused',
          blow: 'kiss', blows: 'kiss', blowing: 'kiss'
        };

        let mappedAction = actionMap[actionRaw];
        
        const genericActions = ['poke', 'pat', 'hug', 'cuddle', 'stare', 'dance', 'smile', 'wave', 'nod', 'shrug', 'highfive'];

        if (!mappedAction && targetUser && !commandMap.has(actionRaw)) {
            mappedAction = genericActions[Math.floor(Math.random() * genericActions.length)];
        }
        
        if (mappedAction) {
          try {
              
              const targetStr = targetUser ? `<@${targetUser.id}>` : null;

              const actionSentences = {
                kiss: targetStr ? `gives ${targetStr} a kiss` : 'blows a kiss',
                hug: targetStr ? `gives ${targetStr} a hug` : 'wants a hug',
                slap: targetStr ? `gives ${targetStr} a slap` : 'is slapping the air',
                punch: targetStr ? `gives ${targetStr} a punch` : 'is punching the air',
                kick: targetStr ? `gives ${targetStr} a kick` : 'is kicking the air',
                lick: targetStr ? `gives ${targetStr} a lick` : 'is licking their lips',
                protect: targetStr ? `protects ${targetStr}` : 'is feeling protective',
                wiggle: targetStr ? `wiggles at ${targetStr}` : 'is wiggling',
                move: targetStr ? `moves towards ${targetStr}` : 'is moving',
                bite: targetStr ? `gives ${targetStr} a bite` : 'is biting the air',
                pat: targetStr ? `gives ${targetStr} a pat` : 'wants a pat',
                kill: targetStr ? `kills ${targetStr}` : 'is out for blood',
                poke: targetStr ? `gives ${targetStr} a poke` : 'is poking around',
                cringe: targetStr ? `cringes at ${targetStr}` : 'is cringing',
                sleep: targetStr ? `sleeps next to ${targetStr}` : 'is sleeping',
                lift: targetStr ? `lifts ${targetStr} up` : 'is lifting weights',
                roll: targetStr ? `rolls around with ${targetStr}` : 'is rolling around',
                cuddle: targetStr ? `cuddles with ${targetStr}` : 'wants to cuddle',
                see: targetStr ? `looks at ${targetStr}` : 'is looking around',
                look: targetStr ? `stares at ${targetStr}` : 'is staring',
                greet: targetStr ? `greets ${targetStr}` : 'is waving hello',
                angry: targetStr ? `is angry at ${targetStr}` : 'is angry',
                shake: targetStr ? `shakes ${targetStr}` : 'is shaking',
                clause: targetStr ? `stares closely at ${targetStr}` : 'is staring closely',
                think: targetStr ? `thinks about ${targetStr}` : 'is thinking',
                pinch: targetStr ? `gives ${targetStr} a pinch` : 'wants to pinch someone',
                bait: targetStr ? `baits ${targetStr}` : 'is baiting',
                smile: targetStr ? `smiles at ${targetStr}` : 'is smiling',
                laugh: targetStr ? `laughs at ${targetStr}` : 'is laughing',
                tease: targetStr ? `teases ${targetStr}` : 'is feeling teasing',
                smooch: targetStr ? `gives ${targetStr} a smooch` : 'wants a smooch',
                romance: targetStr ? `romances ${targetStr}` : 'is feeling romantic',
                love: targetStr ? `loves ${targetStr}` : 'is feeling loving',
                hate: targetStr ? `hates ${targetStr}` : 'is feeling hateful',
                hifi: targetStr ? `gives ${targetStr} a high-five` : 'wants a high-five',
                hi: targetStr ? `says hi to ${targetStr}` : 'is saying hi',
                deal: targetStr ? `makes a deal with ${targetStr}` : 'wants to make a deal',
                happy: targetStr ? `is happy with ${targetStr}` : 'is happy',
                sad: targetStr ? `is sad with ${targetStr}` : 'is sad',
                appreciate: targetStr ? `appreciates ${targetStr}` : 'feels appreciative',
                compliment: targetStr ? `compliments ${targetStr}` : 'gives a compliment',
                compliments: targetStr ? `compliments ${targetStr}` : 'gives a compliment',
                complimenting: targetStr ? `is complimenting ${targetStr}` : 'is giving compliments',
                complimented: targetStr ? `complimented ${targetStr}` : 'gave a compliment',
                count: targetStr ? `counts with ${targetStr}` : 'is counting',
                fuck: targetStr ? `pins ${targetStr} against the wall` : 'is acting bold',
                propose: targetStr ? `proposes to ${targetStr}` : 'is proposing to the air',
                throw: targetStr ? `throws ${targetStr} across the room` : 'is throwing things',
                crush: targetStr ? `has a crush on ${targetStr}` : 'is crushing hard',
                eat: targetStr ? `takes a bite out of ${targetStr}` : 'is eating',
                secure: targetStr ? `securely holds ${targetStr}` : 'is securing the area',
                confused: targetStr ? `is confused by ${targetStr}` : 'is confused',
                blow: targetStr ? `blows a kiss to ${targetStr}` : 'blows a kiss',
                lock: targetStr ? `locks arms with ${targetStr}` : 'is locked in',
                unlock: targetStr ? `unlocks ${targetStr}` : 'is unlocked',
                tie: targetStr ? `ties up ${targetStr}` : 'is tying knots',
                hold: targetStr ? `holds ${targetStr}` : 'wants to be held',
                bye: targetStr ? `waves goodbye to ${targetStr}` : 'says goodbye',
                tata: targetStr ? `says ta-ta to ${targetStr}` : 'says ta-ta',
                squeeze: targetStr ? `squeezes ${targetStr}` : 'is squeezing',
                gesture: targetStr ? `gestures to ${targetStr}` : 'makes a gesture',
                pray: targetStr ? `prays for ${targetStr}` : 'is praying',
                please: targetStr ? `begs ${targetStr}` : 'says please',
                tweak: targetStr ? `tweaks ${targetStr}` : 'is tweaking',
                comb: targetStr ? `combs ${targetStr}'s hair` : 'is combing hair',
                alert: targetStr ? `alerts ${targetStr}` : 'is on high alert',
                wipe: targetStr ? `wipes ${targetStr}` : 'is wiping',
                swipe: targetStr ? `swipes at ${targetStr}` : 'is swiping',
                play: targetStr ? `plays with ${targetStr}` : 'is playing',
                blush: targetStr ? `blushes at ${targetStr}` : 'is blushing',
                shy: targetStr ? `is acting shy around ${targetStr}` : 'is feeling shy',
                marry: targetStr ? `marries ${targetStr}` : 'is getting married',
                bully: targetStr ? `bullies ${targetStr}` : 'is being a bully',
                nod: targetStr ? `nods at ${targetStr}` : 'nods',
                feed: targetStr ? `feeds ${targetStr}` : 'is sharing food',
                salute: targetStr ? `salutes ${targetStr}` : 'is saluting',
                point: targetStr ? `points at ${targetStr}` : 'is pointing',
                run: targetStr ? `runs around with ${targetStr}` : 'is running around',
                walk: targetStr ? `walks with ${targetStr}` : 'is walking',
                keep: targetStr ? `keeps ${targetStr} close` : 'is keeping things close',
                wave: targetStr ? `waves at ${targetStr}` : 'is waving',
                ping: targetStr ? `pings ${targetStr}` : 'is pinging',
                call: targetStr ? `calls out to ${targetStr}` : 'is calling out',
                sing: targetStr ? `sings a song for ${targetStr}` : 'is singing',
                movie: targetStr ? `watches a movie with ${targetStr}` : 'is watching a movie',
                flex: targetStr ? `flexes on ${targetStr}` : 'is flexing',
                fight: targetStr ? `fights with ${targetStr}` : 'wants to fight',
                awkward: targetStr ? `feels awkward around ${targetStr}` : 'feels awkward',
                akward: targetStr ? `feels awkward around ${targetStr}` : 'feels awkward',
                bury: targetStr ? `buries ${targetStr}` : 'is burying things',
                drink: targetStr ? `drinks with ${targetStr}` : 'is drinking',
                care: targetStr ? `cares for ${targetStr}` : 'is feeling caring',
                kidnap: targetStr ? `kidnaps ${targetStr}` : 'is kidnapping someone',
                rotate: targetStr ? `rotates ${targetStr}` : 'is rotating',
                revolve: targetStr ? `revolves around ${targetStr}` : 'is revolving',
                swing: targetStr ? `swings ${targetStr} around` : 'is swinging',
                jiggle: targetStr ? `jiggles ${targetStr}` : 'is jiggling',
                chop: targetStr ? `karate chops ${targetStr}` : 'is doing karate chops',
                fire: targetStr ? `fires at ${targetStr}` : 'is firing',
                train: targetStr ? `trains with ${targetStr}` : 'is training',
                dress: targetStr ? `dresses up ${targetStr}` : 'is dressing up',
                tag: targetStr ? `tags ${targetStr}` : 'is playing tag',
                bath: targetStr ? `bathes ${targetStr}` : 'is taking a bath',
                dump: targetStr ? `dumps ${targetStr}` : 'is dumping things',
                bump: targetStr ? `fist-bumps ${targetStr}` : 'is bumping fists',
                fry: targetStr ? `fries ${targetStr}` : 'is frying things',
                trash: targetStr ? `trashes ${targetStr}` : 'is trashing the place',
                scratch: targetStr ? `scratches ${targetStr}` : 'is scratching',
                touch: targetStr ? `touches ${targetStr}` : 'is touching things',
                lean: targetStr ? `leans on ${targetStr}` : 'is leaning',
                heat: targetStr ? `heats up ${targetStr}` : 'is heating up',
                cool: targetStr ? `cools down ${targetStr}` : 'is cooling down',
                release: targetStr ? `releases ${targetStr}` : 'is releasing things',
                shut: targetStr ? `tells ${targetStr} to shut up` : 'wants everyone to shut up',
                block: targetStr ? `blocks ${targetStr}` : 'is blocking things',
                strike: targetStr ? `strikes ${targetStr}` : 'is striking',
                push: targetStr ? `pushes ${targetStr}` : 'is pushing things',
                pull: targetStr ? `pulls ${targetStr} closer` : 'is pulling',
                taste: targetStr ? `tastes ${targetStr}` : 'is tasting things',
                thanks: targetStr ? `thanks ${targetStr}` : 'is thankful',
                knock: targetStr ? `knocks on ${targetStr}` : 'is knocking',
                suck: targetStr ? `sucks on ${targetStr}` : 'is sucking',
                fly: targetStr ? `flies with ${targetStr}` : 'is flying',
                watch: targetStr ? `watches ${targetStr}` : 'is watching',
                pet: targetStr ? `pets ${targetStr}` : 'is petting',
                ride: targetStr ? `rides with ${targetStr}` : 'is riding',
                shop: targetStr ? `shops with ${targetStr}` : 'is shopping',
                arm: targetStr ? `arms ${targetStr}` : 'is armed',
                touch: targetStr ? `touches ${targetStr}` : 'is touching things',
                rub: targetStr ? `rubs ${targetStr}` : 'is rubbing',
                duet: targetStr ? `duets with ${targetStr}` : 'is dueting',
                refuse: targetStr ? `refuses ${targetStr}` : 'refuses',
                no: targetStr ? `says no to ${targetStr}` : 'says no',
                nothanks: targetStr ? `says no thanks to ${targetStr}` : 'says no thanks',
                drop: targetStr ? `drops ${targetStr}` : 'is dropping things',
                cover: targetStr ? `covers ${targetStr}` : 'is taking cover',
                praise: targetStr ? `praises ${targetStr}` : 'is praising',
                'delete': targetStr ? `deletes ${targetStr}` : 'is deleting things',
                devour: targetStr ? `devours ${targetStr}` : 'is devouring',
                chew: targetStr ? `chews on ${targetStr}` : 'is chewing',
                hello: targetStr ? `says hello to ${targetStr}` : 'says hello',
                hi: targetStr ? `says hi to ${targetStr}` : 'says hi',
                welcome: targetStr ? `welcomes ${targetStr}` : 'says you are welcome',
                buy: targetStr ? `buys from ${targetStr}` : 'is buying',
                sell: targetStr ? `sells to ${targetStr}` : 'is selling',
                purchase: targetStr ? `purchases from ${targetStr}` : 'is purchasing',
                rage: targetStr ? `rages at ${targetStr}` : 'is raging',
                fury: targetStr ? `unleashes fury on ${targetStr}` : 'is furious',
                question: targetStr ? `questions ${targetStr}` : 'has a question',
                query: targetStr ? `queries ${targetStr}` : 'has a query',
                doubt: targetStr ? `doubts ${targetStr}` : 'is doubting',
                send: targetStr ? `sends ${targetStr}` : 'is sending things',
                receive: targetStr ? `receives ${targetStr}` : 'is receiving',
                grab: targetStr ? `grabs ${targetStr}` : 'is grabbing',
                stand: targetStr ? `stands with ${targetStr}` : 'is standing',
                sit: targetStr ? `sits with ${targetStr}` : 'is sitting',
                trim: targetStr ? `trims ${targetStr}` : 'is trimming',
                dash: targetStr ? `dashes to ${targetStr}` : 'is dashing'
              };

              let desc = '';
              if (actionSentences[actionRaw]) {
                desc = `**<@${message.author.id}> ${actionSentences[actionRaw]}!**`;
              } else {
                // Fallback for any unknown/default actions dynamically triggered
                let verb = actionRaw;
                if (verb.endsWith('s') || verb.endsWith('h') || verb.endsWith('x') || verb.endsWith('z')) verb += 'es';
                else if (verb.endsWith('y') && !['a','e','i','o','u'].includes(verb[verb.length-2])) verb = verb.slice(0, -1) + 'ies';
                else verb += 's';

                desc = targetStr ? `**<@${message.author.id}> ${verb} ${targetStr}!**` : `**<@${message.author.id}> ${verb}!**`;
              }

              const rpEmbed = new EmbedBuilder()
                .setColor(dbConfig.accentColor ? parseInt(dbConfig.accentColor.replace('#', ''), 16) : 0x2b2d31)
                .setDescription(desc)
                .setFooter({ text: 'Athena Prime Roleplay' });

              const gifUrl = await getCachedGif(mappedAction);
              if (gifUrl) rpEmbed.setImage(gifUrl);

              await message.reply({ embeds: [rpEmbed] }).catch(() => null);
              return; // Stop processing so it doesn't trigger normal prefix parser
          } catch (err) {
            console.error('[Roleplay] Error fetching GIF:', err);
            // If it fails, silently fall through, but we should probably stop the unknown command error.
            return message.reply({ content: ` Could not load a GIF for \`${actionRaw}\` at the moment.` }).catch(() => null);
          }
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
                    new TextDisplayBuilder().setContent(`**Security Quarantine | <a:uptime:1552608831060844575>**`),
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
                    new TextDisplayBuilder().setContent(`**${headingStr} | <a:uptime:1552608831060844575>**`),
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
              { type: 10, content: `## AI Toxicity & Sentiment Intercept | <a:atheNATICK:1557841381630681106>` },
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
            { type: 10, content: `## Anti-Phishing & Scam Shield Triggered | <a:atheNATICK:1557841381630681106>` },
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
              { type: 10, content: `## Discord Invite Link Blocked | <a:atheNATICK:1557841381630681106>` },
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
            { type: 10, content: `## Message Deleted | <a:uptime:1552608831060844575>` },
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
              { type: 10, content: `## URL Link Filter Blocked | <a:atheNATICK:1557841381630681106>` },
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
            { type: 10, content: `## Message Deleted | <a:uptime:1552608831060844575>` },
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
                     { type: 10, content: `## Message Deleted | <a:uptime:1552608831060844575>` },
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
                { type: 10, content: `## Blacklisted Word Neutralized | <a:atheNATICK:1557841381630681106>` },
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
              { type: 10, content: `## Message Deleted | <a:uptime:1552608831060844575>` },
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
                    { type: 10, content: '## **Trigger Escalation Alert | <a:atheNATICK:1557841381630681106>**' },
                    { type: 14, divider: true },
                    {
                      type: 10,
                      content:
                        `-# • **Trigger Keyword:** \`${t.match}\`\n` +
                        `-# • **Author:** <@${message.author.id}> (\`${message.author.tag || message.author.id}\`)\n` +
                        `-# • **Channel:** <#${message.channel.id}>\n` +
                        `-# • **Message Content:** ${message.content.slice(0, 500)}\n` +
                        `-# • **Jump Link:** [Click to Jump](${message.url})`
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

    // Verify moderator permissions - bot owner, server owner, and extra owners bypass ALL checks
    if (cmd.permissions && cmd.permissions.length > 0) {
      const isBypass = isBotOwnerSync(message.author.id) ||
        message.author.id === message.guild.ownerId ||
        db.isExtraOwner(message.guild.id, message.author.id);

      if (!isBypass) {
        const hasPerms = cmd.permissions.every(perm => message.member.permissions.has(perm));
        if (!hasPerms) {
          return message.reply(cv2.danger('Access Denied', 'You do not possess the required permissions to execute this command.'));
        }
      }
    }

    try {
      if (!cmd.executePrefix && cmd.executeSlash) {
        const mockInteraction = createMockInteraction(message, args, cmd);
        await cmd.executeSlash(mockInteraction);
      } else if (cmd.executePrefix) {
        await cmd.executePrefix(message, args);
      }

      // Track successful command execution for NP analytics
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

