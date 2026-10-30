import { exec } from 'child_process';
import util from 'util';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import db from '../database.js';

const execPromise = util.promisify(exec);

let isChecking = false;
let currentCommit = null;

/**
 * Get the current commit SHA of the local repository.
 */
async function getLocalCommit() {
  try {
    const { stdout } = await execPromise('git rev-parse HEAD');
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get the latest commit SHA of origin/main without fetching objects.
 */
async function getRemoteCommit() {
  try {
    const { stdout } = await execPromise('git ls-remote origin refs/heads/main');
    const parts = stdout.trim().split(/\s+/);
    return parts[0] || null;
  } catch {
    return null;
  }
}

/**
 * Periodically checks for new commits on GitHub.
 * When a new commit is detected, flushes DB and exits process gracefully
 * so start.sh loops, pulls updates, and boots the new version immediately.
 */
export async function startGitWatcher(intervalMs = 30000) {
  currentCommit = await getLocalCommit();
  if (!currentCommit) {
    console.log(chalk.gray('[AutoDeploy] Git repository not detected locally. Auto-watcher standby.'));
    return;
  }

  console.log(chalk.cyan(`[AutoDeploy] Active watching for git pushes (Current: ${currentCommit.slice(0, 7)}, interval: ${intervalMs / 1000}s)`));

  setInterval(async () => {
    if (isChecking) return;
    isChecking = true;

    try {
      const remoteCommit = await getRemoteCommit();
      if (remoteCommit && remoteCommit !== currentCommit) {
        console.log(chalk.yellow.bold(`\n======================================================`));
        console.log(chalk.yellow.bold(`[AutoDeploy] Update detected: ${currentCommit.slice(0, 7)} -> ${remoteCommit.slice(0, 7)}`));
        console.log(chalk.yellow.bold(`[AutoDeploy] Flushing DB and restarting to apply update...`));
        console.log(chalk.yellow.bold(`======================================================\n`));

        // Flush DB to disk if needed
        try {
          if (db?.needsSave || db?.saveTimeout) {
            clearTimeout(db.saveTimeout);
            db.saveTimeout = null;
            const data = JSON.stringify(db.cache, null, 2);
            fs.writeFileSync(path.resolve('data', 'db.json'), data, 'utf8');
          }
        } catch {}

        // Pull latest updates immediately
        try {
          console.log(chalk.cyan('[AutoDeploy] Synchronizing local repository via git pull...'));
          await execPromise('git pull origin main');
          console.log(chalk.green('[AutoDeploy] Successfully updated local repository.'));
        } catch (pullErr) {
          try {
            await execPromise('git pull');
          } catch {}
        }

        setTimeout(() => {
          process.exit(0);
        }, 1000);
      }
    } catch {
      // Ignore network blips silently
    } finally {
      isChecking = false;
    }
  }, intervalMs);
}
