import fs from 'node:fs';
const path='artifacts/party-fix-20261016/results.json';
const rows=JSON.parse(fs.readFileSync(path));
for(const r of rows){
 r.contracts=[];
 const check=(rule,passed)=>{r.contracts.push({rule,passed:Boolean(passed)});if(!passed){r.issues.push('Kayıt kontrolü: '+rule);if(r.status!=='BLOCKED')r.status='REVIEW'}};
 const a=r.records?.appointments??[],q=r.records?.actions??[];
 if(/^A[1-4]$/.test(r.id)&&r.status!=='BLOCKED'){
  check('Tek hasta için tek randevu kaydı',a.length===1);
  check('Google takvim etkinlik kimliği mevcut',a[0]?.calendarEventId);
  check('Seans biçimi yüz yüze',a[0]?.sessionMode==='IN_PERSON');
  const dates={A1:'2026-11-11',A2:'2026-11-12',A3:'2026-11-13',A4:'2026-11-15'};
  check('Son istenen gün kayıtta korundu',a[0]?.startAt?.startsWith(dates[r.id]));
  check('Son durum doğru',a[0]?.status===(r.id==='A1'?'CANCELLED':'CONFIRMED'));
  for(const type of (r.id==='A1'?['NEW_BOOKING','RESCHEDULE','CANCEL']:['NEW_BOOKING']))check(type+' yönetici onaylı',q.some(x=>x.type===type&&x.status==='APPROVED'));
 }
 if(r.id.startsWith('C')&&r.status!=='BLOCKED'){
  check('Çift seansı çalışan yönetimine geçti',r.steps.at(-1)?.mode==='HUMAN');
  check('Bireysel randevu açılmadı',a.length===0&&!q.some(x=>x.type==='NEW_BOOKING'));
 }
 if(r.id==='P1'&&r.status!=='BLOCKED'){
  check('İki farklı hasta için iki randevu',a.length===2&&new Set(a.map(x=>x.patientId)).size===2);
  check('İki randevu da onaylı',a.length===2&&a.every(x=>x.status==='CONFIRMED'));
  check('İki ayrı takvim etkinliği',a.length===2&&a.every(x=>x.calendarEventId)&&new Set(a.map(x=>x.calendarEventId)).size===2);
  const sorted=[...a].sort((x,y)=>x.startAt.localeCompare(y.startAt));
  check('Saatler çakışmıyor',sorted.length===2&&sorted[0].endAt<=sorted[1].startAt);
 }
}
fs.writeFileSync(path,JSON.stringify(rows,null,2));
console.log(rows.map(r=>({id:r.id,status:r.status,contracts:r.contracts.length,issues:r.issues})));
