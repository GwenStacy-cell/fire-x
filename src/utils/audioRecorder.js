import { joinVoiceChannel, VoiceConnectionStatus, entersState, EndBehaviorType, getVoiceConnection } from '@discordjs/voice';
import prism from 'prism-media';
import { createWriteStream } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
ffmpeg.setFfmpegPath(ffmpegStatic);
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scratchDir = path.join(__dirname, '..', '..', 'scratch');

if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true });
}

// Cleanup stale temp audio files older than 1 hour on startup
try {
  const files = fs.readdirSync(scratchDir);
  const now = Date.now();
  for (const file of files) {
    if (file.startsWith('rec_') || file.startsWith('recording_')) {
      const filePath = path.join(scratchDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > 3600000) {
        fs.unlinkSync(filePath);
      }
    }
  }
} catch (e) {}

// Map of guildId -> session
const activeRecordings = new Map();

/**
 * Start recording all voice activity in a voice channel
 * @param {import('discord.js').VoiceBasedChannel} vc 
 */
export async function startRecording(vc) {
  const guildId = vc.guild.id;
  if (activeRecordings.has(guildId)) {
    throw new Error('A recording session is already active in this server.');
  }

  // Pre-emptively reset any pending TTS session so it does not collide with recording
  try {
    const { resetTtsConnection } = await import('../commands/tts.js');
    if (typeof resetTtsConnection === 'function') {
      resetTtsConnection(guildId);
    }
  } catch (_) {}

  // Connect to the voice channel (must NOT be self-muted or self-deafened to receive audio)
  const connection = joinVoiceChannel({
    channelId: vc.id,
    guildId: vc.guild.id,
    adapterCreator: vc.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  // Wait for the UDP connection to fully establish
  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

  // Send Opus silence packets to punch Discord's inbound UDP audio firewall
  const silenceBuffer = Buffer.from([0xf8, 0xff, 0xfe]);
  for (let i = 0; i < 5; i++) {
    connection.playOpusPacket(silenceBuffer);
  }

  // Keep UDP hole open via periodic silence frame every 4 seconds
  const keepAliveTimer = setInterval(() => {
    if (connection.state.status === VoiceConnectionStatus.Ready) {
      connection.playOpusPacket(silenceBuffer);
    }
  }, 4000);

  const receiver = connection.receiver;
  const session = {
    guildId,
    channelId: vc.id,
    channelName: vc.name,
    connection,
    receiver,
    keepAliveTimer,
    startTime: Date.now(),
    userTracks: new Map(), // userId -> { pcmPath, writeStream, decoder, opusStream, currentBytes, packetsCount }
    totalAudioPackets: 0
  };

  /**
   * Subscribe to a user's audio stream and pipe to raw PCM
   * @param {string} userId 
   */
  function subscribeUser(userId) {
    if (session.userTracks.has(userId)) return;

    // Skip bot users
    const member = vc.guild.members.cache.get(userId);
    if (member && member.user?.bot) return;

    const userPcmPath = path.join(scratchDir, `rec_${guildId}_${userId}_${Date.now()}.pcm`);
    const writeStream = createWriteStream(userPcmPath, { flags: 'a' });

    // Continuous receive stream that stays open for the entire session
    const opusStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.Manual }
    });

    const decoder = new prism.opus.Decoder({
      rate: 48000,
      channels: 2,
      frameSize: 960
    });

    const track = {
      pcmPath: userPcmPath,
      writeStream,
      decoder,
      opusStream,
      currentBytes: 0,
      packetsCount: 0
    };
    session.userTracks.set(userId, track);

    decoder.on('data', (pcmChunk) => {
      session.totalAudioPackets++;
      track.packetsCount++;

      // Real-time synchronization: 48,000 Hz * 2 channels * 2 bytes = 192 bytes per millisecond
      const now = Date.now();
      const targetBytes = Math.floor((now - session.startTime) * 192);

      let silenceNeeded = targetBytes - track.currentBytes;
      if (silenceNeeded > 0) {
        // Pad silence gaps so all speakers are synchronized in time (efficient chunk sizes)
        const maxChunk = Math.min(silenceNeeded, 524288); // Up to 512KB per buffer write
        const zeroBuf = Buffer.alloc(maxChunk, 0);
        while (silenceNeeded > 0) {
          const writeLen = Math.min(silenceNeeded, zeroBuf.length);
          writeStream.write(writeLen === zeroBuf.length ? zeroBuf : zeroBuf.subarray(0, writeLen));
          silenceNeeded -= writeLen;
        }
        track.currentBytes = targetBytes;
      }

      writeStream.write(pcmChunk);
      track.currentBytes += pcmChunk.length;
    });

    opusStream.on('error', () => {});
    decoder.on('error', () => {});
    writeStream.on('error', () => {});

    opusStream.pipe(decoder);
  }

  // Pre-subscribe all current non-bot members in the voice channel
  vc.members.forEach(member => {
    if (!member.user.bot) {
      subscribeUser(member.id);
    }
  });

  // Automatically subscribe any user when they begin speaking
  receiver.speaking.on('start', (userId) => {
    subscribeUser(userId);
  });

  activeRecordings.set(guildId, session);
  return true;
}

/**
 * Stop an active recording session and compile all audio into an MP3 file
 * @param {string} guildId 
 * @returns {Promise<{ mp3Path: string, startTime: number, durationMs: number, userCount: number } | null>}
 */
export async function stopRecording(guildId) {
  const session = activeRecordings.get(guildId);
  if (!session) return null;

  activeRecordings.delete(guildId);
  clearInterval(session.keepAliveTimer);

  // Close and flush all user streams with 3s timeout protection
  const trackPromises = [];
  for (const track of session.userTracks.values()) {
    try {
      track.opusStream.destroy();
      track.decoder.destroy();
      trackPromises.push(new Promise(resolve => {
        track.writeStream.end(resolve);
      }));
    } catch (e) {}
  }
  await Promise.race([
    Promise.all(trackPromises),
    new Promise(resolve => setTimeout(resolve, 3000))
  ]);

  // Cleanly destroy the recording voice connection
  try {
    session.connection.destroy();
  } catch (e) {}

  // Immediately notify TTS session to purge any stale voice connection reference
  try {
    const { resetTtsConnection } = await import('../commands/tts.js');
    if (typeof resetTtsConnection === 'function') {
      resetTtsConnection(guildId);
    }
  } catch (_) {}

  // If this server has a Home VC configured, automatically restore the Home VC connection!
  try {
    const { default: db } = await import('../database.js');
    const cfg = db.getGuildConfig(guildId);
    if (cfg?.homeVcId) {
      const { connectToHomeVc } = await import('./voice.js');
      const guild = session.connection?.client?.guilds?.cache?.get(guildId);
      if (guild && typeof connectToHomeVc === 'function') {
        setTimeout(() => {
          connectToHomeVc(guild, cfg.homeVcId, true).catch(() => null);
        }, 500);
      }
    }
  } catch (_) {}

  // Verify if any speech or audio packets were actually received
  if (session.totalAudioPackets === 0) {
    for (const track of session.userTracks.values()) {
      try { fs.unlinkSync(track.pcmPath); } catch (e) {}
    }
    throw new Error('No speech or audio was detected in the voice channel.');
  }

  // Find all PCM files with real recorded audio
  const validFiles = [];
  for (const track of session.userTracks.values()) {
    try {
      const stats = fs.statSync(track.pcmPath);
      if (stats.size > 0 && track.packetsCount > 0) {
        validFiles.push(track.pcmPath);
      } else {
        fs.unlinkSync(track.pcmPath);
      }
    } catch (e) {}
  }

  if (validFiles.length === 0) {
    throw new Error('No speech or audio was detected in the voice channel.');
  }

  const mp3Path = path.join(scratchDir, `recording_${guildId}_${Date.now()}.mp3`);

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    validFiles.forEach(file => {
      cmd.input(file).inputOptions(['-f s16le', '-ar 48000', '-ac 2']);
    });

    if (validFiles.length > 1) {
      cmd.complexFilter([`amix=inputs=${validFiles.length}:duration=longest:dropout_transition=0`]);
    }

    cmd.output(mp3Path)
      .audioCodec('libmp3lame')
      .audioBitrate('96k')
      .on('end', () => {
        // Clean up raw PCM files
        validFiles.forEach(file => {
          try { fs.unlinkSync(file); } catch (e) {}
        });
        resolve({
          mp3Path,
          startTime: session.startTime,
          durationMs: Date.now() - session.startTime,
          userCount: validFiles.length
        });
      })
      .on('error', (err) => {
        console.error('FFMPEG Recording Error:', err);
        validFiles.forEach(file => {
          try { fs.unlinkSync(file); } catch (e) {}
        });
        reject(err);
      })
      .run();
  });
}

/**
 * Check if a recording session is currently active for a guild
 * @param {string} guildId 
 * @returns {boolean}
 */
export function getRecordingStatus(guildId) {
  return activeRecordings.has(guildId);
}
