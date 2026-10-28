import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const path='artifacts/santa-demo-20261015/results.json',rows=JSON.parse(fs.readFileSync(path));
const db=code=>JSON.parse(execFileSync('docker',['compose','exec','-T','app','node','-e',`const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{${code}})().finally(()=>p.$disconnect());`],{encoding:'utf8'}));
for(const r of rows){
 if(!r.conversationId)continue;
 r.verification=db(`const pid=${JSON.stringify(r.patientId)},cid=${JSON.stringify(r.conversationId)};const c=await p.conversation.findUnique({where:{id:cid},select:{mode:true,handoffReason:true}});const appointments=await p.appointment.findMany({where:{patientId:pid},select:{id:true,status:true,startAt:true,endAt:true,sessionMode:true,calendarEventId:true,meetingUrl:true,notes:{select:{text:true,calendarSyncedAt:true}}}});const actions=await p.actionRequest.findMany({where:{conversationId:cid},select:{id:true,type:true,status:true}});const services=await p.serviceRequest.findMany({where:{conversationId:cid},select:{kind:true,status:true}});console.log(JSON.stringify({conversation:c,appointments,actions,services}));`);
 const v=r.verification;r.checks=[];
 const check=(label,passed)=>{r.checks.push({label,passed});if(!passed){r.issues.push(label+' doğrulanamadı');r.status='REVIEW'}};
 if(r.id==='02'){
  check('Randevu CONFIRMED ve Google etkinlik kimliği kayıtlı',v.appointments.some(a=>a.status==='CONFIRMED'&&a.calendarEventId));
  check('Fatura ayrı bekleyen talep',v.actions.some(a=>a.type==='INVOICE_REQUEST'&&a.status==='PENDING'));
  r.observations=['Gecikme mesajı hedef randevu netleştirmesi istedi. Bu konuşmada gecikme notunun kaydı/takvim senkronizasyonu tamamlanmadı.'];
 }
 if(r.id==='03'){
  check('Online randevu iptal edilmiş',v.appointments.some(a=>a.status==='CANCELLED'&&a.sessionMode==='ONLINE'));
  check('Meet bağlantısı oluşturulmuş',v.appointments.some(a=>a.meetingUrl));
  check('İptal yönetici onaylı',v.actions.some(a=>a.type==='CANCEL'&&a.status==='APPROVED'));
 }
 if(r.id==='04')check('Çalışan devri ve gerekçe kayıtlı',v.conversation.mode==='HUMAN'&&Boolean(v.conversation.handoffReason));
 if(r.id==='05')check('İade çalışan talebi ayrı kayıtlı',v.services.some(s=>s.kind==='REFUND'));
 if(r.id==='06')r.observations=['Yalnızca iki ayrı bireysel seans / çift seansı ayrımı ve sonraki bilgi sorusu test edildi. Henüz iki randevu oluşturulmadı.'];
}
fs.writeFileSync(path,JSON.stringify(rows,null,2));console.log(rows.map(r=>({id:r.id,status:r.status,checks:r.checks,issues:r.issues})));
