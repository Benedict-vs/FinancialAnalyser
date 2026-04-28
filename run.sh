#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Backend setup (idempotent)
if [ ! -d "$ROOT/backend/.venv" ]; then
  echo "→ Creating Python venv…"
  python3 -m venv "$ROOT/backend/.venv"
fi
source "$ROOT/backend/.venv/bin/activate"
pip install --quiet -r "$ROOT/backend/requirements.txt"

# Frontend setup (idempotent)
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "→ Installing npm packages…"
  (cd "$ROOT/frontend" && npm install)
fi

echo "→ Starting backend on :8000 and frontend on :5173"

cleanup() {
  trap - SIGINT SIGTERM EXIT
  kill 0
}
trap cleanup SIGINT SIGTERM EXIT

(cd "$ROOT/backend" && uvicorn main:app --reload --port 8000) &
(cd "$ROOT/frontend" && npm run dev) &
wait
