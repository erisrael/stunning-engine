import assert from "node:assert/strict";
import { get, run, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { saveLegacyCmsConfig } from "../../src/server/legacy-cms";
import { startCmsTask, cmsTaskStatus, cancelCmsTask, runCmsTask } from "../../src/server/cms-tasks";
import { cmsSession } from "../../src/server/cms-session";

const original=globalThis.fetch;
const snapshot=JSON.stringify({data:{tableRecordsPerPage:10}}).replaceAll('"','&quot;');
const seed=`<meta name="csrf-token" content="test"><div wire:snapshot="${snapshot}" data-update-uri="/livewire/update"></div>`;
const rows=(start:number,count:number,total:number)=>`<table><thead><tr><th>Name</th></tr></thead><tbody>${Array.from({length:count},(_,i)=>`<tr><td><a href="/admin/students/${start+i}">Student ${start+i}</a></td></tr>`).join("")}</tbody></table>Showing ${start} to ${start+count-1} of ${total} results`;
async function main() {
  const admin=(await loadUser((await get<{id:string}>("SELECT id FROM users WHERE email='admin@demo.local'"))!.id))!;
  const other=(await loadUser((await get<{id:string}>("SELECT id FROM users WHERE email='dawit@demo.local'"))!.id))!;
  await saveLegacyCmsConfig(admin,{baseUrl:"https://cms.fixture.test",username:"fixture",password:"fixture",sessionCookie:"session=test",autoSync:false});
  let release!:()=>void, requested!:()=>void;
  const held=new Promise<void>(resolve=>release=resolve), request=new Promise<void>(resolve=>requested=resolve);
  let gets=0, posts=0;
  globalThis.fetch=async(_url,init)=>{
    if(!init?.method){gets++;requested();await held;return new Response(seed);}
    posts++;return Response.json({components:[{snapshot:JSON.stringify({data:{tableRecordsPerPage:10}}),effects:{html:rows(1,2,2)}}]});
  };
  const input={kind:"live" as const,category:"students" as const,page:1,pageSize:10};
  const id=await startCmsTask(admin,input);
  assert.equal(await startCmsTask(admin,input),id);
  assert.equal((await cmsTaskStatus(admin,id)).status,"queued");
  const working=runCmsTask(id);await request;
  const status=await cmsTaskStatus(admin,id);assert.equal(status.status,"running");assert.equal(status.result,null);
  await assert.rejects(()=>cmsTaskStatus(other,id),/not found/i);
  await assert.rejects(()=>cancelCmsTask(other,id),/not found/i);
  console.log("PASS Slow upstream work does not block start/status requests and job results stay private");
  await cancelCmsTask(admin,id);release();await working;
  assert.equal((await cmsTaskStatus(admin,id)).status,"cancelled");
  assert.equal((await cmsTaskStatus(admin,id)).result,null);
  const retry=await startCmsTask(admin,input);
  await Promise.all([runCmsTask(retry),runCmsTask(retry)]);
  assert.equal((await cmsTaskStatus(admin,retry)).status,"completed");
  assert.equal(posts,2);assert.equal(gets,1);
  console.log("PASS Cancellation suppresses late results, workers claim once, and live pages reuse the table session");
  let authCalls=0;
  const auth=async()=>{authCalls++;return `session=${authCalls}`;};
  const connection={baseUrl:"https://cms.session.test",username:"first",password:"secret"};
  const cookies=await Promise.all([cmsSession(connection,auth),cmsSession(connection,auth)]);
  assert.equal(cookies[0],cookies[1]);assert.equal(authCalls,1);
  assert.notEqual(await cmsSession({...connection,username:"second"},auth),cookies[0]);
  // Noor keeps one session per login: a renewal just after a sign-in shares it instead of ending it.
  assert.equal(await cmsSession(connection,auth,true),cookies[0]);
  const { forgetCmsSessions } = await import("../../src/server/cms-session");
  forgetCmsSessions();
  assert.notEqual(await cmsSession(connection,auth,true),cookies[0]);
  console.log("PASS Concurrent sign-ins are shared only within the same credentials and expired sessions can be replaced");
  await run("INSERT INTO legacy_cms_records (id,category,external_id,title,data_json,synced_at) VALUES ('original','students','original','Original cache','{}',?)",new Date().toISOString());
  let failLast=true;
  globalThis.fetch=async(url,init)=>{
    if(String(url).endsWith('/admin/login'))return new Response(seed,{headers:{'set-cookie':'session=fake; Path=/'}});
    if(!init?.method)return new Response(seed);
    const component=JSON.parse(String(init.body)).components[0];
    if(component.calls[0].method==='authenticate') return Response.json({},{headers:{'set-cookie':'session=authenticated; Path=/'}});
    const page=component.calls.at(-1).params[0];
    if(page===2 && failLast)return new Response('Unavailable',{status:503});
    return Response.json({components:[{snapshot:JSON.stringify({data:{tableRecordsPerPage:50}}),effects:{html:page===1?rows(1,50,51):rows(51,1,51)}}]});
  };
  const broken=await startCmsTask(admin,{kind:"sync",category:"students"});await runCmsTask(broken);
  assert.equal((await cmsTaskStatus(admin,broken)).status,"failed");
  assert.ok(await get("SELECT id FROM legacy_cms_records WHERE id='original'"));
  failLast=false;
  const synced=await startCmsTask(admin,{kind:"sync",category:"students"});await runCmsTask(synced);
  assert.equal((await cmsTaskStatus(admin,synced)).status,"completed");
  assert.equal(Number((await get<{n:number}>("SELECT COUNT(*) AS n FROM legacy_cms_records WHERE category='students'"))?.n),51);
  assert.equal(await get("SELECT id FROM legacy_cms_records WHERE id='original'"),undefined);
  console.log("PASS Failed full scrapes preserve the old cache and completed full scrapes publish all records atomically");
  const stale=await startCmsTask(admin,input);
  await run("UPDATE cms_tasks SET status='running',updated_at='2020-01-01T00:00:00Z' WHERE id=?",stale);
  assert.equal((await cmsTaskStatus(admin,stale)).status,"failed");
  console.log("PASS Interrupted workers become retryable failures instead of leaving requests stuck forever");
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{globalThis.fetch=original;await closeDb();});
