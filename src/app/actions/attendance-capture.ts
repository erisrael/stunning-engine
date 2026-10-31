"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import {
  checkinView,
  decideFlags,
  leadCheckin,
  rotatePoster,
  saveCaptureConfig,
  selfCheckin,
  setDevice,
  sharedCheckin,
  sharedLookup,
  type CaptureConfig,
} from "@/server/attendance-capture";
import type { EventKind } from "@/lib/attendance";

type Where = { code?: string | null; lat?: number | null; lng?: number | null; accuracy?: number | null };

export async function checkinViewAction(input: Where) {
  return wrap(async () => checkinView(await requireViewer(), input), { revalidate: false });
}

export async function selfCheckinAction(input: Where & { kind: EventKind }) {
  return wrap(async () => selfCheckin(await requireViewer(), input));
}

// The shared office computer is not signed in as the person: the number and PIN say who it is.
export async function sharedLookupAction(input: { code: string; pin: string }) {
  return wrap(() => sharedLookup(input), { revalidate: false });
}

export async function sharedCheckinAction(input: { code: string; pin: string; kind: EventKind }) {
  return wrap(() => sharedCheckin(input), { revalidate: false });
}

export async function leadCheckinAction(input: { employeeId?: string | null; badge?: string | null; kind: EventKind; note?: string | null }) {
  return wrap(async () => leadCheckin(await requireViewer(), input));
}

export async function saveCaptureConfigAction(input: CaptureConfig) {
  return wrap(async () => saveCaptureConfig(await requireViewer(), input));
}

export async function rotatePosterAction(siteId: string) {
  return wrap(async () => rotatePoster(await requireViewer(), siteId));
}

export async function decideFlagsAction(ids: string[], accept: boolean, note?: string | null) {
  return wrap(async () => decideFlags(await requireViewer(), ids, accept, note));
}

export async function setDeviceAction(deviceId: string, employeeId: string, status: "active" | "blocked" | "removed") {
  return wrap(async () => setDevice(await requireViewer(), deviceId, employeeId, status));
}
