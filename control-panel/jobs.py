"""Background jobs that outlive the browser and the panel server.

Each job is a folder in .state/jobs/<id> with:
  job.json     what to run (steps; secrets are referenced by name, never written in clear)
  status.json  state, current step, exit code, wrapper pid, heartbeat
  log.txt      combined output, secrets masked

A job runs inside its own detached wrapper process (`control_panel.py _run-job <dir>`), so closing
the browser, the terminal or even restarting the panel never stops it. Only Stop (per job) or
"Stop everything and exit" ends running work.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

import store

ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
HEARTBEAT_SECONDS = 5
STALE_SECONDS = 45

IS_WIN = sys.platform == "win32"
DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_BREAKAWAY_FROM_JOB = 0x01000000
CREATE_NO_WINDOW = 0x08000000


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def _read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def _write_json(path: Path, data) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    os.replace(tmp, path)


# ---------------------------------------------------------------------------
# Process helpers
# ---------------------------------------------------------------------------


def pid_alive(pid: int | None) -> bool:
    if not pid:
        return False
    if IS_WIN:
        import ctypes

        handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, int(pid))  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return False
        try:
            code = ctypes.c_ulong()
            ok = ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
            return bool(ok) and code.value == 259  # STILL_ACTIVE
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    try:
        os.kill(int(pid), 0)
        return True
    except OSError:
        return False


def kill_tree(pid: int | None) -> None:
    if not pid or not pid_alive(pid):
        return
    if IS_WIN:
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, creationflags=CREATE_NO_WINDOW)
    else:
        try:
            os.killpg(os.getpgid(int(pid)), signal.SIGTERM)
        except OSError:
            pass


def python_for_background() -> str:
    """pythonw.exe on Windows so no console window appears; the normal interpreter elsewhere."""
    exe = Path(sys.executable)
    if IS_WIN:
        w = exe.with_name("pythonw.exe")
        if w.exists():
            return str(w)
    return str(exe)


def spawn_detached(args: list[str], cwd: Path, log_path: Path | None = None) -> int:
    """Start a process that is not tied to this one: it survives the parent, the terminal and the browser."""
    out = open(log_path, "ab") if log_path else subprocess.DEVNULL
    kwargs: dict = {"cwd": str(cwd), "stdin": subprocess.DEVNULL, "stdout": out, "stderr": out, "close_fds": True}
    try:
        if IS_WIN:
            base = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
            try:
                # Breakaway keeps it alive when the launching terminal (for example VS Code) closes its job object.
                proc = subprocess.Popen(args, creationflags=base | CREATE_BREAKAWAY_FROM_JOB, **kwargs)
            except OSError:
                proc = subprocess.Popen(args, creationflags=base, **kwargs)
        else:
            proc = subprocess.Popen(args, start_new_session=True, **kwargs)
        return proc.pid
    finally:
        if log_path:
            out.close()


def resolve_exe(name: str) -> str:
    found = shutil.which(name)
    if not found:
        raise FileNotFoundError(f"'{name}' was not found on PATH. Install it and restart the control panel.")
    return found


# ---------------------------------------------------------------------------
# Job records (used by the panel server)
# ---------------------------------------------------------------------------


class Busy(Exception):
    def __init__(self, message: str, holder: dict):
        super().__init__(message)
        self.holder = holder


_create_lock = threading.Lock()


def job_dir(job_id: str) -> Path:
    if not re.fullmatch(r"[0-9a-z\-]+", job_id):
        raise ValueError("Bad job id")
    return store.JOBS_DIR / job_id


def refresh_status(d: Path) -> dict:
    status = _read_json(d / "status.json", {})
    if status.get("state") in ("starting", "running"):
        beat = status.get("heartbeat") or status.get("created")
        age = time.time() - dt.datetime.fromisoformat(beat).timestamp() if beat else 999
        if not pid_alive(status.get("pid")) or age > STALE_SECONDS:
            if status.get("state") == "starting" and age < STALE_SECONDS:
                return status
            status.update(state="interrupted", finished=now_iso(), message="The job process ended unexpectedly.")
            _write_json(d / "status.json", status)
    return status


def summary(d: Path) -> dict | None:
    spec = _read_json(d / "job.json", None)
    if not spec:
        return None
    status = refresh_status(d)
    url = spec.get("url")
    if spec.get("kind") == "service" and status.get("state") in ("starting", "running"):
        # Next.js picks another port when 3000 is taken; use the address it printed.
        try:
            with open(d / "log.txt", "rb") as f:
                f.seek(max(0, (d / "log.txt").stat().st_size - 65536))
                found = re.findall(r"Local:\s+(https?://[\w.\-]+:\d+)", f.read().decode("utf-8", errors="replace"))
            if found:
                url = found[-1]
        except OSError:
            pass
    return {
        "id": d.name,
        "title": spec.get("title"),
        "kind": spec.get("kind", "task"),
        "group": spec.get("group"),
        "locks": spec.get("locks", []),
        "steps": [s.get("title") for s in spec.get("steps", [])],
        "url": url,
        "created": spec.get("created"),
        **{k: status.get(k) for k in ("state", "step", "started", "finished", "exit_code", "message")},
    }


def list_jobs() -> list[dict]:
    store.ensure_dirs()
    out = [s for d in store.JOBS_DIR.iterdir() if d.is_dir() and (s := summary(d))]
    out.sort(key=lambda j: j.get("created") or "", reverse=True)
    return out


def running_jobs() -> list[dict]:
    return [j for j in list_jobs() if j["state"] in ("starting", "running")]


def create_job(title: str, steps: list[dict], *, kind: str = "task", group: str | None = None, locks: list[str] | None = None, url: str | None = None) -> dict:
    """steps: [{"title", "cmd": [...], "env": {NAME: value | {"secret": key}}, "unset": [NAME]}].
    Command args may contain {secret:key} and {latest:dir} placeholders, resolved when the step runs."""
    with _create_lock:
        locks = locks or []
        for j in running_jobs():
            shared = set(j["locks"]) & set(locks)
            if shared:
                raise Busy(f"“{j['title']}” is using the {', '.join(sorted(shared))} right now.", j)
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        job_id = f"{stamp}-{uuid.uuid4().hex[:6]}"
        d = store.JOBS_DIR / job_id
        d.mkdir(parents=True)
        spec = {"id": job_id, "title": title, "kind": kind, "group": group, "locks": locks, "steps": steps, "url": url, "created": now_iso()}
        _write_json(d / "job.json", spec)
        _write_json(d / "status.json", {"state": "starting", "created": now_iso(), "step": 0})
        (d / "log.txt").write_bytes(b"")
        here = Path(__file__).resolve().parent
        pid = spawn_detached([python_for_background(), str(here / "control_panel.py"), "_run-job", str(d)], store.PROJECT_DIR, d / "wrapper.err")
        status = _read_json(d / "status.json", {})
        status["pid"] = status.get("pid") or pid
        _write_json(d / "status.json", status)
        prune()
        return summary(d)  # type: ignore[return-value]


def read_log(job_id: str, offset: int = 0, limit: int = 256_000) -> dict:
    d = job_dir(job_id)
    path = d / "log.txt"
    size = path.stat().st_size if path.exists() else 0
    if offset > size:
        offset = 0
    with open(path, "rb") as f:
        f.seek(offset)
        chunk = f.read(limit)
    return {"offset": offset + len(chunk), "size": size, "text": chunk.decode("utf-8", errors="replace"), "job": summary(d)}


def cancel_job(job_id: str) -> dict:
    d = job_dir(job_id)
    status = _read_json(d / "status.json", {})
    (d / "cancel").write_text("1", encoding="utf-8")
    kill_tree(status.get("child_pid"))
    kill_tree(status.get("pid"))
    status = _read_json(d / "status.json", {})
    if status.get("state") in ("starting", "running"):
        status.update(state="cancelled", finished=now_iso(), message="Stopped from the control panel.")
        _write_json(d / "status.json", status)
    with open(d / "log.txt", "a", encoding="utf-8") as f:
        f.write(f"\n■ Stopped from the control panel at {now_iso()}\n")
    return summary(d)  # type: ignore[return-value]


def delete_job(job_id: str) -> None:
    d = job_dir(job_id)
    if refresh_status(d).get("state") in ("starting", "running"):
        raise ValueError("Stop the job before deleting it.")
    shutil.rmtree(d, ignore_errors=True)


def prune() -> None:
    keep = int(store.load().get("jobs_keep", 60))
    done = [j for j in list_jobs() if j["state"] not in ("starting", "running")]
    for j in done[keep:]:
        shutil.rmtree(store.JOBS_DIR / j["id"], ignore_errors=True)


def stop_all() -> int:
    n = 0
    for j in running_jobs():
        cancel_job(j["id"])
        n += 1
    return n


# ---------------------------------------------------------------------------
# The wrapper: runs inside the detached process
# ---------------------------------------------------------------------------


def _resolve(arg: str, secrets_seen: list[str]) -> str:
    def secret(m: re.Match) -> str:
        value = store.get_secret(m.group(1))
        if not value:
            raise RuntimeError(f"The secret '{m.group(1)}' is not set. Add it in the control panel first.")
        secrets_seen.append(value)
        return value

    def latest(m: re.Match) -> str:
        folder = (store.PROJECT_DIR / m.group(1)).resolve()
        files = sorted(folder.glob("*.json"), key=lambda p: p.stat().st_mtime)
        if not files:
            raise RuntimeError(f"No backup file was found in {folder}.")
        return str(files[-1])

    arg = re.sub(r"\{secret:([a-z_]+)\}", secret, arg)
    return re.sub(r"\{latest:([^}]+)\}", latest, arg)


def run_wrapper(d: Path) -> int:
    spec = _read_json(d / "job.json", {})
    status_path = d / "status.json"
    status = _read_json(status_path, {})
    status.update(state="running", pid=os.getpid(), started=now_iso(), heartbeat=now_iso())
    _write_json(status_path, status)
    log = open(d / "log.txt", "a", encoding="utf-8", buffering=1)
    secrets_seen: list[str] = []
    stop_beat = threading.Event()

    def mask(text: str) -> str:
        for s in secrets_seen:
            if s and len(s) > 3:
                text = text.replace(s, "••••••")
        return ANSI.sub("", text)

    def beat() -> None:
        while not stop_beat.wait(HEARTBEAT_SECONDS):
            st = _read_json(status_path, {})
            if st.get("state") != "running":
                return
            st["heartbeat"] = now_iso()
            _write_json(status_path, st)

    threading.Thread(target=beat, daemon=True).start()
    exit_code = 0
    state = "succeeded"
    message = None
    try:
        steps = spec.get("steps", [])
        for i, step in enumerate(steps):
            if (d / "cancel").exists():
                state, message = "cancelled", "Stopped from the control panel."
                break
            st = _read_json(status_path, {})
            st["step"] = i
            _write_json(status_path, st)
            log.write(f"\n▶ Step {i + 1} of {len(steps)}: {step.get('title')}\n")
            env = os.environ.copy()
            env.update({"FORCE_COLOR": "0", "NO_COLOR": "1", "CI": "1", "NO_UPDATE_NOTIFIER": "1", "PYTHONUNBUFFERED": "1"})
            for name in step.get("unset", []):
                env.pop(name, None)
            for name, value in (step.get("env") or {}).items():
                if isinstance(value, dict) and "secret" in value:
                    v = store.get_secret(value["secret"])
                    if not v:
                        raise RuntimeError(f"The secret '{value['secret']}' is not set. Add it in the control panel first.")
                    secrets_seen.append(v)
                    env[name] = v
                else:
                    env[name] = str(value)
            cmd = [_resolve(str(a), secrets_seen) for a in step["cmd"]]
            cmd[0] = resolve_exe(cmd[0]) if not os.path.isabs(cmd[0]) else cmd[0]
            log.write(mask("  $ " + " ".join(Path(cmd[0]).stem if j == 0 else (f'"{c}"' if " " in c else c) for j, c in enumerate(cmd))) + "\n")
            proc = subprocess.Popen(
                cmd,
                cwd=str(store.PROJECT_DIR / step.get("cwd", ".")),
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                creationflags=CREATE_NO_WINDOW if IS_WIN else 0,
                start_new_session=not IS_WIN,
            )
            st = _read_json(status_path, {})
            st["child_pid"] = proc.pid
            _write_json(status_path, st)
            assert proc.stdout
            for raw in iter(proc.stdout.readline, b""):
                log.write(mask(raw.decode("utf-8", errors="replace").rstrip("\r\n")) + "\n")
            code = proc.wait()
            if code != 0:
                if (d / "cancel").exists():
                    state, message = "cancelled", "Stopped from the control panel."
                else:
                    state, message = "failed", f"Step {i + 1} ({step.get('title')}) exited with code {code}."
                exit_code = code
                break
            log.write(f"✓ {step.get('title')}\n")
    except Exception as err:  # noqa: BLE001 - every failure must land in the log
        state, message, exit_code = "failed", mask(str(err)), 1
        log.write(f"\n✗ {mask(str(err))}\n")
    finally:
        stop_beat.set()
        if state == "succeeded":
            log.write(f"\n✔ Finished at {now_iso()}\n")
        elif state == "failed":
            log.write(f"\n✗ Failed: {message}\n")
        log.close()
        st = _read_json(status_path, {})
        if st.get("state") == "running":
            st.update(state=state, finished=now_iso(), exit_code=exit_code, message=message, child_pid=None)
            _write_json(status_path, st)
    return exit_code
