import fetch from 'node-fetch';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  UPTIME_EMOJI,
  NAV_EMOJI_IDS, 
  getRandomHeadingGlyph 
} from './emojis.js';
import { sanitizeCV2Payload } from '../cv2.js';

// In-memory GIF search sessions cache
export const gifSessions = new Map();

// Periodic pruning of expired sessions older than 45 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of gifSessions.entries()) {
    if (now - (session.createdAt || 0) > 45 * 60 * 1000) {
      gifSessions.delete(id);
    }
  }
}, 10 * 60 * 1000);

// Known anime reaction action keywords
const ANIME_ACTIONS = new Set([
  'hug', 'kiss', 'slap', 'pat', 'cuddle', 'dance', 'cry', 'smile', 'laugh', 
  'blush', 'wink', 'punch', 'bite', 'poke', 'wave', 'bonk', 'tickle', 
  'highfive', 'handhold', 'sleep', 'nom', 'yeet', 'smug', 'pout', 'shrug'
]);

/**
 * Route 1: KLIPY Expression Platform (klipy.com / api.klipy.com)
 */
async function fetchFromKlipy(query) {
  const apiKey = process.env.KLIPY_API_KEY || process.env.KILPY_API_KEY;

  // 1. Official Klipy Partner API if key configured
  if (apiKey) {
    try {
      const res = await fetch(`https://api.klipy.com/api/v1/${apiKey}/gifs/search?q=${encodeURIComponent(query)}&locale=en`, {
        headers: { 'Accept': 'application/json' },
        timeout: 2500
      });
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data?.data) ? data.data : (data?.data?.data || data?.results || []);
        const items = rawList
          .map(item => {
            const url = item?.file?.hd?.gif?.url || 
                        item?.file?.md?.gif?.url || 
                        item?.file?.sm?.gif?.url || 
                        item?.file?.hd?.webp?.url || 
                        item?.media?.gif?.url || 
                        item?.url || 
                        item?.gif;
            if (!url) return null;
            return {
              image: url,
              title: item.title || `${query} GIF`,
              sourceUrl: (item.slug ? `https://klipy.com/gif/${item.slug}` : item.url) || `https://klipy.com/search?q=${encodeURIComponent(query)}`,
              source: 'klipy.com'
            };
          })
          .filter(Boolean);
        if (items.length > 0) return items;
      }
    } catch {
      // Fall through to live static asset scraper
    }
  }

  // 2. Direct static asset discovery on klipy.com
  try {
    const res = await fetch(`https://klipy.com/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      timeout: 3000
    });
    if (res.ok) {
      const html = await res.text();
      const rawMatches = html.match(/https:\/\/static\.klipy\.com\/[^\s"'>\\]+\.(?:gif|webp)/gi) || [];
      const filtered = [...new Set(rawMatches)].filter(u => !u.includes('E10wQjEC'));
      return filtered.map((url, i) => ({
        image: url,
        title: `${query} #${i + 1}`,
        sourceUrl: `https://klipy.com/search?q=${encodeURIComponent(query)}`,
        source: 'klipy.com'
      }));
    }
  } catch {
    // Continue through federation
  }
  return [];
}

/**
 * Route 2: High-Resolution Animated GIF Search Aggregator (Tenor, Giphy, GifDB, Imgur, Reddit)
 */
async function fetchFromAnimatedWeb(query, offset = 0) {
  try {
    const startIdx = Math.max(1, offset + 1);
    const searchUrl = `https://www.bing.com/images/async?q=${encodeURIComponent(query + ' gif')}&qft=+filterui:photo-animatedgif&first=${startIdx}&count=40`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 3500
    });

    if (!res.ok) return [];

    const html = await res.text();
    const regex = /m="({[^"]+})"/g;
    let match;
    const items = [];

    while ((match = regex.exec(html)) !== null) {
      try {
        const decoded = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        const obj = JSON.parse(decoded);
        if (obj.murl && (obj.murl.startsWith('http://') || obj.murl.startsWith('https://'))) {
          let host = 'web';
          if (obj.purl) {
            try {
              host = new URL(obj.purl).hostname.replace('www.', '');
            } catch {
              host = 'web';
            }
          }
          items.push({
            image: obj.murl,
            title: (obj.t || query).replace(/[`*_\r\n]/g, '').trim(),
            sourceUrl: obj.purl || obj.murl,
            source: host
          });
        }
      } catch {
        // Skip malformed item
      }
    }
    return items;
  } catch {
    return [];
  }
}

/**
 * Route 3: Anime Reaction Endpoints (OtakuGifs & Nekos Best)
 */
async function fetchFromAnimeEndpoints(query) {
  const words = query.toLowerCase().split(/\s+/);
  const matchedAction = words.find(w => ANIME_ACTIONS.has(w));
  if (!matchedAction) return [];

  const items = [];

  // Nekos Best API
  try {
    const nbRes = await fetch(`https://nekos.best/api/v2/${matchedAction}?amount=8`, {
      headers: { 'Accept': 'application/json' },
      timeout: 2500
    });
    if (nbRes.ok) {
      const nbData = await nbRes.json();
      for (const r of (nbData?.results || [])) {
        if (r.url) {
          items.push({
            image: r.url,
            title: `${r.anime_name || query} (${matchedAction})`,
            sourceUrl: r.source_url || r.url,
            source: 'nekos.best'
          });
        }
      }
    }
  } catch {}

  // OtakuGifs API
  try {
    const ogRes = await fetch(`https://api.otakugifs.xyz/gif?reaction=${matchedAction}&format=gif`, {
      headers: { 'Accept': 'application/json' },
      timeout: 2500
    });
    if (ogRes.ok) {
      const ogData = await ogRes.json();
      if (ogData.url) {
        items.push({
          image: ogData.url,
          title: `Anime ${matchedAction}`,
          sourceUrl: ogData.url,
          source: 'otakugifs.xyz'
        });
      }
    }
  } catch {}

  return items;
}

/**
 * Route 4: Tenor & Giphy REST APIs (when keys provided)
 */
async function fetchFromTenorOrGiphy(query) {
  const items = [];

  // Tenor API
  const tenorKey = process.env.TENOR_API_KEY;
  if (tenorKey) {
    try {
      const res = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${tenorKey}&limit=20&client_key=athena_bot`, {
        timeout: 2500
      });
      if (res.ok) {
        const data = await res.json();
        for (const r of (data?.results || [])) {
          const gifUrl = r.media_formats?.gif?.url || r.media_formats?.mediumgif?.url;
          if (gifUrl) {
            items.push({
              image: gifUrl,
              title: r.content_description || query,
              sourceUrl: r.itemurl || gifUrl,
              source: 'tenor.com'
            });
          }
        }
      }
    } catch {}
  }

  // Giphy API
  const giphyKey = process.env.GIPHY_API_KEY;
  if (giphyKey) {
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${giphyKey}&q=${encodeURIComponent(query)}&limit=20&rating=g`, {
        timeout: 2500
      });
      if (res.ok) {
        const data = await res.json();
        for (const g of (data?.data || [])) {
          const gifUrl = g.images?.original?.url || g.images?.downsized?.url;
          if (gifUrl) {
            items.push({
              image: gifUrl,
              title: g.title || query,
              sourceUrl: g.url || gifUrl,
              source: 'giphy.com'
            });
          }
        }
      }
    } catch {}
  }

  return items;
}

/**
 * Performs federated search across all active GIF providers
 */
export async function searchFederatedGifs(query, options = {}) {
  const offset = options.offset || 0;
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];

  // Run all federated routes concurrently
  const [klipyResults, webResults, animeResults, officialResults] = await Promise.all([
    fetchFromKlipy(cleanQuery),
    fetchFromAnimatedWeb(cleanQuery, offset),
    fetchFromAnimeEndpoints(cleanQuery),
    fetchFromTenorOrGiphy(cleanQuery)
  ]);

  // Aggregate and deduplicate by URL
  const seenUrls = new Set();
  const aggregated = [];

  const addItems = (list) => {
    for (const item of list) {
      if (!item || !item.image) continue;
      const normalized = item.image.trim();
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized);
        aggregated.push({
          ...item,
          image: normalized
        });
      }
    }
  };

  // Prioritize anime routes if anime query, otherwise web & klipy
  if (animeResults.length > 0) {
    addItems(animeResults);
  }
  addItems(klipyResults);
  addItems(officialResults);
  addItems(webResults);

  // If initial batch is small and offset was 0, retry web with general suffix
  if (aggregated.length === 0 && offset === 0) {
    const fallbackWeb = await fetchFromAnimatedWeb(`${cleanQuery} animation`, 0);
    addItems(fallbackWeb);
  }

  return aggregated;
}

/**
 * Creates and registers a new search session
 */
export function createGifSession(query, results, index = 0) {
  const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  gifSessions.set(sessionId, {
    id: sessionId,
    query,
    results,
    index,
    offset: 0,
    createdAt: Date.now()
  });
  return sessionId;
}

/**
 * Retrieves an existing session or transparently recovers one from message metadata
 */
export async function getOrRecoverGifSession(sessionId, fallbackQuery = null) {
  let session = gifSessions.get(sessionId);
  if (!session && fallbackQuery) {
    const results = await searchFederatedGifs(fallbackQuery, { offset: 0 });
    if (results.length > 0) {
      session = {
        id: sessionId,
        query: fallbackQuery,
        results,
        index: 0,
        offset: 0,
        createdAt: Date.now()
      };
      gifSessions.set(sessionId, session);
    }
  }
  return session;
}

/**
 * Fetches a brand new batch of GIFs with advanced offset for 'Fresh Batch'
 */
export async function fetchFreshBatchForGifSession(sessionId, fallbackQuery = null) {
  let session = gifSessions.get(sessionId);
  const query = session?.query || fallbackQuery;
  if (!query) return null;

  const nextOffset = (session?.offset || 0) + 35;
  const newResults = await searchFederatedGifs(query, { offset: nextOffset });

  if (newResults && newResults.length > 0) {
    if (!session) {
      session = {
        id: sessionId,
        query,
        results: newResults,
        index: 0,
        offset: nextOffset,
        createdAt: Date.now()
      };
    } else {
      session.results = newResults;
      session.index = 0;
      session.offset = nextOffset;
      session.createdAt = Date.now();
    }
    gifSessions.set(sessionId, session);
    return session;
  }
  return session;
}

/**
 * Scans message component text to extract the original search query
 */
export function extractQueryFromGifMessage(message) {
  if (!message) return null;
  if (typeof message.content === 'string') {
    const m = message.content.match(/\*\*Query:\*\*\s*`([^`]+)`/i);
    if (m) return m[1];
  }
  const scan = (comps) => {
    if (!Array.isArray(comps)) return null;
    for (const c of comps) {
      if (typeof c.content === 'string') {
        const m = c.content.match(/\*\*Query:\*\*\s*`([^`]+)`/i);
        if (m) return m[1];
      }
      if (c.components) {
        const res = scan(c.components);
        if (res) return res;
      }
    }
    return null;
  };
  return scan(message.components);
}

/**
 * Builds the interactive accent borderless Components V2 container payload
 */
export function buildGifResultPayload(sessionId, index = 0) {
  const session = gifSessions.get(sessionId);
  if (!session || !session.results || session.results.length === 0) {
    return {
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} GIF Session Expired | ${WARN_EMOJI}\n> -# Please execute a new \`!gif <query>\` search to generate fresh results.`
            }
          ]
        }
      ],
      flags: MessageFlags.IsComponentsV2
    };
  }

  const total = session.results.length;
  const clampedIndex = (index % total + total) % total;
  session.index = clampedIndex;
  const current = session.results[clampedIndex];

  const prevIndex = (clampedIndex - 1 + total) % total;
  const nextIndex = (clampedIndex + 1) % total;

  const safeUrl = (current.sourceUrl && current.sourceUrl.startsWith('http')) 
    ? current.sourceUrl 
    : current.image;

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`gif:prev:${sessionId}:${prevIndex}`)
      .setLabel('Prev')
      .setEmoji(NAV_EMOJI_IDS.PREV)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(total <= 1),
    new ButtonBuilder()
      .setCustomId(`gif:next:${sessionId}:${nextIndex}`)
      .setLabel('Next')
      .setEmoji(NAV_EMOJI_IDS.NEXT)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(total <= 1),
    new ButtonBuilder()
      .setCustomId(`gif:rand:${sessionId}`)
      .setLabel('Random')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(total <= 1),
    new ButtonBuilder()
      .setCustomId(`gif:fresh:${sessionId}`)
      .setLabel('Fresh Batch')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setLabel('Direct GIF')
      .setStyle(ButtonStyle.Link)
      .setURL(current.image)
  );

  const cleanTitle = (current.title || session.query)
    .replace(/[`*_\r\n]/g, '')
    .trim()
    .substring(0, 90) || session.query;

  const sourceDomain = current.source || 'web';

  // Accent borderless CV2 container (type: 17, no accent_color)
  const container = {
    type: 17,
    components: [
      {
        type: 12,
        items: [{ media: { url: current.image } }]
      },
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} Federated GIF Matrix | ${TICK_EMOJI}\n` +
                 `> -# <a:uptime:1552608831060844575> **Query:** \`${session.query}\` \u00b7 **Result:** \`${clampedIndex + 1} of ${total}\`\n` +
                 `> -# ${BULLET_EMOJI} **Title:** \`${cleanTitle}\`\n` +
                 `> -# ${BULLET_EMOJI} **Provider / Source:** [${sourceDomain}](${safeUrl})`
      },
      { type: 14, divider: true },
      actionRow.toJSON(),
      { type: 14, divider: true },
      { 
        type: 10, 
        content: `-# **Athena Federated GIF Matrix \u00b7 KLIPY \u00b7 Tenor \u00b7 GIPHY \u00b7 OtakuGifs**` 
      }
    ]
  };

  return sanitizeCV2Payload({
    components: [container],
    flags: MessageFlags.IsComponentsV2
  });
}
