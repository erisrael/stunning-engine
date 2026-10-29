"use client";

// End-to-end encryption for direct chats, with keys protected by the login password.
//
// Normally nothing is asked: the sign-in form leaves a derived key on the device, and keys are created or
// unlocked from it. The password is asked once per device only when that key is missing (signed in before this
// existed) or out of date (password reset by an administrator). People who used the old chat passphrase enter
// it one last time to move to the automatic keys.

import * as React from "react";
import { toast } from "sonner";
import { LockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { myChatKeysAction, peerKeyAction, saveChatKeysAction, verifyPasswordAction } from "@/app/actions/chat";
import { cacheKey, cachedKey, conversationKey, createKeysWith, forgetKey, loginWrapKey, migratePassphrase, rememberedLogin, rememberWrap, unlockWith } from "@/lib/e2e";

type Keys = { publicKey: string | null; privateEnc: string | null; kdf: "login" | "passphrase"; email: string };

export type Secure = {
  state: "loading" | "password" | "legacy" | "reset" | "ready" | "no-peer-key" | "off";
  key: CryptoKey | null;
  submitPassword: (password: string) => Promise<void>;
  migrate: (passphrase: string, password?: string) => Promise<void>;
  startFresh: () => Promise<void>;
  lock: () => Promise<void>;
  hasWrap: boolean;
};

async function createAndSave(viewerId: string, email: string, wrap: CryptoKey) {
  const k = await createKeysWith(wrap);
  const r = await saveChatKeysAction({ publicKey: k.publicKey, privateEnc: k.privateEnc, kdf: "login" });
  if (!r.ok) throw new Error(r.error);
  await cacheKey(viewerId, k.privateKey);
  await rememberWrap(email, wrap);
  return k.privateKey;
}

export function useSecureChat(viewerId: string | null, peerId: string | null): Secure {
  const [state, setState] = React.useState<Secure["state"]>(viewerId ? "loading" : "off");
  const [key, setKey] = React.useState<CryptoKey | null>(null);
  const [keys, setKeys] = React.useState<Keys | null>(null);
  const [wrap, setWrap] = React.useState<CryptoKey | null>(null);

  const finish = React.useCallback(
    async (privateKey: CryptoKey) => {
      const peer = peerId ? await peerKeyAction(peerId) : null;
      if (!peer?.ok || !peer.data) return setState("no-peer-key");
      setKey(await conversationKey(privateKey, peer.data as string));
      setState("ready");
    },
    [peerId],
  );

  // Uses a wrapping key (from sign-in or the password) to create, unlock or report what is needed.
  const proceed = React.useCallback(
    async (k: Keys, w: CryptoKey | null) => {
      if (!viewerId) return;
      if (!k.publicKey || !k.privateEnc) {
        if (!w) return setState("password");
        return finish(await createAndSave(viewerId, k.email, w));
      }
      if (k.kdf === "passphrase") return setState("legacy");
      if (!w) return setState("password");
      try {
        const pk = await unlockWith(k.privateEnc, w);
        await cacheKey(viewerId, pk);
        await finish(pk);
      } catch {
        // The keys were protected by another password, for example before an administrator reset it.
        setState("reset");
      }
    },
    [viewerId, finish],
  );

  React.useEffect(() => {
    if (!viewerId) return;
    let live = true;
    void (async () => {
      const r = await myChatKeysAction();
      if (!live || !r.ok || !r.data) return;
      const k = r.data as Keys;
      setKeys(k);
      const w = await rememberedLogin(k.email);
      setWrap(w);
      const cached = k.publicKey ? await cachedKey(viewerId) : null;
      if (cached) return finish(cached);
      await proceed(k, w);
    })();
    return () => {
      live = false;
    };
  }, [viewerId, finish, proceed]);

  return {
    state,
    key,
    hasWrap: !!wrap,
    submitPassword: async (password) => {
      const ok = await verifyPasswordAction(password);
      if (!ok.ok) throw new Error(ok.error);
      const w = await loginWrapKey(keys!.email, password);
      await rememberWrap(keys!.email, w);
      setWrap(w);
      await proceed(keys!, w);
    },
    migrate: async (passphrase, password) => {
      let w = wrap;
      if (!w) {
        if (!password) throw new Error("Enter your account password too.");
        const ok = await verifyPasswordAction(password);
        if (!ok.ok) throw new Error(ok.error);
        w = await loginWrapKey(keys!.email, password);
        await rememberWrap(keys!.email, w);
        setWrap(w);
      }
      const m = await migratePassphrase(keys!.privateEnc!, passphrase, w);
      const r = await saveChatKeysAction({ publicKey: keys!.publicKey!, privateEnc: m.privateEnc, kdf: "login", rewrap: true });
      if (!r.ok) throw new Error(r.error);
      setKeys({ ...keys!, privateEnc: m.privateEnc, kdf: "login" });
      await cacheKey(viewerId!, m.privateKey);
      await finish(m.privateKey);
    },
    startFresh: async () => {
      if (!wrap) return setState("password");
      const pk = await createAndSave(viewerId!, keys!.email, wrap);
      toast.success("New secure keys created. Earlier direct messages cannot be read on any device.");
      await finish(pk);
    },
    lock: async () => {
      await forgetKey(viewerId!);
      setKey(null);
      setState("password");
    },
  };
}

export function SecureGate({ secure, peerName }: { secure: Secure; peerName: string }) {
  const [password, setPassword] = React.useState("");
  const [passphrase, setPassphrase] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const run = async (fn: () => Promise<void>, error: string) => {
    setBusy(true);
    try {
      await fn();
      setPassword("");
      setPassphrase("");
    } catch (err) {
      toast.error(err instanceof Error && err.message && !/operation|decrypt/i.test(err.message) ? err.message : error);
    } finally {
      setBusy(false);
    }
  };
  if (secure.state === "loading") return <footer className="border-t p-4 text-center text-sm text-muted-foreground">Preparing secure chat...</footer>;
  if (secure.state === "no-peer-key")
    return (
      <footer className="flex items-center justify-center gap-2 border-t p-4 text-center text-sm text-muted-foreground">
        <LockIcon className="size-4" /> {peerName} has not signed in since secure chat was set up. You can write as soon as they do; nothing else is needed from them.
      </footer>
    );
  return (
    <footer className="border-t bg-card p-4">
      <form
        className="mx-auto flex max-w-md flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (secure.state === "legacy") void run(() => secure.migrate(passphrase, password || undefined), "That chat passphrase is not correct.");
          else if (secure.state === "reset") void run(() => secure.startFresh(), "Could not create new keys.");
          else void run(() => secure.submitPassword(password), "That password is not correct.");
        }}
      >
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <LockIcon className="size-4 text-[var(--st-done-fg)]" />
          {secure.state === "legacy" ? "Move to automatic secure chat" : secure.state === "reset" ? "Secure chat needs new keys" : "Confirm it is you"}
        </p>
        <p className="text-xs text-muted-foreground">
          {secure.state === "legacy"
            ? "Secure chat no longer needs its own passphrase. Enter your old chat passphrase one last time; from then on your account password protects your keys and nothing is asked again."
            : secure.state === "reset"
              ? "Your keys were protected by a previous password (for example before an administrator reset it). Create new keys to keep chatting. Earlier direct messages stay unreadable unless you sign in on a device that still has the old keys."
              : "Direct messages are end-to-end encrypted with your account password. Enter it once on this device; it is checked here and never stored."}
        </p>
        {secure.state === "legacy" && <Input type="password" autoComplete="off" placeholder="Old chat passphrase" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />}
        {(secure.state === "password" || (secure.state === "legacy" && !secure.hasWrap)) && (
          <Input type="password" autoComplete="current-password" placeholder="Account password" value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || (secure.state === "legacy" ? !passphrase : secure.state === "password" ? !password : false)} className="flex-1">
            {busy ? "Working..." : secure.state === "legacy" ? "Move my keys" : secure.state === "reset" ? "Create new keys" : "Continue"}
          </Button>
          {secure.state === "legacy" && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void run(() => secure.startFresh(), "Could not create new keys.")}>
              Forgot it? Start fresh
            </Button>
          )}
        </div>
      </form>
    </footer>
  );
}

// Runs once per session on every page: creates secure chat keys right after sign-in, so others can write to a
// person before they ever open Chat.
export function ChatKeyBootstrap({ viewerId }: { viewerId: string }) {
  React.useEffect(() => {
    const flag = `myseed.e2e.boot.${viewerId}`;
    try {
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, "1");
    } catch {
      /* storage blocked: try anyway */
    }
    void (async () => {
      const r = await myChatKeysAction();
      if (!r.ok || !r.data || r.data.publicKey) return;
      const w = await rememberedLogin(r.data.email);
      if (w) await createAndSave(viewerId, r.data.email, w).catch(() => undefined);
    })();
  }, [viewerId]);
  return null;
}
