import { createCanvas } from './canvas.js';
import { isMainThread, runCanvasTask } from './canvasWorkerHost.js';

const bannerCache = new Map();
const MAX_CACHE = 24;

function hexToRgb(hex) {
  let clean = String(hex || '').replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return { r: 0, g: 229, b: 255, hex: '#00E5FF' };
  }
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
    hex: `#${clean.toUpperCase()}`
  };
}

function rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
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

/**
 * Generates and caches the Athena Prime Command Matrix Banner PNG off-thread.
 */
export async function generateHelpBanner(options = {}, accentColorHex = '#00e5ff') {
  const safeOpts = {
    prefix: String(options.prefix || '!').slice(0, 6),
    moduleCount: Number(options.moduleCount) || 24,
    version: String(options.version || 'v4.0.15').slice(0, 14)
  };
  const cacheKey = `${safeOpts.prefix}|${safeOpts.moduleCount}|${safeOpts.version}|${accentColorHex}`;
  const cached = bannerCache.get(cacheKey);
  if (cached) return cached;

  let buf = null;
  if (isMainThread) {
    const res = await runCanvasTask(
      'helpBanner',
      [safeOpts, accentColorHex],
      () => generateHelpBannerLocal(safeOpts, accentColorHex)
    );
    if (res) buf = Buffer.isBuffer(res) ? res : Buffer.from(res);
  }
  if (!buf) {
    buf = await generateHelpBannerLocal(safeOpts, accentColorHex);
  }

  if (buf && isMainThread) {
    if (bannerCache.size >= MAX_CACHE) {
      const oldestKey = bannerCache.keys().next().value;
      if (oldestKey) bannerCache.delete(oldestKey);
    }
    bannerCache.set(cacheKey, buf);
  }
  return buf;
}

async function generateHelpBannerLocal(options = {}, accentColorHex = '#00e5ff') {
  const width = 920;
  const height = 148;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const { r, g, b } = hexToRgb(accentColorHex);
  const prefix = String(options.prefix || '!').slice(0, 6);
  const moduleCount = Number(options.moduleCount) || 24;
  const version = String(options.version || 'v4.0.15').toUpperCase();

  ctx.save();
  rrPath(ctx, 0, 0, width, height, 14);
  ctx.clip();

  // Deep obsidian background gradient matching !ping & !va
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#090b12');
  bgGrad.addColorStop(1, '#06070c');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle ambient accent radial aura
  const radial = ctx.createRadialGradient(width * 0.25, height * 0.45, 20, width * 0.25, height * 0.45, 480);
  radial.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.16)`);
  radial.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, 0.04)`);
  radial.addColorStop(1, 'rgba(6, 7, 12, 0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, width, height);

  // Faint tactical grid lines
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
  ctx.lineWidth = 1;
  for (let gx = 40; gx < width; gx += 46) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height - 34);
    ctx.stroke();
  }
  for (let gy = 28; gy < height - 34; gy += 28) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
    ctx.stroke();
  }

  // Subtle decorative glowing signal waveform in center-bottom background
  ctx.beginPath();
  for (let x = 24; x <= width - 24; x += 12) {
    const waveY = 86 + Math.sin(x * 0.022) * 8 + Math.cos(x * 0.05) * 3;
    if (x === 24) ctx.moveTo(x, waveY);
    else ctx.lineTo(x, waveY);
  }
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.22)`;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Main Title (kept compact so right KPI chips never crowd prefix text)
  ctx.font = 'bold 17px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  const leftWord = 'ATHENA PRIME ';
  ctx.fillText(leftWord, 28, 45);
  const leftW = ctx.measureText(leftWord).width;
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  const rightWord = 'COMMAND MATRIX';
  ctx.fillText(rightWord, 28 + leftW, 45);

  // Zero-Trust Armed pill placed cleanly beneath subtitle row or inline after subtitle
  ctx.textAlign = 'left';
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#94a3b8';
  const subTxt = 'Browse 24 modules, clearance tiers, and live architecture specs.';
  ctx.fillText(subTxt, 28, 76);

  const pillX = 28 + ctx.measureText(subTxt).width + 14;
  const pillW = 128;
  if (pillX + pillW < width - 24) {
    rrPath(ctx, pillX, 61, pillW, 20, 5);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.16)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.45)`;
    ctx.stroke();
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ZERO-TRUST ARMED', pillX + pillW / 2, 75);
  }

  // Right-side KPI chips
  const chips = [
    { label: 'PREFIX', val: prefix },
    { label: 'MODULES', val: String(moduleCount) },
    { label: 'SHIELDS', val: '32' },
    { label: 'CORE', val: version }
  ];
  let cx = width - 24;
  ctx.font = 'bold 11px monospace';
  for (let i = chips.length - 1; i >= 0; i--) {
    const ch = chips[i];
    const txt = `${ch.label} ${ch.val}`;
    const cw = ctx.measureText(txt).width + 18;
    cx -= cw;

    rrPath(ctx, cx, 29, cw, 24, 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(txt, cx + cw / 2, 45);
    cx -= 8;
  }

  // Footer Bar
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  ctx.fillRect(0, height - 34, width, 34);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - 34);
  ctx.lineTo(width, height - 34);
  ctx.stroke();

  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('CLEARANCE:  BOT OWNER  >  SERVER OWNER  >  EXTRA OWNER  >  PUBLIC', 28, height - 13);

  ctx.textAlign = 'right';
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.90)`;
  ctx.fillText(`${prefix}HELP <COMMAND>  •  ${prefix}HELP EXPLAIN`, width - 26, height - 13);

  // Outer card frame stroke
  rrPath(ctx, 0.75, 0.75, width - 1.5, height - 1.5, 14);
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.30)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
  return canvas.toBuffer('image/png');
}
