import assert from "node:assert/strict";
import { updateCmsFeedback, queryCmsTable } from "../../src/lib/cms-livewire";
const original=globalThis.fetch;
async function main(){
 const snapshot=JSON.stringify({memo:{name:"App\\Filament\\ViewFeedback"},data:{}}).replaceAll('"','&quot;');
 let calls:Record<string,any>[]=[];
 globalThis.fetch=async (_url,init)=>{if(!init?.method)return new Response(`<meta name="csrf-token" content="test"><div wire:snapshot="${snapshot}" data-update-uri="/livewire/update">update_status</div>`);const body=JSON.parse(String(init.body));calls.push(body.components[0]);const data=calls.length===1?{mountedActions:[[{name:"update_status",data:{status:"pending",admin_note:null}}],{s:"arr"}]}:{mountedActions:[[],{s:"arr"}]};return Response.json({components:[{snapshot:JSON.stringify({memo:{errors:{}},data}),effects:{}}]});};
 await updateCmsFeedback("https://cms.example.test","test-cookie","89","resolved","Resolved with the team");
 assert.equal(calls.length,2);assert.equal(calls[0].calls[0].method,"mountAction");assert.equal(calls[1].calls[0].method,"callMountedAction");assert.equal(calls[1].updates["mountedActions.0.data.status"],"resolved");
 await assert.rejects(()=>updateCmsFeedback("https://cms.example.test","cookie","../../admin","resolved","No"),/live feedback/);
 globalThis.fetch=async()=>new Response("Forbidden",{status:403});await assert.rejects(()=>updateCmsFeedback("https://cms.example.test","cookie","89","resolved","No"),/403/);
 console.log("PASS Remote feedback uses signed mount/save flow and does not report failed updates as success");
 const tableSnap=JSON.stringify({data:{tableRecordsPerPage:10}}).replaceAll('"','&quot;');
 const table=`<meta name="csrf-token" content="test"><div wire:snapshot="${tableSnap}" data-update-uri="/livewire/update"></div><select wire:model="tableDeferredFilters.status.value"><option value="active">Active</option></select>`;
 globalThis.fetch=async(_url,init)=>{const payload=JSON.parse(String(init?.body)).components[0];assert.equal(payload.updates.tableSearch,"search");assert.equal(payload.updates.tableRecordsPerPage,25);assert.equal(payload.updates["tableDeferredFilters.status.value"],"active");assert.deepEqual(payload.calls.at(-1).params,[2,"page"]);return Response.json({components:[{snapshot:JSON.stringify({data:{tableRecordsPerPage:25}}),effects:{html:"Showing 26 to 50 of 80 results"}}]});};
 assert.equal((await queryCmsTable(table,"https://cms.example.test","cookie",{page:2,pageSize:25,search:"search",filters:{"status.value":"active"}})).pageSize,25);
 await assert.rejects(()=>queryCmsTable(table,"https://cms.example.test","cookie",{page:1,pageSize:25,search:"",filters:{"status.value":"invalid"}}),/Invalid/);
 console.log("PASS Live search, filters and pagination reach the native table protocol");
}
main().catch(e=>{console.error(e);console.log("FAIL CMS remote regression");process.exitCode=1;}).finally(()=>{globalThis.fetch=original});
