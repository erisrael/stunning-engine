"""Panel configuration and secrets.

Everything lives in control-panel/.state (git-ignored). Secrets (database URLs, API tokens)
are encrypted with Windows DPAPI, so only your Windows account on this computer can read them.
On other systems they are stored with owner-only file permissions.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sys
import threading
from pathlib import Path

PANEL_DIR = Path(__file__).resolve().parent
PROJECT_DIR = PANEL_DIR.parent
STATE_DIR = Path(os.environ.get("MYSEED_PANEL_STATE") or PANEL_DIR / ".state")  # override for testing
OLD_STATE_DIR = PANEL_DIR / ".state2"  # used by an earlier version; moved into .state on start
# The panel's own SSH key for the VPS. Kept outside OneDrive and outside the repository, and separate from the
# MySeed Academy panel's key so removing one never locks the other out.
KEY_DIR = Path(os.environ.get("MYSEED_PANEL_KEYS") or Path(os.environ.get("LOCALAPPDATA") or Path.home() / ".config") / "MyseedContentManagerPanel" / "ssh")
JOBS_DIR = STATE_DIR / "jobs"
CONFIG_FILE = STATE_DIR / "config.json"
PID_FILE = STATE_DIR / "panel.pid"
LOG_FILE = STATE_DIR / "panel.log"
BACKUPS_DIR = PROJECT_DIR / "backups"

# This panel's own port and address. The MySeed Academy panel uses 8766 on 127.0.0.1, so the two never meet:
# different port, different host name (browsers send *.localhost to this computer), different cookie.
DEFAULT_PORT = 8765
PANEL_HOST = "content-manager.localhost"
APP_ID = "myseed-content-manager-panel"

# Secret names the UI may set. Values never go back to the browser in full.
SECRET_KEYS = {
    "supabase_session_url",
    "supabase_transaction_url",
    "supabase_token",
    "netlify_token",
    "vercel_token",
    "render_token",
    "cron_secret",
    "hostinger_token",
    "vps_extra_env",  # extra KEY=value lines for the server's .env (SMTP, AI key and the like)
}

_lock = threading.RLock()


def ensure_dirs() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    gitignore = STATE_DIR / ".gitignore"
    if not gitignore.exists():
        gitignore.write_text("*\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Windows DPAPI (CryptProtectData), via ctypes so no packages are needed
# ---------------------------------------------------------------------------

if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes

    class _Blob(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    _crypt32 = ctypes.windll.crypt32
    _kernel32 = ctypes.windll.kernel32
    _ENTROPY = b"myseed-control-panel"

    def _blob(data: bytes) -> _Blob:
        buf = ctypes.create_string_buffer(data, len(data))
        return _Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))

    def _protect(data: bytes) -> bytes:
        out = _Blob()
        entropy = _blob(_ENTROPY)
        if not _crypt32.CryptProtectData(ctypes.byref(_blob(data)), None, ctypes.byref(entropy), None, None, 0x1, ctypes.byref(out)):
            raise OSError("Windows could not encrypt the secret (CryptProtectData failed).")
        try:
            return ctypes.string_at(out.pbData, out.cbData)
        finally:
            _kernel32.LocalFree(out.pbData)

    def _unprotect(data: bytes) -> bytes:
        out = _Blob()
        entropy = _blob(_ENTROPY)
        if not _crypt32.CryptUnprotectData(ctypes.byref(_blob(data)), None, ctypes.byref(entropy), None, None, 0x1, ctypes.byref(out)):
            raise OSError("Windows could not decrypt the secret. Was it saved by another Windows user?")
        try:
            return ctypes.string_at(out.pbData, out.cbData)
        finally:
            _kernel32.LocalFree(out.pbData)

    ENCRYPTION = "Windows DPAPI (your Windows account only)"
else:

    def _protect(data: bytes) -> bytes:
        return data

    def _unprotect(data: bytes) -> bytes:
        return data

    ENCRYPTION = "File permissions (owner only)"


def _encode_secret(value: str) -> str:
    return base64.b64encode(_protect(value.encode("utf-8"))).decode("ascii")


def _decode_secret(value: str) -> str:
    return _unprotect(base64.b64decode(value)).decode("utf-8")


# ---------------------------------------------------------------------------
# Config file
# ---------------------------------------------------------------------------

DEFAULTS: dict = {
    "port": DEFAULT_PORT,
    "open_browser": True,
    "password": None,  # {"salt", "hash", "iterations"}
    "secrets": {},
    "netlify": {"site_id": None, "site_name": None, "site_url": None, "account_id": None},
    "vercel": {"project_id": None, "project_name": None, "team_id": None},
    "render": {"service_id": None, "service_name": None},
    "supabase": {"project_ref": None, "project_name": None},
    "auto_backup": {"enabled": False, "hours": 24, "keep": 14, "last_run": None},
    "jobs_keep": 60,
    "vps": {
        "vm_id": None,
        "hostname": None,
        "plan": None,
        "host": None,
        "user": "root",
        "ssh_port": 22,
        "path": "/opt/myseed-content-manager",
        "key_installed": False,
        "hostinger_key_id": None,
        "setup_done": False,
        "last_deploy": None,
        "domain": "",
        "database": "local",  # "local": Postgres on the VPS; "supabase": the Supabase session pooler
        "proxy": "caddy",  # "caddy": HTTPS on ports 80/443; "none": app on 127.0.0.1:app_port for a proxy you already run
        "app_port": 3100,
    },
}


def migrate_old_state() -> bool:
    """An earlier version kept everything in .state2. Move its settings (password, secrets, links) into .state once."""
    old = OLD_STATE_DIR / "config.json"
    if STATE_DIR != PANEL_DIR / ".state" or not old.exists():
        return False
    try:
        data = json.loads(old.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    current: dict = {}
    if CONFIG_FILE.exists():
        try:
            current = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            current = {}
    if current.get("password") and current.get("secrets"):
        return False  # .state is already the real one
    ensure_dirs()
    if CONFIG_FILE.exists():
        CONFIG_FILE.replace(CONFIG_FILE.with_name("config.before-migration.json"))
    for k, v in current.items():  # keep anything only the new file had
        data.setdefault(k, v)
    data["port"] = DEFAULT_PORT if int(data.get("port") or 0) in (0, 8766) else data["port"]
    tmp = CONFIG_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    os.replace(tmp, CONFIG_FILE)
    old.replace(old.with_name("config.migrated-to-state.json"))
    return True


def load() -> dict:
    with _lock:
        ensure_dirs()
        data: dict = {}
        if CONFIG_FILE.exists():
            try:
                data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                data = {}
        merged = json.loads(json.dumps(DEFAULTS))
        for k, v in data.items():
            if isinstance(v, dict) and isinstance(merged.get(k), dict):
                merged[k].update(v)
            else:
                merged[k] = v
        return merged


def save(cfg: dict) -> None:
    with _lock:
        ensure_dirs()
        tmp = CONFIG_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
        if sys.platform != "win32":
            os.chmod(tmp, 0o600)
        os.replace(tmp, CONFIG_FILE)


def update(fn) -> dict:
    with _lock:
        cfg = load()
        fn(cfg)
        save(cfg)
        return cfg


def get_secret(key: str) -> str | None:
    raw = load()["secrets"].get(key)
    if not raw:
        return None
    try:
        return _decode_secret(raw)
    except (OSError, ValueError):
        return None


def set_secret(key: str, value: str | None) -> None:
    if key not in SECRET_KEYS:
        raise ValueError(f"Unknown secret {key}")

    def apply(cfg: dict) -> None:
        if value:
            cfg["secrets"][key] = _encode_secret(value.strip())
        else:
            cfg["secrets"].pop(key, None)

    update(apply)


def secret_hint(key: str) -> str | None:
    """A masked preview so the UI can show that a secret is set without revealing it."""
    value = get_secret(key)
    if not value:
        return None
    if key.endswith("_url"):
        # postgresql://user:pass@host:port/db -> show user, host and port only
        try:
            from urllib.parse import urlsplit

            u = urlsplit(value)
            return f"{u.username}@{u.hostname}:{u.port}"
        except ValueError:
            return "set"
    return f"{value[:4]}…{value[-4:]}" if len(value) > 12 else "set"


# ---------------------------------------------------------------------------
# Panel password (PBKDF2-SHA256)
# ---------------------------------------------------------------------------

ITERATIONS = 390_000


def has_password() -> bool:
    return bool(load().get("password"))


def set_password(password: str) -> None:
    if len(password) < 8:
        raise ValueError("Use at least 8 characters.")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS)
    update(lambda cfg: cfg.__setitem__("password", {"salt": salt.hex(), "hash": digest.hex(), "iterations": ITERATIONS}))


def check_password(password: str) -> bool:
    rec = load().get("password")
    if not rec:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(rec["salt"]), int(rec["iterations"]))
    return hmac.compare_digest(digest.hex(), rec["hash"])
