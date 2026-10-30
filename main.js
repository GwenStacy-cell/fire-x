import { spawn, execSync } from 'child_process';

/**
 * Athena Prime - Container Supervisor & Hot-Reload Engine
 * Keeps the bot running continuously in Pterodactyl and automatically
 * pulls latest git commits when updates are detected.
 */
console.log('🚀 [Supervisor] Athena Prime Container Supervisor Active.');

let isShuttingDown = false;
let currentChild = null;

function handleSignal(signal) {
  isShuttingDown = true;
  console.log(`🛑 [Supervisor] Received ${signal}. Terminating child process...`);
  if (currentChild) {
    try {
      currentChild.kill(signal);
    } catch {}
  }
  process.exit(0);
}

process.on('SIGINT', () => handleSignal('SIGINT'));
process.on('SIGTERM', () => handleSignal('SIGTERM'));

function runBot() {
  if (isShuttingDown) return;

  console.log('🟢 [Supervisor] Spawning Athena Prime engine (index.js)...');
  const startTime = Date.now();
  currentChild = spawn(process.execPath, ['index.js'], { stdio: 'inherit' });

  currentChild.on('exit', (code, signal) => {
    currentChild = null;
    if (isShuttingDown) return;

    const uptimeMs = Date.now() - startTime;
    console.log(`[Supervisor] Bot process stopped (code: ${code}, signal: ${signal}, uptime: ${Math.round(uptimeMs / 1000)}s).`);

    // Pull updates before restarting
    try {
      console.log('🔄 [Supervisor] Synchronizing repository via git pull...');
      execSync('git pull origin main', { stdio: 'inherit' });
      console.log('[Supervisor] Repository synchronized with latest commit.');
    } catch (err) {
      console.warn('[Supervisor] Git pull note:', err.message);
      try {
        execSync('git pull', { stdio: 'inherit' });
      } catch {}
    }

    const restartDelay = uptimeMs < 5000 ? 10000 : 2000;
    console.log(`⏳ [Supervisor] Restarting Athena Prime in ${restartDelay / 1000} seconds...`);
    setTimeout(runBot, restartDelay);
  });
}

runBot();
