// Browser and phone push notifications (Web Push). The signing keys come from VAPID_PUBLIC_KEY and
// VAPID_PRIVATE_KEY when set; otherwise a pair is generated once and kept in settings, so push works with no setup.

import webpush from "web-push";
import { all, get, nowIso, run } from "./db";

type Keys = { publicKey: string; privateKey: string };
let keys: Promise<Keys> | null = null;

export function vapidKeys(): Promise<Keys> {
  keys ??= (async () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.vapid'");
    if (row) return JSON.parse(row.value) as Keys;
    const fresh = webpush.generateVAPIDKeys();
    await run("INSERT INTO settings (key, value, updated_at) VALUES ('cfg.vapid', ?, ?) ON CONFLICT (key) DO NOTHING", JSON.stringify(fresh), nowIso());
    // Another server instance may have stored its pair first; everyone uses the stored one.
    return JSON.parse((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.vapid'"))!.value) as Keys;
  })().catch((err) => {
    keys = null;
    throw err;
  });
  return keys;
}

export async function saveSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string | null) {
  if (!/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("Invalid push subscription.");
  await run(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
    sub.endpoint,
    userId,
    sub.keys.p256dh,
    sub.keys.auth,
    userAgent?.slice(0, 200) ?? null,
    nowIso(),
  );
}

export async function removeSubscription(endpoint: string, userId: string) {
  await run("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", endpoint, userId);
}

export async function subscriptionCount(userId: string) {
  return Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM push_subscriptions WHERE user_id = ?", userId))?.c ?? 0);
}

// ttl: seconds the push service keeps trying (short for calls); urgent: delivered at once even in battery saving;
// call: the call id, so the device shows a ringing notification with Answer and Decline.
export type PushPayload = { title: string; body?: string; link?: string; tag?: string; ttl?: number; urgent?: boolean; call?: string };

// Sends to every device of the given people. Expired subscriptions are removed. Never throws.
export async function sendPush(userIds: string[], payload: PushPayload) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  try {
    const subs = await all<{ endpoint: string; p256dh: string; auth: string }>(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${ids.map(() => "?").join(",")})`,
      ...ids,
    );
    if (!subs.length) return;
    const k = await vapidKeys();
    const subject = process.env.VAPID_SUBJECT || "mailto:admin@myseed.local";
    const body = JSON.stringify({ title: payload.title, body: payload.body ?? "", link: payload.link ?? "/dashboard", tag: payload.tag, call: payload.call });
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            vapidDetails: { subject, publicKey: k.publicKey, privateKey: k.privateKey },
            TTL: payload.ttl ?? 3600,
            urgency: payload.urgent ? "high" : "normal",
            timeout: 4000,
          });
          await run("UPDATE push_subscriptions SET last_used_at = ? WHERE endpoint = ?", nowIso(), s.endpoint);
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await run("DELETE FROM push_subscriptions WHERE endpoint = ?", s.endpoint);
        }
      }),
    );
  } catch (err) {
    console.error("push failed", err);
  }
}
