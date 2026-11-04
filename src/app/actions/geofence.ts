"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as gf from "@/server/geofence";

// The phone's readings and the status are reads for View as too (they never change someone else's attendance there:
// View as has no employee of the viewer's own and the tick only acts for the signed-in person).
export async function geofenceStatusAction() {
  return wrap(async () => gf.geofenceStatus(await requireViewer()), { revalidate: false });
}
export async function geofenceTickAction(input: { lat: number; lng: number; accuracy: number | null }) {
  return wrap(async () => {
    const v = await requireViewer();
    if (v.previewBy) return gf.geofenceStatus(v);
    return gf.geofenceTick(v, input);
  }, { revalidate: false });
}
export async function saveGeofenceConfigAction(input: Partial<gf.GeofenceConfig>) {
  return wrap(async () => gf.saveGeofenceConfig(await requireViewer(), input));
}
