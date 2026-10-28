import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from '../screenshot/node_modules/playwright/index.mjs';
const out='artifacts/santa-demo-20261015',origin='https://localhost';
const db=code=>JSON.parse(execFileSync('docker',['compose','exec','-T','app','node','-e',`const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{${code}})().finally(()=>p.$disconnect());`],{encoding:'utf8'}));
const auth=db(`const {randomBytes,scryptSync}=require('crypto');const u=await p.user.findFirstOrThrow({where:{role:'ADMIN',active:true}});const token=randomBytes(32).toString('hex'),hash=scryptSync(token,'session',32).toString('hex');await p.session.create({data:{userId:u.id,tokenHash:hash,expiresAt:new Date(Date.now()+7200000)}});console.log(JSON.stringify({token,hash}));`);
const results=process.env.DEMO_IDS&&fs.existsSync(out+'/results.json')?JSON.parse(fs.readFileSync(out+'/results.json','utf8')):[];let browser,state,page;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,label,ms=120000){const t=Date.now();while(Date.now()-t<ms){if(f())return;await sleep(300)}throw Error('Zaman aşımı: '+label)}
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
async function captureDb(r){r.records=db(`const cid=${JSON.stringify(r.conversationId)},pid=${JSON.stringify(r.patientId)};console.log(JSON.stringify({appointments:await p.appointment.findMany({where:{patientId:pid},select:{id:true,status:true,startAt:true,endAt:true,sessionMode:true,calendarEventId:true,meetingUrl:true}}),actions:await p.actionRequest.findMany({where:{conversationId:cid},select:{id:true,type:true,status:true}}),services:await p.serviceRequest.findMany({where:{conversationId:cid},select:{id:true,kind:true,status:true}})}));`)}
async function scenario(id,title,run){if(process.env.DEMO_IDS&&!process.env.DEMO_IDS.split(',').includes(id))return;const r={id,title,steps:[],staff:[],issues:[]};results.push(r);console.log('START',id,title);
 try{await page.goto(origin+'/demo?persona=new',{waitUntil:'networkidle'});await until(()=>state?.conversation,'ilk durum');const old=state.conversation.id;
 await page.getByRole('button',{name:'Yeni konuşma',exact:true}).click();await until(()=>state?.conversation?.id!==old&&!state.processing,'yeni konuşma');
 r.conversationId=state.conversation.id;r.patientId=state.patient.id;r.url=origin+'/conversations/'+r.conversationId;
 await run(r);r.screenshot=await snapshot(r,'conversation');await captureDb(r);r.status=r.issues.length?'REVIEW':'PASS';
 }catch(e){r.status='BLOCKED';r.issues.push(e.message);console.log('ERROR',e.message)}save();console.log('DONE',id,r.status)}
try{
 browser=await chromium.launch();const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1050}});
 await context.addCookies([{name:'santa_session',value:auth.token,url:origin,httpOnly:true,secure:true,sameSite:'Lax'},{name:'santa_setup_deferred',value:auth.hash,url:origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
 page=await context.newPage();page.setDefaultTimeout(25000);page.on('response',async r=>{if(r.url().includes('/api/demo?')&&r.status()===200){try{state=await r.json()}catch{}}});
 await scenario('01','Bilgi almak isteyen danışan',async r=>{
 await send(r,'Merhaba, sadece bilgi almak istiyorum, henüz randevu istemiyorum. Hangi terapistleriniz var ve seans ücreti ne kadar?','Merve[\\s\\S]*4.000|4.000[\\s\\S]*Merve','adınızı ve soyadınızı');
 await send(r,'Adresinizi ve çalışma saatlerinizi paylaşır mısınız?','ATM','adınızı ve soyadınızı');
 await send(r,'Teşekkürler, iyi günler.','Rica|rica|günler','onay bekliyor');});
 await scenario('02','Yeni danışan → takvim → onay → fatura',async r=>{
 await send(r,'Yönetici Ömer ile randevu almak istiyorum.','adınızı|soyadınızı');
 await send(r,'Deniz Sunum, bu arada EMDR nedir?','Göz Hareketleri','adınızı ve soyadınızı');
 await send(r,'29','terapi');await send(r,'Daha önce terapi almadım.','online|yüz yüze');await send(r,'Yüz yüze olsun.','gün|saat');
 await send(r,'29 Ekim 2026 Perşembe saat 16 uygun mu?','Uygun saatler');
 await send(r,'1 olsun','onay|Onay');await approve(r,'NEW_BOOKING');
 await send(r,'Randevumun saatini tekrar paylaşır mısınız?','29 Ekim');
 await send(r,'Randevuma 10 dakika gecikeceğim, iptal etmeyin.','not|ilettim|gecik');
 await send(r,'Fatura istiyorum.','fatura|Fatura');
 });
 await scenario('03','Online seans → onay → iptal',async r=>{
 await send(r,'Yönetici Ömer ile randevu almak istiyorum.','adınızı|soyadınızı');await send(r,'Ece Sunum','Yaş');await send(r,'32','terapi');await send(r,'Hayır','online|yüz yüze');await send(r,'Online olsun','gün|saat');
 await send(r,'30 Ekim 2026 Cuma saat 15 uygun mu?','Uygun saatler');await send(r,'1','onay|Onay');await approve(r,'NEW_BOOKING');
 await send(r,'Randevum online mı?','Online|online');
 await send(r,'Randevumu iptal etmek istiyorum.','iptal|İptal');await approve(r,'CANCEL');
 });
 await scenario('04','Mahremiyet sorusu → gerekçeli çalışan devri',async r=>{await send(r,'Mesajlarımı kimler görebiliyor, ne kadar saklıyorsunuz?','ekibimize aktarıyorum');if(state.conversation.mode!=='HUMAN')r.issues.push('HUMAN durumuna geçmedi');});
 await scenario('05','İade isteği → çalışan talebi',async r=>{await send(r,'Ödediğim seans ücretinin iadesini istiyorum.','İade|iade','4.000|Randevu almak ister misiniz');});
 await scenario('06','İki kişi → bireysel / çift seansı ayrımı',async r=>{await send(r,'Eşimle Yönetici Ömer için 15 ile 17 arasında randevu istiyoruz.','çift seansı');await send(r,'İki ayrı bireysel seans istiyoruz.','adını|adınızı|isim');});
await scenario('07','Sunum için sade bilgi akışı',async r=>{await send(r,'Kliniğinizde hangi terapistler çalışıyor?','Merve[\\s\\S]*Hazal|Hazal[\\s\\S]*Merve');await send(r,'Seans ücretiniz ne kadar?','4.000');await send(r,'İlk terapi seansı nasıl geçiyor?','beklenti|tanış|gizlilik');});
}finally{if(browser)await browser.close();db(`const r=await p.session.deleteMany({where:{tokenHash:'${auth.hash}'}});console.log(JSON.stringify({revoked:r.count}));`);save()}
