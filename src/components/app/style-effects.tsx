"use client";

import * as React from "react";

// Click effects for the UI styles (src/app/ui-styles.css): a comic "POW!" burst, anime sparkles and petals, a neon
// ring, a tactical hit marker, a pixel burst, or a soft ripple. Only on things you press (buttons, links, tabs),
// never with reduced motion or Lite mode, and never on the customer widget or kiosks (they have no style).
const PRESSABLE = "button, a[href], [role='button'], [role='tab'], [role='menuitem'], [role='radio'], [role='switch'], [role='checkbox'], summary, label";
const COMIC = ["POW!", "BAM!", "ZAP!", "WHAM!", "BOOM!", "KAPOW!", "BIFF!", "ZOK!"];
const SPARKS = ["+", "*", "o", "x", "•", "·"];
const PASTEL = ["#ff8fc2", "#b28dff", "#7fd6ff", "#ffd36e", "#9ef0c5"];

function spawn(layer: HTMLElement, style: string, x: number, y: number) {
  const add = (el: HTMLElement, ms: number) => {
    layer.appendChild(el);
    window.setTimeout(() => el.remove(), ms);
  };
  const box = (css: Partial<CSSStyleDeclaration>) => {
    const el = document.createElement("span");
    Object.assign(el.style, { position: "fixed", left: `${x}px`, top: `${y}px`, pointerEvents: "none", ...css });
    return el;
  };
  if (style === "comic") {
    const el = box({ transform: `translate(-50%, -50%) rotate(${Math.round(Math.random() * 30 - 15)}deg)` });
    el.className = "fx-comic";
    el.textContent = COMIC[Math.floor(Math.random() * COMIC.length)]!;
    add(el, 650);
  } else if (style === "sakura") {
    for (let i = 0; i < 9; i++) {
      const a = (Math.PI * 2 * i) / 9 + Math.random() * 0.5;
      const d = 30 + Math.random() * 30;
      const el = box({ color: PASTEL[i % PASTEL.length]!, fontSize: `${10 + Math.random() * 10}px` });
      el.className = "fx-spark";
      el.style.setProperty("--dx", `${Math.cos(a) * d}px`);
      el.style.setProperty("--dy", `${Math.sin(a) * d - 10}px`);
      el.textContent = SPARKS[i % SPARKS.length]!;
      add(el, 750);
    }
  } else if (style === "sunset") {
    const el = box({});
    el.className = "fx-ring";
    add(el, 600);
  } else if (style === "tactical") {
    const el = box({});
    el.className = "fx-hit";
    add(el, 320);
  } else if (style === "classic") {
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      const el = box({});
      el.className = "fx-pixel";
      el.style.setProperty("--dx", `${Math.round(Math.cos(a) * 22)}px`);
      el.style.setProperty("--dy", `${Math.round(Math.sin(a) * 22)}px`);
      add(el, 420);
    }
  } else if (style === "terminal") {
    // Code glyphs float up from the click, and a few square pixels scatter.
    const glyphs = ["{", "}", ";", "</>", "0", "1", "=>", "()", "[]", "&&"];
    for (let i = 0; i < 6; i++) {
      const el = box({});
      el.className = "fx-glyph";
      el.style.setProperty("--dx", `${Math.round((Math.random() - 0.5) * 70)}px`);
      el.style.setProperty("--dy", `${-20 - Math.round(Math.random() * 45)}px`);
      el.textContent = glyphs[Math.floor(Math.random() * glyphs.length)]!;
      add(el, 700);
    }
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI * 2 * i) / 6;
      const el = box({});
      el.className = "fx-pixel fx-pixel-term";
      el.style.setProperty("--dx", `${Math.round(Math.cos(ang) * 18)}px`);
      el.style.setProperty("--dy", `${Math.round(Math.sin(ang) * 18)}px`);
      add(el, 420);
    }
  } else if (style === "studio") {
    const el = box({});
    el.className = "fx-ripple";
    add(el, 500);
  }
}

export function StyleEffects() {
  React.useEffect(() => {
    const layer = document.createElement("div");
    layer.setAttribute("aria-hidden", "true");
    layer.dataset.styleFx = "";
    Object.assign(layer.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "2147483000", overflow: "hidden" });
    document.body.appendChild(layer);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = (e: PointerEvent) => {
      const root = document.documentElement;
      const style = root.dataset.style;
      if (!style || style === "zen" || reduce.matches || root.dataset.lite === "on" || root.dataset.clickFx === "off") return;
      if (e.button !== 0 || !(e.target as Element | null)?.closest?.(PRESSABLE)) return;
      if (layer.childElementCount > 40) return;
      spawn(layer, style, e.clientX, e.clientY);
    };
    document.addEventListener("pointerdown", on, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", on, { capture: true });
      layer.remove();
    };
  }, []);
  return null;
}
