"""Myseed Content Manager control panel: push and pull data with Supabase, deploy to a Hostinger VPS,
Netlify, Vercel or Render.

    python control-panel/control_panel.py            start in the background and open the browser
    python control-panel/control_panel.py status     is it running, and which jobs are running
    python control-panel/control_panel.py stop       stop every running job and the panel
    python control-panel/control_panel.py stop --keep-jobs
    python control-panel/control_panel.py set-password
    python control-panel/control_panel.py serve      run in this terminal (for debugging)

The panel runs as its own background process and listens on 127.0.0.1 only, on port 8765 (the next free
one if that is taken), at http://content-manager.localhost:8765/. It only ever manages the project it sits in:
it checks that a running panel belongs to this folder before reusing it, so another project's panel (the
MySeed Academy one uses 8766) is never opened by mistake. Closing the browser
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
import ssl
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.error
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
PANEL_NAME = "Myseed Content Manager"
NPM = "npm"
NPX = "npx"
GIT = "git"

STARTED_AT = time.time()
_sessions: dict[str, float] = {}
_sessions_lock = threading.Lock()
_failures: list[float] = []
_counts_cache: dict[str, dict] = {}
_server = None  # PanelServer


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


def run_quick(args: list[str], env: dict | None = None, timeout: int = 60, stdin: str | None = None) -> subprocess.CompletedProcess:
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
        input=stdin,
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


def restorable(p: Path) -> bool:
    return p.name.endswith((".json", ".json.gz"))


def list_backups() -> list[dict]:
    out = []
    if store.BACKUPS_DIR.exists():
        for p in store.BACKUPS_DIR.rglob("*"):
            if p.is_file() and (p.name.endswith((".json", ".json.gz", ".db"))):
                rel = p.relative_to(store.BACKUPS_DIR).as_posix()
                parts = rel.split("/")
                source = parts[0] if parts[0] in ("local", "supabase", "vps") and len(parts) > 1 else "other"
                note = parts[1] if len(parts) > 2 else ""
                st = p.stat()
                out.append({"file": rel, "name": p.name, "source": source, "note": note, "size": st.st_size, "modified": dt.datetime.fromtimestamp(st.st_mtime, dt.timezone.utc).isoformat(timespec="seconds"), "restorable": restorable(p)})
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


def same_dir(a: str | None, b: Path) -> bool:
    try:
        return bool(a) and os.path.normcase(os.path.realpath(a)) == os.path.normcase(os.path.realpath(str(b)))
    except (OSError, ValueError):
        return False


@route("GET", "/api/identity", public=True)
def api_identity(h, body, m):
    """Which panel this is. The launcher reads it so it never reuses another project's panel."""
    return {"app": store.APP_ID, "name": PANEL_NAME, "project": str(store.PROJECT_DIR), "version": VERSION}


def project_info() -> dict:
    remote = None
    try:
        remote = run_quick([GIT, "remote", "get-url", "origin"], timeout=10).stdout.strip() or None
    except (OSError, subprocess.TimeoutExpired):
        pass
    if remote:
        remote = re.sub(r"//[^/@]+@", "//", remote)  # never show a token in the URL
    name = None
    try:
        name = json.loads((store.PROJECT_DIR / "package.json").read_text(encoding="utf-8")).get("name")
    except (OSError, ValueError):
        pass
    return {"name": PANEL_NAME, "package": name, "folder": store.PROJECT_DIR.name, "path": str(store.PROJECT_DIR), "remote": remote}


_project_cache: dict = {}


@route("GET", "/api/session", public=True)
def api_session(h, body, m):
    out = {"authenticated": h.authed(), "has_password": store.has_password(), "version": VERSION, "name": PANEL_NAME}
    if out["authenticated"]:
        if not _project_cache:
            _project_cache.update(project_info())
        out["project"] = _project_cache
    return out


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
        "vps": {**store.load()["vps"], "connected": bool(store.get_secret("hostinger_token")), "url": site_url(store.load()["vps"])},
        "project": _project_cache or project_info(),
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
    if not restorable(file):
        raise ApiFail(400, "Only .json or .json.gz backups can be restored.")
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
        return host in (f"127.0.0.1:{port}", f"localhost:{port}", f"{store.PANEL_HOST}:{port}")

    # -- dispatch -----------------------------------------------------------
    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def _dispatch(self, method: str) -> None:
        self._set_cookie = None
        if not self._host_ok():  # blocks DNS-rebinding pages from reaching the panel
            return self._json(421, {"error": f"Open the panel at http://{store.PANEL_HOST}:{self.server.server_address[1]}/ (or 127.0.0.1)."})
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
# Hostinger VPS: the server, its SSH key, and deploys over SSH
# ---------------------------------------------------------------------------

HOSTINGER_API = os.environ.get("MYSEED_HOSTINGER_API") or "https://developers.hostinger.com"  # override for testing
KEY_NAME = "myseed-content-manager-panel"
DOMAIN_RE = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
VPS_BACKUPS = store.BACKUPS_DIR / "vps"
VPS_SERVICES = ("app", "postgres", "caddy")
_status_cache: dict = {}


def ssh_tool(name: str) -> str:
    """Windows' own OpenSSH first (it understands Windows paths and key permissions)."""
    if jobs.IS_WIN:
        p = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "OpenSSH" / f"{name}.exe"
        if p.exists():
            return str(p)
    return jobs.resolve_exe(name)


KEY_FILE = store.KEY_DIR / "myseed_cm_vps_ed25519"
KNOWN_HOSTS = store.KEY_DIR / "known_hosts"


def public_key() -> str | None:
    pub = KEY_FILE.with_suffix(".pub")
    return pub.read_text(encoding="utf-8").strip() if pub.exists() else None


def generate_key(replace: bool = False) -> str:
    store.KEY_DIR.mkdir(parents=True, exist_ok=True)
    if KEY_FILE.exists() and not replace:
        return public_key() or ""
    for f in (KEY_FILE, KEY_FILE.with_suffix(".pub")):
        f.unlink(missing_ok=True)
    r = run_quick([ssh_tool("ssh-keygen"), "-t", "ed25519", "-N", "", "-C", f"{KEY_NAME}@{socket.gethostname()}", "-f", str(KEY_FILE)], timeout=30)
    if r.returncode != 0:
        raise ApiFail(500, f"ssh-keygen failed: {(r.stderr or r.stdout).strip()}")
    if jobs.IS_WIN:
        # OpenSSH refuses a private key that other accounts can read.
        user = os.environ.get("USERNAME", "")
        subprocess.run(["icacls", str(KEY_FILE), "/inheritance:r", "/grant:r", f"{user}:F"], capture_output=True, creationflags=jobs.CREATE_NO_WINDOW)
    store.update(lambda c: c["vps"].update(key_installed=False, hostinger_key_id=None))
    return public_key() or ""


def vps() -> dict:
    return store.load()["vps"]


def require_server() -> dict:
    v = vps()
    if not v.get("host"):
        raise ApiFail(400, "Choose your VPS first (step 1).")
    if not KEY_FILE.exists():
        raise ApiFail(400, "Create the panel's SSH key first (step 2).")
    return v


def ssh_opts(port_flag: str, v: dict) -> list[str]:
    return [
        "-i", str(KEY_FILE),
        port_flag, str(v.get("ssh_port") or 22),
        "-o", "BatchMode=yes",
        "-o", "IdentitiesOnly=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", f"UserKnownHostsFile={KNOWN_HOSTS}",
        "-o", "ConnectTimeout=20",
        "-o", "ServerAliveInterval=30",
        "-o", "ServerAliveCountMax=6",
    ]


def target(v: dict) -> str:
    return f"{v.get('user') or 'root'}@{v['host']}"


def ssh_cmd(v: dict, remote: str) -> list[str]:
    return [ssh_tool("ssh"), *ssh_opts("-p", v), target(v), remote]


def scp_to(v: dict, local: list[str], remote_dir: str) -> list[str]:
    return [ssh_tool("scp"), "-q", *ssh_opts("-P", v), *local, f"{target(v)}:{remote_dir}"]


def scp_from(v: dict, remote: str, local: str) -> list[str]:
    return [ssh_tool("scp"), "-q", *ssh_opts("-P", v), f"{target(v)}:{remote}", local]


def q(s: str) -> str:
    """Single-quote for the remote shell."""
    return "'" + str(s).replace("'", "'\"'\"'") + "'"


def remote_root(v: dict) -> str:
    path = v.get("path") or "/opt/myseed-content-manager"
    if not re.fullmatch(r"/[A-Za-z0-9._/-]+", path) or path.rstrip("/") in ("", "/opt", "/root", "/home", "/var", "/etc", "/usr"):
        raise ApiFail(400, "The server folder must be its own absolute path such as /opt/myseed-content-manager.")
    return path.rstrip("/")


def remote_script(v: dict, args: str) -> str:
    root = remote_root(v)
    return f"APP_ROOT={q(root)} bash {q(root + '/incoming/deploy.sh')} {args}"


# --- Hostinger API ------------------------------------------------------------------


def hostinger(method: str, path: str, body: dict | None = None, token: str | None = None):
    token = token or store.get_secret("hostinger_token")
    if not token:
        raise ApiFail(400, "Connect your Hostinger API token first, or type the server address by hand.")
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(HOSTINGER_API + path, data=data, method=method, headers={"Authorization": f"Bearer {token}", "Accept": "application/json", "Content-Type": "application/json", "User-Agent": f"MyseedContentManagerPanel/{VERSION}"})
    try:
        ctx = ssl.create_default_context() if HOSTINGER_API.startswith("https") else None
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")[:400]
        try:
            detail = json.loads(detail).get("message") or detail
        except (ValueError, AttributeError):
            pass
        if err.code == 401:
            raise ApiFail(400, "Hostinger did not accept the API token. Create a new one in hPanel, Account, API.") from None
        if err.code == 404:
            raise ApiFail(404, f"Hostinger says it does not have that ({detail}).") from None
        if err.code >= 500:
            raise ApiFail(502, f"Hostinger's API is not answering right now (HTTP {err.code}). Try again in a few minutes, or type the server address by hand.") from None
        raise ApiFail(502, f"Hostinger API {err.code}: {detail}") from None
    except urllib.error.URLError as err:
        raise ApiFail(502, f"Could not reach Hostinger: {err.reason}") from None


def as_list(data) -> list:
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("data"), list):
        return data["data"]  # paginated answers
    return []


def machine_summary(m: dict) -> dict:
    ipv4 = [ip.get("address") for ip in (m.get("ipv4") or []) if isinstance(ip, dict) and ip.get("address")]
    tpl = m.get("template") or {}
    return {
        "id": m.get("id"),
        "hostname": m.get("hostname"),
        "state": m.get("state"),
        "plan": m.get("plan"),
        "ipv4": ipv4,
        "os": tpl.get("name") if isinstance(tpl, dict) else None,
        "cpus": m.get("cpus"),
        "memory_mb": m.get("memory"),
        "disk_mb": m.get("disk"),
    }


def machines(token: str | None = None) -> list[dict]:
    return [machine_summary(x) for x in as_list(hostinger("GET", "/api/vps/v1/virtual-machines", token=token))]


def key_body(key: str) -> str:
    """The key without its comment: Hostinger and authorized_keys compare on type and data."""
    return " ".join(key.split()[:2])


def find_account_key(key: str) -> dict | None:
    body = key_body(key)
    for k in as_list(hostinger("GET", "/api/vps/v1/public-keys")):
        if isinstance(k, dict) and key_body(str(k.get("key") or "")) == body:
            return k
    return None


# --- Settings sent to the server's .env ------------------------------------------------


EXTRA_ENV_RE = re.compile(r"^[A-Z][A-Z0-9_]*=.*$")
RESERVED_ENV = {"DOMAIN", "APP_URL", "DB_MODE", "DATABASE_URL", "COMPOSE_PROFILES", "APP_PORT", "POSTGRES_PASSWORD"}


def site_url(v: dict) -> str | None:
    if v.get("domain"):
        return f"https://{v['domain']}"
    return None


def env_lines(v: dict) -> list[str]:
    """KEY=value lines for env.sh. Secrets are {secret:...} placeholders, filled in only when the job runs and
    sent over SSH's standard input, so they never reach a command line or a log."""
    profiles = [p for p, on in (("caddy", v.get("proxy") == "caddy"), ("localdb", v.get("database") == "local")) if on]
    url = site_url(v) or f"http://{v.get('host')}:{v.get('app_port') or 3100}"
    lines = [
        f"DOMAIN={v.get('domain') or ''}",
        f"APP_URL={url}",
        f"DB_MODE={v.get('database') or 'local'}",
        f"COMPOSE_PROFILES={','.join(profiles)}",
        f"APP_PORT={int(v.get('app_port') or 3100)}",
        "MYSEED_SHOW_DEMO_ACCOUNTS=0",
        "TRUSTED_PROXY_HOPS=1",
        "DATABASE_POOL_SIZE=10",
        "CRON_SECRET={secret:cron_secret}",
    ]
    if v.get("database") == "supabase":
        lines.append("DATABASE_URL={secret:supabase_session_url}")
    if store.get_secret("vps_extra_env"):
        lines.append("{secret:vps_extra_env}")
    return lines


def check_ready_to_deploy(v: dict) -> None:
    if v.get("proxy") == "caddy" and not v.get("domain"):
        raise ApiFail(400, "Add the site's domain in step 3 first: Caddy needs it to get the HTTPS certificate.")
    if v.get("database") == "supabase":
        require_secret("supabase_session_url", "The Supabase session pooler string (Database page)")
    cron_secret()  # made once, kept in the panel


def upload_scripts_steps(v: dict) -> list[dict]:
    root = remote_root(v)
    scripts = [str(store.PROJECT_DIR / "deploy" / "vps" / n) for n in ("setup.sh", "env.sh", "deploy.sh")]
    for s in scripts:
        if not Path(s).exists():
            raise ApiFail(500, f"{s} is missing from this project.")
    return [
        {"title": "Prepare the server folder", "cmd": ssh_cmd(v, f"mkdir -p {q(root + '/incoming')} {q(root + '/backups/incoming')} && chmod 700 {q(root)}")},
        {"title": "Upload the server scripts", "cmd": scp_to(v, scripts, root + "/incoming/")},
        {"title": "Fix line endings", "cmd": ssh_cmd(v, f"sed -i 's/\\r$//' {q(root)}/incoming/*.sh && chmod +x {q(root)}/incoming/*.sh")},
    ]


def push_env_step(v: dict) -> dict:
    root = remote_root(v)
    return {"title": "Save settings on the server", "cmd": ssh_cmd(v, f"APP_ROOT={q(root)} bash {q(root + '/incoming/env.sh')}"), "stdin": env_lines(v)}


def finished_vps_jobs() -> None:
    """Marks setup and deploys as done only once their jobs succeed."""
    v = vps()
    for key in ("setup_pending_job", "deploy_pending"):
        pending = v.get(key)
        if not pending:
            continue
        jid = pending["job"] if isinstance(pending, dict) else pending
        try:
            s = jobs.summary(jobs.job_dir(jid))
        except ValueError:
            s = None
        if s and s["state"] in ("starting", "running"):
            continue

        def apply(c, key=key, pending=pending, ok=bool(s and s["state"] == "succeeded")):
            c["vps"].pop(key, None)
            if ok and key == "setup_pending_job":
                c["vps"]["setup_done"] = True
            if ok and key == "deploy_pending":
                c["vps"]["last_deploy"] = {**pending, "at": jobs.now_iso()}

        store.update(apply)


def http_check(url: str) -> dict:
    t0 = time.time()
    try:
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": f"MyseedContentManagerPanel/{VERSION}"})
        with urllib.request.urlopen(req, timeout=12, context=ssl.create_default_context() if url.startswith("https") else None) as r:
            return {"url": url, "ok": 200 <= r.status < 400, "status": r.status, "ms": int((time.time() - t0) * 1000)}
    except urllib.error.HTTPError as err:
        return {"url": url, "ok": err.code < 500, "status": err.code, "ms": int((time.time() - t0) * 1000)}
    except Exception as err:  # noqa: BLE001 - DNS, TLS and timeouts all mean "not reachable"
        reason = getattr(err, "reason", err)
        return {"url": url, "ok": False, "status": None, "error": str(reason)[:160], "ms": int((time.time() - t0) * 1000)}


def vps_state() -> dict:
    finished_vps_jobs()
    cfg = store.load()
    v = cfg["vps"]
    pk = public_key()
    return {
        "vps": v,
        "token": store.secret_hint("hostinger_token"),
        "connected": bool(store.get_secret("hostinger_token")),
        "public_key": pk,
        "key_file": str(KEY_FILE),
        "install_command": install_line(pk).replace(" && echo KEY-ADDED", "") if pk else None,
        "key_tail": key_tail(pk),
        "extra_env": store.secret_hint("vps_extra_env"),
        "extra_env_keys": [ln.split("=", 1)[0] for ln in (store.get_secret("vps_extra_env") or "").splitlines() if "=" in ln],
        "supabase_ready": bool(store.get_secret("supabase_session_url")),
        "url": site_url(v),
        "status": _status_cache,
        "project": str(store.PROJECT_DIR),
    }


@route("GET", "/api/vps")
def api_vps(h, body, m):
    return vps_state()


@route("POST", "/api/vps/token")
def api_vps_token(h, body, m):
    token = str(body.get("token", "")).strip()
    if not token:
        raise ApiFail(400, "Paste the API token from hPanel, Account, API.")
    found = machines(token)
    store.set_secret("hostinger_token", token)
    return {"machines": found}


@route("POST", "/api/vps/token/forget")
def api_vps_token_forget(h, body, m):
    store.set_secret("hostinger_token", None)
    return {"ok": True}


@route("GET", "/api/vps/machines")
def api_vps_machines(h, body, m):
    return {"machines": machines()}


@route("POST", "/api/vps/select")
def api_vps_select(h, body, m):
    try:
        vm_id = int(body.get("id"))
    except (TypeError, ValueError):
        raise ApiFail(400, "Choose a VPS.") from None
    vm = next((x for x in machines() if x.get("id") == vm_id), None)
    if not vm:
        raise ApiFail(404, "That VPS is not in your Hostinger account.")
    if not vm["ipv4"]:
        raise ApiFail(400, "That VPS has no IPv4 address yet. Wait until it finishes setting up.")

    def apply(c):
        changed = c["vps"].get("host") != vm["ipv4"][0]
        c["vps"].update(vm_id=vm["id"], hostname=vm["hostname"], plan=vm["plan"], host=vm["ipv4"][0])
        if changed:
            c["vps"].update(key_installed=False, setup_done=False)

    store.update(apply)
    return vps_state()


@route("POST", "/api/vps/server")
def api_vps_server(h, body, m):
    host = str(body.get("host", "")).strip()
    user = str(body.get("user", "root")).strip() or "root"
    try:
        port = int(body.get("ssh_port") or 22)
    except ValueError:
        raise ApiFail(400, "The SSH port is a number, usually 22.") from None
    path = str(body.get("path", "/opt/myseed-content-manager")).strip() or "/opt/myseed-content-manager"
    if not re.fullmatch(r"[A-Za-z0-9.\-:]+", host):
        raise ApiFail(400, "Enter the server's IP address or host name, for example 187.33.12.45.")
    if not re.fullmatch(r"[a-z_][a-z0-9_-]{0,31}", user):
        raise ApiFail(400, "Enter a valid Linux user name (Hostinger uses root).")
    remote_root({"path": path})

    def apply(c):
        if c["vps"].get("host") != host:
            c["vps"].update(key_installed=False, setup_done=False, vm_id=None, hostname=None, plan=None)
        c["vps"].update(host=host, user=user, ssh_port=max(1, min(65535, port)), path=path.rstrip("/"))

    store.update(apply)
    return vps_state()


@route("POST", "/api/vps/key/generate")
def api_vps_key(h, body, m):
    generate_key(replace=bool(body.get("replace")))
    return vps_state()


def vm_keys(vm_id: int) -> list[str]:
    """The root user's keys on the VPS, as Hostinger reports them."""
    return [str(k.get("key") or "") for k in as_list(hostinger("GET", f"/api/vps/v1/virtual-machines/{int(vm_id)}/ssh-keys")) if isinstance(k, dict)]


def wait_for_key(v: dict, seconds: int = int(os.environ.get("MYSEED_KEY_WAIT") or 60)) -> bool:
    """Hostinger writes the key to the server a few seconds after it answers. Try signing in until it works."""
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            r = run_quick(ssh_cmd(v, "echo OK"), timeout=30)
            if r.returncode == 0 and "OK" in (r.stdout or ""):
                return True
        except subprocess.TimeoutExpired:
            pass
        time.sleep(5)
    return False


@route("POST", "/api/vps/key/install")
def api_vps_key_install(h, body, m):
    """Adds the panel's key to the VPS's root user through Hostinger's API (POST virtual-machines/{id}/ssh-keys;
    the older account-level public-keys/attach answers OK but no longer reaches the server)."""
    v = vps()
    if not v.get("vm_id"):
        raise ApiFail(400, "Choose the VPS from your Hostinger account first, or add the key by hand.")
    key = public_key() or generate_key()
    mine = key_body(key)
    answer = hostinger("POST", f"/api/vps/v1/virtual-machines/{int(v['vm_id'])}/ssh-keys", {"keys": [key]})
    on_vm = [key_body(str(k.get("key") or "")) for k in as_list(answer) if isinstance(k, dict)] or [key_body(k) for k in vm_keys(v["vm_id"])]
    if mine not in on_vm:
        raise ApiFail(502, f"Hostinger answered but the key is not in the VPS's list ({len(on_vm)} other key(s) there). Use Add with the server password instead.")
    store.update(lambda c: c["vps"].update(hostinger_key_id=None))
    if wait_for_key(v):
        store.update(lambda c: c["vps"].update(key_installed=True))
        return {"ok": True, "installed": True, "message": f"Key added to {target(v)} and the panel signed in. Step 2 is done."}
    return {"ok": True, "installed": False, "message": "Hostinger has the key on the VPS, but the server does not take it yet. Wait a minute and press Test connection."}


def key_tail(key: str | None) -> str | None:
    """The last characters of the key, short enough to compare by eye with what hPanel or the server shows."""
    return key.split()[1][-8:] if key and len(key.split()) > 1 else None


def install_line(key: str) -> str:
    body = key_body(key)
    return f"mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && (grep -qF {q(body)} ~/.ssh/authorized_keys || echo {q(key)} >> ~/.ssh/authorized_keys) && echo KEY-ADDED"


@route("POST", "/api/vps/key/install-password")
def api_vps_key_install_password(h, body, m):
    """Adds the panel's key with the server's password, used for this one sign-in and never saved. The password
    goes to ssh through an askpass helper that reads it from its environment, so it is not in any command line."""
    v = vps()
    if not v.get("host"):
        raise ApiFail(400, "Choose your VPS first (step 1).")
    password = str(body.get("password") or "")
    if not password:
        raise ApiFail(400, "Type the server's root password (hPanel, VPS, Settings shows how to change it).")
    key = public_key() or generate_key()
    store.KEY_DIR.mkdir(parents=True, exist_ok=True)
    helper = store.KEY_DIR / ("askpass.cmd" if jobs.IS_WIN else "askpass.sh")
    if jobs.IS_WIN:
        helper.write_text("@echo off\r\npowershell -NoProfile -NonInteractive -Command \"[Console]::Out.Write($env:MYSEED_ASKPASS)\"\r\n", encoding="ascii")
    else:
        helper.write_text("#!/bin/sh\nprintf '%s' \"$MYSEED_ASKPASS\"\n", encoding="ascii")
        os.chmod(helper, 0o700)
    cmd = [ssh_tool("ssh"), "-p", str(v.get("ssh_port") or 22), "-o", "PubkeyAuthentication=no", "-o", "PreferredAuthentications=password,keyboard-interactive", "-o", "NumberOfPasswordPrompts=1", "-o", "StrictHostKeyChecking=accept-new", "-o", f"UserKnownHostsFile={KNOWN_HOSTS}", "-o", "ConnectTimeout=20", target(v), install_line(key)]
    try:
        r = run_quick(cmd, {"MYSEED_ASKPASS": password, "SSH_ASKPASS": str(helper), "SSH_ASKPASS_REQUIRE": "force", "DISPLAY": os.environ.get("DISPLAY") or "panel"}, timeout=60)
    except subprocess.TimeoutExpired:
        raise ApiFail(504, "The server did not answer in 60 seconds.") from None
    finally:
        helper.unlink(missing_ok=True)
    out = (r.stdout or "") + (r.stderr or "")
    if "KEY-ADDED" not in (r.stdout or ""):
        if "Permission denied" in out:
            raise ApiFail(400, f"The server did not accept that password for {target(v)}. Reset it in hPanel (VPS, Settings, Root password) if you are not sure.")
        raise ApiFail(502, f"Could not add the key: {out.strip()[-300:]}")
    store.update(lambda c: c["vps"].update(key_installed=True))
    return {"ok": True, "message": f"Key added to {target(v)}. Testing the connection now."}


@route("POST", "/api/vps/test")
def api_vps_test(h, body, m):
    v = require_server()
    script = "echo OK; . /etc/os-release; echo \"OS=$PRETTY_NAME\"; echo \"CPU=$(nproc)\"; echo \"RAM=$(free -m | awk '/Mem:/ {print $2}') MB\"; echo \"DISK=$(df -h / | awk 'NR==2 {print $4\" free of \"$2}')\"; echo \"DOCKER=$(docker --version 2>/dev/null || echo none)\"; echo \"COMPOSE=$(docker compose version --short 2>/dev/null || echo none)\"; echo \"RELEASE=$(basename \"$(readlink -f " + q(remote_root(v) + "/current") + " 2>/dev/null)\" 2>/dev/null)\"; echo \"WEB=$(ss -Hltn '( sport = :443 )' 2>/dev/null | wc -l)\""
    try:
        r = run_quick(ssh_cmd(v, script), timeout=40)
    except subprocess.TimeoutExpired:
        raise ApiFail(504, "The server did not answer in 40 seconds. Check the IP address and that the VPS is running.") from None
    out = (r.stdout or "") + (r.stderr or "")
    if r.returncode != 0 or "OK" not in (r.stdout or ""):
        hint = (f"The server does not have the panel's current key (it ends in …{key_tail(public_key())}). If you pressed New key, the key you added before no longer works. Add this one, or use Add with the server password." if "Permission denied" in out else out.strip()[-400:])
        store.update(lambda c: c["vps"].__setitem__("key_installed", False))
        raise ApiFail(502, f"Could not sign in to {target(v)}. {hint}")
    facts = dict(line.split("=", 1) for line in r.stdout.splitlines() if "=" in line)
    store.update(lambda c: c["vps"].update(key_installed=True))
    return {"ok": True, "facts": facts}


@route("POST", "/api/vps/reboot")
def api_vps_reboot(h, body, m):
    v = vps()
    if not v.get("vm_id"):
        raise ApiFail(400, "Restarting the VPS needs the Hostinger API token and a chosen VPS.")
    hostinger("POST", f"/api/vps/v1/virtual-machines/{int(v['vm_id'])}/restart")
    return {"ok": True}


@route("POST", "/api/vps/settings")
def api_vps_settings(h, body, m):
    domain = str(body.get("domain", vps().get("domain") or "")).strip().lower()
    if domain.startswith("http"):
        domain = urllib.parse.urlsplit(domain).hostname or ""
    domain = domain.strip("/")
    if domain and not DOMAIN_RE.match(domain):
        raise ApiFail(400, f"“{domain}” is not a domain name. Use for example content.myseed.com.")
    database = body.get("database", vps().get("database"))
    if database not in ("local", "supabase"):
        raise ApiFail(400, "Choose where the database lives.")
    proxy = body.get("proxy", vps().get("proxy"))
    if proxy not in ("caddy", "none"):
        raise ApiFail(400, "Choose how the site is served.")
    try:
        app_port = int(body.get("app_port", vps().get("app_port") or 3100))
    except ValueError:
        raise ApiFail(400, "The app port is a number such as 3100.") from None
    if not 1024 <= app_port <= 65535:
        raise ApiFail(400, "The app port must be between 1024 and 65535.")
    if "extra_env" in body:
        raw = str(body.get("extra_env") or "")
        if raw.strip() == "__clear__":
            store.set_secret("vps_extra_env", None)
        elif raw.strip():
            lines = [ln.strip() for ln in raw.replace("\r", "").split("\n") if ln.strip() and not ln.strip().startswith("#")]
            bad = [ln.split("=", 1)[0] for ln in lines if not EXTRA_ENV_RE.match(ln)]
            if bad:
                raise ApiFail(400, f"Each line is NAME=value with a capital NAME. Check: {', '.join(bad[:3])}")
            reserved = [ln.split("=", 1)[0] for ln in lines if ln.split("=", 1)[0] in RESERVED_ENV]
            if reserved:
                raise ApiFail(400, f"{', '.join(reserved)} {'is' if len(reserved) == 1 else 'are'} set by the panel from the choices above.")
            store.set_secret("vps_extra_env", "\n".join(lines))

    store.update(lambda c: c["vps"].update(domain=domain, database=database, proxy=proxy, app_port=app_port))
    return vps_state()


@route("POST", "/api/vps/push-env")
def api_vps_push_env(h, body, m):
    v = require_server()
    check_ready_to_deploy(v)
    return {"job": jobs.create_job("Save settings on the VPS", [*upload_scripts_steps(v), push_env_step(v)], group="vps", locks=["vps"])}


@route("POST", "/api/vps/setup")
def api_vps_setup(h, body, m):
    v = require_server()
    root = remote_root(v)
    steps = [
        *upload_scripts_steps(v),
        {"title": "Install Docker, swap, firewall and schedules", "cmd": ssh_cmd(v, f"APP_ROOT={q(root)} SSH_PORT={int(v.get('ssh_port') or 22)} PROXY={q(v.get('proxy') or 'caddy')} bash {q(root + '/incoming/setup.sh')}")},
    ]
    job = jobs.create_job("Set up the VPS", steps, group="vps", locks=["vps"])
    store.update(lambda c: c["vps"].__setitem__("setup_pending_job", job["id"]))
    return {"job": job}


@route("POST", "/api/vps/deploy")
def api_vps_deploy(h, body, m):
    v = require_server()
    check_ready_to_deploy(v)
    root = remote_root(v)
    ref = "HEAD"
    if body.get("include_changes"):
        ref = run_quick([GIT, "stash", "create"], timeout=30).stdout.strip() or "HEAD"  # empty when nothing is uncommitted
    short = run_quick([GIT, "rev-parse", "--short", ref], timeout=20).stdout.strip()
    if not short:
        raise ApiFail(400, "Git could not read this repository. Commit your code first.")
    release = f"{stamp()}-{short}{'-wip' if ref != 'HEAD' else ''}"
    tmp = store.STATE_DIR / "uploads"
    tmp.mkdir(parents=True, exist_ok=True)
    for old in tmp.glob("*.tar.gz"):
        old.unlink(missing_ok=True)
    archive = tmp / f"{release}.tar.gz"
    steps = [
        {"title": f"Package the code ({'with uncommitted changes, ' if ref != 'HEAD' else ''}{short})", "cmd": [GIT, "archive", "--format=tar.gz", "-o", str(archive), ref]},
        *upload_scripts_steps(v),
        push_env_step(v),
        {"title": "Upload the code", "cmd": scp_to(v, [str(archive)], root + "/incoming/")},
        {"title": "Build and start on the server", "cmd": ssh_cmd(v, remote_script(v, q(release)))},
    ]
    job = jobs.create_job(f"Deploy {short} to the VPS", steps, group="vps", locks=["vps"], url=site_url(v))
    store.update(lambda c: c["vps"].__setitem__("deploy_pending", {"release": release, "job": job["id"], "at": jobs.now_iso()}))
    return {"job": job}


@route("POST", "/api/vps/(rollback|restart)")
def api_vps_cycle(h, body, m):
    v = require_server()
    what = m.group(1)
    title = "Roll back to the previous release" if what == "rollback" else "Restart the app on the VPS"
    return {"job": jobs.create_job(title, [*upload_scripts_steps(v), {"title": title, "cmd": ssh_cmd(v, remote_script(v, f"--{what}"))}], group="vps", locks=["vps"])}


@route("POST", "/api/vps/logs")
def api_vps_logs(h, body, m):
    v = require_server()
    service = str(body.get("service", "app"))
    if service not in VPS_SERVICES:
        raise ApiFail(400, "Unknown service.")
    lines = max(50, min(2000, int(body.get("lines") or 300)))
    return {"job": jobs.create_job(f"Server log: {service}", [{"title": f"Last {lines} lines of {service}", "cmd": ssh_cmd(v, remote_script(v, f"--compose logs --no-color --tail {lines} {service}"))}], group="vps-logs")}


@route("POST", "/api/vps/backup")
def api_vps_backup(h, body, m):
    v = require_server()
    root = remote_root(v)
    folder = VPS_BACKUPS / stamp()
    folder.mkdir(parents=True, exist_ok=True)
    steps = [
        *upload_scripts_steps(v),
        {"title": "Back up the database on the server", "cmd": ssh_cmd(v, remote_script(v, "--backup"))},
        {"title": "Download it to this computer", "cmd": scp_from(v, root + "/backups/latest.json.gz", str(folder / f"myseed-vps-{stamp()}.json.gz"))},
    ]
    return {"job": jobs.create_job("Back up the VPS database", steps, group="vps-backup", locks=["vps-backup"])}


@route("POST", "/api/vps/restore")
def api_vps_restore(h, body, m):
    v = require_server()
    root = remote_root(v)
    file = backup_path(str(body.get("file", "")))
    if not restorable(file):
        raise ApiFail(400, "Only .json or .json.gz backups can be restored.")
    name = f"restore-{stamp()}{''.join(file.suffixes[-2:]) if file.name.endswith('.json.gz') else '.json'}"
    steps = [
        *upload_scripts_steps(v),
        {"title": f"Upload {file.name}", "cmd": scp_to(v, [str(file)], f"{root}/backups/incoming/{name}")},
        {"title": "Safety backup, then restore on the server", "cmd": ssh_cmd(v, remote_script(v, f"--restore {q(name)}"))},
    ]
    return {"job": jobs.create_job(f"Restore {file.name} onto the VPS", steps, group="vps", locks=["vps"])}


@route("POST", "/api/vps/status")
def api_vps_status(h, body, m):
    v = vps()
    result: dict = {"checked": jobs.now_iso(), "http": {}}
    if site_url(v):
        result["http"] = {"site": http_check(site_url(v) + "/"), "health": http_check(site_url(v) + "/api/health")}
    if v.get("host") and KEY_FILE.exists() and v.get("key_installed"):
        root = remote_root(v)
        remote = (
            f"if [ -x {q(root + '/incoming/deploy.sh')} ]; then {remote_script(v, '--compose ps --format json')} 2>/dev/null; fi; echo '---'; "
            "uptime -p; df -h / | awk 'NR==2 {print $5}'; free -m | awk '/Mem:/ {print $3\"/\"$2\" MB\"}'; "
            f"basename \"$(readlink -f {q(root + '/current')} 2>/dev/null)\" 2>/dev/null; ls -1t {q(root + '/backups')} 2>/dev/null | grep -m1 '^myseed-' || true"
        )
        try:
            r = run_quick(ssh_cmd(v, remote), timeout=40)
            ps_part, _, rest = (r.stdout or "").partition("---")
            containers = []
            for line in ps_part.strip().splitlines():
                try:
                    c = json.loads(line)
                except ValueError:
                    continue
                for item in c if isinstance(c, list) else [c]:
                    containers.append({"service": item.get("Service"), "state": item.get("State"), "status": item.get("Status"), "health": item.get("Health")})
            facts = [x.strip() for x in rest.strip().splitlines()]
            result["server"] = {"ok": r.returncode == 0 or bool(containers), "containers": containers, "uptime": facts[0] if len(facts) > 0 else None, "disk": facts[1] if len(facts) > 1 else None, "memory": facts[2] if len(facts) > 2 else None, "release": facts[3] if len(facts) > 3 else None, "last_backup": facts[4] if len(facts) > 4 else None}
        except subprocess.TimeoutExpired:
            result["server"] = {"ok": False, "error": "The server did not answer in 40 seconds."}
    _status_cache.clear()
    _status_cache.update(result)
    return result


@route("POST", "/api/vps/disconnect")
def api_vps_disconnect(h, body, m):
    """Delete the Hostinger connection. Always forgets the token and the server here; optionally also takes the
    panel's key off the server and out of the Hostinger account, and deletes the key on this computer. The site
    on the VPS keeps running: nothing is stopped or deleted there."""
    v = vps()
    done: list[str] = []
    warnings: list[str] = []
    key = public_key()
    if body.get("remove_server_key") and key and v.get("host") and KEY_FILE.exists():
        body_part = key_body(key)
        remote = f"f=~/.ssh/authorized_keys; [ -f \"$f\" ] && grep -vF {q(body_part)} \"$f\" > \"$f.tmp\"; [ -f \"$f.tmp\" ] && cat \"$f.tmp\" > \"$f\" && rm -f \"$f.tmp\"; echo REMOVED"
        try:
            r = run_quick(ssh_cmd(v, remote), timeout=40)
            if r.returncode == 0 and "REMOVED" in (r.stdout or ""):
                done.append(f"Took the panel's key off {target(v)}.")
            else:
                warnings.append(f"Could not reach {target(v)} to take the key off: {((r.stderr or r.stdout) or '').strip()[-200:]}")
        except subprocess.TimeoutExpired:
            warnings.append("The server did not answer, so the key is still on it.")
    if body.get("remove_account_key") and store.get_secret("hostinger_token"):
        try:
            if key and v.get("vm_id"):
                hostinger("DELETE", f"/api/vps/v1/virtual-machines/{int(v['vm_id'])}/ssh-keys", {"keys": [key]})
                done.append("Removed the key from the VPS in Hostinger.")
            # Copies an earlier version saved at account level (the old public-keys endpoints).
            old = [k for k in as_list(hostinger("GET", "/api/vps/v1/public-keys")) if isinstance(k, dict) and str(k.get("name") or "").startswith(KEY_NAME)]
            for k in old:
                hostinger("DELETE", f"/api/vps/v1/public-keys/{int(k['id'])}")
            if old:
                done.append(f"Deleted {len(old)} old copy(ies) of the panel's key from your Hostinger account.")
        except ApiFail as err:
            warnings.append(f"Hostinger: {err}")
    store.set_secret("hostinger_token", None)
    done.append("Forgot the Hostinger API token.")

    def apply(c):
        keep = {k: c["vps"].get(k) for k in ("domain", "database", "proxy", "app_port")}
        c["vps"] = {**json.loads(json.dumps(store.DEFAULTS["vps"])), **keep}

    store.update(apply)
    done.append("Unlinked the VPS from this panel (the site on it keeps running).")
    if body.get("delete_local_key"):
        for f in (KEY_FILE, KEY_FILE.with_suffix(".pub")):
            f.unlink(missing_ok=True)
        done.append("Deleted the SSH key on this computer.")
    _status_cache.clear()
    return {"ok": True, "done": done, "warnings": warnings, **vps_state()}


# ---------------------------------------------------------------------------
# Process management and CLI
# ---------------------------------------------------------------------------


def panel_url(port: int) -> str:
    return f"http://{store.PANEL_HOST}:{port}/"


def plain_url(port: int) -> str:
    return f"http://127.0.0.1:{port}/"


def identity_at(port: int) -> dict | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{int(port)}/api/identity", timeout=2) as r:
            return json.loads(r.read() or b"{}") if r.status == 200 else None
    except (OSError, ValueError):
        return None


def is_ours(port: int) -> bool:
    d = identity_at(port)
    return bool(d and d.get("app") == store.APP_ID and same_dir(d.get("project"), store.PROJECT_DIR))


def running_panel() -> tuple[int, int] | None:
    """(pid, port) of this project's panel when it answers, or None. A panel of another project, or anything
    else on the port, is never treated as this one."""
    try:
        info = json.loads(store.PID_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not jobs.pid_alive(info.get("pid")):
        return None
    if is_ours(info.get("port") or 0):
        return info["pid"], info["port"]
    return None


class PanelServer(http.server.ThreadingHTTPServer):
    # Python's HTTP server sets SO_REUSEADDR, and on Windows that lets a second program bind a port that is
    # already in use, so two panels could share one port and the browser reached whichever answered. Bind
    # exclusively instead: a busy port fails and the panel moves to the next free one.
    allow_reuse_address = False
    daemon_threads = True

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def bind_server(wanted: int) -> tuple[PanelServer, int]:
    tried = []
    for port in [wanted, *range(wanted + 1, wanted + 25)]:
        if port == 8766 and port != wanted:
            continue  # the MySeed Academy panel's port
        if port_open(port):
            tried.append(port)
            continue
        try:
            return PanelServer(("127.0.0.1", port), Handler), port
        except OSError:
            tried.append(port)
    raise OSError(f"Ports {tried[0]} to {tried[-1]} are all in use.")


def serve() -> None:
    global _server
    store.ensure_dirs()
    wanted = int(store.load()["port"])
    try:
        _server, port = bind_server(wanted)
    except OSError as err:
        print(f"Could not start: {err} Choose another with: control_panel.py serve --port <n>", flush=True)
        sys.exit(1)
    if port != wanted:
        print(f"Port {wanted} is used by another program, so this panel uses {port}.", flush=True)
    store.PID_FILE.write_text(json.dumps({"pid": os.getpid(), "port": port, "started": jobs.now_iso(), "project": str(store.PROJECT_DIR)}), encoding="utf-8")
    threading.Thread(target=auto_backup_loop, daemon=True).start()
    print(f"{PANEL_NAME} control panel {VERSION} on {panel_url(port)} (also {plain_url(port)}), pid {os.getpid()}, project {store.PROJECT_DIR}", flush=True)
    try:
        _server.serve_forever()
    finally:
        store.PID_FILE.unlink(missing_ok=True)


def process_cmdline(pid: int) -> str:
    try:
        if jobs.IS_WIN:
            r = subprocess.run(["powershell", "-NoProfile", "-Command", f"(Get-CimInstance Win32_Process -Filter 'ProcessId={int(pid)}').CommandLine"], capture_output=True, text=True, timeout=15, creationflags=jobs.CREATE_NO_WINDOW)
            return r.stdout.strip()
        return Path(f"/proc/{int(pid)}/cmdline").read_bytes().replace(b"\0", b" ").decode("utf-8", "replace")
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return ""


def retire_old_panel() -> None:
    """Stop a panel left running by the earlier version (state in .state2), but only when it is this folder's
    control_panel.py: a panel of another project is left alone."""
    pid_file = store.OLD_STATE_DIR / "panel.pid"
    try:
        info = json.loads(pid_file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    pid = info.get("pid")
    if jobs.pid_alive(pid) and str(Path(__file__).resolve()).lower() in process_cmdline(pid).lower():
        jobs.kill_tree(pid)
        print(f"Stopped the old panel (pid {pid}) that used port {info.get('port')}.")
    pid_file.unlink(missing_ok=True)


def start(open_browser: bool = True) -> None:
    store.ensure_dirs()
    if store.migrate_old_state():
        print("Moved the panel's settings from .state2 into .state.")
    retire_old_panel()
    found = running_panel()
    if not found:
        log = store.LOG_FILE
        if log.exists() and log.stat().st_size > 2_000_000:
            log.replace(log.with_suffix(".old.log"))
        store.PID_FILE.unlink(missing_ok=True)
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
    print(f"Project: {store.PROJECT_DIR}")
    print(f"Open {url}  (or {plain_url(found[1])})  -  stop it from the panel or with: python control-panel/control_panel.py stop")
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
