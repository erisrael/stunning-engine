"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as b from "@/server/branding";

// Admin, Branding: section banners and the sidebar's icons and colours.
export async function saveBannerAction(input: Parameters<typeof b.saveBanner>[1]) {
  return wrap(async () => b.saveBanner(await requireViewer(), input));
}
export async function removeBannerAction(key: string) {
  return wrap(async () => b.removeBanner(await requireViewer(), key));
}
export async function saveNavBrandAction(input: b.NavBrand) {
  return wrap(async () => b.saveNavBrand(await requireViewer(), input));
}
