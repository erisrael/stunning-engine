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
STATE_DIR = Path(os.environ.get("MYSEED_PANEL_STATE") or PANEL_DIR / ".state2")  # override for testing
JOBS_DIR = STATE_DIR / "jobs"
CONFIG_FILE = STATE_DIR / "config.json"
PID_FILE = STATE_DIR / "panel.pid"
LOG_FILE = STATE_DIR / "panel.log"
BACKUPS_DIR = PROJECT_DIR / "backups"

DEFAULT_PORT = 8766

# Secret names the UI may set. Values never go back to the browser in full.
SECRET_KEYS = {
    "supabase_session_url",
    "supabase_transaction_url",
    "supabase_token",
    "netlify_token",
    "vercel_token",
    "render_token",
    "cron_secret",
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
}


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
