"""Myseed control panel: push and pull data with Supabase, deploy to Netlify, Vercel or Render.

    python control-panel/control_panel.py            start in the background and open the browser
    python control-panel/control_panel.py status     is it running, and which jobs are running
    python control-panel/control_panel.py stop       stop every running job and the panel
    python control-panel/control_panel.py stop --keep-jobs
    python control-panel/control_panel.py set-password
    python control-panel/control_panel.py serve      run in this terminal (for debugging)

The panel runs as its own background process and listens on 127.0.0.1 only. Closing the browser
or the terminal does not stop it or its jobs; use "Stop everything and exit" in the panel (or
the stop command) for that. Standard library only: no pip install needed.
"""

from __future__ import annotations

import datetime as dt
import http.server
import json
import mimetypes
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import jobs  # noqa: E402
import providers  # noqa: E402
import store  # noqa: E402

VERSION = "1.0.0"
WEB_DIR = Path(__file__).resolve().parent / "web"
STATIC = {"/": "index.html", "/app.js": "app.js", "/style.css": "style.css", "/favicon.svg": "favicon.svg"}
SESSION_COOKIE = "mcp_session"
SESSION_HOURS = 12
DEV_PORT = 3020
NPM = "npm"
NPX = "npx"
GIT = "git"

STARTED_AT = time.time()
_sessions: dict[str, float] = {}
_sessions_lock = threading.Lock()
_failures: list[float] = []
_counts_cache: dict[str, dict] = {}
_server: http.server.ThreadingHTTPServer | None = None


class ApiFail(Exception):
    def __init__(self, status: int, message: str, extra: dict | None = None):
        super().__init__(message)
        self.status = status
        self.extra = extra or {}


def stamp() -> str:
    return dt.datetime.now().strftime("%Y%m%d-%H%M%S")


def port_open(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def run_quick(args: list[str], env: dict | None = None, timeout: int = 60) -> subprocess.CompletedProcess:
    exe = jobs.resolve_exe(args[0])
    full_env = os.environ.copy()
    full_env.update({"FORCE_COLOR": "0", "NO_COLOR": "1"})
    if env:
        for k, v in env.items():
            if v is None:
                full_env.pop(k, None)
            else:
                full_env[k] = v
    return subprocess.run(
        [exe, *args[1:]],
        cwd=str(store.PROJECT_DIR),
        env=full_env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        creationflags=jobs.CREATE_NO_WINDOW if jobs.IS_WIN else 0,
    )


# ---------------------------------------------------------------------------
# Domain helpers: database, backups, env values
# ---------------------------------------------------------------------------


def require_secret(key: str, what: str) -> str:
    value = store.get_secret(key)
    if not value:
        raise ApiFail(400, f"{what} is not set yet.")
    return value


def outside_next_servers() -> list[int]:
    """PIDs of Next.js servers started from this project folder outside the panel (for example npm run dev in a terminal)."""
    project = str(store.PROJECT_DIR).lower()
    try:
        if jobs.IS_WIN:
            ps = "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }"
            out = run_quick(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps], timeout=20).stdout
        else:
            rows = run_quick(["ps", "-eo", "pid=,args="], timeout=10).stdout.splitlines()
            out = "\n".join(line.strip().replace(" ", "\t", 1) for line in rows)
    except (OSError, subprocess.SubprocessError):
        return []
    pids = []
    for line in out.splitlines():
        pid, _, cmd = line.partition("\t")
        low = cmd.lower().replace("/", "\\")
        is_next = "next\\dist" in low or "next dev" in low or "next start" in low
        if project.replace("/", "\\") in low and is_next and pid.strip().isdigit():
            pids.append(int(pid))
    return pids


def app_database() -> dict | None:
    """Where `npm run dev` gets its database. Next.js loads DATABASE_URL from .env.local or .env (in that order);
    when set, the local app uses that server instead of the embedded data/pg copy the panel calls "this computer"."""
    for name in (".env.development.local", ".env.local", ".env.development", ".env"):
        f = store.PROJECT_DIR / name
        try:
            text = f.read_text(encoding="utf-8")
        except OSError:
            continue
        m = re.search(r"^\s*DATABASE_URL\s*=\s*(.*)$", text, re.M)
        if m:
            value = m.group(1).strip().strip("\"'")
            if not value:
                return None
            try:
                host = urllib.parse.urlsplit(value).hostname or "unknown host"
            except ValueError:
                host = "unknown host"
            return {"file": name, "host": host, "supabase": "supabase" in host}
    return None


def local_db_guard() -> None:
    """PGlite allows one process at a time; refuse local database work while something else holds it."""
    for j in jobs.running_jobs():
        if "local database" in j["locks"]:
            raise ApiFail(409, f"“{j['title']}” is using the local database.", {"code": "BUSY", "holder": j})
    # A dev server that reads DATABASE_URL from .env never opens data/pg, so it does not conflict.
    if app_database() or any(j.get("group") == "local-dev" for j in jobs.running_jobs()):
        return
    pids = outside_next_servers()
    if pids:
        raise ApiFail(409, f"This project's app is running outside the panel (process {', '.join(map(str, pids))}, probably npm run dev in a terminal). Stop it first: the local database can only be opened by one program at a time.")


def db_env(target: str) -> dict:
    if target == "supabase":
        return {"DATABASE_URL": {"secret": "supabase_session_url"}}
    return {}


def db_unset(target: str) -> list[str]:
    return ["DATABASE_URL"] if target == "local" else []


def backup_step(target: str, folder: str, title: str | None = None) -> dict:
    return {"title": title or f"Back up the {label(target)} database", "cmd": [NPM, "run", "-s", "backup", "--", folder], "env": db_env(target), "unset": db_unset(target)}


def restore_step(target: str, file_arg: str, title: str | None = None) -> dict:
    return {"title": title or f"Restore into the {label(target)} database", "cmd": [NPM, "run", "-s", "db:bulk-restore", "--", file_arg], "env": db_env(target), "unset": db_unset(target)}


def label(target: str) -> str:
    return "Supabase" if target == "supabase" else "local"


def counts(target: str) -> dict:
    if target == "supabase":
        url = require_secret("supabase_session_url", "The Supabase session pooler string")
        env = {"DATABASE_URL": url}
    else:
        local_db_guard()
        env = {"DATABASE_URL": None}
    try:
        res = run_quick([NPM, "run", "-s", "db:counts"], env, timeout=120)
    except subprocess.TimeoutExpired:
        raise ApiFail(504, f"The {label(target)} database did not answer within 2 minutes.") from None
    line = next((ln for ln in reversed(res.stdout.strip().splitlines()) if ln.startswith("{")), None)
    if not line:
        raise ApiFail(500, (res.stderr or res.stdout or "No output").strip()[-600:])
    data = json.loads(line)
    if data.get("error"):
        raise ApiFail(502, data["error"])
    data["at"] = jobs.now_iso()
    _counts_cache[target] = data
    return data


def list_backups() -> list[dict]:
    out = []
    if store.BACKUPS_DIR.exists():
        for p in store.BACKUPS_DIR.rglob("*"):
            if p.is_file() and p.suffix in (".json", ".db"):
                rel = p.relative_to(store.BACKUPS_DIR).as_posix()
                parts = rel.split("/")
                source = parts[0] if parts[0] in ("local", "supabase") and len(parts) > 1 else "other"
                note = parts[1] if len(parts) > 2 else ""
                st = p.stat()
                out.append({"file": rel, "name": p.name, "source": source, "note": note, "size": st.st_size, "modified": dt.datetime.fromtimestamp(st.st_mtime, dt.timezone.utc).isoformat(timespec="seconds"), "restorable": p.suffix == ".json"})
    out.sort(key=lambda b: b["modified"], reverse=True)
    return out


def backup_path(rel: str) -> Path:
    p = (store.BACKUPS_DIR / rel).resolve()
    if store.BACKUPS_DIR.resolve() not in p.parents or not p.is_file():
        raise ApiFail(404, "That backup file does not exist.")
    return p


def cron_secret() -> str:
    value = store.get_secret("cron_secret")
    if not value:
        value = secrets.token_hex(32)
        store.set_secret("cron_secret", value)
    return value


def hosting_env(provider: str) -> dict[str, str]:
    serverless = provider in ("netlify", "vercel")
    url = require_secret("supabase_transaction_url" if serverless else "supabase_session_url", "The Supabase transaction pooler string" if serverless else "The Supabase session pooler string")
    env = {"DATABASE_URL": url, "DATABASE_POOL_SIZE": "3" if serverless else "5", "CRON_SECRET": cron_secret(), "MYSEED_SHOW_DEMO_ACCOUNTS": "0"}
    if provider == "render":
        env["NODE_VERSION"] = "22"
    return env


# ---------------------------------------------------------------------------
# Windows sign-in startup
# ---------------------------------------------------------------------------


def startup_file() -> Path | None:
    appdata = os.environ.get("APPDATA")
    if not jobs.IS_WIN or not appdata:
        return None
    return Path(appdata) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup" / "Myseed Control Panel.cmd"


def set_startup(enabled: bool) -> None:
    f = startup_file()
    if not f:
        raise ApiFail(400, "Starting at sign-in is only available on Windows.")
    if enabled:
        f.write_text(f'@echo off\r\nstart "" "{jobs.python_for_background()}" "{Path(__file__).resolve()}" start --no-browser\r\n', encoding="utf-8")
    elif f.exists():
        f.unlink()


# ---------------------------------------------------------------------------
# Git
# ---------------------------------------------------------------------------


def git_info() -> dict:
    def g(*args: str) -> str:
        r = run_quick([GIT, *args], timeout=20)
        return r.stdout.strip()

    try:
        branch = g("rev-parse", "--abbrev-ref", "HEAD")
    except FileNotFoundError:
        return {"available": False}
    if not branch:
        return {"available": False}
    upstream = g("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
    ahead = behind = 0
    if upstream:
        lr = g("rev-list", "--left-right", "--count", f"{upstream}...HEAD").split()
        if len(lr) == 2:
            behind, ahead = int(lr[0]), int(lr[1])
    changes = []
    for line in g("status", "--porcelain=v1").splitlines():
        if len(line) > 3:
            changes.append({"status": line[:2].strip() or "?", "file": line[3:]})
    log = []
    for line in g("log", "-n", "12", "--pretty=format:%h\x1f%s\x1f%an\x1f%cI").splitlines():
        parts = line.split("\x1f")
        if len(parts) == 4:
            log.append({"hash": parts[0], "subject": parts[1], "author": parts[2], "date": parts[3]})
    return {"available": True, "branch": branch, "upstream": upstream or None, "remote": g("remote", "get-url", "origin") or None, "ahead": ahead, "behind": behind, "changes": changes, "log": log}


# ---------------------------------------------------------------------------
# Hosting providers
# ---------------------------------------------------------------------------

PROVIDERS = ("netlify", "vercel", "render")


def client(provider: str):
    return {"netlify": providers.Netlify, "vercel": providers.Vercel, "render": providers.Render}[provider]()


def provider_state(provider: str, deep: bool = True) -> dict:
    cfg = store.load()[provider]
    token_hint = store.secret_hint(f"{provider}_token")
    out: dict = {"connected": bool(token_hint), "token_hint": token_hint, "config": cfg, "token_url": client(provider).TOKEN_URL}
    if not token_hint or not deep:
        return out
    c = client(provider)
    try:
        if provider == "netlify":
            out["user"] = c.user()
            if cfg.get("site_id"):
                out["target"] = c.site(cfg["site_id"])
                out["deploys"] = c.deploys(cfg["site_id"])
                out["env"] = c.env(out["target"]["account_id"], cfg["site_id"])
        elif provider == "vercel":
            out["user"] = c.user()
            if cfg.get("project_id"):
                out["target"] = c.project(cfg["project_id"])
                out["deploys"] = c.deployments(cfg["project_id"])
                out["env"] = c.env(cfg["project_id"])
        else:
            out["user"] = (c.owners() or [{}])[0]
            if cfg.get("service_id"):
                out["target"] = c.service(cfg["service_id"])
                out["deploys"] = c.deploys(cfg["service_id"])
                out["env"] = c.env(cfg["service_id"])
    except providers.ApiError as err:
        out["error"] = str(err)
    return out


def provider_targets(provider: str) -> list[dict]:
    c = client(provider)
    return c.sites() if provider == "netlify" else c.projects() if provider == "vercel" else c.services()


def select_target(provider: str, target_id: str) -> dict:
    c = client(provider)
    if provider == "netlify":
        s = c.site(target_id)
        store.update(lambda cfg: cfg["netlify"].update(site_id=s["id"], site_name=s["name"], site_url=s["url"], account_id=s["account_id"]))
        return s
    if provider == "vercel":
        p = c.project(target_id)
        store.update(lambda cfg: cfg["vercel"].update(project_id=p["id"], project_name=p["name"]))
        return p
    s = c.service(target_id)
    store.update(lambda cfg: cfg["render"].update(service_id=s["id"], service_name=s["name"]))
    return s


def target_id(provider: str) -> str:
    cfg = store.load()[provider]
    tid = cfg.get({"netlify": "site_id", "vercel": "project_id", "render": "service_id"}[provider])
    if not tid:
        raise ApiFail(400, "Choose a site or project first.")
    return tid


def set_env(provider: str, key: str, value: str) -> None:
    c = client(provider)
    tid = target_id(provider)
    if provider == "netlify":
        c.set_env(store.load()["netlify"]["account_id"], tid, key, value)
    else:
        c.set_env(tid, key, value)


def delete_env(provider: str, key: str) -> None:
    c = client(provider)
    tid = target_id(provider)
    if provider == "netlify":
        c.delete_env(store.load()["netlify"]["account_id"], tid, key)
    else:
        c.delete_env(tid, key)


def deploy(provider: str, mode: str, clear_cache: bool, message: str | None) -> dict:
    tid = target_id(provider)
    msg = (message or f"Deployed from the control panel {stamp()}")[:120]
    if provider == "netlify":
        if mode == "git":
            client("netlify").trigger_build(tid, clear_cache)
            return {"started": "remote", "message": "Netlify is building the latest commit from your repository."}
        step = {
            "title": "Build and deploy to Netlify (production)",
            "cmd": [NPX, "-y", "netlify-cli@latest", "deploy", "--build", "--prod", "--site", tid, "--message", msg],
            "env": {"NETLIFY_AUTH_TOKEN": {"secret": "netlify_token"}, "NETLIFY_SITE_ID": tid},
        }
        job = jobs.create_job("Deploy to Netlify", [step], group="netlify", locks=["Next.js build folder"], url=store.load()["netlify"].get("site_url"))
        return {"started": "job", "job": job}
    if provider == "vercel":
        cfg = store.load()["vercel"]
        org = cfg.get("team_id") or cfg.get("user_id")
        if not org:
            raise ApiFail(400, "Reconnect Vercel so the panel knows your account id.")
        step = {
            "title": "Upload and deploy to Vercel (production)",
            "cmd": [NPX, "-y", "vercel@latest", "deploy", "--prod", "--yes", "--token", "{secret:vercel_token}"] + (["--force"] if clear_cache else []),
            "env": {"VERCEL_ORG_ID": org, "VERCEL_PROJECT_ID": tid},
        }
        job = jobs.create_job("Deploy to Vercel", [step], group="vercel")
        return {"started": "job", "job": job}
    client("render").trigger_deploy(tid, clear_cache)
    return {"started": "remote", "message": "Render is building the latest commit from your repository."}


# ---------------------------------------------------------------------------
# Auto backup scheduler
# ---------------------------------------------------------------------------


def auto_backup_loop() -> None:
    while True:
        time.sleep(60)
        try:
            cfg = store.load()["auto_backup"]
            if not cfg.get("enabled") or not store.get_secret("supabase_session_url"):
                continue
            last = cfg.get("last_run")
            due = not last or time.time() - dt.datetime.fromisoformat(last).timestamp() >= float(cfg.get("hours", 24)) * 3600
            if not due:
                continue
            store.update(lambda c: c["auto_backup"].update(last_run=jobs.now_iso()))
            jobs.create_job("Scheduled Supabase backup", [backup_step("supabase", f"backups/supabase/auto-{stamp()}")], group="backup", locks=["Supabase database"])
            keep = int(cfg.get("keep", 14))
            autos = sorted((p for p in (store.BACKUPS_DIR / "supabase").glob("auto-*") if p.is_dir()), key=lambda p: p.name)
            for old in autos[:-keep] if keep > 0 else []:
                shutil.rmtree(old, ignore_errors=True)
        except jobs.Busy:
            pass
        except Exception as err:  # noqa: BLE001
            print(f"[auto-backup] {err}", flush=True)


# ---------------------------------------------------------------------------
# HTTP API
# ---------------------------------------------------------------------------

ROUTES: list[tuple[str, re.Pattern, object, bool]] = []


def route(method: str, pattern: str, public: bool = False):
    def deco(fn):
        ROUTES.append((method, re.compile(f"^{pattern}$"), fn, public))
        return fn

    return deco


@route("GET", "/api/session", public=True)
def api_session(h, body, m):
    return {"authenticated": h.authed(), "has_password": store.has_password(), "version": VERSION}


@route("POST", "/api/setup", public=True)
def api_setup(h, body, m):
    if store.has_password():
        raise ApiFail(403, "A password is already set. Sign in instead.")
    store.set_password(str(body.get("password", "")))
    return h.start_session()


@route("POST", "/api/login", public=True)
def api_login(h, body, m):
    now = time.time()
    recent = [t for t in _failures if now - t < 300]
    _failures[:] = recent
    if len(recent) >= 5:
        raise ApiFail(429, "Too many wrong passwords. Wait five minutes and try again.")
    if not store.check_password(str(body.get("password", ""))):
        _failures.append(now)
        time.sleep(0.8)
        raise ApiFail(401, "That password is not right.")
    return h.start_session()


@route("POST", "/api/logout")
def api_logout(h, body, m):
    h.end_session()
    return {"ok": True}


@route("POST", "/api/password")
def api_password(h, body, m):
    if not store.check_password(str(body.get("current", ""))):
        raise ApiFail(400, "The current password is not right.")
    store.set_password(str(body.get("new", "")))
    with _sessions_lock:
        _sessions.clear()
    return h.start_session()


@route("GET", "/api/overview")
def api_overview(h, body, m):
    cfg = store.load()
    running = jobs.running_jobs()
    dev = next((j for j in running if j.get("group") == "local-dev"), None)
    return {
        "panel": {"version": VERSION, "pid": os.getpid(), "port": cfg["port"], "uptime": int(time.time() - STARTED_AT), "encryption": store.ENCRYPTION, "project": str(store.PROJECT_DIR), "python": sys.version.split()[0]},
        "supabase": {"session": store.secret_hint("supabase_session_url"), "transaction": store.secret_hint("supabase_transaction_url"), "token": store.secret_hint("supabase_token"), "project": cfg["supabase"]},
        "hosting": {p: provider_state(p, deep=False) for p in PROVIDERS},
        "counts": _counts_cache,
        "jobs": {"running": running, "recent": jobs.list_jobs()[:6]},
        "dev": {"job": dev, "port_busy": port_open(DEV_PORT), "url": f"http://localhost:{DEV_PORT}"},
        "app_db": app_database(),
        "backups": list_backups()[:5],
        "auto_backup": cfg["auto_backup"],
    }


@route("POST", "/api/db/counts")
def api_counts(h, body, m):
    return counts("supabase" if body.get("target") == "supabase" else "local")


# --- Supabase ---------------------------------------------------------------


@route("GET", "/api/supabase")
def api_supabase(h, body, m):
    cfg = store.load()["supabase"]
    out = {"session": store.secret_hint("supabase_session_url"), "transaction": store.secret_hint("supabase_transaction_url"), "token": store.secret_hint("supabase_token"), "project": cfg, "token_url": providers.Supabase.TOKEN_URL, "counts": _counts_cache, "app_db": app_database()}
    if out["token"] and cfg.get("project_ref"):
        try:
            out["project_status"] = providers.Supabase().project(cfg["project_ref"])
        except providers.ApiError as err:
            out["error"] = str(err)
    return out


@route("POST", "/api/supabase/urls")
def api_supabase_urls(h, body, m):
    warnings = []
    for key, field, port in (("supabase_session_url", "session", "5432"), ("supabase_transaction_url", "transaction", "6543")):
        value = (body.get(field) or "").strip()
        if not value:
            continue
        if not re.match(r"^postgres(ql)?://", value):
            raise ApiFail(400, f"The {field} string must start with postgresql://")
        if "[YOUR-PASSWORD]" in value:
            raise ApiFail(400, "Replace [YOUR-PASSWORD] with your database password first.")
        if f":{port}/" not in value:
            warnings.append(f"The {field} pooler normally uses port {port}.")
        store.set_secret(key, value)
    return {"ok": True, "warnings": warnings}


@route("POST", "/api/supabase/forget")
def api_supabase_forget(h, body, m):
    for key in ("supabase_session_url", "supabase_transaction_url", "supabase_token"):
        store.set_secret(key, None)
    store.update(lambda c: c["supabase"].update(project_ref=None, project_name=None))
    return {"ok": True}


@route("POST", "/api/supabase/token")
def api_supabase_token(h, body, m):
    token = (body.get("token") or "").strip()
    projects = providers.Supabase(token).projects()
    store.set_secret("supabase_token", token)
    return {"projects": projects}


@route("GET", "/api/supabase/projects")
def api_supabase_projects(h, body, m):
    return {"projects": providers.Supabase().projects()}


@route("POST", "/api/supabase/select")
def api_supabase_select(h, body, m):
    p = providers.Supabase().project(str(body.get("ref")))
    store.update(lambda c: c["supabase"].update(project_ref=p["ref"], project_name=p["name"]))
    return p


@route("POST", "/api/supabase/build-urls")
def api_supabase_build(h, body, m):
    ref = store.load()["supabase"].get("project_ref")
    if not ref:
        raise ApiFail(400, "Choose a Supabase project first.")
    password = str(body.get("password") or "")
    if not password:
        raise ApiFail(400, "Enter the database password you chose when creating the project.")
    urls = providers.Supabase().connection_strings(ref, password)
    store.set_secret("supabase_session_url", urls["session"])
    store.set_secret("supabase_transaction_url", urls["transaction"])
    return {"session": store.secret_hint("supabase_session_url"), "transaction": store.secret_hint("supabase_transaction_url")}


@route("POST", "/api/supabase/(restore|pause)")
def api_supabase_power(h, body, m):
    ref = store.load()["supabase"].get("project_ref")
    if not ref:
        raise ApiFail(400, "Choose a Supabase project first.")
    s = providers.Supabase()
    (s.restore if m.group(1) == "restore" else s.pause)(ref)
    return {"ok": True}


# --- Data movement -----------------------------------------------------------


@route("POST", "/api/data/push")
def api_push(h, body, m):
    require_secret("supabase_session_url", "The Supabase session pooler string")
    local_db_guard()
    s = stamp()
    steps = [
        backup_step("supabase", f"backups/supabase/{s}-before-push", "Safety backup of Supabase (so this can be undone)"),
        backup_step("local", f"backups/local/{s}-push", "Back up the local database"),
        restore_step("supabase", f"{{latest:backups/local/{s}-push}}", "Replace the Supabase data with the local data"),
    ]
    return {"job": jobs.create_job("Push local data to Supabase", steps, group="data", locks=["local database", "Supabase database"])}


@route("POST", "/api/data/pull")
def api_pull(h, body, m):
    require_secret("supabase_session_url", "The Supabase session pooler string")
    local_db_guard()
    s = stamp()
    steps = [
        backup_step("local", f"backups/local/{s}-before-pull", "Safety backup of the local database (so this can be undone)"),
        backup_step("supabase", f"backups/supabase/{s}-pull", "Back up Supabase"),
        restore_step("local", f"{{latest:backups/supabase/{s}-pull}}", "Replace the local data with the Supabase data"),
    ]
    return {"job": jobs.create_job("Pull Supabase data to this computer", steps, group="data", locks=["local database", "Supabase database"])}


@route("POST", "/api/data/backup")
def api_backup(h, body, m):
    target = "supabase" if body.get("target") == "supabase" else "local"
    if target == "supabase":
        require_secret("supabase_session_url", "The Supabase session pooler string")
    else:
        local_db_guard()
    lock = "Supabase database" if target == "supabase" else "local database"
    return {"job": jobs.create_job(f"Back up the {label(target)} database", [backup_step(target, f"backups/{target}/{stamp()}-manual")], group="backup", locks=[lock])}


@route("POST", "/api/data/restore")
def api_restore(h, body, m):
    target = "supabase" if body.get("target") == "supabase" else "local"
    file = backup_path(str(body.get("file", "")))
    if file.suffix != ".json":
        raise ApiFail(400, "Only .json backups can be restored.")
    if target == "supabase":
        require_secret("supabase_session_url", "The Supabase session pooler string")
    else:
        local_db_guard()
    s = stamp()
    steps = [
        backup_step(target, f"backups/{target}/{s}-before-restore", f"Safety backup of the {label(target)} database"),
        restore_step(target, str(file), f"Restore {file.name} into the {label(target)} database"),
    ]
    lock = "Supabase database" if target == "supabase" else "local database"
    return {"job": jobs.create_job(f"Restore a backup into {label(target)}", steps, group="data", locks=[lock])}


@route("GET", "/api/backups")
def api_backups(h, body, m):
    return {"backups": list_backups(), "folder": str(store.BACKUPS_DIR)}


@route("POST", "/api/backups/delete")
def api_backup_delete(h, body, m):
    p = backup_path(str(body.get("file", "")))
    p.unlink()
    try:
        p.parent.rmdir()  # remove the stamp folder when it is now empty
    except OSError:
        pass
    return {"ok": True}


@route("POST", "/api/backups/reveal")
def api_backup_reveal(h, body, m):
    folder = backup_path(str(body["file"])).parent if body.get("file") else store.BACKUPS_DIR
    folder.mkdir(parents=True, exist_ok=True)
    if jobs.IS_WIN:
        os.startfile(folder)  # type: ignore[attr-defined]
    else:
        subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", str(folder)])
    return {"ok": True}


# --- Hosting -----------------------------------------------------------------

PROV = "(netlify|vercel|render)"


@route("GET", f"/api/hosting/{PROV}")
def api_host(h, body, m):
    return provider_state(m.group(1))


@route("POST", f"/api/hosting/{PROV}/token")
def api_host_token(h, body, m):
    p = m.group(1)
    token = (body.get("token") or "").strip()
    if not token:
        raise ApiFail(400, "Paste your access token.")
    c = {"netlify": providers.Netlify, "vercel": providers.Vercel, "render": providers.Render}[p](token)
    if p == "vercel":
        c.team_id = None
        user = c.user()
        store.update(lambda cfg: cfg["vercel"].update(user_id=user["id"], team_id=None))
    elif p == "netlify":
        user = c.user()
    else:
        user = (c.owners() or [{}])[0]
    store.set_secret(f"{p}_token", token)
    return {"user": user}


@route("POST", f"/api/hosting/{PROV}/disconnect")
def api_host_disconnect(h, body, m):
    p = m.group(1)
    store.set_secret(f"{p}_token", None)
    store.update(lambda cfg: cfg[p].update({k: None for k in cfg[p]}))
    return {"ok": True}


@route("GET", f"/api/hosting/{PROV}/targets")
def api_host_targets(h, body, m):
    p = m.group(1)
    out: dict = {"targets": provider_targets(p)}
    if p == "vercel":
        out["teams"] = client("vercel").teams()
    return out


@route("POST", "/api/hosting/vercel/team")
def api_vercel_team(h, body, m):
    team = body.get("team_id") or None
    store.update(lambda cfg: cfg["vercel"].update(team_id=team, project_id=None, project_name=None))
    return {"ok": True}


@route("POST", f"/api/hosting/{PROV}/select")
def api_host_select(h, body, m):
    return select_target(m.group(1), str(body.get("id")))


@route("POST", "/api/hosting/(netlify|vercel)/create")
def api_host_create(h, body, m):
    p = m.group(1)
    name = re.sub(r"[^a-z0-9-]", "-", str(body.get("name", "")).lower()).strip("-")
    if len(name) < 3:
        raise ApiFail(400, "Use a name with at least 3 letters, digits or dashes.")
    created = client(p).create_site(name) if p == "netlify" else client(p).create_project(name)
    return select_target(p, created["id"])


@route("POST", f"/api/hosting/{PROV}/env/sync")
def api_host_env_sync(h, body, m):
    p = m.group(1)
    values = hosting_env(p)
    for k, v in values.items():
        set_env(p, k, v)
    return {"keys": list(values)}


@route("POST", f"/api/hosting/{PROV}/env/set")
def api_host_env_set(h, body, m):
    key = str(body.get("key", "")).strip()
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
        raise ApiFail(400, "Variable names use letters, digits and underscores.")
    set_env(m.group(1), key, str(body.get("value", "")))
    return {"ok": True}


@route("POST", f"/api/hosting/{PROV}/env/delete")
def api_host_env_delete(h, body, m):
    delete_env(m.group(1), str(body.get("key", "")))
    return {"ok": True}


@route("POST", f"/api/hosting/{PROV}/deploy")
def api_host_deploy(h, body, m):
    return deploy(m.group(1), str(body.get("mode", "local")), bool(body.get("clear_cache")), body.get("message"))


@route("POST", "/api/hosting/(netlify|vercel)/cancel")
def api_host_cancel(h, body, m):
    p = m.group(1)
    (client(p).cancel_deploy if p == "netlify" else client(p).cancel_deployment)(str(body.get("id")))
    return {"ok": True}


# --- Local app ---------------------------------------------------------------

LOCAL_TASKS = {
    "dev": ("Local dev server", [NPM, "run", "dev"], "service", ["local database", "Next.js build folder"], f"http://localhost:{DEV_PORT}"),
    "build": ("Production build", [NPM, "run", "build"], "task", ["Next.js build folder"], None),
    "start": ("Local production server", [NPM, "run", "start"], "service", ["local database", "Next.js build folder"], f"http://localhost:{DEV_PORT}"),
    "install": ("Install packages", [NPM, "install"], "task", ["node_modules"], None),
    "typecheck": ("Type check", [NPM, "run", "typecheck"], "task", [], None),
    "verify": ("Workflow verification suite", [NPM, "run", "verify"], "task", [], None),
    "status": ("Local database row counts", [NPM, "run", "db:status"], "task", ["local database"], None),
    "templates": ("Regenerate import templates", [NPM, "run", "templates"], "task", [], None),
}


@route("POST", "/api/local/(\\w+)")
def api_local(h, body, m):
    key = m.group(1)
    if key not in LOCAL_TASKS:
        raise ApiFail(404, "Unknown task.")
    title, cmd, kind, locks, url = LOCAL_TASKS[key]
    if kind == "service" and app_database():
        locks = [lk for lk in locks if lk != "local database"]  # the app reads DATABASE_URL from .env, not data/pg
    if "local database" in locks:
        local_db_guard()
    step = {"title": title, "cmd": cmd, "unset": ["DATABASE_URL"]}
    return {"job": jobs.create_job(title, [step], kind=kind, group="local-dev" if kind == "service" else "local", locks=locks, url=url)}


# --- Git -----------------------------------------------------------------------


@route("GET", "/api/git")
def api_git(h, body, m):
    return git_info()


@route("POST", "/api/git/fetch")
def api_git_fetch(h, body, m):
    r = run_quick([GIT, "fetch", "--prune"], timeout=90)
    if r.returncode != 0:
        raise ApiFail(502, (r.stderr or r.stdout).strip()[-500:] or "git fetch failed")
    return git_info()


@route("POST", "/api/git/pull")
def api_git_pull(h, body, m):
    return {"job": jobs.create_job("Pull code from GitHub", [{"title": "git pull", "cmd": [GIT, "pull", "--ff-only"]}], group="git", locks=["git"])}


@route("POST", "/api/git/commit-push")
def api_git_commit(h, body, m):
    message = str(body.get("message", "")).strip()
    if not message:
        # Nothing new to commit: just push commits that are already made.
        return {"job": jobs.create_job("Push to GitHub", [{"title": "Push to GitHub", "cmd": [GIT, "push"]}], group="git", locks=["git"])}
    steps = [
        {"title": "Stage all changes", "cmd": [GIT, "add", "-A"]},
        {"title": "Commit", "cmd": [GIT, "commit", "-m", message]},
        {"title": "Push to GitHub", "cmd": [GIT, "push"]},
    ]
    return {"job": jobs.create_job("Commit and push to GitHub", steps, group="git", locks=["git"])}


# --- Jobs ----------------------------------------------------------------------


@route("GET", "/api/jobs")
def api_jobs(h, body, m):
    return {"jobs": jobs.list_jobs()}


@route("GET", "/api/jobs/([0-9a-z\\-]+)/log")
def api_job_log(h, body, m):
    return jobs.read_log(m.group(1), int(h.query.get("offset", ["0"])[0] or 0))


@route("POST", "/api/jobs/([0-9a-z\\-]+)/cancel")
def api_job_cancel(h, body, m):
    return jobs.cancel_job(m.group(1))


@route("POST", "/api/jobs/([0-9a-z\\-]+)/delete")
def api_job_delete(h, body, m):
    jobs.delete_job(m.group(1))
    return {"ok": True}


@route("POST", "/api/jobs/([0-9a-z\\-]+)/rerun")
def api_job_rerun(h, body, m):
    spec = json.loads((jobs.job_dir(m.group(1)) / "job.json").read_text(encoding="utf-8"))
    if any("{latest:" in str(a) for s in spec["steps"] for a in s["cmd"]):
        raise ApiFail(400, "Run push, pull or restore again from its own page so a fresh backup is taken first.")
    if "local database" in spec.get("locks", []):
        local_db_guard()
    return {"job": jobs.create_job(spec["title"], spec["steps"], kind=spec.get("kind", "task"), group=spec.get("group"), locks=spec.get("locks"), url=spec.get("url"))}


# --- Settings and shutdown -------------------------------------------------------


@route("GET", "/api/settings")
def api_settings(h, body, m):
    cfg = store.load()
    f = startup_file()
    return {"open_browser": cfg["open_browser"], "auto_backup": cfg["auto_backup"], "jobs_keep": cfg["jobs_keep"], "port": cfg["port"], "startup": bool(f and f.exists()), "startup_available": f is not None, "encryption": store.ENCRYPTION, "state_dir": str(store.STATE_DIR)}


@route("POST", "/api/settings")
def api_settings_save(h, body, m):
    def apply(cfg):
        if "open_browser" in body:
            cfg["open_browser"] = bool(body["open_browser"])
        if "jobs_keep" in body:
            cfg["jobs_keep"] = max(10, min(500, int(body["jobs_keep"])))
        if "port" in body:
            cfg["port"] = max(1024, min(65535, int(body["port"])))
        if isinstance(body.get("auto_backup"), dict):
            ab = body["auto_backup"]
            cfg["auto_backup"].update(enabled=bool(ab.get("enabled")), hours=max(1, min(720, float(ab.get("hours", 24)))), keep=max(1, min(365, int(ab.get("keep", 14)))))

    store.update(apply)
    if "startup" in body:
        set_startup(bool(body["startup"]))
    return api_settings(h, body, m)


@route("POST", "/api/shutdown")
def api_shutdown(h, body, m):
    stopped = jobs.stop_all() if body.get("stop_jobs", True) else 0

    def later():
        time.sleep(0.6)
        shutdown_server()

    threading.Thread(target=later, daemon=True).start()
    return {"ok": True, "stopped_jobs": stopped}


def shutdown_server() -> None:
    try:
        store.PID_FILE.unlink(missing_ok=True)
    finally:
        if _server:
            threading.Thread(target=_server.shutdown, daemon=True).start()
        time.sleep(1)
        os._exit(0)


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "MyseedPanel"
    sys_version = ""

    # -- plumbing ---------------------------------------------------------
    def log_message(self, fmt, *args):  # quieter log: only API calls and errors
        if self.path.startswith("/api/") and "/log" not in self.path:
            sys.stdout.write(f"[{dt.datetime.now():%H:%M:%S}] {self.command} {self.path.split('?')[0]} {args[1] if len(args) > 1 else ''}\n")
            sys.stdout.flush()

    def _cookie(self, name: str) -> str | None:
        for part in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = part.strip().partition("=")
            if k == name:
                return v
        return None

    def authed(self) -> bool:
        token = self._cookie(SESSION_COOKIE)
        if not token:
            return False
        with _sessions_lock:
            exp = _sessions.get(token)
            if not exp or exp < time.time():
                _sessions.pop(token, None)
                return False
            _sessions[token] = time.time() + SESSION_HOURS * 3600
        return True

    def start_session(self) -> dict:
        token = secrets.token_urlsafe(32)
        with _sessions_lock:
            _sessions[token] = time.time() + SESSION_HOURS * 3600
        self._set_cookie = f"{SESSION_COOKIE}={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={SESSION_HOURS * 3600}"
        return {"authenticated": True}

    def end_session(self) -> None:
        token = self._cookie(SESSION_COOKIE)
        with _sessions_lock:
            _sessions.pop(token or "", None)
        self._set_cookie = f"{SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"

    def _headers(self, status: int, ctype: str, length: int, extra: dict | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        cookie = getattr(self, "_set_cookie", None)
        if cookie:
            self.send_header("Set-Cookie", cookie)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()

    def _json(self, status: int, data) -> None:
        raw = json.dumps(data).encode("utf-8")
        self._headers(status, "application/json; charset=utf-8", len(raw))
        self.wfile.write(raw)

    def _host_ok(self) -> bool:
        port = self.server.server_address[1]
        host = (self.headers.get("Host") or "").lower()
        return host in (f"127.0.0.1:{port}", f"localhost:{port}")

    # -- dispatch -----------------------------------------------------------
    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def _dispatch(self, method: str) -> None:
        self._set_cookie = None
        if not self._host_ok():  # blocks DNS-rebinding pages from reaching the panel
            return self._json(421, {"error": "Open the panel at http://127.0.0.1 or http://localhost."})
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path
        self.query = urllib.parse.parse_qs(parsed.query)
        if method == "GET" and path in STATIC:
            return self._static(STATIC[path])
        if method == "GET" and path == "/api/backups/download":
            if not self.authed():
                return self._json(401, {"error": "Sign in first."})
            return self._download(self.query.get("file", [""])[0])
        if method == "POST":
            origin = self.headers.get("Origin")
            if self.headers.get("X-Panel") != "1" or (origin and urllib.parse.urlsplit(origin).netloc.lower() != (self.headers.get("Host") or "").lower()):
                return self._json(403, {"error": "Request blocked."})
        for meth, pattern, fn, public in ROUTES:
            mt = pattern.match(path)
            if meth != method or not mt:
                continue
            if not public and not self.authed():
                return self._json(401, {"error": "Your session ended. Sign in again."})
            try:
                body = {}
                if method == "POST":
                    n = int(self.headers.get("Content-Length") or 0)
                    if n > 2_000_000:
                        raise ApiFail(413, "Request too large.")
                    body = json.loads(self.rfile.read(n) or b"{}") if n else {}
                return self._json(200, fn(self, body, mt))  # type: ignore[operator]
            except ApiFail as err:
                return self._json(err.status, {"error": str(err), **err.extra})
            except jobs.Busy as err:
                return self._json(409, {"error": str(err), "code": "BUSY", "holder": err.holder})
            except providers.ApiError as err:
                return self._json(502, {"error": str(err)})
            except (ValueError, FileNotFoundError) as err:
                return self._json(400, {"error": str(err)})
            except Exception as err:  # noqa: BLE001
                import traceback

                traceback.print_exc()
                return self._json(500, {"error": f"Unexpected error: {err}"})
        self._json(404, {"error": "Not found"})

    def _static(self, name: str) -> None:
        p = WEB_DIR / name
        raw = p.read_bytes()
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        self._headers(200, ctype, len(raw))
        self.wfile.write(raw)

    def _download(self, rel: str) -> None:
        try:
            p = backup_path(rel)
        except ApiFail as err:
            return self._json(err.status, {"error": str(err)})
        size = p.stat().st_size
        self._headers(200, "application/octet-stream", size, {"Content-Disposition": f'attachment; filename="{p.name}"'})
        with open(p, "rb") as f:
            shutil.copyfileobj(f, self.wfile)


# ---------------------------------------------------------------------------
# Process management and CLI
# ---------------------------------------------------------------------------


def panel_url(port: int) -> str:
    return f"http://127.0.0.1:{port}/"


def running_panel() -> tuple[int, int] | None:
    """(pid, port) of a panel that answers, or None."""
    try:
        info = json.loads(store.PID_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not jobs.pid_alive(info.get("pid")):
        return None
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{info['port']}/api/session", timeout=2) as r:
            if r.status == 200:
                return info["pid"], info["port"]
    except OSError:
        return None
    return None


def serve() -> None:
    global _server
    store.ensure_dirs()
    port = int(store.load()["port"])
    try:
        _server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except OSError as err:
        print(f"Port {port} is busy ({err}). Change it with: control_panel.py serve --port <n>", flush=True)
        sys.exit(1)
    _server.daemon_threads = True
    store.PID_FILE.write_text(json.dumps({"pid": os.getpid(), "port": port, "started": jobs.now_iso()}), encoding="utf-8")
    threading.Thread(target=auto_backup_loop, daemon=True).start()
    print(f"Myseed control panel {VERSION} on {panel_url(port)} (pid {os.getpid()})", flush=True)
    try:
        _server.serve_forever()
    finally:
        store.PID_FILE.unlink(missing_ok=True)


def start(open_browser: bool = True) -> None:
    store.ensure_dirs()
    found = running_panel()
    if not found:
        log = store.LOG_FILE
        if log.exists() and log.stat().st_size > 2_000_000:
            log.replace(log.with_suffix(".old.log"))
        jobs.spawn_detached([jobs.python_for_background(), "-u", str(Path(__file__).resolve()), "serve"], store.PROJECT_DIR, log)
        for _ in range(60):
            time.sleep(0.25)
            found = running_panel()
            if found:
                break
        if not found:
            print(f"The panel did not start. See {store.LOG_FILE}")
            sys.exit(1)
        print(f"Control panel started in the background (pid {found[0]}).")
    else:
        print(f"Control panel is already running (pid {found[0]}).")
    url = panel_url(found[1])
    print(f"Open {url}  -  stop it from the panel or with: python control-panel/control_panel.py stop")
    if open_browser and store.load().get("open_browser", True):
        webbrowser.open(url)


def stop(keep_jobs: bool) -> None:
    stopped = 0 if keep_jobs else jobs.stop_all()
    found = running_panel()
    if found:
        jobs.kill_tree(found[0])
    store.PID_FILE.unlink(missing_ok=True)
    print(f"Stopped {'the panel' if found else 'nothing (the panel was not running)'}" + (f" and {stopped} job(s)." if stopped else "."))


def status() -> None:
    found = running_panel()
    print(f"Panel: running on {panel_url(found[1])} (pid {found[0]})" if found else "Panel: not running")
    running = jobs.running_jobs()
    print(f"Running jobs: {len(running)}")
    for j in running:
        print(f"  - {j['title']} (since {j.get('started') or j.get('created')})")


def main(argv: list[str]) -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")  # never crash on a console that cannot print a character
        except (AttributeError, ValueError):
            pass
    cmd = argv[0] if argv else "start"
    if cmd == "_run-job":
        sys.exit(jobs.run_wrapper(Path(argv[1])))
    if "--port" in argv:
        port = int(argv[argv.index("--port") + 1])
        store.update(lambda c: c.__setitem__("port", port))
    if cmd == "start":
        start(open_browser="--no-browser" not in argv)
    elif cmd == "serve":
        serve()
    elif cmd == "stop":
        stop(keep_jobs="--keep-jobs" in argv)
    elif cmd == "status":
        status()
    elif cmd == "open":
        found = running_panel()
        webbrowser.open(panel_url(found[1])) if found else start()
    elif cmd == "set-password":
        import getpass

        pw = getpass.getpass("New panel password (8+ characters): ")
        if pw != getpass.getpass("Repeat it: "):
            sys.exit("The passwords do not match.")
        store.set_password(pw)
        print("Password saved.")
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main(sys.argv[1:])
