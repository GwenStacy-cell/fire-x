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
}, 10 * 60 * 1000).unref();

// Known anime reaction action keywords and plurals mapping
export const ANIME_ACTION_MAP = {
  'punch': 'punch', 'punches': 'punch',
  'hug': 'hug', 'hugs': 'hug',
  'slap': 'slap', 'slaps': 'slap',
  'kiss': 'kiss', 'kisses': 'kiss',
  'pat': 'pat', 'pats': 'pat',
  'cuddle': 'cuddle', 'cuddles': 'cuddle',
  'dance': 'dance', 'dances': 'dance',
  'cry': 'cry', 'cries': 'cry',
  'smile': 'smile', 'smiles': 'smile',
  'laugh': 'laugh', 'laughs': 'laugh',
  'blush': 'blush', 'blushes': 'blush',
  'wink': 'wink', 'winks': 'wink',
  'bite': 'bite', 'bites': 'bite',
  'poke': 'poke', 'pokes': 'poke',
  'wave': 'wave', 'waves': 'wave',
  'bonk': 'bonk', 'bonks': 'bonk',
  'tickle': 'tickle', 'tickles': 'tickle',
  'highfive': 'highfive', 'highfives': 'highfive',
  'handhold': 'handhold', 'handholds': 'handhold',
  'sleep': 'sleep', 'sleeps': 'sleep',
  'nom': 'nom', 'noms': 'nom',
  'yeet': 'yeet', 'yeets': 'yeet',
  'smug': 'smug',
  'pout': 'pout', 'pouts': 'pout',
  'shrug': 'shrug', 'shrugs': 'shrug'
};

const ANIME_ACTIONS = new Set(Object.keys(ANIME_ACTION_MAP));

// Action verb conjugation dictionary for expressive mentions
export const VERB_CONJUGATIONS = {
  'punch': 'punches', 'punches': 'punches',
  'hug': 'hugs', 'hugs': 'hugs',
  'slap': 'slaps', 'slaps': 'slaps',
  'kiss': 'kisses', 'kisses': 'kisses',
  'kick': 'kicks', 'kicks': 'kicks',
  'pat': 'pats', 'pats': 'pats',
  'cuddle': 'cuddles', 'cuddles': 'cuddles',
  'bite': 'bites', 'bites': 'bites',
  'poke': 'pokes', 'pokes': 'pokes',
  'bonk': 'bonks', 'bonks': 'bonks',
  'tickle': 'tickles', 'tickles': 'tickles',
  'highfive': 'highfives', 'highfives': 'highfives',
  'headpat': 'headpats', 'headpats': 'headpats',
  'yeet': 'yeets', 'yeets': 'yeets',
  'kill': 'kills', 'kills': 'kills',
  'shoot': 'shoots', 'shoots': 'shoots',
  'feed': 'feeds', 'feeds': 'feeds',
  'smooch': 'smooches', 'smooches': 'smooches',
  'nom': 'noms on', 'noms': 'noms on',
  'glare': 'glares at', 'glares': 'glares at',
  'spank': 'spanks', 'spanks': 'spanks',
  'tease': 'teases', 'teases': 'teases',
  'chase': 'chases', 'chase': 'chases',
  'wave': 'waves at', 'waves': 'waves at',
  'dance': 'dances with', 'dances': 'dances with',
  'laugh': 'laughs at', 'laughs': 'laughs at',
  'smile': 'smiles at', 'smiles': 'smiles at',
  'stare': 'stares at', 'stares': 'stares at'
};

/**
 * Parses user input to extract target mentions, author, and formatted action headline
 */
export function parseGifRequest(rawContent, author, mentionsList = []) {
  let targetUser = null;
  const mentionsArr = mentionsList && typeof mentionsList.values === 'function' 
    ? Array.from(mentionsList.values()) 
    : (Array.isArray(mentionsList) ? mentionsList : []);

  const mentionMatches = [...String(rawContent || '').matchAll(/<@!?(\d+)>/g)];
  if (mentionMatches.length > 0) {
    const matchedId = mentionMatches[0][1];
    targetUser = mentionsArr.find(u => u && u.id === matchedId) || { id: matchedId };
  }

  // Remove mention syntaxes (<@123...>, <@!123...>, <@&123...>, <#123...>)
  let cleanText = String(rawContent || '')
    .replace(/<@!?\d+>/g, '')
    .replace(/<@&\d+>/g, '')
    .replace(/<#\d+>/g, '')
    .trim();

  // If no target mention found yet in text, but explicit mentionsArr passed (e.g. slash target option)
  if (!targetUser && mentionsArr.length > 0) {
    targetUser = mentionsArr.find(u => u && u.id !== author?.id) || mentionsArr[0];
  }

  // If still no target mention found yet, look for raw snowflake
  if (!targetUser) {
    const snowflakeMatch = cleanText.match(/\b\d{17,20}\b/);
    if (snowflakeMatch) {
      targetUser = { id: snowflakeMatch[0] };
      cleanText = cleanText.replace(snowflakeMatch[0], '').trim();
    }
  }

  cleanText = cleanText.replace(/\s+/g, ' ').trim();

  let actionHeadline = '';
  let searchQuery = cleanText;

  if (targetUser && author) {
    if (!cleanText) {
      actionHeadline = `<@${author.id}> interacts with <@${targetUser.id}>!`;
      searchQuery = 'anime wave';
    } else {
      const words = cleanText.split(' ');
      const firstWord = words[0].toLowerCase();
      const conjugated = VERB_CONJUGATIONS[firstWord] || (firstWord.endsWith('s') ? firstWord : firstWord + 's');
      let rest = words.slice(1).join(' ').trim();

      // Deduplicate prepositions (e.g. 'dances with' + 'with' -> 'dances with')
      if (rest) {
        const parts = conjugated.split(' ');
        if (parts.length > 1) {
          const prep = parts.slice(1).join(' ');
          if (rest.toLowerCase().startsWith(prep)) {
            rest = rest.slice(prep.length).trim();
          }
        }
      }

      const phrase = rest ? `${conjugated} ${rest}` : conjugated;
      actionHeadline = `<@${author.id}> ${phrase} <@${targetUser.id}>!`;

      const baseAction = ANIME_ACTION_MAP[firstWord] || firstWord.replace(/es$|s$/, '');
      if (ANIME_ACTION_MAP[baseAction]) {
        searchQuery = `anime ${baseAction}`;
      } else {
        searchQuery = cleanText;
      }
    }
  } else if (author) {
    if (!cleanText) {
      cleanText = 'vibing';
    }
    const words = cleanText.split(' ');
    const firstWord = words[0].toLowerCase();
    if (['is', 'am', 'was'].includes(firstWord)) {
      actionHeadline = `<@${author.id}> ${cleanText}!`;
      searchQuery = words.slice(1).join(' ').trim() || cleanText;
    } else if (VERB_CONJUGATIONS[firstWord] || cleanText.endsWith('ing') || cleanText.endsWith('s')) {
      const phrase = VERB_CONJUGATIONS[firstWord] ? [VERB_CONJUGATIONS[firstWord], ...words.slice(1)].join(' ') : cleanText;
      actionHeadline = `<@${author.id}> ${phrase}!`;
      searchQuery = cleanText;
    } else {
      actionHeadline = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);
      searchQuery = cleanText;
    }
  } else {
    actionHeadline = cleanText ? (cleanText.charAt(0).toUpperCase() + cleanText.slice(1)) : 'GIF Matrix';
    searchQuery = cleanText;
  }

  return { targetUser, actionHeadline, cleanQuery: cleanText || searchQuery, searchQuery };
}

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
  let matchedAction = null;
  for (const w of words) {
    if (ANIME_ACTION_MAP[w]) {
      matchedAction = ANIME_ACTION_MAP[w];
      break;
    }
  }
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
export function createGifSession(query, results, index = 0, metadata = {}) {
  const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  gifSessions.set(sessionId, {
    id: sessionId,
    query,
    results,
    index,
    offset: 0,
    createdAt: Date.now(),
    ...metadata
  });
  return sessionId;
}

/**
 * Retrieves an existing session or transparently recovers one from message metadata
 */
export async function getOrRecoverGifSession(sessionId, fallbackQuery = null, metadata = {}) {
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
        createdAt: Date.now(),
        ...metadata
      };
      gifSessions.set(sessionId, session);
    }
  }
  return session;
}

/**
 * Fetches a brand new batch of GIFs with advanced offset for 'Fresh Batch'
 */
export async function fetchFreshBatchForGifSession(sessionId, fallbackQuery = null, metadata = {}) {
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
        createdAt: Date.now(),
        ...metadata
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
 * Scans message components to extract metadata (headline, query, author, target) for recovery
 */
export function extractMetadataFromGifMessage(message) {
  if (!message) return {};
  const meta = {};
  const scan = (comps) => {
    if (!Array.isArray(comps)) return;
    for (const c of comps) {
      if (typeof c.content === 'string') {
        const queryMatch = c.content.match(/\*\*Query:\*\*\s*`([^`]+)`/i);
        if (queryMatch) meta.query = queryMatch[1];

        const headlineMatch = c.content.match(/#\s*(?:<a:[^:]+:\d+>\s*)?<a:ninja_bullet:1567038601668337705>\s*(.*?)\s*<a:ninja_bullet_rtl:1567038652687712317>/);
        if (headlineMatch) meta.actionHeadline = headlineMatch[1].trim();

        const actionMatch = c.content.match(/\*\*Action:\*\*\s*<@!?(\d+)>\s*➔\s*<@!?(\d+)>/);
        if (actionMatch) {
          meta.authorId = actionMatch[1];
          meta.targetId = actionMatch[2];
        }
      }
      if (c.components) scan(c.components);
    }
  };
  scan(message.components);
  return meta;
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
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(total <= 1),
    new ButtonBuilder()
      .setCustomId(`gif:next:${sessionId}:${nextIndex}`)
      .setLabel('Next')
      .setEmoji(NAV_EMOJI_IDS.NEXT)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(total <= 1),
    new ButtonBuilder()
      .setCustomId(`gif:rand:${sessionId}`)
      .setLabel('Random')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(total <= 1),
    new ButtonBuilder()
      .setCustomId(`gif:fresh:${sessionId}`)
      .setLabel('Fresh Batch')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setLabel('Direct GIF')
      .setStyle(ButtonStyle.Link)
      .setURL(current.image || current.url || safeUrl || 'https://discord.com')
  );

  const cleanTitle = (current.title || session.query)
    .replace(/[`*_\r\n]/g, '')
    .trim()
    .substring(0, 90) || session.query;

  const sourceDomain = current.source || 'web';

  const headerText = session.actionHeadline
    ? `# <a:ninja_bullet:1567038601668337705> ${session.actionHeadline} <a:ninja_bullet_rtl:1567038652687712317>`
    : `# ${getRandomHeadingGlyph()} Federated GIF Matrix | ${TICK_EMOJI}`;

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
        content: `${headerText}\n\n` +
                 (session.targetId ? `> -# <a:uptime:1552608831060844575> **Action:** <@${session.authorId}> ➔ <@${session.targetId}>\n` : '') +
                 `> -# <a:uptime:1552608831060844575> **Query:** \`${session.cleanQuery || session.query}\` · **Result:** \`${clampedIndex + 1} of ${total}\`\n` +
                 `> -# <a:target_blink:1565667466984554588> **Title:** \`${cleanTitle}\`\n` +
                 `> -# <a:target_blink:1565667466984554588> **Provider / Source:** [${sourceDomain}](${safeUrl})`
      },
      { type: 14, divider: true },
      actionRow.toJSON(),
      { type: 14, divider: true },
      { 
        type: 10, 
        content: `-# **Athena Federated GIF Matrix · KLIPY · Tenor · GIPHY · OtakuGifs**` 
      }
    ]
  };

  return sanitizeCV2Payload({
    components: [container],
    flags: MessageFlags.IsComponentsV2
  });
}
