"use client";

import * as React from "react";

// The Dev Terminal style's living layer (src/app/ui-styles.css): faint code falling behind the page, and a status
// line that types short, real development tips with the clock. Only in that style and in dark mode; never with
// reduced motion or Lite mode, on phones, or when the tab is hidden. It never takes a click.
const TIPS = [
  "git status before git commit",
  "check permissions on the server, not the button",
  "schema changes are additive only",
  "write the failing test first, then the fix",
  "SELECT ... WHERE id = ? -- never paste values into SQL",
  "small pull requests get reviewed faster",
  "npm run typecheck && npm test",
  "read the error message twice before searching",
  "name things for what they mean, not what they are",
  "commit messages say what the user sees change",
  "await every promise you start",
  "measure before you optimise",
  "no secrets in commits, logs or prompts",
  "ship it on a weekday morning, watch it after",
];
const GLYPHS = "01{}[]()<>=;:+-*/&|!?#$_abcdefxyz".split("");

export function TerminalAmbient() {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia("(min-width: 900px)");
    const check = () => setOn(root.dataset.style === "terminal" && root.classList.contains("dark") && root.dataset.lite !== "on" && !reduce.matches && wide.matches);
    check();
    const mo = new MutationObserver(check);
    mo.observe(root, { attributes: true, attributeFilter: ["data-style", "class", "data-lite"] });
    reduce.addEventListener("change", check);
    wide.addEventListener("change", check);
    return () => (mo.disconnect(), reduce.removeEventListener("change", check), wide.removeEventListener("change", check));
  }, []);
  if (!on) return null;
  return (
    <>
      <CodeRain />
      <StatusLine />
    </>
  );
}

function CodeRain() {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const size = 14;
    let cols: number[] = [];
    const fit = () => {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
      cols = Array.from({ length: Math.ceil(c.width / size) }, () => Math.floor(Math.random() * -60));
    };
    fit();
    window.addEventListener("resize", fit);
    let last = 0;
    let raf = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || t - last < 70) return; // about 14 frames a second is plenty
      last = t;
      ctx.fillStyle = "rgba(5, 11, 8, 0.12)";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.font = `${size - 2}px ui-monospace, monospace`;
      for (let i = 0; i < cols.length; i++) {
        if (Math.random() < 0.6) continue; // only some columns move each frame
        const y = cols[i]! * size;
        if (y > 0) {
          ctx.fillStyle = Math.random() < 0.04 ? "#ffcc33" : "#00ff9c";
          ctx.fillText(GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!, i * size, y);
        }
        cols[i] = y > c.height && Math.random() > 0.97 ? Math.floor(Math.random() * -20) : cols[i]! + 1;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => (cancelAnimationFrame(raf), window.removeEventListener("resize", fit));
  }, []);
  return <canvas ref={ref} aria-hidden data-terminal-rain className="pointer-events-none fixed inset-0 -z-10 opacity-[0.07]" />;
}

function StatusLine() {
  const [text, setText] = React.useState("");
  const [clock, setClock] = React.useState("");
  React.useEffect(() => {
    let tip = Math.floor(Math.random() * TIPS.length);
    let n = 0;
    let wait = 0;
    const id = window.setInterval(() => {
      setClock(new Date().toTimeString().slice(0, 8));
      if (document.hidden) return;
      const full = TIPS[tip]!;
      if (n <= full.length) setText(full.slice(0, n++));
      else if (++wait > 60) {
        wait = 0;
        n = 0;
        tip = (tip + 1) % TIPS.length;
      }
    }, 70);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div aria-hidden data-terminal-status className="pointer-events-none fixed bottom-2 left-1/2 z-40 -translate-x-1/2 rounded border border-[#134e33] bg-[#030806]/85 px-3 py-1 font-mono text-[11px] text-[#9dffd0] shadow-[0_0_18px_-8px_#00ff9c]">
      <span className="text-[#00ff9c]">myseed@dev</span>
      <span className="text-[#6fcf9f]">:~$ </span>
      {text}
      <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse bg-[#00ff9c]" />
      <span className="ml-3 text-[#6fcf9f]">{clock}</span>
    </div>
  );
}
