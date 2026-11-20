import { exec } from 'child_process';
import util from 'util';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import db from '../database.js';

const execPromise = util.promisify(exec);

// Non-interactive git environment: completely disables terminal prompts for username/password
const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: ''
};

function runGit(cmd) {
  return execPromise(cmd, { env: GIT_ENV, timeout: 15000 });
}

let isChecking = false;
let currentCommit = null;
let cachedCommitCount = null;
let lastCountCheck = 0;

/**
 * Get total number of commits in the git repository (cached for 60 seconds).
 */
export async function getGitCommitCount() {
  const now = Date.now();
  if (cachedCommitCount && now - lastCountCheck < 60000) {
    return cachedCommitCount;
  }
  try {
    let stdout;
    try {
      const res = await runGit('git rev-list --count HEAD');
      stdout = res.stdout;
    } catch {
      await runGit('git config --global --add safe.directory "*"').catch(() => {});
      const res = await runGit('git rev-list --count HEAD');
      stdout = res.stdout;
    }

    let num = parseInt(stdout.trim(), 10);
    // If shallow clone detected (e.g. depth 1 count is < 100), try to unshallow
    if (!isNaN(num) && num < 100) {
      try {
        await runGit('git fetch --unshallow origin main');
        const res = await runGit('git rev-list --count HEAD');
        num = parseInt(res.stdout.trim(), 10);
      } catch {}
    }

    if (!isNaN(num) && num > 0) {
      cachedCommitCount = num.toLocaleString('en-US');
      lastCountCheck = now;
      return cachedCommitCount;
    }
    cachedCommitCount = stdout.trim();
    lastCountCheck = now;
    return cachedCommitCount;
  } catch {
    return cachedCommitCount || '359';
  }
}

/**
 * Get the current commit SHA of the local repository.
 */
async function getLocalCommit() {
  try {
    const { stdout } = await runGit('git rev-parse HEAD');
    return stdout.trim();
  } catch {
    try {
      await runGit('git config --global --add safe.directory "*"').catch(() => {});
      const { stdout } = await runGit('git rev-parse HEAD');
      return stdout.trim();
    } catch {
      return null;
    }
  }
}

/**
 * Get the latest commit SHA of origin/main without fetching objects.
 */
async function getRemoteCommit() {
  try {
    const { stdout } = await runGit('git ls-remote origin refs/heads/main');
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
  try {
    await runGit('git config --global --add safe.directory "*"').catch(() => {});
  } catch {}

  currentCommit = await getLocalCommit();
  if (!currentCommit) {
    try {
      console.log(chalk.yellow('[AutoDeploy] Linking local repository to remote origin...'));
      await runGit('git init').catch(() => {});
      await runGit('git config --global --add safe.directory "*"').catch(() => {});
      await runGit('git remote remove origin').catch(() => {});
      await runGit('git remote add origin https://github.com/GwenStacy-cell/Athena-prime.git').catch(() => {});
      await runGit('git fetch origin main --quiet').catch(() => {});
      await runGit('git checkout -B main -f origin/main --quiet').catch(() => {});
      currentCommit = await getLocalCommit();
    } catch {}
  }

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
            db.flushSync();
          }
        } catch {}

        // Pull latest updates immediately
        try {
          console.log(chalk.cyan('[AutoDeploy] Synchronizing local repository via git pull...'));
          await runGit('git pull origin main');
          console.log(chalk.green('[AutoDeploy] Successfully updated local repository.'));
        } catch (pullErr) {
          try {
            await runGit('git pull');
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
