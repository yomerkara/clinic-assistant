import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from '../screenshot/node_modules/playwright/index.mjs';
const output='artifacts/requests-polish-20261016';
fs.mkdirSync(output,{recursive:true});
const db=code=>JSON.parse(execFileSync('docker',['compose','exec','-T','app','node','-e',`const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{${code}})().finally(()=>p.$disconnect());`],{encoding:'utf8'}));
const auth=db(`const {randomBytes,scryptSync}=require('crypto');const u=await p.user.findFirstOrThrow({where:{role:'ADMIN',active:true}});const token=randomBytes(32).toString('hex');const hash=scryptSync(token,'session',32).toString('hex');await p.session.create({data:{userId:u.id,tokenHash:hash,expiresAt:new Date(Date.now()+3600000)}});const c=await p.conversation.findFirstOrThrow({where:{messages:{some:{direction:'INBOUND'}}},orderBy:{lastMessageAt:'desc'}});const marker=await p.conversationRead.findUnique({where:{userId_conversationId:{userId:u.id,conversationId:c.id}}});const t=await p.serviceRequest.create({data:{conversationId:c.id,kind:'WAITLIST',messageId:'ui-check-'+randomBytes(8).toString('hex'),summary:'UI doğrulaması: geçici görev',status:'OPEN'}});console.log(JSON.stringify({token,hash,userId:u.id,cid:c.id,taskId:t.id,marker}));`);
let browser;
const results=[];
try {
 browser=await chromium.launch();const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 await context.addCookies([{name:'santa_session',value:auth.token,url:'https://localhost',httpOnly:true,secure:true,sameSite:'Lax'},{name:'santa_setup_deferred',value:auth.hash,url:'https://localhost',httpOnly:true,secure:true,sameSite:'Lax'}]);
 const page=await context.newPage();
 for(const [name,path] of [['conversation',`/conversations/${auth.cid}`],['requests','/requests'],['invoices','/invoices']]){
  const r=await page.goto('https://localhost'+path,{waitUntil:'networkidle'});if(!r?.ok()||page.url().includes('/login'))throw Error(`${name} unavailable`);
  if(name==='conversation'){
   await page.getByRole('button',{name:'Son mesaja git'}).click();
   const mark=page.getByRole('button',{name:'Okundu işaretle'});if(await mark.count()){await mark.click();await page.waitForTimeout(1200);await page.reload({waitUntil:'networkidle'});if(await page.getByRole('button',{name:'Okundu işaretle'}).count())throw Error('Read marker not persisted');}
   results.push({check:'read-marker-persists',passed:true});
  }
  if(name==='requests'){
   await page.locator(`#request-${auth.taskId}`).getByText('Sorumlu ata / takibi düzenle',{exact:true}).click();
   const form=page.locator(`#request-${auth.taskId} .task-tracking`);
   await form.locator('[name=progress]').selectOption('WAITING_PATIENT');await form.locator('[name=ownerId]').selectOption(auth.userId);await form.locator('[name=followUpAt]').fill('2026-11-20T15:00');
   await form.getByRole('button',{name:'Atama ve takibi kaydet'}).click();await page.waitForURL(`**/requests#request-${auth.taskId}`);await page.reload({waitUntil:'networkidle'});
   const saved=page.locator(`#request-${auth.taskId} .task-tracking`);
   if(await saved.locator('[name=progress]').inputValue()!=='WAITING_PATIENT'||await saved.locator('[name=ownerId]').inputValue()!==auth.userId||await saved.locator('[name=followUpAt]').inputValue()!=='2026-11-20T15:00')throw Error('Tracking not persisted');
   await page.locator(`#request-${auth.taskId}`).scrollIntoViewIfNeeded();results.push({check:'progress-owner-date-persist',passed:true});
  }
  if(name==='requests'){
    const card=page.locator(`#request-${auth.taskId}`);await card.getByText('Sonuç yaz ve talebi tamamla',{exact:true}).click();await card.locator('textarea[name=resolution]').fill('Arayüz doğrulaması tamamlandı, geçici test kaydı.');await card.getByRole('button',{name:'Sonucu kaydet ve kapat'}).click();await page.waitForURL('**/requests');
    await page.goto('https://localhost/requests?status=RESOLVED',{waitUntil:'networkidle'});
    const completed=page.locator(`#request-${auth.taskId}`);await completed.waitFor();const text=await completed.innerText();if(!text.includes('Yanıtlayan:')||text.includes('Kaydedilmemiş'))throw Error('Responder missing');await completed.scrollIntoViewIfNeeded();results.push({check:'responder-visible-after-resolution',passed:true});
  }
  if(name==='invoices')await page.getByRole('columnheader',{name:'İlgili randevu'}).waitFor();
  await page.screenshot({path:`${output}/${name}.png`,fullPage:false});results.push({page:name,status:r.status(),passed:true});
 }
 await page.setViewportSize({width:390,height:844});await page.goto('https://localhost/requests',{waitUntil:'networkidle'});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)throw Error('Mobile horizontal overflow');await page.screenshot({path:`${output}/mobile.png`,fullPage:true});results.push({check:'mobile-no-horizontal-overflow',passed:true});
 fs.writeFileSync(`${output}/ui-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{
 if(browser)await browser.close();
 db(`await p.serviceRequest.delete({where:{id:'${auth.taskId}'}});await p.auditEvent.deleteMany({where:{entityType:'ServiceRequest',entityId:'${auth.taskId}'}});await p.conversationRead.deleteMany({where:{userId:'${auth.userId}',conversationId:'${auth.cid}'}});${auth.marker?`await p.conversationRead.create({data:{userId:'${auth.userId}',conversationId:'${auth.cid}',readThroughAt:new Date('${auth.marker.readThroughAt}')}});`:''}await p.session.deleteMany({where:{tokenHash:'${auth.hash}'}});console.log('{}');`);
}
