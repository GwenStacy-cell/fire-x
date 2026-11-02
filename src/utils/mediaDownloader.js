import fetch from 'node-fetch';
import { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpegPath from 'ffmpeg-static';
import { fetchPinterestMedia, downloadPinterestBuffer } from './pinterest.js';

const execPromise = util.promisify(exec);

export const mediaUrlCache = new Map();

/**
 * Cache extracted media URL for 24 hours
 * @param {string} messageId 
 * @param {string} url 
 */
export function cacheMediaUrl(messageId, url) {
  if (!messageId || !url) return;
  mediaUrlCache.set(messageId, url);
  setTimeout(() => mediaUrlCache.delete(messageId), 24 * 60 * 60 * 1000);
}

let ytdlpCachePromise = null;
let lastUpdateCheck = 0;

/**
 * Ensures ffmpeg binary has execution permissions on Linux/Pterodactyl containers.
 */

/**
 * Automatically discovers cookies.txt or youtube_cookies.txt in bot root, home dir, or container.
 * Also synchronizes from COOKIES_TEXT / YOUTUBE_COOKIES env var if present.
 * This completely resolves YouTube and Instagram datacenter IP blocks.
 */
export function getCookieArg() {
  const defaultCookieFile = path.join(process.cwd(), 'cookies.txt');
  const envCookie = process.env.COOKIES_TEXT || process.env.YOUTUBE_COOKIES || process.env.INSTAGRAM_COOKIES;
  if (envCookie && !fs.existsSync(defaultCookieFile)) {
    try {
      fs.writeFileSync(defaultCookieFile, envCookie.trim(), 'utf8');
    } catch {}
  }

  const possiblePaths = [
    path.join(process.cwd(), 'cookies.txt'),
    '/home/container/cookies.txt',
    path.join(process.cwd(), 'youtube_cookies.txt'),
    path.join(process.cwd(), 'yt_cookies.txt'),
    path.join(process.cwd(), 'instagram_cookies.txt'),
    path.join(process.cwd(), 'ig_cookies.txt'),
    path.join(os.homedir(), 'cookies.txt')
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).size > 10) {
        return `--cookies "${p}" --js-runtimes node`;
      }
    } catch {}
  }
  return '--js-runtimes node';
}

export function ensureFfmpegPermissions() {
  try {
    if (ffmpegPath && fs.existsSync(ffmpegPath) && process.platform !== 'win32') {
      fs.chmodSync(ffmpegPath, 0o755);
    }
  } catch (err) {}
}

/**
 * Ensures yt-dlp binary is available locally and executable.
 * Robust across Windows (yt-dlp.exe), Linux (yt-dlp_linux standalone), and system PATH installations.
 */
export async function downloadYtDlp() {
  ensureFfmpegPermissions();
  if (ytdlpCachePromise) return ytdlpCachePromise;

  ytdlpCachePromise = (async () => {
    const isWin = process.platform === 'win32';
    const binName = isWin ? 'yt-dlp.exe' : 'yt-dlp_linux';

    // 1. Check if yt-dlp is installed and functional in system PATH
    try {
      const { stdout } = await execPromise('yt-dlp --version');
      if (stdout && stdout.trim()) {
        console.log(`[Media] Using system yt-dlp (${stdout.trim()})`);
        return 'yt-dlp';
      }
    } catch (e) {}

    // 2. Resolve target binary location (process.cwd or os.tmpdir)
    let localDir = process.cwd();
    let localPath = path.join(localDir, binName);

    try {
      const testFile = path.join(localDir, `.write_test_${Date.now()}`);
      fs.writeFileSync(testFile, '1');
      fs.unlinkSync(testFile);
    } catch (err) {
      localDir = os.tmpdir();
      localPath = path.join(localDir, binName);
    }

    // 3. Verify existing binary integrity (must be > 5MB to be valid executable)
    if (fs.existsSync(localPath)) {
      try {
        const stat = fs.statSync(localPath);
        if (stat.size > 5000000) {
          if (!isWin) fs.chmodSync(localPath, 0o755);

          // Periodically check for updates in background (once every 24h)
          const now = Date.now();
          if (now - lastUpdateCheck > 24 * 60 * 60 * 1000) {
            lastUpdateCheck = now;
            execPromise(`"${localPath}" -U`).catch(() => {});
          }
          return localPath;
        }
        fs.unlinkSync(localPath);
      } catch (e) {}
    }

    // 4. Download latest official binary from GitHub releases
    console.log(`[Media] Downloading ${binName} binary...`);
    const downloadUrl = isWin
      ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
      : (process.arch === 'arm64'
          ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64'
          : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux');

    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} downloading yt-dlp`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 5000000) throw new Error(`Downloaded yt-dlp is incomplete (${buffer.length} bytes)`);

    const tmpPath = `${localPath}.tmp_${Date.now()}`;
    fs.writeFileSync(tmpPath, buffer);
    if (!isWin) fs.chmodSync(tmpPath, 0o755);
    fs.renameSync(tmpPath, localPath);
    console.log(`[Media] Downloaded ${binName} (${(buffer.length / 1024 / 1024).toFixed(1)}MB) successfully.`);
    return localPath;
  })().catch(err => {
    ytdlpCachePromise = null;
    throw err;
  });

  return ytdlpCachePromise;
}

export const ensureYtDlp = downloadYtDlp;
export const pendingCompressions = new Map();

/**
 * Helper to locate any remuxed files created with a prefix in working directory
 */
function findGeneratedFile(prefix) {
  try {
    const dir = process.cwd();
    const files = fs.readdirSync(dir);
    const found = files.find(f => f.startsWith(prefix));
    return found ? path.join(dir, found) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Helper to locate ALL files created with a prefix in working directory (e.g. multi-item Instagram carousels)
 */
function findAllGeneratedFiles(prefix) {
  try {
    const dir = process.cwd();
    const files = fs.readdirSync(dir);
    return files
      .filter(f => f.startsWith(prefix))
      .map(f => path.join(dir, f));
  } catch (e) {
    return [];
  }
}

/**
 * Extract MP3 audio buffer directly from any video URL (Discord attachment, CDN, or direct video link)
 */
export async function extractAudioFromVideoUrl(videoUrl) {
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Failed to fetch video: ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const uniqueId = `ext_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const tempIn = path.join(process.cwd(), `vid_in_${uniqueId}.mp4`);
  const tempOut = path.join(process.cwd(), `aud_out_${uniqueId}.mp3`);
  try {
    fs.writeFileSync(tempIn, buf);
    ensureFfmpegPermissions();
    await execPromise(`"${ffmpegPath}" -y -i "${tempIn}" -vn -c:a libmp3lame -q:a 2 "${tempOut}"`);
    if (fs.existsSync(tempOut) && fs.statSync(tempOut).size > 500) {
      return fs.readFileSync(tempOut);
    }
    return null;
  } finally {
    try { if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn); } catch {}
    try { if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); } catch {}
  }
}

/**
 * Helper to dispatch extracted Instagram media immediately with an optional Extract MP3 button
 */
async function sendInstagramMediaWithMp3Option(message, attachments, label, cleanUrl) {
  const hasVideo = attachments.some(a => a.name && (a.name.endsWith('.mp4') || a.name.endsWith('.webm')));
  const mediaKey = `ig_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  cacheMediaUrl(mediaKey, cleanUrl);

  const components = hasVideo ? [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`extract_mp3_${mediaKey}`)
        .setLabel('Extract MP3')
        .setStyle(ButtonStyle.Secondary)
    )
  ] : [];

  const sentMsg = await message.channel.send({
    content: `-# **${label} Extracted | <a:03_tick_circle:1565665642084827206>** Requested by ${message.author}`,
    files: attachments,
    components: components
  });

  if (hasVideo && sentMsg) {
    cacheMediaUrl(sentMsg.id, cleanUrl);
  }
  await message.delete().catch(() => {});
  return true;
}

/**
 * Comprehensive Instagram Media Extraction Pipeline:
 * Handles Reels, Video Posts, Photo Posts, Carousels (multi-slide albums), and Stories.
 */
async function handleInstagramMedia(client, message, url, tempFilesToClean) {
  // Clean URL of tracking parameters
  let cleanUrl = url;
  try {
    const u = new URL(url);
    u.searchParams.delete('igsh');
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    u.searchParams.delete('si');
    cleanUrl = u.toString();
  } catch (e) {}

  // Strategy 1: cakkatrok-instagram-downloader (Handles Reels, Posts, Photos, Carousels, Stories)
  try {
    const Instagram = (await import('cakkatrok-instagram-downloader')).default;
    const cakkaRes = await Instagram.media(cleanUrl).catch(() => null) || await Instagram(cleanUrl).catch(() => null);
    if (cakkaRes && cakkaRes.media && Array.isArray(cakkaRes.media) && cakkaRes.media.length > 0) {
      const validItems = cakkaRes.media.filter(m => m && m.url && m.url.startsWith('http'));
      if (validItems.length > 0) {
        const attachments = [];
        for (let i = 0; i < Math.min(validItems.length, 10); i++) {
          const item = validItems[i];
          try {
            const mRes = await fetch(item.url, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            if (mRes.ok) {
              const buf = Buffer.from(await mRes.arrayBuffer());
              if (buf.length > 500) {
                const isVid = item.type === 'video' || item.url.includes('.mp4');
                const ext = isVid ? 'mp4' : 'jpg';
                attachments.push(new AttachmentBuilder(buf, { name: `Athena_Instagram_${i + 1}.${ext}` }));
              }
            }
          } catch (fetchErr) {
            console.warn('[Media] Failed to fetch Instagram media item:', fetchErr.message);
          }
        }

        if (attachments.length > 0) {
          const label = attachments.length > 1 ? `Instagram Album (${attachments.length} items)` : 'Instagram Media';
          return await sendInstagramMediaWithMp3Option(message, attachments, label, cleanUrl);
        }
      }
    }
  } catch (errCakka) {
    console.warn('[Media] cakkatrok IG extraction failed:', errCakka.message);
  }

  // Strategy 2: yt-dlp with cookieArg and mobile user-agent (Universal engine for all formats & authenticated downloads)
  try {
    const ytdlpPath = await downloadYtDlp();
    ensureFfmpegPermissions();
    const cookieArg = getCookieArg();
    const uniqueId = `ig_${Date.now()}`;
    const outTemplate = path.join(process.cwd(), `yt_dlp_ig_${uniqueId}_%(autonumber)s.%(ext)s`);

    await execPromise(
      `"${ytdlpPath}" ${cookieArg} --ffmpeg-location "${ffmpegPath}" ` +
      `--user-agent "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0" ` +
      `-f "best/bestvideo+bestaudio/b" --no-playlist --geo-bypass --no-check-certificates ` +
      `-o "${outTemplate}" -- "${cleanUrl}"`
    );

    const generated = findAllGeneratedFiles(`yt_dlp_ig_${uniqueId}`);
    if (generated.length > 0) {
      tempFilesToClean.push(...generated);
      const attachments = [];
      for (let i = 0; i < Math.min(generated.length, 10); i++) {
        const filePath = generated[i];
        if (fs.existsSync(filePath) && fs.statSync(filePath).size > 500) {
          const buf = fs.readFileSync(filePath);
          const ext = path.extname(filePath).replace('.', '') || 'mp4';
          attachments.push(new AttachmentBuilder(buf, { name: `Athena_Instagram_${i + 1}.${ext}` }));
        }
      }
      if (attachments.length > 0) {
        const label = attachments.length > 1 ? `Instagram Album (${attachments.length} items)` : 'Instagram Media';
        return await sendInstagramMediaWithMp3Option(message, attachments, label, cleanUrl);
      }
    }
  } catch (errYtIg) {
    console.warn('[Media] yt-dlp IG extraction failed:', errYtIg.message);
  }

  // Strategy 3: snapsave-media-downloader
  try {
    const { snapsave } = await import('snapsave-media-downloader');
    const snapRes = await snapsave(cleanUrl);
    if (snapRes && snapRes.data && snapRes.data.length > 0) {
      const vidObj = snapRes.data.find(d => d.url && (d.resolution || d.url.includes('.mp4')));
      const targetUrl = vidObj ? vidObj.url : snapRes.data[0].url;
      if (targetUrl) {
        const mRes = await fetch(targetUrl);
        if (mRes.ok) {
          const buf = Buffer.from(await mRes.arrayBuffer());
          const isVid = targetUrl.includes('.mp4') || vidObj !== undefined;
          const ext = isVid ? 'mp4' : 'jpg';
          const attachment = new AttachmentBuilder(buf, { name: `Athena_Instagram.${ext}` });
          return await sendInstagramMediaWithMp3Option(message, [attachment], 'Instagram Media', cleanUrl);
        }
      }
    }
  } catch (errSnap) {
    console.warn('[Media] snapsave IG failed:', errSnap.message);
  }

  // Strategy 4: @mrnima/instagram-downloader
  try {
    const igdl = await import('@mrnima/instagram-downloader');
    const fn = igdl.default?.instagramDownload || igdl.instagramDownload;
    if (typeof fn === 'function') {
      const igRes = await fn(cleanUrl);
      if (igRes && igRes.status && igRes.data && igRes.data.length > 0) {
        const item = igRes.data.find(i => i.url && (i.type === 'video' || i.url.includes('.mp4'))) || igRes.data[0];
        if (item && item.url) {
          const mRes = await fetch(item.url);
          if (mRes.ok) {
            const buf = Buffer.from(await mRes.arrayBuffer());
            const ext = (item.type === 'video' || item.url.includes('.mp4')) ? 'mp4' : 'jpg';
            const attachment = new AttachmentBuilder(buf, { name: `Athena_Instagram.${ext}` });
            return await sendInstagramMediaWithMp3Option(message, [attachment], 'Instagram Media', cleanUrl);
          }
        }
      }
    }
  } catch (errIg) {
    console.warn('[Media] @mrnima IG failed:', errIg.message);
  }

  // Strategy 5: btch-downloader igdl
  try {
    const btch = (await import('btch-downloader')).default;
    if (typeof btch?.igdl === 'function') {
      const btchRes = await btch.igdl(cleanUrl);
      if (btchRes && btchRes.result && btchRes.result.length > 0) {
        const item = btchRes.result.find(i => i.url && i.url.includes('.mp4')) || btchRes.result.find(i => i.url);
        if (item && item.url) {
          const mRes = await fetch(item.url);
          if (mRes.ok) {
            const buf = Buffer.from(await mRes.arrayBuffer());
            const ext = item.url.includes('.mp4') ? 'mp4' : 'jpg';
            const attachment = new AttachmentBuilder(buf, { name: `Athena_Instagram.${ext}` });
            return await sendInstagramMediaWithMp3Option(message, [attachment], 'Instagram Media', cleanUrl);
          }
        }
      }
    }
  } catch (errBtch) {
    console.warn('[Media] btch.igdl failed:', errBtch.message);
  }

  return false;
}

/**
 * Process a media link to extract and send video (MP4)
 */
export async function processMediaLink(client, message, url) {
  let buffer = null;
  let tempFilesToClean = [];

  try {
    if (message.channel && typeof message.channel.sendTyping === 'function') {
      await message.channel.sendTyping().catch(() => {});
    }

    let directUrl = null;
    let localFile = null;

    // 1. TIKTOK (TikWM direct play stream -> btch.ttdl -> yt-dlp)
    if (url.includes('tiktok.com')) {
      try {
        const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        if (data && data.data && data.data.play) {
          directUrl = data.data.play;
        }
      } catch (err) {
        console.error('[Media] TikWM API failed:', err.message);
      }

      if (!directUrl) {
        try {
          const btch = (await import('btch-downloader')).default;
          const res = await btch.ttdl(url);
          if (res && res.video) directUrl = res.video;
        } catch (e) {
          console.error('[Media] btch.ttdl failed:', e.message);
        }
      }
    }

    // 2. INSTAGRAM (Reels, Video Posts, Photo Posts, Carousels, Stories)
    else if (url.includes('instagram.com') || url.includes('instagr.am')) {
      const igHandled = await handleInstagramMedia(client, message, url, tempFilesToClean);
      if (igHandled) return true;
    }

    // 3. TWITTER / X (vxTwitter & FxTwitter APIs -> btch.twitter)
    else if (url.includes('twitter.com') || url.includes('x.com')) {
      const match = url.match(/(?:twitter\.com|x\.com)\/(?:[^\/]+)\/status\/(\d+)/i);
      if (match) {
        const statusId = match[1];
        try {
          const vxRes = await fetch(`https://api.vxtwitter.com/i/status/${statusId}`);
          if (vxRes.ok) {
            const vxData = await vxRes.json();
            if (vxData.media_extended && vxData.media_extended.length > 0) {
              const vid = vxData.media_extended.find(m => m.type === 'video' || m.type === 'gif');
              if (vid && vid.url) directUrl = vid.url;
            } else if (vxData.mediaURLs && vxData.mediaURLs.length > 0) {
              directUrl = vxData.mediaURLs[0];
            }
          }
        } catch (e) {
          console.error('[Media] vxTwitter API failed:', e.message);
        }

        if (!directUrl) {
          try {
            const fxRes = await fetch(`https://api.fxtwitter.com/i/status/${statusId}`);
            if (fxRes.ok) {
              const fxData = await fxRes.json();
              if (fxData.tweet?.media?.videos && fxData.tweet.media.videos.length > 0) {
                directUrl = fxData.tweet.media.videos[0].url;
              }
            }
          } catch (e) {
            console.error('[Media] FxTwitter API failed:', e.message);
          }
        }

        if (!directUrl) {
          try {
            const btch = (await import('btch-downloader')).default;
            const twRes = await btch.twitter(url);
            if (twRes && twRes.url && twRes.url.length > 0) {
              directUrl = twRes.url[0]?.hd || twRes.url[0]?.sd;
            }
          } catch (e) {
            console.error('[Media] btch.twitter failed:', e.message);
          }
        }
      }
    }

    // 4. REDDIT (Direct JSON API)
    else if (url.includes('reddit.com') || url.includes('redd.it')) {
      try {
        const cleanUrl = url.split('?')[0].replace(/\/+$/, '') + '.json';
        const redRes = await fetch(cleanUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (redRes.ok) {
          const redData = await redRes.json();
          const post = redData?.[0]?.data?.children?.[0]?.data;
          const videoUrl = post?.secure_media?.reddit_video?.fallback_url || post?.media?.reddit_video?.fallback_url;
          if (videoUrl) {
            directUrl = videoUrl;
          }
        }
      } catch (errRed) {
        console.warn('[Media] Reddit JSON failed:', errRed.message);
      }
    }

    // 5. PINTEREST (Original High-Res Images & MP4 Videos)
    else if (url.includes('pinterest.com') || url.includes('pin.it') || url.includes('pinimg.com')) {
      try {
        const pinResult = await fetchPinterestMedia(url);
        if (pinResult.success) {
          const dl = await downloadPinterestBuffer(pinResult.mediaUrl, pinResult.fallbackUrl);
          if (dl && dl.buffer) {
            const ext = dl.extension;
            const attachment = new AttachmentBuilder(dl.buffer, { name: `Athena_Pinterest_${Date.now()}.${ext}` });
            const isVid = ext === 'mp4';
            const mediaKey = `pin_${Date.now()}`;
            cacheMediaUrl(mediaKey, url);
            const components = isVid ? [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`extract_mp3_${mediaKey}`)
                  .setLabel('Extract MP3')
                  .setStyle(ButtonStyle.Secondary)
              )
            ] : [];
            const sentPin = await message.channel.send({
              content: `-# **Pinterest Media Extracted | <a:03_tick_circle:1565665642084827206>** Requested by ${message.author} \u00b7 [Source Pin](${pinResult.sourceUrl})`,
              files: [attachment],
              components: components
            });
            if (isVid && sentPin) cacheMediaUrl(sentPin.id, url);
            await message.delete().catch(() => {});
            return true;
          }
        }
      } catch (e) {
        console.error('[Media] Pinterest extraction failed:', e.message);
      }
    }

    // 6. YOUTUBE (Robust Multi-Strategy Pipeline with automatic MP4 remuxing)
    else if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const ytdlpPath = await downloadYtDlp();
      ensureFfmpegPermissions();
      const uniqueId = `yt_${Date.now()}`;
      const tempPath = path.join(process.cwd(), `yt_dlp_video_${uniqueId}.mp4`);
      const filePrefix = `yt_dlp_video_${uniqueId}`;

      // Clean tracking tokens from URL (like ?si=... or &si=...)
      let cleanUrl = url;
      try {
        const u = new URL(url);
        u.searchParams.delete('si');
        u.searchParams.delete('feature');
        u.searchParams.delete('pp');
        cleanUrl = u.toString();
      } catch (e) {}

      // Extract video ID to prepare canonical watch URL
      const idMatch = url.match(/(?:youtube\.com\/(?:shorts\/|watch\?v=|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,15})/);
      const videoId = idMatch ? idMatch[1] : null;
      const watchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;

      const urlsToAttempt = [];
      if (watchUrl) urlsToAttempt.push(watchUrl);
      if (cleanUrl && cleanUrl !== watchUrl) urlsToAttempt.push(cleanUrl);
      if (urlsToAttempt.length === 0) urlsToAttempt.push(url);

      console.log(`[Media] Downloading YouTube media via yt-dlp: ${urlsToAttempt[0]}`);
      const cookieArg = getCookieArg();
      let downloadSuccess = false;

      for (const targetUrl of urlsToAttempt) {
        if (downloadSuccess) break;

        // Strategy 0: Direct Authenticated Stream (Uses active cookies & JS solver)
        try {
          await execPromise(
            `"${ytdlpPath}" ${cookieArg} --ffmpeg-location "${ffmpegPath}" ` +
            `-f "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/18/best[ext=mp4]/best" ` +
            `--remux-video mp4 --no-playlist --geo-bypass --no-check-certificates ` +
            `-o "${tempPath}" -- "${targetUrl}"`
          );
          const resolved = fs.existsSync(tempPath) ? tempPath : findGeneratedFile(filePrefix);
          if (resolved && fs.statSync(resolved).size > 1000) {
            downloadSuccess = true;
            localFile = resolved;
            tempFilesToClean.push(resolved);
            break;
          }
        } catch (err0) {
          console.warn('[Media] YouTube Strategy 0 failed:', err0.message);
        }

        // Strategy A: TV Embedded & iOS client (Bypasses YouTube datacenter bot confirmation blocks!)
        try {
          await execPromise(
            `"${ytdlpPath}" ${cookieArg} --ffmpeg-location "${ffmpegPath}" ` +
            `--extractor-args "youtube:player_client=tv_embedded,ios,android" ` +
            `-f "bestvideo[height<=1080]+bestaudio/18/b/best" ` +
            `--no-playlist --geo-bypass --no-check-certificates ` +
            `-o "${tempPath}" -- "${targetUrl}"`
          );
          const resolved = fs.existsSync(tempPath) ? tempPath : findGeneratedFile(filePrefix);
          if (resolved && fs.statSync(resolved).size > 1000) {
            downloadSuccess = true;
            localFile = resolved;
            tempFilesToClean.push(resolved);
            break;
          }
        } catch (errA) {
          console.warn('[Media] YouTube Strategy A failed:', errA.message);
        }

        // Strategy B: Format 18 direct with tv_embedded & web_creator
        if (!downloadSuccess) {
          try {
            await execPromise(
              `"${ytdlpPath}" ${cookieArg} --ffmpeg-location "${ffmpegPath}" ` +
              `--extractor-args "youtube:player_client=tv_embedded,web_creator" ` +
              `-f "18/b/best" ` +
              `--no-playlist --geo-bypass --no-check-certificates ` +
              `-o "${tempPath}" -- "${targetUrl}"`
            );
            const resolved = fs.existsSync(tempPath) ? tempPath : findGeneratedFile(filePrefix);
            if (resolved && fs.statSync(resolved).size > 1000) {
              downloadSuccess = true;
              localFile = resolved;
              tempFilesToClean.push(resolved);
              break;
            }
          } catch (errB) {
            console.warn('[Media] YouTube Strategy B failed:', errB.message);
          }
        }

        // Strategy C: Universal android client with 18/b/best
        if (!downloadSuccess) {
          try {
            await execPromise(
              `"${ytdlpPath}" ${cookieArg} ` +
              `--extractor-args "youtube:player_client=android" ` +
              `-f "18/b/best" --no-playlist --geo-bypass --no-check-certificates ` +
              `-o "${tempPath}" -- "${targetUrl}"`
            );
            const resolved = fs.existsSync(tempPath) ? tempPath : findGeneratedFile(filePrefix);
            if (resolved && fs.statSync(resolved).size > 1000) {
              downloadSuccess = true;
              localFile = resolved;
              tempFilesToClean.push(resolved);
              break;
            }
          } catch (errC) {
            console.warn('[Media] YouTube Strategy C failed:', errC.message);
          }
        }
      }

      // Strategy D: High-speed btch.youtube API Fallback
      if (!downloadSuccess) {
        try {
          const btch = (await import('btch-downloader')).default;
          if (typeof btch?.youtube === 'function') {
            const res = await btch.youtube(watchUrl || cleanUrl);
            if (res && res.mp4) {
              directUrl = res.mp4;
              downloadSuccess = true;
            }
          }
        } catch (errD) {
          console.warn('[Media] YouTube btch fallback failed:', errD.message);
        }
      }
    }

    // 7. FACEBOOK (btch.fbdown -> universal yt-dlp)
    else if (url.includes('facebook.com') || url.includes('fb.watch')) {
      try {
        const btch = (await import('btch-downloader')).default;
        if (typeof btch?.fbdown === 'function') {
          const res = await btch.fbdown(url);
          if (res && (res.hd || res.sd || res.Normal_video)) {
            directUrl = res.hd || res.Normal_video || res.sd;
          }
        }
      } catch (errFb) {
        console.warn('[Media] Facebook btch fallback failed:', errFb.message);
      }
    }

    // 8. Universal Fallback for any platform or unhandled link
    if (!localFile && !directUrl) {
      console.log(`[Media] Executing universal yt-dlp fallback for: ${url}`);
      try {
        const ytdlpPath = await downloadYtDlp();
        ensureFfmpegPermissions();
        const cookieArg = getCookieArg();
        const uniqueId = `fallback_${Date.now()}`;
        const tempPath = path.join(process.cwd(), `yt_dlp_fallback_video_${uniqueId}.mp4`);
        const filePrefix = `yt_dlp_fallback_video_${uniqueId}`;

        await execPromise(
          `"${ytdlpPath}" ${cookieArg} --ffmpeg-location "${ffmpegPath}" ` +
          `-f "best[ext=mp4]/bestvideo+bestaudio/b/best" ` +
          `--remux-video mp4 --no-playlist --geo-bypass --no-check-certificates ` +
          `-o "${tempPath}" -- "${url}"`
        );
        const resolved = fs.existsSync(tempPath) ? tempPath : findGeneratedFile(filePrefix);
        if (resolved && fs.statSync(resolved).size > 1000) {
          localFile = resolved;
          tempFilesToClean.push(resolved);
        }
      } catch (e) {
        console.error('[Media] Universal yt-dlp fallback failed:', e.message);
      }
    }

    // 8. Resolve Buffer
    if (localFile && fs.existsSync(localFile)) {
      buffer = fs.readFileSync(localFile);
    } else if (directUrl) {
      const videoRes = await fetch(directUrl);
      if (videoRes.ok) {
        buffer = Buffer.from(await videoRes.arrayBuffer());
      }
    }

    if (!buffer || buffer.length < 500) {
      console.warn('[Media] No media buffer resolved for URL:', url);
      return false; // Failed to extract
    }

    const attachment = new AttachmentBuilder(buffer, { name: 'Athena_Media.mp4' });
    const mediaKey = `media_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    cacheMediaUrl(mediaKey, url);
    const mp3Row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`extract_mp3_${mediaKey}`)
        .setLabel('Extract MP3')
        .setStyle(ButtonStyle.Secondary)
    );

    try {
      const sentMsg = await message.channel.send({
        content: `-# **Media Extracted | <a:03_tick_circle:1565665642084827206>** Requested by ${message.author}`,
        files: [attachment],
        components: [mp3Row]
      });
      if (sentMsg) cacheMediaUrl(sentMsg.id, url);
      await message.delete().catch(() => {});
      return true;
    } catch (sendError) {
      if (sendError && sendError.code === 40005) {
        // Exceeded Discord attachment limit -> upload to catbox.moe (supports up to 200MB free)
        const mb = (buffer.length / 1024 / 1024).toFixed(1);
        console.log(`[Media] Discord rejected ${mb}MB file — uploading to catbox.moe...`);
        try {
          const form = new globalThis.FormData();
          form.append('reqtype', 'fileupload');
          form.append('fileToUpload', new Blob([buffer], { type: 'video/mp4' }), 'Athena_Media.mp4');
          const catboxRes = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
          const catboxUrl = (await catboxRes.text()).trim();
          if (catboxUrl && catboxUrl.startsWith('https://')) {
            const sentCatbox = await message.channel.send({
              content: `-# **Media Extracted | <a:03_tick_circle:1565665642084827206>** Requested by ${message.author}\n${catboxUrl}`,
              components: [mp3Row]
            });
            if (sentCatbox) cacheMediaUrl(sentCatbox.id, url);
            await message.delete().catch(() => {});
            return true;
          }
        } catch (catboxError) {
          console.error('[Media] Catbox upload failed:', catboxError);
        }
        await message.channel.send({ content: `-# **Upload Failed:** The video is **${mb}MB** and exceeded Discord's file upload limit.` }).catch(() => null);
        return true;
      }
      throw sendError;
    }
  } catch (error) {
    console.error('[Media Downloader Error]:', error);
    return false;
  } finally {
    for (const f of tempFilesToClean) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch (err) {}
    }
  }
}

/**
 * Process a media link to extract and send audio (MP3)
 */
export async function processMp3Link(client, message, url) {
  let tempFilesToClean = [];
  let downloadedFile = null;
  let audioSuccess = false;

  try {
    if (message.channel && typeof message.channel.sendTyping === 'function') {
      await message.channel.sendTyping().catch(() => {});
    }

    // 1. TIKTOK (TikWM direct music stream - zero CPU encoding!)
    if (url.includes('tiktok.com')) {
      try {
        const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        if (data && data.data && data.data.music) {
          const audioRes = await fetch(data.data.music);
          if (audioRes.ok) {
            const buffer = Buffer.from(await audioRes.arrayBuffer());
            if (buffer.length > 25 * 1024 * 1024) {
              await message.reply({ content: '-# **The audio is too large (Limit: 25MB).**' }).catch(() => {});
              return true;
            }
            const attachment = new AttachmentBuilder(buffer, { name: 'Athena_Audio.mp3' });
            await message.reply({
              content: `-# **Audio Extracted | <a:03_tick_circle:1565665642084827206>** Requested by ${message.author}`,
              files: [attachment]
            });
            return true;
          }
        }
      } catch (err) {
        console.error('[Media] TikWM MP3 extraction failed:', err.message);
      }
    }

    // 2. INSTAGRAM (Reels, Posts, Carousels direct audio extraction)
    if (url.includes('instagram.com')) {
      try {
        const Instagram = (await import('cakkatrok-instagram-downloader')).default;
        const cakkaRes = await Instagram.media(url).catch(() => null) || await Instagram(url).catch(() => null);
        let igVideoUrl = null;
        if (cakkaRes && cakkaRes.media && Array.isArray(cakkaRes.media)) {
          const vidItem = cakkaRes.media.find(m => m && (m.type === 'video' || (m.url && m.url.includes('.mp4'))));
          if (vidItem) igVideoUrl = vidItem.url;
        }
        if (!igVideoUrl) {
          const { snapsave } = await import('snapsave-media-downloader').catch(() => ({}));
          if (snapsave) {
            const snapRes = await snapsave(url).catch(() => null);
            if (snapRes && snapRes.data && snapRes.data.length > 0) {
              const vidObj = snapRes.data.find(d => d.url && (d.resolution || d.url.includes('.mp4')));
              if (vidObj) igVideoUrl = vidObj.url;
            }
          }
        }
        if (igVideoUrl) {
          const mp3Buf = await extractAudioFromVideoUrl(igVideoUrl);
          if (mp3Buf) {
            const attachment = new AttachmentBuilder(mp3Buf, { name: 'Athena_Audio.mp3' });
            await message.reply({
              content: `-# **Audio Extracted | <a:03_tick_circle:1565665642084827206>** Requested by ${message.author}`,
              files: [attachment]
            });
            return true;
          }
        }
      } catch (errIgAudio) {
        console.warn('[Audio] Instagram direct audio extraction failed:', errIgAudio.message);
      }
    }

    // 3. YOUTUBE CLEANING & CANONICAL URL RESOLUTION
    const isYt = url.includes('youtube.com') || url.includes('youtu.be');
    let cleanUrl = url;
    try {
      const u = new URL(url);
      u.searchParams.delete('si');
      u.searchParams.delete('feature');
      u.searchParams.delete('pp');
      cleanUrl = u.toString();
    } catch {}

    const idMatch = url.match(/(?:youtube\.com\/(?:shorts\/|watch\?v=|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,15})/);
    const videoId = idMatch ? idMatch[1] : null;
    const watchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
    const targetUrl = (isYt && watchUrl) ? watchUrl : cleanUrl;

    // 4. UNIVERSAL YT-DLP MP3 EXTRACTION (with ffmpeg-static)
    const ytdlpPath = await downloadYtDlp();
    ensureFfmpegPermissions();
    const uniqueId = `audio_${Date.now()}`;
    const tempPattern = path.join(process.cwd(), `yt_dlp_${uniqueId}.%(ext)s`);
    const filePrefix = `yt_dlp_${uniqueId}`;
    const cookieArg = getCookieArg();

    // Strategy 0: Direct Authenticated Audio Stream (Uses active cookies & JS solver)
    try {
      await execPromise(
        `"${ytdlpPath}" ${cookieArg} --ffmpeg-location "${ffmpegPath}" ` +
        `-x --audio-format mp3 -f "ba/b/best" ` +
        `--no-playlist --geo-bypass --no-check-certificates ` +
        `-o "${tempPattern}" -- "${targetUrl}"`
      );
      const match = findGeneratedFile(filePrefix);
      if (match && fs.existsSync(match) && fs.statSync(match).size > 1000) {
        downloadedFile = match;
        audioSuccess = true;
      }
    } catch (err0) {
      console.warn('[Audio] Strategy 0 audio extraction failed:', err0.message);
    }

    // Strategy A: YouTube TV Embedded / iOS -> Direct FFmpeg MP3 Transcode (Bypasses datacenter blocks)
    if (isYt) {
      const vidTempPath = path.join(process.cwd(), `yt_dlp_vid_${uniqueId}.mp4`);
      const mp3OutPath = path.join(process.cwd(), `yt_dlp_${uniqueId}.mp3`);
      tempFilesToClean.push(vidTempPath, mp3OutPath);

      try {
        await execPromise(
          `"${ytdlpPath}" ${cookieArg} ` +
          `--extractor-args "youtube:player_client=tv_embedded,ios,android" ` +
          `-f "18/b/best" --no-playlist --geo-bypass --no-check-certificates ` +
          `-o "${vidTempPath}" -- "${targetUrl}"`
        );
        const resolvedVid = fs.existsSync(vidTempPath) ? vidTempPath : findGeneratedFile(`yt_dlp_vid_${uniqueId}`);
        if (resolvedVid && fs.existsSync(resolvedVid) && fs.statSync(resolvedVid).size > 1000) {
          try {
            await execPromise(`"${ffmpegPath}" -y -i "${resolvedVid}" -vn -c:a libmp3lame -q:a 2 "${mp3OutPath}"`);
            if (fs.existsSync(mp3OutPath) && fs.statSync(mp3OutPath).size > 1000) {
              downloadedFile = mp3OutPath;
              audioSuccess = true;
            }
          } catch (errFfmpeg) {
            downloadedFile = resolvedVid;
            audioSuccess = true;
          }
        }
      } catch (errYtVid) {
        console.warn('[Audio] YouTube video-audio download failed:', errYtVid.message);
      }
    }

    // Strategy B: Universal yt-dlp audio format with tv_embedded fallback
    if (!audioSuccess) {
      try {
        await execPromise(
          `"${ytdlpPath}" ${cookieArg} --ffmpeg-location "${ffmpegPath}" ` +
          `--extractor-args "youtube:player_client=tv_embedded,ios,android" ` +
          `-x --audio-format mp3 -f "ba/b/best" ` +
          `--no-playlist --geo-bypass --no-check-certificates ` +
          `-o "${tempPattern}" -- "${targetUrl}"`
        );
        const match = findGeneratedFile(filePrefix);
        if (match && fs.existsSync(match) && fs.statSync(match).size > 1000) {
          downloadedFile = match;
          audioSuccess = true;
        }
      } catch (errB) {
        console.warn('[Audio] Strategy B fallback failed:', errB.message);
      }
    }

    if (downloadedFile && fs.existsSync(downloadedFile)) {
      tempFilesToClean.push(downloadedFile);
      const buffer = fs.readFileSync(downloadedFile);

      if (buffer.length > 25 * 1024 * 1024) {
        await message.reply({ content: '-# **The audio is too large (Limit: 25MB).**' }).catch(() => {});
        return true;
      }

      const attachment = new AttachmentBuilder(buffer, { name: `Athena_Audio${path.extname(downloadedFile)}` });
      await message.reply({
        content: `-# **Audio Extracted | <a:03_tick_circle:1565665642084827206>** Requested by ${message.author}`,
        files: [attachment]
      });
      return true;
    }

    await message.reply({ content: '-# **Failed to extract audio from that link.**' }).catch(() => {});
    return false;
  } catch (error) {
    console.error('[Audio Downloader Error]:', error);
    if (error && error.code === 40005) {
      await message.reply({ content: '-# **The media file is too large for this server\'s Discord upload limit.**' }).catch(() => {});
      return true;
    }
    await message.reply({ content: '-# **Failed to extract audio from that link.**' }).catch(() => {});
    return false;
  } finally {
    for (const f of tempFilesToClean) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch (err) {}
    }
  }
}

/**
 * Video compression utility
 */
export async function compressVideo(url) {
  const ytdlpPath = await downloadYtDlp();
  const tempPath = path.join(process.cwd(), `yt_dlp_compressed_${Date.now()}.mp4`);
  await execPromise(`"${ytdlpPath}" --ffmpeg-location "${ffmpegPath}" -f "best[ext=mp4][filesize<9M]/bestvideo[ext=mp4][filesize<7M]+bestaudio[ext=m4a]/worst" --no-playlist -o "${tempPath}" "${url}"`);
  if (fs.existsSync(tempPath)) {
    const buffer = fs.readFileSync(tempPath);
    fs.unlinkSync(tempPath);
    return buffer;
  }
  return null;
}
