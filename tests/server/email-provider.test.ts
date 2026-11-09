import assert from "node:assert/strict";
import { closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { saveSmtp, smtpSettings } from "../../src/server/email";
async function main(){
 const admin=(await loadUser((await get<{id:string}>("SELECT id FROM users WHERE email='admin@demo.local'"))!.id))!;
 const base={host:"",port:587,secure:false,user:"",fromName:"Test",fromAddress:"sender@example.test"};
 await saveSmtp(admin,{...base,relay:"brevo",relayKey:"test-brevo-key"});
 assert.equal((await smtpSettings()).relay,"brevo");assert.equal((await smtpSettings()).hasRelayKey,true);
 await saveSmtp(admin,{...base,relay:"brevo"});
 assert.equal((await smtpSettings()).hasRelayKey,true);
 await assert.rejects(()=>saveSmtp(admin,{...base,relay:"resend"}),/API key/);
 assert.equal((await smtpSettings()).relay,"brevo");
 await saveSmtp(admin,{...base,relay:"resend",relayKey:"test-resend-key"});
 assert.equal((await smtpSettings()).relay,"resend");assert.equal((await smtpSettings()).hasRelayKey,true);
 const stored=await get<{value:string}>("SELECT value FROM settings WHERE key='cfg.smtp'");
 assert.ok(!stored!.value.includes("test-resend-key"));

 process.env.SMTP_HOST = "mail.env-host.test";
 process.env.SMTP_USER = "envuser@env-host.test";
 assert.equal((await smtpSettings()).source, "app");
 assert.equal((await smtpSettings()).relay, "resend");
 await saveSmtp(admin, { ...base, relay: "brevo", relayKey: "new-brevo-key" });
 assert.equal((await smtpSettings()).relay, "brevo");
 console.log("PASS Email settings save and override environment variables");
 console.log("PASS Provider configuration persists encrypted keys and cannot reuse another provider's credentials");
}
main().catch(e=>{console.error(e);console.log("FAIL email provider");process.exitCode=1;}).finally(()=>closeDb());
