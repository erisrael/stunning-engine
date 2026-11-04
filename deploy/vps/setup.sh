#!/usr/bin/env bash
# Runs on the VPS once (safe to run again): Docker, swap for the build, the firewall, folders and the daily
# backup and the scheduled checks. Needs APP_ROOT; SSH_PORT and PROXY (caddy or none) are optional.
set -euo pipefail
ROOT="${APP_ROOT:?APP_ROOT is not set}"
SSH_PORT="${SSH_PORT:-22}"
PROXY="${PROXY:-caddy}"
HERE="$(cd "$(dirname "$0")" && pwd)"
export DEBIAN_FRONTEND=noninteractive

echo "== System packages"
apt-get update -y -q
apt-get install -y -q ca-certificates curl cron ufw git >/dev/null

if ! command -v docker >/dev/null 2>&1; then
  echo "== Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || apt-get install -y -q docker-compose-plugin
systemctl enable --now docker cron >/dev/null 2>&1 || true
echo "Docker $(docker --version | cut -d' ' -f3 | tr -d ,), Compose $(docker compose version --short)"

echo "== Swap (building the app needs about 2 GB of memory)"
if [ "$(swapon --show --noheadings | wc -l)" -eq 0 ]; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Added 2 GB of swap."
else
  echo "Swap is already on."
fi

echo "== Ports"
if [ "$PROXY" = "caddy" ]; then
  others="$(ss -Hltnp '( sport = :80 or sport = :443 )' 2>/dev/null | grep -v docker-proxy || true)"
  theirs="$(docker ps --filter publish=443 --format '{{.Names}}' | grep -v '^myseed-cm-' || true)"
  if [ -n "$others$theirs" ]; then
    echo "Ports 80 and 443 are already used on this server:"
    echo "$others$theirs"
    echo "Another site (for example the MySeed Academy one) already runs a web server here. In the panel choose"
    echo "'Use the web server I already have' and point it at 127.0.0.1:<app port>, then run this again."
    exit 1
  fi
fi

echo "== Firewall"
ufw allow "$SSH_PORT"/tcp >/dev/null
if [ "$PROXY" = "caddy" ]; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null; fi
if ufw status | grep -q "Status: active"; then
  echo "The firewall was already on; added the rules this site needs."
elif [ "$(docker ps -q | wc -l)" -gt 0 ]; then
  echo "Left the firewall off: other containers run here and it could cut them off. Rules are ready for 'ufw enable'."
else
  ufw --force enable >/dev/null
  echo "Firewall on (SSH $SSH_PORT$([ "$PROXY" = caddy ] && echo ', 80, 443'))."
fi

echo "== Folders and schedules"
mkdir -p "$ROOT/releases" "$ROOT/backups/incoming" "$ROOT/incoming"
chmod 700 "$ROOT"
cat > /etc/cron.d/myseed-cm <<CRON
# Myseed Content Manager (written by setup.sh)
15 3 * * * root APP_ROOT=$ROOT bash $HERE/deploy.sh --backup >> $ROOT/backups/cron.log 2>&1
*/10 * * * * root APP_ROOT=$ROOT bash $HERE/deploy.sh --cron >/dev/null 2>&1
CRON
chmod 644 /etc/cron.d/myseed-cm
echo "Daily backup at 03:15 and the scheduled checks every 10 minutes."
echo "The server is ready."
