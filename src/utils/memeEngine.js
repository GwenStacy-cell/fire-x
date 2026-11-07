import fetch from 'node-fetch';
import { AttachmentBuilder, MessageFlags } from 'discord.js';
import { createCanvas, loadImage } from './canvas.js';
import { 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  UPTIME_EMOJI, 
  getRandomHeadingGlyph 
} from './emojis.js';
import { sanitizeCV2Payload } from '../cv2.js';

export const MEME_TEMPLATES = [
  { id: 'drake', name: 'Drake Hotline Bling', aliases: ['drake', 'hotline'], example: ['No', 'Yes'] },
  { id: 'distracted', name: 'Distracted Boyfriend', aliases: ['distracted', 'boyfriend'], example: ['New thing', 'Me', 'Old thing'] },
  { id: 'two-buttons', name: 'Two Buttons', aliases: ['buttons', 'twobuttons'], example: ['Option A', 'Option B'] },
  { id: 'doge', name: 'Buff Doge vs Cheems', aliases: ['doge', 'cheems'], example: ['1990', '2026'] },
  { id: 'fine', name: 'This Is Fine', aliases: ['fine', 'thisisfine', 'fire'], example: ['Everything is fine'] },
  { id: 'rollsafe', name: 'Roll Safe (Smart Guy)', aliases: ['smart', 'rollsafe', 'think'], example: ['Cant be sad', 'If you dont care'] },
  { id: 'sponge', name: 'Mocking SpongeBob', aliases: ['spongebob', 'mock'], example: ['Doing work', 'dOiNg WoRk'] },
  { id: 'disastergirl', name: 'Disaster Girl', aliases: ['disaster', 'firegirl'], example: ['My code', 'Production server'] },
  { id: 'change-my-mind', name: 'Change My Mind', aliases: ['change', 'mind', 'crowder'], example: ['Athena is the best bot'] },
  { id: 'expanding-brain', name: 'Expanding Brain', aliases: ['brain', 'galaxybrain'], example: ['Small brain', 'Big brain', 'Galaxy brain'] },
  { id: 'spiderman', name: 'Spider-Man Pointing', aliases: ['spiderman', 'pointing'], example: ['You', 'Me'] },
  { id: 'batman', name: 'Batman Slapping Robin', aliases: ['batman', 'slap'], example: ['My friend', 'Me slapping sense into them'] }
];

const TEMPLATE_ALIAS_MAP = new Map();
for (const t of MEME_TEMPLATES) {
  TEMPLATE_ALIAS_MAP.set(t.id, t.id);
  for (const a of t.aliases) {
    TEMPLATE_ALIAS_MAP.set(a.toLowerCase(), t.id);
  }
}

function sanitizeMemeText(text) {
  if (!text) return '_';
  return encodeURIComponent(
    text
      .replace(/_/g, '__')
      .replace(/-/g, '--')
      .replace(/\s+/g, '_')
      .replace(/\?/g, '~q')
      .replace(/%/g, '~p')
      .replace(/#/g, '~h')
      .replace(/\//g, '~s')
      .replace(/"/g, "''")
  );
}

/**
 * Generates meme image URL via official memegen service
 */
export async function generateMemeImage(templateName, topText, bottomText) {
  const cleanKey = String(templateName || 'drake').toLowerCase().trim();
  const templateId = TEMPLATE_ALIAS_MAP.get(cleanKey) || 'drake';

  const t1 = sanitizeMemeText(topText || ' ');
  const t2 = sanitizeMemeText(bottomText || ' ');

  const url = `https://api.memegen.link/images/${templateId}/${t1}/${t2}.png`;
  
  try {
    const res = await fetch(url, { timeout: 6000 });
    if (res.ok) {
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      return { buffer, url, templateId };
    }
  } catch (err) {
    console.warn('[MemeEngine] Online template fetch failed, falling back:', err.message);
  }

  // Fallback Canvas generation
  const canvas = createCanvas(700, 500);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1e1f22';
  ctx.fillRect(0, 0, 700, 500);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(topText || '', 350, 100);
  ctx.fillText(bottomText || '', 350, 420);
  const buffer = canvas.toBuffer('image/png');
  return { buffer, url: null, templateId };
}

/**
 * Draws a modern meme top caption box onto any image buffer
 */
export async function captionImage(imageBuffer, captionText) {
  const img = await loadImage(imageBuffer);
  const padding = 24;
  const fontSize = Math.max(22, Math.floor(img.width / 24));
  const lineHeight = fontSize * 1.35;

  // Measurement canvas
  const measureCanvas = createCanvas(img.width, 100);
  const mCtx = measureCanvas.getContext('2d');
  mCtx.font = `bold ${fontSize}px sans-serif`;

  const words = captionText.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = mCtx.measureText(testLine).width;
    if (width > img.width - (padding * 2)) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const headerHeight = Math.max(80, (lines.length * lineHeight) + (padding * 2));
  const canvas = createCanvas(img.width, img.height + headerHeight);
  const ctx = canvas.getContext('2d');

  // White caption box
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, headerHeight);

  // Black caption text
  ctx.fillStyle = '#000000';
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  lines.forEach((line, i) => {
    ctx.fillText(line, padding, padding + (i * lineHeight));
  });

  // Draw original image below
  ctx.drawImage(img, 0, headerHeight, img.width, img.height);

  return canvas.toBuffer('image/png');
}

/**
 * Applies visual image FX filter onto an image buffer
 */
export async function applyImageFilter(imageBuffer, filterType) {
  const img = await loadImage(imageBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, img.width, img.height);

  const filter = String(filterType || 'deepfry').toLowerCase().trim();

  if (filter === 'grayscale' || filter === 'gray' || filter === 'bw') {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const avg = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = avg;
      d[i + 1] = avg;
      d[i + 2] = avg;
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (filter === 'invert' || filter === 'negative') {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (filter === 'sepia' || filter === 'vintage') {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i] = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189));
      d[i + 1] = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168));
      d[i + 2] = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (filter === 'deepfry' || filter === 'fry') {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      // High contrast + red saturating boost
      let r = d[i] * 1.5 + 40;
      let g = d[i + 1] * 1.2 - 10;
      let b = d[i + 2] * 0.8 - 30;
      // Add noise
      const noise = (Math.random() - 0.5) * 35;
      d[i] = Math.min(255, Math.max(0, r + noise));
      d[i + 1] = Math.min(255, Math.max(0, g + noise));
      d[i + 2] = Math.min(255, Math.max(0, b + noise));
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (filter === 'glitch' || filter === 'cyberpunk') {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    const shift = Math.floor(canvas.width * 0.02) * 4;
    for (let i = 0; i < d.length - shift; i += 4) {
      d[i] = d[i + shift]; // Shift red channel left
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (filter === 'pixelate' || filter === 'retro') {
    const scale = 0.1;
    const w = Math.max(1, Math.floor(canvas.width * scale));
    const h = Math.max(1, Math.floor(canvas.height * scale));
    const smallCanvas = createCanvas(w, h);
    const sCtx = smallCanvas.getContext('2d');
    sCtx.drawImage(canvas, 0, 0, w, h);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(smallCanvas, 0, 0, canvas.width, canvas.height);
  } else if (filter === 'polaroid') {
    const border = Math.floor(canvas.width * 0.06);
    const bottomBorder = Math.floor(canvas.height * 0.18);
    const pCanvas = createCanvas(canvas.width + (border * 2), canvas.height + border + bottomBorder);
    const pCtx = pCanvas.getContext('2d');

    pCtx.fillStyle = '#FDFDFD';
    pCtx.fillRect(0, 0, pCanvas.width, pCanvas.height);
    pCtx.drawImage(canvas, border, border);

    return pCanvas.toBuffer('image/png');
  }

  return canvas.toBuffer('image/png');
}

/**
 * Builds the accent borderless Components V2 container payload for meme deliveries
 */
export function buildMemeCV2Payload(title, desc, attachment) {
  const container = {
    type: 17,
    components: [
      {
        type: 12,
        items: [{ media: { url: `attachment://${attachment.name}` } }]
      },
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} ${title} | ${TICK_EMOJI}\n` +
                 `> -# <a:uptime:1552608831060844575> ${desc}`
      },
      { type: 14, divider: true },
      { 
        type: 10, 
        content: `-# **Athena Prime Visual Studio \u00b7 AI Meme & Image FX Lab**` 
      }
    ]
  };

  return sanitizeCV2Payload({
    components: [container],
    files: [attachment],
    flags: MessageFlags.IsComponentsV2
  });
}
