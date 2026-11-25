#!/usr/bin/env bash
# Pull the latest main and rebuild/restart the stack. Run on the server as
# "deploy" (GitHub Actions calls this after the tests pass).
set -euo pipefail
cd /opt/fiduxa
git fetch --quiet origin main
git reset --hard origin/main
cd deploy/hetzner
docker compose --env-file .env up -d --build --remove-orphans
docker image prune -f >/dev/null

# Wait for the API to report ready
for i in $(seq 1 30); do
  if docker compose --env-file .env exec -T api wget -qO- http://127.0.0.1:3100/ready >/dev/null 2>&1; then
    echo "Deploy ok: $(git -C /opt/fiduxa log --oneline -1)"
    exit 0
  fi
  sleep 3
done
echo "API did not become ready – check: docker compose logs api" >&2
exit 1
