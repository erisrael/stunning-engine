export { cn } from "cn"

// Light mode for slow connections (account menu): background checks run three times less often.
export function pollMs(ms: number) {
  if (typeof document === "undefined") return ms;
  // Lite and Simple look check less often (a slow connection, a calm screen).
  const d = document.documentElement.dataset;
  return d.lite === "on" || "plain" in d ? ms * 3 : ms;
}
