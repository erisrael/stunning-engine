import type { Equipment } from "@/server/resources";
export function equipmentAdvice(e:Equipment,today:string=new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Addis_Ababa"})) {
 const reasons=[];
 if(["repair_needed","under_repair","repair"].includes(e.status)) reasons.push("Repair follow-up required");
 if(e.maintenance_due&&e.maintenance_due<=today&&!['retired','lost'].includes(e.status)) reasons.push("Scheduled maintenance is due");
 if(e.repairs>=3 || (e.purchase_cost>0&&e.repair_cost>=e.purchase_cost*.5) || e.status==='replacement_needed') reasons.push("Review replacement: repeated repairs or high cumulative repair cost");
 if(e.quantity<=e.reorder_level) reasons.push("Stock is at or below reorder level");
 return reasons;
}
