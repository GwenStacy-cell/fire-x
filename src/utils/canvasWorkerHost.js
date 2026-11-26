import { Worker, isMainThread } from 'node:worker_threads';

const WORKER_URL = new URL('./canvasWorkerTask.js', import.meta.url);
const TASK_TIMEOUT_MS = 12_000;

let worker = null;
let nextId = 1;
const pending = new Map(); // id -> { resolve, timer }

function rejectAllPending(reason) {
  for (const [id, entry] of pending.entries()) {
    clearTimeout(entry.timer);
    pending.delete(id);
    entry.resolve(null);
  }
  if (worker) {
    try { worker.unref(); } catch {}
  }
}

function getOrSpawnWorker() {
  if (!isMainThread) return null;
  if (worker) return worker;

  const w = new Worker(WORKER_URL);
  w.unref();

  w.on('message', (msg) => {
    if (!msg || typeof msg.id !== 'number') return;
    const entry = pending.get(msg.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(msg.id);
    if (pending.size === 0) {
      try { w.unref(); } catch {}
    }
    if (!msg.ok) {
      entry.resolve(null);
      return;
    }
    entry.resolve(msg.result);
  });

  w.on('error', () => {
    if (worker === w) worker = null;
    rejectAllPending('worker_error');
  });

  w.on('exit', () => {
    if (worker === w) worker = null;
    rejectAllPending('worker_exit');
  });

  worker = w;
  return worker;
}

export async function prewarmCanvasWorker() {
  if (!isMainThread) return false;
  return await runCanvasTask('__ping__', [], async () => true);
}

export async function runCanvasTask(task, args = [], fallbackFn = null) {
  if (!isMainThread) {
    return typeof fallbackFn === 'function' ? await fallbackFn() : null;
  }

  let w = null;
  try {
    w = getOrSpawnWorker();
  } catch {
    w = null;
  }

  if (!w) {
    return typeof fallbackFn === 'function' ? await fallbackFn() : null;
  }

  const id = nextId++;
  const workerRes = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      if (pending.size === 0) {
        try { w.unref(); } catch {}
      }
      resolve(null);
    }, TASK_TIMEOUT_MS);
    timer.unref?.();

    pending.set(id, { resolve, timer });
    try {
      w.ref();
      w.postMessage({ id, task, args });
    } catch {
      clearTimeout(timer);
      pending.delete(id);
      if (pending.size === 0) {
        try { w.unref(); } catch {}
      }
      resolve(null);
    }
  });

  if (workerRes !== null && workerRes !== undefined) {
    return workerRes;
  }

  return typeof fallbackFn === 'function' ? await fallbackFn() : null;
}

export async function shutdownCanvasWorker() {
  if (!worker) return;
  const w = worker;
  worker = null;
  rejectAllPending('shutdown');
  try {
    await w.terminate();
  } catch {}
}

export { isMainThread };
