#!/usr/bin/env bash
# Uptime check, run by cron every 5 minutes (installed by server-setup.sh):
#   */5 * * * * deploy /opt/fiduxa/deploy/hetzner/healthcheck.sh
#
# Calls https://SITE_DOMAIN/ready. When it fails twice in a row the owner is
# alerted ONCE (e-mail and/or webhook); when the site is back, a "recovered"
# message follows. Settings in deploy/hetzner/.env:
#   ALERT_EMAIL=owner@example.com          (needs a working `mail` command, see docs)
#   ALERT_WEBHOOK_URL=https://...          (Slack/Discord/ntfy/Telegram-bot style; JSON {"text": "..."} is POSTed)
#   HEALTHCHECK_URL=https://.../ready      (optional override)
#   GATE_USER / GATE_PLAIN_PASSWORD        (optional: basic-auth for the tester password gate)
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DIR/.env"
STATE_DIR="${HEALTHCHECK_STATE_DIR:-/var/tmp/fiduxa-health}"
mkdir -p "$STATE_DIR"

# Read only the keys we need from .env (never `source` the whole file)
env_get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

SITE_DOMAIN="$(env_get SITE_DOMAIN)"
URL="$(env_get HEALTHCHECK_URL)"
URL="${URL:-https://${SITE_DOMAIN}/ready}"
ALERT_EMAIL="$(env_get ALERT_EMAIL)"
ALERT_WEBHOOK_URL="$(env_get ALERT_WEBHOOK_URL)"
GATE_USER="$(env_get GATE_USER)"
GATE_PLAIN_PASSWORD="$(env_get GATE_PLAIN_PASSWORD)"

AUTH=()
if [ -n "$GATE_USER" ] && [ -n "$GATE_PLAIN_PASSWORD" ]; then AUTH=(-u "$GATE_USER:$GATE_PLAIN_PASSWORD"); fi

now() { date -Is; }

alert() {
  local subject="$1" body="$2"
  if [ -n "$ALERT_WEBHOOK_URL" ]; then
    local payload
    payload=$(printf '{"text":"%s\\n%s"}' "${subject//\"/\'}" "${body//\"/\'}")
    curl -fsS -m 15 -H 'Content-Type: application/json' -d "$payload" "$ALERT_WEBHOOK_URL" >/dev/null \
      || echo "$(now) webhook alert failed"
  fi
  if [ -n "$ALERT_EMAIL" ]; then
    if command -v mail >/dev/null; then
      printf '%s\n' "$body" | mail -s "$subject" "$ALERT_EMAIL" || echo "$(now) e-mail alert failed"
    else
      echo "$(now) ALERT_EMAIL set but no 'mail' command installed (apt-get install -y mailutils)"
    fi
  fi
  if [ -z "$ALERT_WEBHOOK_URL" ] && [ -z "$ALERT_EMAIL" ]; then
    echo "$(now) no ALERT_EMAIL / ALERT_WEBHOOK_URL configured – alert only logged"
  fi
}

code=$(curl -s -o "$STATE_DIR/last-body" -w '%{http_code}' -m 20 "${AUTH[@]}" "$URL" || echo "000")
fails=$(cat "$STATE_DIR/fails" 2>/dev/null || echo 0)

if [ "$code" = "200" ]; then
  if [ -f "$STATE_DIR/alerted" ]; then
    alert "Fiduxa is back online" "$(now): $URL answers 200 again (was down since $(cat "$STATE_DIR/alerted"))."
    rm -f "$STATE_DIR/alerted"
  fi
  echo 0 > "$STATE_DIR/fails"
  exit 0
fi

fails=$((fails + 1))
echo "$fails" > "$STATE_DIR/fails"
echo "$(now) health check failed: HTTP $code (failure $fails in a row)"

# Two failures in a row (≈ 5–10 min) → one alert, no repeats until recovery
if [ "$fails" -ge 2 ] && [ ! -f "$STATE_DIR/alerted" ]; then
  now > "$STATE_DIR/alerted"
  status=$(cd "$DIR" && docker compose --env-file .env ps --format '{{.Service}}: {{.Status}}' 2>/dev/null | tr '\n' ';')
  alert "Fiduxa is DOWN (HTTP $code)" "$(now): $URL answered HTTP $code twice in a row. Containers: ${status:-unknown}. Runbook: docs/TEST_LAUNCH_HETZNER.md → 'What to do if the site is down'."
fi
exit 1
