import fetch from 'node-fetch';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import db from '../database.js';
import { 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  UPTIME_EMOJI, 
  getRandomHeadingGlyph 
} from './emojis.js';
import { sanitizeCV2Payload } from '../cv2.js';

/**
 * Resolves a YouTube channel ID from a channel ID, user URL, or @handle
 */
export async function resolveYoutubeChannelId(input) {
  const clean = input.trim();
  if (/^UC[\w-]{22}$/.test(clean)) return clean;

  const handleMatch = clean.match(/@([\w.-]+)/);
  const targetUrl = handleMatch ? `https://www.youtube.com/@${handleMatch[1]}` : (clean.startsWith('http') ? clean : `https://www.youtube.com/@${clean}`);

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 4000
    });
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/channel_id=([a-zA-Z0-9_-]+)/) || html.match(/\"externalId\":\"([a-zA-Z0-9_-]+)\"/);
      if (m) return m[1];
    }
  } catch {}
  return clean;
}

/**
 * Checks for latest item from YouTube RSS
 */
export async function fetchLatestYoutubeVideo(channelId) {
  try {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const res = await fetch(url, { timeout: 4000 });
    if (!res.ok) return null;
    const xml = await res.text();

    const videoIdMatch = xml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    const titleMatch = xml.match(/<title>([^<]+)<\/title>/g);
    const authorMatch = xml.match(/<name>([^<]+)<\/name>/);

    if (videoIdMatch) {
      const videoId = videoIdMatch[1];
      const title = (titleMatch && titleMatch[1]) ? titleMatch[1].replace(/<\/?title>/g, '') : 'New Video';
      const author = authorMatch ? authorMatch[1] : 'YouTube Creator';
      return {
        id: videoId,
        title,
        author,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        platform: 'youtube'
      };
    }
  } catch {}
  return null;
}

/**
 * Checks for latest post from Reddit RSS
 */
export async function fetchLatestRedditPost(subreddit) {
  const cleanSub = subreddit.replace(/^r\//i, '').trim();
  try {
    const url = `https://www.reddit.com/r/${cleanSub}/new.rss`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      timeout: 4000
    });
    if (!res.ok) return null;
    const xml = await res.text();

    const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
    if (entryMatch) {
      const entry = entryMatch[1];
      const idMatch = entry.match(/<id>([^<]+)<\/id>/);
      const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
      const linkMatch = entry.match(/<link href="([^"]+)"/);
      const authorMatch = entry.match(/<name>([^<]+)<\/name>/);

      if (idMatch && titleMatch && linkMatch) {
        return {
          id: idMatch[1],
          title: titleMatch[1].replace(/&amp;/g, '&'),
          author: authorMatch ? authorMatch[1] : `r/${cleanSub}`,
          url: linkMatch[1],
          platform: 'reddit'
        };
      }
    }
  } catch {}
  return null;
}

/**
 * Builds the broadcast CV2 card payload
 */
export function buildWiretapBroadcastPayload(item) {
  const isYt = item.platform === 'youtube';
  const platformLabel = isYt ? 'YouTube Broadcast' : 'Reddit Wiretap';
  const buttonLabel = isYt ? 'Watch on YouTube' : 'Open on Reddit';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(buttonLabel)
      .setStyle(ButtonStyle.Link)
      .setURL(item.url)
  );

  const containerComps = [];

  if (item.thumbnail) {
    containerComps.push({
      type: 12,
      items: [{ media: { url: item.thumbnail } }]
    });
  }

  containerComps.push(
    {
      type: 10,
      content: `# ${getRandomHeadingGlyph()} ${platformLabel} | ${TICK_EMOJI}\n` +
               `> -# <a:uptime:1552608831060844575> New content posted by **${item.author}**!\n\n` +
               `${BULLET_EMOJI} **Title:** [${item.title}](${item.url})\n` +
               `${BULLET_EMOJI} **Platform:** \`${item.platform.toUpperCase()}\``
    },
    { type: 14, divider: true },
    row.toJSON(),
    { type: 14, divider: true },
    { type: 10, content: `-# **Athena Prime Intelligence Wiretap \u00b7 Live Social Broadcaster**` }
  );

  return sanitizeCV2Payload({
    components: [{ type: 17, components: containerComps }],
    flags: MessageFlags.IsComponentsV2
  });
}

/**
 * Background loop checking all active wiretaps across guilds
 */
export async function pollWiretaps(client) {
  const allGuilds = client.guilds.cache;
  for (const [guildId, guild] of allGuilds.entries()) {
    const list = db.getWiretaps(guildId);
    if (!list || list.length === 0) continue;

    for (const wt of list) {
      try {
        let latest = null;
        if (wt.platform === 'youtube') {
          latest = await fetchLatestYoutubeVideo(wt.target);
        } else if (wt.platform === 'reddit') {
          latest = await fetchLatestRedditPost(wt.target);
        }

        if (latest && latest.id && latest.id !== wt.lastId) {
          // New post detected!
          if (wt.lastId !== null) { // Don't spam upon initial creation
            const channel = guild.channels.cache.get(wt.channelId) || await guild.channels.fetch(wt.channelId).catch(() => null);
            if (channel && typeof channel.send === 'function') {
              const payload = buildWiretapBroadcastPayload(latest);
              await channel.send(payload).catch(() => {});
            }
          }
          db.updateWiretapLastId(guildId, wt.id, latest.id);
        }
      } catch (e) {
        // Continue loop
      }
    }
  }
}
