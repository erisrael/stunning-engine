import { createHash } from "node:crypto";

type Connection = { baseUrl: string; username: string; password?: string; sessionCookie?: string };
const sessions = new Map<string, { expires: number; value: Promise<string> }>();
const tables = new Map<string, { expires: number; value: Promise<string> }>();
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function trim<T>(map: Map<string, T>) {
  if (map.size >= 128) map.delete(map.keys().next().value!);
}

// Connection-specific keys prevent users with separate Noor accounts sharing a session.
// Concurrent page requests share the same sign-in; secrets never enter the browser/job rows.
export async function cmsSession(config: Connection, authenticate: (base: string, username: string, password: string) => Promise<string>, fresh = false) {
  const key = digest(JSON.stringify([config.baseUrl, config.username, config.password, config.sessionCookie]));
  const cached = sessions.get(key);
  if (!fresh && cached && cached.expires > Date.now()) return cached.value;
  trim(sessions);
  const value = !fresh && config.sessionCookie ? Promise.resolve(config.sessionCookie) : authenticate(config.baseUrl, config.username, config.password || "");
  sessions.set(key, { expires: Date.now() + 10 * 60_000, value });
  try { return await value; } catch (error) { if (sessions.get(key)?.value === value) sessions.delete(key); throw error; }
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
