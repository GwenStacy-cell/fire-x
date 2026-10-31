import * as cheerio from 'cheerio';
import Parser from 'rss-parser';
import db from '../database.js';
import { BULLET_EMOJI } from './emojis.js';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  }
});

/**
 * Resolves any YouTube URL, handle, or channel ID to full channel metadata.
 */
export async function resolveYouTubeChannel(input) {
  if (!input || typeof input !== 'string') return null;
  let url = input.trim();

  // 1. Direct channel ID format (UC...)
  if (/^UC[\w-]{22}$/.test(url)) {
    return {
      channelId: url,
      channelName: null,
      channelUrl: `https://www.youtube.com/channel/${url}`
    };
  }

  // 2. Direct @handle input
  if (url.startsWith('@')) {
    url = `https://www.youtube.com/${url}`;
  } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  try {
    const channelMatch = url.match(/\/channel\/(UC[\w-]{22})/);
    let directId = channelMatch ? channelMatch[1] : null;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      if (directId) {
        return {
          channelId: directId,
          channelName: null,
          channelUrl: `https://www.youtube.com/channel/${directId}`
        };
      }
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    let channelId = directId || $('meta[itemprop="channelId"]').attr('content');

    if (!channelId) {
      const ogUrl = $('meta[property="og:url"]').attr('content');
      if (ogUrl) {
        const ogMatch = ogUrl.match(/\/channel\/(UC[\w-]{22})/);
        if (ogMatch) channelId = ogMatch[1];
      }
    }

    if (!channelId) {
      const canonical = $('link[rel="canonical"]').attr('href');
      if (canonical) {
        const canMatch = canonical.match(/\/channel\/(UC[\w-]{22})/);
        if (canMatch) channelId = canMatch[1];
      }
    }

    if (!channelId) {
      const match = html.match(/"channelId":"(UC[\w-]{22})"/);
      if (match) channelId = match[1];
    }

    let channelName = $('meta[name="author"]').attr('content')
      || $('span[itemprop="author"] link[itemprop="name"]').attr('content')
      || $('link[itemprop="name"]').attr('content')
      || $('meta[property="og:title"]').attr('content')
      || $('meta[itemprop="name"]').attr('content')
      || $('title').text().replace(/ - YouTube$/, '').trim()
      || null;

    if (channelName === 'YouTube' || !channelName) channelName = null;

    if (!channelId) return null;

    // Fallback: Query RSS feed for authoritative channel name
    if (!channelName || channelName === 'Unknown Channel') {
      try {
        const feedRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (feedRes && feedRes.ok) {
          const xml = await feedRes.text();
          const titleMatch = xml.match(/<title>([^<]+)<\/title>/);
          if (titleMatch && titleMatch[1]) {
            channelName = titleMatch[1].trim();
          }
        }
      } catch (e) {}
    }

    return {
      channelId,
      channelName,
      channelUrl: `https://www.youtube.com/channel/${channelId}`
    };
  } catch (error) {
    console.error('[YouTube Notifier] Channel resolution error:', error.message);
    return null;
  }
}

/**
 * Backwards compatibility helper: returns channelId string.
 */
export async function resolveYouTubeChannelId(url) {
  const info = await resolveYouTubeChannel(url);
  return info ? info.channelId : null;
}

/**
 * Fetches the latest video from a YouTube channel's RSS feed.
 */
export async function getLatestVideo(channelId) {
  if (!channelId) return null;
  try {
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}&_=${Date.now()}`;
    let feed = null;
    try {
      feed = await parser.parseURL(feedUrl);
    } catch {
      const res = await fetch(feedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      }).catch(() => null);
      if (res && res.ok) {
        const xml = await res.text();
        feed = await parser.parseString(xml).catch(() => null);
      }
    }
    
    if (feed && feed.items && feed.items.length > 0) {
      const latest = feed.items[0];
      const videoId = (latest.id || '').replace(/^yt:video:/, '');
      return {
        id: videoId,
        title: latest.title,
        link: latest.link || `https://www.youtube.com/watch?v=${videoId}`,
        author: latest.author || feed.title,
        pubDate: latest.pubDate || latest.isoDate,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        channelName: feed.title || latest.author
      };
    }

    if (feed && feed.title) {
      return {
        id: null,
        title: null,
        link: `https://www.youtube.com/channel/${channelId}`,
        author: feed.title,
        pubDate: null,
        thumbnail: null,
        channelName: feed.title
      };
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Dispatches a formatted notification to Discord.
 */
export async function sendYouTubeNotification(client, guild, notifier, video, isTest = false) {
  if (!guild || !notifier) return false;

  const channel = guild.channels.cache.get(notifier.discordChannelId)
    || await guild.channels.fetch(notifier.discordChannelId).catch(() => null);

  if (!channel) {
    console.warn(`[YouTube Notifier] Channel ${notifier.discordChannelId} not found in ${guild.id}`);
    return false;
  }

  const cfg = db.getGuildConfig(guild.id);
  const accentHex = cfg?.accentColor || '#ff0000';
  const accentInt = parseInt(String(accentHex).replace('#', ''), 16) || 0xff0000;

  const { EmbedBuilder } = await import('discord.js');
  const authorName = video.author || video.channelName || notifier.channelName || 'YouTube Creator';
  const videoTitle = video.title || 'New Upload Alert';
  const videoLink = video.link || (video.id ? `https://www.youtube.com/watch?v=${video.id}` : notifier.youtubeUrl);
  const videoThumb = video.thumbnail || (video.id ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` : null);

  const ytEmbed = new EmbedBuilder()
    .setColor(accentInt)
    .setAuthor({ 
      name: isTest ? `[TEST] Upload Alert: ${authorName}` : `New Upload from ${authorName}`, 
      iconURL: 'https://cdn.discordapp.com/emojis/1533383764250460241.webp?size=96&quality=lossless', 
      url: videoLink 
    })
    .setTitle(videoTitle)
    .setURL(videoLink)
    .setFooter({ text: isTest ? 'Athena Prime YouTube Notifier (Test Dispatch)' : 'Athena Prime YouTube Notifier' })
    .setTimestamp(video.pubDate ? new Date(video.pubDate) : new Date());

  if (videoThumb) {
    ytEmbed.setImage(videoThumb);
  }

  let content = notifier.customMessage || '';
  content = content.replace(/{url}/g, videoLink);
  content = content.replace(/{title}/g, videoTitle);
  content = content.replace(/{channel}/g, authorName);

  if (content === '') {
     content = `<:912969youtubelogo:1533383764250460241> **__${authorName}__ just uploaded a new video!**\n> -# <a:target_blink:1565667466984554588> **Watch now:** ${videoLink}`;
  } else {
     content = `<:912969youtubelogo:1533383764250460241> ${content}`;
  }

  try {
    await channel.send({ content: content, embeds: [ytEmbed] });
    return true;
  } catch (err) {
    console.error(`[YouTube Notifier] Failed to send message to channel ${channel.id}:`, err.message);
    return false;
  }
}

/**
 * Checks all active YouTube notifiers across all guilds.
 */
export async function checkAllYouTubeFeeds(client) {
  try {
    const guilds = Object.keys(db.cache.guilds || {});

    for (const guildId of guilds) {
      const notifiers = db.getYouTubeNotifiers(guildId);
      if (!notifiers || notifiers.length === 0) continue;

      const guild = client.guilds.cache.get(guildId)
        || await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;

      for (const notifier of notifiers) {
        try {
          const latestVideo = await getLatestVideo(notifier.youtubeId);
          if (!latestVideo) continue;

          // Auto-heal missing or 'Unknown Channel' titles in database
          if ((!notifier.channelName || notifier.channelName === 'Unknown Channel') && latestVideo.channelName) {
            notifier.channelName = latestVideo.channelName;
            db.save();
          }

          if (!latestVideo.id) continue;

          if (!notifier.recentVideoIds) {
            notifier.recentVideoIds = notifier.lastVideoId ? [notifier.lastVideoId] : [];
          }

          // Initial seeding: if lastVideoId was null, save current video so we don't spam backlogged videos
          if (!notifier.lastVideoId && notifier.recentVideoIds.length === 0) {
            notifier.lastVideoId = latestVideo.id;
            notifier.recentVideoIds = [latestVideo.id];
            db.save();
            continue;
          }

          // Check if this is a newly uploaded video
          if (!notifier.recentVideoIds.includes(latestVideo.id)) {
            console.log(`[YouTube Notifier] Detected new upload for ${notifier.channelName || notifier.youtubeId}: "${latestVideo.title}" (${latestVideo.id})`);
            
            const sent = await sendYouTubeNotification(client, guild, notifier, latestVideo, false);
            if (sent) {
              db.updateYouTubeNotifier(guildId, notifier.youtubeId, notifier.discordChannelId, latestVideo.id);
            }
          }
        } catch (err) {
          console.error(`[YouTube Notifier] Error checking channel ${notifier.youtubeId}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('[YouTube Notifier] Background Loop Error:', err.message);
  }
}

/**
 * Starts the YouTube notification polling loop.
 */
export function startYouTubeNotifier(client) {
  console.log('[YouTube Notifier] Starting YouTube video polling engine (30s interval)...');

  // Initial check 5 seconds after startup
  setTimeout(() => checkAllYouTubeFeeds(client), 5000);

  // Polling loop every 30 seconds
  setInterval(() => checkAllYouTubeFeeds(client), 30000);
}
