import db from '../database.js';
import { fetchMarketOverview, renderMarketOverviewCard, buildMarketOverviewPayload, syncTrendingMarketSymbols } from './stockMarket.js';

let isRunning = false;

/**
 * Dispatches a daily stock market briefing to a specific channel
 */
export async function dispatchDailyBriefing(channel) {
  try {
    const overview = await fetchMarketOverview();
    const imageBuffer = renderMarketOverviewCard(overview);
    const payload = buildMarketOverviewPayload(overview, imageBuffer, true);
    await channel.send(payload);
    return true;
  } catch (err) {
    console.error(`[StockBroadcaster] Failed to send briefing to channel ${channel?.id}:`, err);
    return false;
  }
}

/**
 * Periodic background daemon checking for daily stock market posting
 */
export function startDailyStockBroadcaster(client) {
  if (isRunning) return;
  isRunning = true;

  // Proactively discover and sync trending & new stocks on startup
  syncTrendingMarketSymbols().catch(() => null);

  // Periodic discovery of new IPOs, active movers, and ticker changes every 2 hours
  setInterval(() => {
    syncTrendingMarketSymbols().catch(() => null);
  }, 2 * 60 * 60 * 1000);

  // Check every 60 seconds
  setInterval(async () => {
    try {
      const now = new Date();
      // Target time: 14:30 UTC (09:30 AM EST - US Market Open Bell)
      const currentUtcHours = now.getUTCHours();
      const currentUtcMinutes = now.getUTCMinutes();

      // Trigger window between 14:30 and 14:35 UTC
      if (currentUtcHours !== 14 || currentUtcMinutes < 30 || currentUtcMinutes > 35) {
        return;
      }

      const todayStr = now.toISOString().substring(0, 10);
      const configuredChannels = db.getAllStockChannels();

      for (const item of configuredChannels) {
        if (item.lastSent === todayStr) continue;

        const guild = client.guilds.cache.get(item.guildId);
        if (!guild) continue;

        // Fetch channel strictly by database ID
        const channel = guild.channels.cache.get(item.channelId) || await guild.channels.fetch(item.channelId).catch(() => null);
        if (!channel || typeof channel.send !== 'function') continue;

        const success = await dispatchDailyBriefing(channel);
        if (success) {
          db.setLastDailyStockSent(item.guildId, todayStr);
        }
      }
    } catch (e) {
      console.error('[StockBroadcaster] Error in daily broadcast cycle:', e);
    }
  }, 60 * 1000);
}
