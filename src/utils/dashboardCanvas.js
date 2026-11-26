import { createCanvas, registerFont } from './canvas.js';
import path from 'path';
import { isMainThread, runCanvasTask } from './canvasWorkerHost.js';

// Register Roboto Font for headless Linux environments
registerFont(path.join(process.cwd(), 'assets', 'Roboto-Regular.ttf'), { family: 'Roboto', weight: 'normal' });
registerFont(path.join(process.cwd(), 'assets', 'Roboto-Bold.ttf'), { family: 'Roboto', weight: 'bold' });
function drawRoundedRect(ctx, x, y, w, h, r) {
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

function drawBlock(ctx, x, y, w, h, title, icon, value, accentColor) {
  const bg = '#161719';
  
  // Background
  drawRoundedRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = bg;
  ctx.fill();

  // Left stripe
  drawRoundedRect(ctx, x, y, 4, h, 2);
  ctx.fillStyle = accentColor;
  ctx.fill();
  
  // Add a subtle glow to the stripe
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 10;
  drawRoundedRect(ctx, x, y, 4, h, 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Icon
  ctx.fillStyle = accentColor;
  ctx.font = 'bold 12px Roboto';
  ctx.fillText(icon, x + 15, y + 25);

  // Title
  ctx.fillStyle = '#A3A6AA';
  ctx.font = 'bold 11px Roboto';
  ctx.fillText(title, x + 35, y + 25);

  // Value
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 10;
  
  if (typeof value === 'string' && value.length > 3) {
    ctx.font = 'bold 24px Roboto';
    ctx.fillText(value, x + 15, y + 60);
  } else {
    ctx.font = 'bold 32px Roboto';
    ctx.fillText(value, x + 15, y + 65);
  }
  ctx.shadowBlur = 0;
}

export async function generateDashboard(stats, accentColor) {
  if (isMainThread) {
    const res = await runCanvasTask('dashboard', [stats, accentColor], () => generateDashboardLocal(stats, accentColor));
    if (res) return Buffer.isBuffer(res) ? res : Buffer.from(res);
  }
  return await generateDashboardLocal(stats, accentColor);
}

export async function generateTimeoutCard(logs, accentColor) {
  if (isMainThread) {
    const res = await runCanvasTask('timeoutCard', [logs, accentColor], () => generateTimeoutCardLocal(logs, accentColor));
    if (res) return Buffer.isBuffer(res) ? res : Buffer.from(res);
  }
  return await generateTimeoutCardLocal(logs, accentColor);
}

export async function generateAutomodCard(logs, accentColor) {
  if (isMainThread) {
    const res = await runCanvasTask('automodCard', [logs, accentColor], () => generateAutomodCardLocal(logs, accentColor));
    if (res) return Buffer.isBuffer(res) ? res : Buffer.from(res);
  }
  return await generateAutomodCardLocal(logs, accentColor);
}

async function generateDashboardLocal(stats, accentColor) {
  const width = 800;
  const height = 700;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0D0E10';
  ctx.fillRect(0, 0, width, height);

  // --- TOP PANEL (Integrity Index) ---
  const topBg = '#161719';
  drawRoundedRect(ctx, 20, 20, 760, 120, 10);
  ctx.fillStyle = topBg;
  ctx.fill();

  // Left stripe
  drawRoundedRect(ctx, 20, 20, 5, 120, 2);
  ctx.fillStyle = accentColor;
  ctx.fill();
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 15;
  drawRoundedRect(ctx, 20, 20, 5, 120, 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Title
  ctx.fillStyle = '#A3A6AA';
  ctx.font = 'bold 12px Roboto';
  ctx.fillText('SYSTEM INTEGRITY INDEX', 60, 50);
  
  // Percentage
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 15;
  ctx.font = 'bold 64px Roboto';
  ctx.fillText(`${stats.integrity}%`, 45, 110);
  ctx.shadowBlur = 0;

  // Progress Bar Bg
  const barX = 260;
  const barY = 70;
  const barW = 470;
  const barH = 25;
  drawRoundedRect(ctx, barX, barY, barW, barH, 12);
  ctx.fillStyle = '#2A2C31';
  ctx.fill();

  // Progress Bar Fill
  const fillW = barW * (stats.integrity / 100);
  if (fillW > 0) {
    drawRoundedRect(ctx, barX, barY, fillW, barH, 12);
    ctx.fillStyle = accentColor;
    ctx.fill();
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // --- GRID METRICS ---
  const gridY = 160;
  const blockW = 175;
  const blockH = 85;
  const gapX = 20;
  const gapY = 20;

  const m = stats.metrics;

  // Row 1
  drawBlock(ctx, 20 + (blockW+gapX)*0, gridY, blockW, blockH, 'ROLES', '@', m.roles, accentColor);
  drawBlock(ctx, 20 + (blockW+gapX)*1, gridY, blockW, blockH, 'ADMIN ROLES', '*', m.adminRoles, accentColor);
  drawBlock(ctx, 20 + (blockW+gapX)*2, gridY, blockW, blockH, 'THREAT ROLES', '!', m.threatRoles, accentColor);
  drawBlock(ctx, 20 + (blockW+gapX)*3, gridY, blockW, blockH, 'PERM RISK', '!!', m.permRisk, accentColor);

  // Row 2
  const r2Y = gridY + blockH + gapY;
  drawBlock(ctx, 20 + (blockW+gapX)*0, r2Y, blockW, blockH, 'CHANNELS', '[ ]', m.channels, accentColor);
  drawBlock(ctx, 20 + (blockW+gapX)*1, r2Y, blockW, blockH, 'PRIVILEGED', '+', m.privileged, accentColor);
  drawBlock(ctx, 20 + (blockW+gapX)*2, r2Y, blockW, blockH, 'THREAT USERS', 'X', m.threatUsers, accentColor);
  drawBlock(ctx, 20 + (blockW+gapX)*3, r2Y, blockW, blockH, 'INTEGRATIONS', '@', m.integrations, accentColor);

  // Row 3
  const r3Y = r2Y + blockH + gapY;
  drawBlock(ctx, 20 + (blockW+gapX)*0, r3Y, blockW, blockH, 'TOTAL ASSETS', '*', m.totalAssets, accentColor);
  drawBlock(ctx, 20 + (blockW+gapX)*1, r3Y, blockW, blockH, 'THREAT ASSETS', '^', m.threatAssets, accentColor);
  drawBlock(ctx, 20 + (blockW+gapX)*2, r3Y, blockW, blockH, 'ACTIVITY', '>>', m.activity, accentColor);
  drawBlock(ctx, 20 + (blockW+gapX)*3, r3Y, blockW, blockH, 'FIREWALL', '[#]', m.firewall, accentColor);


  // --- ACTIVE MONITORING CORE ---
  const termY = r3Y + blockH + 30;
  const termH = height - termY - 20;
  
  // Terminal Bg
  drawRoundedRect(ctx, 20, termY, 760, termH, 15);
  // Create gradient
  const grad = ctx.createLinearGradient(0, termY, 0, termY + termH);
  grad.addColorStop(0, '#111214');
  grad.addColorStop(1, '#080809');
  ctx.fillStyle = grad;
  ctx.fill();

  // Terminal left stripe
  drawRoundedRect(ctx, 20, termY + 20, 4, termH - 40, 2);
  ctx.fillStyle = accentColor;
  ctx.fill();
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Terminal Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 20px Roboto';
  ctx.fillText('>> Active Monitoring Core', 60, termY + 40);

  // Terminal Logs
  ctx.font = '14px monospace';
  let logY = termY + 80;
  
  if (stats.logs.length === 0) {
    ctx.fillStyle = '#72767D';
    ctx.fillText('> No recent security events detected.', 60, logY);
  } else {
    stats.logs.forEach(log => {
      // Draw "> "
      ctx.fillStyle = accentColor;
      ctx.fillText('> ', 60, logY);
      
      // Draw log text
      ctx.fillStyle = '#DCDDDE';
      const cleanLog = log.normalize('NFKC').replace(/[^\x20-\x7E]/g, '').trim();
      ctx.fillText(cleanLog, 80, logY);
      logY += 25;
    });
  }

  return canvas.toBuffer();
}

async function generateTimeoutCardLocal(logs, accentColor) {
  const canvas = createCanvas(800, 200);
  const ctx = canvas.getContext('2d');
  
  // Background
  drawRoundedRect(ctx, 20, 20, 760, 160, 10);
  ctx.fillStyle = '#111214';
  ctx.fill();

  // Left stripe
  drawRoundedRect(ctx, 20, 30, 4, 140, 2);
  ctx.fillStyle = accentColor;
  ctx.fill();
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px Roboto';
  ctx.fillText('TIMEOUT DISCIPLINARY LOGS', 60, 60);

  ctx.font = '16px monospace';
  let logY = 110;
  if (logs.length === 0) {
    ctx.fillStyle = accentColor;
    ctx.fillText('> ', 60, logY);
    ctx.fillStyle = '#DCDDDE';
    ctx.fillText('No recent timeouts detected.', 80, logY);
  } else {
    logs.forEach(log => {
      ctx.fillStyle = accentColor;
      ctx.fillText('> ', 60, logY);
      ctx.fillStyle = '#DCDDDE';
      ctx.fillText(log, 80, logY);
      logY += 25;
    });
  }
  
  return canvas.toBuffer();
}

async function generateAutomodCardLocal(logs, accentColor) {
  const canvas = createCanvas(800, 200);
  const ctx = canvas.getContext('2d');
  
  // Background
  drawRoundedRect(ctx, 20, 20, 760, 160, 10);
  ctx.fillStyle = '#111214';
  ctx.fill();

  // Left stripe
  drawRoundedRect(ctx, 20, 30, 4, 140, 2);
  ctx.fillStyle = accentColor;
  ctx.fill();
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px Roboto';
  ctx.fillText('AUTOMOD SECURITY EVENTS', 60, 60);

  ctx.font = '16px monospace';
  let logY = 110;
  if (logs.length === 0) {
    ctx.fillStyle = accentColor;
    ctx.fillText('> ', 60, logY);
    ctx.fillStyle = '#DCDDDE';
    ctx.fillText('System monitoring active.', 80, logY);
  } else {
    logs.forEach(log => {
      ctx.fillStyle = accentColor;
      ctx.fillText('> ', 60, logY);
      ctx.fillStyle = '#DCDDDE';
      ctx.fillText(log, 80, logY);
      logY += 25;
    });
  }
  
  return canvas.toBuffer();
}
