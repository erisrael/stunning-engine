"use client";

import * as Real from "@/app/actions/fun";

// What the games and Seed Town call to save scores, rewards, looks and rides: the server actions for signed-in
// people, or the guest arcade's own versions (kept in the browser; see guest-actions.ts) while /arcade is open.
// Files import F from here instead of the actions module; it forwards every call to whichever is current.
export type FunActions = typeof Real;
let current: FunActions = Real;
export function setFunActions(a: FunActions | null) {
  current = a ?? Real;
}
export const isGuestActions = () => current !== Real;
export const F: FunActions = new Proxy({} as FunActions, { get: (_t, k) => (current as unknown as Record<string | symbol, unknown>)[k] });
