import fetch from 'node-fetch';
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
    console.warn('[AntiScam] Canvas module unavailable, image OCR processing disabled:', err.message);
    return null;
  }
}

// On-demand lazy worker to eliminate startup memory overhead (~150MB saved)
let workerInstance = null;
let isInitializingWorker = false;

async function getWorker() {
  if (workerInstance) return workerInstance;
  if (isInitializingWorker) {
    while (isInitializingWorker) await new Promise(r => setTimeout(r, 50));
    return workerInstance;
  }
  isInitializingWorker = true;
  try {
    const { createWorker } = await import('tesseract.js');
    workerInstance = await createWorker('eng');
  } catch (error) {
    console.error('Failed to initialize Tesseract worker on demand:', error);
    workerInstance = null;
  } finally {
    isInitializingWorker = false;
  }
  return workerInstance;
}

export const flaggedMessages = new Set();

function calculateThreatScore(lowerText) {
  if (lowerText.includes('kasowin') || lowerText.includes('helawin') || lowerText.includes('vyro')) return 10;
  
  let threatScore = 0;
  if (lowerText.includes('mrbeast') || lowerText.includes('mr beast') || lowerText.match(/mr\.?\s*beast/)) threatScore += 1;
  if (lowerText.includes('crypto') || lowerText.includes('usdt') || lowerText.includes('tether')) threatScore += 1;
  if (lowerText.includes('withdrawal') || lowerText.includes('deposit')) threatScore += 1;
  if (lowerText.includes('promo code') || lowerText.includes('bonus') || lowerText.match(/promo/)) threatScore += 1;
  if (lowerText.includes('5600') || lowerText.includes('5,600')) threatScore += 1;
  
  return threatScore;
}

/**
 * Scans a text string for scam content.
 * @param {string} text - The text to scan.
 * @returns {boolean} - Returns true if scam text is detected.
 */
export function scanTextForScam(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase().replace(/\s+/g, ' ');
  return calculateThreatScore(lowerText) >= 2;
}

/**
 * Scans an image URL for scam text.
 * @param {string} url - The URL of the image.
 * @returns {Promise<boolean>} - Returns true if scam text is detected.
 */
export async function scanImageForScam(url) {
  const worker = await getWorker();
  if (!worker) return false;
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DiscordBot (https://discord.com, 1.0.0)' }
    });
    if (!res.ok) return false;
    
    const buffer = await res.arrayBuffer().then(buf => Buffer.from(buf));
    
    // Convert any image format (WebP/JPEG) to a standard PNG using Canvas
    // so Tesseract doesn't crash on unsupported pixel buffers.
    const canvasPkg = await getCanvas();
    if (!canvasPkg) return false;
    const { createCanvas, loadImage } = canvasPkg;

    const img = await loadImage(buffer);
    if (img.width < 50 || img.height < 50) return false;
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    
    // Draw white background in case of transparent PNGs
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.drawImage(img, 0, 0);
    
    // Pre-process image: Convert to high-contrast Black & White
    // We determine if it's dark mode by counting pixels, then ensure we output Black Text on White Background
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    
    let lightPixels = 0;
    let darkPixels = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i+1] + data[i+2]) / 3;
      if (avg > 128) lightPixels++;
      else darkPixels++;
    }
    
    const isDarkMode = darkPixels > lightPixels;
    
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i+1] + data[i+2]) / 3;
      let val;
      if (isDarkMode) {
        // Dark mode: invert so light text becomes black (0), dark bg becomes white (255)
        val = avg > 128 ? 0 : 255;
      } else {
        // Light mode: dark text becomes black (0), light bg becomes white (255)
        val = avg > 128 ? 255 : 0;
      }
      data[i] = val;
      data[i+1] = val;
      data[i+2] = val;
    }
    ctx.putImageData(imgData, 0, 0);
    
    const pngBuffer = canvas.toBuffer('image/png');
    
    const { data: { text } } = await worker.recognize(pngBuffer);
    if (!text) return false;
    
    const lowerText = text.toLowerCase().replace(/\s+/g, ' ');
    return calculateThreatScore(lowerText) >= 2;
  } catch (error) {
    const msg = String(error);
    if (!msg.includes('Unsupported image type') && !msg.includes('Image too small') && !msg.includes('Line cannot be recognized') && !msg.includes('FetchError') && !msg.includes('ECONNRESET')) {
      console.error('OCR Scanning Error:', error);
    }
    return false;
  }
}

export async function getRawOCRText(url) {
  const worker = await workerPromise;
  if (!worker) return 'Worker not ready';
  
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'DiscordBot (https://discord.com, 1.0.0)' } });
    if (!res.ok) return 'Fetch failed';
    const buffer = await res.arrayBuffer().then(buf => Buffer.from(buf));
    const img = await loadImage(buffer);
    if (img.width < 50 || img.height < 50) return 'Error: Image too small for OCR';
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    
    let lightPixels = 0;
    let darkPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i+1] + data[i+2]) / 3;
      if (avg > 128) lightPixels++;
      else darkPixels++;
    }
    
    const isDarkMode = darkPixels > lightPixels;
    
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i+1] + data[i+2]) / 3;
      let val;
      if (isDarkMode) {
        val = avg > 128 ? 0 : 255;
      } else {
        val = avg > 128 ? 255 : 0;
      }
      data[i] = val; data[i+1] = val; data[i+2] = val;
    }
    ctx.putImageData(imgData, 0, 0);
    const { data: { text } } = await worker.recognize(canvas.toBuffer('image/png'));
    if (!text) return 'No text found';
    return text;
  } catch (e) {
    return 'Error: ' + e.message;
  }
}
