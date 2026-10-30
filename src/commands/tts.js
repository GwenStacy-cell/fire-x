import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import {
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  getVoiceConnection
} from '@discordjs/voice';
import fetch from 'node-fetch';
import db from '../database.js';
import cv2 from '../cv2.js';
import { isBotOwnerOrServerOwnerStrict } from '../utils/helpers.js';
import {
  generateVoiceAudio,
  resolveVoice,
  buildVoiceListContainer,
  CELEBRITY_VOICES
} from '../utils/ttsVoiceEngine.js';

// Queue system for guilds: guildId -> { queue: [], player: AudioPlayer, connection: VoiceConnection, isPlaying: boolean, timeout: NodeJS.Timeout }
const ttsSessions = new Map();

async function playNext(guildId) {
  const session = ttsSessions.get(guildId);
  if (!session) return;

  if (session.queue.length === 0) {
    session.isPlaying = false;
    // Set a timeout to disconnect after 60 seconds of inactivity
    session.timeout = setTimeout(() => {
      if (session.connection && session.connection.state.status !== VoiceConnectionStatus.Destroyed) {
        session.connection.destroy();
      }
      ttsSessions.delete(guildId);
    }, 60000);
    return;
  }

  session.isPlaying = true;
  if (session.timeout) {
    clearTimeout(session.timeout);
    session.timeout = null;
  }

  const { text, lang, voice } = session.queue.shift();

  try {
    const buffer = await generateVoiceAudio(text, voice, lang);
    
    // Convert buffer to Readable stream using a simple trick
    const { Readable } = await import('stream');
    const stream = Readable.from(buffer);

    const resource = createAudioResource(stream);
    session.player.play(resource);
  } catch (err) {
    console.error('TTS Playback Error:', err);
    // Skip to next if this one fails
    playNext(guildId);
  }
}

export async function queueTtsMessage(member, text, overrideVoice = null) {
  const voiceChannel = member.voice.channel;
  if (!voiceChannel) return false;

  const guildId = member.guild.id;
  const prefs = db.getTtsPrefs(member.id);
  const activeVoice = overrideVoice || prefs.voice || null;
  
  if (!ttsSessions.has(guildId)) {
    const player = createAudioPlayer();
    
    player.on(AudioPlayerStatus.Idle, () => {
      playNext(guildId);
    });
    
    player.on('error', error => {
      console.error('Audio Player Error:', error);
      playNext(guildId);
    });

    ttsSessions.set(guildId, {
      queue: [],
      player: player,
      connection: null,
      isPlaying: false,
      timeout: null
    });
  }

  const session = ttsSessions.get(guildId);

  // If not connected to this specific channel, connect
  if (!session.connection || session.connection.joinConfig.channelId !== voiceChannel.id) {
    session.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true
    });
    session.connection.subscribe(session.player);
  }

  // Chunk text if it's too long (Google TTS limit is 200 chars)
  const chunks = text.match(/.{1,200}(\s|$)/g) || [text.substring(0, 200)];
  for (const chunk of chunks) {
    if (chunk.trim()) {
      session.queue.push({ text: chunk.trim(), lang: prefs.lang, voice: activeVoice });
    }
  }

  if (!session.isPlaying) {
    playNext(guildId);
  }
  return true;
}

/**
 * Builds the interactive Components V2 Control Center dashboard for TTS.
 */
export function buildTtsControlPanel(member, guild) {
  const prefs = db.getTtsPrefs(member.id);
  const resolved = prefs.voice ? resolveVoice(prefs.voice) : null;
  const userLang = prefs.lang || 'en';

  const memberVc = member.voice?.channel;
  const autoVcId = db.getAutoTtsVc(guild.id);
  const isAutoVcActive = memberVc && autoVcId === memberVc.id;

  const voiceName = resolved ? `**${resolved.name}**` : '**Standard Neutral Delivery**';
  const voiceDesc = resolved ? resolved.description : 'Standard natural speech delivery without acoustic modification';
  const vcDisplay = memberVc ? `<#${memberVc.id}>` : '`Not in a Voice Channel`';
  const autoVcDisplay = isAutoVcActive
    ? '`Active (Reading all VC chat)`'
    : (autoVcId ? `<#${autoVcId}> \`Bound\`` : '`Disabled`');

  const voiceOptions = [
    {
      label: 'Standard Voice (Default)',
      value: 'tts_voice_default',
      description: 'Reset to natural default speech delivery',
      default: !resolved
    },
    ...Object.values(CELEBRITY_VOICES).map(v => ({
      label: v.name,
      value: `tts_voice_${v.id}`,
      description: v.description.slice(0, 50),
      default: resolved?.id === v.id
    }))
  ];

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('tts_select_voice')
      .setPlaceholder('Select a Celebrity or Neural Voice Profile...')
      .addOptions(voiceOptions)
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tts_speak_btn')
      .setLabel('Speak Message')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('tts_autovc_btn')
      .setLabel(isAutoVcActive ? 'Disable Auto-VC' : 'Enable Auto-VC')
      .setStyle(isAutoVcActive ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('tts_stop_btn')
      .setLabel('Stop Playback')
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tts_voices_btn')
      .setLabel('Voice Directory')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('tts_reset_btn')
      .setLabel('Reset Voice')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('tts_close_btn')
      .setLabel('Close')
      .setStyle(ButtonStyle.Secondary)
  );

  const engineStatus = '`ElevenLabs Flash v2.5 AI Engine (Active)`';

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} Athena Voice Studio // TTS Control Center | <a:03_tick_circle:1565665642084827206>\n` +
          `-# Zero-latency celebrity speech synthesis, real-time acoustic DSP transformations, and voice channel broadcasting.\n\n` +
          `> **Current Voice Profile:** ${voiceName}\n` +
          `> **Vocal Characteristics:** *${voiceDesc}*\n` +
          `> **Cloning Engine:** ${engineStatus}\n` +
          `> **Speech Language:** \`${userLang}\`\n` +
          `> **Voice Channel Status:** ${vcDisplay}\n` +
          `> **Auto-TTS VC Mode:** ${autoVcDisplay}\n\n` +
          `### Quick Control Directives:\n` +
          `> -# \`!tts <message>\` — Speak directly in your current voice channel.\n` +
          `> -# \`!tts <voice> <message>\` — Speak with on-the-fly voice (e.g. \`!tts trump We have the best server\`).\n` +
          `> -# \`!tts voice <name>\` — Lock your default voice preference.\n` +
          `> -# \`!tts voices\` — Browse all celebrity and character voices in full detail.\n` +
          `> -# \`!tts stop\` — Immediately halt speech and clear playback queue.`
      },
      { type: 14, divider: true },
      selectRow.toJSON(),
      row1.toJSON(),
      row2.toJSON(),
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# Athena Prime Audio Engine • Sub-120ms Real-Time Voice Synthesis`
      }
    ]
  };

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

/**
 * Handles interactions triggered by TTS Control Center components.
 */
export async function handleTtsInteraction(interaction) {
  if (interaction.replied || interaction.deferred) return;
  const guild = interaction.guild;
  const member = interaction.member;
  if (!guild || !member) return;

  if (interaction.isStringSelectMenu() && interaction.customId === 'tts_select_voice') {
    const selected = interaction.values[0];
    if (selected === 'tts_voice_default') {
      db.updateTtsPrefs(interaction.user.id, { voice: null });
      const updatedPanel = buildTtsControlPanel(member, guild);
      return interaction.update(updatedPanel).catch(() => null);
    }

    const voiceId = selected.replace('tts_voice_', '');
    const resolved = resolveVoice(voiceId);
    if (resolved) {
      db.updateTtsPrefs(interaction.user.id, { voice: resolved.id, lang: resolved.baseLang });
    }
    const updatedPanel = buildTtsControlPanel(member, guild);
    return interaction.update(updatedPanel).catch(() => null);
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'tts_speak_btn') {
      if (!member.voice?.channel) {
        return interaction.reply({
          content: '-# <:cross_red:1533860128015519895> You must be in a Voice Channel to speak.',
          flags: MessageFlags.Ephemeral
        }).catch(() => null);
      }

      const modal = new ModalBuilder()
        .setCustomId('tts_speak_modal')
        .setTitle('Athena TTS Speech Synthesizer');

      const textInput = new TextInputBuilder()
        .setCustomId('tts_speech_text')
        .setLabel('Message to speak in voice channel')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Type what you want Athena to speak...')
        .setMaxLength(800)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(textInput));
      return interaction.showModal(modal).catch(() => null);
    }

    if (interaction.customId === 'tts_autovc_btn') {
      const hasAdmin = member.permissions.has(PermissionFlagsBits.Administrator) || isBotOwnerOrServerOwnerStrict(member.id, guild);
      if (!hasAdmin) {
        return interaction.reply({
          content: '-# <:cross_red:1533860128015519895> Only Administrators can toggle global Auto-TTS for a Voice Channel.',
          flags: MessageFlags.Ephemeral
        }).catch(() => null);
      }

      const currentAutoVc = db.getAutoTtsVc(guild.id);
      const userVc = member.voice?.channelId;

      if (currentAutoVc) {
        db.setAutoTtsVc(guild.id, null);
      } else {
        if (!userVc) {
          return interaction.reply({
            content: '-# <:cross_red:1533860128015519895> You must be inside a Voice Channel to bind Auto-TTS to it.',
            flags: MessageFlags.Ephemeral
          }).catch(() => null);
        }
        db.setAutoTtsVc(guild.id, userVc);
      }

      const updatedPanel = buildTtsControlPanel(member, guild);
      return interaction.update(updatedPanel).catch(() => null);
    }

    if (interaction.customId === 'tts_stop_btn') {
      const session = ttsSessions.get(guild.id);
      if (session) {
        session.queue = [];
        session.player.stop();
      }
      return interaction.reply({
        content: '-# <a:03_tick_circle:1565665642084827206> **TTS Playback Halted** | Queue has been cleared.',
        flags: MessageFlags.Ephemeral
      }).catch(() => null);
    }

    if (interaction.customId === 'tts_voices_btn') {
      const prefix = db.getGuildConfig(guild.id)?.prefix || '!';
      const container = buildVoiceListContainer(prefix);
      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => null);
    }

    if (interaction.customId === 'tts_reset_btn') {
      db.updateTtsPrefs(interaction.user.id, { voice: null });
      const updatedPanel = buildTtsControlPanel(member, guild);
      return interaction.update(updatedPanel).catch(() => null);
    }

    if (interaction.customId === 'tts_close_btn') {
      try {
        await interaction.message.delete();
      } catch {
        await interaction.update({ content: '-# Control Center Closed.', components: [] }).catch(() => null);
      }
      return;
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === 'tts_speak_modal') {
    const text = interaction.fields.getTextInputValue('tts_speech_text');
    if (!member.voice?.channel) {
      return interaction.reply({
        content: '-# <:cross_red:1533860128015519895> You must be in a Voice Channel to speak.',
        flags: MessageFlags.Ephemeral
      }).catch(() => null);
    }

    const prefs = db.getTtsPrefs(member.id);
    const resolved = prefs.voice ? resolveVoice(prefs.voice) : null;
    const voiceTag = resolved ? `**${resolved.name}**` : 'Standard Voice';

    await interaction.reply({
      content: `-# <a:03_tick_circle:1565665642084827206> **Broadcasting to <#${member.voice.channel.id}>** using **${voiceTag}**...`,
      flags: MessageFlags.Ephemeral
    }).catch(() => null);

    await queueTtsMessage(member, text);
  }
}

export const commands = [
  {
    name: 'tts',
    aliases: ['speak', 'say', 'voice', 'ttsvoice', 'ttsvoices', 'voices'],
    description: 'Broadcast spoken text into your voice channel with AI & celebrity voices.',
    category: 'utilities',
    options: [
      {
        name: 'message',
        description: 'Text message to speak in your voice channel',
        type: 3,
        required: false
      },
      {
        name: 'voice',
        description: 'Celebrity or character voice to speak with',
        type: 3,
        required: false
      }
    ],
    async executePrefix(message, args) {
      const prefix = db.getGuildConfig(message.guild.id)?.prefix || '!';
      const cleanContent = message.content.trim();
      const firstWord = cleanContent.startsWith(prefix)
        ? cleanContent.slice(prefix.length).split(/\s+/)[0]?.toLowerCase()
        : '';

      // Direct handling for !ttsvoice / !ttsvoices / !voices
      if (firstWord === 'ttsvoice' || firstWord === 'ttsvoices' || firstWord === 'voices') {
        const voiceArg = args[0]?.toLowerCase();
        if (!voiceArg || voiceArg === 'list' || voiceArg === 'all' || voiceArg === 'help') {
          const container = buildVoiceListContainer(prefix);
          return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (voiceArg === 'default' || voiceArg === 'none' || voiceArg === 'reset') {
          db.updateTtsPrefs(message.author.id, { voice: null });
          return message.reply(cv2.success('TTS Voice Reset | <a:03_tick_circle:1565665642084827206>', 'Your speech voice has been reset to standard default delivery.'));
        }

        const resolved = resolveVoice(voiceArg);
        if (!resolved) {
          return message.reply(cv2.warn('Voice Not Found', `Unknown celebrity voice: \`${voiceArg}\`.\nType \`${prefix}ttsvoice\` to view all available celebrity and character voices!`));
        }

        db.updateTtsPrefs(message.author.id, { voice: resolved.id, lang: resolved.baseLang });
        return message.reply(cv2.success('TTS Voice Updated | <a:03_tick_circle:1565665642084827206>', `Your voice preference has been locked to **${resolved.name}**!\nAll future TTS speech will speak in this voice.`));
      }

      // If no args or interface keyword, open interactive Control Center Dashboard
      if (
        args.length === 0 ||
        args[0]?.toLowerCase() === 'panel' ||
        args[0]?.toLowerCase() === 'menu' ||
        args[0]?.toLowerCase() === 'interface' ||
        args[0]?.toLowerCase() === 'ui' ||
        args[0]?.toLowerCase() === 'control' ||
        args[0]?.toLowerCase() === 'dashboard'
      ) {
        const panel = buildTtsControlPanel(message.member, message.guild);
        await message.reply(panel);
        return;
      }

      const subcommand = args[0]?.toLowerCase();

      if (subcommand === 'voices' || subcommand === 'celebrities' || subcommand === 'listvoices') {
        const container = buildVoiceListContainer(prefix);
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      if (subcommand === 'voice' || subcommand === 'setvoice') {
        const voiceArg = args[1]?.toLowerCase();
        if (!voiceArg) {
          const container = buildVoiceListContainer(prefix);
          return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (voiceArg === 'default' || voiceArg === 'none' || voiceArg === 'reset') {
          db.updateTtsPrefs(message.author.id, { voice: null });
          return message.reply(cv2.success('TTS Voice Reset | <a:03_tick_circle:1565665642084827206>', 'Your speech voice has been reset to standard default delivery.'));
        }

        const resolved = resolveVoice(voiceArg);
        if (!resolved) {
          return message.reply(cv2.warn('Voice Not Found', `Unknown celebrity voice: \`${voiceArg}\`.\nType \`${prefix}ttsvoice\` to explore all available celebrity and character voices!`));
        }

        db.updateTtsPrefs(message.author.id, { voice: resolved.id, lang: resolved.baseLang });
        return message.reply(cv2.success('TTS Voice Updated | <a:03_tick_circle:1565665642084827206>', `Your voice preference has been locked to **${resolved.name}**!\nAll future TTS speech will speak in this voice.`));
      }

      if (subcommand === 'stop') {
        if (!message.member.voice.channel) return message.reply(cv2.warn('Error', 'You must be in a voice channel to stop TTS.'));
        const session = ttsSessions.get(message.guild.id);
        if (session) {
          session.queue = [];
          session.player.stop();
          return message.reply(cv2.success('TTS Stopped | <a:03_tick_circle:1565665642084827206>', 'Cleared the speech queue and halted playback.'));
        }
        return message.reply(cv2.info('TTS', 'Nothing is currently playing.'));
      }

      if (subcommand === 'auto') {
        const target = message.mentions.users.first();
        if (target) {
          const hasAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator) || isBotOwnerOrServerOwnerStrict(message.author.id, message.guild);
          if (!hasAdmin) return message.reply(cv2.danger('Access Denied', 'Only Admins can enable Auto-TTS for other users.'));
          db.addAutoTtsUser(message.guild.id, target.id);
          return message.reply(cv2.success('Auto-TTS Enabled | <a:03_tick_circle:1565665642084827206>', `${target} will now have all their messages read aloud.`));
        } else {
          db.addAutoTtsUser(message.guild.id, message.author.id);
          return message.reply(cv2.success('Auto-TTS Enabled | <a:03_tick_circle:1565665642084827206>', `Your messages will now be read aloud automatically.`));
        }
      }

      if (subcommand === 'unauto') {
        const target = message.mentions.users.first();
        if (target) {
          const hasAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator) || isBotOwnerOrServerOwnerStrict(message.author.id, message.guild);
          if (!hasAdmin) return message.reply(cv2.danger('Access Denied', 'Only Admins can disable Auto-TTS for other users.'));
          db.removeAutoTtsUser(message.guild.id, target.id);
          return message.reply(cv2.success('Auto-TTS Disabled | <a:03_tick_circle:1565665642084827206>', `${target} will no longer have their messages read aloud.`));
        } else {
          db.removeAutoTtsUser(message.guild.id, message.author.id);
          return message.reply(cv2.success('Auto-TTS Disabled | <a:03_tick_circle:1565665642084827206>', `Your messages will no longer be read aloud automatically.`));
        }
      }

      if (subcommand === 'autovc') {
        const hasAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator) || isBotOwnerOrServerOwnerStrict(message.author.id, message.guild);
        if (!hasAdmin) return message.reply(cv2.danger('Access Denied', 'Only Admins can toggle global Auto-TTS for a Voice Channel.'));
        
        const currentVc = db.getAutoTtsVc(message.guild.id);
        const userVc = message.member.voice.channelId;
        
        if (currentVc) {
          db.setAutoTtsVc(message.guild.id, null);
          return message.reply(cv2.success('Auto-TTS VC Disabled | <a:03_tick_circle:1565665642084827206>', `The global Auto-TTS Voice Channel has been disabled.`));
        }
        
        if (!userVc) return message.reply(cv2.warn('Error', 'You must be in a Voice Channel to enable Auto-TTS for it.'));
        
        db.setAutoTtsVc(message.guild.id, userVc);
        return message.reply(cv2.success('Auto-TTS VC Enabled | <a:03_tick_circle:1565665642084827206>', `Anyone who types in chat while inside <#${userVc}> will now have their messages read aloud!`));
      }

      if (subcommand === 'lang') {
        let code = args[1]?.toLowerCase();
        if (!code) return message.reply(cv2.warn('Usage', '`!tts lang <language_code>` (e.g. en, es, fr, ja, uk, au)'));
        
        // Custom accent mappings for English
        if (code === 'uk') code = 'en-GB';
        if (code === 'au') code = 'en-AU';
        if (code === 'us') code = 'en-US';
        if (code === 'in') code = 'en-IN';
        if (code === 'english') code = 'en';

        db.updateTtsPrefs(message.author.id, { lang: code, voice: null });
        return message.reply(cv2.success('TTS Language Set | <a:03_tick_circle:1565665642084827206>', `Your speech language has been updated to \`${code}\`.`));
      }

      // Check for on-the-fly voice shortcut (e.g. !tts trump Hello or !tts mj Shamone)
      const inlineVoice = resolveVoice(args[0]);
      let textToSpeak = '';
      let activeVoiceOverride = null;

      if (inlineVoice && args.length > 1) {
        activeVoiceOverride = inlineVoice.id;
        textToSpeak = args.slice(1).join(' ');
      } else {
        textToSpeak = args.join(' ');
      }

      if (textToSpeak.length > 800) return message.reply(cv2.warn('Error', 'Message is too long. Please keep it under 800 characters.'));
      
      const success = await queueTtsMessage(message.member, textToSpeak, activeVoiceOverride);
      if (!success) {
        return message.reply(cv2.warn('Error', 'You must be in a Voice Channel to use this.'));
      }
      
      message.react('<:emoji_16:1533860111704002665>').catch(() => null);
    },
    async executeSlash(interaction) {
      const msgOpt = interaction.options?.getString?.('message');
      const voiceOpt = interaction.options?.getString?.('voice');

      if (msgOpt) {
        let activeVoiceOverride = voiceOpt ? resolveVoice(voiceOpt)?.id : null;
        const success = await queueTtsMessage(interaction.member, msgOpt, activeVoiceOverride);
        if (!success) {
          return interaction.reply({
            content: '-# <:cross_red:1533860128015519895> You must be in a Voice Channel to use this.',
            flags: MessageFlags.Ephemeral
          });
        }
        return interaction.reply({
          content: `-# <a:03_tick_circle:1565665642084827206> Spoken in your voice channel!`,
          flags: MessageFlags.Ephemeral
        });
      }

      const panel = buildTtsControlPanel(interaction.member, interaction.guild);
      await interaction.reply(panel);
    }
  }
];
