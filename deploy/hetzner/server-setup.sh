#!/usr/bin/env bash
# One-time setup of a fresh Hetzner Cloud server (Ubuntu 24.04), run as root:
#   bash server-setup.sh
# Installs Docker, firewall, swap, a "deploy" user for GitHub Actions and the
# nightly database backup. Safe to run again.
set -euo pipefail

REPO_SSH="git@github.com:UjjvalDE/fiduxa.git"
APP_DIR=/opt/fiduxa

echo "==> System updates"
apt-get update -y && apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw unattended-upgrades fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

echo "==> Firewall: only SSH, HTTP, HTTPS"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> 2 GB swap (Next.js build needs memory)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> deploy user"
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys

echo "==> GitHub read access (deploy key)"
if [ ! -f /home/deploy/.ssh/id_ed25519 ]; then
  sudo -u deploy ssh-keygen -t ed25519 -N "" -C "fiduxa-server-deploy-key" -f /home/deploy/.ssh/id_ed25519
fi
sudo -u deploy ssh-keyscan github.com >> /home/deploy/.ssh/known_hosts 2>/dev/null

install -d -o deploy -g deploy "$APP_DIR"

echo "==> Nightly backup at 03:15"
cat > /etc/cron.d/fiduxa-backup <<CRON
15 3 * * * deploy $APP_DIR/deploy/hetzner/backup.sh >> /var/log/fiduxa-backup.log 2>&1
CRON
touch /var/log/fiduxa-backup.log && chown deploy:deploy /var/log/fiduxa-backup.log

echo "==> Uptime check every 5 minutes (alerts via ALERT_EMAIL / ALERT_WEBHOOK_URL in deploy/hetzner/.env)"
apt-get install -y mailutils >/dev/null 2>&1 || echo "   (mailutils not installed – use ALERT_WEBHOOK_URL or install a mail relay)"
cat > /etc/cron.d/fiduxa-healthcheck <<CRON
*/5 * * * * deploy $APP_DIR/deploy/hetzner/healthcheck.sh >> /var/log/fiduxa-healthcheck.log 2>&1
CRON
touch /var/log/fiduxa-healthcheck.log && chown deploy:deploy /var/log/fiduxa-healthcheck.log

cat <<DONE

Setup finished. Next steps (docs/TEST_LAUNCH_HETZNER.md, step 4):
1. Add this key on GitHub → repo → Settings → Deploy keys (read-only):
$(cat /home/deploy/.ssh/id_ed25519.pub)
2. Then, as the deploy user:
   sudo -iu deploy
   git clone $REPO_SSH $APP_DIR
DONE
