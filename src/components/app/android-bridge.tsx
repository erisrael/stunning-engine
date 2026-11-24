"use client";

// Inside the Android app (mobile-ops/): files a page makes itself (Excel, CSV and PDF exports, saved with
// <a download href="blob:...">) would be lost, because Android's web view cannot save blob links. Here such a click
// hands the file to the app (MyseedAndroid.save), which puts it in Downloads. Blob links are kept a minute longer so
// the file can still be read after the page lets go of it. Does nothing in a browser.

import * as React from "react";

type Bridge = { save: (base64: string, name: string, mime: string) => void };

export function AndroidBridge() {
  React.useEffect(() => {
    const bridge = (window as Window & { MyseedAndroid?: Bridge }).MyseedAndroid;
    if (!bridge) return;
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (u: string) => void window.setTimeout(() => revoke(u), 60_000);
    const send = async (a: HTMLAnchorElement) => {
      try {
        const blob = await (await fetch(a.href)).blob();
        const data = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
          r.onerror = () => reject(r.error);
          r.readAsDataURL(blob);
        });
        bridge.save(data, a.download || "download", blob.type);
      } catch {
        bridge.save("", "", "");
      }
    };
    const isBlob = (a: HTMLAnchorElement) => a.href.startsWith("blob:") || a.href.startsWith("data:");
    // Links made in code and clicked without being added to the page.
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (isBlob(this) && this.hasAttribute("download")) return void send(this);
      return click.call(this);
    };
    // Links on the page.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[download]") as HTMLAnchorElement | null;
      if (a && isBlob(a)) {
        e.preventDefault();
        void send(a);
      }
    };
    document.addEventListener("click", onClick, true);
    return () => {
      URL.revokeObjectURL = revoke;
      HTMLAnchorElement.prototype.click = click;
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
