import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { AttachmentBuilder } from 'discord.js';

if (ffmpegPath) {
  try {
    ffmpeg.setFfmpegPath(ffmpegPath);
  } catch (err) {
    console.error('[MediaConverter] Failed to set ffmpeg-static path:', err.message);
  }
}

const TEMP_DIR = path.resolve('temp_media');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

/**
 * Format raw bytes into human-readable unit
 */
export function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Downloads a video from URL or writes a Buffer to a temporary file,
 * then converts it to an animated looping GIF using dual-pass palette generation.
 * 
 * @param {string|Buffer} input Video URL, local path, or raw Buffer
 * @param {object} [options]
 * @param {number} [options.duration=15] Max duration in seconds (1 to 30)
 * @param {number} [options.fps=15] Frames per second (8 to 25)
 * @param {number} [options.width=480] Max width in pixels (height auto-scaled)
 * @param {number} [options.speed=1.0] Speed multiplier (0.5 to 3.0)
 * @param {number} [options.maxBytes=8388608] Target maximum file size (8MB)
 * @param {boolean} [options.returnMetadata=false] If true, returns { buffer, ...meta }
 * @returns {Promise<Buffer|object>}
 */
export async function convertMp4ToGif(input, options = {}) {
  const fileId = crypto.randomBytes(8).toString('hex');
  const inputExt = typeof input === 'string' && input.toLowerCase().endsWith('.webm') ? 'webm' : 'mp4';
  const inputPath = path.join(TEMP_DIR, `in_${fileId}.${inputExt}`);
  const outputPath = path.join(TEMP_DIR, `out_${fileId}.gif`);

  const maxDuration = Math.max(1, Math.min(Number(options.duration) || 15, 30));
  const targetFps = Math.max(8, Math.min(Number(options.fps) || 15, 25));
  const targetWidth = Math.max(160, Math.min(Number(options.width) || 480, 720));
  const speedMult = Math.max(0.5, Math.min(Number(options.speed) || 1.0, 3.0));
  const maxBytes = options.maxBytes || 8 * 1024 * 1024; // 8MB

  let inputSizeBytes = 0;

  try {
    // 1. Prepare input source
    if (Buffer.isBuffer(input)) {
      inputSizeBytes = input.length;
      fs.writeFileSync(inputPath, input);
    } else if (typeof input === 'string') {
      if (input.startsWith('http://') || input.startsWith('https://')) {
        // Download with custom User-Agent to prevent bot-blocking
        const res = await fetch(input, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'video/*,*/*;q=0.8'
          }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch video resource`);
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        inputSizeBytes = buffer.length;
        fs.writeFileSync(inputPath, buffer);
      } else if (fs.existsSync(input)) {
        const stats = fs.statSync(input);
        inputSizeBytes = stats.size;
        fs.copyFileSync(input, inputPath);
      } else {
        throw new Error('Invalid input source: File not found');
      }
    } else {
      throw new Error('Unsupported input type for video conversion');
    }

    // 2. Build high-quality dual-pass palette filter
    // Video speed filter: setpts=(1/speed)*PTS
    const speedFilter = speedMult !== 1.0 ? `setpts=${(1 / speedMult).toFixed(2)}*PTS,` : '';
    const vfPreset = `${speedFilter}fps=${targetFps},scale=${targetWidth}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`;

    // 3. First-pass encoding
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .duration(maxDuration)
        .outputOptions(['-vf', vfPreset, '-loop', '0'])
        .toFormat('gif')
        .on('end', resolve)
        .on('error', reject)
        .save(outputPath);
    });

    let gifBuffer = fs.readFileSync(outputPath);

    // 4. File-size safeguard: If output exceeds maxBytes (e.g. 8MB), perform auto-optimization
    if (gifBuffer.length > maxBytes) {
      const fallbackVf = `${speedFilter}fps=10,scale=340:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=2`;
      const fallbackOut = path.join(TEMP_DIR, `fallback_${fileId}.gif`);
      try {
        await new Promise((resolve, reject) => {
          ffmpeg(inputPath)
            .duration(Math.min(maxDuration, 10))
            .outputOptions(['-vf', fallbackVf, '-loop', '0'])
            .toFormat('gif')
            .on('end', resolve)
            .on('error', reject)
            .save(fallbackOut);
        });
        if (fs.existsSync(fallbackOut)) {
          const compBuffer = fs.readFileSync(fallbackOut);
          if (compBuffer.length < gifBuffer.length) {
            gifBuffer = compBuffer;
          }
          fs.unlinkSync(fallbackOut);
        }
      } catch (fbErr) {
        // Fallback error, retain first-pass buffer
      }
    }

    // Attach metadata properties directly to Buffer for backwards compatibility
    gifBuffer.duration = maxDuration;
    gifBuffer.fps = targetFps;
    gifBuffer.width = targetWidth;
    gifBuffer.sizeBytes = gifBuffer.length;
    gifBuffer.originalSizeBytes = inputSizeBytes;

    if (options.returnMetadata) {
      return {
        buffer: gifBuffer,
        duration: maxDuration,
        fps: targetFps,
        width: targetWidth,
        sizeBytes: gifBuffer.length,
        originalSizeBytes: inputSizeBytes
      };
    }

    return gifBuffer;
  } finally {
    // Guaranteed cleanup
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
  }
}

/**
 * Helper to upload the converted GIF buffer to Discord using a Webhook or Channel.
 */
export async function uploadGifToDiscord(interaction, gifBuffer, filename = 'converted.gif') {
  const attachment = new AttachmentBuilder(gifBuffer, { name: filename });
  
  const message = await interaction.channel.send({
    content: '*(Internal Processing: Uploading converted GIF)*',
    files: [attachment]
  });

  const attachmentUrl = message.attachments.first().url;
  await message.delete().catch(() => null);
  return attachmentUrl;
}
