import express from 'express';
import { XMLParser } from 'fast-xml-parser';
import db from '../database.js';
import chalk from 'chalk';
import { sendYouTubeNotification } from './youtubeNotifier.js';

const app = express();
const xmlParser = new XMLParser({ ignoreAttributes: false });

let clientRef = null;

export function initWebSub(client) {
  clientRef = client;
  const port = process.env.WEBSUB_PORT || 3000;
  
  // YouTube sends WebSub payloads as application/atom+xml
  app.use(express.text({ type: ['application/atom+xml', 'application/xml', 'text/xml'] }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/youtube/webhook', (req, res) => {
    // Handle YouTube's subscription verification challenge
    const mode = req.query['hub.mode'];
    const topic = req.query['hub.topic'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' || mode === 'unsubscribe') {
      console.log(chalk.green(`[WebSub] Verified ${mode} for topic: ${topic}`));
      return res.status(200).send(challenge);
    }
    
    return res.status(400).send('Bad Request');
  });

  app.post('/youtube/webhook', async (req, res) => {
    // Acknowledge receipt immediately to prevent YouTube retries
    res.status(200).send('OK');

    try {
      const xml = req.body;
      if (!xml) return;

      const jsonObj = xmlParser.parse(xml);
      if (!jsonObj || !jsonObj.feed) return;

      const feed = jsonObj.feed;
      if (feed['at:deleted-entry']) {
        // Ignored: Video was deleted
        return;
      }

      const entry = feed.entry;
      if (!entry) return; // Sometimes it's just an update without entry

      const videoId = entry['yt:videoId'];
      const channelId = entry['yt:channelId'];
      const title = entry.title;
      const author = entry.author?.name || 'Unknown Channel';
      const link = entry.link?.['@_href'] || `https://www.youtube.com/watch?v=${videoId}`;
      const published = entry.published;
      const thumbnail = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

      // Prevent processing duplicate pings
      if (!videoId || !channelId) return;

      console.log(chalk.blue(`[WebSub] Received push notification for channel ${channelId} (Video: ${videoId})`));

      await processWebSubNotification(channelId, {
        id: videoId,
        title,
        link,
        author,
        pubDate: published,
        thumbnail,
        channelName: author
      });

    } catch (err) {
      console.error('[WebSub] Error processing push notification:', err);
    }
  });

  app.listen(port, () => {
    console.log(chalk.green(`[WebSub] Server listening on port ${port}`));
  }).on('error', (err) => {
    console.warn(`[WebSub] Could not bind port ${port} (standalone mode):`, err.message);
  });
}

async function processWebSubNotification(channelId, latestVideo) {
  if (!clientRef) return;

  const guilds = Object.keys(db.cache.guilds || {});
  for (const guildId of guilds) {
    const notifiers = db.getYouTubeNotifiers(guildId);
    if (!notifiers || notifiers.length === 0) continue;
    
    const guild = clientRef.guilds.cache.get(guildId)
      || await clientRef.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;

    for (const notifier of notifiers) {
      if (notifier.youtubeId === channelId) {
        if (!notifier.recentVideoIds) {
          notifier.recentVideoIds = notifier.lastVideoId ? [notifier.lastVideoId] : [];
        }

        if (!notifier.recentVideoIds.includes(latestVideo.id)) {
          const sent = await sendYouTubeNotification(clientRef, guild, notifier, latestVideo, false);
          if (sent) {
            db.updateYouTubeNotifier(guildId, notifier.youtubeId, notifier.discordChannelId, latestVideo.id);
          }
        }
      }
    }
  }
}

/**
 * Send a Subscribe or Unsubscribe request to YouTube's PubSubHubbub Hub.
 */
export async function manageWebSubSubscription(channelId, mode = 'subscribe') {
  const baseUrl = process.env.WEBSUB_URL;
  if (!baseUrl) return false;

  const callbackUrl = `${baseUrl}/youtube/webhook`;
  const topic = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;

  try {
    const params = new URLSearchParams();
    params.append('hub.callback', callbackUrl);
    params.append('hub.topic', topic);
    params.append('hub.verify', 'async');
    params.append('hub.mode', mode);

    const response = await fetch('https://pubsubhubbub.appspot.com/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      console.error(`[WebSub] Hub returned error: ${response.status} ${response.statusText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[WebSub] Failed to send ${mode} request:`, error);
    return false;
  }
}
