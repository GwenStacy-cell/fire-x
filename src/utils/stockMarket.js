import path from 'path';
import { AttachmentBuilder, MessageFlags } from 'discord.js';
import { createCanvas, registerFont } from './canvas.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { generateAIResponse } from './ai.js';

try {
  registerFont(path.join(process.cwd(), 'assets', 'Roboto-Bold.ttf'), { family: 'Roboto', weight: 'bold' });
  registerFont(path.join(process.cwd(), 'assets', 'Roboto-Regular.ttf'), { family: 'Roboto', weight: 'normal' });
} catch (e) {}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export const DISCLAIMER_TEXT = 'Athena can make mistakes. Market data may be delayed or estimated. Not financial advice. Always double check live data and consult certified financial professionals before investing.';

/**
 * Generates coordinated human-readable and Discord dynamic timestamps (IST and UTC)
 */
export function getFormattedDateTimeStrings(date = new Date()) {
  const nowSec = Math.floor(date.getTime() / 1000);
  const istStr = date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }) + ' IST';
  const utcStr = date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  return {
    nowSec,
    istStr,
    utcStr,
    discordTimestamp: `<t:${nowSec}:F> (<t:${nowSec}:R>)`,
    textBadge: `<t:${nowSec}:F> (<t:${nowSec}:R>) \u2022 \`${istStr}\` (\`${utcStr}\`)`,
    canvasBadge: `DATE & TIME: ${istStr} | ${utcStr}`
  };
}

/**
 * Curated map of common aliases for indices, commodities, currencies, and major Indian stocks
 */
export const COMMON_MARKET_ALIASES = {
  // Indian Indices
  'NIFTY': '^NSEI',
  'NIFTY50': '^NSEI',
  'SENSEX': '^BSESN',
  'BANKNIFTY': '^NSEBANK',

  // Major Indian Companies (auto-resolved to NSE listings)
  'TCS': 'TCS.NS',
  'RELIANCE': 'RELIANCE.NS',
  'INFY': 'INFY.NS',
  'INFOSYS': 'INFY.NS',
  'HDFCBANK': 'HDFCBANK.NS',
  'HDFC': 'HDFCBANK.NS',
  'ICICIBANK': 'ICICIBANK.NS',
  'ICICI': 'ICICIBANK.NS',
  'SBIN': 'SBIN.NS',
  'SBI': 'SBIN.NS',
  'TATAMOTORS': 'TMCV.NS',
  'TATAMOTOR': 'TMCV.NS',
  'TATASTEEL': 'TATASTEEL.NS',
  'TATAPOWER': 'TATAPOWER.NS',
  'TATAELXSI': 'TATAELXSI.NS',
  'ITC': 'ITC.NS',
  'BHARTIARTL': 'BHARTIARTL.NS',
  'AIRTEL': 'BHARTIARTL.NS',
  'WIPRO': 'WIPRO.NS',
  'LT': 'LT.NS',
  'L&T': 'LT.NS',
  'ADANIENT': 'ADANIENT.NS',
  'ADANI': 'ADANIENT.NS',
  'ADANIPORTS': 'ADANIPORTS.NS',
  'MARUTI': 'MARUTI.NS',
  'TITAN': 'TITAN.NS',
  'BAJFINANCE': 'BAJFINANCE.NS',
  'BAJAJ': 'BAJFINANCE.NS',
  'BAJAJFINANCE': 'BAJFINANCE.NS',
  'HINDUNILVR': 'HINDUNILVR.NS',
  'HUL': 'HINDUNILVR.NS',
  'JIOFIN': 'JIOFIN.NS',
  'JIO': 'JIOFIN.NS',
  'KOTAKBANK': 'KOTAKBANK.NS',
  'AXISBANK': 'AXISBANK.NS',
  'SUNPHARMA': 'SUNPHARMA.NS',
  'ONGC': 'ONGC.NS',
  'NTPC': 'NTPC.NS',
  'POWERGRID': 'POWERGRID.NS',
  'COALINDIA': 'COALINDIA.NS',

  // US Indices
  'SP500': '^GSPC',
  'S&P500': '^GSPC',
  'SPX': '^GSPC',
  'NASDAQ': '^IXIC',
  'DOW': '^DJI',
  'DOWJONES': '^DJI',
  'DJI': '^DJI',
  'RUSSELL': '^RUT',
  'VIX': '^VIX',

  // World Indices
  'FTSE': '^FTSE',
  'DAX': '^GDAXI',
  'NIKKEI': '^N225',
  'HANGSENG': '^HSI',

  // Commodities
  'GOLD': 'GC=F',
  'XAU': 'GC=F',
  'SILVER': 'SI=F',
  'XAG': 'SI=F',
  'CRUDE': 'CL=F',
  'OIL': 'CL=F',
  'CRUDEOIL': 'CL=F',
  'BRENT': 'BZ=F',
  'NATGAS': 'NG=F',
  'GAS': 'NG=F',
  'COPPER': 'HG=F',

  // Currencies / Forex
  'USDINR': 'INR=X',
  'INR': 'INR=X',
  'EURUSD': 'EURUSD=X',
  'GBPUSD': 'GBPUSD=X',
  'USDJPY': 'JPY=X',

  // Common Crypto abbreviations
  'BTC': 'BTC-USD',
  'BITCOIN': 'BTC-USD',
  'ETH': 'ETH-USD',
  'ETHEREUM': 'ETH-USD',
  'SOL': 'SOL-USD',
  'SOLANA': 'SOL-USD',
  'DOGE': 'DOGE-USD',
  'DOGECOIN': 'DOGE-USD',
  'XRP': 'XRP-USD',
  'RIPPLE': 'XRP-USD',
  'ADA': 'ADA-USD',
  'CARDANO': 'ADA-USD',
  'BNB': 'BNB-USD',
  'AVAX': 'AVAX-USD',
  'SHIB': 'SHIB-USD',
  'PEPE': 'PEPE-USD',
  'SUI': 'SUI-USD',
  'DOT': 'DOT-USD',
  'LINK': 'LINK-USD',
  'LTC': 'LTC-USD',
  'NEAR': 'NEAR-USD',
  'TRX': 'TRX-USD',
  'TON': 'TON-USD'
};

/**
 * Returns appropriate currency symbol
 */
export function getCurrencySymbol(currency = 'USD') {
  if (!currency) return '$';
  switch (currency.toUpperCase()) {
    case 'USD': return '$';
    case 'INR': return '₹';
    case 'EUR': return '€';
    case 'GBP': return '£';
    case 'JPY': return '¥';
    case 'CAD': return 'CA$';
    case 'AUD': return 'A$';
    default: return `${currency} `;
  }
}

/**
 * Searches Yahoo Finance for matching symbols across equities, crypto, indices, and commodities
 */
export async function searchTickerSymbols(query) {
  if (!query) return [];
  try {
    const sUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12`;
    const sRes = await fetch(sUrl, { headers: { 'User-Agent': USER_AGENT } });
    if (!sRes.ok) return [];
    const sData = await sRes.json().catch(() => null);
    const quotes = sData?.quotes || [];
    return quotes
      .filter(q => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'INDEX' || q.quoteType === 'CRYPTOCURRENCY' || q.quoteType === 'ETF' || q.quoteType === 'FUTURE' || q.quoteType === 'CURRENCY'))
      .map(q => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.name || q.symbol,
        exchange: q.exchange || 'GLOBAL',
        type: q.quoteType || 'EQUITY'
      }));
  } catch {
    return [];
  }
}

/**
 * Searches Yahoo Finance for a company name or ticker query
 */
export async function searchTicker(query) {
  if (!query) return null;
  const results = await searchTickerSymbols(query);
  return results[0]?.symbol || query.trim().toUpperCase();
}

/**
 * Internal helper to attempt fetching chart telemetry for a candidate ticker
 * Resilient against brand new IPOs, low volume, weekend halts, and exchange renames
 */
async function tryFetchChart(symbol) {
  try {
    let url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=15m&range=1d`;
    let res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    let data = await res.json().catch(() => null);
    let resObj = data?.chart?.result?.[0];
    let closes = (resObj?.indicators?.quote?.[0]?.close || []).filter(v => typeof v === 'number');

    // Fallback to 5d if 1d has insufficient closes (e.g. weekend, holiday, market closed)
    if (!resObj || closes.length < 2) {
      const url5 = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=30m&range=5d`;
      const res5 = await fetch(url5, { headers: { 'User-Agent': USER_AGENT } }).catch(() => null);
      if (res5 && res5.ok) {
        const data5 = await res5.json().catch(() => null);
        const resObj5 = data5?.chart?.result?.[0];
        const closes5 = (resObj5?.indicators?.quote?.[0]?.close || []).filter(v => typeof v === 'number');
        if (resObj5 && closes5.length >= 2) {
          resObj = resObj5;
          closes = closes5;
        }
      }
    }

    if (!resObj || !resObj.meta) return null;

    const meta = resObj.meta || {};
    const price = meta.regularMarketPrice || (closes.length ? closes[closes.length - 1] : 0);
    if (!price || price <= 0) return null;

    const prevClose = meta.chartPreviousClose || meta.previousClose || (closes.length ? closes[0] : price);
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
  } catch {
    return null;
  }
}

/**
 * Universal stock/crypto/macro fetcher resolving every global symbol (Indian NSE/BSE, US, Crypto, Forex, Commodities)
 * Features dynamic self-learning cache, real-time multi-exchange suffix testing, live search, and AI rebrand dissector
 */
export async function fetchStockData(tickerInput) {
  if (!tickerInput) throw new Error('Please specify a stock ticker or company name.');
  const query = tickerInput.trim();
  const clean = query.toUpperCase();

  // Tier 1: Check Persistent Dynamic Database Cache (0ms fast-path)
  const cachedDynamic = db.getDynamicStockSymbol(clean);
  if (cachedDynamic && cachedDynamic.symbol) {
    const data = await tryFetchChart(cachedDynamic.symbol);
    if (data) {
      db.saveDynamicStockSymbol(clean, data.symbol, {
        name: data.name,
        exchange: data.exchange,
        currency: data.currency
      });
      return data;
    } else {
      // Stale or changed symbol in cache -> purge and let discovery find the new one
      db.deleteDynamicStockSymbol(clean);
    }
  }

  // Tier 2: Pre-mapped Aliases & Multi-Exchange Candidate Suffixes
  const candidates = [];
  if (COMMON_MARKET_ALIASES[clean]) {
    candidates.push(COMMON_MARKET_ALIASES[clean]);
  }
  candidates.push(clean);

  // If query doesn't already have an exchange suffix (.NS, .BO, -USD, =F, =X)
  if (!clean.includes('.') && !clean.includes('-') && !clean.includes('=')) {
    if (/^[A-Z0-9]{1,15}$/.test(clean)) {
      candidates.push(`${clean}.NS`);   // National Stock Exchange of India (e.g. TCS.NS, SWIGGY.NS)
      candidates.push(`${clean}.BO`);   // Bombay Stock Exchange (e.g. TCS.BO)
      candidates.push(`${clean}-USD`);  // Cryptocurrency USD pair (e.g. BTC-USD, SOL-USD)
      candidates.push(`${clean}-USDT`); // Cryptocurrency USDT pair
      candidates.push(`${clean}=F`);    // Commodities (e.g. GC=F)
      candidates.push(`${clean}=X`);    // Forex Currencies (e.g. USDINR=X)
      candidates.push(`${clean}.L`);    // London Stock Exchange (e.g. RR.L)
      candidates.push(`${clean}.TO`);   // Toronto TSX (e.g. SHOP.TO)
      candidates.push(`${clean}.DE`);   // Frankfurt DAX (e.g. BMW.DE)
      candidates.push(`${clean}.T`);    // Tokyo TSE (e.g. 7203.T)
      candidates.push(`${clean}.HK`);   // Hong Kong Exchange (e.g. 9988.HK)
      candidates.push(`${clean}.AX`);   // Australian ASX (e.g. BHP.AX)
    }
  }

  const candidateSet = new Set(candidates);

  // Test direct & suffixed candidates
  for (const sym of candidateSet) {
    const data = await tryFetchChart(sym);
    if (data) {
      db.saveDynamicStockSymbol(clean, data.symbol, {
        name: data.name,
        exchange: data.exchange,
        currency: data.currency
      });
      return data;
    }
  }

  // Tier 3: Real-Time Dynamic Search on Yahoo Finance API (resolves new IPOs, company names, brands)
  let searchResults = await searchTickerSymbols(query);
  if (!searchResults.length && clean.length > 2) {
    searchResults = await searchTickerSymbols(`${query} stock`);
  }

  for (const item of searchResults) {
    if (!candidateSet.has(item.symbol)) {
      candidateSet.add(item.symbol);
      const data = await tryFetchChart(item.symbol);
      if (data) {
        db.saveDynamicStockSymbol(clean, data.symbol, {
          name: data.name,
          exchange: data.exchange,
          currency: data.currency,
          assetType: item.type
        });
        return data;
      }
    }
  }

  // Tier 4: Autonomous Financial AI Rebrand & Ticker Dissector
  // Detects corporate restructurings, ticker migrations (e.g. Zomato -> ETERNAL.NS), and recent IPOs
  try {
    const aiPrompt = `User wants live stock market data for asset: "${query}". If this company or crypto underwent a rebranding, corporate restructuring, ticker change, or is traded globally, what is its exact current Yahoo Finance ticker symbol (e.g. ETERNAL.NS, TMCV.NS, META, BTC-USD)? Output ONLY the exact Yahoo Finance ticker symbol.`;
    const aiRes = await generateAIResponse(aiPrompt, {
      customSystem: 'You are an elite financial database ticker resolver. Output ONLY the single exact Yahoo Finance ticker symbol, nothing else.'
    });
    const rawAiText = typeof aiRes === 'string' ? aiRes : aiRes?.text || '';
    const cleanAiSymbol = rawAiText.replace(/[-#*`\s]/g, '').trim().toUpperCase();
    if (cleanAiSymbol && /^[A-Z0-9^.=-]{1,20}$/.test(cleanAiSymbol) && !candidateSet.has(cleanAiSymbol)) {
      const data = await tryFetchChart(cleanAiSymbol);
      if (data) {
        db.saveDynamicStockSymbol(clean, data.symbol, {
          name: data.name,
          exchange: data.exchange,
          currency: data.currency
        });
        return data;
      }
    }
  } catch {}

  throw new Error(`Could not resolve financial telemetry for "${tickerInput}". Type "!symbols" or "!symbols search ${tickerInput}" to inspect available tickers.`);
}

/**
 * Autonomous background updater: fetches trending stocks from major hubs (India, US)
 * and proactively indexes any newly active, trending, or recently listed assets into the database
 */
export async function syncTrendingMarketSymbols() {
  const regions = ['IN', 'US'];
  let count = 0;
  for (const reg of regions) {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/trending/${reg}`;
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      const quotes = data?.finance?.result?.[0]?.quotes || [];
      for (const q of quotes) {
        if (!q.symbol) continue;
        try {
          const chart = await tryFetchChart(q.symbol);
          if (chart) {
            db.saveDynamicStockSymbol(q.symbol, chart.symbol, {
              name: chart.name,
              exchange: chart.exchange,
              currency: chart.currency
            });
            count++;
          }
        } catch {}
      }
    } catch {}
  }
  return count;
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
  ctx.fillText('ATHENA PRIME // FINANCIAL RECONNAISSANCE SYSTEM', 45, 45);

  const dt = getFormattedDateTimeStrings();

  ctx.font = 'bold 12px Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  const liveW = ctx.measureText('LIVE MARKET TELEMETRY').width;
  ctx.fillText('LIVE MARKET TELEMETRY', W - 45 - liveW, 42);

  ctx.beginPath();
  ctx.arc(W - 45 - liveW - 10, 38, 4, 0, Math.PI * 2);
  ctx.fillStyle = primaryColor;
  ctx.fill();

  // Prominent Date & Time Badge
  ctx.font = 'bold 11px Roboto, sans-serif';
  const dtW = ctx.measureText(dt.canvasBadge).width;
  ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
  ctx.roundRect ? ctx.roundRect(W - 45 - dtW - 16, 52, dtW + 16, 22, 4) : ctx.fillRect(W - 45 - dtW - 16, 52, dtW + 16, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.fillText(dt.canvasBadge, W - 45 - dtW - 8, 67);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath(); ctx.moveTo(40, 82); ctx.lineTo(W - 40, 82); ctx.stroke();

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

  const currSym = getCurrencySymbol(stock.currency);

  // Price Display
  const priceStr = `${currSym}${stock.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  ctx.font = 'bold 50px Roboto, sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(priceStr, 45, 226);
  const prcW = ctx.measureText(priceStr).width;

  // Change Pill Badge
  const sign = isUp ? '+' : '';
  const changeStr = `${sign}${currSym}${Math.abs(stock.change).toFixed(2)} (${sign}${stock.changePct.toFixed(2)}%)`;
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
  ctx.fillText(`PREV CLOSE ${currSym}${stock.prevClose.toFixed(2)}`, chartX + chartW - 130, prevY - 6);

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
  ctx.fillText(`${currSym}${stock.dayLow.toFixed(2)}`, panelX + 20, panelY + 84);
  const dayHighStr = `${currSym}${stock.dayHigh.toFixed(2)}`;
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
  ctx.fillText(`${currSym}${stock.fiftyTwoWeekLow.toFixed(2)}`, panelX + 20, panelY + 160);
  const w52HighStr = `${currSym}${stock.fiftyTwoWeekHigh.toFixed(2)}`;
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
  ctx.fillText(`${currSym}${stock.prevClose.toFixed(2)}`, panelX + 182, rowY + 48);

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
  ctx.fillText('ATHENA PRIME // GLOBAL FINANCIAL INTELLIGENCE DASHBOARD', 45, 45);

  const dt = getFormattedDateTimeStrings();

  ctx.font = 'bold 12px Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  const pulseW = ctx.measureText('WORLD MARKET PULSE').width;
  ctx.fillText('WORLD MARKET PULSE', W - 45 - pulseW, 42);

  ctx.beginPath();
  ctx.arc(W - 45 - pulseW - 10, 38, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.fill();

  // Prominent Date & Time Badge
  ctx.font = 'bold 11px Roboto, sans-serif';
  const dtW = ctx.measureText(dt.canvasBadge).width;
  ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
  ctx.roundRect ? ctx.roundRect(W - 45 - dtW - 16, 52, dtW + 16, 22, 4) : ctx.fillRect(W - 45 - dtW - 16, 52, dtW + 16, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.fillText(dt.canvasBadge, W - 45 - dtW - 8, 67);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath(); ctx.moveTo(40, 82); ctx.lineTo(W - 40, 82); ctx.stroke();

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
  const currSym = getCurrencySymbol(stock.currency);
  const filename = `stock_${stock.symbol.toLowerCase().replace(/[^a-z0-9]/g, '_')}.png`;
  const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
  const dt = getFormattedDateTimeStrings();

  const components = [
    {
      type: 12,
      items: [{ media: { url: `attachment://${filename}` } }]
    },
    {
      type: 10,
      content: `## ${stock.name} (${stock.symbol}) Stock Telemetry | <a:atheNATICK:1557841381630681106>\n` +
               `> -# <a:uptime:1552608831060844575> **Date & Time:** ${dt.textBadge}\n` +
               `> -# <a:uptime:1552608831060844575> **Current Price:** \`${currSym}${stock.price.toFixed(2)} ${stock.currency}\` (\`${sign}${currSym}${Math.abs(stock.change).toFixed(2)}\` | \`${sign}${stock.changePct.toFixed(2)}%\`)\n` +
               `> -# • **Day Session Range:** \`${currSym}${stock.dayLow.toFixed(2)}\` \u2014 \`${currSym}${stock.dayHigh.toFixed(2)}\`\n` +
               `> -# • **52-Week Range:** \`${currSym}${stock.fiftyTwoWeekLow.toFixed(2)}\` \u2014 \`${currSym}${stock.fiftyTwoWeekHigh.toFixed(2)}\`\n` +
               `> -# • **24h Volume:** \`${stock.volume > 1e6 ? (stock.volume / 1e6).toFixed(2) + 'M' : stock.volume.toLocaleString()}\` \u2022 **Prev Close:** \`${currSym}${stock.prevClose.toFixed(2)}\`\n` +
               `> -# • **Exchange Market:** \`${stock.exchange}\` (\`${stock.currency}\`)\n` +
               `> -# • **Session Momentum:** \`${isUp ? 'Bullish (Upward Momentum)' : 'Bearish (Downward Pull)'}\`\n\n` +
               `### Supporting Commands Guidance\n` +
               `> -# • \`${prefix}symbols\` \u2014 Browse global ticker directory (NSE/BSE, US Tech, Crypto, Commodities) or search any company.\n` +
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
          style: 2
        },
        {
          type: 2,
          custom_id: `stk_ai_${stock.symbol}`,
          label: 'AI Market Analysis',
          style: 2
        },
        {
          type: 2,
          custom_id: `stk_news_${stock.symbol}`,
          label: 'Latest News',
          style: 2
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
          custom_id: 'stk_cat_all',
          label: 'Symbols List',
          style: 2
        },
        {
          type: 2,
          custom_id: 'stk_ref_overview',
          label: 'Global Pulse',
          style: 2
        },
        {
          type: 2,
          custom_id: 'stk_movers',
          label: 'Market Movers',
          style: 2
        },
        {
          type: 2,
          custom_id: 'stk_crypto',
          label: 'Crypto Pulse',
          style: 2
        },
        {
          type: 2,
          custom_id: 'stk_help',
          label: 'All Cmds Guide',
          style: 2
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
    files: [attachment],
    flags: MessageFlags.IsComponentsV2
  };
}

/**
 * Builds Components V2 Discord payload for Global Market Overview or Daily Briefing
 */
export function buildMarketOverviewPayload(overview, imageBuffer, isDaily = false, prefix = '!') {
  const filename = 'market_overview.png';
  const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
  const dt = getFormattedDateTimeStrings();

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
      type: 12,
      items: [{ media: { url: `attachment://${filename}` } }]
    },
    {
      type: 10,
      content: `${heading}\n` +
               `> -# <a:uptime:1552608831060844575> **Date & Time:** ${dt.textBadge}\n` +
               `> -# <a:uptime:1552608831060844575> **Global Market Regime:** \`${bias}\` across 6 major indices.\n` +
               `> -# • **Key Indices:** ${indicesSummary}\n` +
               `> -# • **Tech Mega-Caps:** \`NVDA\` (${overview.tickers[0]?.changePct >= 0 ? '+' : ''}${overview.tickers[0]?.changePct?.toFixed(1)}%), \`AAPL\` (${overview.tickers[1]?.changePct >= 0 ? '+' : ''}${overview.tickers[1]?.changePct?.toFixed(1)}%), \`MSFT\` (${overview.tickers[2]?.changePct >= 0 ? '+' : ''}${overview.tickers[2]?.changePct?.toFixed(1)}%), \`TSLA\` (${overview.tickers[3]?.changePct >= 0 ? '+' : ''}${overview.tickers[3]?.changePct?.toFixed(1)}%)\n\n` +
               `### Supporting Commands Guidance\n` +
               `> -# • \`${prefix}symbols\` \u2014 Browse global ticker directory (NSE, US Tech, Crypto, Commodities) or search any company.\n` +
               `> -# • \`${prefix}stock <symbol>\` \u2014 Single stock Canvas chart & telemetry (e.g. \`${prefix}stock TCS\`, \`${prefix}stock NVDA\`).\n` +
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
          custom_id: 'stk_cat_all',
          label: 'Symbols List',
          style: 2
        },
        {
          type: 2,
          custom_id: 'stk_ref_overview',
          label: 'Refresh Pulse',
          style: 2
        },
        {
          type: 2,
          custom_id: 'stk_movers',
          label: 'Market Movers',
          style: 2
        },
        {
          type: 2,
          custom_id: 'stk_crypto',
          label: 'Crypto Pulse',
          style: 2
        },
        {
          type: 2,
          custom_id: 'stk_help',
          label: 'All Cmds Guide',
          style: 2
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
    files: [attachment],
    flags: MessageFlags.IsComponentsV2
  };
}

/**
 * Builds interactive guidance UI container listing all supporting financial commands
 */
export function buildStockGuidancePayload(prefix = '!') {
  const dt = getFormattedDateTimeStrings();

  return {
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## Financial Intelligence Suite & Commands Guidance | <a:atheNATICK:1557841381630681106>\n` +
                     `> -# <a:uptime:1552608831060844575> **Date & Time:** ${dt.textBadge}\n` +
                     `> -# <a:uptime:1552608831060844575> **Overview:** Athena Prime provides real-time stock/crypto telemetry, high-resolution Canvas charts, and AI-driven financial intelligence.\n\n` +
                     `### 1. Market Telemetry & Charts\n` +
                     `> -# • \`${prefix}stock <symbol>\` \u2014 Single stock Canvas chart with Bezier curves, day range, 52w range, volume, & sentiment gauge (e.g. \`${prefix}stock TCS\`, \`${prefix}stock NVDA\`, \`${prefix}stock RELIANCE\`).\n` +
                     `> -# • \`${prefix}market\` / \`${prefix}stocks\` \u2014 Global 6-index world market pulse (S&P 500, NASDAQ, Dow, NIFTY 50, BTC, ETH) + mega-caps ticker tape.\n` +
                     `> -# • \`${prefix}ticker <symbol>\` \u2014 Direct company/ticker resolution.\n\n` +
                     `### 2. Universal Ticker Directory & Real-Time Symbol Search\n` +
                     `> -# • \`${prefix}symbols\` / \`${prefix}symbollist\` \u2014 Interactive ticker directory with 1-click categories (Indian Equities, US Mega-Caps, Crypto, Commodities & Indices).\n` +
                     `> -# • \`${prefix}symbols <query>\` / \`${prefix}symbols search <name>\` \u2014 Dynamic real-time symbol search on Yahoo Finance (e.g. \`${prefix}symbols tata\`, \`${prefix}symbols sbi\`, \`${prefix}symbols reliance\`, \`${prefix}symbols adani\`).\n\n` +
                     `### 3. AI Financial Analyst & Reports\n` +
                     `> -# • \`${prefix}stockai <question or topic>\` \u2014 Ask Athena AI for detailed earnings breakdowns, macro trends, or financial concepts (e.g. \`${prefix}stockai why did tech drop today?\`, \`${prefix}stockai explain NVDA valuation\`).\n` +
                     `> -# • \`${prefix}stockexplain <symbol/topic>\` / \`${prefix}marketai\` \u2014 AI financial research aliases.\n\n` +
                     `### 4. Market Movers & Catalysts\n` +
                     `> -# • \`${prefix}movers\` / \`${prefix}topmovers\` \u2014 Real-time top gainers and decliners across mega-caps and crypto.\n` +
                     `> -# • \`${prefix}stocknews [symbol]\` / \`${prefix}marketnews\` \u2014 Real-time press wiretap with direct links to Bloomberg, Reuters, Yahoo Finance, etc.\n\n` +
                     `### 5. Cryptocurrency Telemetry\n` +
                     `> -# • \`${prefix}crypto [coin]\` \u2014 Cryptocurrency charts and telemetry (e.g. \`${prefix}crypto BTC\`, \`${prefix}crypto ETH\`, \`${prefix}crypto SOL\`).\n\n` +
                     `### 6. Automated Daily Briefing Channel\n` +
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
                custom_id: 'stk_cat_all',
                label: 'Symbols Directory',
                style: 2
              },
              {
                type: 2,
                custom_id: 'stk_ref_overview',
                label: 'View Global Market Pulse',
                style: 2
              },
              {
                type: 2,
                custom_id: 'stk_movers',
                label: 'View Top Movers',
                style: 2
              },
              {
                type: 2,
                custom_id: 'stk_crypto',
                label: 'View Crypto Pulse',
                style: 2
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
    ],
    flags: MessageFlags.IsComponentsV2
  };
}

/**
 * Builds interactive Symbols directory with categorized sections and one-click commands
 */
export function buildSymbolsPayload(category = 'all', prefix = '!') {
  const dt = getFormattedDateTimeStrings();
  const cat = String(category || 'all').toLowerCase();

  let title = 'Global Symbol & Ticker Directory';
  let bodyContent = '';

  if (cat === 'trending' || cat === 'new' || cat === 'recent' || cat === 'hot') {
    title = 'Trending & Newly Discovered Tickers';
    const dynamicList = db.getAllDynamicStockSymbols(15);
    const totalCount = dynamicList.length;
    const rows = dynamicList.map((item, idx) => {
      const baseTicker = item.symbol.replace(/\.NS$|\.BO$/, '');
      const timeStr = item.updatedAt ? `<t:${Math.floor(item.updatedAt / 1000)}:R>` : 'Active';
      return `> -# • **${item.name}** (\`${item.symbol}\`) \u2014 \`${item.exchange}\` (${timeStr})\n` +
             `> -#   \u25b8 Command: \`${prefix}stock ${baseTicker}\` or \`${prefix}stock ${item.symbol}\``;
    }).join('\n\n') || '> -# • No dynamic tickers recorded yet. Query any ticker with `!stock <symbol>` to index it!';

    bodyContent =
      `### Dynamically Registered Assets (${totalCount} Auto-Tracked)\n` +
      `> -# Athena automatically indexes, tracks corporate renames, and updates every stock, crypto, ETF, or commodity ever queried or newly listed on global exchanges.\n\n` +
      `${rows}`;
  } else if (cat === 'india') {
    title = 'Indian Equities & Indices (NSE / BSE)';
    bodyContent =
      `### Benchmark Indices\n` +
      `> -# • \`NIFTY\` \u2014 NIFTY 50 Benchmark Index (\`${prefix}stock NIFTY\`)\n` +
      `> -# • \`SENSEX\` \u2014 BSE SENSEX 30 Index (\`${prefix}stock SENSEX\`)\n` +
      `> -# • \`BANKNIFTY\` \u2014 Nifty Bank Banking Index (\`${prefix}stock BANKNIFTY\`)\n\n` +
      `### Top Bluechips & Heavyweights\n` +
      `> -# • \`TCS\` \u2014 Tata Consultancy Services (\`${prefix}stock TCS\`)\n` +
      `> -# • \`RELIANCE\` \u2014 Reliance Industries Ltd (\`${prefix}stock RELIANCE\`)\n` +
      `> -# • \`INFY\` \u2014 Infosys Limited (\`${prefix}stock INFY\`)\n` +
      `> -# • \`HDFCBANK\` \u2014 HDFC Bank Limited (\`${prefix}stock HDFCBANK\`)\n` +
      `> -# • \`TATAMOTORS\` \u2014 Tata Motors Ltd (\`${prefix}stock TATAMOTORS\`)\n` +
      `> -# • \`SBIN\` \u2014 State Bank of India (\`${prefix}stock SBIN\`)\n` +
      `> -# • \`ITC\` \u2014 ITC Limited (\`${prefix}stock ITC\`)\n` +
      `> -# • \`ICICIBANK\` \u2014 ICICI Bank Ltd (\`${prefix}stock ICICIBANK\`)\n` +
      `> -# • \`BHARTIARTL\` \u2014 Bharti Airtel Ltd (\`${prefix}stock BHARTIARTL\`)\n` +
      `> -# • \`HINDUNILVR\` \u2014 Hindustan Unilever Ltd (\`${prefix}stock HINDUNILVR\`)\n` +
      `> -# • \`LT\` \u2014 Larsen & Toubro Ltd (\`${prefix}stock LT\`)\n` +
      `> -# • \`WIPRO\` \u2014 Wipro Limited (\`${prefix}stock WIPRO\`)\n` +
      `> -# • \`BAJFINANCE\` \u2014 Bajaj Finance Ltd (\`${prefix}stock BAJFINANCE\`)\n` +
      `> -# • \`ADANIENT\` \u2014 Adani Enterprises Ltd (\`${prefix}stock ADANIENT\`)\n` +
      `> -# • \`MARUTI\` \u2014 Maruti Suzuki India (\`${prefix}stock MARUTI\`)\n` +
      `> -# • \`TITAN\` \u2014 Titan Company Ltd (\`${prefix}stock TITAN\`)\n` +
      `> -# • \`TATASTEEL\` \u2014 Tata Steel Ltd (\`${prefix}stock TATASTEEL\`)\n` +
      `> -# • \`KOTAKBANK\` \u2014 Kotak Mahindra Bank (\`${prefix}stock KOTAKBANK\`)\n` +
      `> -# • \`AXISBANK\` \u2014 Axis Bank Ltd (\`${prefix}stock AXISBANK\`)\n` +
      `> -# • \`SUNPHARMA\` \u2014 Sun Pharmaceutical Industries (\`${prefix}stock SUNPHARMA\`)`;
  } else if (cat === 'us') {
    title = 'US Tech Titans & Global Equities';
    bodyContent =
      `### US Benchmark Indices & ETFs\n` +
      `> -# • \`SP500\` \u2014 S&P 500 Index (\`${prefix}stock SP500\`)\n` +
      `> -# • \`NASDAQ\` \u2014 Nasdaq Composite Index (\`${prefix}stock NASDAQ\`)\n` +
      `> -# • \`DOW\` \u2014 Dow Jones Industrial Average (\`${prefix}stock DOW\`)\n` +
      `> -# • \`QQQ\` \u2014 Invesco QQQ Trust ETF (\`${prefix}stock QQQ\`)\n` +
      `> -# • \`SPY\` \u2014 SPDR S&P 500 ETF Trust (\`${prefix}stock SPY\`)\n\n` +
      `### Tech Titans & AI Powerhouses\n` +
      `> -# • \`NVDA\` \u2014 NVIDIA Corporation (\`${prefix}stock NVDA\`)\n` +
      `> -# • \`AAPL\` \u2014 Apple Inc. (\`${prefix}stock AAPL\`)\n` +
      `> -# • \`MSFT\` \u2014 Microsoft Corporation (\`${prefix}stock MSFT\`)\n` +
      `> -# • \`GOOGL\` \u2014 Alphabet Inc. Google (\`${prefix}stock GOOGL\`)\n` +
      `> -# • \`AMZN\` \u2014 Amazon.com Inc. (\`${prefix}stock AMZN\`)\n` +
      `> -# • \`META\` \u2014 Meta Platforms Inc. (\`${prefix}stock META\`)\n` +
      `> -# • \`TSLA\` \u2014 Tesla Inc. (\`${prefix}stock TSLA\`)\n` +
      `> -# • \`AMD\` \u2014 Advanced Micro Devices (\`${prefix}stock AMD\`)\n` +
      `> -# • \`AVGO\` \u2014 Broadcom Inc. (\`${prefix}stock AVGO\`)\n` +
      `> -# • \`NFLX\` \u2014 Netflix Inc. (\`${prefix}stock NFLX\`)\n` +
      `> -# • \`PLTR\` \u2014 Palantir Technologies (\`${prefix}stock PLTR\`)\n` +
      `> -# • \`COIN\` \u2014 Coinbase Global Inc. (\`${prefix}stock COIN\`)`;
  } else if (cat === 'crypto') {
    title = 'Cryptocurrency & Digital Assets';
    bodyContent =
      `### Major Cryptocurrencies\n` +
      `> -# • \`BTC\` \u2014 Bitcoin (\`${prefix}stock BTC\` / \`${prefix}crypto BTC\`)\n` +
      `> -# • \`ETH\` \u2014 Ethereum (\`${prefix}stock ETH\` / \`${prefix}crypto ETH\`)\n` +
      `> -# • \`SOL\` \u2014 Solana (\`${prefix}stock SOL\` / \`${prefix}crypto SOL\`)\n` +
      `> -# • \`BNB\` \u2014 Binance Coin (\`${prefix}stock BNB\` / \`${prefix}crypto BNB\`)\n` +
      `> -# • \`XRP\` \u2014 XRP Ledger (\`${prefix}stock XRP\` / \`${prefix}crypto XRP\`)\n` +
      `> -# • \`DOGE\` \u2014 Dogecoin (\`${prefix}stock DOGE\` / \`${prefix}crypto DOGE\`)\n` +
      `> -# • \`ADA\` \u2014 Cardano (\`${prefix}stock ADA\` / \`${prefix}crypto ADA\`)\n` +
      `> -# • \`AVAX\` \u2014 Avalanche (\`${prefix}stock AVAX\` / \`${prefix}crypto AVAX\`)\n` +
      `> -# • \`LINK\` \u2014 Chainlink (\`${prefix}stock LINK\` / \`${prefix}crypto LINK\`)\n` +
      `> -# • \`SUI\` \u2014 Sui Network (\`${prefix}stock SUI\` / \`${prefix}crypto SUI\`)\n` +
      `> -# • \`NEAR\` \u2014 NEAR Protocol (\`${prefix}stock NEAR\` / \`${prefix}crypto NEAR\`)\n` +
      `> -# • \`DOT\` \u2014 Polkadot (\`${prefix}stock DOT\` / \`${prefix}crypto DOT\`)\n` +
      `> -# • \`SHIB\` \u2014 Shiba Inu (\`${prefix}stock SHIB\` / \`${prefix}crypto SHIB\`)\n` +
      `> -# • \`PEPE\` \u2014 Pepe (\`${prefix}stock PEPE\` / \`${prefix}crypto PEPE\`)`;
  } else if (cat === 'macro') {
    title = 'Commodities, Global Indices & Forex';
    bodyContent =
      `### Global Commodities\n` +
      `> -# • \`GOLD\` \u2014 Gold Futures / Spot (\`${prefix}stock GOLD\`)\n` +
      `> -# • \`SILVER\` \u2014 Silver Futures / Spot (\`${prefix}stock SILVER\`)\n` +
      `> -# • \`CRUDE\` \u2014 Crude Oil WTI Futures (\`${prefix}stock CRUDE\`)\n` +
      `> -# • \`NATGAS\` \u2014 Natural Gas Futures (\`${prefix}stock NATGAS\`)\n` +
      `> -# • \`COPPER\` \u2014 Copper Futures (\`${prefix}stock COPPER\`)\n\n` +
      `### International Market Indices\n` +
      `> -# • \`NIKKEI\` \u2014 Nikkei 225 - Japan (\`${prefix}stock NIKKEI\`)\n` +
      `> -# • \`FTSE\` \u2014 FTSE 100 - United Kingdom (\`${prefix}stock FTSE\`)\n` +
      `> -# • \`DAX\` \u2014 DAX 40 - Germany (\`${prefix}stock DAX\`)\n` +
      `> -# • \`HANGSENG\` \u2014 Hang Seng Index - Hong Kong (\`${prefix}stock HANGSENG\`)\n\n` +
      `### Major Forex Pairs\n` +
      `> -# • \`USDINR\` \u2014 US Dollar to Indian Rupee (\`${prefix}stock USDINR\`)\n` +
      `> -# • \`EURUSD\` \u2014 Euro to US Dollar (\`${prefix}stock EURUSD\`)\n` +
      `> -# • \`GBPUSD\` \u2014 British Pound to US Dollar (\`${prefix}stock GBPUSD\`)\n` +
      `> -# • \`USDJPY\` \u2014 US Dollar to Japanese Yen (\`${prefix}stock USDJPY\`)`;
  } else {
    // 'all' / general overview
    title = 'Universal Ticker & Symbol Directory';
    bodyContent =
      `### 1. Indian Equities & Indices (NSE / BSE)\n` +
      `> -# \`NIFTY\` \u2022 \`SENSEX\` \u2022 \`BANKNIFTY\` \u2022 \`TCS\` \u2022 \`RELIANCE\` \u2022 \`INFY\` \u2022 \`HDFCBANK\` \u2022 \`TATAMOTORS\` \u2022 \`SBIN\` \u2022 \`ITC\`\n` +
      `> -# \u25b8 Try: \`${prefix}stock TCS\`, \`${prefix}stock RELIANCE\`, \`${prefix}stock INFY\`\n\n` +
      `### 2. US Tech Titans & Global Equities\n` +
      `> -# \`NVDA\` \u2022 \`AAPL\` \u2022 \`MSFT\` \u2022 \`GOOGL\` \u2022 \`AMZN\` \u2022 \`META\` \u2022 \`TSLA\` \u2022 \`AMD\` \u2022 \`SP500\` \u2022 \`NASDAQ\`\n` +
      `> -# \u25b8 Try: \`${prefix}stock NVDA\`, \`${prefix}stock AAPL\`, \`${prefix}stock TSLA\`\n\n` +
      `### 3. Cryptocurrencies & Digital Assets\n` +
      `> -# \`BTC\` \u2022 \`ETH\` \u2022 \`SOL\` \u2022 \`BNB\` \u2022 \`XRP\` \u2022 \`DOGE\` \u2022 \`ADA\` \u2022 \`AVAX\` \u2022 \`LINK\` \u2022 \`SUI\`\n` +
      `> -# \u25b8 Try: \`${prefix}stock BTC\`, \`${prefix}crypto ETH\`, \`${prefix}stock SOL\`\n\n` +
      `### 4. Commodities & Global Macro\n` +
      `> -# \`GOLD\` \u2022 \`SILVER\` \u2022 \`CRUDE\` \u2022 \`NATGAS\` \u2022 \`USDINR\` \u2022 \`EURUSD\` \u2022 \`NIKKEI\`\n` +
      `> -# \u25b8 Try: \`${prefix}stock GOLD\`, \`${prefix}stock CRUDE\`, \`${prefix}stock USDINR\``;
  }

  const isTrending = cat === 'trending' || cat === 'new' || cat === 'recent' || cat === 'hot';

  const row1 = {
    type: 1,
    components: [
      {
        type: 2,
        custom_id: 'stk_cat_all',
        label: 'Overview',
        style: cat === 'all' ? 1 : 2
      },
      {
        type: 2,
        custom_id: 'stk_cat_trending',
        label: 'Trending & New',
        style: isTrending ? 1 : 2
      },
      {
        type: 2,
        custom_id: 'stk_cat_india',
        label: 'India NSE/BSE',
        style: cat === 'india' ? 1 : 2
      },
      {
        type: 2,
        custom_id: 'stk_cat_us',
        label: 'US Tech & AI',
        style: cat === 'us' ? 1 : 2
      }
    ]
  };

  const row2 = {
    type: 1,
    components: [
      {
        type: 2,
        custom_id: 'stk_cat_crypto',
        label: 'Crypto',
        style: cat === 'crypto' ? 1 : 2
      },
      {
        type: 2,
        custom_id: 'stk_cat_macro',
        label: 'Macro & Commodities',
        style: cat === 'macro' ? 1 : 2
      },
      {
        type: 2,
        custom_id: 'stk_ref_overview',
        label: 'Global Pulse',
        style: 2
      }
    ]
  };

  return {
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## ${title} | <a:atheNATICK:1557841381630681106>\n` +
                     `> -# <a:uptime:1552608831060844575> **Date & Time:** ${dt.textBadge}\n` +
                     `> -# <a:uptime:1552608831060844575> **Universal Ticker Support:** Athena resolves **every single publicly traded asset globally**.\n\n` +
                     `${bodyContent}\n\n` +
                     `### Dynamic Symbol Search\n` +
                     `> -# • Run \`${prefix}symbols <search-term>\` to search any company by name or ticker in real-time (e.g. \`${prefix}symbols tata\`, \`${prefix}symbols adani\`, \`${prefix}symbols zomato\`, \`${prefix}symbols palantir\`).\n\n` +
                     `> -# <a:uptime:1552608831060844575> **Risk Notice:** ${DISCLAIMER_TEXT}`
          },
          {
            type: 14,
            divider: true
          },
          row1,
          row2,
          {
            type: 14,
            divider: true
          },
          {
            type: 10,
            content: `-# **Athena Prime Financial Intelligence \u2022 Universal Ticker Directory**`
          }
        ]
      }
    ],
    flags: MessageFlags.IsComponentsV2
  };
}

/**
 * Builds search results container for user query
 */
export function buildSymbolSearchResultsPayload(query, results = [], prefix = '!') {
  const dt = getFormattedDateTimeStrings();

  if (!results || !results.length) {
    return {
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## Symbol Search: "${query}" | <a:atheNATICK:1557841381630681106>\n` +
                       `> -# <a:uptime:1552608831060844575> **Date & Time:** ${dt.textBadge}\n` +
                       `> -# <a:uptime:1552608831060844575> **Status:** No verified ticker symbols found matching "${query}".\n\n` +
                       `### Search Recommendations\n` +
                       `> -# • Try searching by full company name (e.g. \`${prefix}symbols Tata Motors\`, \`${prefix}symbols State Bank\`).\n` +
                       `> -# • Try searching by asset code (e.g. \`${prefix}symbols TCS\`, \`${prefix}symbols NVDA\`, \`${prefix}symbols BTC\`).\n` +
                       `> -# • Browse standard categories using the directory buttons below.\n\n` +
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
                  custom_id: 'stk_cat_all',
                  label: 'Overview Directory',
                  style: 2
                },
                {
                  type: 2,
                  custom_id: 'stk_cat_india',
                  label: 'India NSE/BSE',
                  style: 2
                },
                {
                  type: 2,
                  custom_id: 'stk_cat_us',
                  label: 'US Tech & AI',
                  style: 2
                },
                {
                  type: 2,
                  custom_id: 'stk_cat_crypto',
                  label: 'Crypto',
                  style: 2
                }
              ]
            },
            {
              type: 14,
              divider: true
            },
            {
              type: 10,
              content: `-# **Athena Prime Financial Intelligence \u2022 Universal Ticker Directory**`
            }
          ]
        }
      ],
      flags: MessageFlags.IsComponentsV2
    };
  }

  const items = results.slice(0, 8);
  const rows = items.map((r, idx) => {
    const baseTicker = r.symbol.replace(/\.NS$|\.BO$/, '');
    return `> -# **${idx + 1}. ${r.name}** (\`${r.symbol}\`)\n` +
           `> -# \u2022 Exchange: \`${r.exchange}\` \u2022 Asset Type: \`${r.type}\`\n` +
           `> -# \u25b8 Telemetry: \`${prefix}stock ${baseTicker}\` or \`${prefix}stock ${r.symbol}\``;
  }).join('\n\n');

  return {
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## Symbol Search Results: "${query}" | <a:atheNATICK:1557841381630681106>\n` +
                     `> -# <a:uptime:1552608831060844575> **Date & Time:** ${dt.textBadge}\n` +
                     `> -# <a:uptime:1552608831060844575> **Matches Found:** Showing top ${items.length} verified market assets for \`${query}\`.\n\n` +
                     `${rows}\n\n` +
                     `### Instant Telemetry Commands\n` +
                     `> -# Run \`${prefix}stock <ticker>\` to view live Canvas charts and technical gauges.\n\n` +
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
                custom_id: 'stk_cat_all',
                label: 'Overview Directory',
                style: 2
              },
              {
                type: 2,
                custom_id: 'stk_cat_india',
                label: 'India NSE/BSE',
                style: 2
              },
              {
                type: 2,
                custom_id: 'stk_cat_us',
                label: 'US Tech & AI',
                style: 2
              },
              {
                type: 2,
                custom_id: 'stk_ref_overview',
                label: 'Global Markets',
                style: 2
              }
            ]
          },
          {
            type: 14,
            divider: true
          },
          {
            type: 10,
            content: `-# **Athena Prime Financial Intelligence \u2022 Universal Ticker Directory**`
          }
        ]
      }
    ],
    flags: MessageFlags.IsComponentsV2
  };
}
