#!/bin/bash
set -e

echo "Pulling latest changes..."
git pull

echo "Rebuilding and restarting services..."
docker compose up -d --build

echo "Done. Logs:"
docker compose logs --tail=20
