#!/usr/bin/env bash
# Runs on the VPS, called by the control panel over SSH.
#   deploy.sh <release>          unpack incoming/<release>.tar.gz, build, switch, check /api/health (goes back if not)
#   deploy.sh --rollback         go back to the release before the current one
#   deploy.sh --restart          restart the app
#   deploy.sh --backup           write a backup (same JSON format as the panel's) to backups/, copy it to latest.json.gz
#   deploy.sh --restore <file>   safety backup, then restore backups/incoming/<file> into the database
#   deploy.sh --restore-newest   the same with the newest file in backups/incoming (the panel's "copy local data")
#   deploy.sh --cron             call /api/cron/checks (from /etc/cron.d/myseed-cm)
#   deploy.sh --autodeploy-on <git url> <branch>   deploy every new commit of that branch (checked every 2 minutes)
#   deploy.sh --autodeploy-off
#   deploy.sh --autodeploy       one check (from /etc/cron.d/myseed-cm-autodeploy)
#   deploy.sh --compose <args>   docker compose for the current release (logs, ps)
set -euo pipefail
ROOT="${APP_ROOT:?APP_ROOT is not set}"
cd "$ROOT"
KEEP=4
PROJECT=myseed-cm

val() { if [ -f "$ROOT/.env" ]; then grep -m1 "^$1=" "$ROOT/.env" | cut -d= -f2- | sed -e "s/^'\(.*\)'$/\1/" || true; fi; }
export APP_ROOT="$ROOT"
DOMAIN="$(val DOMAIN)"; APP_PORT="$(val APP_PORT)"; COMPOSE_PROFILES="$(val COMPOSE_PROFILES)"; POSTGRES_PASSWORD="$(val POSTGRES_PASSWORD)"
SITE_ADDRESSES="$(val SITE_ADDRESSES)"; SITE_ADDRESSES="${SITE_ADDRESSES:-${DOMAIN:-localhost}}"
export DOMAIN APP_PORT COMPOSE_PROFILES POSTGRES_PASSWORD SITE_ADDRESSES

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

# Only one deploy at a time (the panel's and an automatic one could meet).
deploy_lock() { exec 9>"$ROOT/.deploy.lock"; flock -w 1800 9 || { echo "Another deploy is still running."; exit 1; }; }

deploy_archive() {
  local rel="$1" archive dir prev
  [[ "$rel" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Bad release name."; return 2; }
  archive="$ROOT/incoming/$rel.tar.gz"
  [ -f "$archive" ] || { echo "The upload $archive is missing."; return 2; }
  dir="$ROOT/releases/$rel"
  rm -rf "$dir"; mkdir -p "$dir"
  tar -xzf "$archive" -C "$dir"
  rm -f "$archive"
  prev="$(current)"
  echo "Building $rel (the first build takes several minutes)"
  dc "$dir" build app
  start_release "$dir" "$prev" || return 1
  prune
}

AUTO_CONF="$ROOT/autodeploy.conf"
AUTO_KEY="$ROOT/.deploy-key/id_ed25519"
auto_git() { if [ -f "$AUTO_KEY" ]; then GIT_SSH_COMMAND="ssh -i $AUTO_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" git "$@"; else git "$@"; fi; }

restore_file() {
  local f="$1" cur
  [[ "$f" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Give the file name in backups/incoming."; exit 2; }
  [ -f "$ROOT/backups/incoming/$f" ] || { echo "backups/incoming/$f is not on the server."; exit 2; }
  cur="$(need_current)"
  echo "Safety backup of the VPS database first"
  APP_ROOT="$ROOT" bash "$0" --backup
  dc "$cur" exec -T app npm run -s db:bulk-restore -- "/backups/incoming/$f"
  rm -f "$ROOT/backups/incoming/$f"
  echo "Restored $f."
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
    restore_file "${2:-}"
    ;;
  --restore-newest)
    f="$(ls -1t "$ROOT/backups/incoming" 2>/dev/null | grep -E '\.json(\.gz)?$' | head -n1 || true)"
    [ -n "$f" ] || { echo "No uploaded backup in backups/incoming."; exit 2; }
    restore_file "$f"
    ;;
  --autodeploy-on)
    url="${2:-}"; branch="${3:-main}"
    [[ "$url" =~ ^(https://|git@)[A-Za-z0-9._@:/~-]+$ ]] || { echo "Give the repository's address."; exit 2; }
    [[ "$branch" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "Bad branch name."; exit 2; }
    command -v git >/dev/null 2>&1 || apt-get install -y -q git >/dev/null
    command -v flock >/dev/null 2>&1 || apt-get install -y -q util-linux >/dev/null
    if ! auto_git ls-remote --exit-code "$url" "refs/heads/$branch" >/dev/null 2>&1; then
      # A private repository: use SSH with a read-only deploy key made for this server.
      if [[ "$url" =~ ^https://github.com/([^/]+)/([^/]+)$ ]]; then
        url="git@github.com:${BASH_REMATCH[1]}/${BASH_REMATCH[2]%.git}.git"
      fi
      mkdir -p "$(dirname "$AUTO_KEY")"; chmod 700 "$(dirname "$AUTO_KEY")"
      [ -f "$AUTO_KEY" ] || ssh-keygen -q -t ed25519 -N "" -C "myseed-cm-deploy@$(hostname)" -f "$AUTO_KEY"
      if ! auto_git ls-remote --exit-code "$url" "refs/heads/$branch" >/dev/null 2>&1; then
        echo "The server cannot read the repository yet. On GitHub open the repository, Settings, Deploy keys,"
        echo "Add deploy key (read only is enough), paste the key below, then turn auto deploy on again:"
        echo "DEPLOY_KEY=$(cat "$AUTO_KEY.pub")"
        exit 3
      fi
    fi
    printf 'URL=%s\nBRANCH=%s\n' "$url" "$branch" > "$AUTO_CONF"
    rm -f "$ROOT/.autodeploy-failed"
    cat > /etc/cron.d/myseed-cm-autodeploy <<CRON
# Myseed Content Manager: deploy new commits of $branch (written by deploy.sh)
*/2 * * * * root APP_ROOT=$ROOT bash $ROOT/incoming/deploy.sh --autodeploy >> $ROOT/autodeploy.log 2>&1
CRON
    chmod 644 /etc/cron.d/myseed-cm-autodeploy
    echo "Auto deploy is on: every push to $branch is live about 2 minutes later (plus the build)."
    echo "SHA=$(auto_git ls-remote "$url" "refs/heads/$branch" | cut -c1-12)"
    ;;
  --autodeploy-off)
    rm -f /etc/cron.d/myseed-cm-autodeploy "$AUTO_CONF"
    echo "Auto deploy is off."
    ;;
  --autodeploy)
    [ -f "$AUTO_CONF" ] || exit 0
    exec 8>"$ROOT/.autodeploy.lock"; flock -n 8 || exit 0
    url="$(grep -m1 '^URL=' "$AUTO_CONF" | cut -d= -f2-)"; branch="$(grep -m1 '^BRANCH=' "$AUTO_CONF" | cut -d= -f2-)"
    sha="$(auto_git ls-remote "$url" "refs/heads/$branch" 2>/dev/null | cut -f1)"
    [ -n "$sha" ] || { echo "$(date -Is) could not read $url"; exit 1; }
    live="$(basename "$(current)" 2>/dev/null | cut -d- -f3)"
    if [ -n "$live" ] && [[ "$sha" == "$live"* ]]; then exit 0; fi
    [ "$(cat "$ROOT/.autodeploy-failed" 2>/dev/null)" = "$sha" ] && exit 0
    echo "$(date -Is) new commit ${sha:0:12} on $branch, deploying"
    mkdir -p "$ROOT/repo" "$ROOT/incoming"
    [ -d "$ROOT/repo/.git" ] || git -C "$ROOT/repo" init -q
    auto_git -C "$ROOT/repo" fetch -q --depth 1 "$url" "$branch"
    rel="$(date +%Y%m%d-%H%M%S)-${sha:0:7}-gh"
    git -C "$ROOT/repo" archive --format=tar.gz -o "$ROOT/incoming/$rel.tar.gz" FETCH_HEAD
    deploy_lock
    if deploy_archive "$rel"; then
      echo "$(date -Is) ${sha:0:12} is live"
      rm -f "$ROOT/.autodeploy-failed"
    else
      echo "$sha" > "$ROOT/.autodeploy-failed"
      echo "$(date -Is) ${sha:0:12} failed; the previous release keeps running. The next push is tried again."
      exit 1
    fi
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
    deploy_lock
    deploy_archive "$1"
    ;;
esac
