#!/bin/bash
# ========================================================
# Athena Prime · Production Auto-Deploy & Daemon Supervisor
# Auto-pulls & restarts ONLY when a new git push is detected
# ========================================================

echo "[Athena Prime] Initializing environment..."
git config --global --add safe.directory "*" 2>/dev/null

# 1. Initialize or repair git repo if missing or disconnected
if [ ! -d ".git" ] || ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[Athena Prime] Git repository not found locally. Initializing from GitHub..."
  git init
  git config --global --add safe.directory "*" 2>/dev/null
  git remote remove origin 2>/dev/null
  git remote add origin https://github.com/GwenStacy-cell/Athena-prime.git 2>/dev/null
  git fetch origin main --quiet 2>/dev/null
  git checkout -B main -f origin/main --quiet 2>/dev/null
else
  # Ensure origin remote is accurate
  git remote set-url origin https://github.com/GwenStacy-cell/Athena-prime.git 2>/dev/null
fi

# Ensure dependencies exist on cold container start
if [ ! -d "node_modules" ] && [ -f "package.json" ]; then
  echo "[Athena Prime] First boot: Installing dependencies..."
  npm install --no-audit --no-fund --loglevel=error
fi

# 2. Main execution loop (Checks & pulls ONLY when git push is found)
while true; do
  LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "none")
  REMOTE_COMMIT=$(git ls-remote origin refs/heads/main 2>/dev/null | awk '{print $1}')

  if [ -n "$REMOTE_COMMIT" ] && [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
    echo "[Athena Prime] New git push detected ($LOCAL_COMMIT -> $REMOTE_COMMIT)!"
    echo "[Athena Prime] Pulling updates from GitHub..."
    git pull origin main --quiet 2>/dev/null
    
    # Only run npm install if package.json was modified between commits
    if git diff --name-only "$LOCAL_COMMIT" "$REMOTE_COMMIT" 2>/dev/null | grep -q "package.json"; then
      echo "[Athena Prime] Changes detected in package.json. Updating node modules..."
      npm install --no-audit --no-fund --loglevel=error
    fi
  else
    echo "[Athena Prime] Up to date (Commit: ${LOCAL_COMMIT:0:7}). No new git push."
  fi

  echo "[Athena Prime] Starting bot process..."
  node --max-old-space-size=1024 --no-warnings index.js
  EXIT_CODE=$?

  echo "[Athena Prime] Process exited (code: $EXIT_CODE). Checking for git updates in 3s..."
  sleep 3
done
