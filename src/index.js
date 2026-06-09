// src/index.js — Bot entry point
//
// Usage:
//   znuke                    → nuke current server (kick members)
//   znuke ban                → nuke current server (ban members)
//   znuke <server_id>        → nuke remote server  (kick members)
//   znuke <server_id> ban    → nuke remote server  (ban members)

import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Events,
  Partials,
  EmbedBuilder,
} from 'discord.js';
import { nukeServer } from './commands/nuke.js';

// ─── Owner whitelist ───────────────────────────────────────────────────────────
const ALLOWED_IDS = new Set(
  (process.env.OWNER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);

const PREFIX = 'znuke';

// ─── Deduplication guard ───────────────────────────────────────────────────────
// Prevents double-responses if multiple bot processes run simultaneously.
const handledMessages = new Set();

// ─── Client ───────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

// ─── Global error guard — never let an unhandled error crash the process ───────
client.on('error', (err) => console.error('[client error]', err.message));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err?.message ?? err));

// ─── Helper: send a message safely (channel may be deleted after nuke) ─────────
/**
 * Tries to send `payload` to `channel`.
 * If that fails (channel deleted), falls back to DMing `user`.
 */
async function safeSend(channel, user, payload) {
  try {
    await channel.send(payload);
  } catch {
    // Channel is gone (nuked) — DM the user instead
    try {
      const dm = await user.createDM();
      await dm.send(payload);
    } catch (dmErr) {
      console.warn('[safeSend] Could not DM user either:', dmErr.message);
    }
  }
}

// ─── Ready ────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, (c) => {
  console.log(`\n✅  Logged in as ${c.user.tag}`);
  console.log(`📡  Watching ${c.guilds.cache.size} guild(s)`);
  console.log(`☢️   znuke command is active`);
  console.log(`👑  Authorised users: ${[...ALLOWED_IDS].join(', ') || 'NONE SET'}\n`);
});

// ─── Message handler ──────────────────────────────────────────────────────────
client.on(Events.MessageCreate, async (message) => {
  // Ignore bots
  if (message.author.bot) return;

  const content = message.content.trim();

  // Must start with "znuke" (case-insensitive)
  if (!content.toLowerCase().startsWith(PREFIX)) return;

  // ── Deduplication: skip if already being handled ──────────────────────────
  if (handledMessages.has(message.id)) return;
  handledMessages.add(message.id);
  setTimeout(() => handledMessages.delete(message.id), 60_000);

  // ── Authorisation check ───────────────────────────────────────────────────
  if (!ALLOWED_IDS.has(message.author.id)) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff3c3c)
          .setTitle('🚫 Access Denied')
          .setDescription('You are **not authorised** to use this command.')
          .setTimestamp(),
      ],
    }).catch(() => {});
  }

  // ── Parse arguments ───────────────────────────────────────────────────────
  const args       = content.slice(PREFIX.length).trim().split(/\s+/).filter(Boolean);
  const banMembers = args.some((a) => a.toLowerCase() === 'ban');
  const serverIdArg = args.find((a) => a.toLowerCase() !== 'ban');
  const targetId   = serverIdArg ?? message.guild?.id;

  if (!targetId) {
    return message.reply(
      '❌ Provide a server ID when using this in DMs.\n`znuke <server_id>` or `znuke <server_id> ban`',
    ).catch(() => {});
  }

  // ── Fetch target guild ────────────────────────────────────────────────────
  let targetGuild;
  try {
    targetGuild = await client.guilds.fetch(targetId);
  } catch {
    return message.reply(
      `❌ Cannot reach server \`${targetId}\`.\nThe bot must be a member of that server.`,
    ).catch(() => {});
  }

  const isRemote = targetId !== message.guild?.id;

  // ── Snapshot the channel & user BEFORE nuking (they may be deleted) ───────
  const reportChannel = message.channel;
  const invoker       = message.author;

  // ── Confirmation prompt ───────────────────────────────────────────────────
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff3c3c)
        .setTitle('⚠️ Confirm Nuke')
        .setDescription(
          [
            `**Target:** ${targetGuild.name} (\`${targetGuild.id}\`)`,
            `**Action on members:** ${banMembers ? '🔨 Ban' : '👢 Kick'}`,
            isRemote ? '> 🌐 **Remote nuke**' : '> 🏠 **Local nuke**',
            '',
            'Type **`confirm`** within 30 seconds to proceed.',
          ].join('\n'),
        )
        .setTimestamp(),
    ],
  }).catch(() => {});

  // ── Wait for "confirm" ────────────────────────────────────────────────────
  const filter = (m) =>
    m.author.id === invoker.id && m.content.toLowerCase() === 'confirm';

  try {
    await message.channel.awaitMessages({ filter, max: 1, time: 30_000, errors: ['time'] });
  } catch {
    return message.channel.send('✅ Nuke cancelled — timed out. No action taken.').catch(() => {});
  }

  // ── Begin nuke ────────────────────────────────────────────────────────────
  await safeSend(reportChannel, invoker, {
    embeds: [
      new EmbedBuilder()
        .setColor(0xff3c3c)
        .setTitle('☢️ Nuke In Progress…')
        .setDescription(`🔴 Wiping **${targetGuild.name}**…`)
        .setTimestamp(),
    ],
  });

  try {
    const log = await nukeServer(targetGuild, banMembers, client.user.id);

    // Report results — falls back to DM if the channel was destroyed
    await safeSend(reportChannel, invoker, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle('💀 Nuke Complete')
          .setDescription(log.join('\n'))
          .setFooter({ text: `${targetGuild.name} (${targetGuild.id})` })
          .setTimestamp(),
      ],
    });
  } catch (err) {
    console.error('[znuke] Unexpected error:', err.message);
    await safeSend(reportChannel, invoker, `❌ Nuke error: \`${err.message}\``);
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.BOT_TOKEN);
