import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ChannelType, 
  PermissionFlagsBits 
} from 'discord.js';
import cv2 from '../cv2.js';
import { 
  getRandomHeadingGlyph, 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  UPTIME_EMOJI, 
  DELETE_BEAT_EMOJI 
} from '../utils/emojis.js';
import {
  listLocalMovies,
  getMoviesDir,
  getLocalIp,
  formatBytes,
  formatSeconds,
  resolveMediaSource,
  downloadMovieToServer,
  startCinemaSession,
  pauseCinemaSession,
  resumeCinemaSession,
  seekCinemaSession,
  forwardCinemaSession,
  rewindCinemaSession,
  toggleLoopCinemaSession,
  stopCinemaSession,
  getCinemaSession,
  createWatchTogetherActivity,
  buildCinemaControlDeck,
  updateSessionControlDeck
} from '../utils/cinemaEngine.js';

/**
 * Parses user input timestamp (e.g., '1:30', '01:25:00', or raw seconds '90')
 */
function parseTimestamp(input) {
  if (!input) return 0;
  const str = String(input).trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  const parts = str.split(':').map(p => parseInt(p, 10) || 0);
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  return 0;
}

export const commands = [
  {
    name: 'cinema',
    aliases: ['movie', 'stream', 'screenshare'],
    description: 'Stream local PC movies or online links (YouTube, Instagram Reels, Twitch, TikTok, Twitter/X) with synchronized surround voice audio and mobile web theater',
    type: 1, // CHAT_INPUT
    options: [
      {
        name: 'play',
        description: 'Stream a movie from host PC, YouTube, Instagram, Twitch, TikTok, or video link',
        type: 1,
        options: [
          {
            name: 'query',
            description: 'Movie number from list, YouTube/Instagram/Twitch link, or direct video URL',
            type: 3, // STRING
            required: false
          }
        ]
      },
      {
        name: 'list',
        description: 'View all downloaded movie and video files stored on the host PC',
        type: 1
      },
      {
        name: 'pause',
        description: 'Pause the current cinema stream in voice and web theater',
        type: 1
      },
      {
        name: 'resume',
        description: 'Resume the current cinema stream in voice and web theater',
        type: 1
      },
      {
        name: 'forward',
        description: 'Fast-forward playback by specified seconds (default 30s)',
        type: 1,
        options: [
          {
            name: 'seconds',
            description: 'Seconds to skip forward',
            type: 4, // INTEGER
            required: false
          }
        ]
      },
      {
        name: 'rewind',
        description: 'Rewind playback by specified seconds (default 30s)',
        type: 1,
        options: [
          {
            name: 'seconds',
            description: 'Seconds to rewind',
            type: 4, // INTEGER
            required: false
          }
        ]
      },
      {
        name: 'seek',
        description: 'Jump to a specific timestamp in the movie (e.g. 15:30 or 1:12:00)',
        type: 1,
        options: [
          {
            name: 'timestamp',
            description: 'Target timestamp (MM:SS or HH:MM:SS) or seconds',
            type: 3, // STRING
            required: true
          }
        ]
      },
      {
        name: 'loop',
        description: 'Toggle continuous loop for the current movie',
        type: 1
      },
      {
        name: 'stop',
        description: 'Stop the movie stream, disconnect from voice, and close the session',
        type: 1
      },
      {
        name: 'party',
        description: 'Generate an official Discord Watch Together activity invite for your voice channel',
        type: 1
      },
      {
        name: 'folder',
        description: 'Show host PC movie directory and file transfer instructions',
        type: 1
      },
      {
        name: 'download',
        description: 'Download an online movie directly onto the bot server library',
        type: 1,
        options: [
          {
            name: 'url',
            description: 'Online movie URL, YouTube link, direct MP4 link, etc.',
            type: 3,
            required: true
          },
          {
            name: 'name',
            description: 'Custom filename for the movie (optional)',
            type: 3,
            required: false
          }
        ]
      }
    ],

    async executeSlash(interaction) {
      const subcommand = interaction.options.getSubcommand();
      const guild = interaction.guild;
      const member = interaction.member;

      if (subcommand === 'download') {
        const url = interaction.options.getString('url');
        const customName = interaction.options.getString('name');
        await interaction.reply({ content: `-# <a:loading:1542155051286396938> **Downloading movie directly onto server storage...**` });
        try {
          const res = await downloadMovieToServer(url, customName, (msg) => interaction.editReply({ content: `-# <a:loading:1542155051286396938> **${msg}**` }));
          return interaction.editReply(cv2.success(
            `Movie Saved to Server | ${TICK_EMOJI}`,
            `Movie **${res.name}** (\`${res.sizeFormatted}\`) has been downloaded directly into your hosting server's \`movies/\` library!\n\n` +
            `${BULLET_EMOJI} You can now stream it anytime with \`/cinema play query:${res.name}\` or \`!movie play ${res.name}\` without internet buffering!`
          ));
        } catch (err) {
          return interaction.editReply(cv2.error(`Download Failed | ${WRONG_EMOJI}`, `Failed to download movie onto server: \`${err.message}\``));
        }
      }

      if (subcommand === 'list') {
        const movies = listLocalMovies();
        if (movies.length === 0) {
          return interaction.reply(cv2.warn(
            `No Movies Found | ${WARN_EMOJI}`,
            `No video files were detected in the host \`movies/\` folder.\n\n` +
            `${BULLET_EMOJI} **Folder Location:** \`${getMoviesDir()}\`\n` +
            `${BULLET_EMOJI} **Supported Formats:** \`.mp4\`, \`.mkv\`, \`.webm\`, \`.avi\`, \`.mov\`, \`.flv\`, \`.m4v\`\n` +
            `${BULLET_EMOJI} Drop your movie files into that folder on the PC and run \`/cinema list\` again!`
          ));
        }

        const lines = movies.map((m, i) => 
          `${BULLET_EMOJI} **#${i + 1}** \`${m.name}\` — \`${m.sizeFormatted}\` (\`${m.ext}\`)`
        ).join('\n');

        return interaction.reply(cv2.panel(
          `Local Movie Library | ${TICK_EMOJI}`,
          `Found **${movies.length}** downloaded movie(s) ready to stream:\n\n${lines}\n\n` +
          `Use \`/cinema play <number>\` or \`!movie play <number>\` to start streaming!`
        ));
      }

      if (subcommand === 'folder') {
        const dir = getMoviesDir();
        const baseHost = getLocalIp();
        return interaction.reply(cv2.panel(
          `Athena Cinema Storage Matrix | ${TICK_EMOJI}`,
          `**Host Storage Directory:**\n\`${dir}\`\n\n` +
          `${BULLET_EMOJI} **Local Network Stream Host:** \`${baseHost}\`\n` +
          `${BULLET_EMOJI} **How to stream movies not on your phone:**\n` +
          `1. Copy or download your movie files on this PC into the directory above.\n` +
          `2. Join any Discord Voice Channel on your phone or PC.\n` +
          `3. Run \`/cinema play <number>\` to stream the surround audio into voice.\n` +
          `4. Click the **Watch Video Screen** button to open the zero-latency theater on your phone!`
        ));
      }

      if (subcommand === 'party') {
        const voiceChannel = member.voice?.channel;
        if (!voiceChannel) {
          return interaction.reply(cv2.warn(
            `Voice Channel Required | ${WARN_EMOJI}`,
            `You must be connected to a voice channel to launch an embedded Watch Together party!`
          ));
        }

        const inviteUrl = await createWatchTogetherActivity(voiceChannel);
        if (!inviteUrl) {
          return interaction.reply(cv2.error(
            `Party Generation Failed | ${WRONG_EMOJI}`,
            `Could not generate Watch Together party invite. Please verify bot permissions in <#${voiceChannel.id}>.`
          ));
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Join Watch Together Party')
            .setStyle(ButtonStyle.Link)
            .setURL(inviteUrl)
        );

        return interaction.reply({
          ...cv2.success(
            `Watch Together Launched | ${TICK_EMOJI}`,
            `Official Discord Watch Together party created for <#${voiceChannel.id}>!\nClick below to launch:`
          ),
          components: [row]
        });
      }

      if (subcommand === 'play') {
        const query = interaction.options.getString('query');
        return handlePlayCinema({
          guild,
          member,
          channel: interaction.channel,
          query,
          interaction
        });
      }

      if (subcommand === 'pause') {
        const res = pauseCinemaSession(guild.id);
        if (!res) return interaction.reply(cv2.warn(`No Active Session | ${WARN_EMOJI}`, 'No active cinema session is streaming in this server.'));
        const session = getCinemaSession(guild.id);
        await updateSessionControlDeck(session);
        return interaction.reply(cv2.success(`Playback Paused | ${TICK_EMOJI}`, `Cinema stream paused. Use \`/cinema resume\` or the deck button to continue.`));
      }

      if (subcommand === 'resume') {
        const res = resumeCinemaSession(guild.id);
        if (!res) return interaction.reply(cv2.warn(`No Active Session | ${WARN_EMOJI}`, 'No active cinema session is streaming in this server.'));
        const session = getCinemaSession(guild.id);
        await updateSessionControlDeck(session);
        return interaction.reply(cv2.success(`Playback Resumed | ${TICK_EMOJI}`, `Cinema stream resumed.`));
      }

      if (subcommand === 'forward') {
        const secs = interaction.options.getInteger('seconds') || 30;
        const res = forwardCinemaSession(guild.id, secs);
        if (!res) return interaction.reply(cv2.warn(`No Active Session | ${WARN_EMOJI}`, 'No active cinema session is streaming in this server.'));
        const session = getCinemaSession(guild.id);
        await updateSessionControlDeck(session);
        return interaction.reply(cv2.success(`Fast-Forwarded | ${TICK_EMOJI}`, `Skipped forward by **+${secs}s**.`));
      }

      if (subcommand === 'rewind') {
        const secs = interaction.options.getInteger('seconds') || 30;
        const res = rewindCinemaSession(guild.id, secs);
        if (!res) return interaction.reply(cv2.warn(`No Active Session | ${WARN_EMOJI}`, 'No active cinema session is streaming in this server.'));
        const session = getCinemaSession(guild.id);
        await updateSessionControlDeck(session);
        return interaction.reply(cv2.success(`Rewound | ${TICK_EMOJI}`, `Rewound by **-${secs}s**.`));
      }

      if (subcommand === 'seek') {
        const ts = interaction.options.getString('timestamp');
        const secs = parseTimestamp(ts);
        const res = seekCinemaSession(guild.id, secs);
        if (!res) return interaction.reply(cv2.warn(`No Active Session | ${WARN_EMOJI}`, 'No active cinema session is streaming in this server.'));
        const session = getCinemaSession(guild.id);
        await updateSessionControlDeck(session);
        return interaction.reply(cv2.success(`Seek Complete | ${TICK_EMOJI}`, `Jumped to timestamp **\`${formatSeconds(secs)}\`**.`));
      }

      if (subcommand === 'loop') {
        const isLoop = toggleLoopCinemaSession(guild.id);
        const session = getCinemaSession(guild.id);
        if (!session) return interaction.reply(cv2.warn(`No Active Session | ${WARN_EMOJI}`, 'No active cinema session is streaming in this server.'));
        await updateSessionControlDeck(session);
        return interaction.reply(cv2.success(`Loop Toggled | ${TICK_EMOJI}`, `Movie loop is now **${isLoop ? 'ENABLED' : 'DISABLED'}**.`));
      }

      if (subcommand === 'stop') {
        const session = getCinemaSession(guild.id);
        if (!session) return interaction.reply(cv2.warn(`No Active Session | ${WARN_EMOJI}`, 'No active cinema session is streaming in this server.'));
        stopCinemaSession(guild.id);
        return interaction.reply(cv2.success(`Session Ended | ${TICK_EMOJI}`, `Movie stream stopped and bot disconnected from voice channel.`));
      }
    },

    async execute(message, args) {
      const guild = message.guild;
      const member = message.member;
      const sub = (args[0] || '').toLowerCase();

      if (!sub || sub === 'help') {
        const dir = getMoviesDir();
        return message.reply(cv2.panel(
          `Athena Cinema Streamer Suite | ${TICK_EMOJI}`,
          `Stream local downloaded PC movies or online streams (**YouTube**, **Instagram Reels**, **Twitch**, **TikTok**, **Twitter/X**) with synchronized surround audio in voice and interactive mobile web screen!\n\n` +
          `${BULLET_EMOJI} \`!movie play <number | link>\` — Stream movie or YouTube/IG/Twitch/TikTok link\n` +
          `${BULLET_EMOJI} \`!movie download <url> [name]\` — Download online movie directly to server storage\n` +
          `${BULLET_EMOJI} \`!movie list\` — List all downloaded movies in \`${dir}\`\n` +
          `${BULLET_EMOJI} \`!movie pause\` / \`!movie resume\` — Toggle playback\n` +
          `${BULLET_EMOJI} \`!movie forward [secs]\` / \`!movie rewind [secs]\` — Seek delta\n` +
          `${BULLET_EMOJI} \`!movie seek <MM:SS>\` — Jump to specific timestamp\n` +
          `${BULLET_EMOJI} \`!movie loop\` — Toggle continuous movie loop\n` +
          `${BULLET_EMOJI} \`!movie party\` — Launch official Discord Watch Together party\n` +
          `${BULLET_EMOJI} \`!movie folder\` — Show storage directory & instructions\n` +
          `${BULLET_EMOJI} \`!movie stop\` — End session & disconnect voice`
        ));
      }

      if (sub === 'list') {
        const movies = listLocalMovies();
        if (movies.length === 0) {
          return message.reply(cv2.warn(
            `No Movies Found | ${WARN_EMOJI}`,
            `No video files were detected in host \`movies/\` folder.\n\n` +
            `${BULLET_EMOJI} **Folder Location:** \`${getMoviesDir()}\`\n` +
            `${BULLET_EMOJI} **Supported Formats:** \`.mp4\`, \`.mkv\`, \`.webm\`, \`.avi\`, \`.mov\`, \`.flv\`, \`.m4v\`\n` +
            `Drop movie files into that folder and run \`!movie list\` again!`
          ));
        }

        const lines = movies.map((m, i) => 
          `${BULLET_EMOJI} **#${i + 1}** \`${m.name}\` — \`${m.sizeFormatted}\` (\`${m.ext}\`)`
        ).join('\n');

        return message.reply(cv2.panel(
          `Local Movie Library | ${TICK_EMOJI}`,
          `Found **${movies.length}** downloaded movie(s) ready to stream:\n\n${lines}\n\n` +
          `Use \`!movie play <number>\` to start streaming!`
        ));
      }

      if (sub === 'folder') {
        const dir = getMoviesDir();
        const baseHost = getLocalIp();
        return message.reply(cv2.panel(
          `Athena Cinema Storage Matrix | ${TICK_EMOJI}`,
          `**Host Storage Directory:**\n\`${dir}\`\n\n` +
          `${BULLET_EMOJI} **Local Network Stream Host:** \`${baseHost}\`\n` +
          `${BULLET_EMOJI} **How to stream movies not on your phone:**\n` +
          `1. Copy or download your movie files on this PC into the directory above.\n` +
          `2. Join any Discord Voice Channel on your phone or PC.\n` +
          `3. Run \`!movie play <number>\` to stream the surround audio into voice.\n` +
          `4. Click the **Watch Video Screen** button to open the zero-latency theater on your phone!`
        ));
      }

      if (sub === 'party' || sub === 'together') {
        const voiceChannel = member.voice?.channel;
        if (!voiceChannel) {
          return message.reply(cv2.warn(
            `Voice Channel Required | ${WARN_EMOJI}`,
            `You must be connected to a voice channel to launch an embedded Watch Together party!`
          ));
        }

        const inviteUrl = await createWatchTogetherActivity(voiceChannel);
        if (!inviteUrl) {
          return message.reply(cv2.error(
            `Party Generation Failed | ${WRONG_EMOJI}`,
            `Could not generate Watch Together party invite. Please verify bot permissions in <#${voiceChannel.id}>.`
          ));
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Join Watch Together Party')
            .setStyle(ButtonStyle.Link)
            .setURL(inviteUrl)
        );

        return message.reply({
          ...cv2.success(
            `Watch Together Launched | ${TICK_EMOJI}`,
            `Official Discord Watch Together party created for <#${voiceChannel.id}>!\nClick below to launch:`
          ),
          components: [row]
        });
      }

      if (sub === 'pause') {
        const res = pauseCinemaSession(guild.id);
        if (!res) return message.reply(cv2.warn(`No Active Session | ${WARN_EMOJI}`, 'No active cinema session is streaming in this server.'));
        const session = getCinemaSession(guild.id);
        await updateSessionControlDeck(session);
        return message.reply(cv2.success(`Playback Paused | ${TICK_EMOJI}`, `Cinema stream paused. Use \`!movie resume\` or the deck button to continue.`));
      }

      if (sub === 'resume') {
        const res = resumeCinemaSession(guild.id);
        if (!res) return message.reply(cv2.warn(`No Active Session | ${WARN_EMOJI}`, 'No active cinema session is streaming in this server.'));
        const session = getCinemaSession(guild.id);
        await updateSessionControlDeck(session);
        return message.reply(cv2.success(`Playback Resumed | ${TICK_EMOJI}`, `Cinema stream resumed.`));
      }

      if (sub === 'forward' || sub === 'ff') {
        const secs = parseInt(args[1], 10) || 30;
        const res = forwardCinemaSession(guild.id, secs);
        if (!res) return message.reply(cv2.warn(`No Active Session | ${WARN_EMOJI}`, 'No active cinema session is streaming in this server.'));
        const session = getCinemaSession(guild.id);
        await updateSessionControlDeck(session);
        return message.reply(cv2.success(`Fast-Forwarded | ${TICK_EMOJI}`, `Skipped forward by **+${secs}s**.`));
      }

      if (sub === 'rewind' || sub === 'rw') {
        const secs = parseInt(args[1], 10) || 30;
        const res = rewindCinemaSession(guild.id, secs);
        if (!res) return message.reply(cv2.warn(`No Active Session | ${WARN_EMOJI}`, 'No active cinema session is streaming in this server.'));
        const session = getCinemaSession(guild.id);
        await updateSessionControlDeck(session);
        return message.reply(cv2.success(`Rewound | ${TICK_EMOJI}`, `Rewound by **-${secs}s**.`));
      }

      if (sub === 'seek') {
        const ts = args[1];
        if (!ts) return message.reply(cv2.warn(`Timestamp Required | ${WARN_EMOJI}`, 'Please provide a timestamp, e.g. `!movie seek 12:45` or `!movie seek 300`.'));
        const secs = parseTimestamp(ts);
        const res = seekCinemaSession(guild.id, secs);
        if (!res) return message.reply(cv2.warn(`No Active Session | ${WARN_EMOJI}`, 'No active cinema session is streaming in this server.'));
        const session = getCinemaSession(guild.id);
        await updateSessionControlDeck(session);
        return message.reply(cv2.success(`Seek Complete | ${TICK_EMOJI}`, `Jumped to timestamp **\`${formatSeconds(secs)}\`**.`));
      }

      if (sub === 'loop') {
        const isLoop = toggleLoopCinemaSession(guild.id);
        const session = getCinemaSession(guild.id);
        if (!session) return message.reply(cv2.warn(`No Active Session | ${WARN_EMOJI}`, 'No active cinema session is streaming in this server.'));
        await updateSessionControlDeck(session);
        return message.reply(cv2.success(`Loop Toggled | ${TICK_EMOJI}`, `Movie loop is now **${isLoop ? 'ENABLED' : 'DISABLED'}**.`));
      }

      if (sub === 'stop') {
        const session = getCinemaSession(guild.id);
        if (!session) return message.reply(cv2.warn(`No Active Session | ${WARN_EMOJI}`, 'No active cinema session is streaming in this server.'));
        stopCinemaSession(guild.id);
        return message.reply(cv2.success(`Session Ended | ${TICK_EMOJI}`, `Movie stream stopped and bot disconnected from voice channel.`));
      }

      if (sub === 'download' || sub === 'save') {
        const url = args[1];
        const customName = args.slice(2).join(' ') || null;
        if (!url) return message.reply(cv2.warn(`URL Required | ${WARN_EMOJI}`, 'Please provide a movie or video URL to download: `!movie download <url> [name]`.'));
        const init = await message.reply({ content: `-# <a:loading:1542155051286396938> **Downloading movie directly onto server storage...**` });
        try {
          const res = await downloadMovieToServer(url, customName, (msg) => init.edit({ content: `-# <a:loading:1542155051286396938> **${msg}**` }));
          return init.edit(cv2.success(
            `Movie Saved to Server | ${TICK_EMOJI}`,
            `Movie **${res.name}** (\`${res.sizeFormatted}\`) has been downloaded directly into your hosting server's \`movies/\` library!\n\n` +
            `${BULLET_EMOJI} You can now stream it anytime with \`!movie play ${res.name}\` without internet buffering!`
          ));
        } catch (err) {
          return init.edit(cv2.error(`Download Failed | ${WRONG_EMOJI}`, `Failed to download movie onto server: \`${err.message}\``));
        }
      }

      if (sub === 'play') {
        const query = args.slice(1).join(' ') || (message.attachments.first() ? message.attachments.first().url : null);
        return handlePlayCinema({
          guild,
          member,
          channel: message.channel,
          query,
          message
        });
      }
    }
  }
];

/**
 * Common handler for starting cinema playback
 */
async function handlePlayCinema({ guild, member, channel, query, interaction = null, message = null }) {
  const voiceChannel = member.voice?.channel;
  if (!voiceChannel) {
    const warnPayload = cv2.warn(
      `Voice Channel Required | ${WARN_EMOJI}`,
      `You must be connected to a voice channel so Athena can stream surround audio!`
    );
    if (interaction) return interaction.reply({ ...warnPayload, flags: 64 });
    return message.reply(warnPayload);
  }

  // 1. Initial loading indicator
  let loadingMsg = null;
  if (interaction) {
    await interaction.reply({
      content: `-# <a:loading:1542155051286396938> **Connecting to media stream...**`,
      flags: 64
    }).catch(() => {});
  } else if (message) {
    loadingMsg = await message.reply({
      content: `-# <a:loading:1542155051286396938> **Connecting to media stream...**`
    }).catch(() => null);
  }

  const updateProgress = async (text) => {
    try {
      if (interaction) {
        await interaction.editReply({ content: `-# <a:loading:1542155051286396938> **${text}**` });
      } else if (loadingMsg) {
        await loadingMsg.edit({ content: `-# <a:loading:1542155051286396938> **${text}**` });
      }
    } catch (e) {}
  };

  try {
    const resolved = await resolveMediaSource(query, updateProgress);
    if (!resolved) {
      const warnPayload = cv2.warn(
        `Media Source Not Found | ${WARN_EMOJI}`,
        `Could not locate media matching \`${query || 'default'}\`.\n\n` +
        `${BULLET_EMOJI} **Local Storage:** Use \`/cinema list\` to view all movies in \`${getMoviesDir()}\`.\n` +
        `${BULLET_EMOJI} **Web Streaming:** Provide a link from **YouTube**, **Instagram Reels**, **Twitch**, **TikTok**, **Twitter/X**, or direct video URL!`
      );
      if (interaction) return interaction.editReply(warnPayload);
      if (loadingMsg) return loadingMsg.edit(warnPayload);
      return channel.send(warnPayload);
    }

    const session = await startCinemaSession({
      guild,
      voiceChannel,
      source: resolved.source,
      title: resolved.title,
      member,
      isLive: resolved.isLive,
      platform: resolved.platform,
      originalUrl: resolved.originalUrl,
      streamUrl: resolved.streamUrl,
      duration: resolved.duration,
      filePath: resolved.filePath
    });

    const deckPayload = buildCinemaControlDeck(session);

    // Delete loading text message so the clean Components V2 deck stands alone
    if (loadingMsg) {
      await loadingMsg.delete().catch(() => {});
    }

    // Post the brand new pristine Components V2 Control Deck message to the channel
    let deckMessage = null;
    try {
      deckMessage = await channel.send(deckPayload);
    } catch (cv2Err) {
      console.warn('[handlePlayCinema CV2 fallback]:', cv2Err.message);
      // Fallback: send standard message without flags 32768
      deckMessage = await channel.send({
        embeds: [{
          title: `Athena Cinema • ${session.title}`,
          description:
            `**Now Playing:** \`${session.title}\`\n` +
            `**Voice Channel:** <#${session.voiceChannelId}>\n` +
            `**Platform:** \`${session.platform || 'Local Library'}\`\n\n` +
            `**Watch Video Screen:**\n[Click here to watch on phone/browser](${getLocalIp()}/cinema/watch/${session.sessionId})`,
          color: 0x5865F2,
          footer: { text: 'Athena Prime Cinema Suite • Surround Voice Audio + Video Screen Sync' }
        }],
        components: deckPayload.components[0]?.components?.filter(c => c.type === 1) || []
      });
    }

    if (deckMessage) {
      session.deckMessage = deckMessage;
    }

    if (interaction) {
      await interaction.editReply({
        content: `-# <a:03_tick_circle:1565665642084827206> **Cinema stream started in <#${voiceChannel.id}>!**`
      }).catch(() => {});
    }
  } catch (err) {
    console.error('[handlePlayCinema Error]:', err);
    const errPayload = cv2.error(
      `Playback Initialization Failed | ${WRONG_EMOJI}`,
      `Failed to initialize cinema stream: \`${err.message}\``
    );
    if (interaction) return interaction.editReply(errPayload);
    if (loadingMsg) return loadingMsg.edit(errPayload);
    return channel.send(errPayload);
  }
}

/**
 * Handles all interactive button clicks from the Cinema Control Deck
 */
export async function handleCinemaButtons(interaction) {
  const { customId, guild, member } = interaction;
  const session = getCinemaSession(guild.id);

  if (!session) {
    return interaction.reply({
      content: `-# ${WARN_EMOJI} **This cinema session has ended or is no longer active.**`,
      flags: 64
    });
  }

  if (customId === 'cinema_play_pause') {
    if (session.isPaused) {
      resumeCinemaSession(guild.id);
    } else {
      pauseCinemaSession(guild.id);
    }
    const deck = buildCinemaControlDeck(session);
    return interaction.update(deck);
  }

  if (customId === 'cinema_rewind_30') {
    rewindCinemaSession(guild.id, 30);
    const deck = buildCinemaControlDeck(session);
    return interaction.update(deck);
  }

  if (customId === 'cinema_rewind_60') {
    rewindCinemaSession(guild.id, 60);
    const deck = buildCinemaControlDeck(session);
    return interaction.update(deck);
  }

  if (customId === 'cinema_forward_30') {
    forwardCinemaSession(guild.id, 30);
    const deck = buildCinemaControlDeck(session);
    return interaction.update(deck);
  }

  if (customId === 'cinema_forward_60') {
    forwardCinemaSession(guild.id, 60);
    const deck = buildCinemaControlDeck(session);
    return interaction.update(deck);
  }

  if (customId === 'cinema_loop') {
    toggleLoopCinemaSession(guild.id);
    const deck = buildCinemaControlDeck(session);
    return interaction.update(deck);
  }

  if (customId === 'cinema_refresh') {
    const deck = buildCinemaControlDeck(session);
    return interaction.update(deck);
  }

  if (customId === 'cinema_stop') {
    stopCinemaSession(guild.id);
    return interaction.update({
      components: [
        {
          type: 17,
          components: [
            { type: 10, content: `# ${getRandomHeadingGlyph()} **Cinema Stream Concluded** | ${TICK_EMOJI}` },
            { type: 14, divider: true },
            { type: 10, content: `${BULLET_EMOJI} **Movie:** \`${session.title}\`\n${BULLET_EMOJI} Playback session was stopped by <@${member.id}>.` },
            { type: 14, divider: true },
            { type: 10, content: '-# **Athena Prime Cinema Suite • Session Closed**' }
          ]
        }
      ],
      flags: 32768
    });
  }

  if (customId === 'cinema_activity') {
    const voiceChannel = guild.channels.cache.get(session.voiceChannelId) || await guild.channels.fetch(session.voiceChannelId).catch(() => null);
    if (!voiceChannel) {
      return interaction.reply({ content: `-# ${WRONG_EMOJI} Could not find voice channel.`, flags: 64 });
    }

    const inviteUrl = await createWatchTogetherActivity(voiceChannel);
    if (!inviteUrl) {
      return interaction.reply({ content: `-# ${WRONG_EMOJI} Failed to create Watch Together party. Check bot permissions.`, flags: 64 });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Launch Watch Together')
        .setStyle(ButtonStyle.Link)
        .setURL(inviteUrl)
    );

    return interaction.reply({
      content: `-# ${TICK_EMOJI} **Watch Together party ready for <#${voiceChannel.id}>!**`,
      components: [row],
      flags: 64
    });
  }
}
