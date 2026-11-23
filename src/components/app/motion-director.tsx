"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

// The cinematic mode's scene cut (src/app/motion.css): on every new page, <html data-scene="cut"> for a moment, so
// the letterbox bars, the dolly-in, the title card and the gliding cards play once. Nothing happens in other modes.
export function MotionDirector() {
  const path = usePathname();
  React.useEffect(() => {
    const el = document.documentElement;
    if (el.dataset.motion !== "cinematic") return;
    el.dataset.scene = "cut";
    const t = window.setTimeout(() => delete el.dataset.scene, 1300);
    return () => window.clearTimeout(t);
  }, [path]);
  return null;
}
