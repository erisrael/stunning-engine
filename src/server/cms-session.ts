import { createHash } from "node:crypto";

type Connection = { baseUrl: string; username: string; password?: string; sessionCookie?: string };
// One Noor session per account: Noor allows a single session per login and ends the older one whenever the
// same login signs in again, so every part of the app (live loads, sync, slips, feedback) shares this one.
const sessions = new Map<string, { expires: number; at: number; kind: "stored" | "login"; value: Promise<string> }>();
const tables = new Map<string, { expires: number; value: Promise<string> }>();
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function trim<T>(map: Map<string, T>) {
  if (map.size >= 128) map.delete(map.keys().next().value!);
}
const accountKey = (config: Connection) => digest(JSON.stringify([config.baseUrl.replace(/\/+$/, ""), config.username.trim().toLowerCase()]));

// fresh: the session was refused (HTTP 302). Requests that find it refused at the same moment share one new
// sign-in (a second sign-in would end the first) instead of each signing in.
export async function cmsSession(config: Connection, authenticate: (base: string, username: string, password: string) => Promise<string>, fresh = false) {
  const key = accountKey(config);
  const cached = sessions.get(key);
  const now = Date.now();
  if (cached && cached.expires > now && (!fresh || (cached.kind === "login" && now - cached.at < 20_000))) return cached.value;
  trim(sessions);
  const stored = !fresh && !cached && !!config.sessionCookie;
  const value = stored ? Promise.resolve(config.sessionCookie!) : authenticate(config.baseUrl, config.username, config.password || "");
  sessions.set(key, { expires: now + 60 * 60_000, at: now, kind: stored ? "stored" : "login", value });
  try { return await value; } catch (error) { if (sessions.get(key)?.value === value) sessions.delete(key); throw error; }
}

// A sign-in made elsewhere (Admin's Sign in) becomes the account's shared session.
export function rememberCmsSession(config: Connection, cookie: string) {
  sessions.set(accountKey(config), { expires: Date.now() + 60 * 60_000, at: Date.now(), kind: "login", value: Promise.resolve(cookie) });
}

// Sign out and disconnect: the next request signs in again instead of reusing a cached session.
export function forgetCmsSessions() {
  sessions.clear();
  tables.clear();
}

export async function cmsTableSeed(url: string, cookie: string, fresh = false) {
  const key = digest(`${url}\n${cookie}`);
  const cached = tables.get(key);
  if (!fresh && cached && cached.expires > Date.now()) return cached.value;
  trim(tables);
  const value = (async () => {
    const response = await fetch(url, { headers: { Cookie: cookie, Accept: "text/html" }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`CMS table could not be opened (HTTP ${response.status}).`);
    return response.text();
  })();
  tables.set(key, { expires: Date.now() + 2 * 60_000, value });
  try { return await value; } catch (error) { if (tables.get(key)?.value === value) tables.delete(key); throw error; }
}
