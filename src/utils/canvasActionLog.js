import { AttachmentBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { isMainThread, runCanvasTask } from './canvasWorkerHost.js';

let canvasMod = null;
let canvasFailed = false;
async function getCanvas() {
  if (canvasMod) return canvasMod;
  if (canvasFailed) return null;
  try {
    canvasMod = await import('./canvas.js');
    return canvasMod;
  } catch (err) {
    canvasFailed = true;
    console.warn('[GlobalLog] Canvas module unavailable:', err.message);
    return null;
  }
}

export async function generateGlobalActionCard(opts) {
  if (isMainThread) {
    const res = await runCanvasTask('globalActionCard', [opts], () => generateGlobalActionCardLocal(opts));
    if (!res) return null;
    if (res instanceof AttachmentBuilder) return res;
    if (res.data) return new AttachmentBuilder(Buffer.from(res.data), { name: res.name || 'global_ban_log.png' });
  }
  return await generateGlobalActionCardLocal(opts);
}

async function generateGlobalActionCardLocal(opts) {
    const canvasPkg = await getCanvas();
    if (!canvasPkg) return null;
    const { createCanvas, loadImage } = canvasPkg;

    const { action, guildName, guildIconUrl, targetTag, targetId, executorName, executorId, reason, timestamp, guildId } = opts;

    const width = 1024;
    const height = 455;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Load clean template background
    const bgPath = path.resolve('./src/assets/banlog_template_clean.png');
    if (fs.existsSync(bgPath)) {
        const bg = await loadImage(bgPath);
        ctx.drawImage(bg, 0, 0, width, height);
    } else {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, width, height);
    }

    // 1. Draw Server Avatar in the top-left glowing crest (x=125, y=105, radius=54)
    ctx.save();
    ctx.beginPath();
    ctx.arc(125, 105, 54, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();

    let iconLoaded = false;
    if (guildIconUrl) {
        try {
            const icon = await loadImage(guildIconUrl);
            ctx.drawImage(icon, 71, 51, 108, 108);
            iconLoaded = true;
        } catch (e) {
            iconLoaded = false;
        }
    }

    if (!iconLoaded) {
        // Fallback: Sleek dark background with server initials
        ctx.fillStyle = '#141722';
        ctx.fillRect(71, 51, 108, 108);
        ctx.fillStyle = '#ff3333';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const initials = (guildName || 'AP').substring(0, 3).toUpperCase();
        ctx.fillText(initials, 125, 105);
    }
    ctx.restore();

    // 2. Server Subtitle: "[Server Name] • Defense Enforcer: Athena Prime"
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#ffffff';
    const displayGuildName = (guildName || 'Unknown Server').length > 25 
        ? (guildName || 'Unknown Server').substring(0, 22) + '...' 
        : (guildName || 'Unknown Server');
    ctx.fillText(displayGuildName, 205, 107);
    const sw = ctx.measureText(displayGuildName).width;

    ctx.fillStyle = '#888888';
    ctx.fillText(' • Defense Enforcer: ', 205 + sw, 107);
    const mw = ctx.measureText(' • Defense Enforcer: ').width;

    ctx.fillStyle = '#ff3333';
    ctx.fillText('Athena Prime', 205 + sw + mw, 107);

    // 3. Executor Tag
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    const cleanExecutor = executorName || 'Anti-Nuke / Bot';
    ctx.fillText(cleanExecutor.length > 24 ? cleanExecutor.substring(0, 21) + '...' : cleanExecutor, 152, 258);

    // 4. Executor ID (Blue)
    ctx.fillStyle = '#4d79ff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(String(executorId || 'N/A'), 152, 312);

    // 5. Target Tag
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    const cleanTarget = targetTag || String(targetId || 'N/A');
    ctx.fillText(cleanTarget.length > 24 ? cleanTarget.substring(0, 21) + '...' : cleanTarget, 612, 258);

    // 6. Target ID (Blue)
    ctx.fillStyle = '#4d79ff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(String(targetId || 'N/A'), 612, 312);

    // 7. Reason (Red)
    ctx.fillStyle = '#ff3333';
    ctx.font = 'bold 15px sans-serif';
    let displayReason = reason || 'No reason provided';
    if (displayReason.length > 55) displayReason = displayReason.substring(0, 52) + '...';
    ctx.fillText(displayReason, 195, 349);

    // 8. Server ID (Grey) - flush with Server ID label (x=753)
    ctx.fillStyle = '#a0a0a0';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(String(guildId || 'N/A'), 753, 418);

    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: 'global_ban_log.png' });
}
