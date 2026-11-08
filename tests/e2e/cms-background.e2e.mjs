import {chromium} from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const shots=path.join(process.env.SHOTS_DIR||'test-results','cms-background');fs.mkdirSync(shots,{recursive:true});
let fails=0, queries=0, tableLoads=0, failQueries=false, remoteTotal=21, failScan=false, scanFirstReads=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)fails++;};
const snapshot=JSON.stringify({data:{tableRecordsPerPage:10}}).replaceAll('"','&quot;');
const seed=`<meta name="csrf-token" content="test"><div wire:snapshot="${snapshot}" data-update-uri="/livewire/update"></div>`;
const server=http.createServer(async(req,res)=>{
  if(req.method!=='POST') {if(req.url.startsWith('/admin/students'))tableLoads++;res.setHeader('set-cookie','session=fixture; Path=/');res.end(seed);return;}
  let body='';for await(const chunk of req)body+=chunk;
  const component=JSON.parse(body).components[0];
  res.setHeader('content-type','application/json');
  if(component.calls[0].method==='authenticate'){res.setHeader('set-cookie','session=authenticated; Path=/');res.end('{}');return;}
  queries++;
  if(queries===1)await new Promise(resolve=>setTimeout(resolve,22000));
  if(failQueries){res.statusCode=503;res.end('{}');return;}
  const page=component.calls.at(-1).params[0],size=Number(component.updates.tableRecordsPerPage),search=component.updates.tableSearch;
  if(size===50 && page===1)scanFirstReads++;
  if(size===50 && page===2 && failScan){res.statusCode=503;res.end('{}');return;}
  const total=search==='not-found'?0:remoteTotal,start=(page-1)*size+1,count=Math.max(0,Math.min(size,total-start+1));
  const html=`<table><thead><tr><th>Name</th><th>Date</th></tr></thead><tbody>${Array.from({length:count},(_,i)=>`<tr><td><a href="/admin/students/${start+i}">Live student ${start+i}</a></td><td>2026-11-06</td></tr>`).join('')}</tbody></table>Showing ${count?start:0} to ${count?start+count-1:0} of ${total} results`;
  res.end(JSON.stringify({components:[{snapshot:JSON.stringify({data:{tableRecordsPerPage:size}}),effects:{html}}]}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const remote=`http://127.0.0.1:${server.address().port}`,base=process.env.BASE_URL;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined});
const page=await(await browser.newContext({viewport:{width:1440,height:1000}})).newPage();
try{
 await page.goto(`${base}/login`);await page.fill('input[name=email]','admin@demo.local');await page.fill('input[name=password]','Demo-Workflow-2026');await page.getByRole('button',{name:/log in/i}).click();await page.waitForURL(u=>!u.pathname.includes('/login'));
 await page.goto(`${base}/legacy-cms`);await page.getByRole('button',{name:'Settings',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('CMS address').fill(remote);await dialog.getByRole('button',{name:'Save connection settings'}).click();await page.getByText('CMS settings saved',{exact:true}).waitFor();await dialog.getByRole('button',{name:'Close',exact:true}).first().click();
 await page.getByRole('button',{name:'Live CMS Direct',exact:true}).click();
 await page.getByRole('cell').filter({hasText:'Loading students, page 1'}).waitFor({timeout:15000});
 check('Slow live request exposes progress before data arrives',queries<=1);
 await page.locator('[data-sidebar="trigger"]').click();await page.locator('[data-sidebar="trigger"]').click();
 check('Navigation controls remain responsive during scraping',await page.getByRole('button',{name:'Cancel',exact:true}).isVisible());
 await page.getByText('Live student 1',{exact:true}).first().waitFor({timeout:40000});
 check('A response slower than the old 20-second limit completes successfully',await page.locator('tbody tr').count()===10 && queries===1);
 const grip=page.locator('[title="Drag to reposition anywhere on PC (Double-click to reset)"]');
 const gripBox=await grip.boundingBox();await page.mouse.move(gripBox.x+gripBox.width/2,gripBox.y+gripBox.height/2);await page.mouse.down();await page.mouse.move(gripBox.x-180,gripBox.y-300,{steps:10});await page.mouse.up();
 const seedLoads=tableLoads;
 await page.getByRole('button',{name:'Next page',exact:true}).click();await page.getByText('Live student 11',{exact:true}).waitFor({timeout:15000});
 check('Live paging reuses the authenticated table instead of scraping its shell again',tableLoads===seedLoads && await page.locator('tbody tr').count()===10);
 await page.getByLabel('Records per page').selectOption('25');await page.getByText('Live student 21',{exact:true}).waitFor();
 check('Selected row count is applied to the live CMS',await page.locator('tbody tr').count()===21);
 failQueries=true;await page.getByRole('button',{name:'Refresh Page',exact:true}).click();await page.getByRole('button',{name:'Retry query',exact:true}).waitFor({timeout:15000});
 check('Failed live requests expose a retry action',await page.getByRole('alert').filter({hasText:'503'}).isVisible());
 failQueries=false;await page.getByRole('button',{name:'Retry query',exact:true}).click();await page.getByText('Live student 1',{exact:true}).first().waitFor();
 check('Retry recovers without a page reload',await page.locator('tbody tr').count()===21);
 await page.getByRole('button',{name:/Deep Scrape students/}).click();await page.getByText(/synced successfully/).waitFor({timeout:20000});
 await page.getByRole('button',{name:/Scraped Cache/}).click();await page.getByText('Live student 1',{exact:true}).first().waitFor();
 check('Background full refresh publishes the complete cache',await page.getByRole('button',{name:'Scraped Cache (21)',exact:true}).isVisible());
 await page.getByRole('button',{name:'Live CMS Direct',exact:true}).click();await page.getByText('Live student 1',{exact:true}).first().waitFor();
 remoteTotal=61;failScan=true;
 await page.getByRole('button',{name:'Custom Range',exact:true}).click();await page.locator('#date-start').fill('2026-11-06');await page.locator('#date-end').fill('2026-11-06');
 await page.getByRole('button',{name:'Retry query',exact:true}).waitFor({timeout:15000});const firstReads=scanFirstReads;
 failScan=false;await page.getByRole('button',{name:'Retry query',exact:true}).click();await page.getByText('Live student 1',{exact:true}).first().waitFor({timeout:15000});
 check('A filtered scan resumes from the failed page',scanFirstReads===firstReads);
 check('Date filtering retains the complete result across all pages',(await page.locator('main').last().innerText()).includes('of 61 results'));
 await page.screenshot({path:path.join(shots,'completed.png'),fullPage:true});
}catch(error){console.error(error);check('CMS background browser flow completed',false);await page.screenshot({path:path.join(shots,'failure.png'),fullPage:true}).catch(()=>{});}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
process.exitCode=fails?1:0;
