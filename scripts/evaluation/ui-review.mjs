import {chromium} from '../screenshot/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import cases from './ui-review-cases.mjs';
const out='artifacts/ui-review-20261014', origin='https://localhost';
fs.mkdirSync(out,{recursive:true});
const results=fs.existsSync(out+'/results.json')?JSON.parse(fs.readFileSync(out+'/results.json')):[];
const from=Number(process.argv[2]||1),to=Number(process.argv[3]||100);
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true,storageState:'/tmp/santa-ui-100-auth.json',viewport:{width:1440,height:1100}});
const page=await context.newPage(); page.setDefaultTimeout(20000);
let state=null;
page.on('response',async response=>{if(response.url().includes('/api/demo?')&&response.status()===200){try{state=await response.json()}catch{}}});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,timeout=100000){const t=Date.now();while(Date.now()-t<timeout){if(fn())return;await pause(250)}throw Error('Timeout: '+label)}
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function save(){fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));const rows=results.map(r=>`<tr><td>${r.id}</td><td>${esc(r.group)}<br><b>${esc(r.title)}</b></td><td>${r.status}</td><td>${esc(r.issues.join(' · '))}</td><td><a href="${origin}/conversations/${r.conversationId}">Konuşma</a> · <a href="${r.id}.png">Ekran</a><details><summary>Adımlar ve yanıtlar</summary>${r.turns.map(t=>`<p><b>Müşteri:</b> ${esc(t.input)}</p><pre>${esc(t.reply)}</pre>`).join('')}${r.staff.map(x=>`<p><a href="${esc(x.url)}">Çalışan işlemi</a></p><pre>${esc(x.result)}</pre>`).join('')}</details></td></tr>`).join('');fs.writeFileSync(out+'/report.html',`<!doctype html><html lang="tr"><meta charset="utf-8"><title>Santa — Düzeltme UI testi</title><style>body{font:16px system-ui;margin:40px;background:#f4f7f4;color:#243b32}table{border-collapse:collapse;width:100%;background:white}td,th{padding:16px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}pre{white-space:pre-wrap;font:14px system-ui;max-width:650px}a{color:#28694f}summary{cursor:pointer}h1{font-size:28px}</style><h1>Santa: gerçek arayüzden 24 düzeltme senaryosu — 14 Ekim 2026</h1><p>Tamamlanan: ${results.length}/24. Başarılı: ${results.filter(r=>r.status==='PASS').length}. Hata: ${results.filter(r=>r.status==='FAIL').length}. Engel: ${results.filter(r=>r.status==='BLOCKED').length}. İnceleme: ${results.filter(r=>r.status==='REVIEW').length}.</p><p>Mesajlar ve onaylar tarayıcıdaki gerçek UI kontrollerinden gönderildi. API taklidi veya sahte takvim kullanılmadı. PASS yalnızca yazılı kontrol koşullarını karşılar; her olası dil kullanımını garanti etmez. Ses/dosya, gerçek WhatsApp teslimatı, ödeme/e-fatura üretimi bu testin kapsamı dışında.</p><table><thead><tr><th>No</th><th>Senaryo</th><th>Sonuç</th><th>Bulgular</th><th>Kanıt</th></tr></thead><tbody>${rows}</tbody></table></html>`)}
async function send(text,r,checks={},burst=false){const prev=state?.conversation?.messages?.length||0;const post=page.waitForResponse(x=>x.url().endsWith('/api/demo')&&x.request().method()==='POST');await page.getByPlaceholder('Mesajınızı yazın...').fill(text);await page.getByRole('button',{name:'Gönder',exact:true}).click();const response=await post;if(response.status()!==202)throw Error('Mesaj HTTP '+response.status());if(burst)return;await until(()=>state?.conversation?.messages?.length>prev&&!state.processing,'bot yanıtı');await pause(300);const added=state.conversation.messages.slice(prev);const reply=added.filter(x=>x.authorKind==='BOT').map(x=>x.text).join('\n\n');r.turns.push({input:text,reply,mode:state.conversation.mode,latencyMs:Date.now()-r.stepStart});if(checks.has&&!new RegExp(checks.has,'iu').test(reply))r.issues.push(`Yanıt bekleneni içermiyor (${checks.has}): ${text}`);if(checks.not&&new RegExp(checks.not,'iu').test(reply))r.issues.push(`İstenmeyen yanıt (${checks.not}): ${text}`);return reply;}
async function approve(r,type='Yeni randevu'){
 const link=page.locator('a[href^="/queue/"]').filter({hasText:type}).first();
 if(!await link.count()){r.issues.push(type+' onay talebi UI’da oluşmadı');return false}
 const url=await link.getAttribute('href');await link.click();await page.waitForURL('**/queue/**');
 const summary=page.locator('summary').filter({hasText:/Değişikliği onayla|Talebi sonuçlandır/}).first();
 if(!await summary.count()){r.staff.push({url:origin+url,result:'Onay kontrolü yok'});r.issues.push('Onay kontrolü yok');await page.goto(origin+'/demo?persona=new');return false}
 await summary.click();const btn=page.getByRole('button',{name:'Evet, onayla',exact:true});
 if(!await btn.isEnabled()){r.staff.push({url:origin+url,result:'Onay düğmesi devre dışı'});r.issues.push('Onay düğmesi devre dışı');await page.screenshot({path:out+'/'+r.id+'-approval.png',fullPage:true});await page.goto(origin+'/demo?persona=new');return false}
 await btn.click();await page.waitForLoadState('domcontentloaded');await pause(600);
 const body=await page.locator('body').innerText();r.staff.push({url:page.url(),result:body});await page.screenshot({path:out+'/'+r.id+'-approval.png',fullPage:true});const ok=!page.url().includes('error=')&&/onaylandı|Onaylandı|başarıyla|tamamlandı|Onaylı/.test(body);if(!ok)r.issues.push('Onay sonucu doğrulanamadı');
 await page.goto(origin+'/demo?persona=new');await pause(1500);return ok;
}
try{
 await page.goto(origin+'/demo?persona=new');if(page.url().includes('/login'))throw Error('Oturum yok');await until(()=>state?.conversation,'demo ilk durum',15000);
 for(const c of cases.filter(x=>Number(x.id)>=from&&Number(x.id)<=to)){
  if(results.some(r=>r.id===c.id))continue;
  const r={...c,turns:[],staff:[],issues:[],startedAt:new Date().toISOString(),status:'REVIEW'};
  console.log('START',r.id,r.title);
  try{
   if(!page.url().includes('/demo'))await page.goto(origin+'/demo?persona=new');
   const old=state?.conversation?.id;await page.getByRole('button',{name:'Yeni konuşma',exact:true}).click();
   await until(()=>state?.conversation?.id&&state.conversation.id!==old&&!state.processing,'yeni konuşma',20000);
   r.conversationId=state.conversation.id;r.patientId=state.patient.id;
   for(const turn of c.turns){r.stepStart=Date.now();await send(turn.text,r,turn)}
   if(c.burst){const prev=state.conversation.messages.length;for(const msg of c.burst)await send(msg,r,{},true);await until(()=>state.conversation.messages.length>=prev+c.burst.length&&!state.processing,'mesaj birleştirme');r.turns.push({input:c.burst.join(' / '),reply:state.conversation.messages.slice(prev).filter(m=>m.authorKind==='BOT').map(m=>m.text).join('\n\n')});}
   if(c.lifecycle){
    const n=Number(c.id)-71,day=(process.env.UI_RETRY==='1'?22:20)+Math.floor(n/8),hour=9+n%8;
    for(const text of ['Yönetici Ömer ile randevu almak istiyorum',`Deneme ${['Akarsu','Bulut','Ceylan','Deniz','Eren','Fidan','Güneş','Işık','Kaya','Lale','Mavi','Nehir','Ova','Pınar','Sahil'][n]}`,'29','hayır','yüz yüze olsun',`${day} Ekim saat ${hour}:00`]){r.stepStart=Date.now();await send(text,r)}
    if(/Uygun saatler:/.test(r.turns.at(-1).reply)){await send('1',r);r.approved=await approve(r)}else{r.issues.push('Mevcut hasta testinin önkoşulu: randevu sunulamadı');r.blocked=true}
    if(r.approved){for(const text of c.after){await send(text,r)}
     if(c.title==='Mevcut kalsın yenisi') {
       if(!/Uygun saatler:/.test(r.turns.at(-1)?.reply||'')) { r.issues.push('İlk ek randevu ifadesi anlaşılmadı'); await send('İlk randevum kalsın. Bir tane daha randevu almak istiyorum, 30 Ekim saat 10.',r); }
       if(/Uygun saatler:/.test(r.turns.at(-1)?.reply||'')) {
         await send('1',r); r.secondApproved=await approve(r);
         if(r.secondApproved) { await send('İkinci randevumu iptal etmek istiyorum, ilk randevum kalsın',r); await approve(r,'İptal'); }
       } else r.issues.push('İkinci randevu seçenekleri oluşmadı');
     }
     if(c.title==='Saat değişikliği' && /Uygun saatler:/.test(r.turns.at(-1)?.reply||'')) await send('1',r);
     if(/İptal|Saat değişikliği/.test(c.title))await approve(r,c.title.includes('İptal')?'İptal':'Saat');
     const demoURL=origin+'/demo?persona=new';await page.goto(origin+'/calendar');await pause(800);r.calendarPage=(await page.locator('body').innerText()).slice(-14000);await page.screenshot({path:out+'/'+r.id+'-calendar.png',fullPage:true});await page.goto(demoURL);await pause(1200);
    }else r.blocked=true;
   }
   if(c.select&&/Uygun saatler:/.test(r.turns.at(-1)?.reply||''))await send('1 olsun',r);
   if(c.calendar&&/Takvim.*erişem|müsaitliğini.*doğrulayam/i.test(r.turns.at(-1)?.reply||'')){r.issues.push('Takvim servisi erişim engeli');r.blocked=true}
   r.actions=state?.actions;r.patient=state?.patient?{displayName:state.patient.displayName,age:state.patient.age,hasTherapyHistory:state.patient.hasTherapyHistory}:null;
   r.finalState=state?.conversation?{mode:state.conversation.mode,stage:state.conversation.bookingStage,preferredTherapistId:state.conversation.preferredTherapistId}:null;
   await page.screenshot({path:out+'/'+r.id+'.png',fullPage:true});
   r.status=r.blocked?'BLOCKED':r.issues.length?'FAIL':c.turns.some(t=>t.has||t.not)?'PASS':'REVIEW';
  }catch(e){r.status='BLOCKED';r.issues.push(e.message);await page.screenshot({path:out+'/'+r.id+'.png',fullPage:true}).catch(()=>{});}
  delete r.stepStart;r.finishedAt=new Date().toISOString();results.push(r);save();console.log('DONE',r.id,r.status,r.issues.join(' | '));
 }
}finally{await browser.close();save()}
