export { cn } from "cn"

// Light mode for slow connections (account menu): background checks run three times less often.
export function pollMs(ms: number) {
  if (typeof document === "undefined") return ms;
  return document.documentElement.dataset.lite === "on" ? ms * 3 : ms;
}
