import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

// Cache for active image search sessions (sessionId -> session)
export const imageSessions = new Map();

// Session expiry cleaner (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of imageSessions.entries()) {
    if (now - s.createdAt > 45 * 60 * 1000) {
      imageSessions.delete(id);
    }
  }
}, 10 * 60 * 1000);

/**
 * Generates clean alphanumeric session IDs without colons or underscores
 */
export function generateSessionId() {
  return 's' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * Fisher-Yates shuffle algorithm for rich image variety
 */
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Unescapes HTML and XML entities
 */
function unescapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Normalizes and formats Bing/Edge CDN URLs for Discord media proxy compatibility
 */
function formatBingCdnUrl(rawTurl, rawMurl) {
  const cleanTurl = unescapeHtml(rawTurl || '');
  if (!cleanTurl) return unescapeHtml(rawMurl || '');

  const idMatch = cleanTurl.match(/[?&]id=([^&]+)/i) || cleanTurl.match(/\/th\/id\/([^?&]+)/i);
  if (idMatch && idMatch[1]) {
    const imgId = idMatch[1];
    if (imgId.startsWith('OIP.')) {
      return `https://th.bing.com/th/id/${imgId}?w=1280&h=960&c=7&rs=1&p=0`;
    }
    const separator = cleanTurl.includes('?') ? '&' : '?';
    return `${cleanTurl}${separator}w=1280&h=960`;
  }

  return cleanTurl;
}

/**
 * Searches the web for real high-resolution images across Bing, DuckDuckGo, and Wikimedia
 */
export async function searchWebImages(query, options = {}) {
  const cleanQuery = (typeof query === 'string' ? query : '').trim();
  if (!cleanQuery) return [];

  const offset = typeof options === 'number' ? 0 : (options.offset || 0);
  const shuffle = typeof options === 'number' ? true : (options.shuffle ?? true);
  const limit = typeof options === 'number' ? options : (options.limit || 70);

  const results = [];
  const seenUrls = new Set();

  const addResult = (item) => {
    if (!item || !item.image || typeof item.image !== 'string') return;
    if (!item.image.startsWith('http://') && !item.image.startsWith('https://')) return;
    if (item.image.endsWith('.svg') || item.image.endsWith('.ogg')) return;
    if (seenUrls.has(item.image)) return;
    seenUrls.add(item.image);
    results.push(item);
  };

  // Primary: Bing Images Async (High-resolution, fast, paginated via first=offset)
  try {
    const fetchBingPage = async (firstIdx, count = 35) => {
      const url = `https://www.bing.com/images/async?q=${encodeURIComponent(cleanQuery)}&first=${firstIdx}&count=${count}&mmasync=1`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(6000)
      }).catch(() => null);

      if (!res || !res.ok) return [];
      const html = await res.text();
      const matches = [...html.matchAll(/class="iusc"[^>]*\s+m="([^"]+)"/g)];
      const pageItems = [];
      for (const m of matches) {
        try {
          const raw = m[1].replace(/&quot;/g, '"');
          const data = JSON.parse(raw);
          if (data.murl || data.turl) {
            let domain = 'web';
            try {
              domain = new URL(data.purl || data.murl || 'https://bing.com').hostname.replace(/^www\./, '');
            } catch {}

            const unescapedMurl = unescapeHtml(data.murl || '');
            const unescapedTurl = unescapeHtml(data.turl || '');
            const displayImage = formatBingCdnUrl(unescapedTurl, unescapedMurl);

            pageItems.push({
              title: unescapeHtml(data.t || cleanQuery).replace(/<[^>]*>/g, '').trim(),
              image: displayImage,
              originalImage: unescapedMurl || displayImage,
              thumbnail: unescapedTurl || displayImage,
              url: unescapeHtml(data.purl || data.murl || displayImage),
              source: domain
            });
          }
        } catch {}
      }
      return pageItems;
    };

    const [b1, b2] = await Promise.all([
      fetchBingPage(offset, 40),
      fetchBingPage(offset + 40, 40)
    ]);

    for (const item of [...b1, ...b2]) {
      addResult(item);
    }
  } catch (err) {
    console.error('[ImageSearch] Bing async error:', err);
  }

  // Secondary Fallback: DuckDuckGo High-Resolution Image Engine
  if (results.length < 10) {
    try {
      const tokenRes = await fetch('https://duckduckgo.com/?q=' + encodeURIComponent(cleanQuery), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(4000)
      }).catch(() => null);

      if (tokenRes && tokenRes.ok) {
        const html = await tokenRes.text();
        const vqd = (html.match(/vqd=([\d-]+)/) || html.match(/vqd=([a-zA-Z0-9_-]+)/))?.[1];
        if (vqd) {
          const imgUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(cleanQuery)}&vqd=${vqd}&f=,,,&s=${offset}`;
          const imgRes = await fetch(imgUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Referer': 'https://duckduckgo.com/'
            },
            signal: AbortSignal.timeout(5000)
          }).catch(() => null);

          if (imgRes && imgRes.ok) {
            const data = await imgRes.json().catch(() => null);
            if (data && Array.isArray(data.results)) {
              for (const r of data.results) {
                let domain = 'web';
                try {
                  domain = new URL(r.url || 'https://duckduckgo.com').hostname.replace(/^www\./, '');
                } catch {}

                const unescapedThumb = unescapeHtml(r.thumbnail || '');
                const unescapedImg = unescapeHtml(r.image || '');
                const displayImage = formatBingCdnUrl(unescapedThumb, unescapedImg);

                addResult({
                  title: unescapeHtml(r.title || cleanQuery).trim(),
                  image: displayImage,
                  originalImage: unescapedImg || displayImage,
                  thumbnail: unescapedThumb || displayImage,
                  url: unescapeHtml(r.url || r.image || displayImage),
                  source: domain
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[ImageSearch] DDG error:', err);
    }
  }

  // Tertiary Fallback: Wikimedia Commons Open Media Search
  if (results.length < 5) {
    try {
      const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanQuery)}&gsrnamespace=6&gsrlimit=20&prop=imageinfo&iiprop=url|size&format=json`;
      const wikiRes = await fetch(wikiUrl, {
        headers: { 'User-Agent': 'AthenaPrimeBot/1.0 (https://github.com/GwenStacy-cell/Athena-prime)' },
        signal: AbortSignal.timeout(5000)
      }).catch(() => null);
      if (wikiRes && wikiRes.ok) {
        const data = await wikiRes.json().catch(() => null);
        const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
        for (const p of pages) {
          const info = p.imageinfo?.[0];
          if (info && info.url) {
            addResult({
              title: (p.title || cleanQuery).replace(/^File:/i, '').trim(),
              image: info.url,
              originalImage: info.url,
              thumbnail: info.thumburl || info.url,
              url: info.descriptionurl || info.url,
              source: 'wikimedia.org'
            });
          }
        }
      }
    } catch (err) {
      console.error('[ImageSearch] Wikimedia error:', err);
    }
  }

  let finalResults = results.slice(0, limit);
  if (shuffle && finalResults.length > 2) {
    finalResults = shuffleArray(finalResults);
  }
  return finalResults;
}

/**
 * Creates an image search session
 */
export function createSearchSession(query, results, offset = 0) {
  const sessionId = generateSessionId();
  imageSessions.set(sessionId, {
    id: sessionId,
    query,
    results,
    index: 0,
    offset,
    createdAt: Date.now()
  });
  return sessionId;
}

/**
 * Gets active session or seamlessly recovers from fallback query if expired/lost
 */
export async function getOrRecoverSession(sessionId, fallbackQuery) {
  let session = imageSessions.get(sessionId);
  if (!session && fallbackQuery) {
    const results = await searchWebImages(fallbackQuery, { offset: 0, shuffle: true });
    if (results && results.length > 0) {
      session = {
        id: sessionId,
        query: fallbackQuery,
        results,
        index: 0,
        offset: 0,
        createdAt: Date.now()
      };
      imageSessions.set(sessionId, session);
    }
  }
  return session;
}

/**
 * Fetches a brand new batch of pictures for the session using an advanced offset
 */
export async function fetchFreshBatchForSession(sessionId, query) {
  let session = imageSessions.get(sessionId);
  const targetQuery = query || session?.query;
  if (!targetQuery) return null;

  const currentOffset = session ? (session.offset || 0) + 70 : 70;
  const newResults = await searchWebImages(targetQuery, { offset: currentOffset, shuffle: true });

  if (newResults && newResults.length > 0) {
    if (!session) {
      session = {
        id: sessionId,
        query: targetQuery,
        results: newResults,
        index: 0,
        offset: currentOffset,
        createdAt: Date.now()
      };
      imageSessions.set(sessionId, session);
    } else {
      session.results = newResults;
      session.index = 0;
      session.offset = currentOffset;
      session.createdAt = Date.now();
    }
    return session;
  } else if (session && session.results.length > 0) {
    // If no new offset results, reshuffle existing pool
    session.results = shuffleArray(session.results);
    session.index = 0;
    return session;
  }
  return null;
}

/**
 * Extracts query from a Discord Components V2 message
 */
export function extractQueryFromMessage(message) {
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
 * Builds the interactive Discord Components V2 card for a specific search result index
 */
export function buildImageResultPayload(sessionId, index = 0) {
  const session = imageSessions.get(sessionId);
  if (!session || !session.results || session.results.length === 0) {
    return {
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## Image Search Session Expired | <a:atheNATICK:1557841381630681106>\n> -# Please execute a new \`!image <query>\` search.`
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

  const safeUrl = (current.url && current.url.startsWith('http'))
    ? current.url
    : ((current.originalImage && current.originalImage.startsWith('http')) ? current.originalImage : current.image);

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`img:prev:${sessionId}:${prevIndex}`)
      .setLabel('Prev')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(total <= 1),
    new ButtonBuilder()
      .setCustomId(`img:next:${sessionId}:${nextIndex}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(total <= 1),
    new ButtonBuilder()
      .setCustomId(`img:rand:${sessionId}`)
      .setLabel('Random')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(total <= 1),
    new ButtonBuilder()
      .setCustomId(`img:fresh:${sessionId}`)
      .setLabel('Fresh Batch')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setLabel('View Source')
      .setStyle(ButtonStyle.Link)
      .setURL(safeUrl)
  );

  const cleanTitle = (current.title || session.query)
    .replace(/[`*_\r\n]/g, '')
    .trim()
    .substring(0, 100);

  const sourceDomain = current.source || 'web';

  const container = {
    type: 17,
    components: [
      {
        type: 12,
        items: [{ media: { url: current.image } }]
      },
      {
        type: 10,
        content: `## Web Image Retrieval | <a:atheNATICK:1557841381630681106>\n` +
                 `> -# <a:uptime:1552608831060844575> **Query:** \`${session.query}\` • **Result:** \`${clampedIndex + 1} of ${total}\`\n` +
                 `> -# • **Title:** \`${cleanTitle}\`\n` +
                 `> -# • **Source Domain:** [${sourceDomain}](${safeUrl})`
      },
      { type: 14, divider: true },
      actionRow.toJSON(),
      { type: 14, divider: true },
      { type: 10, content: `-# **Athena Prime Visual Intelligence Engine \u2022 Live Web Search**` }
    ]
  };

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}
