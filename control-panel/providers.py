"""Small API clients for Supabase (management), Netlify, Vercel and Render. Standard library only.

Tokens are only ever sent to the provider they belong to, over HTTPS.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

import store

USER_AGENT = "myseed-control-panel/1.0"


class ApiError(Exception):
    def __init__(self, provider: str, status: int, message: str):
        super().__init__(f"{provider}: {message}" + (f" (HTTP {status})" if status else ""))
        self.status = status


def _request(provider: str, base: str, token: str | None, method: str, path: str, body=None, query: dict | None = None, timeout: int = 30):
    if not token:
        raise ApiError(provider, 0, "not connected. Add your access token first.")
    url = base + path
    if query:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("User-Agent", USER_AGENT)
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as err:
        text = err.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(text)
            msg = parsed.get("message") or parsed.get("error", {}).get("message") if isinstance(parsed, dict) else None
            msg = msg or (parsed.get("error") if isinstance(parsed, dict) else None) or text
        except ValueError:
            msg = text or err.reason
        if err.code == 401:
            msg = "the access token was rejected. Create a new token and connect again."
        raise ApiError(provider, err.code, str(msg)[:400]) from None
    except urllib.error.URLError as err:
        raise ApiError(provider, 0, f"could not reach the service ({err.reason}). Check your internet connection.") from None


# ---------------------------------------------------------------------------
# Supabase management API (projects, pause and restore, pooler connection info)
# ---------------------------------------------------------------------------


class Supabase:
    BASE = "https://api.supabase.com"
    TOKEN_URL = "https://supabase.com/dashboard/account/tokens"

    def __init__(self, token: str | None = None):
        self.token = token or store.get_secret("supabase_token")

    def _r(self, method, path, body=None, query=None):
        return _request("Supabase", self.BASE, self.token, method, path, body, query)

    def projects(self) -> list[dict]:
        return [
            {"ref": p.get("id") or p.get("ref"), "name": p.get("name"), "region": p.get("region"), "status": p.get("status"), "created": p.get("created_at")}
            for p in self._r("GET", "/v1/projects") or []
        ]

    def project(self, ref: str) -> dict:
        p = self._r("GET", f"/v1/projects/{ref}")
        return {"ref": p.get("id") or ref, "name": p.get("name"), "region": p.get("region"), "status": p.get("status")}

    def restore(self, ref: str):
        return self._r("POST", f"/v1/projects/{ref}/restore", {})

    def pause(self, ref: str):
        return self._r("POST", f"/v1/projects/{ref}/pause", {})

    def connection_strings(self, ref: str, password: str) -> dict:
        """Builds the session (5432) and transaction (6543) pooler strings from the project's pooler settings."""
        cfg = self._r("GET", f"/v1/projects/{ref}/config/database/pooler")
        entries = cfg if isinstance(cfg, list) else [cfg]
        primary = next((e for e in entries if (e or {}).get("database_type", "PRIMARY") == "PRIMARY"), entries[0] if entries else None)
        if not primary or not primary.get("db_host"):
            raise ApiError("Supabase", 0, "the project did not return pooler settings. Copy the strings from Connect in the dashboard instead.")
        host, user, db = primary["db_host"], primary.get("db_user") or f"postgres.{ref}", primary.get("db_name") or "postgres"
        pw = urllib.parse.quote(password, safe="")
        return {
            "session": f"postgresql://{user}:{pw}@{host}:5432/{db}",
            "transaction": f"postgresql://{user}:{pw}@{host}:6543/{db}",
        }


# ---------------------------------------------------------------------------
# Netlify
# ---------------------------------------------------------------------------


class Netlify:
    BASE = "https://api.netlify.com/api/v1"
    TOKEN_URL = "https://app.netlify.com/user/applications#personal-access-tokens"

    def __init__(self, token: str | None = None):
        self.token = token or store.get_secret("netlify_token")

    def _r(self, method, path, body=None, query=None):
        return _request("Netlify", self.BASE, self.token, method, path, body, query)

    def user(self) -> dict:
        u = self._r("GET", "/user")
        return {"name": u.get("full_name") or u.get("slug"), "email": u.get("email")}

    def sites(self) -> list[dict]:
        out = []
        for s in self._r("GET", "/sites", query={"per_page": 100, "filter": "all"}) or []:
            out.append(
                {
                    "id": s["id"],
                    "name": s.get("name"),
                    "url": s.get("ssl_url") or s.get("url"),
                    "admin_url": s.get("admin_url"),
                    "account_id": s.get("account_id") or s.get("account_slug"),
                    "repo": (s.get("build_settings") or {}).get("repo_url"),
                    "updated": s.get("updated_at"),
                    "state": (s.get("published_deploy") or {}).get("state"),
                }
            )
        return out

    def create_site(self, name: str) -> dict:
        s = self._r("POST", "/sites", {"name": name})
        return {"id": s["id"], "name": s.get("name"), "url": s.get("ssl_url") or s.get("url"), "admin_url": s.get("admin_url"), "account_id": s.get("account_id") or s.get("account_slug")}

    def site(self, site_id: str) -> dict:
        s = self._r("GET", f"/sites/{site_id}")
        return {
            "id": s["id"],
            "name": s.get("name"),
            "url": s.get("ssl_url") or s.get("url"),
            "admin_url": s.get("admin_url"),
            "account_id": s.get("account_id") or s.get("account_slug"),
            "repo": (s.get("build_settings") or {}).get("repo_url"),
            "branch": (s.get("build_settings") or {}).get("repo_branch"),
        }

    def deploys(self, site_id: str, limit: int = 12) -> list[dict]:
        return [
            {
                "id": d["id"],
                "state": d.get("state"),
                "context": d.get("context"),
                "branch": d.get("branch"),
                "title": d.get("title") or d.get("commit_ref"),
                "created": d.get("created_at"),
                "published": d.get("published_at"),
                "url": d.get("deploy_ssl_url") or d.get("deploy_url"),
                "log_url": f"https://app.netlify.com/sites/{d.get('name')}/deploys/{d['id']}",
                "error": d.get("error_message"),
                "seconds": d.get("deploy_time"),
            }
            for d in self._r("GET", f"/sites/{site_id}/deploys", query={"per_page": limit}) or []
        ]

    def trigger_build(self, site_id: str, clear_cache: bool = False):
        return self._r("POST", f"/sites/{site_id}/builds", {"clear_cache": clear_cache})

    def cancel_deploy(self, deploy_id: str):
        return self._r("POST", f"/deploys/{deploy_id}/cancel", {})

    def env(self, account_id: str, site_id: str) -> list[dict]:
        out = []
        for e in self._r("GET", f"/accounts/{account_id}/env", query={"site_id": site_id}) or []:
            contexts = sorted({v.get("context") for v in e.get("values", [])})
            out.append({"key": e["key"], "contexts": contexts, "scopes": e.get("scopes", [])})
        return out

    def set_env(self, account_id: str, site_id: str, key: str, value: str) -> None:
        body = {"key": key, "scopes": ["builds", "functions", "runtime", "post_processing"], "values": [{"context": "all", "value": value}]}
        try:
            self._r("PUT", f"/accounts/{account_id}/env/{key}", body, {"site_id": site_id})
        except ApiError as err:
            if err.status != 404:
                raise
            self._r("POST", f"/accounts/{account_id}/env", [body], {"site_id": site_id})

    def delete_env(self, account_id: str, site_id: str, key: str) -> None:
        self._r("DELETE", f"/accounts/{account_id}/env/{key}", query={"site_id": site_id})


# ---------------------------------------------------------------------------
# Vercel (second free host; Hobby plan is for non-commercial use)
# ---------------------------------------------------------------------------


class Vercel:
    BASE = "https://api.vercel.com"
    TOKEN_URL = "https://vercel.com/account/tokens"

    def __init__(self, token: str | None = None, team_id: str | None = None):
        self.token = token or store.get_secret("vercel_token")
        self.team_id = team_id if team_id is not None else store.load()["vercel"].get("team_id")

    def _r(self, method, path, body=None, query=None):
        q = dict(query or {})
        if self.team_id:
            q["teamId"] = self.team_id
        return _request("Vercel", self.BASE, self.token, method, path, body, q)

    def user(self) -> dict:
        u = (self._r("GET", "/v2/user") or {}).get("user", {})
        return {"name": u.get("name") or u.get("username"), "email": u.get("email"), "id": u.get("id") or u.get("uid"), "default_team": u.get("defaultTeamId")}

    def teams(self) -> list[dict]:
        saved, self.team_id = self.team_id, None
        try:
            return [{"id": t["id"], "name": t.get("name") or t.get("slug")} for t in (self._r("GET", "/v2/teams") or {}).get("teams", [])]
        finally:
            self.team_id = saved

    def projects(self) -> list[dict]:
        return [
            {"id": p["id"], "name": p.get("name"), "framework": p.get("framework"), "updated": p.get("updatedAt"), "repo": (p.get("link") or {}).get("repo")}
            for p in (self._r("GET", "/v9/projects", query={"limit": 100}) or {}).get("projects", [])
        ]

    def create_project(self, name: str) -> dict:
        p = self._r("POST", "/v11/projects", {"name": name, "framework": "nextjs"})
        return {"id": p["id"], "name": p.get("name")}

    def project(self, project_id: str) -> dict:
        p = self._r("GET", f"/v9/projects/{project_id}")
        domains = [a.get("domain") for a in (p.get("alias") or []) if a.get("domain")]
        return {"id": p["id"], "name": p.get("name"), "url": f"https://{domains[0]}" if domains else f"https://{p.get('name')}.vercel.app", "repo": (p.get("link") or {}).get("repo")}

    def deployments(self, project_id: str, limit: int = 12) -> list[dict]:
        return [
            {
                "id": d.get("uid"),
                "state": (d.get("state") or d.get("readyState") or "").lower(),
                "context": d.get("target") or "preview",
                "title": (d.get("meta") or {}).get("githubCommitMessage") or d.get("name"),
                "created": d.get("created") or d.get("createdAt"),
                "url": f"https://{d['url']}" if d.get("url") else None,
                "log_url": d.get("inspectorUrl"),
            }
            for d in (self._r("GET", "/v6/deployments", query={"projectId": project_id, "limit": limit}) or {}).get("deployments", [])
        ]

    def cancel_deployment(self, deployment_id: str):
        return self._r("PATCH", f"/v12/deployments/{deployment_id}/cancel")

    def env(self, project_id: str) -> list[dict]:
        return [{"key": e["key"], "contexts": e.get("target") or [], "id": e.get("id")} for e in (self._r("GET", f"/v10/projects/{project_id}/env") or {}).get("envs", [])]

    def set_env(self, project_id: str, key: str, value: str) -> None:
        self._r("POST", f"/v10/projects/{project_id}/env", {"key": key, "value": value, "type": "encrypted", "target": ["production", "preview"]}, {"upsert": "true"})

    def delete_env(self, project_id: str, key: str) -> None:
        for e in self.env(project_id):
            if e["key"] == key and e.get("id"):
                self._r("DELETE", f"/v9/projects/{project_id}/env/{e['id']}")


# ---------------------------------------------------------------------------
# Render (third option: one always-on style server, free instance sleeps when idle)
# ---------------------------------------------------------------------------


class Render:
    BASE = "https://api.render.com/v1"
    TOKEN_URL = "https://dashboard.render.com/u/settings#api-keys"

    def __init__(self, token: str | None = None):
        self.token = token or store.get_secret("render_token")

    def _r(self, method, path, body=None, query=None):
        return _request("Render", self.BASE, self.token, method, path, body, query)

    def owners(self) -> list[dict]:
        return [{"id": o["owner"]["id"], "name": o["owner"].get("name"), "email": o["owner"].get("email")} for o in self._r("GET", "/owners", query={"limit": 20}) or []]

    def services(self) -> list[dict]:
        out = []
        for row in self._r("GET", "/services", query={"limit": 50}) or []:
            s = row.get("service", row)
            details = s.get("serviceDetails") or {}
            out.append({"id": s["id"], "name": s.get("name"), "type": s.get("type"), "url": details.get("url"), "repo": s.get("repo"), "branch": s.get("branch"), "suspended": s.get("suspended"), "dashboard": s.get("dashboardUrl")})
        return out

    def service(self, service_id: str) -> dict:
        s = self._r("GET", f"/services/{service_id}")
        details = s.get("serviceDetails") or {}
        return {"id": s["id"], "name": s.get("name"), "url": details.get("url"), "repo": s.get("repo"), "branch": s.get("branch"), "suspended": s.get("suspended"), "dashboard": s.get("dashboardUrl")}

    def deploys(self, service_id: str, limit: int = 12) -> list[dict]:
        out = []
        for row in self._r("GET", f"/services/{service_id}/deploys", query={"limit": limit}) or []:
            d = row.get("deploy", row)
            out.append({"id": d["id"], "state": d.get("status"), "title": (d.get("commit") or {}).get("message"), "created": d.get("createdAt"), "finished": d.get("finishedAt"), "context": d.get("trigger")})
        return out

    def trigger_deploy(self, service_id: str, clear_cache: bool = False):
        return self._r("POST", f"/services/{service_id}/deploys", {"clearCache": "clear" if clear_cache else "do_not_clear"})

    def env(self, service_id: str) -> list[dict]:
        return [{"key": (row.get("envVar") or row)["key"], "contexts": ["all"]} for row in self._r("GET", f"/services/{service_id}/env-vars", query={"limit": 100}) or []]

    def set_env(self, service_id: str, key: str, value: str) -> None:
        self._r("PUT", f"/services/{service_id}/env-vars/{key}", {"value": value})

    def delete_env(self, service_id: str, key: str) -> None:
        self._r("DELETE", f"/services/{service_id}/env-vars/{key}")
