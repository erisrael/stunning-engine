#!/usr/bin/env bash
# Keeps the site answering (run every minute from /etc/cron.d/myseed-cm-watchdog):
#  - the app must answer /api/health; after three failed checks in a row (about three minutes) it is restarted,
#    because a stuck app is still "running" and Docker's own restart policy only covers a crash;
#  - the database and Caddy are started again if they stopped;
#  - when the disk is nearly full, old Docker images and build cache are cleared.
# Writes what it did to $APP_ROOT/watchdog.log. Install: bash watchdog.sh --install
set -uo pipefail
ROOT="${APP_ROOT:-/opt/myseed-content-manager}"
LOG="$ROOT/watchdog.log"
STATE="$ROOT/.watchdog-fails"
PROJECT=myseed-cm
say() { echo "$(date -Is) $*" >> "$LOG"; }

if [ "${1:-}" = "--install" ]; then
  install -m 0755 "$0" "$ROOT/watchdog.sh"
  echo "* * * * * root APP_ROOT=$ROOT bash $ROOT/watchdog.sh >/dev/null 2>&1" > /etc/cron.d/myseed-cm-watchdog
  chmod 0644 /etc/cron.d/myseed-cm-watchdog
  echo "Watchdog installed: checks every minute, log in $LOG"
  exit 0
fi

exec 9>"$ROOT/.watchdog.lock"
flock -n 9 || exit 0
# A deploy in progress switches containers itself: stay out of its way.
if [ -e "$ROOT/.deploy.lock" ] && ! flock -n "$ROOT/.deploy.lock" true 2>/dev/null; then exit 0; fi

port="$(grep -m1 '^APP_PORT=' "$ROOT/.env" 2>/dev/null | cut -d= -f2- | tr -d "'\"")"
port="${port:-3100}"
name() { docker ps -a --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=$1" --format '{{.Names}}' | head -n1; }

# The database and Caddy: started again if they stopped.
for svc in postgres caddy; do
  c="$(name "$svc")"
  [ -n "$c" ] || continue
  if [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" != "true" ]; then
    say "$svc ($c) was not running: starting it"
    docker start "$c" >/dev/null 2>&1 || say "could not start $c"
  fi
done

# The app: answering, not only running.
app="$(name app)"
if [ -n "$app" ]; then
  if curl -fsS -m 15 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
    [ -s "$STATE" ] && say "app answers again"
    : > "$STATE"
  else
    fails=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
    echo "$fails" > "$STATE"
    say "app did not answer /api/health (check $fails of 3)"
    if [ "$fails" -ge 3 ]; then
      say "restarting the app ($app)"
      docker restart -t 20 "$app" >/dev/null 2>&1 || docker start "$app" >/dev/null 2>&1 || say "could not restart $app"
      : > "$STATE"
    fi
  fi
fi

# Disk: nearly full means old images and build cache go (the current release's image stays).
used="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
if [ "${used:-0}" -ge 90 ]; then
  say "disk ${used}% full: clearing old images and build cache"
  docker image prune -af --filter "until=72h" >/dev/null 2>&1
  docker builder prune -af --filter "until=72h" >/dev/null 2>&1
fi

# Keep the log short.
[ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 2000 ] && tail -n 1000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit 0
