import { createCanvas, loadImage, registerFont } from './canvas.js';
import { AttachmentBuilder } from 'discord.js';
import path from 'path';
import fs from 'fs';
import db from '../database.js';
import { exec } from 'child_process';
import util from 'util';
import ffmpegPath from 'ffmpeg-static';

const execPromise = util.promisify(exec);

// Register Cinzel Bold for the God of War stone-style name font
const CINZEL_PATH = path.resolve('assets/Cinzel-Bold.ttf');
if (fs.existsSync(CINZEL_PATH)) {
  try { registerFont(CINZEL_PATH, { family: 'Cinzel', weight: 'bold' }); } catch {}
}
const ROBOTO_BOLD_PATH = path.resolve('assets/Roboto-Bold.ttf');
if (fs.existsSync(ROBOTO_BOLD_PATH)) {
  try { registerFont(ROBOTO_BOLD_PATH, { family: 'Roboto', weight: 'bold' }); } catch {}
}
const MONTSERRAT_BOLD_PATH = path.resolve('assets/Montserrat-Bold.ttf');
if (fs.existsSync(MONTSERRAT_BOLD_PATH)) {
  try { registerFont(MONTSERRAT_BOLD_PATH, { family: 'Montserrat', weight: 'bold' }); } catch {}
}

/**
 * Helper: draw a rounded rect path (fallback for older canvas)
 */
function rrPath(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

// Cache Hogwarts master assets in memory so disk is read only once
let hogwartsAssetsCache = null;
async function getHogwartsAssets() {
  if (hogwartsAssetsCache) return hogwartsAssetsCache;
  const [bgImg, owlImg, ringImg] = await Promise.all([
    loadImage(path.resolve('src/assets/rank_hogwarts_master.png')),
    loadImage(path.resolve('src/assets/hedwig_sprite_clean.png')),
    loadImage(path.resolve('src/assets/avatar_runic_ring.png'))
  ]);
  hogwartsAssetsCache = { bgImg, owlImg, ringImg };
  return hogwartsAssetsCache;
}

// Pre-calculate candle positions on Hogwarts altar & castle
const HOGWARTS_CANDLES = [
  { x: 13, y: 76, r: 8 },
  { x: 34, y: 114, r: 9 },
  { x: 52, y: 142, r: 8 },
  { x: 70, y: 168, r: 8 },
  { x: 198, y: 126, r: 9 },
  { x: 216, y: 154, r: 8 },
  { x: 326, y: 276, r: 16 }, // desk lantern
  { x: 964, y: 243, r: 10 },
  { x: 945, y: 38,  r: 8  },
  { x: 989, y: 204, r: 7  }
];

// Pre-calculate deterministic fire embers / sparks
const NUM_EMBERS = 28;
const HOGWARTS_EMBERS = [];
for (let i = 0; i < NUM_EMBERS; i++) {
  HOGWARTS_EMBERS.push({
    x: 80 + (i * 39) % 880,
    y: 30 + (i * 29) % 280,
    vx: -(0.4 + (i % 3) * 0.35),
    vy: -(1.1 + (i % 4) * 0.45),
    size: 1.1 + (i % 3) * 0.8,
    alpha: 0.45 + (i % 5) * 0.12,
    phase: i * 0.45
  });
}

export async function generateAthenaClassicRankCard(member, xp, level, rank, requiredXp) {
  const W = 1024;
  const H = 342;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background obsidian gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#0f1117');
  bgGrad.addColorStop(0.5, '#161922');
  bgGrad.addColorStop(1, '#0a0b0e');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid texture
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Border frame
  ctx.strokeStyle = 'rgba(230, 40, 40, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, W - 12, H - 12);

  // Avatar setup
  const avatarCX = 150;
  const avatarCY = 171;
  const avatarR = 85;

  // Outer glowing ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCX, avatarCY, avatarR + 8, 0, Math.PI * 2);
  ctx.strokeStyle = '#e62828';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(230, 40, 40, 0.8)';
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.restore();

  // Draw Avatar
  try {
    const avatarUrl = member?.user?.displayAvatarURL ? member.user.displayAvatarURL({ extension: 'png', size: 256 }) : null;
    if (avatarUrl) {
      const av = await loadImage(avatarUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(av, avatarCX - avatarR, avatarCY - avatarR, avatarR * 2, avatarR * 2);
      ctx.restore();
    }
  } catch {}

  // Name
  let rawName = member?.displayName?.replace(/[^\x00-\x7F]/g, '').trim()
             || member?.user?.username?.replace(/[^\x00-\x7F]/g, '').trim()
             || 'MEMBER';
  if (rawName.length > 20) rawName = rawName.substring(0, 20) + '...';

  ctx.font = 'bold 36px "Cinzel", "Montserrat", serif';
  ctx.fillStyle = '#f1f5f9';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 8;
  ctx.fillText(rawName.toUpperCase(), 290, 110);
  ctx.shadowBlur = 0;

  // Level & Rank
  ctx.font = '22px "Cinzel", "Montserrat", serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`Rank #${rank}`, 290, 160);

  ctx.font = 'bold 36px "Cinzel", "Montserrat", serif';
  ctx.fillStyle = '#ef4444';
  ctx.shadowColor = 'rgba(239, 68, 68, 0.7)';
  ctx.shadowBlur = 10;
  ctx.fillText(`Level ${level}`, 480, 160);
  ctx.shadowBlur = 0;

  // XP Progress Bar
  const barX = 290;
  const barY = 205;
  const barW = 660;
  const barH = 24;
  const r = 12;

  rrPath(ctx, barX, barY, barW, barH, r);
  ctx.fillStyle = '#1e2330';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const pct = Math.max(0.02, Math.min(1, xp / Math.max(1, requiredXp)));
  const fillW = Math.max(r * 2, barW * pct);

  ctx.save();
  rrPath(ctx, barX, barY, fillW, barH, r);
  const fillGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
  fillGrad.addColorStop(0, '#b91c1c');
  fillGrad.addColorStop(1, '#ef4444');
  ctx.fillStyle = fillGrad;
  ctx.shadowColor = 'rgba(239, 68, 68, 0.8)';
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.restore();

  ctx.font = 'bold 15px "Montserrat", "Roboto", sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.textAlign = 'right';
  ctx.fillText(`${xp.toLocaleString()} / ${requiredXp.toLocaleString()} XP (${Math.round(pct * 100)}%)`, barX + barW, barY - 8);
  ctx.textAlign = 'left';

  ctx.font = '13px "Cinzel", "Montserrat", serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Athena Prime Defense & Leveling Engine', 290, 275);

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'rank-card.png' });
}

export async function generateRankCard(member, xp, level, rank, requiredXp) {
  const userId = member?.user?.id || member?.id;
  const theme = db.getUserRankTheme(userId);
  if (theme === 'athena' || theme === 'classic') {
    return generateAthenaClassicRankCard(member, xp, level, rank, requiredXp);
  }
  return generateHogwartsRankGif(member, xp, level, rank, requiredXp);
}

export async function generateHogwartsRankGif(member, xp, level, rank, requiredXp) {
  const W = 1024;
  const H = 342;
  const numFrames = 12;

  const tempDir = path.resolve(`data/rank_temp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
  fs.mkdirSync(tempDir, { recursive: true });

  let firstFrameBuffer = null;

  try {
    const { bgImg, owlImg, ringImg } = await getHogwartsAssets();

    // Fetch Avatar with robust fallback
    let avatarImg = null;
    if (member?.user?.displayAvatarURL) {
      try {
        const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
        avatarImg = await loadImage(avatarUrl).catch(() => null);
      } catch {}
    }

    // Name formatting
    let rawName = member?.displayName?.replace(/[^\x00-\x7F]/g, '').trim()
               || member?.user?.username?.replace(/[^\x00-\x7F]/g, '').trim()
               || 'MEMBER';
    if (rawName.length > 22) rawName = rawName.substring(0, 22) + '...';
    const upperName = rawName.toUpperCase();

    // Split at first space or halfway if long single word
    let part1 = upperName;
    let part2 = '';
    const spaceIdx = upperName.indexOf(' ');
    if (spaceIdx > 0 && spaceIdx < upperName.length - 1) {
      part1 = upperName.substring(0, spaceIdx);
      part2 = upperName.substring(spaceIdx + 1);
    } else if (upperName.length > 7) {
      const mid = Math.ceil(upperName.length / 2);
      part1 = upperName.substring(0, mid);
      part2 = upperName.substring(mid);
    }

    // Font size scaling
    let nameFontSize = 38;
    if (upperName.length > 18) nameFontSize = 26;
    else if (upperName.length > 13) nameFontSize = 32;

    // Relative XP calculation
    let prevXp = 0;
    if (level > 0) prevXp = 100 * Math.pow(level, 2) + 100 * level;
    const relXp  = Math.max(0, xp - prevXp);
    const relReq = Math.max(1, requiredXp - prevXp);
    const pct    = Math.min(Math.max(relXp / relReq, 0.02), 1.0);

    // Progress Bar parameters
    const barX = 340, barY = 195, barW = 600, barH = 20, barR = 10;
    const fillW = Math.max(barH, barW * pct);

    // Avatar center and radius
    const avX = 210, avY = 138, avR = 81;

    // Render 12 frames
    for (let f = 0; f < numFrames; f++) {
      const phi = (2 * Math.PI * f) / numFrames;
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext('2d');

      // 1. Master Background Plate
      ctx.drawImage(bgImg, 0, 0, W, H);

      // 2. Animated Candle Flames & Lantern Aura
      for (let cIdx = 0; cIdx < HOGWARTS_CANDLES.length; cIdx++) {
        const c = HOGWARTS_CANDLES[cIdx];
        const flicker = 0.75 + 0.25 * Math.sin(phi * 2 + cIdx * 1.5) + 0.08 * Math.cos(phi * 3 + cIdx);
        const rad = c.r * flicker;
        const g = ctx.createRadialGradient(c.x, c.y, 1, c.x, c.y, rad * 2.2);
        g.addColorStop(0, 'rgba(255, 235, 140, 0.75)');
        g.addColorStop(0.35, 'rgba(255, 130, 30, 0.35)');
        g.addColorStop(1, 'rgba(255, 60, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(c.x, c.y, rad * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Avatar Fire Halo, Clipped Avatar & Runic Crest Overlay
      const haloR = 88 + Math.sin(phi) * 3;
      const halo = ctx.createRadialGradient(avX, avY, 78, avX, avY, haloR + 14);
      halo.addColorStop(0, 'rgba(240, 40, 20, 0.45)');
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(avX, avY, haloR + 14, 0, Math.PI * 2);
      ctx.fill();

      // Draw Avatar (or dark fallback if unavailable)
      ctx.save();
      ctx.beginPath();
      ctx.arc(avX, avY, avR, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      if (avatarImg) {
        ctx.drawImage(avatarImg, avX - avR, avY - avR, avR * 2, avR * 2);
      } else {
        const defaultAvGrad = ctx.createRadialGradient(avX, avY, 10, avX, avY, avR);
        defaultAvGrad.addColorStop(0, '#551111');
        defaultAvGrad.addColorStop(1, '#1a0505');
        ctx.fillStyle = defaultAvGrad;
        ctx.fillRect(avX - avR, avY - avR, avR * 2, avR * 2);
        ctx.font = 'bold 50px "Cinzel", "Montserrat", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText((rawName[0] || '?').toUpperCase(), avX, avY + 18);
        ctx.textAlign = 'left';
      }
      ctx.restore();

      // Overlay Runic Ring on top of avatar edge
      ctx.drawImage(ringImg, 0, 0, W, H);

      // 4. Hedwig Owl Floating & Soaring Hover
      const owlCX = 890;
      const owlCY = 68;
      const floatY = Math.sin(phi) * 4.2;
      const tilt = Math.cos(phi) * 0.025;
      const owlW = 195;
      const owlH = 195;

      ctx.save();
      ctx.translate(owlCX, owlCY + floatY);
      ctx.rotate(tilt);
      ctx.drawImage(owlImg, -owlW / 2, -owlH / 2, owlW, owlH);
      ctx.restore();

      // 5. Dynamic Flaming Progress Bar
      // Outer track
      ctx.fillStyle = 'rgba(12, 3, 3, 0.88)';
      rrPath(ctx, barX, barY, barW, barH, barR);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120, 25, 25, 0.6)';
      ctx.lineWidth = 1.5;
      rrPath(ctx, barX, barY, barW, barH, barR);
      ctx.stroke();

      // Fiery animated fill
      ctx.save();
      rrPath(ctx, barX, barY, fillW, barH, barR);
      ctx.clip();

      const flameGrad = ctx.createLinearGradient(barX - (f * 15), barY, barX + fillW + (f * 15), barY);
      flameGrad.addColorStop(0, '#550000');
      flameGrad.addColorStop(0.3, '#aa1111');
      flameGrad.addColorStop(0.7, '#ff2222');
      flameGrad.addColorStop(1, '#ff8888');
      ctx.fillStyle = flameGrad;
      ctx.fillRect(barX, barY, fillW, barH);

      // Crackling lightning arcs along fill
      ctx.strokeStyle = 'rgba(255, 230, 230, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(barX + 10, barY + barH / 2);
      let lx = barX + 10;
      while (lx < barX + fillW - 8) {
        lx += 15 + Math.random() * 10;
        const ly = barY + barH / 2 + (Math.sin(phi * 3 + lx) * 3);
        ctx.lineTo(lx, ly);
      }
      ctx.stroke();
      ctx.restore();

      // Plasma Head Orb
      const headX = barX + fillW;
      const headY = barY + barH / 2;
      const orbR = 12 + Math.sin(phi * 2) * 1.8;
      const orbGrad = ctx.createRadialGradient(headX, headY, 1, headX, headY, orbR * 1.8);
      orbGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      orbGrad.addColorStop(0.3, 'rgba(255, 80, 50, 0.95)');
      orbGrad.addColorStop(0.7, 'rgba(230, 20, 20, 0.45)');
      orbGrad.addColorStop(1, 'rgba(200, 0, 0, 0)');
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(headX, headY, orbR * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // 6. Fire Sparks / Embers Particle Drift
      for (let eIdx = 0; eIdx < HOGWARTS_EMBERS.length; eIdx++) {
        const e = HOGWARTS_EMBERS[eIdx];
        const curX = (e.x + e.vx * f * 4 + W) % W;
        let curY = e.y + e.vy * f * 4;
        if (curY < 0) curY += H;
        const waveX = curX + Math.sin(phi + e.phase) * 5;
        const sparkAlpha = e.alpha * (0.7 + 0.3 * Math.sin(phi * 2 + eIdx));

        ctx.fillStyle = (eIdx % 2 === 0)
          ? `rgba(255, 200, 70, ${sparkAlpha})`
          : `rgba(255, 60, 30, ${sparkAlpha})`;
        ctx.beginPath();
        ctx.arc(waveX, curY, e.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 7. Dynamic Typography
      // Username Dual-Tone
      const nameX = 340, nameY = 110;
      ctx.font = `bold ${nameFontSize}px "Cinzel", "Montserrat", "Roboto", serif`;
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      // Part 1: Silver Stone
      ctx.fillStyle = '#eaecee';
      ctx.fillText(part1, nameX, nameY);
      const p1w = ctx.measureText(part1).width;

      // Part 2: Fiery Crimson
      if (part2) {
        ctx.shadowColor = 'rgba(230, 20, 20, 0.7)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#ff2222';
        ctx.fillText(' ' + part2, nameX + p1w, nameY);
      }
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Rank
      ctx.font = 'bold 20px "Montserrat", "Roboto", sans-serif';
      ctx.fillStyle = '#9ea5b0';
      ctx.fillText(`Rank #${rank}`, nameX + 2, nameY + 42);

      // Level
      const lvlBaseX = 640, lvlBaseY = 152;
      ctx.font = '24px "Cinzel", "Montserrat", serif';
      ctx.fillStyle = '#b8bec8';
      ctx.fillText('Level', lvlBaseX, lvlBaseY);
      const lvlLabelW = ctx.measureText('Level').width;

      ctx.font = 'bold 44px "Cinzel", "Montserrat", serif';
      ctx.fillStyle = '#ff2222';
      ctx.shadowColor = 'rgba(255, 30, 30, 0.8)';
      ctx.shadowBlur = 14;
      ctx.fillText(` ${level}`, lvlBaseX + lvlLabelW, lvlBaseY + 6);
      ctx.shadowBlur = 0;

      // XP Text
      ctx.font = 'bold 13px "Montserrat", "Roboto", monospace';
      ctx.fillStyle = '#9ea5b0';
      ctx.textAlign = 'right';
      ctx.fillText(`${xp.toLocaleString()} / ${requiredXp.toLocaleString()} XP`, barX + barW, barY - 7);
      ctx.textAlign = 'left';

      // Save frame PNG
      const frameBuffer = canvas.toBuffer('image/png');
      if (f === 0) firstFrameBuffer = frameBuffer;
      const framePath = path.join(tempDir, `frame_${String(f).padStart(2, '0')}.png`);
      fs.writeFileSync(framePath, frameBuffer);
    }

    // 2-pass FFmpeg Palettegen + Paletteuse for highest fidelity GIF
    const gifOutPath = path.join(tempDir, 'rank-card.gif');
    const palettePath = path.join(tempDir, 'palette.png');

    const genPaletteCmd = `"${ffmpegPath}" -y -framerate 10 -i "${tempDir}/frame_%02d.png" -vf "palettegen=stats_mode=diff" "${palettePath}"`;
    const encodeGifCmd = `"${ffmpegPath}" -y -framerate 10 -i "${tempDir}/frame_%02d.png" -i "${palettePath}" -lavfi "paletteuse=dither=bayer:bayer_scale=3" "${gifOutPath}"`;

    await execPromise(genPaletteCmd);
    await execPromise(encodeGifCmd);

    const gifBuffer = fs.readFileSync(gifOutPath);
    return new AttachmentBuilder(gifBuffer, { name: 'rank-card.gif' });
  } catch (err) {
    console.error('[RankCard] Animated GIF generation error, falling back to static card:', err);
    if (firstFrameBuffer) {
      return new AttachmentBuilder(firstFrameBuffer, { name: 'rank-card.png' });
    }
    const fallbackCanvas = createCanvas(W, H);
    return new AttachmentBuilder(fallbackCanvas.toBuffer('image/png'), { name: 'rank-card.png' });
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

export async function generateLeaderboard(guild, users, page, totalPages) {
  const width = 800;
  const height = 150 + (users.length * 80);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#2b2d31';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(0, 0, width, height, 20);
  } else {
    ctx.rect(0, 0, width, height);
  }
  ctx.fill();

  // Header
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${guild.name} Leaderboard`, width / 2, 70);

  ctx.fillStyle = '#b9bbbe';
  ctx.font = '24px sans-serif';
  ctx.fillText(`Page ${page} / ${totalPages}`, width / 2, 110);

  // Draw Users
  ctx.textAlign = 'left';
  let yPos = 160;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const rankNum = ((page - 1) * 10) + i + 1;

    ctx.fillStyle = rankNum <= 3 ? '#FFD700' : '#b9bbbe';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(`#${rankNum}`, 40, yPos + 40);

    try {
      const member = await guild.members.fetch(user.userId).catch(() => null);
      if (member) {
        const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 64 });
        const av = await loadImage(avatarUrl).catch(() => null);
        if (av) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(160, yPos + 30, 30, 0, Math.PI * 2, true);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(av, 130, yPos, 60, 60);
          ctx.restore();
        }
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        let dname = member.displayName.replace(/[^\x00-\x7F]/g, '').trim()
                 || member.user.username.replace(/[^\x00-\x7F]/g, '').trim()
                 || 'User';
        if (dname.length > 20) dname = dname.substring(0, 20) + '...';
        ctx.fillText(dname, 210, yPos + 40);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('Unknown User', 210, yPos + 40);
      }
    } catch {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('Unknown User', 210, yPos + 40);
    }

    ctx.fillStyle = '#5865F2';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Level ${user.level}`, width - 40, yPos + 25);

    ctx.fillStyle = '#b9bbbe';
    ctx.font = '20px sans-serif';
    ctx.fillText(`${user.xp} XP`, width - 40, yPos + 55);

    ctx.textAlign = 'left';
    yPos += 80;
  }

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'leaderboard.png' });
}

export async function generateProfileCard(member, xpData, statsData, guild) {
  const W = 960;
  const H = 340;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  let bgLoaded = false;
  for (const bgPath of ['src/assets/rank_gow_bg.png', 'src/assets/rank_bg.jpg']) {
    try {
      const bg = await loadImage(bgPath);
      ctx.drawImage(bg, 0, 0, W, H);
      bgLoaded = true;
      break;
    } catch {}
  }
  if (!bgLoaded) {
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, W, H);
  }

  // Semi-transparent dark overlay for high contrast
  ctx.fillStyle = 'rgba(7, 7, 10, 0.65)';
  ctx.fillRect(0, 0, W, H);

  // Border frame
  ctx.strokeStyle = 'rgba(165, 20, 20, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, W - 8, H - 8);

  // Avatar Setup
  const avatarCX = 135;
  const avatarCY = 155;
  const avatarR = 80;

  // Red ring / seal behind avatar
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCX, avatarCY, avatarR + 10, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(190, 25, 25, 0.7)';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#cc1818';
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.restore();

  // Draw Avatar
  try {
    const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
    const av = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(av, avatarCX - avatarR, avatarCY - avatarR, avatarR * 2, avatarR * 2);
    ctx.restore();
  } catch {
    ctx.fillStyle = '#222226';
    ctx.beginPath();
    ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Username in Cinzel Two-Tone
  let rawName = member.displayName.replace(/[^\x00-\x7F]/g, '').trim()
             || member.user.username.replace(/[^\x00-\x7F]/g, '').trim()
             || 'Warrior';
  if (rawName.length > 18) rawName = rawName.substring(0, 18) + '...';
  const upperName = rawName.toUpperCase();

  let part1 = upperName;
  let part2 = '';
  const spaceIdx = upperName.indexOf(' ');
  if (spaceIdx > 0 && spaceIdx < upperName.length - 1) {
    part1 = upperName.substring(0, spaceIdx);
    part2 = upperName.substring(spaceIdx + 1);
  } else if (upperName.length > 5) {
    const mid = Math.ceil(upperName.length / 2);
    part1 = upperName.substring(0, mid);
    part2 = upperName.substring(mid);
  }

  const textX = 255;
  const nameY = 85;

  ctx.font = `bold 38px "Cinzel", "Montserrat", "Roboto", serif`;
  ctx.fillStyle = '#b0b4bb'; // Stone grey
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 8;
  ctx.fillText(part1, textX, nameY);
  const p1Width = ctx.measureText(part1).width;

  if (part2) {
    ctx.fillStyle = '#cc1818'; // Blood red
    ctx.shadowColor = 'rgba(204,24,24,0.6)';
    ctx.shadowBlur = 10;
    ctx.fillText(' ' + part2, textX + p1Width, nameY);
  }
  ctx.shadowBlur = 0;

  // Subtitle: Server & Badges
  ctx.fillStyle = '#7a7f87';
  ctx.font = `bold 16px "Montserrat", "Roboto", sans-serif`;
  ctx.fillText(`MEMBER OF ${guild.name.toUpperCase()} • ATHENA VERIFIED`, textX, nameY + 28);

  // Divider line
  ctx.strokeStyle = 'rgba(180, 30, 30, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(textX, nameY + 42);
  ctx.lineTo(W - 40, nameY + 42);
  ctx.stroke();

  // Metrics Grid (Level, Rank, Messages, Voice Hours)
  const gridY = nameY + 85;
  const metrics = [
    { label: 'LEVEL', value: `${xpData.level || 0}`, color: '#ffffff' },
    { label: 'RANK', value: `#${xpData.rank || 1}`, color: '#cc1818' },
    { label: 'MESSAGES', value: `${(statsData.messages || 0).toLocaleString()}`, color: '#ffffff' },
    { label: 'VOICE TIME', value: `${((statsData.voiceSeconds || 0) / 3600).toFixed(1)}h`, color: '#ffffff' }
  ];

  const colWidth = 160;
  for (let i = 0; i < metrics.length; i++) {
    const mx = textX + (i * colWidth);
    ctx.fillStyle = '#656b73';
    ctx.font = `bold 13px "Montserrat", "Roboto", sans-serif`;
    ctx.fillText(metrics[i].label, mx, gridY);

    ctx.fillStyle = metrics[i].color;
    ctx.font = `bold 24px "Cinzel", "Montserrat", "Roboto", serif`;
    ctx.fillText(metrics[i].value, mx, gridY + 30);
  }

  // XP Progress Bar
  const barX = textX;
  const barY = gridY + 75;
  const barW = W - textX - 45;
  const barH = 18;
  const barR = 9;

  ctx.fillStyle = 'rgba(20, 4, 4, 0.85)';
  rrPath(ctx, barX, barY, barW, barH, barR);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 15, 15, 0.7)';
  ctx.lineWidth = 1.5;
  rrPath(ctx, barX, barY, barW, barH, barR);
  ctx.stroke();

  const reqXp = xpData.requiredXp || 1000;
  const currXp = xpData.xp || 0;
  const ratio = Math.min(currXp / reqXp, 1);
  const fillW = Math.max(barR * 2, barW * ratio);

  const xpGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
  xpGrad.addColorStop(0, '#6b0000');
  xpGrad.addColorStop(0.5, '#bb1010');
  xpGrad.addColorStop(1, '#ff3838');
  ctx.fillStyle = xpGrad;
  rrPath(ctx, barX, barY, fillW, barH, barR);
  ctx.fill();

  // XP Text
  ctx.fillStyle = '#a5a9b0';
  ctx.font = `bold 12px "Montserrat", "Roboto", sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText(`${currXp.toLocaleString()} / ${reqXp.toLocaleString()} XP`, barX + barW, barY - 6);
  ctx.textAlign = 'left';

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'profile_card.png' });
}

/**
 * Helper: parse hex color into { r, g, b }
 */
function parseAccentRgb(hex = '#00f0ff') {
  const clean = String(hex || '#00f0ff').replace(/[^0-9a-fA-F]/g, '');
  const hex6 = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean.padEnd(6, '0').slice(0, 6);
  const intVal = parseInt(hex6, 16) || 0x00f0ff;
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255
  };
}

// Tactical constants for War-Room HUD live animations
const GLOBE_CONTINENT_NODES = [
  // North America
  { lat: 0.65, lon: -1.75 }, { lat: 0.75, lon: -1.60 }, { lat: 0.60, lon: -1.40 }, { lat: 0.85, lon: -1.80 },
  // South America
  { lat: -0.20, lon: -1.05 }, { lat: -0.45, lon: -0.95 }, { lat: -0.10, lon: -1.20 },
  // Europe
  { lat: 0.85, lon: 0.15 }, { lat: 0.95, lon: 0.35 }, { lat: 0.75, lon: 0.20 },
  // Africa
  { lat: 0.10, lon: 0.35 }, { lat: -0.40, lon: 0.45 }, { lat: 0.35, lon: 0.40 }, { lat: -0.15, lon: 0.50 },
  // Asia
  { lat: 0.65, lon: 1.40 }, { lat: 0.80, lon: 1.80 }, { lat: 0.55, lon: 1.95 }, { lat: 0.40, lon: 1.35 }, { lat: 0.70, lon: 2.20 },
  // Australia
  { lat: -0.45, lon: 2.35 }, { lat: -0.55, lon: 2.50 }
];

const WORLD_MAP_NODES = [
  { name: 'US-W', x: 96, y: 304, phase: 0.0 },
  { name: 'US-E', x: 135, y: 310, phase: 1.2 },
  { name: 'SA', x: 148, y: 358, phase: 2.4 },
  { name: 'EU-W', x: 186, y: 298, phase: 0.7 },
  { name: 'EU-E', x: 198, y: 302, phase: 1.9 },
  { name: 'AF', x: 202, y: 352, phase: 3.1 },
  { name: 'ME', x: 218, y: 320, phase: 0.4 },
  { name: 'IN', x: 234, y: 326, phase: 1.6 },
  { name: 'EA', x: 254, y: 342, phase: 2.8 },
  { name: 'JP', x: 268, y: 312, phase: 0.9 },
  { name: 'AU', x: 274, y: 362, phase: 2.1 }
];

const WORLD_MAP_ROUTES = [
  [0, 1], [1, 3], [3, 4], [4, 6], [6, 7], [7, 8], [8, 9], [9, 0], [1, 2], [3, 5], [8, 10]
];

const BAR_STARFIELD = Array.from({ length: 32 }, () => ({
  relX: Math.random(),
  relY: 0.15 + Math.random() * 0.70,
  size: 0.8 + Math.random() * 1.4,
  baseAlpha: 0.25 + Math.random() * 0.55,
  twinkleSpeed: 1 + Math.random() * 2,
  phase: Math.random() * Math.PI * 2
}));

/**
 * Generates an ultra-high-definition War-Room Cyber HUD animated GIF or static card.
 * Modeled after the flagship Athena Prime command center war-room master plate:
 * - 1024x512 Master Tactical Command Center base plate with holographic 3D globe & consoles.
 * - Circular Server Icon Reticle with 16 rotating radar ticks, concentric neon rings, and glass sheen.
 * - Intelligent Server Accent Color Sync (radial wash over globe, holographic displays, and reticle).
 * - Status Badge Pill with pulsing indicator dot and sequentially animated forward-flowing chevron arrows (>>>).
 * - Beveled Electric Plasma Progress Bar with dual-harmonic lightning sine waves & pulsing head orb with cross glints.
 * - 0% State with active breathing locator beacon and charging aura.
 * - 3 Frosted Tactical Metric Chips with 7-segment hardware gauge telemetry tick meters.
 */
const NATIVE_MAP_LIGHTS = [
  { x: 77, y: 311, phase: 0.0 },
  { x: 87, y: 323, phase: 1.5 },
  { x: 107, y: 301, phase: 0.8 },
  { x: 139, y: 315, phase: 2.2 },
  { x: 153, y: 313, phase: 1.1 },
  { x: 165, y: 327, phase: 2.7 },
  { x: 189, y: 329, phase: 0.4 },
  { x: 239, y: 319, phase: 1.9 }
];

export async function generateCommandStatusBanner({
  title = 'SYSTEM MATRIX',
  subtitle = 'ATHENA PRIME DEFENSE ENGINE',
  badge = 'ACTIVE',
  badgeColor = null,
  iconUrl = null,
  fallbackInitial = 'A',
  current = 0,
  total = 25,
  unit = 'UNITS',
  accentColor = '#00f0ff',
  metrics = [],
  attachmentName = 'status_banner.gif',
  animated = true
} = {}) {
  const W = 1024;
  const H = 512;
  const numFrames = animated ? 8 : 1;
  const tempDir = path.resolve(`data/status_gif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);

  if (animated) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  let firstFrameBuffer = null;

  // 1. Resolve War-Room Clean Master Base Plate
  let plateImg = null;
  const cleanPlatePath = path.resolve('src/assets/hud_war_room_clean.png');
  const fallbackPlatePath = path.resolve('src/assets/hud_war_room_plate.jpg');
  try {
    if (fs.existsSync(cleanPlatePath)) {
      plateImg = await loadImage(cleanPlatePath);
    } else if (fs.existsSync(fallbackPlatePath)) {
      plateImg = await loadImage(fallbackPlatePath);
    }
  } catch (err) {
    console.error('[CommandStatusBanner] Notice: base plate load error, fallback to procedural obsidian:', err.message);
  }

  let masterPlateImg = null;
  try {
    if (fs.existsSync(fallbackPlatePath)) {
      masterPlateImg = await loadImage(fallbackPlatePath);
    }
  } catch {}

  // 2. Resolve Server Icon Image Reliably
  let iconImg = null;
  if (iconUrl) {
    try {
      const pngUrl = String(iconUrl).replace(/\.webp(\?.*)?$/i, '.png$1');
      iconImg = await loadImage(pngUrl);
    } catch (err) {
      console.error('[CommandStatusBanner] Notice: Failed to load icon image, using fallback initial:', err.message);
    }
  }

  const { r, g, b } = parseAccentRgb(accentColor);
  const effectiveBadgeColor = badgeColor || accentColor;

  const clamped = Math.max(0, Math.min(current, total));
  const ratio = total > 0 ? clamped / total : 0;
  const pct = Math.round(ratio * 100);

  // Exact 1:1 Pixel Coordinates matching Reference Artwork
  const iconCX = 166;
  const iconCY = 155;
  const iconR = 58;

  const barX = 246;
  const barY = 157;
  const barW = 554;
  const barH = 22;
  const barR = 11;
  const fillW = total > 0 && clamped > 0 ? Math.max(38, Math.min(barW, Math.round(barW * ratio))) : 0;

  // Pre-process textures
  const globeCX = 512, globeCY = 309, globeR = 58;
  const globeSize = globeR * 2;
  const rotatedGlobeCanvases = [];
  let barTextureCanvas = null;
  let flagCanvas = null;

  const flagX = 958, flagY = 68, flagW = 40, flagH = 125;

  if (masterPlateImg) {
    barTextureCanvas = createCanvas(barW, barH);
    barTextureCanvas.getContext('2d').drawImage(masterPlateImg, barX, barY, barW, barH, 0, 0, barW, barH);

    flagCanvas = createCanvas(flagW, flagH);
    flagCanvas.getContext('2d').drawImage(masterPlateImg, flagX, flagY, flagW, flagH, 0, 0, flagW, flagH);

    const globeCanvas = createCanvas(globeSize, globeSize);
    const gCtx = globeCanvas.getContext('2d');
    gCtx.drawImage(masterPlateImg, globeCX - globeR, globeCY - globeR, globeSize, globeSize, 0, 0, globeSize, globeSize);

    // Cleanly inpaint bottom ring arc out of rotating sphere texture
    const gImgData = gCtx.getImageData(0, 0, globeSize, globeSize);
    const gData = gImgData.data;
    for (let y = 60; y < globeSize; y++) {
      for (let x = 0; x < globeSize; x++) {
        const idx = (y * globeSize + x) * 4;
        const red = gData[idx], grn = gData[idx+1], blu = gData[idx+2];
        if (red > 130 && grn > 130 && blu > 120) {
          const sampleY = Math.max(10, y - 28);
          const sIdx = (sampleY * globeSize + x) * 4;
          gData[idx] = Math.round(gData[sIdx] * 0.85);
          gData[idx+1] = Math.round(gData[sIdx+1] * 0.85);
          gData[idx+2] = Math.round(gData[sIdx+2] * 0.85);
        }
      }
    }
    gCtx.putImageData(gImgData, 0, 0);
    const globeSrcData = gCtx.getImageData(0, 0, globeSize, globeSize).data;

    for (let f = 0; f < numFrames; f++) {
      const theta = (2 * Math.PI * f) / numFrames;
      const destCanvas = createCanvas(globeSize, globeSize);
      const destCtx = destCanvas.getContext('2d');
      const destImageData = destCtx.createImageData(globeSize, globeSize);
      const destData = destImageData.data;

      for (let py = 0; py < globeSize; py++) {
        const yNorm = (py - globeR) / globeR;
        if (Math.abs(yNorm) >= 1) continue;
        const lat = Math.asin(yNorm);
        const cosLat = Math.cos(lat);

        for (let px = 0; px < globeSize; px++) {
          const xNorm = (px - globeR) / globeR;
          const dSq = xNorm * xNorm + yNorm * yNorm;
          if (dSq > 1) continue;

          const zNorm = Math.sqrt(Math.max(0, 1 - dSq));
          const lon = Math.atan2(xNorm, zNorm);

          let lonRot = lon - theta;
          while (lonRot > Math.PI) lonRot -= 2 * Math.PI;
          while (lonRot < -Math.PI) lonRot += 2 * Math.PI;

          const zRot = cosLat * Math.cos(lonRot);
          let srcX;

          if (zRot >= 0) {
            srcX = globeR + cosLat * Math.sin(lonRot) * globeR;
          } else {
            const lonWrap = lonRot > 0 ? Math.PI - lonRot : -Math.PI - lonRot;
            srcX = globeR + cosLat * Math.sin(lonWrap) * globeR;
          }

          const sx = Math.max(0, Math.min(globeSize - 1, Math.round(srcX)));
          const sy = py;

          const srcIdx = (sy * globeSize + sx) * 4;
          const destIdx = (py * globeSize + px) * 4;

          const limb = Math.pow(zNorm, 0.35);
          destData[destIdx] = Math.round(globeSrcData[srcIdx] * (0.85 + 0.15 * limb));
          destData[destIdx + 1] = Math.round(globeSrcData[srcIdx + 1] * (0.85 + 0.15 * limb));
          destData[destIdx + 2] = Math.round(globeSrcData[srcIdx + 2] * (0.85 + 0.15 * limb));
          destData[destIdx + 3] = 255;
        }
      }

      destCtx.putImageData(destImageData, 0, 0);
      rotatedGlobeCanvases.push(destCanvas);
    }
  }

  try {
    for (let f = 0; f < numFrames; f++) {
      const phi = (2 * Math.PI * f) / numFrames;
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext('2d');

      // 1. Draw Master Clean Base Plate
      if (plateImg) {
        ctx.drawImage(plateImg, 0, 0, W, H);
      } else {
        const bgGrad = ctx.createLinearGradient(0, 0, W, H);
        bgGrad.addColorStop(0, '#040711');
        bgGrad.addColorStop(0.5, '#08101e');
        bgGrad.addColorStop(1, '#020409');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);
      }

      // ==========================================
      // 2. LIVE 3D ROTATING GLOBE & STATIC SYNCHRONIZED ORBITAL RINGS
      // ==========================================
      if (rotatedGlobeCanvases.length > f) {
        // A. Clean 3D rotating globe (no bottom ring rotating on sphere!)
        ctx.save();
        ctx.beginPath();
        ctx.arc(globeCX, globeCY, globeR, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(rotatedGlobeCanvases[f], globeCX - globeR, globeCY - globeR);
        ctx.restore();

        // B. Atmospheric Holographic Limb Glow
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const atmoGlow = ctx.createRadialGradient(globeCX, globeCY, globeR * 0.75, globeCX, globeCY, globeR + 3);
        atmoGlow.addColorStop(0, 'rgba(0,0,0,0)');
        atmoGlow.addColorStop(0.8, 'rgba(255, 230, 180, 0.22)');
        atmoGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = atmoGlow;
        ctx.beginPath();
        ctx.arc(globeCX, globeCY, globeR + 3, 0, Math.PI * 2);
        ctx.fill();

        // C. Static Foreground Orbital Ring Arc (seamlessly aligned with background rings!)
        ctx.save();
        ctx.translate(globeCX, globeCY);
        ctx.rotate(-0.32);
        ctx.strokeStyle = 'rgba(255, 240, 200, 0.75)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(0, 0, 88, 24, 0, 0, Math.PI);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 200, 100, 0.25)';
        ctx.lineWidth = 3.2;
        ctx.stroke();
        ctx.restore();

        // D. Luminous Orbital Energy Flares Gliding Along Rings
        const r1Angle = phi;
        const r1x = globeCX + 88 * Math.cos(r1Angle) * Math.cos(-0.32) - 24 * Math.sin(r1Angle) * Math.sin(-0.32);
        const r1y = globeCY + 88 * Math.cos(r1Angle) * Math.sin(-0.32) + 24 * Math.sin(r1Angle) * Math.cos(-0.32);
        const f1Grad = ctx.createRadialGradient(r1x, r1y, 1, r1x, r1y, 13);
        f1Grad.addColorStop(0, '#ffffff');
        f1Grad.addColorStop(0.35, 'rgba(255, 240, 200, 0.90)');
        f1Grad.addColorStop(0.7, 'rgba(255, 180, 80, 0.35)');
        f1Grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = f1Grad;
        ctx.beginPath();
        ctx.arc(r1x, r1y, 13, 0, Math.PI * 2);
        ctx.fill();

        const r2Angle = phi + Math.PI;
        const r2x = globeCX + 118 * Math.cos(r2Angle) * Math.cos(-0.28) - 32 * Math.sin(r2Angle) * Math.sin(-0.28);
        const r2y = globeCY + 118 * Math.cos(r2Angle) * Math.sin(-0.28) + 32 * Math.sin(r2Angle) * Math.cos(-0.28);
        const f2Grad = ctx.createRadialGradient(r2x, r2y, 1, r2x, r2y, 15);
        f2Grad.addColorStop(0, '#ffffff');
        f2Grad.addColorStop(0.35, 'rgba(200, 240, 255, 0.85)');
        f2Grad.addColorStop(0.7, 'rgba(56, 189, 248, 0.35)');
        f2Grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = f2Grad;
        ctx.beginPath();
        ctx.arc(r2x, r2y, 15, 0, Math.PI * 2);
        ctx.fill();

        // E. Holographic Projection Base Pulse
        const basePulse = 0.15 + 0.08 * Math.sin(phi * 2);
        const pGrad = ctx.createRadialGradient(globeCX, globeCY + globeR + 10, 5, globeCX, globeCY + globeR + 10, 55);
        pGrad.addColorStop(0, `rgba(255, 240, 200, ${basePulse * 1.5})`);
        pGrad.addColorStop(0.5, `rgba(255, 190, 100, ${basePulse})`);
        pGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(globeCX, globeCY + globeR + 10, 55, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ==========================================
      // 3. LIVE NATURALLY FLUTTERING BANNER FLAG
      // ==========================================
      if (flagCanvas) {
        ctx.save();
        const sliceH = 2;
        for (let sy = 0; sy < flagH; sy += sliceH) {
          const windFactor = Math.pow(sy / flagH, 1.4);
          const waveOffset = Math.sin((sy * 0.06) - phi * 2) * (1.5 * windFactor);
          ctx.drawImage(flagCanvas, 0, sy, flagW, sliceH, flagX + waveOffset, flagY + sy, flagW, sliceH);
          if (Math.abs(waveOffset) > 0.6) {
            ctx.fillStyle = waveOffset > 0 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)';
            ctx.fillRect(flagX + waveOffset, flagY + sy, flagW, sliceH);
          }
        }
        ctx.restore();
      }

      // ==========================================
      // 4. MINUTE DETAILED CASCADING WATERFALL (Full Height Cascade x: 955..988, y: 246..392)
      // ==========================================
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const wfX1 = 955, wfX2 = 988, wfY1 = 246, wfY2 = 392;
      const wfHeight = wfY2 - wfY1;

      for (let col = 0; col < 8; col++) {
        const streamX = wfX1 + 2 + col * 3.8;
        const streamSpeed = 6 + (col % 3) * 2;
        const streamOffset = Math.round((f * streamSpeed + col * 17) % wfHeight);
        const streamY = wfY1 + streamOffset;
        const streamLen = 18 + (col % 4) * 6;

        const sGrad = ctx.createLinearGradient(streamX, streamY - streamLen / 2, streamX, streamY + streamLen / 2);
        sGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        sGrad.addColorStop(0.4, 'rgba(235, 245, 255, 0.50)');
        sGrad.addColorStop(0.6, 'rgba(255, 255, 255, 0.70)');
        sGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = sGrad;
        ctx.fillRect(streamX - 1, streamY - streamLen / 2, 2.2, streamLen);
      }

      for (let d = 0; d < 5; d++) {
        const dx = wfX1 + 4 + d * 6;
        const dy = wfY1 + ((f * 4 + d * 7) % 14);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.beginPath();
        ctx.arc(dx, dy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let s = 0; s < 6; s++) {
        const foamX = wfX1 + 3 + (s * 5.2);
        const foamY = wfY2 - 12 + ((f * 3 + s * 7) % 15);
        const foamR = 2.0 + 1.2 * Math.sin(phi + s);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.ellipse(foamX, foamY, foamR * 1.5, foamR * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      const mistAlpha = 0.12 + 0.06 * Math.sin(phi);
      const mistGrad = ctx.createRadialGradient(wfX1 + 16, wfY2 - 2, 4, wfX1 + 16, wfY2 - 2, 32);
      mistGrad.addColorStop(0, `rgba(255, 255, 255, ${mistAlpha * 1.4})`);
      mistGrad.addColorStop(0.6, `rgba(220, 235, 255, ${mistAlpha * 0.7})`);
      mistGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mistGrad;
      ctx.beginPath();
      ctx.arc(wfX1 + 16, wfY2 - 2, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ==========================================
      // 5. ULTRA-DETAILED TELEMETRY RADAR (Console 2 - cx: 346, cy: 465)
      // ==========================================
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const radCX = 346, radCY = 465;
      const radRX = 28, radRY = 17;

      ctx.save();
      ctx.translate(radCX, radCY);
      ctx.scale(1, radRY / radRX);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.30)';
      ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(0, 0, radRX * 0.38, 0, Math.PI * 2); ctx.stroke();

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.40)';
      ctx.beginPath(); ctx.arc(0, 0, radRX * 0.72, 0, Math.PI * 2); ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1.0;
      ctx.beginPath(); ctx.arc(0, 0, radRX, 0, Math.PI * 2); ctx.stroke();

      for (let t = 0; t < 12; t++) {
        const a = (t * Math.PI * 2) / 12;
        const rInner = t % 3 === 0 ? radRX - 3.5 : radRX - 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * rInner, Math.sin(a) * rInner);
        ctx.lineTo(Math.cos(a) * radRX, Math.sin(a) * radRX);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-radRX, 0); ctx.lineTo(radRX, 0);
      ctx.moveTo(0, -radRX); ctx.lineTo(0, radRX);
      ctx.stroke();

      const sweepAngle = phi;
      const radSweep = ctx.createRadialGradient(0, 0, 1, 0, 0, radRX);
      radSweep.addColorStop(0, 'rgba(255, 255, 255, 0.65)');
      radSweep.addColorStop(0.4, 'rgba(56, 189, 248, 0.35)');
      radSweep.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = radSweep;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radRX, sweepAngle - 0.75, sweepAngle);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      const needleX = radCX + radRX * Math.cos(sweepAngle);
      const needleY = radCY + radRY * Math.sin(sweepAngle);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(radCX, radCY);
      ctx.lineTo(needleX, needleY);
      ctx.stroke();

      const blips = [
        { angle: 2.1, dist: 0.65, label: 'T1' },
        { angle: 4.8, dist: 0.45, label: 'T2' },
        { angle: 0.7, dist: 0.82, label: 'T3' }
      ];

      for (const b of blips) {
        const bx = radCX + radRX * b.dist * Math.cos(b.angle);
        const by = radCY + radRY * b.dist * Math.sin(b.angle);
        let angleDiff = sweepAngle - b.angle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        let intensity = 0.2;
        if (angleDiff >= 0 && angleDiff < 0.9) {
          intensity = 1.0 - (angleDiff / 0.9) * 0.75;
        }

        ctx.fillStyle = `rgba(56, 189, 248, ${intensity})`;
        ctx.beginPath();
        ctx.arc(bx, by, 1.8 * (intensity > 0.5 ? 1.3 : 1.0), 0, Math.PI * 2);
        ctx.fill();

        if (intensity > 0.6) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${intensity * 0.8})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      const coreGrad = ctx.createRadialGradient(radCX, radCY, 0.5, radCX, radCY, 4.5);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.8)');
      coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(radCX, radCY, 4.5, 0, Math.PI * 2);
      ctx.fill();

      const c3StartX = 628, c3EndX = 712, c3Y = 462;
      const pulseRel = (f / numFrames);
      const pulseX = c3StartX + (c3EndX - c3StartX) * pulseRel;
      const pulseH = Math.sin(pulseRel * Math.PI) * 8;
      const pulseY = c3Y - pulseH;
      const pDotGrad = ctx.createRadialGradient(pulseX, pulseY, 0.5, pulseX, pulseY, 5);
      pDotGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
      pDotGrad.addColorStop(0.4, 'rgba(56, 189, 248, 0.55)');
      pDotGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pDotGrad;
      ctx.beginPath();
      ctx.arc(pulseX, pulseY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ==========================================
      // 6. GLITTERING NATIVE WORLD MAP LIGHTS
      // ==========================================
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < NATIVE_MAP_LIGHTS.length; i++) {
        const light = NATIVE_MAP_LIGHTS[i];
        const twinkle = 0.35 + 0.65 * Math.sin(phi * 2.5 + light.phase);
        const lGrad = ctx.createRadialGradient(light.x, light.y, 0.5, light.x, light.y, 4.5);
        lGrad.addColorStop(0, '#ffffff');
        lGrad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${twinkle * 0.9})`);
        lGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lGrad;
        ctx.beginPath();
        ctx.arc(light.x, light.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ==========================================
      // 7. AVATAR RETICLE (CLEAN - NO ROTATING WEDGE OVER AVATAR)
      // ==========================================
      ctx.save();
      ctx.beginPath();
      ctx.arc(iconCX, iconCY, iconR, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      if (iconImg) {
        ctx.drawImage(iconImg, iconCX - iconR, iconCY - iconR, iconR * 2, iconR * 2);
      } else {
        const avGrad = ctx.createLinearGradient(iconCX - iconR, iconCY - iconR, iconCX + iconR, iconCY + iconR);
        avGrad.addColorStop(0, '#0d1829');
        avGrad.addColorStop(1, '#050a14');
        ctx.fillStyle = avGrad;
        ctx.fillRect(iconCX - iconR, iconCY - iconR, iconR * 2, iconR * 2);
        ctx.font = 'bold 42px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((fallbackInitial || 'A')[0].toUpperCase(), iconCX, iconCY);
      }

      // Inner Glass Sheen
      const sheenGrad = ctx.createLinearGradient(iconCX - iconR, iconCY - iconR, iconCX + iconR, iconCY);
      sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
      sheenGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
      sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = sheenGrad;
      ctx.fillRect(iconCX - iconR, iconCY - iconR, iconR * 2, iconR);
      ctx.restore();

      // Inner Bezel Ring
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(iconCX, iconCY, iconR, 0, Math.PI * 2);
      ctx.stroke();

      // Concentric Neon Halo Ring
      const haloPulse = 0.75 + 0.25 * Math.sin(phi * 2);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${haloPulse})`;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(iconCX, iconCY, iconR + 9, 0, Math.PI * 2);
      ctx.stroke();

      // Outer Rotating Reticle Ticks (16 Ticks)
      ctx.save();
      ctx.translate(iconCX, iconCY);
      ctx.rotate(phi);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 16; i++) {
        const angle = (i * Math.PI * 2) / 16;
        const inner = iconR + 18;
        const outer = i % 4 === 0 ? iconR + 28 : iconR + 23;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        ctx.stroke();
      }
      ctx.restore();

      // ==========================================
      // 8. HEADER TYPOGRAPHY & BADGE PILL
      // ==========================================
      // Subtitle
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(subtitle.toUpperCase(), barX, 93);

      // Status Badge Pill with ANIMATED CHEVRONS (>>>)
      if (badge) {
        ctx.font = 'bold 10px sans-serif';
        const badgeBaseText = badge.toUpperCase();
        const badgeTextW = ctx.measureText(badgeBaseText).width;
        const badgeW = badgeTextW + 48;
        const badgeH = 22;
        const badgeX = barX + barW - badgeW;
        const badgeY = 78;

        ctx.fillStyle = 'rgba(6, 16, 32, 0.88)';
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 11);
        ctx.fill();
        ctx.strokeStyle = effectiveBadgeColor;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        const dotX = badgeX + 11;
        const dotY = badgeY + 11;
        const dotGrad = ctx.createRadialGradient(dotX, dotY, 1, dotX, dotY, 5);
        dotGrad.addColorStop(0, '#ffffff');
        dotGrad.addColorStop(0.4, effectiveBadgeColor);
        dotGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = dotGrad;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.fillText(badgeBaseText, dotX + 10, badgeY + 15);

        const chevStartX = dotX + 10 + badgeTextW + 7;
        for (let c = 0; c < 3; c++) {
          const chevPhase = phi - (c * (Math.PI * 2 / 3));
          const chevIntensity = 0.25 + 0.75 * Math.max(0, Math.sin(chevPhase));
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${chevIntensity})`;
          ctx.lineWidth = 1.8;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          const cx = chevStartX + (c * 6.5);
          const cy = badgeY + 11;
          ctx.beginPath();
          ctx.moveTo(cx, cy - 4.5);
          ctx.lineTo(cx + 3.5, cy);
          ctx.lineTo(cx, cy + 4.5);
          ctx.stroke();
        }
      }

      // Main Title
      ctx.font = '900 21px "Cinzel", "Times New Roman", "Georgia", serif';
      ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(title.toUpperCase(), barX, 122);
      ctx.shadowBlur = 0;

      // Status Progress Text Row
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`STATUS PROGRESS: ${clamped}/${total} ${unit.toUpperCase()}`, barX, 146);

      ctx.font = '900 13px monospace';
      ctx.fillStyle = accentColor;
      ctx.textAlign = 'right';
      ctx.fillText(`${pct}%`, barX + barW, 146);
      ctx.textAlign = 'left';

      // ==========================================
      // 9. SLEEK DEEP SPACE COSMIC PROGRESS BAR
      // ==========================================
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, barR);
      ctx.clip();

      const trackVoidGrad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
      trackVoidGrad.addColorStop(0, '#02050b');
      trackVoidGrad.addColorStop(0.5, '#060d1b');
      trackVoidGrad.addColorStop(1, '#03060e');
      ctx.fillStyle = trackVoidGrad;
      ctx.fillRect(barX, barY, barW, barH);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 1.0;
      for (let tx = barX + 20; tx < barX + barW; tx += 20) {
        ctx.beginPath();
        ctx.moveTo(tx, barY + 3);
        ctx.lineTo(tx, barY + barH - 3);
        ctx.stroke();
      }

      if (ratio > 0 && fillW > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(barX, barY, fillW, barH, barR);
        ctx.clip();

        if (barTextureCanvas) {
          const flowOffset = Math.round((f * 16) % barW);
          ctx.drawImage(barTextureCanvas, 0, 0, barW, barH, barX - flowOffset, barY, barW, barH);
          if (barX - flowOffset + barW < barX + fillW) {
            ctx.drawImage(barTextureCanvas, 0, 0, barW, barH, barX - flowOffset + barW, barY, barW, barH);
          }
        } else {
          const flowOffset = (f * 18) % 120;
          const metalGrad = ctx.createLinearGradient(barX - flowOffset, barY, barX + fillW + (120 - flowOffset), barY);
          metalGrad.addColorStop(0, 'rgba(12, 32, 60, 0.95)');
          metalGrad.addColorStop(0.25, 'rgba(56, 189, 248, 0.85)');
          metalGrad.addColorStop(0.48, '#cbd5e1');
          metalGrad.addColorStop(0.70, '#ffffff');
          metalGrad.addColorStop(0.85, 'rgba(56, 189, 248, 0.95)');
          metalGrad.addColorStop(1.0, '#ffffff');
          ctx.fillStyle = metalGrad;
          ctx.fillRect(barX, barY, fillW, barH);
        }

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const energyPulse = 0.6 + 0.4 * Math.sin(phi * 2);
        const eGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
        eGrad.addColorStop(0, 'rgba(56, 189, 248, 0.1)');
        eGrad.addColorStop(0.7, `rgba(255, 255, 255, ${energyPulse * 0.4})`);
        eGrad.addColorStop(1, 'rgba(255, 255, 255, 0.7)');
        ctx.fillStyle = eGrad;
        ctx.fillRect(barX, barY, fillW, barH);

        const coreY = barY + barH / 2;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(barX, coreY);
        ctx.lineTo(barX + fillW, coreY);
        ctx.stroke();

        ctx.restore();
        ctx.restore();
      } else {
        const idleAlpha = 0.4 + 0.3 * Math.sin(phi * 2);
        ctx.fillStyle = `rgba(56, 189, 248, ${idleAlpha})`;
        ctx.beginPath();
        ctx.arc(barX + 10, barY + barH / 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      const glassSheen = ctx.createLinearGradient(barX, barY, barX, barY + 7);
      glassSheen.addColorStop(0, 'rgba(255, 255, 255, 0.40)');
      glassSheen.addColorStop(0.6, 'rgba(255, 255, 255, 0.08)');
      glassSheen.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = glassSheen;
      ctx.fillRect(barX, barY, barW, 7);

      ctx.restore();

      ctx.strokeStyle = 'rgba(240, 246, 255, 0.85)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, barR);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(30, 58, 95, 0.65)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(barX + barR, barY + barH);
      ctx.lineTo(barX + barW - barR, barY + barH);
      ctx.stroke();

      if (ratio > 0 && fillW > 0) {
        const headX = barX + fillW;
        const headY = barY + barH / 2;
        const flarePulse = 1.0 + 0.20 * Math.sin(phi * 2);

        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(headX, barY - 3);
        ctx.lineTo(headX, barY + barH + 3);
        ctx.stroke();

        const flareW = 24 * flarePulse;
        const hFlareGrad = ctx.createLinearGradient(headX - flareW, headY, headX + flareW, headY);
        hFlareGrad.addColorStop(0, 'rgba(0,0,0,0)');
        hFlareGrad.addColorStop(0.35, 'rgba(56, 189, 248, 0.75)');
        hFlareGrad.addColorStop(0.5, '#ffffff');
        hFlareGrad.addColorStop(0.65, 'rgba(56, 189, 248, 0.75)');
        hFlareGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = hFlareGrad;
        ctx.fillRect(headX - flareW, headY - 3, flareW * 2, 6);

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(headX, headY - 4.5);
        ctx.lineTo(headX + 3, headY);
        ctx.lineTo(headX, headY + 4.5);
        ctx.lineTo(headX - 3, headY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // ==========================================
      // 10. THREE TACTICAL METRIC CHIPS
      // ==========================================
      const chipList = (metrics && metrics.length > 0)
        ? metrics.slice(0, 3)
        : [
            { label: 'USERS', value: '1' },
            { label: 'ROLES', value: '1' },
            { label: 'ANTINUKE', value: 'GUARDED' }
          ];

      const chipSlots = [
        { x: 254, w: 168 },
        { x: 438, w: 168 },
        { x: 622, w: 178 }
      ];
      const cy = 192;
      const ch = 48;

      for (let i = 0; i < chipList.length && i < chipSlots.length; i++) {
        const m = chipList[i];
        const slot = chipSlots[i];
        const cx = slot.x;
        const cw = slot.w;

        ctx.fillStyle = 'rgba(6, 14, 28, 0.85)';
        ctx.beginPath();
        ctx.roundRect(cx, cy, cw, ch, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1.0;
        ctx.stroke();

        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
        ctx.fillText(String(m.label || 'METRIC').toUpperCase(), cx + 12, cy + 18);

        ctx.font = '900 13px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(String(m.value || 'ONLINE'), cx + 12, cy + 36);

        let mPct = m.pct;
        if (mPct === undefined) {
          const valStr = String(m.value || '').toUpperCase();
          if (valStr.includes('%')) {
            const parsed = parseInt(valStr.replace(/[^0-9]/g, ''), 10);
            mPct = isNaN(parsed) ? ratio : parsed / 100;
          } else if (valStr.includes('/')) {
            const [num, den] = valStr.split('/').map(x => parseInt(x.trim(), 10));
            mPct = (!isNaN(num) && !isNaN(den) && den > 0) ? num / den : ratio;
          } else if (['ONLINE', 'GUARDED', 'ENABLED', 'ACTIVE', 'ARMED', 'OK', 'SAFE', 'ON'].some(k => valStr.includes(k))) {
            mPct = 1.0;
          } else if (['OFF', 'DISABLED', '0 DETECTED', 'NONE', 'STANDBY'].some(k => valStr.includes(k))) {
            mPct = 0.0;
          } else {
            mPct = ratio;
          }
        }

        const numSegments = 8;
        const activeCount = Math.round(Math.max(0, Math.min(1, mPct)) * numSegments);
        const segW = 6;
        const segH = 10;
        const segGap = 3;
        const segStartX = cx + cw - 12 - (numSegments * (segW + segGap) - segGap);
        const segY = cy + 26;

        for (let s = 0; s < numSegments; s++) {
          const sx = segStartX + s * (segW + segGap);
          const isActive = s < activeCount;
          ctx.fillStyle = isActive ? `rgba(${r}, ${g}, ${b}, 0.95)` : `rgba(${r}, ${g}, ${b}, 0.20)`;
          ctx.fillRect(sx, segY, segW, segH);
        }
      }

      const frameBuf = canvas.toBuffer('image/png');
      if (f === 0) firstFrameBuffer = frameBuf;

      if (animated) {
        fs.writeFileSync(path.join(tempDir, `frame_${String(f).padStart(2, '0')}.png`), frameBuf);
      }
    }

    if (!animated) {
      return new AttachmentBuilder(firstFrameBuffer, { name: attachmentName || 'status_banner.png' });
    }

    const gifOutPath = path.join(tempDir, 'status.gif');
    const encodeCmd = `"${ffmpegPath}" -y -framerate 10 -i "${tempDir}/frame_%02d.png" -filter_complex "[0:v] split [a][b];[a] palettegen=reserve_transparent=0 [p];[b][p] paletteuse=dither=sierra2_4a" "${gifOutPath}"`;

    await execPromise(encodeCmd);

    const gifBuffer = fs.readFileSync(gifOutPath);
    return new AttachmentBuilder(gifBuffer, { name: attachmentName || 'status_banner.gif' });
  } catch (err) {
    console.error('[CommandStatusBanner] GIF generation error, falling back to static card:', err);
    return new AttachmentBuilder(firstFrameBuffer || createCanvas(W, H).toBuffer('image/png'), { name: attachmentName || 'status_banner.png' });
  } finally {
    if (animated) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }
}
