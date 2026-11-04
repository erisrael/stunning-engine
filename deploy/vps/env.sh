#!/usr/bin/env bash
# Runs on the VPS. Reads KEY=value lines on standard input (sent by the control panel over SSH, so secrets never
# appear in a command line or a log) and writes $APP_ROOT/.env, readable by root only. Values made here are kept
# across saves: POSTGRES_PASSWORD, and APP_SECRET for a database that starts on this server.
set -euo pipefail
ROOT="${APP_ROOT:?APP_ROOT is not set}"
mkdir -p "$ROOT"
umask 077
ENV_FILE="$ROOT/.env"
TMP="$ROOT/.env.new"

old() { if [ -f "$ENV_FILE" ]; then grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- | sed -e "s/^'\(.*\)'$/\1/" || true; fi; }
gen() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

declare -A V
ORDER=()
put() { if [ -z "${V[$1]+x}" ]; then ORDER+=("$1"); fi; V[$1]="$2"; }

while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  [ -z "$line" ] && continue
  [[ "$line" == \#* ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  if [[ ! "$key" =~ ^[A-Z][A-Z0-9_]*$ ]]; then echo "Skipped a line that is not KEY=value"; continue; fi
  put "$key" "$val"
done

# Keep a value from the stdin, else the one already on the server, else a new one.
keep() { if [ -z "${V[$1]:-}" ]; then local o; o="$(old "$1")"; if [ -n "$o" ]; then put "$1" "$o"; elif [ -n "${2:-}" ]; then put "$1" "$2"; fi; fi; }

keep POSTGRES_PASSWORD "$(gen)"
if [ "${V[DB_MODE]:-local}" = "local" ]; then
  keep APP_SECRET "$(gen)"
  put DATABASE_URL "postgresql://myseed:${V[POSTGRES_PASSWORD]}@postgres:5432/myseed?sslmode=disable"
else
  keep APP_SECRET ""
fi

: > "$TMP"
n=0
for k in "${ORDER[@]}"; do
  v="${V[$k]}"
  [ -z "$v" ] && continue
  if [[ "$v" == *"'"* ]]; then printf '%s=%s\n' "$k" "$v" >> "$TMP"; else printf "%s='%s'\n" "$k" "$v" >> "$TMP"; fi
  n=$((n + 1))
done
chmod 600 "$TMP"
mv -f "$TMP" "$ENV_FILE"
echo "Saved $n settings in $ENV_FILE"
