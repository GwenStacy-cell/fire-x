import { parentPort, isMainThread } from 'node:worker_threads';
import { generatePingGraph } from './graph.js';
import { generateQuoteBuffer } from './canvasQuote.js';
import { generateDashboard, generateTimeoutCard, generateAutomodCard } from './dashboardCanvas.js';
import { generateGlobalActionCard } from './canvasActionLog.js';
import { renderSingleStockCard } from './stockMarket.js';
import { generateCommandStatusBanner, generateAthenaClassicRankCardFromData } from './canvasCards.js';
import { generateVoiceAnalyticsMatrix } from './voiceAnalyticsCanvas.js';

if (!isMainThread && parentPort) {
  const sendBufferResult = (id, buf, extra = null) => {
    if (!buf) {
      parentPort.postMessage({ id, ok: true, result: null });
      return;
    }
    const copy = Uint8Array.from(buf);
    if (extra) {
      parentPort.postMessage({ id, ok: true, result: { ...extra, data: copy } }, [copy.buffer]);
    } else {
      parentPort.postMessage({ id, ok: true, result: copy }, [copy.buffer]);
    }
  };

  parentPort.on('message', async (msg) => {
    const { id, task, args = [] } = msg || {};
    if (typeof id !== 'number') return;

    try {
      switch (task) {
        case '__ping__':
          parentPort.postMessage({ id, ok: true, result: true });
          return;

        case 'pingGraph': {
          const buf = await generatePingGraph(...args);
          sendBufferResult(id, buf);
          return;
        }

        case 'quoteBuffer': {
          const buf = await generateQuoteBuffer(...args);
          sendBufferResult(id, buf);
          return;
        }

        case 'dashboard': {
          const buf = await generateDashboard(...args);
          sendBufferResult(id, buf);
          return;
        }

        case 'timeoutCard': {
          const buf = await generateTimeoutCard(...args);
          sendBufferResult(id, buf);
          return;
        }

        case 'automodCard': {
          const buf = await generateAutomodCard(...args);
          sendBufferResult(id, buf);
          return;
        }

        case 'globalActionCard': {
          const att = await generateGlobalActionCard(...args);
          if (!att) {
            parentPort.postMessage({ id, ok: true, result: null });
            return;
          }
          const rawBuf = Buffer.isBuffer(att) ? att : att.attachment;
          const name = att.name || 'global_ban_log.png';
          sendBufferResult(id, rawBuf, { name });
          return;
        }

        case 'singleStockCard': {
          const buf = await renderSingleStockCard(...args);
          sendBufferResult(id, buf);
          return;
        }

        case 'commandStatusBanner': {
          const att = await generateCommandStatusBanner(...args);
          if (!att) {
            parentPort.postMessage({ id, ok: true, result: null });
            return;
          }
          const rawBuf = Buffer.isBuffer(att) ? att : att.attachment;
          const name = att.name || 'status_banner.png';
          sendBufferResult(id, rawBuf, { name });
          return;
        }

        case 'classicRankCard': {
          const buf = await generateAthenaClassicRankCardFromData(...args);
          sendBufferResult(id, buf);
          return;
        }

        case 'voiceAnalyticsMatrix': {
          const buf = await generateVoiceAnalyticsMatrix(...args);
          sendBufferResult(id, buf);
          return;
        }

        default:
          parentPort.postMessage({ id, ok: false, error: `Unknown canvas task: ${task}` });
      }
    } catch (err) {
      parentPort.postMessage({ id, ok: false, error: err?.message || 'worker_task_failed' });
    }
  });
}
