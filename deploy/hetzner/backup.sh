#!/usr/bin/env bash
# Nightly MongoDB backup (cron, see server-setup.sh). Keeps the last 14 days.
set -euo pipefail
cd /opt/fiduxa/deploy/hetzner
STAMP=$(date +%F_%H%M)
docker compose --env-file .env exec -T mongo \
  mongodump --db fiduxa_test --archive="/backups/fiduxa_test_${STAMP}.gz" --gzip --quiet
find ./backups -name 'fiduxa_test_*.gz' -mtime +14 -delete
echo "$(date -Is) backup ok: fiduxa_test_${STAMP}.gz"
