#!/bin/bash
echo "[Athena Prime] Initializing environment..."

# 1. Initialize Git repository if missing
if [ ! -d ".git" ]; then
  echo "[Athena Prime] Initializing git repository..."
  git init
  git remote add origin https://github.com/GwenStacy-cell/Athena-prime.git 2>/dev/null
  git fetch --all --quiet
  git checkout -B main -f origin/main --quiet
fi

# 2. Main execution loop (Auto-pull & Auto-restart like Railway)
while true; do
  echo "[Athena Prime] Checking for updates and synchronizing..."
  git fetch origin main --quiet 2>/dev/null
  git reset --hard origin/main --quiet 2>/dev/null

  if [ -f "package.json" ]; then
    npm install --no-audit --no-fund --loglevel=error
  fi

  echo "[Athena Prime] Starting bot process..."
  node --max-old-space-size=1024 --no-warnings index.js
  EXIT_CODE=$?

  echo "[Athena Prime] Bot process exited (code: $EXIT_CODE). Checking updates and restarting in 2 seconds..."
  sleep 2
done
