import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from '../screenshot/node_modules/playwright/index.mjs';
const output='artifacts/patient-delete-20261016';fs.mkdirSync(output,{recursive:true});
const db=code=>JSON.parse(execFileSync('docker',['compose','exec','-T','app','node','-e',`const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{${code}})().finally(()=>p.$disconnect());`],{encoding:'utf8'}));
const auth=db(`const {randomBytes,scryptSync}=require('crypto');const u=await p.user.findFirstOrThrow({where:{role:'ADMIN',active:true}});const token=randomBytes(32).toString('hex');const hash=scryptSync(token,'session',32).toString('hex');const patient=await p.patient.create({data:{displayName:'silme testi',phone:'demo:delete-'+randomBytes(8).toString('hex')}});await p.session.create({data:{userId:u.id,tokenHash:hash,expiresAt:new Date(Date.now()+3600000)}});console.log(JSON.stringify({token,hash,id:patient.id}));`);
let browser;
try {
 browser=await chromium.launch();const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:960}});
 await context.addCookies([{name:'santa_session',value:auth.token,url:'https://localhost',httpOnly:true,secure:true,sameSite:'Lax'},{name:'santa_setup_deferred',value:auth.hash,url:'https://localhost',httpOnly:true,secure:true,sameSite:'Lax'}]);
 const page=await context.newPage();await page.goto(`https://localhost/patients/${auth.id}`,{waitUntil:'networkidle'});
 await page.getByText('Müşteriyi sil',{exact:true}).click();await page.locator('input[name=reviewed]').check();await page.locator('input[name=confirmation]').fill('SİL');await page.getByRole('button',{name:'Müşteriyi kalıcı sil'}).scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/confirmation.png`});
 await page.getByRole('button',{name:'Müşteriyi kalıcı sil'}).click();await page.waitForURL('**/patients?deleted=yes');await page.getByText('Müşteri kaydı silindi.',{exact:true}).waitFor();
 const check=db(`console.log(JSON.stringify({remaining:await p.patient.count({where:{id:'${auth.id}'}}),audit:await p.auditEvent.count({where:{action:'privacy.erased',entityId:require('crypto').createHash('sha256').update('${auth.id}').digest('hex')}})}));`);
 if(check.remaining!==0||check.audit!==1)throw Error('Deletion not persisted or audited');fs.writeFileSync(`${output}/results.json`,JSON.stringify({passed:true,...check},null,2));console.log(JSON.stringify(check));
}finally{if(browser)await browser.close();db(`await p.patient.deleteMany({where:{id:'${auth.id}'}});await p.session.deleteMany({where:{tokenHash:'${auth.hash}'}});console.log('{}');`);}
