"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as r from "@/server/resources";
export async function resourceRequestAction(input:Parameters<typeof r.resourceRequest>[1]) { return wrap(async()=>r.resourceRequest(await requireViewer(),input)); }
export async function resourceCommentAction(id:string,body:string) { return wrap(async()=>r.resourceComment(await requireViewer(),id,body)); }
export async function saveEquipmentAction(input:Parameters<typeof r.saveEquipment>[1]) { return wrap(async()=>r.saveEquipment(await requireViewer(),input)); }
export async function equipmentEventAction(id:string,input:Parameters<typeof r.equipmentEvent>[2]) { return wrap(async()=>r.equipmentEvent(await requireViewer(),id,input)); }
