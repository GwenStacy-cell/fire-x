import { createCanvas, loadImage, registerFont } from './canvas.js';
import path from 'path';
import fs from 'fs';
import statsDB from '../statsDB.js';

// ============================================================
// FONT REGISTRATION — Noto Sans covers Latin, CJK, Arabic,
// Cyrillic, symbols (★, 「」, etc.) — prevents tofu boxes.
// Roboto is registered as fallback for pure ASCII text.
// ============================================================
const ASSETS = path.resolve('assets');

function tryRegisterFont(file, opts) {
  const full = path.join(ASSETS, file);
  if (fs.existsSync(full)) {
    try { registerFont(full, opts); } catch (e) { /* ignore */ }
  }
}

// Register in priority order — Noto first (broad Unicode), Roboto fallback
tryRegisterFont('NotoSans-Bold.ttf',    { family: 'NotoSans', weight: 'bold' });
tryRegisterFont('NotoSans-Regular.ttf', { family: 'NotoSans', weight: 'normal' });
tryRegisterFont('NotoSansCJK-Regular.otf', { family: 'NotoSansCJK', weight: 'normal' });
tryRegisterFont('NotoSansMath-Regular.ttf', { family: 'NotoSansMath', weight: 'normal' });
tryRegisterFont('Roboto-Bold.ttf',      { family: 'Roboto', weight: 'bold' });
tryRegisterFont('Roboto-Regular.ttf',   { family: 'Roboto', weight: 'normal' });
tryRegisterFont('fa-solid-900.ttf',     { family: 'FontAwesome', weight: '900' });

// Font stacks: NotoSans handles most Unicode, Math handles math alphanumeric, Roboto is the visual style font, Segoe UI Emoji handles UI icons natively on Windows
const FONT_NORMAL = '"NotoSans", "NotoSansCJK", "NotoSansMath", "Segoe UI Emoji", "Roboto", sans-serif';
const FONT_BOLD   = '"NotoSans", "NotoSansCJK", "NotoSansMath", "Segoe UI Emoji", "Roboto", sans-serif';

// ============================================================
// STATBOT EXACT COLOR PALETTE
// ============================================================
const C = {
  bg:        '#2B2D31',   // Card background (modern Discord gray)
  panel:     '#313338',   // Panel / section background
  innerBox:  '#2B2D31',   // Inner stat row boxes (same as bg = inset feel)
  badge:     '#1E1F22',   // Date badge background (darker)
  white:     '#FFFFFF',
  gray:      '#B5BAC1',   // Secondary text (Discord muted)
  muted:     '#949BA4',   // Footer text
  green:     '#23A559',   // Message line / Powered by (Discord green)
  pink:      '#F47FFF',   // Voice line (lighter pink)
  pinkDim:   '#E83D84',   // Darker pink fallback
  accent:    '#23A559',
};

// ============================================================
// HELPERS
// ============================================================

/**
 * Safe canvas text rendering — handles Unicode without crashing.
 * Strips ONLY unrenderable emoji (color emoji range) but keeps
 * Unicode letters, CJK, symbols (★, 「」, etc.) as Noto renders them.
 */
function safeText(str) {
  if (!str) return '';
  // Remove color emoji (these require special emoji fonts not available)
  // Keep: letters, numbers, CJK, punctuation, symbols like ★「」•
  return str
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc Symbols and Pictographs
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport and Map
    .replace(/[\u{1F700}-\u{1F77F}]/gu, '') // Alchemical Symbols
    .replace(/[\u{1F780}-\u{1F7FF}]/gu, '') // Geometric Shapes Extended
    .replace(/[\u{1F800}-\u{1F8FF}]/gu, '') // Supplemental Arrows
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '') // Chess Symbols
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Symbols and Pictographs Extended-A
    .replace(/[\u{2702}-\u{27B0}]/gu, '')   // Dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // Variation Selectors
    .replace(/\uFFFD/g, '')                  // Replacement chars
    .trim();
}

/**
 * Truncate text to fit within maxWidth pixels on given ctx.
 */
function truncateText(ctx, text, maxWidth) {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

function formatNumber(num) {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000)     return (num / 1_000).toFixed(2) + 'k';
  return String(num);
}

function formatHours(seconds) {
  if (seconds < 60)     return seconds + ' secs';
  const mins = seconds / 60;
  if (mins < 60)        return mins.toFixed(2) + ' mins';
  return (mins / 60).toFixed(2) + ' hours';
}

function formatHoursShort(seconds) {
  return (seconds / 3600).toFixed(2);
}

/**
 * Draw a rounded rectangle (filled) with optional shadow.
 */
function drawPanel(ctx, x, y, w, h, r = 10, color = C.panel, hasShadow = true) {
  if (hasShadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;
  }
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
  ctx.fillStyle = color;
  ctx.fill();
  
  if (hasShadow) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
}

/**
 * Draw an inner rounded box (no shadow).
 */
function drawInnerBox(ctx, x, y, w, h, r = 6) {
  drawPanel(ctx, x, y, w, h, r, C.innerBox, false);
}

/**
 * Draw a circular avatar/icon from an image.
 */
async function drawCircularImage(ctx, imageUrl, cx, cy, radius) {
  try {
    const img = await loadImage(imageUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
  } catch (e) {
    // Fallback: gray circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#36393F';
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Draw a smooth line chart with gradient fill.
 */
function drawLineChart(ctx, data, key, maxVal, chartX, chartY, chartW, chartH, lineColor, gradStart, gradEnd) {
  if (!data || data.length < 2) return;
  const stepX = chartW / (data.length - 1);

  ctx.beginPath();
  data.forEach((d, i) => {
    const x = chartX + i * stepX;
    const y = chartY - (maxVal > 0 ? (d[key] / maxVal) * chartH : 0);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Gradient fill under the line
  const lastX = chartX + (data.length - 1) * stepX;
  ctx.lineTo(lastX, chartY);
  ctx.lineTo(chartX, chartY);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, chartY - chartH, 0, chartY);
  grad.addColorStop(0, gradStart);
  grad.addColorStop(1, gradEnd);
  ctx.fillStyle = grad;
  ctx.fill();
}

// ============================================================
// USER STAT CARD — matches Statbot's s?me / s?u output
// ============================================================
export async function generateStatCard(user, member, stats, ranks, topChannels, chartData, guild) {
  const W = 820, H = 460;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Full background
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  const PAD = 18; // outer padding

  // ---- HEADER SECTION ----
  const AVATAR_R = 44;
  const AVATAR_CX = PAD + AVATAR_R;
  const AVATAR_CY = PAD + AVATAR_R + 4;

  // Avatar
  const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
  await drawCircularImage(ctx, avatarUrl, AVATAR_CX, AVATAR_CY, AVATAR_R);

  // Created On / Joined On badges (top right)
  const createdDate = new Date(user.createdTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const joinedDate  = member ? new Date(member.joinedTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown';

  const drawBadge = (label, value, bx) => {
    drawPanel(ctx, bx, PAD, 140, 54, 8, C.badge, true);
    ctx.font = `bold 11px ${FONT_BOLD}`;
    ctx.fillStyle = C.white;
    ctx.fillText(label, bx + 12, PAD + 20);
    ctx.font = `14px ${FONT_NORMAL}`;
    ctx.fillStyle = C.gray;
    ctx.fillText(value, bx + 12, PAD + 40);
  };

  const badge1X = W - PAD - 140 - 10 - 140;
  const badge2X = W - PAD - 140;
  drawBadge('Created On', createdDate, badge1X);
  drawBadge('Joined On', joinedDate, badge2X);

  // Username line: "DisplayName - username" then server name below
  const displayName = safeText(member?.displayName || user.username);
  const userName    = safeText(user.username);

  ctx.font = `bold 28px ${FONT_BOLD}`;
  ctx.fillStyle = C.white;
  
  // Truncate display name if it's extremely long
  const maxNameSpace = badge1X - (AVATAR_CX + AVATAR_R + 14) - 20;
  let nameText = truncateText(ctx, displayName, maxNameSpace * 0.6);
  ctx.fillText(nameText, AVATAR_CX + AVATAR_R + 14, AVATAR_CY - 10);

  // Username in gray after display name (truncate this too if needed)
  if (displayName !== userName) {
    const nameW = ctx.measureText(nameText).width;
    ctx.font = `16px ${FONT_NORMAL}`;
    ctx.fillStyle = C.gray;
    const remainingSpace = maxNameSpace - nameW - 10;
    const truncUserName = truncateText(ctx, `- ${userName}`, remainingSpace);
    ctx.fillText(truncUserName, AVATAR_CX + AVATAR_R + 14 + nameW + 8, AVATAR_CY - 10);
  }

  // Server name + Server Icon below
  const serverName = safeText(guild?.name || '');
  ctx.font = `16px ${FONT_NORMAL}`;
  ctx.fillStyle = C.gray;
  
  // Draw small server icon if available
  const guildIconUrl = guild?.iconURL({ extension: 'png', size: 64 });
  let serverTextX = AVATAR_CX + AVATAR_R + 14;
  if (guildIconUrl) {
    // Increased radius from 10 to 14
    await drawCircularImage(ctx, guildIconUrl, serverTextX + 14, AVATAR_CY + 13, 14);
    serverTextX += 34; // Adjusted offset for larger icon
  }
  ctx.fillText(truncateText(ctx, serverName, maxNameSpace - 34), serverTextX, AVATAR_CY + 18);

  // Separator line
  ctx.fillStyle = '#33363C';
  ctx.fillRect(PAD, AVATAR_CY + AVATAR_R + 14, W - PAD * 2, 1);

  // ---- MIDDLE ROW: Server Ranks | Messages | Voice Activity ----
  const MID_Y = AVATAR_CY + AVATAR_R + 26;
  const MID_H = 148;
  const COL_GAP = 14;
  const COL1_W = 210;
  const COL23_W = (W - PAD * 2 - COL1_W - COL_GAP * 2) / 2;

  // --- Server Ranks panel ---
  drawPanel(ctx, PAD, MID_Y, COL1_W, MID_H);

  ctx.font = `bold 17px ${FONT_BOLD}`;
  ctx.fillStyle = C.white;
  ctx.fillText('Server Ranks', PAD + 14, MID_Y + 26);
  // Trophy icon (FontAwesome)
  ctx.font = '16px "FontAwesome"';
  ctx.fillStyle = C.gray;
  ctx.textAlign = 'right';
  ctx.fillText('\uf091', PAD + COL1_W - 14, MID_Y + 26); // Trophy
  ctx.textAlign = 'left';

  const drawRankRow = (y, label, value) => {
    drawInnerBox(ctx, PAD + 12, y, COL1_W - 24, 32);
    ctx.font = `bold 15px ${FONT_BOLD}`;
    ctx.fillStyle = C.white;
    ctx.fillText(label, PAD + 22, y + 21);
    ctx.textAlign = 'right';
    ctx.fillText(value, PAD + COL1_W - 16, y + 21);
    ctx.textAlign = 'left';
  };

  drawRankRow(MID_Y + 38, 'Message', ranks.msg_rank ? `#${ranks.msg_rank}` : 'N/A');
  drawRankRow(MID_Y + 78, 'Voice', ranks.vc_rank ? `#${ranks.vc_rank}` : 'N/A');

  // --- Messages panel ---
  const MSG_X = PAD + COL1_W + COL_GAP;
  drawPanel(ctx, MSG_X, MID_Y, COL23_W, MID_H);
  ctx.font = `bold 17px ${FONT_BOLD}`;
  ctx.fillStyle = C.white;
  ctx.fillText('Messages', MSG_X + 14, MID_Y + 26);
  ctx.font = '16px "FontAwesome"';
  ctx.fillStyle = C.gray;
  ctx.textAlign = 'right';
  ctx.fillText('#', MSG_X + COL23_W - 14, MID_Y + 26);
  ctx.textAlign = 'left';

  const drawStatRow = (x, y, colW, label, numStr, suffix) => {
    // Label box
    drawInnerBox(ctx, x + 12, y, 38, 30, 5);
    ctx.font = `bold 14px ${FONT_BOLD}`;
    ctx.fillStyle = C.white;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + 12 + 19, y + 20);
    ctx.textAlign = 'left';

    // Number value
    ctx.font = `bold 16px ${FONT_BOLD}`;
    ctx.fillStyle = C.white;
    const numW = ctx.measureText(numStr).width;
    ctx.fillText(numStr, x + 58, y + 20);

    // Italic suffix
    ctx.font = `14px ${FONT_NORMAL}`;
    ctx.fillStyle = C.gray;
    ctx.fillText(suffix, x + 58 + numW + 5, y + 20);
  };

  drawStatRow(MSG_X, MID_Y + 38, COL23_W, '1d',  formatNumber(stats.msg_1d),  'messages');
  drawStatRow(MSG_X, MID_Y + 74, COL23_W, '7d',  formatNumber(stats.msg_7d),  'messages');
  drawStatRow(MSG_X, MID_Y + 110, COL23_W, '14d', formatNumber(stats.msg_14d ?? stats.msg_30d), 'messages');

  // --- Voice Activity panel ---
  const VC_X = MSG_X + COL23_W + COL_GAP;
  drawPanel(ctx, VC_X, MID_Y, COL23_W, MID_H);
  ctx.font = `bold 17px ${FONT_BOLD}`;
  ctx.fillStyle = C.white;
  ctx.fillText('Voice Activity', VC_X + 14, MID_Y + 26);
  ctx.font = '16px "FontAwesome"';
  ctx.fillStyle = C.gray;
  ctx.textAlign = 'right';
  ctx.fillText('\uf028', VC_X + COL23_W - 14, MID_Y + 26); // Volume up
  ctx.textAlign = 'left';

  const drawVcRow = (x, y, colW, label, seconds) => {
    const formatted = formatHours(seconds);
    const parts = formatted.split(' ');
    const num  = parts[0];
    const suff = parts.slice(1).join(' ');
    drawStatRow(x, y, colW, label, num, suff);
  };

  drawVcRow(VC_X, MID_Y + 38,  COL23_W, '1d',  stats.vc_1d);
  drawVcRow(VC_X, MID_Y + 74,  COL23_W, '7d',  stats.vc_7d);
  drawVcRow(VC_X, MID_Y + 110, COL23_W, '14d', stats.vc_14d ?? stats.vc_30d);

  // ---- BOTTOM ROW: Top Channels | Charts ----
  const BOT_Y = MID_Y + MID_H + COL_GAP;
  const BOT_H = H - BOT_Y - PAD - 28; // leave room for footer
  const TC_W = 360;
  const CH_X = PAD + TC_W + COL_GAP;
  const CH_W = W - PAD - TC_W - COL_GAP - PAD;

  // --- Top Channels & Applications panel ---
  drawPanel(ctx, PAD, BOT_Y, TC_W, BOT_H);
  ctx.font = `bold 17px ${FONT_BOLD}`;
  ctx.fillStyle = C.white;
  ctx.fillText('Top Channels & Applications', PAD + 14, BOT_Y + 26);
  ctx.font = '16px "FontAwesome"';
  ctx.fillStyle = C.gray;
  ctx.textAlign = 'right';
  ctx.fillText('\uf201', PAD + TC_W - 14, BOT_Y + 26); // Chart line up
  ctx.textAlign = 'left';

  const drawChannelRow = (y, iconChar, rawName, valueStr) => {
    drawInnerBox(ctx, PAD + 12, y, TC_W - 24, 30);

    // Icon
    ctx.font = '12px "FontAwesome"';
    ctx.fillStyle = C.gray;
    ctx.textAlign = 'center';
    ctx.fillText(iconChar, PAD + 12 + 14, y + 20);
    ctx.textAlign = 'left';

    // Channel name (truncate to fit)
    const safeName = safeText(rawName);
    ctx.font = `bold 14px ${FONT_BOLD}`;
    ctx.fillStyle = C.white;
    const maxNameW = TC_W - 24 - 32 - 80;
    const truncName = truncateText(ctx, safeName, maxNameW);
    ctx.fillText(truncName, PAD + 12 + 30, y + 20);

    // Value right-aligned
    ctx.font = `14px ${FONT_NORMAL}`;
    ctx.fillStyle = C.gray;
    ctx.textAlign = 'right';
    ctx.fillText(valueStr, PAD + TC_W - 16, y + 20);
    ctx.textAlign = 'left';
  };

  // Top message channel
  const topMsg = topChannels.messages[0];
  const topMsgCh = topMsg ? (guild?.channels.cache.get(topMsg.channel_id)) : null;
  const topMsgName = topMsgCh ? topMsgCh.name : (topMsg ? 'deleted-channel' : 'No Activity');
  drawChannelRow(BOT_Y + 38, '#', topMsgName, topMsg ? formatNumber(topMsg.total) + ' messages' : '0');

  // Top voice channel
  const topVc = topChannels.voice[0];
  const topVcCh = topVc ? (guild?.channels.cache.get(topVc.channel_id)) : null;
  const topVcName = topVcCh ? topVcCh.name : (topVc ? 'deleted-channel' : 'No Activity');
  drawChannelRow(BOT_Y + 76, '\uf028', topVcName, topVc ? formatHours(topVc.total) : '0 secs'); // Volume high

  // --- Charts panel ---
  drawPanel(ctx, CH_X, BOT_Y, CH_W, BOT_H);
  ctx.font = `bold 17px ${FONT_BOLD}`;
  ctx.fillStyle = C.white;
  ctx.fillText('Charts', CH_X + 14, BOT_Y + 26);

  // Legend
  const legendX = CH_X + CH_W - 120;
  const legendY = BOT_Y + 26;
  ctx.beginPath(); ctx.arc(legendX, legendY - 4, 5, 0, Math.PI * 2);
  ctx.fillStyle = C.green; ctx.fill();
  ctx.font = `13px ${FONT_NORMAL}`;
  ctx.fillStyle = C.white;
  ctx.fillText('Message', legendX + 8, legendY);

  ctx.beginPath(); ctx.arc(legendX + 68, legendY - 4, 5, 0, Math.PI * 2);
  ctx.fillStyle = C.pink; ctx.fill();
  ctx.fillStyle = C.white;
  ctx.fillText('Voice', legendX + 76, legendY);

  // Chart area
  const cInnerX = CH_X + 14;
  const cInnerY = BOT_Y + BOT_H - 14;
  const cW = CH_W - 28;
  const cH = BOT_H - 44;

  // Baseline
  ctx.strokeStyle = '#33363C';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cInnerX, cInnerY);
  ctx.lineTo(cInnerX + cW, cInnerY);
  ctx.stroke();

  if (chartData && chartData.length > 1) {
    const maxMsg = Math.max(...chartData.map(d => d.messages), 1);
    const maxVc  = Math.max(...chartData.map(d => d.voice_seconds), 1);

    // Voice (pink) — draw first so messages overlap
    drawLineChart(ctx, chartData, 'voice_seconds', maxVc,
      cInnerX, cInnerY, cW, cH,
      C.pink,
      'rgba(244,127,255,0.25)', 'rgba(244,127,255,0.0)'
    );
    // Messages (green)
    drawLineChart(ctx, chartData, 'messages', maxMsg,
      cInnerX, cInnerY, cW, cH,
      C.green,
      'rgba(67,181,129,0.3)', 'rgba(67,181,129,0.0)'
    );
  }

  // ---- FOOTER ----
  ctx.font = `12px ${FONT_NORMAL}`;
  ctx.fillStyle = C.muted;
  ctx.fillText('Server Lookback: Last 14 days  \u2014  Timezone: UTC', PAD, H - 10);
  ctx.font = `bold 12px ${FONT_BOLD}`;
  ctx.fillStyle = C.green;
  ctx.textAlign = 'right';
  ctx.fillText('Powered by Athena Prime', W - PAD, H - 10);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}


// ============================================================
// SERVER OVERVIEW CARD — matches Statbot's serveroverview output
// ============================================================
// ============================================================
// STATBOT SERVER OVERVIEW CARD — Pixel-perfect 8-panel HUD
// ============================================================
function formatStatbotVoice(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h 0m`;
  return `${mins}m`;
}

export async function generateStatbotOverviewImage(guild, inputStats = null, timeframe = '7d') {
  const W = 980, H = 740;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#111215';
  ctx.fillRect(0, 0, W, H);

  // If inputStats not provided or missing messages, query statsDB directly
  let stats = inputStats;
  if (!stats || !stats.messages) {
    stats = statsDB.getServerStatbotStats(guild.id, timeframe);
  }

  const tf = (timeframe || '7d').toLowerCase();
  const tfKey = tf === '24h' ? '24H' : (tf === '30d' ? '30D' : (tf === 'all' ? 'ALL' : '7D'));
  const tfBadge = tf === '24h' ? '24 H' : (tf === '30d' ? '30 D' : (tf === 'all' ? 'ALL' : '7 D'));

  // Ensure guild members cache has members
  await guild.members.fetch().catch(() => null);

  // Helper: Card Panel with subtle border
  const drawCard = (x, y, w, h, title, iconStr, isFa = false) => {
    drawPanel(ctx, x, y, w, h, 12, '#18191c', true);

    ctx.strokeStyle = '#232428';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Title
    ctx.font = `bold 14px ${FONT_BOLD}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(title, x + 16, y + 26);

    // Icon on right
    ctx.font = isFa ? '15px "FontAwesome"' : `bold 16px ${FONT_BOLD}`;
    ctx.fillStyle = '#8e9297';
    ctx.textAlign = 'right';
    ctx.fillText(iconStr, x + w - 16, y + 26);
    ctx.textAlign = 'left';
  };

  // Helper: Inner Stat Row
  const drawRow = (rx, ry, rw, rh, label, numStr, unitStr = '') => {
    drawPanel(ctx, rx, ry, rw, rh, 8, '#111215', false);

    // Left label
    ctx.font = `bold 13px ${FONT_BOLD}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(label, rx + 14, ry + 23);

    // Right value
    ctx.textAlign = 'right';
    if (unitStr) {
      ctx.font = `13px ${FONT_NORMAL}`;
      ctx.fillStyle = '#8e9297';
      const unitW = ctx.measureText(' ' + unitStr).width;
      ctx.fillText(' ' + unitStr, rx + rw - 14, ry + 23);

      ctx.font = `bold 15px ${FONT_BOLD}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(numStr), rx + rw - 14 - unitW, ry + 23);
    } else {
      ctx.font = `bold 15px ${FONT_BOLD}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(numStr), rx + rw - 14, ry + 23);
    }
    ctx.textAlign = 'left';
  };

  // Helper: Member Row with Avatar
  const drawMemberRow = async (rx, ry, rw, rh, userId, numStr, unitStr = '') => {
    drawPanel(ctx, rx, ry, rw, rh, 8, '#111215', false);

    let avatarUrl = null;
    let username = 'None';

    if (userId) {
      try {
        const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
        if (member) {
          username = safeText(member.displayName || member.user.username) || 'Member';
          avatarUrl = member.displayAvatarURL({ extension: 'png', size: 64 });
        } else {
          const user = await guild.client.users.fetch(userId).catch(() => null);
          if (user) {
            username = safeText(user.username) || 'User';
            avatarUrl = user.displayAvatarURL({ extension: 'png', size: 64 });
          }
        }
      } catch {}
    }

    // Circular Avatar
    const avX = rx + 24;
    const avY = ry + Math.floor(rh / 2);
    const avR = 12;

    if (avatarUrl) {
      await drawCircularImage(ctx, avatarUrl, avX, avY, avR);
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.arc(avX, avY, avR, 0, Math.PI * 2);
      ctx.fillStyle = '#36393F';
      ctx.fill();
      ctx.restore();
    }

    // Right value
    ctx.textAlign = 'right';
    let valueWidth = 0;
    if (unitStr) {
      ctx.font = `13px ${FONT_NORMAL}`;
      ctx.fillStyle = '#8e9297';
      const unitW = ctx.measureText(' ' + unitStr).width;
      ctx.fillText(' ' + unitStr, rx + rw - 14, ry + 23);

      ctx.font = `bold 15px ${FONT_BOLD}`;
      ctx.fillStyle = '#ffffff';
      const numW = ctx.measureText(String(numStr)).width;
      ctx.fillText(String(numStr), rx + rw - 14 - unitW, ry + 23);
      valueWidth = unitW + numW + 8;
    } else {
      ctx.font = `bold 15px ${FONT_BOLD}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(numStr), rx + rw - 14, ry + 23);
      valueWidth = ctx.measureText(String(numStr)).width + 8;
    }
    ctx.textAlign = 'left';

    // Username
    ctx.font = `bold 14px ${FONT_BOLD}`;
    ctx.fillStyle = '#ffffff';
    const maxUserW = rw - 44 - valueWidth - 10;
    ctx.fillText(truncateText(ctx, username, maxUserW), rx + 44, ry + 23);
  };

  // ---- 1. TOP HEADER ----
  const HX = 20, HY = 20, HW = 940, HH = 64;
  drawPanel(ctx, HX, HY, HW, HH, 12, '#18191c', true);
  ctx.strokeStyle = '#232428';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Breadcrumb
  ctx.font = `bold 17px ${FONT_BOLD}`;
  ctx.fillStyle = '#8e9297';
  ctx.textAlign = 'left';
  ctx.fillText('Server Stats', HX + 16, HY + 38);

  const statsW = ctx.measureText('Server Stats').width;
  ctx.fillStyle = '#4e5058';
  ctx.fillText(' > ', HX + 16 + statsW, HY + 38);

  const arrowW = ctx.measureText(' > ').width;
  ctx.font = '17px "FontAwesome"';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('\uf015', HX + 16 + statsW + arrowW, HY + 38); // fa-home

  const homeW = ctx.measureText('\uf015').width;
  ctx.font = `bold 20px ${FONT_BOLD}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(' Overview', HX + 16 + statsW + arrowW + homeW, HY + 38);

  // Right Pill Badge
  const BW = 146, BH = 44;
  const BX = HX + HW - BW - 14;
  const BY = HY + Math.floor((HH - BH) / 2);
  drawPanel(ctx, BX, BY, BW, BH, 22, '#d2e3fc', false);

  ctx.textAlign = 'center';
  ctx.font = `bold 11px ${FONT_BOLD}`;
  ctx.fillStyle = '#0b57d0';
  ctx.fillText(tfBadge, BX + Math.floor(BW / 2), BY + 17);

  ctx.font = `bold 12px ${FONT_BOLD}`;
  ctx.fillStyle = '#0b57d0';
  ctx.fillText(`${guild.memberCount.toLocaleString()} members`, BX + Math.floor(BW / 2), BY + 33);
  ctx.textAlign = 'left';

  // ---- 2. ROW 1: MESSAGES | VOICE | ACTIVE USERS ----
  const R1_Y = 100, R1_H = 180;
  const COL3_W = Math.floor((HW - 28) / 3); // 304px
  const GAP = 14;

  const C1_X = HX;
  const C2_X = C1_X + COL3_W + GAP;
  const C3_X = C2_X + COL3_W + GAP;

  // Card 1: MESSAGES
  drawCard(C1_X, R1_Y, COL3_W, R1_H, 'MESSAGES', '#');
  drawRow(C1_X + 12, R1_Y + 38, COL3_W - 24, 36, tfKey, (stats.messages?.total || 0).toLocaleString(), 'messages');
  drawRow(C1_X + 12, R1_Y + 80, COL3_W - 24, 36, 'AVG', (stats.messages?.avg || 0).toLocaleString(), 'per day');
  drawRow(C1_X + 12, R1_Y + 122, COL3_W - 24, 36, 'TODAY', (stats.messages?.today || 0).toLocaleString(), 'messages');

  // Card 2: VOICE
  drawCard(C2_X, R1_Y, COL3_W, R1_H, 'VOICE', '\uf130', true); // fa-microphone
  drawRow(C2_X + 12, R1_Y + 38, COL3_W - 24, 36, tfKey, formatStatbotVoice(stats.voice?.totalSeconds || 0));
  drawRow(C2_X + 12, R1_Y + 80, COL3_W - 24, 36, 'AVG', formatStatbotVoice(stats.voice?.avgSeconds || 0), 'per day');
  drawRow(C2_X + 12, R1_Y + 122, COL3_W - 24, 36, 'TODAY', formatStatbotVoice(stats.voice?.todaySeconds || 0));

  // Card 3: ACTIVE USERS
  drawCard(C3_X, R1_Y, COL3_W, R1_H, 'ACTIVE USERS', '\uf0c0', true); // fa-users
  drawRow(C3_X + 12, R1_Y + 38, COL3_W - 24, 36, 'ACTIVE', (stats.activeUsers?.active || 0).toLocaleString(), 'users');
  drawRow(C3_X + 12, R1_Y + 80, COL3_W - 24, 36, 'AVG', stats.activeUsers?.avg || '0.000', 'per day');
  drawRow(C3_X + 12, R1_Y + 122, COL3_W - 24, 36, 'PEAK', (stats.activeUsers?.peak || 0).toLocaleString(), 'users');

  // ---- 3. ROW 2: TOP MESSAGE MEMBERS | TOP VOICE MEMBERS ----
  const R2_Y = 294, R2_H = 180;
  const COL2_W = Math.floor((HW - GAP) / 2); // 463px
  const MC1_X = HX;
  const MC2_X = MC1_X + COL2_W + GAP;

  const topMsgs = stats.topMsgMembers || [];
  const topVcs = stats.topVcMembers || [];

  // Card 4: TOP MESSAGE MEMBERS
  drawCard(MC1_X, R2_Y, COL2_W, R2_H, 'TOP MESSAGE MEMBERS', '#');
  await drawMemberRow(MC1_X + 12, R2_Y + 38, COL2_W - 24, 36, topMsgs[0]?.user_id, (topMsgs[0]?.total || 0).toLocaleString(), 'messages');
  await drawMemberRow(MC1_X + 12, R2_Y + 80, COL2_W - 24, 36, topMsgs[1]?.user_id, (topMsgs[1]?.total || 0).toLocaleString(), 'messages');
  await drawMemberRow(MC1_X + 12, R2_Y + 122, COL2_W - 24, 36, topMsgs[2]?.user_id, (topMsgs[2]?.total || 0).toLocaleString(), 'messages');

  // Card 5: TOP VOICE MEMBERS
  drawCard(MC2_X, R2_Y, COL2_W, R2_H, 'TOP VOICE MEMBERS', '\uf130', true); // fa-microphone
  await drawMemberRow(MC2_X + 12, R2_Y + 38, COL2_W - 24, 36, topVcs[0]?.user_id, formatStatbotVoice(topVcs[0]?.total || 0));
  await drawMemberRow(MC2_X + 12, R2_Y + 80, COL2_W - 24, 36, topVcs[1]?.user_id, formatStatbotVoice(topVcs[1]?.total || 0));
  await drawMemberRow(MC2_X + 12, R2_Y + 122, COL2_W - 24, 36, topVcs[2]?.user_id, formatStatbotVoice(topVcs[2]?.total || 0));

  // ---- 4. ROW 3: REACTIONS | LINKS | MEMBERS ----
  const R3_Y = 488, R3_H = 180;
  const RC1_X = HX;
  const RC2_X = RC1_X + COL3_W + GAP;
  const RC3_X = RC2_X + COL3_W + GAP;

  // Card 6: REACTIONS
  drawCard(RC1_X, R3_Y, COL3_W, R3_H, 'REACTIONS', '\uf118', true); // fa-smile
  drawRow(RC1_X + 12, R3_Y + 38, COL3_W - 24, 36, tfKey, (stats.reactions?.total || 0).toLocaleString(), 'reactions');
  drawRow(RC1_X + 12, R3_Y + 80, COL3_W - 24, 36, 'AVG', stats.reactions?.avg || '0.000', 'per day');
  drawRow(RC1_X + 12, R3_Y + 122, COL3_W - 24, 36, 'TOTAL', (stats.reactions?.all || 0).toLocaleString());

  // Card 7: LINKS
  drawCard(RC2_X, R3_Y, COL3_W, R3_H, 'LINKS', '\uf0c1', true); // fa-link
  drawRow(RC2_X + 12, R3_Y + 38, COL3_W - 24, 36, tfKey, (stats.links?.total || 0).toLocaleString(), 'links');
  drawRow(RC2_X + 12, R3_Y + 80, COL3_W - 24, 36, 'AVG', stats.links?.avg || '0.000', 'per day');
  drawRow(RC2_X + 12, R3_Y + 122, COL3_W - 24, 36, 'TOTAL', (stats.links?.all || 0).toLocaleString());

  // Card 8: MEMBERS
  drawCard(RC3_X, R3_Y, COL3_W, R3_H, 'MEMBERS', '\uf0c0', true); // fa-users
  drawRow(RC3_X + 12, R3_Y + 38, COL3_W - 24, 36, 'NOW', `${guild.memberCount.toLocaleString()} members`);
  drawRow(RC3_X + 12, R3_Y + 80, COL3_W - 24, 36, 'JOINED', (stats.members?.joined || 0).toLocaleString());
  drawRow(RC3_X + 12, R3_Y + 122, COL3_W - 24, 36, 'LEFT', (stats.members?.left || 0).toLocaleString());

  // ---- 5. FOOTER ----
  const FY = 706;
  ctx.font = `13px ${FONT_NORMAL}`;
  ctx.fillStyle = '#72767d';
  ctx.textAlign = 'left';
  ctx.fillText(`Tracking since ${stats.trackingSince || '2026-10-05'} | UTC`, HX, FY);

  ctx.textAlign = 'right';
  ctx.fillText('Powered by \u2B21 Athena', HX + HW, FY);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

export const generateServerOverviewImage = generateStatbotOverviewImage;

/**
 * Generate a dedicated high-fidelity Dual-Chart Server Trend Canvas
 */
export async function generateServerTrendImage(guild, chartData = null, timeframe = '7d') {
  const W = 980, H = 580;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#111215';
  ctx.fillRect(0, 0, W, H);

  const tf = (timeframe || '7d').toLowerCase();
  const tfBadge = tf === '24h' ? '24 H' : (tf === '30d' ? '30 D' : (tf === 'all' ? 'ALL' : '7 D'));

  // If chartData not provided or empty, query statsDB
  let data = chartData;
  if (!data || data.length === 0) {
    const overview = statsDB.getServerOverviewStats(guild.id);
    data = overview?.chart || [];
  }

  // Ensure we have at least 7 points for a nice visual curve
  if (!data || data.length < 2) {
    const today = new Date();
    data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      data.push({
        date: d.toISOString().split('T')[0],
        messages: 0,
        voice_seconds: 0
      });
    }
  }

  // Ensure guild members cache has members
  await guild.members.fetch().catch(() => null);

  // ---- 1. TOP HEADER ----
  const HX = 20, HY = 20, HW = 940, HH = 64;
  drawPanel(ctx, HX, HY, HW, HH, 12, '#18191c', true);
  ctx.strokeStyle = '#232428';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Breadcrumb
  ctx.font = `bold 17px ${FONT_BOLD}`;
  ctx.fillStyle = '#8e9297';
  ctx.textAlign = 'left';
  ctx.fillText('Server Stats', HX + 16, HY + 38);

  const statsW = ctx.measureText('Server Stats').width;
  ctx.fillStyle = '#4e5058';
  ctx.fillText(' > ', HX + 16 + statsW, HY + 38);

  const arrowW = ctx.measureText(' > ').width;
  ctx.font = '17px "FontAwesome"';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('\uf201', HX + 16 + statsW + arrowW, HY + 38); // fa-chart-line

  const iconW = ctx.measureText('\uf201').width;
  ctx.font = `bold 20px ${FONT_BOLD}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(' Activity Trends & Graphs', HX + 16 + statsW + arrowW + iconW, HY + 38);

  // Right Pill Badge
  const BW = 146, BH = 44;
  const BX = HX + HW - BW - 14;
  const BY = HY + Math.floor((HH - BH) / 2);
  drawPanel(ctx, BX, BY, BW, BH, 22, '#d2e3fc', false);

  ctx.textAlign = 'center';
  ctx.font = `bold 11px ${FONT_BOLD}`;
  ctx.fillStyle = '#0b57d0';
  ctx.fillText(tfBadge, BX + Math.floor(BW / 2), BY + 17);

  ctx.font = `bold 12px ${FONT_BOLD}`;
  ctx.fillStyle = '#0b57d0';
  ctx.fillText(`${guild.memberCount.toLocaleString()} members`, BX + Math.floor(BW / 2), BY + 33);
  ctx.textAlign = 'left';

  // ---- 2. PANEL 1: MESSAGES VOLUME GRAPH ----
  const P1_Y = 100, P1_H = 205;
  drawPanel(ctx, HX, P1_Y, HW, P1_H, 12, '#18191c', true);
  ctx.strokeStyle = '#232428';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Title
  ctx.font = `bold 14px ${FONT_BOLD}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('MESSAGES ACTIVITY TREND', HX + 16, P1_Y + 28);

  // Sub metrics
  const totalMsgs = data.reduce((sum, d) => sum + (d.messages || 0), 0);
  const maxMsg = Math.max(...data.map(d => d.messages || 0), 1);
  const avgMsg = Math.round(totalMsgs / data.length);

  ctx.textAlign = 'right';
  ctx.font = `13px ${FONT_NORMAL}`;
  ctx.fillStyle = '#8e9297';
  ctx.fillText(`Total: ${totalMsgs.toLocaleString()} msgs  |  Peak: ${maxMsg.toLocaleString()} msgs  |  Avg: ${avgMsg.toLocaleString()} / day`, HX + HW - 16, P1_Y + 28);
  ctx.textAlign = 'left';

  // Draw Line Chart for Messages
  const chartX = HX + 24;
  const chartW = HW - 48;
  const chartY = P1_Y + P1_H - 28;
  const chartH = 120;

  drawLineChart(ctx, data, 'messages', maxMsg, chartX, chartY, chartW, chartH, '#5865F2', 'rgba(88, 101, 242, 0.45)', 'rgba(88, 101, 242, 0.0)');

  // Date labels along X-axis
  ctx.font = `11px ${FONT_NORMAL}`;
  ctx.fillStyle = '#72767d';
  const stepX = chartW / (data.length - 1);
  data.forEach((d, i) => {
    if (data.length > 10 && i % 2 !== 0 && i !== data.length - 1) return;
    const x = chartX + i * stepX;
    const shortDate = d.date ? d.date.slice(5) : '';
    ctx.textAlign = 'center';
    ctx.fillText(shortDate, x, chartY + 18);
  });
  ctx.textAlign = 'left';

  // ---- 3. PANEL 2: VOICE ACTIVITY GRAPH ----
  const P2_Y = 320, P2_H = 205;
  drawPanel(ctx, HX, P2_Y, HW, P2_H, 12, '#18191c', true);
  ctx.strokeStyle = '#232428';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Title
  ctx.font = `bold 14px ${FONT_BOLD}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('VOICE ACTIVITY TREND', HX + 16, P2_Y + 28);

  // Sub metrics
  const totalVcSecs = data.reduce((sum, d) => sum + (d.voice_seconds || 0), 0);
  const maxVc = Math.max(...data.map(d => d.voice_seconds || 0), 1);
  const avgVcSecs = Math.round(totalVcSecs / data.length);

  const formatHours = (s) => (s / 3600).toFixed(1) + 'h';

  ctx.textAlign = 'right';
  ctx.font = `13px ${FONT_NORMAL}`;
  ctx.fillStyle = '#8e9297';
  ctx.fillText(`Total: ${formatHours(totalVcSecs)}  |  Peak: ${formatHours(maxVc)}  |  Avg: ${formatHours(avgVcSecs)} / day`, HX + HW - 16, P2_Y + 28);
  ctx.textAlign = 'left';

  // Draw Line Chart for Voice
  const vChartY = P2_Y + P2_H - 28;
  drawLineChart(ctx, data, 'voice_seconds', maxVc, chartX, vChartY, chartW, chartH, '#2ECC71', 'rgba(46, 204, 113, 0.45)', 'rgba(46, 204, 113, 0.0)');

  // Date labels along X-axis
  ctx.font = `11px ${FONT_NORMAL}`;
  ctx.fillStyle = '#72767d';
  data.forEach((d, i) => {
    if (data.length > 10 && i % 2 !== 0 && i !== data.length - 1) return;
    const x = chartX + i * stepX;
    const shortDate = d.date ? d.date.slice(5) : '';
    ctx.textAlign = 'center';
    ctx.fillText(shortDate, x, vChartY + 18);
  });
  ctx.textAlign = 'left';

  // ---- 4. FOOTER ----
  const FY = 554;
  ctx.font = `13px ${FONT_NORMAL}`;
  ctx.fillStyle = '#72767d';
  ctx.textAlign = 'left';
  ctx.fillText(`Server Telemetry \u2022 ${data.length} Data Points Plotted | UTC`, HX, FY);

  ctx.textAlign = 'right';
  ctx.fillText('Powered by \u2B21 Athena', HX + HW, FY);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}


// ============================================================
// TOP LEADERBOARD IMAGE — Ultra-HD God of War / Dark Fire Theme
// ============================================================
export async function generateTopImage(guild, topMsgMembers = [], topVoiceMembers = []) {
  const W = 1024;
  const H = 530;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  try {
    // 1. Draw base HD template
    const templatePath = path.resolve('src/assets/top_gow_template.png');
    let templateImg = null;
    if (fs.existsSync(templatePath)) {
      try {
        templateImg = await loadImage(templatePath);
        ctx.drawImage(templateImg, 0, 0, W, H);
      } catch (e) {
        console.error('[StatCanvas] Template load error:', e.message);
      }
    }

    if (!templateImg) {
      // Robust dark slate fallback if file is ever missing
      ctx.fillStyle = '#0F1014';
      ctx.fillRect(0, 0, W, H);
    }

    // 2. Server Avatar (Top-Left Ornate Frame)
    // Center: (104, 104), Radius: 60 (diameter 120px)
    const iconUrl = guild && typeof guild.iconURL === 'function'
      ? guild.iconURL({ extension: 'png', size: 128 })
      : null;

    ctx.save();
    ctx.beginPath();
    ctx.arc(104, 104, 60, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    let guildAvatarLoaded = false;
    if (iconUrl) {
      try {
        const gIcon = await loadImage(iconUrl);
        ctx.drawImage(gIcon, 44, 44, 120, 120);
        guildAvatarLoaded = true;
      } catch {}
    }

    if (!guildAvatarLoaded) {
      ctx.fillStyle = '#1A1C20';
      ctx.fillRect(44, 44, 120, 120);
      ctx.font = 'bold 44px "Cinzel", "Georgia", "NotoSans", serif';
      ctx.fillStyle = '#E52B38';
      ctx.textAlign = 'center';
      const initial = (guild?.name || 'S').trim().charAt(0).toUpperCase();
      ctx.fillText(initial, 104, 119);
    }
    ctx.restore();

    // Subtle inner shadow ring over avatar for seamless integration with the ornate frame
    ctx.save();
    ctx.beginPath();
    ctx.arc(104, 104, 60, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // 3. Server Name Typography (Metallic Silver + Crimson Dual Tone)
    const rawName = (guild?.name || 'SERVER').toUpperCase();
    const cleanName = safeText(rawName) || 'SERVER';
    renderTopServerTitle(ctx, cleanName, 196, 96);

    // 4. Rows (5 rows per column)
    const ROWS = 5;
    const ROW_START_Y = 252;
    const ROW_STEP = 52;

    const maxVoiceSec = topVoiceMembers.length > 0 && topVoiceMembers[0]?.total > 0
      ? topVoiceMembers[0].total
      : 1;

    for (let i = 0; i < ROWS; i++) {
      const rowCenterY = ROW_START_Y + i * ROW_STEP;
      const isRank1 = i === 0;

      // --- CARD 1 (MESSAGES) ---
      const msgUser = topMsgMembers[i] || null;
      await renderTopMemberRow(ctx, {
        rank: i + 1,
        isRank1,
        user: msgUser,
        statText: msgUser ? formatMsgsText(msgUser.total) : '0 msgs',
        badgeX: 35,
        avatarX: 104,
        nameX: 138,
        statRightX: 475,
        rowCenterY,
        isVoice: false
      });

      // Divider under message row
      if (i < ROWS - 1) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(35, rowCenterY + 26);
        ctx.lineTo(484, rowCenterY + 26);
        if (isRank1) {
          ctx.strokeStyle = 'rgba(229, 43, 56, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.shadowColor = 'rgba(229, 43, 56, 0.6)';
          ctx.shadowBlur = 6;
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.lineWidth = 1;
        }
        ctx.stroke();
        ctx.restore();
      }

      // --- CARD 2 (VOICE) ---
      const voiceUser = topVoiceMembers[i] || null;
      const voiceSec = voiceUser?.total || 0;
      const voiceRatio = maxVoiceSec > 0 ? (voiceSec / maxVoiceSec) : 0;

      await renderTopMemberRow(ctx, {
        rank: i + 1,
        isRank1,
        user: voiceUser,
        statText: voiceUser ? formatVoiceHoursText(voiceUser.total) : '0.00 hours',
        badgeX: 520,
        avatarX: 585,
        nameX: 618,
        statRightX: 955,
        rowCenterY,
        isVoice: true,
        voiceRatio
      });

      // Divider under voice row
      if (i < ROWS - 1) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(522, rowCenterY + 26);
        ctx.lineTo(968, rowCenterY + 26);
        if (isRank1) {
          ctx.strokeStyle = 'rgba(229, 43, 56, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.shadowColor = 'rgba(229, 43, 56, 0.6)';
          ctx.shadowBlur = 6;
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.lineWidth = 1;
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    return canvas.toBuffer('image/png');
  } catch (err) {
    console.error('[StatCanvas] generateTopImage critical error:', err);
    // Ultimate failsafe: return black canvas buffer instead of crashing
    return canvas.toBuffer('image/png');
  }
}

function formatMsgsText(num) {
  if (!num || num <= 0) return '0 msgs';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M msgs';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'k msgs';
  return num + ' msgs';
}

function formatVoiceHoursText(seconds) {
  if (!seconds || seconds <= 0) return '0.00 hours';
  const hours = seconds / 3600;
  return hours.toFixed(2) + ' hours';
}

function renderTopServerTitle(ctx, name, startX, baselineY) {
  ctx.save();
  let fontSize = 38;
  if (name.length > 25) fontSize = 22;
  else if (name.length > 18) fontSize = 28;
  else if (name.length > 12) fontSize = 32;

  ctx.font = `bold ${fontSize}px "Cinzel", "Georgia", "NotoSans", serif`;

  const words = name.split(' ');
  let part1 = '', part2 = '';
  if (words.length > 1) {
    const half = Math.ceil(words.length / 2);
    part1 = words.slice(0, half).join(' ') + ' ';
    part2 = words.slice(half).join(' ');
  } else if (name.length > 6) {
    const half = Math.floor(name.length / 2);
    part1 = name.slice(0, half);
    part2 = name.slice(half);
  } else {
    part1 = name;
    part2 = '';
  }

  // 1. Part 1 — flat stone grey (exactly like reference: dull grey, not bright white)
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#b0b4bb'; // stone grey — matches "EDITORS" in reference
  ctx.fillText(part1, startX, baselineY);
  ctx.restore();

  // 2. Part 2 — flat bright red (matches "HE4VEN" in reference)
  if (part2) {
    const w1 = ctx.measureText(part1).width;
    ctx.save();
    ctx.shadowColor = 'rgba(200, 20, 20, 0.70)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#cc1818'; // blood red — matches the reference
    ctx.fillText(part2, startX + w1, baselineY);
    ctx.restore();
  }
  ctx.restore();
}


async function renderTopMemberRow(ctx, opts) {
  const { rank, isRank1, user, statText, badgeX, avatarX, nameX, statRightX, rowCenterY, isVoice, voiceRatio } = opts;

  // 1. Rank Badge (48w x 40h)
  const bW = 48, bH = 40;
  const bY = rowCenterY - 20;
  const bR = 8;

  ctx.save();
  ctx.beginPath();
  drawTopRoundRect(ctx, badgeX, bY, bW, bH, bR);

  if (isRank1) {
    const grad1 = ctx.createLinearGradient(0, bY, 0, bY + bH);
    grad1.addColorStop(0, '#F53B47');
    grad1.addColorStop(0.5, '#C8232D');
    grad1.addColorStop(1, '#7E1118');
    ctx.fillStyle = grad1;
    ctx.shadowColor = 'rgba(245, 59, 71, 0.5)';
    ctx.shadowBlur = 8;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 120, 130, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 20px "NotoSans", sans-serif';
    ctx.fillStyle = '#140304';
    ctx.textAlign = 'center';
    ctx.fillText('1', badgeX + bW / 2, rowCenterY + 7);
  } else {
    const gradGlass = ctx.createLinearGradient(0, bY, 0, bY + bH);
    gradGlass.addColorStop(0, '#242629');
    gradGlass.addColorStop(1, '#17181A');
    ctx.fillStyle = gradGlass;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 18px "NotoSans", sans-serif';
    ctx.fillStyle = '#A6ABB2';
    ctx.textAlign = 'center';
    ctx.fillText(String(rank), badgeX + bW / 2, rowCenterY + 6);
  }
  ctx.restore();

  // 2. User Avatar (36px diameter)
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, rowCenterY, 18, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  let avatarLoaded = false;
  if (user && user.avatarUrl) {
    try {
      const avImg = await loadImage(user.avatarUrl);
      ctx.drawImage(avImg, avatarX - 18, rowCenterY - 18, 36, 36);
      avatarLoaded = true;
    } catch {}
  }

  if (!avatarLoaded) {
    ctx.fillStyle = user ? '#262930' : '#141618';
    ctx.fillRect(avatarX - 18, rowCenterY - 18, 36, 36);
    ctx.font = 'bold 15px "NotoSans", sans-serif';
    ctx.fillStyle = user ? '#8C929E' : '#3E424B';
    ctx.textAlign = 'center';
    ctx.fillText(user ? (user.username ? user.username.charAt(0).toUpperCase() : '?') : '•', avatarX, rowCenterY + 5);
  }
  ctx.restore();

  // Avatar circular outline
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, rowCenterY, 18, 0, Math.PI * 2);
  ctx.strokeStyle = isRank1 ? 'rgba(229, 43, 56, 0.35)' : 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();

  // 3. Username
  ctx.save();
  const userNameText = user ? (safeText(user.username) || `User ${rank}`) : '---';
  const nameBaseline = isVoice ? (rowCenterY - 2) : (rowCenterY + 5);

  ctx.font = 'bold 16px "NotoSans", sans-serif';
  ctx.fillStyle = user ? (isRank1 ? '#FFFFFF' : '#E0E3E8') : '#555A64';
  ctx.textAlign = 'left';

  const maxNameW = isVoice ? 170 : 210;
  ctx.fillText(truncateText(ctx, userNameText, maxNameW), nameX, nameBaseline);
  ctx.restore();

  // 4. Voice Progress Bar (Only for Voice Card)
  if (isVoice) {
    const barX = nameX;
    const barY = rowCenterY + 8;
    const maxBarW = 190;
    const barH = 5;

    ctx.save();
    // Background track
    ctx.beginPath();
    drawTopRoundRect(ctx, barX, barY, maxBarW, barH, 3);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.fill();

    // Filled bar
    if (user && voiceRatio > 0) {
      const fillW = Math.max(8, Math.round(maxBarW * Math.min(1, voiceRatio)));
      ctx.beginPath();
      drawTopRoundRect(ctx, barX, barY, fillW, barH, 3);

      if (isRank1) {
        const gradBar = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
        gradBar.addColorStop(0, '#E52B38');
        gradBar.addColorStop(1, '#FF5462');
        ctx.fillStyle = gradBar;
        ctx.shadowColor = 'rgba(255, 65, 77, 0.7)';
        ctx.shadowBlur = 8;
      } else {
        const gradBar = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
        gradBar.addColorStop(0, '#5A5E66');
        gradBar.addColorStop(1, '#8E949E');
        ctx.fillStyle = gradBar;
      }
      ctx.fill();
    }
    ctx.restore();
  }

  // 5. Stat Text
  ctx.save();
  ctx.font = 'bold 17px "NotoSans", sans-serif';
  ctx.textAlign = 'right';

  if (user) {
    if (isRank1) {
      ctx.fillStyle = '#FF414D';
      ctx.shadowColor = 'rgba(255, 65, 77, 0.4)';
      ctx.shadowBlur = 6;
    } else {
      ctx.fillStyle = '#FFFFFF';
    }
  } else {
    ctx.fillStyle = '#4D515A';
  }

  ctx.fillText(statText, statRightX, rowCenterY + 5);
  ctx.restore();
}

function drawTopRoundRect(ctx, x, y, w, h, r) {
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


export async function generateInviteTopImage(guild, topInvites, lastSync = null) {
  const ROWS = 10;
  const ROW_H = 46;
  const HEADER_H = 100;
  const SECTION_TITLE_H = 40;
  const BOTTOM_PAD = 30;
  const H = HEADER_H + SECTION_TITLE_H + (Math.min(ROWS, Math.max(topInvites.length, 1)) * ROW_H) + BOTTOM_PAD + 26;
  const W = 650;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const PAD = 18;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // ---- HEADER ----
  const ICON_R = 36;
  const ICON_CX = PAD + ICON_R;
  const ICON_CY = PAD + ICON_R + 4;

  if (guild.iconURL()) {
    try {
      const gIcon = await loadImage(guild.iconURL({ extension: 'png', size: 128 }));
      ctx.save();
      ctx.beginPath();
      ctx.arc(ICON_CX, ICON_CY, ICON_R, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(gIcon, ICON_CX - ICON_R, ICON_CY - ICON_R, ICON_R * 2, ICON_R * 2);
      ctx.restore();
    } catch(e) {}
  } else {
    ctx.fillStyle = C.panel;
    ctx.beginPath();
    ctx.arc(ICON_CX, ICON_CY, ICON_R, 0, Math.PI * 2);
    ctx.fill();
  }

  // Add shadow to title
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;
  
  ctx.fillStyle = C.white;
  ctx.font = `900 28px ${FONT_BOLD}`; // Bolder, slightly larger
  ctx.fillText("INVITE LEADERBOARD", ICON_CX + ICON_R + 15, ICON_CY - 5);
  
  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = C.gray;
  ctx.font = `400 14px ${FONT_NORMAL}`;
  
  const today = new Date();
  const past14 = new Date(today);
  past14.setDate(today.getDate() - 13);
  const dateOptionsStr = { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' };
  const d1Str = past14.toLocaleDateString('en-IN', dateOptionsStr);
  const d2Str = today.toLocaleDateString('en-IN', dateOptionsStr);

  const subtitleText = `${guild.name} | Data: ${d1Str} to ${d2Str} (Past 14 Days)`;
  ctx.fillText(subtitleText, ICON_CX + ICON_R + 15, ICON_CY + 18);

  const Y_START = HEADER_H + SECTION_TITLE_H;

  ctx.fillStyle = C.white;
  ctx.font = `600 16px ${FONT_BOLD}`;
  ctx.fillText("Top Inviters", PAD, HEADER_H + 20);
  
  if (topInvites.length === 0) {
    ctx.fillStyle = C.gray;
    ctx.font = `400 14px ${FONT_NORMAL}`;
    ctx.fillText("No invite data found.", PAD, Y_START + 25);
  } else {
    for (let i = 0; i < topInvites.length && i < ROWS; i++) {
      const u = topInvites[i];
      const y = Y_START + (i * ROW_H);

      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = C.panel; // Use lighter panel color so it floats
      ctx.fillRect(PAD, y, W - (PAD * 2), ROW_H - 6);
      
      // Reset shadow so it doesn't affect the text and rank badges!
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Rank badge
      ctx.fillStyle = C.badge;
      ctx.fillRect(PAD, y, 40, ROW_H - 6);
      ctx.fillStyle = (i === 0) ? '#F1C40F' : (i === 1) ? '#E67E22' : (i === 2) ? '#95A5A6' : C.white;
      ctx.font = `600 14px ${FONT_BOLD}`;
      ctx.textAlign = 'center';
      ctx.fillText(`#${i + 1}`, PAD + 20, y + 25);
      ctx.textAlign = 'left';

      // Name
      ctx.fillStyle = C.white;
      ctx.font = `500 14px ${FONT_NORMAL}`;
      ctx.fillText(u.username, PAD + 55, y + 25);

      // Net Score
      const netText = `${u.net} Invites`;
      ctx.font = `600 14px ${FONT_BOLD}`;
      const netW = ctx.measureText(netText).width;
      
      const statX = W - PAD - netW - 10;
      ctx.fillStyle = C.green;
      ctx.fillText(netText, statX, y + 25);
    }
  }

  // Footer
  ctx.fillStyle = C.muted;
  ctx.font = `400 11px ${FONT_NORMAL}`;
  ctx.textAlign = 'center';
  ctx.fillText("Admins: Run !syncinvites to pull the latest offline active invites from Discord.", W / 2, H - 22);
  ctx.fillText("Data powered by Athena Prime Stats Engine", W / 2, H - 8);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}


export async function generateChatTopImage(guild, topMembers) {
  const ROWS = 10;
  const ROW_H = 46;
  const HEADER_H = 100;
  const SECTION_TITLE_H = 40;
  const BOTTOM_PAD = 30;
  const H = HEADER_H + SECTION_TITLE_H + (Math.min(ROWS, Math.max(topMembers.length, 1)) * ROW_H) + BOTTOM_PAD;
  const W = 650;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const PAD = 18;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // ---- HEADER ----
  const ICON_R = 36;
  const ICON_CX = PAD + ICON_R;
  const ICON_CY = PAD + ICON_R + 4;

  if (guild.iconURL()) {
    try {
      const gIcon = await loadImage(guild.iconURL({ extension: 'png', size: 128 }));
      ctx.save();
      ctx.beginPath();
      ctx.arc(ICON_CX, ICON_CY, ICON_R, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(gIcon, ICON_CX - ICON_R, ICON_CY - ICON_R, ICON_R * 2, ICON_R * 2);
      ctx.restore();
    } catch(e) {}
  } else {
    ctx.fillStyle = C.panel;
    ctx.beginPath();
    ctx.arc(ICON_CX, ICON_CY, ICON_R, 0, Math.PI * 2);
    ctx.fill();
  }

  // Add shadow to title
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;
  
  ctx.fillStyle = C.white;
  ctx.font = `900 28px ${FONT_BOLD}`; // Bolder, slightly larger
  ctx.fillText("CHAT LEADERBOARD", ICON_CX + ICON_R + 15, ICON_CY - 5);
  
  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = C.gray;
  ctx.font = `400 14px ${FONT_NORMAL}`;
  
  const today = new Date();
  const past14 = new Date(today);
  past14.setDate(today.getDate() - 13);
  const dateOptionsStr = { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' };
  const d1Str = past14.toLocaleDateString('en-IN', dateOptionsStr);
  const d2Str = today.toLocaleDateString('en-IN', dateOptionsStr);

  const subtitleText = `${guild.name} | Data: ${d1Str} to ${d2Str} (Past 14 Days)`;
  ctx.fillText(subtitleText, ICON_CX + ICON_R + 15, ICON_CY + 18);

  const Y_START = HEADER_H + SECTION_TITLE_H;

  ctx.fillStyle = C.white;
  ctx.font = `600 16px ${FONT_BOLD}`;
  ctx.fillText("Top Chatters", PAD, HEADER_H + 20);
  
  if (topMembers.length === 0) {
    ctx.fillStyle = C.gray;
    ctx.font = `400 14px ${FONT_NORMAL}`;
    ctx.fillText("No message data found.", PAD, Y_START + 25);
  } else {
    for (let i = 0; i < topMembers.length && i < ROWS; i++) {
      const u = topMembers[i];
      const y = Y_START + (i * ROW_H);

      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = C.panel; // Use lighter panel color so it floats
      ctx.fillRect(PAD, y, W - (PAD * 2), ROW_H - 6);
      
      // Reset shadow so it doesn't affect the text and rank badges!
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Rank badge
      ctx.fillStyle = C.badge;
      ctx.fillRect(PAD, y, 40, ROW_H - 6);
      ctx.fillStyle = (i === 0) ? '#F1C40F' : (i === 1) ? '#E67E22' : (i === 2) ? '#95A5A6' : C.white;
      ctx.font = `600 14px ${FONT_BOLD}`;
      ctx.textAlign = 'center';
      ctx.fillText(`#${i + 1}`, PAD + 20, y + 25);
      ctx.textAlign = 'left';

      // Name
      ctx.fillStyle = C.white;
      ctx.font = `500 14px ${FONT_NORMAL}`;
      ctx.fillText(u.username, PAD + 55, y + 25);

      // Net Score
      const netText = `${u.total} Messages`;
      ctx.font = `600 14px ${FONT_BOLD}`;
      const netW = ctx.measureText(netText).width;
      
      const statX = W - PAD - netW - 10;
      ctx.fillStyle = C.green;
      ctx.fillText(netText, statX, y + 25);
    }
  }

  // Footer
  ctx.fillStyle = C.muted;
  ctx.font = `400 11px ${FONT_NORMAL}`;
  ctx.textAlign = 'center';
  
  ctx.fillText("Data powered by Athena Prime Stats Engine", W / 2, H - 12);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

export async function generateVoiceTopImage(guild, topMembers) {
  const ROWS = 10;
  const ROW_H = 46;
  const HEADER_H = 100;
  const SECTION_TITLE_H = 40;
  const BOTTOM_PAD = 30;
  const H = HEADER_H + SECTION_TITLE_H + (Math.min(ROWS, Math.max(topMembers.length, 1)) * ROW_H) + BOTTOM_PAD;
  const W = 650;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const PAD = 18;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // ---- HEADER ----
  const ICON_R = 36;
  const ICON_CX = PAD + ICON_R;
  const ICON_CY = PAD + ICON_R + 4;

  if (guild.iconURL()) {
    try {
      const gIcon = await loadImage(guild.iconURL({ extension: 'png', size: 128 }));
      ctx.save();
      ctx.beginPath();
      ctx.arc(ICON_CX, ICON_CY, ICON_R, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(gIcon, ICON_CX - ICON_R, ICON_CY - ICON_R, ICON_R * 2, ICON_R * 2);
      ctx.restore();
    } catch(e) {}
  } else {
    ctx.fillStyle = C.panel;
    ctx.beginPath();
    ctx.arc(ICON_CX, ICON_CY, ICON_R, 0, Math.PI * 2);
    ctx.fill();
  }

  // Add shadow to title
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;
  
  ctx.fillStyle = C.white;
  ctx.font = `900 28px ${FONT_BOLD}`; // Bolder, slightly larger
  ctx.fillText("VOICE LEADERBOARD", ICON_CX + ICON_R + 15, ICON_CY - 5);
  
  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = C.gray;
  ctx.font = `400 14px ${FONT_NORMAL}`;
  
  const today = new Date();
  const past14 = new Date(today);
  past14.setDate(today.getDate() - 13);
  const dateOptionsStr = { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' };
  const d1Str = past14.toLocaleDateString('en-IN', dateOptionsStr);
  const d2Str = today.toLocaleDateString('en-IN', dateOptionsStr);

  const subtitleText = `${guild.name} | Data: ${d1Str} to ${d2Str} (Past 14 Days)`;
  ctx.fillText(subtitleText, ICON_CX + ICON_R + 15, ICON_CY + 18);

  const Y_START = HEADER_H + SECTION_TITLE_H;

  ctx.fillStyle = C.white;
  ctx.font = `600 16px ${FONT_BOLD}`;
  ctx.fillText("Top Voice Users", PAD, HEADER_H + 20);
  
  if (topMembers.length === 0) {
    ctx.fillStyle = C.gray;
    ctx.font = `400 14px ${FONT_NORMAL}`;
    ctx.fillText("No voice data found.", PAD, Y_START + 25);
  } else {
    for (let i = 0; i < topMembers.length && i < ROWS; i++) {
      const u = topMembers[i];
      const y = Y_START + (i * ROW_H);

      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = C.panel; // Use lighter panel color so it floats
      ctx.fillRect(PAD, y, W - (PAD * 2), ROW_H - 6);
      
      // Reset shadow so it doesn't affect the text and rank badges!
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Rank badge
      ctx.fillStyle = C.badge;
      ctx.fillRect(PAD, y, 40, ROW_H - 6);
      ctx.fillStyle = (i === 0) ? '#F1C40F' : (i === 1) ? '#E67E22' : (i === 2) ? '#95A5A6' : C.white;
      ctx.font = `600 14px ${FONT_BOLD}`;
      ctx.textAlign = 'center';
      ctx.fillText(`#${i + 1}`, PAD + 20, y + 25);
      ctx.textAlign = 'left';

      // Name
      ctx.fillStyle = C.white;
      ctx.font = `500 14px ${FONT_NORMAL}`;
      ctx.fillText(u.username, PAD + 55, y + 25);

      // Net Score
      const netText = `${u.total}`;
      ctx.font = `600 14px ${FONT_BOLD}`;
      const netW = ctx.measureText(netText).width;
      
      const statX = W - PAD - netW - 10;
      ctx.fillStyle = C.green;
      ctx.fillText(netText, statX, y + 25);
    }
  }

  // Footer
  ctx.fillStyle = C.muted;
  ctx.font = `400 11px ${FONT_NORMAL}`;
  ctx.textAlign = 'center';
  
  ctx.fillText("Data powered by Athena Prime Stats Engine", W / 2, H - 12);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}
