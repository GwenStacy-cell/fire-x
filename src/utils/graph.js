import { createCanvas } from './canvas.js';
import { isMainThread, runCanvasTask } from './canvasWorkerHost.js';

function hexToRgb(hex) {
  let clean = String(hex || '').replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
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

function drawSpline(ctx, pts) {
  if (pts.length < 2) return;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[0];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

export async function generatePingGraph(
  pingHistory,
  accentColorHex = '#00e5ff',
  guildsCount = 10,
  extraMetrics = {}
) {
  if (isMainThread) {
    const res = await runCanvasTask(
      'pingGraph',
      [pingHistory, accentColorHex, guildsCount, extraMetrics],
      () => generatePingGraphLocal(pingHistory, accentColorHex, guildsCount, extraMetrics)
    );
    if (res) return Buffer.isBuffer(res) ? res : Buffer.from(res);
  }
  return await generatePingGraphLocal(pingHistory, accentColorHex, guildsCount, extraMetrics);
}

async function generatePingGraphLocal(
  pingHistory,
  accentColorHex = '#00e5ff',
  guildsCount = 10,
  extraMetrics = {}
) {
  let rawData = Array.isArray(pingHistory) ? [...pingHistory] : [pingHistory];
  rawData = rawData
    .filter(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)
    .map(v => Math.round(v));

  if (rawData.length === 0) rawData = [0];

  const maxPoints = 16;
  const realSamples = rawData.slice(-maxPoints);
  const currentPing = realSamples[realSamples.length - 1];

  // Genuine stats strictly derived from recorded real samples (zero fake spikes/jitter)
  const minVal = Math.min(...realSamples);
  const maxVal = Math.max(...realSamples);
  const avgVal = Math.round(realSamples.reduce((a, b) => a + b, 0) / realSamples.length);

  // Mean consecutive sample delta for real jitter
  let jitterNum = 0;
  if (realSamples.length > 1) {
    let deltaSum = 0;
    for (let i = 1; i < realSamples.length; i++) {
      deltaSum += Math.abs(realSamples[i] - realSamples[i - 1]);
    }
    jitterNum = deltaSum / (realSamples.length - 1);
  }
  const jitterVal = jitterNum.toFixed(1);

  // Keep a smooth 2+ point plot even when only 1 sample exists at cold boot
  const data = realSamples.length === 1 ? [realSamples[0], realSamples[0]] : realSamples;
  const numPoints = data.length;

  const width = 920;
  const height = 300;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const { r, g, b } = hexToRgb(accentColorHex);
  const socketMs = extraMetrics?.socketMs ?? null;
  const restMs = extraMetrics?.restMs ?? null;
  const strikeLabel = extraMetrics?.strikeSummaryShort || 'STANDBY';

  // Background — deep obsidian tactical card with rounded clipped border
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, width, height, 14);
  else ctx.rect(0, 0, width, height);
  ctx.clip();

  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#090b12');
  bgGrad.addColorStop(1, '#06070c');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle ambient accent glow behind chart center-right
  const bgRadial = ctx.createRadialGradient(width * 0.65, height * 0.45, 20, width * 0.65, height * 0.45, 420);
  bgRadial.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.14)`);
  bgRadial.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, 0.04)`);
  bgRadial.addColorStop(1, 'rgba(6, 7, 12, 0)');
  ctx.fillStyle = bgRadial;
  ctx.fillRect(0, 0, width, height);

  // Top Header Strip
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  ctx.fillRect(0, 0, width, 54);
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.22)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 54);
  ctx.lineTo(width, 54);
  ctx.stroke();

  // Header Title
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  const titleLeft = 'ATHENA ';
  ctx.fillText(titleLeft, 28, 33);
  const leftW = ctx.measureText(titleLeft).width;
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillText('TELEMETRY MATRIX', 28 + leftW, 33);

  // Health signal chip
  const statusLabel = currentPing < 80 ? 'OPTIMAL' : currentPing < 160 ? 'NOMINAL' : 'ELEVATED';
  const statusChipX = 28 + leftW + ctx.measureText('TELEMETRY MATRIX').width + 14;
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.16)`;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(statusChipX, 18, 76, 20, 5);
  else ctx.rect(statusChipX, 18, 76, 20);
  ctx.fill();
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.45)`;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(statusLabel, statusChipX + 38, 32);

  // Top-right real transport chips
  const topChips = [
    { label: 'WS', value: `${currentPing}ms` },
    ...(socketMs != null ? [{ label: 'TLS', value: `${socketMs}ms` }] : []),
    ...(restMs != null ? [{ label: 'REST', value: `${restMs}ms` }] : [])
  ];
  let chipCursorX = width - 26;
  ctx.font = 'bold 11px monospace';
  for (let i = topChips.length - 1; i >= 0; i--) {
    const ch = topChips[i];
    const textStr = `${ch.label} ${ch.value}`;
    const chipW = ctx.measureText(textStr).width + 20;
    chipCursorX -= chipW;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(chipCursorX, 16, chipW, 24, 6);
    else ctx.rect(chipCursorX, 16, chipW, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(textStr, chipCursorX + chipW / 2, 32);
    chipCursorX -= 8;
  }

  // Plot geometry
  const plotLeft = 70;
  const plotRight = width - 30;
  const plotTop = 76;
  const plotBottom = 236;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const yPad = Math.max(6, Math.ceil((maxVal - minVal) * 0.25) + 4);
  const yMin = Math.max(0, minVal - yPad);
  const yMax = Math.max(yMin + 12, maxVal + yPad);
  const yRange = yMax - yMin;

  // Horizontal dashed gridlines & Y ticks
  const ySteps = 4;
  ctx.font = '10px monospace';
  for (let i = 0; i <= ySteps; i++) {
    const y = plotTop + (i * (plotHeight / ySteps));
    ctx.save();
    ctx.strokeStyle = i === ySteps ? 'rgba(148, 163, 184, 0.24)' : 'rgba(148, 163, 184, 0.09)';
    if (i < ySteps) ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
    ctx.restore();

    const tickMs = Math.round(yMax - (i * (yRange / ySteps)));
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';
    ctx.fillText(`${tickMs}ms`, plotLeft - 10, y + 3);
  }

  // Vertical timeline divisions
  for (let i = 0; i < numPoints; i++) {
    const x = plotLeft + (i * (plotWidth / Math.max(1, numPoints - 1)));
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, plotTop);
    ctx.lineTo(x, plotBottom);
    ctx.stroke();
  }

  // Average benchmark dashed line
  const avgY = plotBottom - (((avgVal - yMin) / yRange) * plotHeight);
  if (avgY >= plotTop && avgY <= plotBottom) {
    ctx.save();
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.35)`;
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(plotLeft, avgY);
    ctx.lineTo(plotRight, avgY);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`AVG ${avgVal}ms`, plotLeft, plotTop - 7);
  }

  // Points
  const points = data.map((val, i) => ({
    x: plotLeft + (i * (plotWidth / Math.max(1, numPoints - 1))),
    y: plotBottom - (((val - yMin) / yRange) * plotHeight),
    val,
    index: i
  }));

  // Gradient area fill
  const areaGradient = ctx.createLinearGradient(0, plotTop, 0, plotBottom);
  areaGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.36)`);
  areaGradient.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, 0.08)`);
  areaGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.0)`);

  ctx.beginPath();
  ctx.moveTo(points[0].x, plotBottom);
  ctx.lineTo(points[0].x, points[0].y);
  drawSpline(ctx, points);
  ctx.lineTo(points[points.length - 1].x, plotBottom);
  ctx.closePath();
  ctx.fillStyle = areaGradient;
  ctx.fill();

  // Outer glow pass
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  drawSpline(ctx, points);
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.32)`;
  ctx.lineWidth = 7;
  ctx.stroke();

  // Core neon stroke
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  drawSpline(ctx, points);
  ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.lineWidth = 2.6;
  ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.85)`;
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Nodes
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const isLatest = i === points.length - 1;

    if (isLatest) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 11, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.20)`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.55)`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#07090e';
      ctx.fill();
      ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
  }

  // Live point pill
  const lastPt = points[points.length - 1];
  const badgeText = `${currentPing}ms NOW`;
  ctx.font = 'bold 11px monospace';
  const badgeWidth = ctx.measureText(badgeText).width + 18;
  const badgeX = Math.min(plotRight - badgeWidth / 2 - 2, Math.max(plotLeft + badgeWidth / 2, lastPt.x));
  const badgeY = lastPt.y - 34 < plotTop ? lastPt.y + 24 : lastPt.y - 26;

  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(badgeX - badgeWidth / 2, badgeY - 10, badgeWidth, 20, 5);
  else ctx.rect(badgeX - badgeWidth / 2, badgeY - 10, badgeWidth, 20);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#06070c';
  ctx.textAlign = 'center';
  ctx.fillText(badgeText, badgeX, badgeY + 4);

  // Sample timeline ticks
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.fillText(realSamples.length > 1 ? `T-${realSamples.length - 1}` : 'INIT', plotLeft, plotBottom + 16);
  ctx.textAlign = 'right';
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillText(`NOW (${realSamples.length}/${maxPoints} SAMPLES)`, plotRight, plotBottom + 16);

  // Bottom KPI Footer Bar
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
  ctx.fillText(`MIN ${minVal}ms   •   AVG ${avgVal}ms   •   PEAK ${maxVal}ms   •   JITTER ±${jitterVal}ms`, 28, height - 13);

  ctx.textAlign = 'right';
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.90)`;
  ctx.fillText(`${guildsCount} GUILDS   •   128 TLS SOCKETS   •   STRIKE ${strikeLabel}`, width - 28, height - 13);

  // Outer card frame stroke
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.30)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0.75, 0.75, width - 1.5, height - 1.5, 14);
  else ctx.rect(0.75, 0.75, width - 1.5, height - 1.5);
  ctx.stroke();

  ctx.restore();
  return canvas.toBuffer('image/png');
}
