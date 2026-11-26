import { createCanvas } from './canvas.js';
import { isMainThread, runCanvasTask } from './canvasWorkerHost.js';

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

function drawSpline(ctx, pts, minY = -Infinity, maxY = Infinity) {
  if (pts.length < 2) return;
  const clampY = (y) => Math.max(minY, Math.min(maxY, y));
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[0];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;

    // Prevent zero-baseline segments or adjacent valleys from overshooting below the 0m axis
    const bothFlat = p1.y >= maxY - 0.5 && p2.y >= maxY - 0.5;
    const cp1y = bothFlat ? maxY : clampY(p1.y + (p2.y - p0.y) / 6);
    const cp2y = bothFlat ? maxY : clampY(p2.y - (p3.y - p1.y) / 6);

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
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

function formatDurationShort(mins) {
  const safe = Math.max(0, Math.round(Number(mins) || 0));
  if (safe < 60) return `${safe}m`;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const LOOKALIKE_MAP = {
  // Small caps & stylized Latin
  'ᴀ': 'A', 'ʙ': 'B', 'ᴄ': 'C', 'ᴅ': 'D', 'ᴇ': 'E', 'ꜰ': 'F', 'ɢ': 'G', 'ʜ': 'H',
  'ɪ': 'I', 'ᴊ': 'J', 'ᴋ': 'K', 'ʟ': 'L', 'ᴍ': 'M', 'ɴ': 'N', 'ᴏ': 'O', 'ᴘ': 'P',
  'ǫ': 'Q', 'ʀ': 'R', 'ꜱ': 'S', 'ᴛ': 'T', 'ᴜ': 'U', 'ᴠ': 'V', 'ᴡ': 'W', 'ʏ': 'Y', 'ᴢ': 'Z',
  'ℓ': 'l',
  // Faux-English Greek & Cyrillic styling commonly used in Discord channel/server names
  'α': 'a', 'Α': 'A', 'β': 'b', 'Β': 'B', 'ε': 'e', 'Ε': 'E', 'є': 'e', 'Є': 'E',
  'η': 'n', 'Η': 'H', 'ι': 'i', 'Ι': 'I', 'κ': 'k', 'Κ': 'K', 'к': 'k', 'К': 'K',
  'м': 'm', 'Μ': 'M', 'ν': 'v', 'Ν': 'N', 'ο': 'o', 'Ο': 'O', 'σ': 'o', 'ς': 'c',
  'ρ': 'p', 'Ρ': 'P', 'τ': 't', 'Τ': 'T', 'т': 't', 'Т': 'T', 'υ': 'u', 'Υ': 'Y',
  'χ': 'x', 'Χ': 'X', 'я': 'r', 'Я': 'R', 'и': 'n', 'И': 'N', 'ғ': 'f', 'Ғ': 'F',
  'ѕ': 's', 'Ѕ': 'S', 'а': 'a', 'А': 'A', 'е': 'e', 'Е': 'E', 'о': 'o', 'О': 'O',
  'р': 'p', 'Р': 'P', 'с': 'c', 'С': 'C', 'у': 'y', 'У': 'Y', 'х': 'x', 'Х': 'X',
  'н': 'H', 'Н': 'H', 'в': 'B', 'В': 'B', 'з': '3', 'З': '3'
};

function sanitizeLabel(raw, maxLen = 22) {
  let str = String(raw || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '');

  let folded = '';
  for (const ch of str) {
    folded += LOOKALIKE_MAP[ch] || ch;
  }

  const cleaned = folded
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/^[.\-\s|•·]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const base = cleaned || 'Voice Room';
  return base.length > maxLen ? `${base.slice(0, maxLen - 1).trim()}...` : base;
}

/**
 * Generates the Athena Voice Telemetry Matrix PNG off-thread via the Canvas Worker Pool.
 */
export async function generateVoiceAnalyticsMatrix(payload = {}, accentColorHex = '#00e5ff') {
  if (isMainThread) {
    const res = await runCanvasTask(
      'voiceAnalyticsMatrix',
      [payload, accentColorHex],
      () => generateVoiceAnalyticsMatrixLocal(payload, accentColorHex)
    );
    if (res) return Buffer.isBuffer(res) ? res : Buffer.from(res);
  }
  return await generateVoiceAnalyticsMatrixLocal(payload, accentColorHex);
}

function drawLeaderboardPane(ctx, { x, y, w, h, title, items, rgb, emptyLabel }) {
  const { r, g, b } = rgb;

  rrPath(ctx, x, y, w, h, 10);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillText(title, x + 14, y + 20);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 10px monospace';
  ctx.fillText('DURATION / SHARE', x + w - 14, y + 20);

  if (!items || items.length === 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.fillText(emptyLabel, x + w / 2, y + h / 2 + 8);
    return;
  }

  const maxVal = Math.max(1, items[0]?.minutes || 1);
  const startY = y + 36;
  const rowStride = 26;

  items.slice(0, 4).forEach((item, idx) => {
    const rowY = startY + idx * rowStride;
    const rankStr = `#${idx + 1}`;
    const labelStr = sanitizeLabel(item.label, 21);
    const statStr = `${formatDurationShort(item.minutes)} (${Math.round(item.sharePct || 0)}%)`;

    ctx.textAlign = 'left';
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = idx === 0 ? `rgb(${r}, ${g}, ${b})` : '#94a3b8';
    ctx.fillText(rankStr, x + 14, rowY + 8);

    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(labelStr, x + 36, rowY + 8);

    ctx.textAlign = 'right';
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(statStr, x + w - 14, rowY + 8);

    // Subtle progress bar track + glowing neon fill
    const barX = x + 14;
    const barY = rowY + 13;
    const barW = w - 28;
    const barH = 5;
    const fillRatio = Math.max(0.03, Math.min(1, (item.minutes || 0) / maxVal));

    rrPath(ctx, barX, barY, barW, barH, 2.5);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.fill();

    const fillW = Math.max(6, barW * fillRatio);
    const barGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
    barGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${idx === 0 ? 0.55 : 0.35})`);
    barGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${idx === 0 ? 0.98 : 0.72})`);

    ctx.save();
    if (idx === 0) {
      ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.55)`;
      ctx.shadowBlur = 6;
    }
    rrPath(ctx, barX, barY, fillW, barH, 2.5);
    ctx.fillStyle = barGrad;
    ctx.fill();
    ctx.restore();
  });
}

async function generateVoiceAnalyticsMatrixLocal(payload = {}, accentColorHex = '#00e5ff') {
  const width = 920;
  const height = 432;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const rgb = hexToRgb(accentColorHex);
  const { r, g, b } = rgb;

  const guildName = sanitizeLabel(payload.guildName || 'SERVER', 24).toUpperCase();
  const totalMinutes = Math.max(0, Number(payload.totalMinutes) || 0);
  const activeChannels = Math.max(0, Number(payload.activeChannelCount) || 0);
  const peakHour = Math.max(0, Math.min(23, Number(payload.peakHour) || 0));
  const peakMinutes = Math.max(0, Number(payload.peakMinutes) || 0);
  const peakTimeStr = `${String(peakHour).padStart(2, '0')}:00`;
  const hourly = Array.isArray(payload.hourly) && payload.hourly.length === 24
    ? payload.hourly.map((v) => Math.max(0, Number(v) || 0))
    : new Array(24).fill(0);
  const blocks = payload.blocks || { night: 0, morning: 0, afternoon: 0, evening: 0 };
  const topChannels = Array.isArray(payload.topChannels) ? payload.topChannels : [];
  const topUsers = Array.isArray(payload.topUsers) ? payload.topUsers : [];

  // Base obsidian container card
  ctx.save();
  rrPath(ctx, 0, 0, width, height, 14);
  ctx.clip();

  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#090b12');
  bgGrad.addColorStop(1, '#06070c');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  const bgRadial = ctx.createRadialGradient(width * 0.62, 130, 20, width * 0.62, 130, 440);
  bgRadial.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.14)`);
  bgRadial.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, 0.04)`);
  bgRadial.addColorStop(1, 'rgba(6, 7, 12, 0)');
  ctx.fillStyle = bgRadial;
  ctx.fillRect(0, 0, width, height);

  // Header strip
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  ctx.fillRect(0, 0, width, 54);
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.22)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 54);
  ctx.lineTo(width, 54);
  ctx.stroke();

  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  const titlePrefix = 'ATHENA ';
  ctx.fillText(titlePrefix, 26, 33);
  const prefixW = ctx.measureText(titlePrefix).width;
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  const titleMain = 'VOICE TELEMETRY MATRIX';
  ctx.fillText(titleMain, 26 + prefixW, 33);

  // Status badge pill
  const statusChipX = 26 + prefixW + ctx.measureText(titleMain).width + 14;
  const statusText = totalMinutes > 0 ? 'LIVE MATRIX' : 'STANDBY';
  const statusChipW = 86;
  rrPath(ctx, statusChipX, 17, statusChipW, 20, 5);
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.16)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.45)`;
  ctx.stroke();
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(statusText, statusChipX + statusChipW / 2, 31);

  // Top-right KPI pills
  const topChips = [
    { label: 'TOTAL', value: formatDurationShort(totalMinutes) },
    { label: 'PEAK', value: `${peakTimeStr} UTC` },
    { label: 'HUBS', value: `${activeChannels} CH` }
  ];
  let chipCursorX = width - 24;
  ctx.font = 'bold 11px monospace';
  for (let i = topChips.length - 1; i >= 0; i--) {
    const ch = topChips[i];
    const txt = `${ch.label} ${ch.value}`;
    const chipW = ctx.measureText(txt).width + 20;
    chipCursorX -= chipW;

    rrPath(ctx, chipCursorX, 15, chipW, 24, 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(txt, chipCursorX + chipW / 2, 31);
    chipCursorX -= 8;
  }

  // 24-Hour Curve & Histogram Geometry
  const plotLeft = 68;
  const plotRight = width - 28;
  const plotTop = 94;
  const plotBottom = 204;
  const plotW = plotRight - plotLeft;
  const plotH = plotBottom - plotTop;

  const rawMaxHour = Math.max(...hourly, 1);
  const yMax = Math.max(10, Math.ceil(rawMaxHour * 1.32));

  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
  ctx.fillText('24-HOUR DIURNAL CURVE (UTC)', plotLeft, 74);

  // Horizontal dashed gridlines & Y ticks
  const ySteps = 3;
  ctx.font = '10px monospace';
  for (let i = 0; i <= ySteps; i++) {
    const y = plotTop + (i * (plotH / ySteps));
    ctx.save();
    ctx.strokeStyle = i === ySteps ? 'rgba(148, 163, 184, 0.24)' : 'rgba(148, 163, 184, 0.09)';
    if (i < ySteps) ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
    ctx.restore();

    const tickVal = Math.round(yMax - (i * (yMax / ySteps)));
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';
    ctx.fillText(formatDurationShort(tickVal), plotLeft - 10, y + 3);
  }

  // Subtle vertical bars for each hour
  const barStep = plotW / 23;
  const barWidth = Math.max(8, Math.min(18, barStep * 0.48));
  const points = hourly.map((val, hr) => {
    const x = plotLeft + (hr * barStep);
    const norm = Math.max(0, Math.min(1, val / yMax));
    const y = plotBottom - (norm * plotH);
    return { x, y, val, hr };
  });

  for (const pt of points) {
    const isPeak = pt.hr === peakHour && peakMinutes > 0;
    const hVal = Math.max(2, plotBottom - pt.y);
    ctx.fillStyle = isPeak
      ? `rgba(${r}, ${g}, ${b}, 0.34)`
      : `rgba(${r}, ${g}, ${b}, 0.11)`;
    ctx.fillRect(pt.x - barWidth / 2, plotBottom - hVal, barWidth, hVal);
  }

  // Gradient area fill under spline
  const areaGrad = ctx.createLinearGradient(0, plotTop, 0, plotBottom);
  areaGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.34)`);
  areaGrad.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, 0.08)`);
  areaGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.0)`);

  ctx.beginPath();
  ctx.moveTo(points[0].x, plotBottom);
  ctx.lineTo(points[0].x, points[0].y);
  drawSpline(ctx, points, plotTop, plotBottom);
  ctx.lineTo(points[points.length - 1].x, plotBottom);
  ctx.closePath();
  ctx.fillStyle = areaGrad;
  ctx.fill();

  // Glow stroke + core neon stroke
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  drawSpline(ctx, points, plotTop, plotBottom);
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.28)`;
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  drawSpline(ctx, points, plotTop, plotBottom);
  ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.lineWidth = 2.4;
  ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.8)`;
  ctx.shadowBlur = 9;
  ctx.stroke();
  ctx.restore();

  // Plot nodes + peak highlight halo + floating badge
  for (const pt of points) {
    const isPeak = pt.hr === peakHour && peakMinutes > 0;
    if (isPeak) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.22)`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.65)`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    } else if (pt.val > 0) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#07090e';
      ctx.fill();
      ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }

  if (peakMinutes > 0) {
    const peakPt = points[peakHour];
    const badgeStr = `PEAK ${peakTimeStr} · ${formatDurationShort(peakMinutes)}`;
    ctx.font = 'bold 10px monospace';
    const badgeW = ctx.measureText(badgeStr).width + 16;
    const badgeX = Math.min(plotRight - badgeW / 2 - 2, Math.max(plotLeft + badgeW / 2, peakPt.x));
    const badgeY = Math.max(plotTop - 16, peakPt.y - 22);

    ctx.save();
    rrPath(ctx, badgeX - badgeW / 2, badgeY - 9, badgeW, 18, 5);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#06070c';
    ctx.textAlign = 'center';
    ctx.fillText(badgeStr, badgeX, badgeY + 4);
  }

  // X-axis block markers
  const markers = [
    { hr: 0, label: '00h NIGHT' },
    { hr: 6, label: '06h MORNING' },
    { hr: 12, label: '12h AFTERNOON' },
    { hr: 18, label: '18h EVENING' },
    { hr: 23, label: '23h' }
  ];
  ctx.font = '10px monospace';
  for (const m of markers) {
    const mx = plotLeft + (m.hr * barStep);
    ctx.textAlign = m.hr === 0 ? 'left' : m.hr === 23 ? 'right' : 'center';
    ctx.fillStyle = m.hr === 18 ? `rgb(${r}, ${g}, ${b})` : '#64748b';
    ctx.fillText(m.label, mx, plotBottom + 16);
  }

  // Lower dual leaderboard cards
  const cardTop = 236;
  const cardH = 148;
  const gap = 16;
  const paneW = (width - 48 - gap) / 2;

  drawLeaderboardPane(ctx, {
    x: 24,
    y: cardTop,
    w: paneW,
    h: cardH,
    title: 'TOP VOICE CHANNELS',
    items: topChannels,
    rgb,
    emptyLabel: 'No voice channel traffic recorded'
  });

  drawLeaderboardPane(ctx, {
    x: 24 + paneW + gap,
    y: cardTop,
    w: paneW,
    h: cardH,
    title: 'TOP VOICE PARTICIPANTS',
    items: topUsers,
    rgb,
    emptyLabel: 'No member sessions recorded'
  });

  // Footer KPI bar
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  ctx.fillRect(0, height - 34, width, 34);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - 34);
  ctx.lineTo(width, height - 34);
  ctx.stroke();

  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(
    `NIGHT ${formatDurationShort(blocks.night)}   •   MORNING ${formatDurationShort(blocks.morning)}   •   AFTERNOON ${formatDurationShort(blocks.afternoon)}   •   EVENING ${formatDurationShort(blocks.evening)}`,
    24,
    height - 13
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.90)`;
  ctx.fillText(`${guildName}   •   OFF-THREAD VOICE MATRIX`, width - 24, height - 13);

  // Outer card frame stroke
  rrPath(ctx, 0.75, 0.75, width - 1.5, height - 1.5, 14);
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.30)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
  return canvas.toBuffer('image/png');
}
