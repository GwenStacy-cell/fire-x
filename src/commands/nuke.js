// src/commands/nuke.js
// Core nuke logic — exported as a plain async function.
// Called by the znuke prefix command in index.js.

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
 * Wipes a Discord guild: webhooks → channels → roles → emojis → members.
 * @param {import('discord.js').Guild} guild    The target guild object.
 * @param {boolean}                   banMembers  Ban instead of kick?
 * @param {string}                    botId     The bot's own user ID (to skip itself).
 * @returns {Promise<string[]>}                 Log lines describing what happened.
 */
export async function nukeServer(guild, banMembers, botId) {
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

  // 5. Members — kick or ban (skip bots and the bot itself)
  {
    let membersFetched = true;
    await guild.members.fetch().catch((err) => {
      console.warn('[nuke] Could not fetch members (missing Server Members Intent?):', err.message);
      membersFetched = false;
    });

    if (membersFetched) {
      const members = guild.members.cache.filter((m) => !m.user.bot && m.id !== botId);
      const action  = banMembers ? 'ban' : 'kick';
      const tasks   = members.map((m) =>
        banMembers
          ? m.ban({ reason: 'Server nuke' }).catch(() => {})
          : m.kick('Server nuke').catch(() => {}),
      );
      const { succeeded, failed } = await runAll(tasks);
      log.push(
        `${banMembers ? '🔨' : '👢'} **Members ${banMembers ? 'Banned' : 'Kicked'}** — ${action}ed \`${succeeded}\`, failed \`${failed}\``,
      );
    } else {
      log.push('⚠️ **Members** — Skipped (Server Members Intent not enabled in Developer Portal).');
    }
  }

  return log;
}
