import fs from 'fs';
import path from 'path';
import os from 'os';
import util from 'util';
import { spawn, exec } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  StreamType, 
  AudioPlayerStatus, 
  VoiceConnectionStatus, 
  entersState 
} from '@discordjs/voice';
import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  InviteTargetType 
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
} from './emojis.js';
import { getCookieArg } from './mediaDownloader.js';

const execPromise = util.promisify(exec);

// Supported movie & video container formats
const SUPPORTED_EXTS = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.m4v']);

// YouTube Watch Together Application Snowflake
export const YOUTUBE_TOGETHER_APP_ID = '880218394199220334';

// Active playback sessions: guildId -> Session
const activeSessions = new Map();

// Session lookup by HTTP streaming sessionId: sessionId -> Session
const sessionsById = new Map();

/**
 * Returns the absolute path to the local movies directory
 */
export function getMoviesDir() {
  const dir = path.resolve(process.cwd(), 'movies');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Resolves yt-dlp binary path on host
 */
export function getYtDlpPath() {
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'yt-dlp.exe' : 'yt-dlp_linux';
  const rootBin = path.resolve(process.cwd(), binName);
  if (fs.existsSync(rootBin)) return rootBin;
  return 'yt-dlp';
}

/**
 * Detects online platform from URL
 */
export function detectPlatform(url) {
  if (!url || typeof url !== 'string') return 'Local Library';
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
  if (u.includes('instagram.com')) return 'Instagram';
  if (u.includes('twitch.tv')) return 'Twitch';
  if (u.includes('tiktok.com')) return 'TikTok';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'Twitter / X';
  if (u.includes('facebook.com') || u.includes('fb.watch')) return 'Facebook';
  if (u.includes('reddit.com')) return 'Reddit';
  if (u.includes('vimeo.com')) return 'Vimeo';
  if (/^https?:\/\//i.test(u)) return 'Direct Web Stream';
  return 'Local Library';
}

/**
 * Resolves local server host IP for mobile phone streaming over LAN
 */
export function getLocalIp() {
  if (process.env.CINEMA_BASE_URL) return process.env.CINEMA_BASE_URL.replace(/\/+$/, '');
  if (process.env.TUNNEL_URL) return process.env.TUNNEL_URL.replace(/\/+$/, '');
  
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        const port = process.env.WEBSUB_PORT || process.env.PORT || 3000;
        return `http://${net.address}:${port}`;
      }
    }
  }
  const port = process.env.WEBSUB_PORT || process.env.PORT || 3000;
  return `http://localhost:${port}`;
}

/**
 * Formats bytes into human-readable size
 */
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Formats seconds into HH:MM:SS or MM:SS
 */
export function formatSeconds(totalSecs) {
  if (!totalSecs || isNaN(totalSecs) || totalSecs <= 0) return '00:00';
  const s = Math.floor(totalSecs);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parses user timestamp string (e.g. "1:30", "01:25:30", "90s") to seconds
 */
export function parseTimestamp(input) {
  if (!input) return null;
  const clean = input.trim();
  if (/^\d+$/.test(clean)) return parseInt(clean, 10);
  if (/^\d+s$/i.test(clean)) return parseInt(clean, 10);
  if (/^\d+m$/i.test(clean)) return parseInt(clean, 10) * 60;
  if (/^\d+h$/i.test(clean)) return parseInt(clean, 10) * 3600;

  const parts = clean.split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return null;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return null;
}

/**
 * Renders a visual Unicode seekbar
 */
export function renderProgressBar(current, total, length = 16) {
  if (!total || total <= 0) return '🔘' + '▬'.repeat(length - 1);
  const progress = Math.min(1, Math.max(0, current / total));
  const progressChars = Math.round(progress * (length - 1));
  let bar = '';
  for (let i = 0; i < length; i++) {
    if (i === progressChars) {
      bar += '🔘';
    } else {
      bar += '▬';
    }
  }
  return bar;
}

/**
 * Scans host movies directory for valid movie files
 */
export function listLocalMovies() {
  const dir = getMoviesDir();
  const results = [];

  function scan(currentDir, relativePath = '') {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;

        // Skip internal cache folder in list
        if (entry.isDirectory() && entry.name === 'web_cache') continue;

        if (entry.isDirectory()) {
          scan(fullPath, relPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_EXTS.has(ext)) {
            const stats = fs.statSync(fullPath);
            results.push({
              name: path.basename(entry.name, ext),
              relativePath: relPath,
              fullPath,
              ext,
              sizeBytes: stats.size,
              sizeFormatted: formatBytes(stats.size),
              mtime: stats.mtime
            });
          }
        }
      }
    } catch (err) {
      console.warn('[CinemaEngine] Directory scan error:', err.message);
    }
  }

  scan(dir);
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results.map((item, idx) => ({ index: idx + 1, ...item }));
}

/**
 * Deletes a movie file from the local library or cache
 */
export function deleteMovieFile(query) {
  if (!query) return null;
  const str = String(query).trim();
  const movies = listLocalMovies();
  let target = null;

  if (/^\d+$/.test(str)) {
    const idx = parseInt(str, 10) - 1;
    if (idx >= 0 && idx < movies.length) {
      target = movies[idx];
    }
  } else {
    target = movies.find(m => m.name.toLowerCase().includes(str.toLowerCase()));
  }

  if (!target) return null;

  try {
    if (fs.existsSync(target.fullPath)) {
      fs.unlinkSync(target.fullPath);
      return {
        success: true,
        name: target.name,
        path: target.fullPath,
        sizeFormatted: target.sizeFormatted
      };
    }
  } catch (err) {
    console.error('[CinemaEngine deleteMovieFile Error]:', err.message);
    throw err;
  }
  return null;
}

/**
 * Probes the duration of a video or audio file using ffmpeg
 */
export function probeMediaDuration(filePathOrUrl) {
  return new Promise((resolve) => {
    if (!filePathOrUrl) return resolve(0);
    const proc = spawn(ffmpegPath, ['-i', filePathOrUrl]);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
      if (match) {
        const hours = parseInt(match[1], 10);
        const mins = parseInt(match[2], 10);
        const secs = parseFloat(match[3]);
        return resolve(hours * 3600 + mins * 60 + secs);
      }
      resolve(0);
    });
    proc.on('error', () => resolve(0));
  });
}

/**
 * Resolves media source from either:
 * 1) Online URL (YouTube, Instagram, Twitch, TikTok, Twitter/X, direct video link)
 * 2) Movie index number from list
 * 3) Local filename query from movies/
 */
export async function resolveMediaSource(input, progressCallback = null) {
  const str = (input || '').trim();

  // 1. Online Web Stream or Social Media URL
  if (/^https?:\/\//i.test(str)) {
    const platform = detectPlatform(str);
    if (progressCallback) progressCallback(`Connecting to **${platform}** and extracting stream metadata...`);

    const ytdlp = getYtDlpPath();
    const cookieArg = getCookieArg();
    const cacheDir = path.resolve(getMoviesDir(), 'web_cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // 1a. Query metadata via yt-dlp
    let info = null;
    try {
      const metaCmd = `"${ytdlp}" ${cookieArg} --ffmpeg-location "${ffmpegPath}" --dump-json --no-playlist "${str}"`;
      const { stdout } = await execPromise(metaCmd, { maxBuffer: 10 * 1024 * 1024 });
      info = JSON.parse(stdout);
    } catch (e) {
      console.warn('[CinemaEngine resolveMediaSource] Metadata probe warning:', e.message);
    }

    const title = (info?.title || `${platform} Video`).replace(/[\\/*?:"<>|]/g, '').trim().slice(0, 100);
    const duration = info?.duration || 0;
    const isLive = Boolean(info?.is_live);

    // 1b. If it is a Live stream (Twitch live, YouTube live)
    if (isLive) {
      if (progressCallback) progressCallback(`Extracting live broadcast HLS stream for: **${title}**...`);
      try {
        const getUrlCmd = `"${ytdlp}" ${cookieArg} --ffmpeg-location "${ffmpegPath}" -g -f best "${str}"`;
        const { stdout } = await execPromise(getUrlCmd);
        const liveUrl = stdout.trim().split('\n')[0];
        return {
          type: 'live',
          title: `[LIVE] ${title}`,
          source: liveUrl,
          streamUrl: liveUrl,
          filePath: null,
          duration: 0,
          isLive: true,
          platform,
          originalUrl: str
        };
      } catch (liveErr) {
        console.warn('[CinemaEngine] Live HLS extraction warning:', liveErr.message);
      }
    }

    // 1c. If it's a recorded video (YouTube, Instagram Reel, Twitch clip, TikTok, Twitter/X)
    const videoId = info?.id || Buffer.from(str).toString('hex').slice(0, 16);
    const targetFile = path.resolve(cacheDir, `${videoId}.mp4`);

    if (fs.existsSync(targetFile) && fs.statSync(targetFile).size > 10000) {
      if (progressCallback) progressCallback(`Found ready video in cache: **${title}**`);
      return {
        type: 'web_cached',
        title,
        source: targetFile,
        filePath: targetFile,
        duration,
        isLive: false,
        platform,
        originalUrl: str
      };
    }

    // Download/buffer for zero-latency seeking and phone streaming
    if (progressCallback) progressCallback(`Buffering stream for: **${title}**...`);
    try {
      const downloadCmd = `"${ytdlp}" ${cookieArg} --ffmpeg-location "${ffmpegPath}" -f "best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best" --no-playlist -o "${targetFile}" "${str}"`;
      await execPromise(downloadCmd, { maxBuffer: 25 * 1024 * 1024 });
      if (fs.existsSync(targetFile)) {
        return {
          type: 'web_cached',
          title,
          source: targetFile,
          filePath: targetFile,
          duration,
          isLive: false,
          platform,
          originalUrl: str
        };
      }
    } catch (downErr) {
      console.warn('[CinemaEngine] Direct download failed, falling back to direct URL stream:', downErr.message);
    }

    // Fallback: extract direct stream URL
    try {
      const directUrlCmd = `"${ytdlp}" ${cookieArg} --ffmpeg-location "${ffmpegPath}" -g -f best "${str}"`;
      const { stdout: directStreamOut } = await execPromise(directUrlCmd);
      const directStreamUrl = directStreamOut.trim().split('\n')[0];
      return {
        type: 'direct_stream',
        title,
        source: directStreamUrl,
        streamUrl: directStreamUrl,
        filePath: null,
        duration,
        isLive: false,
        platform,
        originalUrl: str
      };
    } catch (streamErr) {
      throw new Error(`Failed to extract playable stream from ${platform}: ${streamErr.message}`);
    }
  }

  // 2. Is it a local movie index or name?
  const movies = listLocalMovies();
  if (/^\d+$/.test(str)) {
    const idx = parseInt(str, 10) - 1;
    if (idx >= 0 && idx < movies.length) {
      return {
        type: 'local',
        title: movies[idx].name,
        source: movies[idx].fullPath,
        filePath: movies[idx].fullPath,
        duration: 0,
        isLive: false,
        platform: 'Local Storage',
        originalUrl: null
      };
    }
  }

  if (str) {
    const found = movies.find(m => m.name.toLowerCase().includes(str.toLowerCase()));
    if (found) {
      return {
        type: 'local',
        title: found.name,
        source: found.fullPath,
        filePath: found.fullPath,
        duration: 0,
        isLive: false,
        platform: 'Local Storage',
        originalUrl: null
      };
    }
  }

  // Fallback to first local movie if no query provided
  if (movies.length > 0 && !str) {
    return {
      type: 'local',
      title: movies[0].name,
      source: movies[0].fullPath,
      filePath: movies[0].fullPath,
      duration: 0,
      isLive: false,
      platform: 'Local Storage',
      originalUrl: null
    };
  }

  return null;
}

/**
 * Downloads an online movie directly onto the host server storage
 */
export async function downloadMovieToServer(url, customName = null, progressCallback = null) {
  const ytdlp = getYtDlpPath();
  const cookieArg = getCookieArg();
  const moviesDir = getMoviesDir();

  if (progressCallback) progressCallback('Resolving video stream metadata...');
  let title = customName;
  if (!title) {
    try {
      const metaCmd = `"${ytdlp}" ${cookieArg} --ffmpeg-location "${ffmpegPath}" --dump-json --no-playlist "${url}"`;
      const { stdout } = await execPromise(metaCmd, { maxBuffer: 10 * 1024 * 1024 });
      const info = JSON.parse(stdout);
      title = info.title || 'Downloaded Movie';
    } catch (e) {
      title = 'Downloaded Movie ' + Date.now();
    }
  }

  const cleanName = title.replace(/[\\/*?:"<>|]/g, '').trim().slice(0, 80);
  const targetPath = path.resolve(moviesDir, `${cleanName}.mp4`);

  if (progressCallback) progressCallback(`Downloading **${cleanName}** onto host server storage...`);
  const downloadCmd = `"${ytdlp}" ${cookieArg} --ffmpeg-location "${ffmpegPath}" -f "best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best" --no-playlist -o "${targetPath}" "${url}"`;
  await execPromise(downloadCmd, { maxBuffer: 50 * 1024 * 1024 });

  if (fs.existsSync(targetPath)) {
    const stats = fs.statSync(targetPath);
    return {
      success: true,
      name: cleanName,
      path: targetPath,
      sizeFormatted: formatBytes(stats.size)
    };
  }

  throw new Error('Download finished but movie file was not found on disk.');
}

/**
 * Starts or seeks an audio streaming process via ffmpeg into the Discord audio player
 */
function playAudioSegment(session, offsetSeconds = 0) {
  if (session.ffmpegProcess) {
    try {
      session.ffmpegProcess.kill('SIGKILL');
    } catch (e) {}
    session.ffmpegProcess = null;
  }

  session.currentOffset = offsetSeconds;
  session.startedAt = Date.now();
  session.isPaused = false;

  const args = [];
  if (session.isLive) {
    args.push('-re');
  } else if (offsetSeconds > 0) {
    args.push('-ss', String(offsetSeconds));
  }
  
  args.push(
    '-i', session.source,
    '-vn',
    '-ac', '2',
    '-ar', '48000',
    '-f', 's16le',
    'pipe:1'
  );

  const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'ignore'] });
  session.ffmpegProcess = proc;

  proc.on('error', (err) => {
    console.error(`[CinemaEngine Audio] FFmpeg process error (${session.guildId}):`, err.message);
  });

  const resource = createAudioResource(proc.stdout, {
    inputType: StreamType.Raw,
    inlineVolume: true
  });
  resource.volume?.setVolume(session.volume || 1.0);
  session.resource = resource;

  session.player.play(resource);
}

/**
 * Starts an Athena Cinema streaming session
 */
export async function startCinemaSession({ 
  guild, 
  voiceChannel, 
  source, 
  title, 
  startOffset = 0, 
  member,
  isLive = false,
  platform = 'Local Storage',
  originalUrl = null,
  streamUrl = null,
  duration = 0,
  filePath = null
}) {
  const guildId = guild.id;
  let session = activeSessions.get(guildId);

  // Generate unique session id for HTTP range streaming & theater UI
  const sessionId = `${guildId}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

  // Determine total duration
  const totalDuration = duration > 0 ? duration : (isLive ? 0 : await probeMediaDuration(source));

  if (session) {
    // Re-use connection
    if (session.ffmpegProcess) {
      try { session.ffmpegProcess.kill('SIGKILL'); } catch (e) {}
    }
    session.source = source;
    session.title = title || path.basename(source);
    session.totalDuration = totalDuration;
    session.sessionId = sessionId;
    session.startedBy = member?.id;
    session.isLive = isLive;
    session.platform = platform;
    session.originalUrl = originalUrl;
    session.streamUrl = streamUrl;
    session.filePath = filePath || (source && fs.existsSync(source) ? source : null);
  } else {
    const player = createAudioPlayer();
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true
    });

    session = {
      guildId,
      voiceChannelId: voiceChannel.id,
      connection,
      player,
      ffmpegProcess: null,
      resource: null,
      source,
      filePath: filePath || (source && fs.existsSync(source) ? source : null),
      streamUrl,
      title: title || path.basename(source),
      totalDuration,
      currentOffset: startOffset,
      startedAt: Date.now(),
      isPaused: false,
      isLoop: false,
      volume: 1.0,
      sessionId,
      startedBy: member?.id,
      deckMessage: null,
      isLive,
      platform,
      originalUrl
    };

    // Auto-reconnect on disconnect
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000)
        ]);
      } catch (e) {
        stopCinemaSession(guildId);
      }
    });

    // Lifecycle: handle track finish & loop
    player.on(AudioPlayerStatus.Idle, () => {
      const active = activeSessions.get(guildId);
      if (!active) return;
      if (active.isLoop && !active.isLive) {
        playAudioSegment(active, 0);
      } else if (!active.isLive) {
        // Stream finished
      }
    });

    connection.subscribe(player);
    activeSessions.set(guildId, session);
  }

  sessionsById.set(sessionId, session);
  playAudioSegment(session, startOffset);

  return session;
}

/**
 * Calculates currently elapsed playback time in seconds
 */
export function getCurrentPlaybackSeconds(session) {
  if (!session) return 0;
  if (session.isLive) return 0;
  let elapsed = session.currentOffset || 0;
  if (!session.isPaused && session.startedAt) {
    elapsed += (Date.now() - session.startedAt) / 1000;
  }
  if (session.totalDuration && elapsed > session.totalDuration) {
    return session.totalDuration;
  }
  return Math.max(0, elapsed);
}

/**
 * Pauses playback
 */
export function pauseCinemaSession(guildId) {
  const session = activeSessions.get(guildId);
  if (!session || session.isPaused) return false;

  session.currentOffset = getCurrentPlaybackSeconds(session);
  session.isPaused = true;
  session.player.pause();
  return true;
}

/**
 * Resumes playback
 */
export function resumeCinemaSession(guildId) {
  const session = activeSessions.get(guildId);
  if (!session || !session.isPaused) return false;

  session.isPaused = false;
  session.startedAt = Date.now();
  session.player.unpause();
  return true;
}

/**
 * Seeks to target timestamp in seconds
 */
export function seekCinemaSession(guildId, targetSeconds) {
  const session = activeSessions.get(guildId);
  if (!session) return null;
  if (session.isLive) return null; // Live streams cannot seek backward/forward

  const target = Math.max(0, Math.min(targetSeconds, session.totalDuration || targetSeconds));
  playAudioSegment(session, target);
  return target;
}

/**
 * Fast-forwards by delta seconds
 */
export function forwardCinemaSession(guildId, deltaSeconds = 30) {
  const session = activeSessions.get(guildId);
  if (!session || session.isLive) return null;
  const current = getCurrentPlaybackSeconds(session);
  return seekCinemaSession(guildId, current + deltaSeconds);
}

/**
 * Rewinds by delta seconds
 */
export function rewindCinemaSession(guildId, deltaSeconds = 30) {
  const session = activeSessions.get(guildId);
  if (!session || session.isLive) return null;
  const current = getCurrentPlaybackSeconds(session);
  return seekCinemaSession(guildId, Math.max(0, current - deltaSeconds));
}

/**
 * Toggles loop mode
 */
export function toggleLoopCinemaSession(guildId) {
  const session = activeSessions.get(guildId);
  if (!session || session.isLive) return false;
  session.isLoop = !session.isLoop;
  return session.isLoop;
}

/**
 * Stops cinema session and cleans up voice connection
 */
export function stopCinemaSession(guildId) {
  const session = activeSessions.get(guildId);
  if (!session) return false;

  if (session.ffmpegProcess) {
    try { session.ffmpegProcess.kill('SIGKILL'); } catch (e) {}
  }
  try {
    session.player.stop(true);
    session.connection.destroy();
  } catch (e) {}

  sessionsById.delete(session.sessionId);
  activeSessions.delete(guildId);
  return true;
}

/**
 * Returns active session for guild
 */
export function getCinemaSession(guildId) {
  return activeSessions.get(guildId) || null;
}

/**
 * Launches an official Discord Watch Together Activity invite in the voice channel
 */
export async function createWatchTogetherActivity(voiceChannel) {
  if (!voiceChannel) return null;
  try {
    const invite = await voiceChannel.createInvite({
      targetType: InviteTargetType.EmbeddedApplication,
      targetApplication: YOUTUBE_TOGETHER_APP_ID,
      maxAge: 86400, // 24 hours
      maxUses: 0
    });
    return `https://discord.gg/${invite.code}`;
  } catch (err) {
    console.error('[CinemaEngine WatchTogether Invite Error]:', err.message);
    return null;
  }
}

/**
 * Builds the interactive Components V2 Control Deck payload
 */
export function buildCinemaControlDeck(session, options = {}) {
  const currentSecs = getCurrentPlaybackSeconds(session);
  const totalSecs = session.totalDuration || 0;
  const durationStr = formatSeconds(totalSecs);
  const currentStr = formatSeconds(currentSecs);
  const percentage = totalSecs > 0 ? Math.round((currentSecs / totalSecs) * 100) : 0;
  const progressBar = renderProgressBar(currentSecs, totalSecs, 14);

  const baseHost = getLocalIp();
  const theaterUrl = `${baseHost}/cinema/watch/${session.sessionId}`;
  const isLive = Boolean(session.isLive);
  const platform = session.platform || 'Local Storage';

  let statusSection = '';
  if (isLive) {
    statusSection =
      `<a:target_blink:1565667466984554588> **Now Streaming:** \`${session.title}\`\n` +
      `<a:target_blink:1565667466984554588> **Platform:** \`${platform}\`\n` +
      `<a:target_blink:1565667466984554588> **Voice Channel:** <#${session.voiceChannelId}>\n` +
      `<a:target_blink:1565667466984554588> **Broadcast Status:** ${UPTIME_EMOJI} \`[LIVE BROADCAST]\`\n` +
      (session.originalUrl ? `<a:target_blink:1565667466984554588> **Original Link:** [Open in ${platform}](${session.originalUrl})\n\n` : '\n') +
      `**Mobile & Web Live Video Screen:**\n` +
      `Tap the button below to watch the live video screen with real-time surround audio in VC!`;
  } else {
    statusSection =
      `<a:target_blink:1565667466984554588> **Now Playing:** \`${session.title}\`\n` +
      `<a:target_blink:1565667466984554588> **Platform:** \`${platform}\`\n` +
      (session.originalUrl ? `<a:target_blink:1565667466984554588> **Original Link:** [Open in ${platform}](${session.originalUrl})\n` : '') +
      `<a:target_blink:1565667466984554588> **Voice Channel:** <#${session.voiceChannelId}>\n` +
      `<a:target_blink:1565667466984554588> **Playback State:** ${session.isPaused ? '`[PAUSED]`' : `${UPTIME_EMOJI} \`[STREAMING LIVE]\``} | **Loop:** \`${session.isLoop ? 'ON' : 'OFF'}\`\n` +
      `<a:target_blink:1565667466984554588> **Timestamp:** \`[${currentStr} / ${durationStr}]\` (${percentage}%)\n` +
      `<a:target_blink:1565667466984554588> **Progress:** \`${progressBar}\`\n\n` +
      `**Mobile & Web Video Screen:**\n` +
      `Tap the button below or open the **Watch Video Screen** link on your phone/browser to view the synced video with native controls!`;
  }

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} **Athena Cinema • Movie & Stream Player** | ${TICK_EMOJI}`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: statusSection
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: '-# **Athena Prime Cinema Suite • Surround Voice Audio + Video Screen Sync**'
      }
    ]
  };

  // Row 1: Seeking controls (or Live sync controls for live broadcasts)
  let row1 = null;
  if (isLive) {
    row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('cinema_refresh')
        .setLabel('Live Sync')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('cinema_play_pause')
        .setLabel(session.isPaused ? 'Resume Audio' : 'Pause Audio')
        .setStyle(session.isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('cinema_stop')
        .setLabel('Stop Broadcast')
        .setEmoji(DELETE_BEAT_EMOJI)
        .setStyle(ButtonStyle.Danger)
    );
  } else {
    row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('cinema_rewind_60')
        .setLabel('Rewind 1m')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('cinema_rewind_30')
        .setLabel('Rewind 30s')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('cinema_play_pause')
        .setLabel(session.isPaused ? 'Play' : 'Pause')
        .setStyle(session.isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('cinema_forward_30')
        .setLabel('Forward 30s')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('cinema_forward_60')
        .setLabel('Forward 1m')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  // Row 2: Navigation & Session controls
  const row2Components = [
    new ButtonBuilder()
      .setLabel('Watch Video Screen')
      .setStyle(ButtonStyle.Link)
      .setURL(theaterUrl),
    new ButtonBuilder()
      .setCustomId('cinema_activity')
      .setLabel('Watch Together')
      .setStyle(ButtonStyle.Secondary)
  ];

  if (!isLive) {
    row2Components.push(
      new ButtonBuilder()
        .setCustomId('cinema_loop')
        .setLabel(session.isLoop ? 'Loop (ON)' : 'Loop (OFF)')
        .setStyle(session.isLoop ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('cinema_refresh')
        .setLabel('Sync')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  row2Components.push(
    new ButtonBuilder()
      .setCustomId('cinema_stop')
      .setLabel('Stop')
      .setEmoji(DELETE_BEAT_EMOJI)
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(row2Components);

  container.components.push(row1.toJSON(), row2.toJSON());
  return { components: [container], flags: 32768 };
}

/**
 * Updates the existing Control Deck message in Discord
 */
export async function updateSessionControlDeck(session) {
  if (!session || !session.deckMessage) return;
  const payload = buildCinemaControlDeck(session);
  try {
    await session.deckMessage.edit(payload);
  } catch (err) {
    // Message might be deleted or inaccessible
  }
}

/**
 * Express Route Handlers for HTTP Video Range Streaming & Responsive Mobile Theater Room
 */
export function registerCinemaRoutes(app) {
  // 1. HTTP 206 Partial Content Video Streaming Endpoint
  app.get('/cinema/stream/:sessionId', (req, res) => {
    const session = sessionsById.get(req.params.sessionId);
    if (!session) {
      return res.status(404).send('Cinema session not found or expired.');
    }

    // If session has direct stream URL and no local file, redirect or stream directly
    if (!session.filePath && session.streamUrl) {
      return res.redirect(session.streamUrl);
    }

    const filePath = session.filePath || session.source;
    if (!filePath || !fs.existsSync(filePath)) {
      if (session.streamUrl) return res.redirect(session.streamUrl);
      return res.status(404).send('Source movie file not found on disk.');
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.mp4': 'video/mp4',
      '.mkv': 'video/x-matroska',
      '.webm': 'video/webm',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.m4v': 'video/x-m4v',
      '.flv': 'video/x-flv'
    };
    const contentType = mimeTypes[ext] || 'video/mp4';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        res.status(416).send(`Requested range not satisfiable: ${start} >= ${fileSize}`);
        return;
      }

      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });

  // 2. Real-time Session Status Endpoint for Web Sync
  app.get('/cinema/status/:sessionId', (req, res) => {
    const session = sessionsById.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const current = getCurrentPlaybackSeconds(session);
    res.json({
      title: session.title,
      currentTime: current,
      duration: session.totalDuration || 0,
      isPaused: session.isPaused,
      isLoop: session.isLoop,
      isLive: Boolean(session.isLive),
      platform: session.platform
    });
  });

  // 3. Responsive HTML5 Mobile & Web Cinema Room
  app.get('/cinema/watch/:sessionId', (req, res) => {
    const session = sessionsById.get(req.params.sessionId);
    if (!session) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html><head><title>Cinema Session Expired</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body{background:#0b0e14;color:#f1f5f9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}</style>
        </head><body><div><h2>Session Not Found or Expired</h2><p>This movie stream has ended or was closed in Discord.</p></div></body></html>
      `);
    }

    const currentSecs = getCurrentPlaybackSeconds(session);
    const videoStreamUrl = `/cinema/stream/${session.sessionId}`;
    const isLive = Boolean(session.isLive);
    const streamSource = isLive ? (session.streamUrl || videoStreamUrl) : videoStreamUrl;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Athena Cinema • ${session.title}</title>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    header {
      background: #0f172a;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #1e293b;
      flex-shrink: 0;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 16px;
      letter-spacing: 0.5px;
    }
    .badge {
      background: #2563eb;
      color: white;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 12px;
      text-transform: uppercase;
      font-weight: 800;
    }
    .badge.live {
      background: #ef4444;
    }
    .video-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      position: relative;
    }
    video {
      width: 100%;
      height: 100%;
      max-height: 100%;
      object-fit: contain;
      outline: none;
    }
    footer {
      background: #0f172a;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid #1e293b;
      font-size: 13px;
      color: #94a3b8;
      flex-shrink: 0;
    }
    .sync-btn {
      background: #334155;
      color: #f8fafc;
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .sync-btn:hover {
      background: #475569;
    }
    .live-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: #ef4444;
      border-radius: 50%;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.2); }
      100% { opacity: 1; transform: scale(1); }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span class="live-dot"></span>
      <span>${session.title}</span>
      <span class="badge ${isLive ? 'live' : ''}">${isLive ? 'Live Broadcast' : session.platform}</span>
    </div>
    <button class="sync-btn" onclick="syncWithVoice()">⚡ Sync to Discord VC</button>
  </header>

  <div class="video-container">
    <video id="player" controls autoplay playsinline preload="auto"></video>
  </div>

  <footer>
    <div>Athena Cinema Engine • Synced to Discord Voice Channel</div>
    <div id="statusText">${isLive ? 'Streaming Live' : 'Playing at ' + formatSeconds(currentSecs)}</div>
  </footer>

  <script>
    const player = document.getElementById('player');
    const statusText = document.getElementById('statusText');
    const sessionId = "${session.sessionId}";
    const isLiveStream = ${isLive};
    const streamSrc = "${streamSource}";
    let initialSyncDone = false;

    // Load stream: HLS for live or direct for mp4
    if (isLiveStream && Hls.isSupported() && streamSrc.includes('.m3u8')) {
      const hls = new Hls();
      hls.loadSource(streamSrc);
      hls.attachMedia(player);
      hls.on(Hls.Events.MANIFEST_PARSED, () => player.play().catch(() => {}));
    } else {
      player.src = streamSrc;
      player.play().catch(() => {});
    }

    // Set initial start timestamp for VOD
    if (!isLiveStream) {
      player.addEventListener('loadedmetadata', () => {
        if (!initialSyncDone) {
          player.currentTime = ${Math.max(0, currentSecs)};
          initialSyncDone = true;
        }
      });
    }

    async function syncWithVoice() {
      try {
        const res = await fetch('/cinema/status/' + sessionId);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.isLive && Math.abs(player.currentTime - data.currentTime) > 2) {
          player.currentTime = data.currentTime;
        }
        if (data.isPaused && !player.paused) {
          player.pause();
        } else if (!data.isPaused && player.paused) {
          player.play().catch(() => {});
        }
        if (!data.isLive) {
          statusText.innerText = 'Synced at ' + Math.floor(player.currentTime) + 's';
        }
      } catch (e) {}
    }

    // Auto-poll sync every 5 seconds for recorded video
    if (!isLiveStream) {
      setInterval(syncWithVoice, 5000);
    }
  </script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });
}
