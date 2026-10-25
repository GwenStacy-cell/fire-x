import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

// Cache for active image search sessions (sessionId -> session)
export const imageSessions = new Map();

// Session expiry cleaner (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of imageSessions.entries()) {
    if (now - s.createdAt > 30 * 60 * 1000) {
      imageSessions.delete(id);
    }
  }
}, 10 * 60 * 1000);

/**
 * Searches the web for real high-resolution images across DuckDuckGo and fallbacks
 */
export async function searchWebImages(query, limit = 25) {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) return [];

  // Primary: DuckDuckGo High-Resolution Image Engine
  try {
    const tokenController = new AbortController();
    const tokenTimeout = setTimeout(() => tokenController.abort(), 4000);
    const tokenRes = await fetch('https://duckduckgo.com/?q=' + encodeURIComponent(cleanQuery), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      signal: tokenController.signal
    }).catch(() => null);
    clearTimeout(tokenTimeout);

    if (tokenRes && tokenRes.ok) {
      const html = await tokenRes.text();
      const vqdMatch = html.match(/vqd=([\d-]+)/) || html.match(/vqd=([a-zA-Z0-9_-]+)/);
      const vqd = vqdMatch ? vqdMatch[1] : null;

      if (vqd) {
        const imgController = new AbortController();
        const imgTimeout = setTimeout(() => imgController.abort(), 5000);
        const imgUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(cleanQuery)}&vqd=${vqd}&f=,,,`;
        const imgRes = await fetch(imgUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Referer': 'https://duckduckgo.com/'
          },
          signal: imgController.signal
        }).catch(() => null);
        clearTimeout(imgTimeout);

        if (imgRes && imgRes.ok) {
          const data = await imgRes.json().catch(() => null);
          if (data && Array.isArray(data.results) && data.results.length > 0) {
            return data.results.slice(0, limit).map(r => {
              let domain = 'web';
              try {
                domain = new URL(r.url || 'https://google.com').hostname.replace(/^www\./, '');
              } catch {}
              return {
                title: r.title || cleanQuery,
                image: r.image,
                thumbnail: r.thumbnail || r.image,
                url: r.url || r.image,
                width: r.width || 0,
                height: r.height || 0,
                source: domain
              };
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[ImageSearch] DDG error:', err);
  }

  // Secondary Fallback: Wikimedia Commons Open Media Search
  try {
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanQuery)}&gsrnamespace=6&gsrlimit=15&prop=imageinfo&iiprop=url|size&format=json`;
    const wikiRes = await fetch(wikiUrl, {
      headers: { 'User-Agent': 'AthenaPrimeBot/1.0 (https://github.com/GwenStacy-cell/Athena-prime)' }
    }).catch(() => null);
    if (wikiRes && wikiRes.ok) {
      const data = await wikiRes.json().catch(() => null);
      const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
      const results = [];
      for (const p of pages) {
        const info = p.imageinfo?.[0];
        if (info && info.url && !info.url.endsWith('.svg') && !info.url.endsWith('.ogg')) {
          results.push({
            title: (p.title || cleanQuery).replace(/^File:/i, ''),
            image: info.url,
            thumbnail: info.thumburl || info.url,
            url: info.descriptionurl || info.url,
            width: info.width || 0,
            height: info.height || 0,
            source: 'wikimedia.org'
          });
        }
      }
      if (results.length > 0) return results;
    }
  } catch (err) {
    console.error('[ImageSearch] Wikimedia error:', err);
  }

  return [];
}

/**
 * Creates or retrieves an image search session
 */
export function createSearchSession(query, results) {
  const sessionId = 'img_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  imageSessions.set(sessionId, {
    query,
    results,
    index: 0,
    createdAt: Date.now()
  });
  return sessionId;
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

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`img_prev_${sessionId}_${prevIndex}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(total <= 1),
    new ButtonBuilder()
      .setCustomId(`img_next_${sessionId}_${nextIndex}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(total <= 1),
    new ButtonBuilder()
      .setCustomId(`img_rand_${sessionId}`)
      .setLabel('🎲 Random')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(total <= 1),
    new ButtonBuilder()
      .setLabel('View Source')
      .setStyle(ButtonStyle.Link)
      .setURL(current.url && current.url.startsWith('http') ? current.url : current.image)
  );

  const cleanTitle = (current.title || session.query).substring(0, 100);

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
                 `> -# • **Source Domain:** [${current.source}](${current.url})`
      },
      { type: 14, divider: true },
      actionRow.toJSON(),
      { type: 14, divider: true },
      { type: 10, content: `-# **Athena Prime Visual Intelligence Engine \u2022 Live Web Search**` }
    ]
  };

  return {
    components: [container],
    embeds: [
      {
        image: { url: current.image },
        color: 0x00f0ff
      }
    ],
    flags: MessageFlags.IsComponentsV2
  };
}
