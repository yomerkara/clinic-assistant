import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from '../screenshot/node_modules/playwright/index.mjs';
const output='artifacts/operations-batch-20261015';
fs.mkdirSync(output,{recursive:true});
const db=code=>JSON.parse(execFileSync('docker',['compose','exec','-T','app','node','-e',`const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{${code}})().finally(()=>p.$disconnect());`],{encoding:'utf8'}));
const auth=db(`const {randomBytes,scryptSync}=require('crypto');const u=await p.user.findFirstOrThrow({where:{role:'ADMIN',active:true}});const token=randomBytes(32).toString('hex');const hash=scryptSync(token,'session',32).toString('hex');await p.session.create({data:{userId:u.id,tokenHash:hash,expiresAt:new Date(Date.now()+3600000)}});const edited=await p.auditEvent.findFirst({where:{action:'action.edited'},orderBy:{createdAt:'desc'}});console.log(JSON.stringify({token,hash,edited:edited?.entityId}));`);
let browser;
try {
 browser=await chromium.launch();
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 await context.addCookies([{name:'santa_session',value:auth.token,url:'https://localhost',httpOnly:true,secure:true,sameSite:'Lax'},{name:'santa_setup_deferred',value:auth.hash,url:'https://localhost',httpOnly:true,secure:true,sameSite:'Lax'}]);
 const page=await context.newPage(); const results=[];
 for(const [name,path] of [['queue','/queue'],['requests','/requests'],['invoices','/invoices'],...(auth.edited?[['edited',`/queue/${auth.edited}`]]:[])]){
   const response=await page.goto('https://localhost'+path,{waitUntil:'networkidle'});
   if(!response?.ok()||page.url().includes('/login')||page.url().includes('/onboarding'))throw new Error(`${name}: inaccessible`);
   if(name==='edited'&&await page.getByText('İşlemin güncel özeti',{exact:true}).count()!==1)throw new Error('Missing current summary');
   if(name==='invoices'&&await page.getByRole('columnheader',{name:'Talep tarihi',exact:true}).count()!==1)throw new Error('Missing date column');
   if(name==='requests'){
     const form=page.locator('form').filter({has:page.locator('input[name="from"][value]')}).first();
     if(await form.count()){
       const from=await form.locator('input[name="from"]').inputValue();
       if(from){await form.locator('..').evaluate(el=>el.open=true); results.push({check:'saved-waitlist-visible',from,therapist:await form.locator('select[name="therapistId"]').inputValue()});}
     }
   }
   await page.screenshot({path:`${output}/${name}.png`,fullPage:true});
   results.push({page:name,status:response.status(),passed:true});
 }
 fs.writeFileSync(`${output}/ui-results.json`,JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));
}finally{
 if(browser)await browser.close();
 db(`const r=await p.session.deleteMany({where:{tokenHash:'${auth.hash}'}});console.log(JSON.stringify({revoked:r.count}));`);
}
