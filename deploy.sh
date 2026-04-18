#!/bin/bash
# Deploy jobbr to Proxmox app container
set -e

# Load local config
if [ -f "$(dirname "$0")/.env.local" ]; then
  source "$(dirname "$0")/.env.local"
fi

if [ -z "$JOBBR_APP_HOST" ]; then
  echo "Error: JOBBR_APP_HOST not set. Add it to .env.local"
  exit 1
fi

APP_HOST="$JOBBR_APP_HOST"
SSH_KEY="${JOBBR_SSH_KEY:-$HOME/.ssh/id_ed25519}"
SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no root@$APP_HOST"

echo "==> Syncing code..."
rsync -az --delete --exclude='.git' --exclude='__pycache__' --exclude='.next' \
  --exclude='node_modules' --exclude='.venv' \
  --exclude='.env' --exclude='.env.local' \
  -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
  "$(dirname "$0")/" root@$APP_HOST:/opt/jobbr/

echo "==> Installing backend deps..."
$SSH "cd /opt/jobbr/backend && /root/.local/bin/uv sync"

echo "==> Building frontend..."
$SSH "cd /opt/jobbr/frontend && npm install && npm run build"

echo "==> Restarting services..."
$SSH "systemctl restart jobbr-backend jobbr-frontend"

echo "==> Done! Backend: http://$APP_HOST:8000 | Frontend: http://$APP_HOST:3000"
