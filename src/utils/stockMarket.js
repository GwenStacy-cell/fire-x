import path from 'path';
import { AttachmentBuilder } from 'discord.js';
import { createCanvas, registerFont } from './canvas.js';
import cv2 from '../cv2.js';

try {
  registerFont(path.join(process.cwd(), 'assets', 'Roboto-Bold.ttf'), { family: 'Roboto', weight: 'bold' });
  registerFont(path.join(process.cwd(), 'assets', 'Roboto-Regular.ttf'), { family: 'Roboto', weight: 'normal' });
} catch (e) {}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export const DISCLAIMER_TEXT = 'Athena can make mistakes. Market data may be delayed or estimated. Not financial advice. Always double check live data and consult certified financial professionals before investing.';

/**
 * Searches Yahoo Finance for a company name or ticker query
 */
export async function searchTicker(query) {
  if (!query) return null;
  const clean = query.trim().toUpperCase();

  // If query already looks like standard ticker (1-5 chars), try direct first
  if (/^[A-Z0-9\.\-\^]{1,6}$/.test(clean)) {
    return clean;
  }

  try {
    const res = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (!res.ok) return clean;
    const data = await res.json();
    const firstQuote = data?.quotes?.find(q => q.quoteType === 'EQUITY' || q.quoteType === 'INDEX' || q.quoteType === 'CRYPTOCURRENCY' || q.quoteType === 'ETF') || data?.quotes?.[0];
    return firstQuote?.symbol || clean;
  } catch {
    return clean;
  }
}

/**
 * Fetches real-time price, meta, range, and historical chart points for any stock, ETF, or crypto ticker
 */
export async function fetchStockData(tickerInput) {
  const symbol = await searchTicker(tickerInput);
  if (!symbol) throw new Error(`Could not resolve ticker symbol for "${tickerInput}".`);

  // First try 1-day 15-minute range
  let url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=15m&range=1d`;
  let res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  let data = await res.json().catch(() => null);
  let resObj = data?.chart?.result?.[0];

  // If 1d has fewer than 2 closes (e.g. market closed, weekend, or holiday), fallback to 5d
  let closes = (resObj?.indicators?.quote?.[0]?.close || []).filter(v => typeof v === 'number');
  if (!resObj || closes.length < 2) {
    url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=30m&range=5d`;
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    data = await res.json().catch(() => null);
    resObj = data?.chart?.result?.[0];
    closes = (resObj?.indicators?.quote?.[0]?.close || []).filter(v => typeof v === 'number');
  }

  if (!resObj) {
    throw new Error(`No financial telemetry available for symbol "${symbol}". Please check the ticker name.`);
  }

  const meta = resObj.meta || {};
  const price = meta.regularMarketPrice || (closes.length ? closes[closes.length - 1] : 0);
  const prevClose = meta.chartPreviousClose || (closes.length ? closes[0] : price);
  const change = price - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;

  const dayHigh = meta.regularMarketDayHigh || (closes.length ? Math.max(...closes, price) : price);
  const dayLow = meta.regularMarketDayLow || (closes.length ? Math.min(...closes, price) : price);
  const fiftyTwoWeekHigh = meta.fiftyTwoWeekHigh || dayHigh;
  const fiftyTwoWeekLow = meta.fiftyTwoWeekLow || dayLow;
  const volume = meta.regularMarketVolume || 0;

  return {
    symbol: meta.symbol || symbol,
    name: meta.shortName || meta.longName || meta.symbol || symbol,
    currency: meta.currency || 'USD',
    exchange: meta.exchangeName || 'EXCHANGE',
    price,
    prevClose,
    change,
    changePct,
    dayHigh,
    dayLow,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    volume,
    closes: closes.length > 1 ? closes : [prevClose, price],
    timestamps: resObj.timestamp || []
  };
}

/**
 * Fetches top global market indices & mega-cap tech stocks
 */
export async function fetchMarketOverview() {
  const indexDefs = [
    { id: '^GSPC', label: 'S&P 500', region: 'US' },
    { id: '^IXIC', label: 'NASDAQ', region: 'US TECH' },
    { id: '^DJI', label: 'DOW JONES', region: 'US' },
    { id: '^NSEI', label: 'NIFTY 50', region: 'INDIA' },
    { id: 'BTC-USD', label: 'BITCOIN', region: 'CRYPTO' },
    { id: 'ETH-USD', label: 'ETHEREUM', region: 'CRYPTO' }
  ];

  const indices = await Promise.all(indexDefs.map(async item => {
    try {
      const data = await fetchStockData(item.id);
      return { ...item, ...data };
    } catch {
      return { ...item, price: 0, change: 0, changePct: 0, closes: [0, 0] };
    }
  }));

  const megaCaps = ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'GOOGL', 'AMZN'];
  const tickers = await Promise.all(megaCaps.map(async sym => {
    try {
      const data = await fetchStockData(sym);
      return data;
    } catch {
      return { symbol: sym, price: 0, change: 0, changePct: 0 };
    }
  }));

  return { indices, tickers };
}

/**
 * Fetches recent financial news & catalysts for a symbol or general market
 */
export async function fetchStockNews(query = 'stock market') {
  try {
    const res = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=6`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.news || []).map(n => ({
      title: n.title,
      publisher: n.publisher || 'Financial Press',
      link: n.link,
      providerPublishTime: n.providerPublishTime ? new Date(n.providerPublishTime * 1000) : new Date()
    }));
  } catch {
    return [];
  }
}

/**
 * Renders high-resolution Canvas single-stock telemetry HUD
 */
export function renderSingleStockCard(stock) {
  const W = 1100;
  const H = 640;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const isUp = stock.change >= 0;
  const primaryColor = isUp ? '#00e676' : '#ff3d71';
  const primaryGlow = isUp ? 'rgba(0, 230, 118, 0.18)' : 'rgba(255, 61, 113, 0.18)';

  // 1. Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#070b13');
  bgGrad.addColorStop(0.5, '#0b111e');
  bgGrad.addColorStop(1, '#080d17');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let x = 40; x < W; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 40; y < H; y += 50) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Corner brackets
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 2;
  const bLen = 16;
  ctx.beginPath(); ctx.moveTo(20, 20 + bLen); ctx.lineTo(20, 20); ctx.lineTo(20 + bLen, 20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W - 20 - bLen, 20); ctx.lineTo(W - 20, 20); ctx.lineTo(W - 20, 20 + bLen); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20, H - 20 - bLen); ctx.lineTo(20, H - 20); ctx.lineTo(20 + bLen, H - 20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W - 20 - bLen, H - 20); ctx.lineTo(W - 20, H - 20); ctx.lineTo(W - 20, H - 20 - bLen); ctx.stroke();

  // 3. Top Header Bar
  ctx.font = 'bold 13px Roboto, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('ATHENA PRIME // FINANCIAL RECONNAISSANCE SYSTEM', 45, 52);

  ctx.beginPath();
  ctx.arc(W - 240, 48, 5, 0, Math.PI * 2);
  ctx.fillStyle = primaryColor;
  ctx.fill();

  ctx.font = 'bold 12px Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('LIVE MARKET TELEMETRY', W - 225, 52);

  const now = new Date();
  const dateStr = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  ctx.font = '11px Roboto, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText(dateStr, W - 180, 70);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath(); ctx.moveTo(40, 80); ctx.lineTo(W - 40, 80); ctx.stroke();

  // 4. Stock Identity & Large Price
  ctx.font = 'bold 44px Roboto, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(stock.symbol, 45, 135);
  const symW = ctx.measureText(stock.symbol).width;

  // Exchange Pill
  const exText = `${stock.exchange} • ${stock.currency}`;
  ctx.font = 'bold 12px Roboto, sans-serif';
  const exW = ctx.measureText(exText).width + 16;
  const pillExX = 45 + symW + 18;
  const pillExY = 108;

  ctx.beginPath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.roundRect ? ctx.roundRect(pillExX, pillExY, exW, 24, 4) : ctx.fillRect(pillExX, pillExY, exW, 24);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.fillText(exText, pillExX + 8, pillExY + 16);

  // Company Name
  ctx.font = '16px Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(stock.name, 45, 164);

  // Price Display
  const priceStr = `$${stock.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  ctx.font = 'bold 50px Roboto, sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(priceStr, 45, 226);
  const prcW = ctx.measureText(priceStr).width;

  // Change Pill Badge
  const sign = isUp ? '+' : '';
  const changeStr = `${sign}${stock.change.toFixed(2)} (${sign}${stock.changePct.toFixed(2)}%)`;
  ctx.font = 'bold 16px Roboto, sans-serif';
  const chgW = ctx.measureText(changeStr).width + 24;
  const pillY = 190;
  const pillX = 45 + prcW + 24;

  ctx.beginPath();
  ctx.fillStyle = primaryGlow;
  ctx.roundRect ? ctx.roundRect(pillX, pillY, chgW, 36, 18) : ctx.fillRect(pillX, pillY, chgW, 36);
  ctx.fill();
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = primaryColor;
  ctx.fillText(changeStr, pillX + 12, pillY + 24);

  // 5. Chart Curve Area
  const chartX = 45;
  const chartY = 255;
  const chartW = 660;
  const chartH = 290;

  ctx.beginPath();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
  ctx.fillRect(chartX, chartY, chartW, chartH);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.strokeRect(chartX, chartY, chartW, chartH);

  const closes = stock.closes;
  const minVal = Math.min(...closes, stock.prevClose) * 0.998;
  const maxVal = Math.max(...closes, stock.prevClose) * 1.002;
  const valRange = maxVal - minVal || 1;

  const points = closes.map((val, idx) => {
    const x = chartX + 15 + (idx / (closes.length - 1 || 1)) * (chartW - 30);
    const y = chartY + chartH - 25 - ((val - minVal) / valRange) * (chartH - 50);
    return { x, y, val };
  });

  // Previous close baseline
  const prevY = chartY + chartH - 25 - ((stock.prevClose - minVal) / valRange) * (chartH - 50);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(chartX, prevY);
  ctx.lineTo(chartX + chartW, prevY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = '10px Roboto, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(`PREV CLOSE $${stock.prevClose.toFixed(2)}`, chartX + chartW - 130, prevY - 6);

  // Area under curve
  const areaGrad = ctx.createLinearGradient(0, chartY, 0, chartY + chartH);
  areaGrad.addColorStop(0, isUp ? 'rgba(0, 230, 118, 0.35)' : 'rgba(255, 61, 113, 0.35)');
  areaGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const xc = (points[i].x + points[i - 1].x) / 2;
    const yc = (points[i].y + points[i - 1].y) / 2;
    ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.lineTo(points[points.length - 1].x, chartY + chartH - 5);
  ctx.lineTo(points[0].x, chartY + chartH - 5);
  ctx.closePath();
  ctx.fillStyle = areaGrad;
  ctx.fill();

  // Curve Line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const xc = (points[i].x + points[i - 1].x) / 2;
    const yc = (points[i].y + points[i - 1].y) / 2;
    ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Glow on final point
  const lastPoint = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(lastPoint.x, lastPoint.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = primaryGlow;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(lastPoint.x, lastPoint.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // 6. Right Telemetry Grid Panel
  const panelX = 730;
  const panelY = 120;
  const panelW = 325;
  const panelH = 425;

  ctx.beginPath();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.roundRect ? ctx.roundRect(panelX, panelY, panelW, panelH, 10) : ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.stroke();

  ctx.font = 'bold 13px Roboto, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('FINANCIAL TELEMETRY & RANGE', panelX + 20, panelY + 30);

  // Day Range Slider
  ctx.font = '11px Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('DAY RANGE', panelX + 20, panelY + 65);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(`$${stock.dayLow.toFixed(2)}`, panelX + 20, panelY + 84);
  const dayHighStr = `$${stock.dayHigh.toFixed(2)}`;
  ctx.font = '11px Roboto, sans-serif';
  const dhW = ctx.measureText(dayHighStr).width;
  ctx.fillText(dayHighStr, panelX + panelW - 20 - dhW, panelY + 84);

  const barX = panelX + 20;
  const barY = panelY + 98;
  const barW = panelW - 40;

  ctx.beginPath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.roundRect ? ctx.roundRect(barX, barY, barW, 6, 3) : ctx.fillRect(barX, barY, barW, 6);
  ctx.fill();

  const dayPct = Math.max(0, Math.min(1, (stock.price - stock.dayLow) / (stock.dayHigh - stock.dayLow || 1)));
  ctx.beginPath();
  ctx.fillStyle = primaryColor;
  ctx.roundRect ? ctx.roundRect(barX, barY, barW * dayPct, 6, 3) : ctx.fillRect(barX, barY, barW * dayPct, 6);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(barX + barW * dayPct, barY + 3, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // 52-Week Range Slider
  ctx.font = '11px Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('52-WEEK RANGE', panelX + 20, panelY + 140);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(`$${stock.fiftyTwoWeekLow.toFixed(2)}`, panelX + 20, panelY + 160);
  const w52HighStr = `$${stock.fiftyTwoWeekHigh.toFixed(2)}`;
  ctx.font = '11px Roboto, sans-serif';
  const whW = ctx.measureText(w52HighStr).width;
  ctx.fillText(w52HighStr, panelX + panelW - 20 - whW, panelY + 160);

  const bar52Y = panelY + 174;
  ctx.beginPath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.roundRect ? ctx.roundRect(barX, bar52Y, barW, 6, 3) : ctx.fillRect(barX, bar52Y, barW, 6);
  ctx.fill();

  const w52Pct = Math.max(0, Math.min(1, (stock.price - stock.fiftyTwoWeekLow) / (stock.fiftyTwoWeekHigh - stock.fiftyTwoWeekLow || 1)));
  ctx.beginPath();
  ctx.fillStyle = '#38bdf8';
  ctx.roundRect ? ctx.roundRect(barX, bar52Y, barW * w52Pct, 6, 3) : ctx.fillRect(barX, bar52Y, barW * w52Pct, 6);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(barX + barW * w52Pct, bar52Y + 3, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Volume & Prev Close Grid
  const rowY = panelY + 215;
  ctx.beginPath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.roundRect ? ctx.roundRect(panelX + 20, rowY, 135, 65, 6) : ctx.fillRect(panelX + 20, rowY, 135, 65);
  ctx.fill();
  ctx.font = '10px Roboto, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('24H VOLUME', panelX + 32, rowY + 24);
  ctx.font = 'bold 16px Roboto, sans-serif';
  ctx.fillStyle = '#f1f5f9';
  const volStr = stock.volume > 1e6 ? `${(stock.volume / 1e6).toFixed(1)}M` : stock.volume.toLocaleString();
  ctx.fillText(volStr, panelX + 32, rowY + 48);

  ctx.beginPath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.roundRect ? ctx.roundRect(panelX + 170, rowY, 135, 65, 6) : ctx.fillRect(panelX + 170, rowY, 135, 65);
  ctx.fill();
  ctx.font = '10px Roboto, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('PREV CLOSE', panelX + 182, rowY + 24);
  ctx.font = 'bold 16px Roboto, sans-serif';
  ctx.fillStyle = '#f1f5f9';
  ctx.fillText(`$${stock.prevClose.toFixed(2)}`, panelX + 182, rowY + 48);

  // Sentiment Card
  const sentY = panelY + 300;
  ctx.beginPath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.roundRect ? ctx.roundRect(panelX + 20, sentY, 285, 95, 6) : ctx.fillRect(panelX + 20, sentY, 285, 95);
  ctx.fill();

  ctx.font = '10px Roboto, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('ESTIMATED MARKET SENTIMENT', panelX + 32, sentY + 26);

  const sentiment = isUp ? 'BULLISH (UPWARD BIAS)' : 'BEARISH (DOWNWARD BIAS)';
  ctx.font = 'bold 15px Roboto, sans-serif';
  ctx.fillStyle = primaryColor;
  ctx.fillText(sentiment, panelX + 32, sentY + 54);

  ctx.font = '11px Roboto, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Model calculated via price momentum & range velocity.', panelX + 32, sentY + 76);

  // 7. MANDATORY DISCLAIMER BAR (At very bottom)
  ctx.beginPath();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.fillRect(0, H - 45, W, 45);
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
  ctx.beginPath();
  ctx.moveTo(0, H - 45);
  ctx.lineTo(W, H - 45);
  ctx.stroke();

  ctx.font = 'bold 11px Roboto, sans-serif';
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('RISK NOTICE & DISCLAIMER:', 45, H - 18);

  ctx.font = '11px Roboto, sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText('Athena can make mistakes. Not financial advice. Market quotes may be delayed. Always double check live data before investing.', 220, H - 18);

  return canvas.toBuffer('image/png');
}

/**
 * Renders high-resolution Canvas Global Market Intelligence Dashboard
 */
export function renderMarketOverviewCard(overview) {
  const W = 1100;
  const H = 640;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#070b13');
  bgGrad.addColorStop(0.5, '#0b111e');
  bgGrad.addColorStop(1, '#080d17');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let x = 40; x < W; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 40; y < H; y += 50) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Header
  ctx.font = 'bold 13px Roboto, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('ATHENA PRIME // GLOBAL FINANCIAL INTELLIGENCE DASHBOARD', 45, 50);

  ctx.beginPath();
  ctx.arc(W - 220, 46, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.fill();

  ctx.font = 'bold 12px Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('WORLD MARKET PULSE', W - 205, 50);

  const now = new Date();
  const dateStr = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  ctx.font = '11px Roboto, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText(dateStr, W - 170, 68);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath(); ctx.moveTo(40, 78); ctx.lineTo(W - 40, 78); ctx.stroke();

  // 6 Index Cards in 3 Columns x 2 Rows
  const startX = 45;
  const startY = 100;
  const cardW = 320;
  const cardH = 180;
  const gapX = 25;
  const gapY = 20;

  overview.indices.forEach((item, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const x = startX + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);

    const isUp = item.change >= 0;
    const itemColor = isUp ? '#00e676' : '#ff3d71';
    const itemGlow = isUp ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 61, 113, 0.15)';

    ctx.beginPath();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.roundRect ? ctx.roundRect(x, y, cardW, cardH, 10) : ctx.fillRect(x, y, cardW, cardH);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();

    ctx.font = 'bold 10px Roboto, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(item.region, x + 18, y + 26);

    ctx.font = 'bold 18px Roboto, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(item.label, x + 18, y + 50);

    const pStr = item.price > 1000 ? item.price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : item.price.toFixed(2);
    ctx.font = 'bold 22px Roboto, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`$${pStr}`, x + 18, y + 84);

    const sign = isUp ? '+' : '';
    const chgStr = `${sign}${item.changePct.toFixed(2)}%`;
    ctx.font = 'bold 13px Roboto, sans-serif';
    const chgW = ctx.measureText(chgStr).width + 16;

    ctx.beginPath();
    ctx.fillStyle = itemGlow;
    ctx.roundRect ? ctx.roundRect(x + 18, y + 98, chgW, 24, 12) : ctx.fillRect(x + 18, y + 98, chgW, 24);
    ctx.fill();
    ctx.strokeStyle = itemColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = itemColor;
    ctx.fillText(chgStr, x + 26, y + 115);

    // Mini Sparkline
    const sparkX = x + 160;
    const sparkY = y + 45;
    const sparkW = 140;
    const sparkH = 90;

    const closes = item.closes;
    if (closes.length > 1) {
      const minC = Math.min(...closes);
      const maxC = Math.max(...closes);
      const cRange = maxC - minC || 1;

      const pts = closes.map((c, i) => {
        const px = sparkX + (i / (closes.length - 1)) * sparkW;
        const py = sparkY + sparkH - ((c - minC) / cRange) * sparkH;
        return { px, py };
      });

      const sGrad = ctx.createLinearGradient(0, sparkY, 0, sparkY + sparkH);
      sGrad.addColorStop(0, itemGlow);
      sGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.beginPath();
      ctx.moveTo(pts[0].px, pts[0].py);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].px, pts[i].py);
      }
      ctx.lineTo(pts[pts.length - 1].px, sparkY + sparkH);
      ctx.lineTo(pts[0].px, sparkY + sparkH);
      ctx.closePath();
      ctx.fillStyle = sGrad;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(pts[0].px, pts[0].py);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].px, pts[i].py);
      }
      ctx.strokeStyle = itemColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(pts[pts.length - 1].px, pts[pts.length - 1].py, 3, 0, Math.PI * 2);
      ctx.fillStyle = itemColor;
      ctx.fill();
    }
  });

  // Bottom Ticker Tape Panel
  const tapeY = 500;
  const tapeH = 75;
  ctx.beginPath();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.roundRect ? ctx.roundRect(startX, tapeY, W - 90, tapeH, 8) : ctx.fillRect(startX, tapeY, W - 90, tapeH);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.stroke();

  ctx.font = 'bold 11px Roboto, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('MEGA-CAP TELEMETRY TICKER', startX + 20, tapeY + 22);

  const slotW = (W - 90 - 40) / overview.tickers.length;
  overview.tickers.forEach((t, i) => {
    const tx = startX + 20 + i * slotW;
    const isUp = t.change >= 0;
    const color = isUp ? '#00e676' : '#ff3d71';
    const sign = isUp ? '+' : '';

    ctx.font = 'bold 14px Roboto, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(t.symbol, tx, tapeY + 46);

    ctx.font = '12px Roboto, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`$${t.price.toFixed(2)}`, tx, tapeY + 64);

    ctx.font = 'bold 12px Roboto, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(`${sign}${t.changePct.toFixed(1)}%`, tx + 70, tapeY + 64);
  });

  // MANDATORY DISCLAIMER BAR
  ctx.beginPath();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.fillRect(0, H - 45, W, 45);
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
  ctx.beginPath();
  ctx.moveTo(0, H - 45);
  ctx.lineTo(W, H - 45);
  ctx.stroke();

  ctx.font = 'bold 11px Roboto, sans-serif';
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('RISK NOTICE & DISCLAIMER:', 45, H - 18);

  ctx.font = '11px Roboto, sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText('Athena can make mistakes. Not financial advice. Market quotes may be delayed. Always double check live data before investing.', 220, H - 18);

  return canvas.toBuffer('image/png');
}

/**
 * Builds Components V2 Discord payload for a single stock ticker
 */
export function buildStockPayload(stock, imageBuffer, prefix = '!') {
  const isUp = stock.change >= 0;
  const sign = isUp ? '+' : '';
  const attachment = new AttachmentBuilder(imageBuffer, { name: `stock_${stock.symbol.toLowerCase()}.png` });

  const components = [
    {
      type: 10,
      content: `## ${stock.name} (${stock.symbol}) Stock Telemetry | <a:atheNATICK:1557841381630681106>\n` +
               `> -# <a:uptime:1552608831060844575> **Current Price:** \`$${stock.price.toFixed(2)} ${stock.currency}\` (\`${sign}${stock.change.toFixed(2)}\` | \`${sign}${stock.changePct.toFixed(2)}%\`)\n` +
               `> -# • **Day Session Range:** \`$${stock.dayLow.toFixed(2)}\` \u2014 \`$${stock.dayHigh.toFixed(2)}\`\n` +
               `> -# • **52-Week Range:** \`$${stock.fiftyTwoWeekLow.toFixed(2)}\` \u2014 \`$${stock.fiftyTwoWeekHigh.toFixed(2)}\`\n` +
               `> -# • **24h Volume:** \`${stock.volume > 1e6 ? (stock.volume / 1e6).toFixed(2) + 'M' : stock.volume.toLocaleString()}\` \u2022 **Prev Close:** \`$${stock.prevClose.toFixed(2)}\`\n` +
               `> -# • **Exchange Market:** \`${stock.exchange}\` (\`${stock.currency}\`)\n` +
               `> -# • **Session Momentum:** \`${isUp ? 'Bullish (Upward Momentum)' : 'Bearish (Downward Pull)'}\`\n\n` +
               `### Supporting Commands Guidance\n` +
               `> -# • \`${prefix}market\` \u2014 Global 6-index world market pulse & mega-caps tape.\n` +
               `> -# • \`${prefix}stockai <query>\` \u2014 AI financial analyst & earnings breakdown.\n` +
               `> -# • \`${prefix}movers\` \u2014 Real-time top gainers & decliners across equities/crypto.\n` +
               `> -# • \`${prefix}crypto [coin]\` \u2014 Dedicated cryptocurrency charts (BTC, ETH, SOL).\n` +
               `> -# • \`${prefix}stocknews [symbol]\` \u2014 Real-time press wiretap & headlines.\n` +
               `> -# • \`${prefix}stockchannel set <#channel>\` \u2014 Automated daily morning briefing upload.\n\n` +
               `> -# <a:uptime:1552608831060844575> **Risk Notice:** ${DISCLAIMER_TEXT}`
    },
    {
      type: 14,
      divider: true
    },
    {
      type: 1,
      components: [
        {
          type: 2,
          custom_id: `stk_ref_${stock.symbol}`,
          label: 'Refresh Quotes',
          style: 2,
          emoji: { name: '🔄' }
        },
        {
          type: 2,
          custom_id: `stk_ai_${stock.symbol}`,
          label: 'AI Market Analysis',
          style: 2,
          emoji: { name: '📊' }
        },
        {
          type: 2,
          custom_id: `stk_news_${stock.symbol}`,
          label: 'Latest News',
          style: 2,
          emoji: { name: '📰' }
        },
        {
          type: 2,
          style: 5,
          label: 'Yahoo Finance',
          url: `https://finance.yahoo.com/quote/${encodeURIComponent(stock.symbol)}`
        }
      ]
    },
    {
      type: 1,
      components: [
        {
          type: 2,
          custom_id: 'stk_ref_overview',
          label: 'Global Pulse',
          style: 2,
          emoji: { name: '🌐' }
        },
        {
          type: 2,
          custom_id: 'stk_movers',
          label: 'Market Movers',
          style: 2,
          emoji: { name: '🔥' }
        },
        {
          type: 2,
          custom_id: 'stk_crypto',
          label: 'Crypto Pulse',
          style: 2,
          emoji: { name: '🪙' }
        },
        {
          type: 2,
          custom_id: 'stk_help',
          label: 'All Cmds Guide',
          style: 2,
          emoji: { name: '🧭' }
        }
      ]
    },
    {
      type: 14,
      divider: true
    },
    {
      type: 10,
      content: `-# **Athena Prime Stock Intelligence \u2022 Real-Time Financial Telemetry**`
    }
  ];

  return {
    components: [
      {
        type: 17,
        components
      }
    ],
    files: [attachment]
  };
}

/**
 * Builds Components V2 Discord payload for Global Market Overview or Daily Briefing
 */
export function buildMarketOverviewPayload(overview, imageBuffer, isDaily = false, prefix = '!') {
  const attachment = new AttachmentBuilder(imageBuffer, { name: 'market_overview.png' });

  const heading = isDaily 
    ? `## Athena Prime Daily Stock Market Briefing | <a:atheNATICK:1557841381630681106>` 
    : `## Global Stock & Crypto Market Intelligence | <a:atheNATICK:1557841381630681106>`;

  // Calculate market bias
  const upCount = overview.indices.filter(i => i.change >= 0).length;
  const bias = upCount >= 4 ? 'Predominantly Bullish' : upCount <= 2 ? 'Predominantly Bearish' : 'Mixed / Consolidating';

  const indicesSummary = overview.indices.map(i => {
    const sign = i.change >= 0 ? '+' : '';
    return `\`${i.label}:\` $${i.price > 1000 ? i.price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : i.price.toFixed(2)} (${sign}${i.changePct.toFixed(2)}%)`;
  }).join(' \u2022 ');

  const components = [
    {
      type: 10,
      content: `${heading}\n` +
               `> -# <a:uptime:1552608831060844575> **Global Market Regime:** \`${bias}\` across 6 major indices.\n` +
               `> -# • **Key Indices:** ${indicesSummary}\n` +
               `> -# • **Tech Mega-Caps:** \`NVDA\` (${overview.tickers[0]?.changePct >= 0 ? '+' : ''}${overview.tickers[0]?.changePct?.toFixed(1)}%), \`AAPL\` (${overview.tickers[1]?.changePct >= 0 ? '+' : ''}${overview.tickers[1]?.changePct?.toFixed(1)}%), \`MSFT\` (${overview.tickers[2]?.changePct >= 0 ? '+' : ''}${overview.tickers[2]?.changePct?.toFixed(1)}%), \`TSLA\` (${overview.tickers[3]?.changePct >= 0 ? '+' : ''}${overview.tickers[3]?.changePct?.toFixed(1)}%)\n\n` +
               `### Supporting Commands Guidance\n` +
               `> -# • \`${prefix}stock <symbol>\` \u2014 Single stock Canvas chart & telemetry (e.g. \`${prefix}stock NVDA\`, \`${prefix}stock AAPL\`).\n` +
               `> -# • \`${prefix}stockai <query>\` \u2014 AI financial analyst & earnings breakdown.\n` +
               `> -# • \`${prefix}movers\` \u2014 Real-time top gainers & decliners across equities/crypto.\n` +
               `> -# • \`${prefix}crypto [coin]\` \u2014 Dedicated cryptocurrency charts (BTC, ETH, SOL).\n` +
               `> -# • \`${prefix}stocknews [symbol]\` \u2014 Real-time press wiretap & headlines.\n` +
               `> -# • \`${prefix}stockchannel set <#channel>\` \u2014 Automated daily morning briefing upload.\n\n` +
               `> -# <a:uptime:1552608831060844575> **Risk Notice:** ${DISCLAIMER_TEXT}`
    },
    {
      type: 14,
      divider: true
    },
    {
      type: 1,
      components: [
        {
          type: 2,
          custom_id: 'stk_ref_overview',
          label: 'Refresh Pulse',
          style: 2,
          emoji: { name: '🔄' }
        },
        {
          type: 2,
          custom_id: 'stk_movers',
          label: 'Market Movers',
          style: 2,
          emoji: { name: '🔥' }
        },
        {
          type: 2,
          custom_id: 'stk_crypto',
          label: 'Crypto Pulse',
          style: 2,
          emoji: { name: '🪙' }
        },
        {
          type: 2,
          custom_id: 'stk_help',
          label: 'All Cmds Guide',
          style: 2,
          emoji: { name: '🧭' }
        }
      ]
    },
    {
      type: 14,
      divider: true
    },
    {
      type: 10,
      content: `-# **Athena Prime Stock Intelligence \u2022 World Meteorological & Financial Engine**`
    }
  ];

  return {
    components: [
      {
        type: 17,
        components
      }
    ],
    files: [attachment]
  };
}

/**
 * Builds interactive guidance UI container listing all supporting financial commands
 */
export function buildStockGuidancePayload(prefix = '!') {
  return {
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## Financial Intelligence Suite & Commands Guidance | <a:atheNATICK:1557841381630681106>\n` +
                     `> -# <a:uptime:1552608831060844575> **Overview:** Athena Prime provides real-time stock/crypto telemetry, high-resolution Canvas charts, and AI-driven financial intelligence.\n\n` +
                     `### 1. Market Telemetry & Charts\n` +
                     `> -# • \`${prefix}stock <symbol>\` \u2014 Single stock Canvas chart with Bezier curves, day range, 52w range, volume, & sentiment gauge (e.g. \`${prefix}stock NVDA\`, \`${prefix}stock AAPL\`, \`${prefix}stock TSLA\`).\n` +
                     `> -# • \`${prefix}market\` / \`${prefix}stocks\` \u2014 Global 6-index world market pulse (S&P 500, NASDAQ, Dow, NIFTY 50, BTC, ETH) + mega-caps ticker tape.\n` +
                     `> -# • \`${prefix}ticker <symbol>\` \u2014 Direct company/ticker resolution.\n\n` +
                     `### 2. AI Financial Analyst & Reports\n` +
                     `> -# • \`${prefix}stockai <question or topic>\` \u2014 Ask Athena AI for detailed earnings breakdowns, macro trends, or financial concepts (e.g. \`${prefix}stockai why did tech drop today?\`, \`${prefix}stockai explain NVDA valuation\`).\n` +
                     `> -# • \`${prefix}stockexplain <symbol/topic>\` / \`${prefix}marketai\` \u2014 AI financial research aliases.\n\n` +
                     `### 3. Market Movers & Catalysts\n` +
                     `> -# • \`${prefix}movers\` / \`${prefix}topmovers\` \u2014 Real-time top gainers and decliners across mega-caps and crypto.\n` +
                     `> -# • \`${prefix}stocknews [symbol]\` / \`${prefix}marketnews\` \u2014 Real-time press wiretap with direct links to Bloomberg, Reuters, Yahoo Finance, etc.\n\n` +
                     `### 4. Cryptocurrency Telemetry\n` +
                     `> -# • \`${prefix}crypto [coin]\` \u2014 Cryptocurrency charts and telemetry (e.g. \`${prefix}crypto BTC\`, \`${prefix}crypto ETH\`, \`${prefix}crypto SOL\`).\n\n` +
                     `### 5. Automated Daily Briefing Channel\n` +
                     `> -# • \`${prefix}stockchannel set <#channel>\` \u2014 Binds an automated morning upload channel (posts every morning at 09:30 AM EST / 14:30 UTC at US Market Open).\n` +
                     `> -# • \`${prefix}stockchannel test\` \u2014 Immediately uploads today's briefing to verify delivery.\n` +
                     `> -# • \`${prefix}stockchannel status\` \u2014 Inspect current broadcast channel ID & delivery state.\n` +
                     `> -# • \`${prefix}stockchannel disable\` \u2014 Turn off daily automated briefing.\n\n` +
                     `> -# <a:uptime:1552608831060844575> **Risk Notice:** ${DISCLAIMER_TEXT}`
          },
          {
            type: 14,
            divider: true
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                custom_id: 'stk_ref_overview',
                label: 'View Global Market Pulse',
                style: 2,
                emoji: { name: '🌐' }
              },
              {
                type: 2,
                custom_id: 'stk_movers',
                label: 'View Top Movers',
                style: 2,
                emoji: { name: '🔥' }
              },
              {
                type: 2,
                custom_id: 'stk_crypto',
                label: 'View Crypto Pulse',
                style: 2,
                emoji: { name: '🪙' }
              }
            ]
          },
          {
            type: 14,
            divider: true
          },
          {
            type: 10,
            content: `-# **Athena Prime Financial Intelligence \u2022 Ground-Truth Telemetry Engine**`
          }
        ]
      }
    ]
  };
}
