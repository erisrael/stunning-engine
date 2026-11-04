#!/usr/bin/env bash
# Runs on the VPS, called by the control panel over SSH.
#   deploy.sh <release>          unpack incoming/<release>.tar.gz, build, switch, check /api/health (goes back if not)
#   deploy.sh --rollback         go back to the release before the current one
#   deploy.sh --restart          restart the app
#   deploy.sh --backup           write a backup (same JSON format as the panel's) to backups/, copy it to latest.json.gz
#   deploy.sh --restore <file>   safety backup, then restore backups/incoming/<file> into the database
#   deploy.sh --cron             call /api/cron/checks (from /etc/cron.d/myseed-cm)
#   deploy.sh --compose <args>   docker compose for the current release (logs, ps)
set -euo pipefail
ROOT="${APP_ROOT:?APP_ROOT is not set}"
cd "$ROOT"
KEEP=4
PROJECT=myseed-cm

val() { if [ -f "$ROOT/.env" ]; then grep -m1 "^$1=" "$ROOT/.env" | cut -d= -f2- | sed -e "s/^'\(.*\)'$/\1/" || true; fi; }
export APP_ROOT="$ROOT"
DOMAIN="$(val DOMAIN)"; APP_PORT="$(val APP_PORT)"; COMPOSE_PROFILES="$(val COMPOSE_PROFILES)"; POSTGRES_PASSWORD="$(val POSTGRES_PASSWORD)"
export DOMAIN APP_PORT COMPOSE_PROFILES POSTGRES_PASSWORD

dc() { local dir="$1"; shift; RELEASE="$(basename "$dir")" docker compose -p "$PROJECT" -f "$dir/deploy/vps/docker-compose.yml" "$@"; }
current() { if [ -L "$ROOT/current" ]; then readlink -f "$ROOT/current"; fi; }
need_current() { local c; c="$(current)"; if [ -z "$c" ] || [ ! -d "$c" ]; then echo "Nothing is deployed yet. Deploy first." >&2; exit 2; fi; echo "$c"; }
switch_to() { ln -sfn "$1" "$ROOT/current.new"; mv -Tf "$ROOT/current.new" "$ROOT/current"; }
healthy() {
  for _ in $(seq 1 60); do
    if dc "$1" exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then return 0; fi
    sleep 3
  done
  return 1
}
releases() { ls -1 "$ROOT/releases" 2>/dev/null | sort; }
prune() {
  local cur; cur="$(basename "$(current)")"
  releases | head -n -"$KEEP" | while read -r r; do
    [ "$r" = "$cur" ] && continue
    rm -rf "${ROOT:?}/releases/$r"
    docker image rm "myseed-cm-app:$r" >/dev/null 2>&1 || true
  done
  docker image prune -f >/dev/null 2>&1 || true
}
start_release() {
  local dir="$1" prev="${2:-}"
  switch_to "$dir"
  dc "$dir" up -d --remove-orphans
  echo "Waiting for the app to answer /api/health"
  if healthy "$dir"; then echo "Release $(basename "$dir") is live."; return 0; fi
  echo "The release did not answer /api/health in 3 minutes. Its last log lines:"
  dc "$dir" logs --no-color --tail 80 app || true
  if [ -n "$prev" ] && [ -d "$prev" ] && [ "$prev" != "$dir" ]; then
    echo "Going back to $(basename "$prev")"
    switch_to "$prev"
    dc "$prev" up -d --remove-orphans
  fi
  return 1
}

case "${1:-}" in
  --rollback)
    cur="$(need_current)"
    prev="$(releases | awk -v c="$(basename "$cur")" '$0==c {print p; exit} {p=$0}')"
    if [ -z "$prev" ]; then echo "There is no earlier release to go back to."; exit 2; fi
    dir="$ROOT/releases/$prev"
    docker image inspect "myseed-cm-app:$prev" >/dev/null 2>&1 || dc "$dir" build app
    start_release "$dir" "$cur"
    ;;
  --restart)
    cur="$(need_current)"
    dc "$cur" up -d --remove-orphans
    dc "$cur" restart app
    healthy "$cur" && echo "The app is back." || { echo "The app did not answer after the restart."; exit 1; }
    ;;
  --backup)
    cur="$(need_current)"
    mkdir -p "$ROOT/backups"
    dc "$cur" exec -T -e BACKUP_PASSPHRASE= app npm run -s backup -- /backups
    latest="$(ls -1t "$ROOT"/backups/myseed-*.json* 2>/dev/null | head -n1)"
    [ -n "$latest" ] || { echo "The backup did not write a file."; exit 1; }
    cp -f "$latest" "$ROOT/backups/latest.json.gz"
    ls -1t "$ROOT"/backups/myseed-*.json* | tail -n +15 | xargs -r rm -f
    echo "LATEST=$(basename "$latest")"
    ;;
  --restore)
    f="${2:-}"
    [[ "$f" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Give the file name in backups/incoming."; exit 2; }
    [ -f "$ROOT/backups/incoming/$f" ] || { echo "backups/incoming/$f is not on the server."; exit 2; }
    cur="$(need_current)"
    echo "Safety backup first"
    APP_ROOT="$ROOT" bash "$0" --backup
    dc "$cur" exec -T app npm run -s db:bulk-restore -- "/backups/incoming/$f"
    rm -f "$ROOT/backups/incoming/$f"
    echo "Restored $f."
    ;;
  --cron)
    secret="$(val CRON_SECRET)"
    [ -n "$secret" ] && curl -fsS -m 120 -H "Authorization: Bearer $secret" "http://127.0.0.1:${APP_PORT:-3100}/api/cron/checks" >/dev/null
    ;;
  --compose)
    shift
    cur="$(need_current)"
    dc "$cur" "$@"
    ;;
  ""|-*)
    echo "Usage: deploy.sh <release> | --rollback | --restart | --backup | --restore <file> | --cron | --compose <args>"
    exit 2
    ;;
  *)
    rel="$1"
    [[ "$rel" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Bad release name."; exit 2; }
    archive="$ROOT/incoming/$rel.tar.gz"
    [ -f "$archive" ] || { echo "The upload $archive is missing."; exit 2; }
    dir="$ROOT/releases/$rel"
    rm -rf "$dir"; mkdir -p "$dir"
    tar -xzf "$archive" -C "$dir"
    rm -f "$archive"
    prev="$(current)"
    echo "Building $rel (the first build takes several minutes)"
    dc "$dir" build app
    start_release "$dir" "$prev"
    prune
    ;;
esac
