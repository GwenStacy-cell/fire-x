import { attachWiretap } from './src/utils/fastWiretap.js';
import { checkAndInstallDependencies } from './src/autoInstall.js';
checkAndInstallDependencies();
import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';

import { CommandInteraction, MessageComponentInteraction, ModalSubmitInteraction } from 'discord.js';

function patchDeferReply(cls) {
  if (!cls || !cls.prototype || !cls.prototype.deferReply) return;
  const originalDefer = cls.prototype.deferReply;
  cls.prototype.deferReply = async function(options = {}) {
    return await originalDefer.call(this, options);
  };
}

patchDeferReply(CommandInteraction);
patchDeferReply(MessageComponentInteraction);
patchDeferReply(ModalSubmitInteraction);

import dotenv from 'dotenv';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import db from './src/database.js';
import http from 'http';
import { Shoukaku, Connectors } from 'shoukaku';

// Load Environment Variables
dotenv.config();

// Print boot header
console.log(chalk.hex('#FFD700').bold('\n============================================='));
console.log(chalk.hex('#FFD700').bold('🛡️   Athena Prime - Initializing...   🛡️'));
console.log(chalk.greenBright.bold('✨   Railway Auto-Deploy Engine: Online & Ready!   ✨'));
console.log(chalk.hex('#FFD700').bold('=============================================\n'));

const token = process.env.DISCORD_TOKEN;
if (!token || token === 'YOUR_BOT_TOKEN_HERE') {
  console.error(chalk.red.bold('❌ ERROR: Discord token is missing in .env file!'));
  console.error(chalk.yellow('Please configure your bot token inside: ') + chalk.bold('c:\\Users\\hathi\\OneDrive\\Desktop\\new bot\\.env'));
  process.exit(1);
}

// Construct Client with proper Privileged Intents and Partials
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,        // Privileged Intent
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,      // Privileged Intent
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,      // Privileged Intent (for owner status detection)
    GatewayIntentBits.GuildModeration,     // Required for ban/unban events
    GatewayIntentBits.GuildWebhooks,       // Required for webhook events
    GatewayIntentBits.GuildInvites,        // Required for invite tracking
    GatewayIntentBits.GuildEmojisAndStickers, // Required for emoji events
    GatewayIntentBits.GuildMessageReactions, // Required for reaction roles
    GatewayIntentBits.DirectMessages       // Required to receive owner DMs
  ],
  partials: [
    Partials.User,
    Partials.GuildMember,
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ]
});

global.client = client; // Make client globally accessible

// Initialize Shoukaku (Lavalink wrapper)
const Nodes = [];
const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), Nodes);
shoukaku.on('ready', (name) => {
  console.log(`✅ Lavalink node "${name}" is ready!`);
});

shoukaku.on('error', (name, error) => {
  console.error(`❌ Lavalink node "${name}" error:`, error);
});

shoukaku.on('close', (name, code, reason) => {
  console.log(`🔌 Lavalink node "${name}" closed (${code}): ${reason}`);
});

global.client.shoukaku = shoukaku;

process.on('unhandledRejection', (error) => {
  if (error?.message?.includes('Cannot perform IP discovery - socket closed')) return;
  if (error?.code === 10062 || error?.code === 50035 || error?.code === 30013 || error?.message?.includes('Unknown interaction') || error?.message?.includes('Unknown message')) return;
  console.error(chalk.red.bold('Unhandled Promise Rejection:'), error);
});

process.on('uncaughtException', (error) => {
  if (error) {
    const msg = error.message || '';
    const code = error.code || '';
    if (msg.includes('Unexpected server response: 5') || 
        msg.includes('Opening handshake has timed out') || 
        msg.includes('ECONNRESET') || 
        msg.includes('EPROTO') ||
        code === 'ECONNRESET' ||
        code === 'EPROTO' ||
        code === 'UND_ERR_CONNECT_TIMEOUT' ||
        code === 10062 ||
        code === 50035 ||
        msg.includes('Unknown interaction') ||
        msg.includes('Unknown message')) {
      return;
    }
  }
  console.error(chalk.red.bold('Uncaught Exception:'), error);
});

// Import event handlers manually for clean compile and zero runtime FS errors
import { connectToHomeVc } from './src/utils/voice.js';
import { ensureYtDlp } from './src/utils/mediaDownloader.js';
ensureYtDlp().catch(err => console.warn('[Media] yt-dlp pre-warm notice:', err.message));
import readyEvent from './src/events/ready.js';
import interactionCreateEvent from './src/events/interactionCreate.js';
import messageCreateEvent from './src/events/messageCreate.js';
import guildMemberAddEvent from './src/events/guildMemberAdd.js';
import channelDeleteEvent from './src/events/channelDelete.js';
import roleDeleteEvent from './src/events/roleDelete.js';
import guildBanAddEvent from './src/events/guildBanAdd.js';
import guildMemberRemoveEvent from './src/events/guildMemberRemove.js';
import channelCreateEvent from './src/events/channelCreate.js';
import roleCreateEvent from './src/events/roleCreate.js';
import guildUpdateEvent from './src/events/guildUpdate.js';
import guildMemberUpdateEvent from './src/events/guildMemberUpdate.js';
import voiceStateUpdateEvent from './src/events/voiceStateUpdate.js';
import roleUpdateEvent from './src/events/roleUpdate.js';
import guildBanRemoveEvent from './src/events/guildBanRemove.js';
import webhookUpdateEvent from './src/events/webhookUpdate.js';
import emojiCreateEvent from './src/events/emojiCreate.js';
import emojiDeleteEvent from './src/events/emojiDelete.js';
import inviteCreateEvent from './src/events/inviteCreate.js';
import inviteDeleteEvent from './src/events/inviteDelete.js';
import messageDeleteEvent from './src/events/messageDelete.js';
import messageReactionAddEvent from './src/events/messageReactionAdd.js';
import messageReactionRemoveEvent from './src/events/messageReactionRemove.js';
import messageUpdateEvent from './src/events/messageUpdate.js';
import guildCreateEvent from './src/events/guildCreate.js';
import guildAuditLogEntryCreateEvent from './src/events/guildAuditLogEntryCreate.js';
import presenceUpdateEvent from './src/events/presenceUpdate.js';
import { scheduleAutoUnquarantine } from './src/commands/security.js';

const events = [
  readyEvent,
  interactionCreateEvent,
  messageCreateEvent,
  guildMemberAddEvent,
  channelDeleteEvent,
  roleDeleteEvent,
  guildBanAddEvent,
  guildMemberRemoveEvent,
  channelCreateEvent,
  roleCreateEvent,
  guildUpdateEvent,
  guildMemberUpdateEvent,
  voiceStateUpdateEvent,
  roleUpdateEvent,
  guildBanRemoveEvent,
  webhookUpdateEvent,
  emojiCreateEvent,
  emojiDeleteEvent,
  inviteCreateEvent,
  inviteDeleteEvent,
  messageReactionAddEvent,
  messageReactionRemoveEvent,
  messageDeleteEvent,
  messageUpdateEvent,
  guildCreateEvent,
  guildAuditLogEntryCreateEvent
];

// Register Events
console.log(chalk.gray('🔄 Loading event handlers...'));
events.forEach(event => {
  if (event.name === 'guildAuditLogEntryCreate') {
    // We bind the raw event hook instead of standard djs event below
    return;
  }
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
  console.log(chalk.gray(`   ├─ Bound event: `) + chalk.cyan.bold(event.name));
});

// ⚡ RAW GATEWAY INTERCEPTOR ⚡
// Bypasses discord.js cache and managers to achieve 0-latency (light speed) response times
import { handleAuditLogEntry } from './src/utils/antinuke.js';
client.on('raw', async (packet) => {
  if (packet.t === 'GUILD_AUDIT_LOG_ENTRY_CREATE') {
    try {
      const guild = client.guilds.cache.get(packet.d.guild_id);
      if (!guild) return;

      // Map raw API changes to djs format
      const mappedChanges = (packet.d.changes || []).map(c => ({
        key: c.key,
        old: c.old_value,
        new: c.new_value
      }));

      // Manually construct a lightweight entry object for the anti-nuke
      const rawEntry = {
        id: packet.d.id,
        action: packet.d.action_type,
        executorId: packet.d.user_id,
        targetId: packet.d.target_id,
        executor: await client.users.fetch(packet.d.user_id).catch(() => ({ id: packet.d.user_id, bot: false })), // minimal mock if not cached
        changes: mappedChanges,
        createdAt: new Date(),
        reason: packet.d.reason
      };

      await handleAuditLogEntry(guild, rawEntry);
    } catch (e) {
      console.error('[AntiNuke] Raw gateway intercept error:', e);
    }
  }
});
console.log(chalk.gray(`   ├─ Bound event: `) + chalk.yellow.bold('raw (GUILD_AUDIT_LOG_ENTRY_CREATE) ⚡'));

// Optional lightweight web server for hosting health checks (e.g., Railway)
const PORT = process.env.PORT || null;
if (PORT) {
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('🛡️ Athena Prime Bot is actively online and running!');
    res.end();
  }).listen(PORT, () => {
    console.log(chalk.green(`🌐 Health Check Server: Listening on port ${PORT}`));
  });
}

// Authenticate with Discord APIs
console.log(chalk.yellow('\n⏳ Connecting to Discord Gateway...'));
attachWiretap(client);

// =========================================================================
// GLOBAL CV2 INTERCEPTOR (ACCENT BORDERLESS EVERYTHING)
// Transforms all discord.js EmbedBuilder payloads into pure CV2 Type 17 Containers
// =========================================================================
const originalPost = client.rest.post.bind(client.rest);
const originalPatch = client.rest.patch.bind(client.rest);

function pushDivider(comps) {
    if (comps.length > 0 && comps[comps.length - 1].type !== 14) {
      comps.push({ type: 14, divider: true });
    }
  }

  function convertEmbedToCV2(embedData) {
    const comps = [];
    
    if (embedData.author) {
      comps.push({ type: 10, content: `-# **• ${embedData.author.name}**` });
      pushDivider(comps);
    }

    if (embedData.title) {
      comps.push({ type: 10, content: `## **${embedData.title}**` });
      pushDivider(comps);
    }

    if (embedData.description) {
      const lines = embedData.description.split('\n');
      const formatted = lines.map(l => {
        if (!l.trim()) return l;
        const clean = l.replace(/^-#\s*/, '').replace(/\*([^*]+)\*/g, '$1');
        return `-# **${clean}**`;
      }).join('\n');

      if (embedData.thumbnail && embedData.thumbnail.url) {
        comps.push({
          type: 9,
          components: [{ type: 10, content: formatted.trim() || '\u200b' }],
          accessory: {
            type: 11,
            media: { url: embedData.thumbnail.url }
          }
        });
      } else {
        comps.push({ type: 10, content: formatted.trim() || '\u200b' });
      }
      pushDivider(comps);
    } else if (embedData.thumbnail && embedData.thumbnail.url) {
      if (comps.length > 0 && comps[comps.length - 1].type === 10) {
        const last = comps.pop();
        comps.push({
          type: 9,
          components: [last],
          accessory: { type: 11, media: { url: embedData.thumbnail.url } }
        });
        pushDivider(comps);
      }
    }

    if (embedData.fields && embedData.fields.length > 0) {
      let fieldText = '';
      let inlineBuf = [];
      for (const f of embedData.fields) {
        const cleanVal = f.value.replace(/^-#\s*/gm, '').replace(/\*([^*]+)\*/g, '$1');
        if (f.inline) {
          inlineBuf.push(`**${f.name}:** ${cleanVal}`);
        } else {
          if (inlineBuf.length > 0) { fieldText += '-# **' + inlineBuf.join('  ·  ') + '**\n'; inlineBuf = []; }
          fieldText += `\n-# **${f.name}**\n-# **${cleanVal.replace(/\n/g, '\n-# **')}**\n`;
        }
      }
      if (inlineBuf.length > 0) fieldText += '\n-# **' + inlineBuf.join('  ·  ') + '**\n';
      
      if (fieldText.trim()) {
        comps.push({ type: 10, content: fieldText.trim() });
        pushDivider(comps);
      }
    }

    if (embedData.image && embedData.image.url) {
      comps.push({ type: 12, items: [{ media: { url: embedData.image.url } }] });
      pushDivider(comps);
    }

    if (embedData.footer) {
      const footerText = embedData.footer.text.replace(/^-#\s*/, '').replace(/\*([^*]+)\*/g, '$1');
      comps.push({ type: 10, content: `-# **${footerText}**` });
    }

    // Remove any trailing divider at the bottom of the container
    while (comps.length > 0 && comps[comps.length - 1].type === 14) {
      comps.pop();
    }

    // Pure borderless CV2 container (no accent_color)
    const container = { type: 17, components: comps };
    return container;
  }

function isContainer(c) {
    if (!c) return false;
    if (c.type === 17 || c.data?.type === 17) return true;
    if (typeof c.toJSON === 'function') {
      try {
        const j = c.toJSON();
        if (j && j.type === 17) return true;
      } catch {}
    }
    return false;
  }

  function isActionRow(c) {
    if (!c) return false;
    if (c.type === 1 || c.data?.type === 1) return true;
    if (typeof c.toJSON === 'function') {
      try {
        const j = c.toJSON();
        if (j && j.type === 1) return true;
      } catch {}
    }
    return false;
  }

  function toCleanJson(c) {
    if (!c) return c;
    let res = typeof c.toJSON === 'function' ? c.toJSON() : c;
    if (res && res.type === 1 && Array.isArray(res.components)) {
      res.components = res.components.map(item => typeof item.toJSON === 'function' ? item.toJSON() : item);
    }
    return res;
  }

function stripAccentColors(obj) {
  if (!obj || typeof obj !== 'object') return;
  if ('accent_color' in obj) delete obj.accent_color;
  if (obj.data && 'accent_color' in obj.data) delete obj.data.accent_color;
  for (const key of Object.keys(obj)) {
    if (obj[key] && typeof obj[key] === 'object') {
      stripAccentColors(obj[key]);
    }
  }
}

function interceptPayload(body) {
    if (!body) return false;
    const target = body.json?.data || body.json || body.data || body;
    
    if (target._skipCV2 || body._skipCV2) {
      delete target._skipCV2;
      delete body._skipCV2;
      return false;
    }

    // Unconditionally strip all accent borders globally
    stripAccentColors(target);
    stripAccentColors(body);

    // Case 1: Pre-built CV2 container - pull any outside action rows (buttons/menus) INSIDE!
    if (target.components && target.components.some(isContainer)) {
      target.flags = (target.flags || 0) | 32768;
      const containerIdx = target.components.findIndex(isContainer);
      let container = toCleanJson(target.components[containerIdx]);
      if (!container.components) container.components = [];

      const textContent = target.content || body.json?.content || body.content;
      if (textContent) {
        container.components.unshift({ type: 14, divider: true });
        container.components.unshift({ type: 10, content: textContent });
        delete target.content;
        if (body.json) delete body.json.content;
        delete body.content;
      }

      const outsideRows = target.components
        .filter((c, idx) => idx !== containerIdx && isActionRow(c))
        .map(toCleanJson);

      if (outsideRows.length > 0) {
        let footerComp = null;
        if (container.components.length > 0) {
          const lastComp = container.components[container.components.length - 1];
          if (lastComp && lastComp.type === 10 && typeof lastComp.content === 'string' && (lastComp.content.trim().startsWith('-#') || lastComp.content.trim().startsWith('*'))) {
            footerComp = container.components.pop();
            if (container.components.length > 0 && container.components[container.components.length - 1].type === 14) {
              container.components.pop();
            }
          }
        }

        pushDivider(container.components);
        container.components.push(...outsideRows);

        if (footerComp) {
          pushDivider(container.components);
          container.components.push(footerComp);
        }

        target.components = [container, ...target.components.filter((c, idx) => idx !== containerIdx && !isActionRow(c))];
      } else {
        target.components[containerIdx] = container;
      }
      stripAccentColors(target);
      stripAccentColors(body);
      return true;
    }
      
    // Case 2: Embeds being converted into CV2 containers
    if (target.embeds && target.embeds.length > 0) {
      const cv2Containers = target.embeds.map(e => convertEmbedToCV2(e));
      
      const textContent = target.content || body.json?.content || body.content;
      if (textContent) {
         cv2Containers[0].components.unshift({ type: 14, divider: true });
         cv2Containers[0].components.unshift({ type: 10, content: textContent });
         delete target.content;
         if (body.json) delete body.json.content;
         delete body.content;
      }

      // Bring ALL action rows (buttons, select menus) INSIDE the container!
      if (target.components && target.components.length > 0) {
        const cleanRows = target.components.filter(isActionRow).map(toCleanJson);
        if (cleanRows.length > 0) {
          let footerComp = null;
          const comps = cv2Containers[0].components;
          if (comps.length > 0) {
            const last = comps[comps.length - 1];
            if (last && last.type === 10 && typeof last.content === 'string' && (last.content.trim().startsWith('-#') || last.content.trim().startsWith('*'))) {
              footerComp = comps.pop();
              if (comps.length > 0 && comps[comps.length - 1].type === 14) {
                comps.pop();
              }
            }
          }
          pushDivider(comps);
          comps.push(...cleanRows);
          if (footerComp) {
            pushDivider(comps);
            comps.push(footerComp);
          }
        }
      }
      
      target.components = cv2Containers;
      delete target.embeds;
      if (body.json) delete body.json.embeds;
      target.flags = (target.flags || 0) | 32768; // MessageFlags.IsComponentsV2
      stripAccentColors(target);
      stripAccentColors(body);
      return true;
    }

    if (target.components && target.components.some(c => c.type === 9 || c.type === 14 || isContainer(c))) {
      target.flags = (target.flags || 0) | 32768;
    }

    if ((target.flags & 32768) || (body.flags & 32768) || (body.json?.flags & 32768)) {
      delete target.content;
      if (body.json) delete body.json.content;
      delete body.content;
      stripAccentColors(target);
      stripAccentColors(body);
    }

    return false;
}

// REST TOKEN PERMANENT PROTECTION GUARD
// Prevents @discordjs/rest from wiping client.rest.token when any request gets 401
const originalSetToken = client.rest.setToken.bind(client.rest);
client.rest.setToken = function(newToken) {
  if (!newToken) {
    const validToken = token || process.env.DISCORD_TOKEN || client.token;
    if (validToken) {
      return originalSetToken(validToken);
    }
  }
  return originalSetToken(newToken);
};

const originalRequest = client.rest.request.bind(client.rest);
client.rest.request = async function(options) {
  const validToken = token || process.env.DISCORD_TOKEN || client.token;
  if (validToken && options && options.auth !== false) {
    originalSetToken(validToken);
  }
  if (options) {
    if (options.body) interceptPayload(options.body);
    if (options.json) interceptPayload(options.json);
  }
  return originalRequest(options);
};

const originalPut = client.rest.put.bind(client.rest);
client.rest.put = async function(url, options) {
  if (options) {
    if (options.body) interceptPayload(options.body);
    if (options.json) interceptPayload(options.json);
  }
  return originalPut(url, options);
};

client.rest.post = async function(url, options) {
  if (options) {
    if (options.body) interceptPayload(options.body);
    if (options.json) interceptPayload(options.json);
  }
  return originalPost(url, options);
};

client.rest.patch = async function(url, options) {
  if (options) {
    if (options.body) interceptPayload(options.body);
    if (options.json) interceptPayload(options.json);
  }
  return originalPatch(url, options);
};


// GLOBAL PING TRACKER FOR REAL GRAPH DATA
client.pingHistory = [];
setInterval(() => {
  if (client.ws && client.ws.ping > 0) {
    client.pingHistory.push(Math.round(client.ws.ping));
    if (client.pingHistory.length > 10) {
      client.pingHistory.shift();
    }
  }
}, 15000);

client.login(token).catch(err => {
  console.error(chalk.red.bold('\n❌ Connection Failed: Invalid token or network blockage!'));
  console.error(err);
  process.exit(1);
});

import { startYtStatsEngine } from './src/utils/ytStatsEngine.js';
import { startGitWatcher } from './src/utils/gitWatcher.js';
import { checkAndAutoRestore, startCloudBackupScheduler, createCloudBackup } from './src/utils/cloudSync.js';

client.once('clientReady', async () => {
  // 1. Check if fresh host boot and auto-restore database from cloud backup!
  await checkAndAutoRestore(client);

  // 2. Start automated cloud backup scheduler (every 20 minutes)
  startCloudBackupScheduler(client, 20);

  // Start background auto-deploy watcher (checks every 20s)
  startGitWatcher(20000);

  const all = db.getAllQuarantinedUsers();
  let restored = 0;
  for (const record of all) {
    if (!record.expiresAt) continue; // permanent quarantine, skip
    const remaining = record.expiresAt - Date.now();
    if (remaining <= 0) {
      // Already expired while bot was offline — unquarantine now
      try {
        const guild = client.guilds.cache.get(record.guildId);
        if (guild) {
          const member = await guild.members.fetch(record.userId).catch(() => null);
          if (member) {
            const { executeUnquarantine } = await import('./src/commands/security.js');
            await executeUnquarantine(guild, member, guild.members.me);
          } else {
            db.removeQuarantine(record.guildId, record.userId);
          }
        }
      } catch { /* ignore */ }
    } else {
      scheduleAutoUnquarantine(client, record.guildId, record.userId, remaining);
      restored++;
    }
  }
  if (restored > 0) {
    console.log(chalk.cyan(`⏰ Restored ${restored} auto-unquarantine timer(s) from database.`));
  }

  // Restore active unended VC drag sessions from database
  try {
    const { restoreActiveVcDrags } = await import('./src/commands/vcdrag.js');
    await restoreActiveVcDrags(client);
  } catch {}
});

// Graceful Shutdown to ensure DB flushes and cloud backup is taken
async function handleShutdown(signal) {
  console.log(chalk.yellow(`\n[System] Received ${signal}, initiating graceful shutdown...`));
  // Force immediate save if pending
  if (db.needsSave || db.saveTimeout) {
    console.log(chalk.yellow('[System] Flushing database to disk...'));
    clearTimeout(db.saveTimeout);
    db.saveTimeout = null;
    try {
      const data = JSON.stringify(db.cache, null, 2);
      fs.writeFileSync(path.resolve('data', 'db.json'), data, 'utf8');
      console.log(chalk.green('[System] Database saved successfully.'));
    } catch (err) {
      console.error(chalk.red('[System] Error flushing database on shutdown:'), err);
    }
  }

  try {
    console.log(chalk.yellow('[System] Uploading pre-shutdown cloud backup snapshot...'));
    await createCloudBackup(client, `Shutdown / Host Migration (${signal})`);
  } catch {}

  process.exit(0);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));



