import { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus, 
  NoSubscriberBehavior,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
  StreamType
} from '@discordjs/voice';
import { Readable } from 'stream';
import fetch from 'node-fetch';
import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  MessageFlags,
  StringSelectMenuBuilder 
} from 'discord.js';
import db from '../database.js';
import { 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  UPTIME_EMOJI, 
  getRandomHeadingGlyph 
} from './emojis.js';
import { sanitizeCV2Payload } from '../cv2.js';

export const BUILTIN_SFX = {
  'airhorn': { name: 'Air Horn', url: 'https://www.myinstants.com/media/sounds/air-horn-club-sample_1.mp3' },
  'vineboom': { name: 'Vine Boom', url: 'https://www.myinstants.com/media/sounds/vine-boom.mp3' },
  'bruh': { name: 'Bruh Sound', url: 'https://www.myinstants.com/media/sounds/bruh-sound-effect-1.mp3' },
  'fbi': { name: 'FBI Open Up', url: 'https://www.myinstants.com/media/sounds/fbi-open-up_1.mp3' },
  'emotional': { name: 'Emotional Damage', url: 'https://www.myinstants.com/media/sounds/emotional-damage-meme.mp3' },
  'animewow': { name: 'Anime Wow', url: 'https://www.myinstants.com/media/sounds/anime-wow-sound-effect.mp3' },
  'drumroll': { name: 'Drum Roll', url: 'https://www.myinstants.com/media/sounds/drum-roll-sound-effect.mp3' },
  'applause': { name: 'Crowd Applause', url: 'https://www.myinstants.com/media/sounds/applause_sound_effect.mp3' },
  'victory': { name: 'Victory Fanfare', url: 'https://www.myinstants.com/media/sounds/final-fantasy-vii-victory-fanfare-1.mp3' },
  'oof': { name: 'Roblox Oof', url: 'https://www.myinstants.com/media/sounds/roblox-death-sound_1.mp3' },
  'crickets': { name: 'Awkward Crickets', url: 'https://www.myinstants.com/media/sounds/cricket-sound-sound-effect.mp3' },
  'tada': { name: 'Ta-Da Fanfare', url: 'https://www.myinstants.com/media/sounds/tada-sound.mp3' }
};

export const RADIO_STATIONS = {
  'lofi': { name: '24/7 Lo-Fi Chill Beats', url: 'https://streams.ilovemusic.de/iloveradio17.mp3' },
  'synthwave': { name: 'Nightride FM Synthwave', url: 'https://stream.nightride.fm/nightride.mp3' },
  'anime': { name: 'Listen.moe Anime & J-Pop', url: 'https://listen.moe/stream' },
  'chill': { name: 'Chillhop & Ambient Cafe', url: 'https://stream.zeno.fm/f3wvbbqmdg8uv' }
};

export const activeVoiceSessions = new Map(); // guildId -> { connection, player, isRadio, timeout }

export async function playSoundEffect(voiceChannel, soundKeyOrUrl) {
  const guild = voiceChannel.guild;
  let soundObj = BUILTIN_SFX[soundKeyOrUrl.toLowerCase()];
  
  // If not built-in, check custom server sounds
  if (!soundObj) {
    const customList = db.getServerSounds(guild.id);
    const found = customList.find(s => s.name === soundKeyOrUrl.toLowerCase());
    if (found) soundObj = { name: found.name, url: found.url };
  }

  // If direct URL
  if (!soundObj && /^https?:\/\//i.test(soundKeyOrUrl)) {
    soundObj = { name: 'Custom Audio', url: soundKeyOrUrl };
  }

  if (!soundObj) return { success: false, reason: 'Sound effect not found' };

  let session = activeVoiceSessions.get(guild.id);
  let connection = getVoiceConnection(guild.id);

  if (!session || !connection || connection.joinConfig.channelId !== voiceChannel.id) {
    if (connection) {
      try { connection.destroy(); } catch {}
    }

    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false
    });

    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play }
    });

    player.on('error', err => console.warn('[Soundboard Player Notice]', err.message));
    connection.on('error', err => console.warn('[Soundboard Connection Notice]', err.message));

    connection.subscribe(player);
    session = { connection, player, isRadio: false, timeout: null };
    activeVoiceSessions.set(guild.id, session);
  }

  try {
    await entersState(session.connection, VoiceConnectionStatus.Ready, 5_000);
  } catch (err) {
    console.warn('[Soundboard] Voice connection took too long to reach Ready:', err.message);
  }

  if (session.timeout) {
    clearTimeout(session.timeout);
    session.timeout = null;
  }

  session.isRadio = false;

  let resource;
  try {
    const audioRes = await fetch(soundObj.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (audioRes.ok) {
      const arrayBuffer = await audioRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const stream = Readable.from(buffer);
      resource = createAudioResource(stream, { inputType: StreamType.Arbitrary, inlineVolume: true });
    } else {
      resource = createAudioResource(soundObj.url, { inlineVolume: true });
    }
  } catch (err) {
    resource = createAudioResource(soundObj.url, { inlineVolume: true });
  }

  resource.volume?.setVolume(0.85);
  session.player.play(resource);

  // Auto-cleanup after 12 seconds if not switched to a radio stream
  session.timeout = setTimeout(() => {
    try {
      const current = activeVoiceSessions.get(guild.id);
      if (current && !current.isRadio) {
        current.player?.stop();
        current.connection?.destroy();
        activeVoiceSessions.delete(guild.id);
      }
    } catch {}
  }, 12000);

  return { success: true, sound: soundObj };
}

export async function startRadioStream(voiceChannel, stationKey = 'lofi') {
  const guild = voiceChannel.guild;
  const station = RADIO_STATIONS[stationKey.toLowerCase()] || RADIO_STATIONS['lofi'];

  let session = activeVoiceSessions.get(guild.id);
  let connection = getVoiceConnection(guild.id);

  if (!session || !connection || connection.joinConfig.channelId !== voiceChannel.id) {
    if (connection) {
      try { connection.destroy(); } catch {}
    }

    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false
    });

    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play }
    });

    player.on('error', err => console.warn('[Radio Player Notice]', err.message));
    connection.on('error', err => console.warn('[Radio Connection Notice]', err.message));

    connection.subscribe(player);
    session = { connection, player, isRadio: true, stationName: station.name, timeout: null };
    activeVoiceSessions.set(guild.id, session);
  } else {
    session.isRadio = true;
    session.stationName = station.name;
    if (session.timeout) {
      clearTimeout(session.timeout);
      session.timeout = null;
    }
  }

  try {
    await entersState(session.connection, VoiceConnectionStatus.Ready, 5_000);
  } catch (err) {
    console.warn('[Radio] Voice connection took too long to reach Ready:', err.message);
  }

  let resource;
  try {
    const res = await fetch(station.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (res.ok && res.body) {
      const stream = Readable.fromWeb(res.body);
      resource = createAudioResource(stream, { inputType: StreamType.Arbitrary, inlineVolume: true });
    } else {
      resource = createAudioResource(station.url, { inlineVolume: true });
    }
  } catch {
    resource = createAudioResource(station.url, { inlineVolume: true });
  }

  resource.volume?.setVolume(0.65);
  session.player.play(resource);

  return { success: true, station };
}

export function stopVoicePlayback(guildId) {
  const session = activeVoiceSessions.get(guildId);
  if (session) {
    try {
      if (session.timeout) clearTimeout(session.timeout);
      session.player?.stop();
      session.connection?.destroy();
    } catch {}
    activeVoiceSessions.delete(guildId);
    return true;
  }
  return false;
}

export function buildSoundboardPanel(guild) {
  const customSounds = db.getServerSounds(guild.id);
  
  // Row 1: Common Meme Sounds (all colourless Secondary buttons)
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sfx:play:airhorn').setLabel('Air Horn').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sfx:play:vineboom').setLabel('Vine Boom').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sfx:play:bruh').setLabel('Bruh').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sfx:play:emotional').setLabel('Emotional Damage').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sfx:play:animewow').setLabel('Anime Wow').setStyle(ButtonStyle.Secondary)
  );

  // Row 2: Reaction & Fanfares (all colourless Secondary buttons)
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sfx:play:fbi').setLabel('FBI Open Up').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sfx:play:victory').setLabel('Victory Fanfare').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sfx:play:applause').setLabel('Applause').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sfx:play:oof').setLabel('Roblox Oof').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sfx:play:crickets').setLabel('Crickets').setStyle(ButtonStyle.Secondary)
  );

  // Row 3: Radio Streams & Controls (all colourless Secondary buttons)
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sfx:radio:lofi').setLabel('24/7 Lo-Fi Radio').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sfx:radio:synthwave').setLabel('Synthwave Radio').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sfx:radio:anime').setLabel('Anime OST Radio').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sfx:stop').setLabel('Stop / Disconnect').setStyle(ButtonStyle.Secondary)
  );

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} Voice Soundboard Deck | ${TICK_EMOJI}\n` +
                 `> -# <a:uptime:1552608831060844575> Connect to any voice channel and click a sound to play it in real time!\n\n` +
                 `**__Quick Instructions:__**\n` +
                 `${BULLET_EMOJI} \`!sfx <name>\` — Play sound effect directly via chat\n` +
                 `${BULLET_EMOJI} \`!radio [lofi|synthwave|anime]\` — Start continuous 24/7 background audio\n` +
                 `${BULLET_EMOJI} \`!uploadsound <name> [url/attachment]\` — Add custom server sound\n` +
                 `${BULLET_EMOJI} **Custom Sounds Stored:** \`${customSounds.length} sounds\``
      },
      { type: 14, divider: true },
      row1.toJSON(),
      row2.toJSON(),
      row3.toJSON(),
      { type: 14, divider: true },
      { type: 10, content: `-# **Athena Prime Voice Matrix \u00b7 Live In-Voice SFX & 24/7 Radio**` }
    ]
  };

  return sanitizeCV2Payload({
    components: [container],
    flags: MessageFlags.IsComponentsV2
  });
}
