#!/bin/bash
# ========================================================
# Athena Prime · Production Auto-Deploy & Daemon Supervisor
# Shallow git mirror + automatic cache/temp pruning for small disks
# ========================================================

echo "[Athena Prime] Initializing environment..."
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=""
export npm_config_cache="/tmp/.npm-cache"
git config --global --add safe.directory "*" 2>/dev/null

REPO_URL="https://github.com/GwenStacy-cell/fire-x.git"

cleanup_caches() {
  rm -rf ~/.npm ~/.cache /tmp/.npm-cache /tmp/ytdl* temp_media/* movies/web_cache/* scratch/*.pcm scratch/*.mp3 2>/dev/null || true
}

prune_git() {
  git reflog expire --expire=now --all 2>/dev/null || true
  git gc --prune=now --quiet 2>/dev/null || true
}

cleanup_caches

# 1. Initialize or repair shallow git repo if missing or disconnected
if [ ! -d ".git" ] || ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[Athena Prime] Git repository not found locally. Initializing shallow mirror..."
  git init
  git config --global --add safe.directory "*" 2>/dev/null
  git remote remove origin 2>/dev/null
  git remote add origin "$REPO_URL" 2>/dev/null
  git fetch --depth 1 origin main --quiet 2>/dev/null
  git checkout -B main -f origin/main --quiet 2>/dev/null
  prune_git
else
  git remote set-url origin "$REPO_URL" 2>/dev/null || git remote add origin "$REPO_URL" 2>/dev/null
  echo "[Athena Prime] Aligning repository with remote mirror..."
  git fetch --depth 1 origin main --quiet 2>/dev/null
  git reset --hard origin/main 2>/dev/null
  prune_git
fi

# Ensure production dependencies exist without leaving npm cache or devDeps on disk
if [ ! -d "node_modules" ] && [ -f "package.json" ]; then
  echo "[Athena Prime] First boot: Installing production dependencies..."
  npm install --omit=dev --no-audit --no-fund --loglevel=error
  npm cache clean --force >/dev/null 2>&1 || true
  cleanup_caches
fi

# 2. Main execution loop (Checks & pulls ONLY when git push is found)
while true; do
  LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "none")
  REMOTE_COMMIT=$(git ls-remote "$REPO_URL" refs/heads/main 2>/dev/null | awk '{print $1}')

  if [ -n "$REMOTE_COMMIT" ] && [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
    echo "[Athena Prime] New git push detected ($LOCAL_COMMIT -> $REMOTE_COMMIT)!"
    echo "[Athena Prime] Synchronizing updates from GitHub mirror..."
    git fetch --depth 1 "$REPO_URL" main --quiet 2>/dev/null
    git reset --hard FETCH_HEAD 2>/dev/null
    prune_git

    if git diff --name-only "$LOCAL_COMMIT" "$REMOTE_COMMIT" 2>/dev/null | grep -q "package.json"; then
      echo "[Athena Prime] Changes detected in package.json. Updating node modules..."
      npm install --omit=dev --no-audit --no-fund --loglevel=error
      npm cache clean --force >/dev/null 2>&1 || true
    fi
  else
    echo "[Athena Prime] Up to date (Commit: ${LOCAL_COMMIT:0:7}). No new git push."
  fi

  cleanup_caches
  echo "[Athena Prime] Starting bot process..."
  node --max-old-space-size=1024 --no-warnings index.js
  EXIT_CODE=$?

  echo "[Athena Prime] Process exited (code: $EXIT_CODE). Cleaning caches & checking updates in 3s..."
  cleanup_caches
  sleep 3
done
