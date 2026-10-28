import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from '../screenshot/node_modules/playwright/index.mjs';
const out='artifacts/party-fix-20261016',origin='https://localhost';
const db=code=>JSON.parse(execFileSync('docker',['compose','exec','-T','app','node','-e',`const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{${code}})().finally(()=>p.$disconnect());`],{encoding:'utf8'}));
const auth=db(`const {randomBytes,scryptSync}=require('crypto');const u=await p.user.findFirstOrThrow({where:{role:'ADMIN',active:true}});const token=randomBytes(32).toString('hex'),hash=scryptSync(token,'session',32).toString('hex');await p.session.create({data:{userId:u.id,tokenHash:hash,expiresAt:new Date(Date.now()+86400000)}});console.log(JSON.stringify({token,hash}));`);
const results=[];let browser,state,page;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,label,ms=120000){let n=0;while(n++<Math.ceil(ms/300)){if(f())return;await sleep(300)}throw Error('Zaman aşımı: '+label)}
function save(){fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2))}
async function snapshot(r,label){const name=`${r.id}-${r.steps.length}-${label}.png`;await page.screenshot({path:out+'/'+name,fullPage:true});return name}
async function send(r,text,has,not){
 const prev=state.conversation.messages.length,t=Date.now();
 const response=page.waitForResponse(x=>x.url().endsWith('/api/demo')&&x.request().method()==='POST');
 await page.getByPlaceholder('Mesajınızı yazın...').fill(text);await page.getByRole('button',{name:'Gönder',exact:true}).click();
 if((await response).status()!==202)throw Error('Mesaj kabul edilmedi');
 await until(()=>state?.conversation?.messages?.length>prev&&!state.processing,'yanıt');
 const reply=state.conversation.messages.slice(prev).filter(x=>x.authorKind==='BOT').map(x=>x.text).join('\n\n');
 const passed=(!has||new RegExp(has,'iu').test(reply))&&(!not||!new RegExp(not,'iu').test(reply));
 r.steps.push({text,reply,passed,expected:has,forbidden:not,mode:state.conversation.mode,seconds:Math.round((Date.now()-t)/1000)});
 if(!passed)r.issues.push('Beklenen yanıt kontrolü geçmedi: '+text);
 save();console.log(r.id, r.steps.length,passed?'PASS':'REVIEW',text,JSON.stringify(reply));return reply;
}
async function approve(r,type){
 const a=state.actions.find(x=>x.type===type);if(!a)throw Error(type+' talebi oluşmadı');
 await page.goto(origin+'/queue/'+a.id,{waitUntil:'networkidle'});
 const summary=page.locator('summary').filter({hasText:/Değişikliği onayla|Talebi sonuçlandır/}).first();await summary.click();
 const btn=page.getByRole('button',{name:'Evet, onayla',exact:true});if(!await btn.isEnabled())throw Error('Onay düğmesi kapalı');
 await btn.click();await page.waitForLoadState('networkidle');
 const record=db(`const a=await p.actionRequest.findUniqueOrThrow({where:{id:${JSON.stringify(a.id)}},select:{id:true,type:true,status:true,appointmentId:true}});console.log(JSON.stringify(a));`);
 r.staff.push({...record,url:origin+'/queue/'+a.id,screenshot:await snapshot(r,'approval')});
 if(record.status!=='APPROVED')throw Error('Onay durumu: '+record.status);
 await page.goto(origin+'/demo?persona=new',{waitUntil:'networkidle'});await until(()=>state.conversation.id===r.conversationId&&!state.processing,'demo dönüş');save();
}
async function captureDb(r){r.records=db(`const cid=${JSON.stringify(r.conversationId)},pid=${JSON.stringify(r.patientId)};console.log(JSON.stringify({appointments:await p.appointment.findMany({where:{patient:{phone:(await p.patient.findUniqueOrThrow({where:{id:pid}})).phone}},select:{id:true,patientId:true,status:true,startAt:true,endAt:true,sessionMode:true,calendarEventId:true,meetingUrl:true}}),actions:await p.actionRequest.findMany({where:{conversationId:cid},select:{id:true,type:true,status:true}}),services:await p.serviceRequest.findMany({where:{conversationId:cid},select:{id:true,kind:true,status:true}})}));`)}
async function scenario(id,title,run){if(process.env.DEMO_IDS&&!process.env.DEMO_IDS.split(',').includes(id))return;const r={id,title,startedAt:new Date().toISOString(),steps:[],staff:[],issues:[]};results.push(r);console.log('START',id,title);
 try{await page.goto(origin+'/demo?persona=new',{waitUntil:'networkidle'});await until(()=>state?.conversation,'ilk durum');const old=state.conversation.id;
 await page.getByRole('button',{name:'Yeni konuşma',exact:true}).click();await until(()=>state?.conversation?.id!==old&&!state.processing,'yeni konuşma');
 r.conversationId=state.conversation.id;r.patientId=state.patient.id;r.url=origin+'/conversations/'+r.conversationId;
 await run(r);r.screenshot=await snapshot(r,'conversation');await captureDb(r);r.status=r.issues.length?'REVIEW':'PASS';
 }catch(e){r.status='BLOCKED';r.issues.push(e.message);r.failureUrl=page.url();r.failureScreenshot=await snapshot(r,'failure').catch(()=>null);if(r.conversationId)await captureDb(r).catch(()=>{});console.log('ERROR',e.message)}r.finishedAt=new Date().toISOString();save();console.log('DONE',id,r.status)}
try{
 browser=await chromium.launch();const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1050}});
 await context.addCookies([{name:'santa_session',value:auth.token,url:origin,httpOnly:true,secure:true,sameSite:'Lax'},{name:'santa_setup_deferred',value:auth.hash,url:origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
 page=await context.newPage();page.setDefaultTimeout(25000);page.on('response',async r=>{if(r.url().includes('/api/demo?')&&r.status()===200){try{state=await r.json()}catch{}}});

 const finish=async(r,name)=>{
  const p=state.patient;
  if(p.displayName!==name||!p.age||p.hasTherapyHistory===null)throw Error('Profil sözleşmesi ihlali: '+JSON.stringify({name:p.displayName,age:p.age,history:p.hasTherapyHistory}));
  if(!/Uygun saatler/.test(r.steps.at(-1).reply))throw Error('Bilgiler tamam olmasına rağmen saat seçimine ulaşılamadı');
  await send(r,'1 olsun','onay|Onay');
  const before=db(`console.log(JSON.stringify(await p.appointment.count({where:{patientId:${JSON.stringify(r.patientId)}}})));`);
  if(before!==0)throw Error('Çalışan onayından önce randevu oluştu');
  await approve(r,'NEW_BOOKING');
 };
 await scenario('A1','Yeni hasta: adım adım → mevcut hasta → değişiklik → iptal',async r=>{
  for(const text of ['Yönetici Ömer ile randevu almak istiyorum','Bahar Akarsu','31','Hayır','Yüz yüze','10 Kasım 2026 saat 16'])await send(r,text);
  await finish(r,'bahar akarsu');
  await send(r,'Randevuma geleceğim.','teyit|katılım|katıl|bekli|ilettim','Uygun saatler');
  await send(r,'Randevumu 11 Kasım 2026 saat 17 olarak değiştirmek istiyorum.','Uygun saatler');
  if(/Uygun saatler/.test(r.steps.at(-1).reply)){await send(r,'1','onay|Onay');await approve(r,'RESCHEDULE');}
  await send(r,'Randevumu iptal etmek istiyorum.','iptal|İptal');await approve(r,'CANCEL');
 });
 await scenario('A2','Yeni hasta: tüm bilgiler ilk mesajda',async r=>{
  await send(r,'Ben Cem Akarsu, 34 yaşındayım, daha önce terapi almadım. Yönetici Ömer ile yüz yüze randevu almak istiyorum. 12 Kasım 2026 saat 15 uygun mu?','Uygun saatler','adınızı ve soyadınızı|Yaşınızı|Hangi terapist');
  await finish(r,'cem akarsu');
 });
 await scenario('A3','Yeni hasta: bilgi soruları araya giriyor',async r=>{
  await send(r,'Yönetici Ömer ile randevu alacağım, EMDR nedir?','Göz Hareketleri');
  await send(r,'Derya Akarsu, 28 yaşındayım.','terapi','adınızı ve soyadınızı');
  await send(r,'Hayır daha önce terapi almadım, seans ücretiniz ne kadar?','4.000');
  await send(r,'Yüz yüze olsun.','gün|saat');await send(r,'13 Kasım 2026 saat 14','Uygun saatler');
  await finish(r,'derya akarsu');
 });
 await scenario('A4','Yeni hasta: isim ve tarih düzeltme',async r=>{
  await send(r,'Yönetici Ömer ile randevu almak istiyorum');await send(r,'Eren Akarsu');
  await send(r,'Adımı yanlış yazdım, Eren değil Efe Akarsu.');await send(r,'35');await send(r,'Daha önce terapi almadım');await send(r,'Yüz yüze');
  await send(r,'14 Kasım 2026 saat 14','Uygun saatler');await send(r,'Pardon, 15 Kasım 2026 saat 16 olsun.','15 Kasım');
  await finish(r,'efe akarsu');
 });
 for(const [id,first,second] of [
  ['C1','Eşimle Yönetici Ömer için randevu almak istiyoruz.','Birlikte çift terapisine katılacağız.'],
  ['C2','İkimiz seansa gelmek istiyoruz.','İki ayrı seans değil, tek bir çift seansı istiyoruz.']
 ])await scenario(id,'Çift seansı: netleştirme → uygun uzman için çalışan',async r=>{
  await send(r,first,'çift seansı');await send(r,second,'ekibimize|ekibe');
  if(state.conversation.mode!=='HUMAN')r.issues.push('Çift seansı talebi HUMAN durumuna geçmedi');
  if(state.actions.some(a=>a.type==='NEW_BOOKING'))r.issues.push('Uygun uzman doğrulanmadan bireysel randevu talebi oluştu');
 });
 await scenario('P1','Aynı numara iki bireysel hasta → iki ayrı randevu',async r=>{
  for(const text of ['Eşimle Yönetici Ömer ile 17 Kasım 2026 saat 15 ile 17 arası randevu almak istiyoruz','İki ayrı bireysel seans','Fatma Akarsu ve Ali Akarsu','32','Hayır','Yüz yüze'])await send(r,text);
  if(!/Uygun saatler/.test(r.steps.at(-1).reply))throw Error('Birinci kişi için slot yok');
  await send(r,'1');
  for(const text of ['Evet devam','34','Hayır'])await send(r,text);
  if(!/Uygun saatler/.test(r.steps.at(-1).reply))throw Error('İkinci kişi için slot yok');
  await send(r,'1');
  const actions=[...state.actions.filter(a=>a.type==='NEW_BOOKING')];
  if(actions.length!==2)throw Error('İki ayrı onay talebi oluşmadı');
  await approve(r,'NEW_BOOKING');await approve(r,'NEW_BOOKING');
 });
}finally{if(browser)await browser.close();db(`const r=await p.session.deleteMany({where:{tokenHash:'${auth.hash}'}});console.log(JSON.stringify({revoked:r.count}));`);save()}
