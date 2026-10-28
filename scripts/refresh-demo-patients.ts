import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const ids = ["patient_mert", "patient_ayse", "patient_deniz", "patient_mehmet", "patient_elif"];
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Local database only");
  const patients = await db.patient.findMany({ include: { conversations: true } });
  const extra = patients.filter(p => !ids.includes(p.id));
  if (extra.some(p => !(
    (/^\+90555\d{14}$/.test(p.phone) && ["Mert", "Ayse", "Deniz", "Mehmet"].includes(p.displayName)) ||
    (p.conversations.length > 0 && p.conversations.every(c => c.source === "demo"))
  ))) throw new Error("Unexpected non-demo patient; review before cleanup");
  const badTherapists = await db.therapistProfile.findMany({ where: { user: { email: { endsWith: "@t.local" } } } });
  const therapistIds = badTherapists.map(t => t.id);
  const appointmentIds = (await db.appointment.findMany({ where: { patientId: { in: patients.map(p=>p.id) } }, select: { id: true } })).map(a=>a.id);
  const conversationIds = patients.flatMap(p=>p.conversations.map(c=>c.id));
  const day = new Date(); day.setUTCDate(day.getUTCDate()+1); day.setUTCHours(0,0,0,0);
  while ([0,6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate()+1);
  const at = (hour:number, offset=0) => { const d=new Date(day); d.setUTCDate(d.getUTCDate()+offset); d.setUTCHours(hour-3,0,0,0); return d; };
  const label = (d:Date) => new Intl.DateTimeFormat("tr-TR",{timeZone:"Europe/Istanbul",day:"numeric",month:"long",weekday:"long",hour:"2-digit",minute:"2-digit"}).format(d);
  const fixtures = [
    { id:ids[0], name:"Mert Aydın", phone:"+905551110001", therapist:"therapist_selin", age:34, history:true, hour:11, appointment:"appt_mert_new", text:"Hazal Hanım ile randevuma geleceğim, teşekkür ederim.", reply:"Teşekkürler Mert Bey. Randevu teyidinizi kaydettim." },
    { id:ids[1], name:"Ayşe Yıldırım", phone:"+905551110017", therapist:"therapist_selin", age:32, history:true, hour:14, appointment:"appt_ayse_current", text:"Hazal Hanım ile randevumu ertesi gün aynı saate alabilir miyiz?", reply:"Saat değişikliği tercihinizi ekibe ilettim. Takvim kontrolü ve ekip onayından sonra yeni saatiniz kesinleşecek." },
    { id:ids[2], name:"Deniz Yıldırım", phone:"+905551110017", therapist:"therapist_baris", age:16, history:true, hour:15, appointment:"appt_deniz", text:"Deniz Yıldırım için yazıyorum. Merve Hanım ile randevusuna geleceğiz.", reply:"Teşekkürler. Deniz’in randevu teyidini kaydettim." },
    { id:ids[3], name:"Mehmet Şahin", phone:"+905551110002", therapist:"therapist_baris", age:41, history:true, hour:16, appointment:"appt_mehmet_today", text:"Merve Hanım ile randevumun saatini tekrar paylaşabilir misiniz?", reply:"Randevu saatinizi aşağıda paylaşıyorum. Değişiklik ihtiyacınız olursa bize yazabilirsiniz." },
    { id:ids[4], name:"Elif Doğan", phone:"+905551110003", therapist:"therapist_selin", age:28, history:false, hour:17, appointment:null, text:"Merhaba, ben Elif Doğan. 28 yaşındayım, daha önce terapi almadım. Hafta içi 17.00 sonrası Hazal Hanım ile ilk görüşme için randevu almak istiyorum.", reply:"Teşekkürler Elif Hanım. Gün ve saat tercihinizi ekibe ilettim. Takvim müsaitliği kontrol edildikten sonra size dönüş yapılacak." },
  ];
  await db.$transaction(async tx => {
    await tx.actionRequest.deleteMany({where:{OR:[{appointmentId:{in:appointmentIds}},{conversationId:{in:conversationIds}}]}});
    await tx.appointment.deleteMany({where:{id:{in:appointmentIds}}});
    await tx.conversation.deleteMany({where:{id:{in:conversationIds}}});
    await tx.patient.deleteMany({where:{id:{in:extra.map(p=>p.id)}}});
    await tx.therapistProfile.deleteMany({where:{id:{in:therapistIds}}});
    await tx.user.updateMany({where:{email:{endsWith:"@t.local"}},data:{active:false}});
    for (const f of fixtures) {
      await tx.patient.upsert({where:{id:f.id},create:{id:f.id,displayName:f.name,phone:f.phone},update:{displayName:f.name,phone:f.phone}});
      await tx.patient.update({where:{id:f.id},data:{age:f.age,hasTherapyHistory:f.history,availabilityNotes:f.id==="patient_elif"?"Örnek kayıt · Hafta içi 17.00 sonrası":"Örnek kayıt · Hafta içi, mevcut randevu saati tercih ediliyor.",alternativeDaysOkay:f.id==="patient_ayse",consentStatus:"UNKNOWN"}});
      const start=at(f.hour), end=new Date(start.getTime()+50*60000);
      if(f.appointment) await tx.appointment.create({data:{id:f.appointment,patientId:f.id,therapistId:f.therapist,startAt:start,endAt:end,status:"CONFIRMED",source:"demo"}});
      const c=await tx.conversation.create({data:{id:`demo_${f.id}`,patientId:f.id,phone:f.phone,source:"demo",mode:"BOT",memorySummary:"Örnek müşteri senaryosu; gerçek görüşme veya sağlık kaydı değildir."}});
      await tx.message.create({data:{conversationId:c.id,direction:"INBOUND",authorKind:"PATIENT",text:f.text,createdAt:new Date(Date.now()-120000)}});
      await tx.message.create({data:{conversationId:c.id,direction:"OUTBOUND",authorKind:"BOT",text:f.reply+(f.appointment?` Mevcut randevunuz: ${label(start)}.`:""),createdAt:new Date(Date.now()-60000)}});
      if(f.id==="patient_ayse" || f.id==="patient_elif") {
        const proposed=at(f.hour,1);
        await tx.actionRequest.create({data:{id:`demo_request_${f.id}`,conversationId:c.id,appointmentId:f.appointment,type:f.appointment?"RESCHEDULE":"NEW_BOOKING",status:"PENDING",proposedChanges:{patientId:f.id,therapistId:f.therapist,...(f.appointment?{startAt:proposed.toISOString(),endAt:new Date(proposed.getTime()+50*60000).toISOString(),appointmentVersion:0}:{}),operationalSummary:f.appointment?"Örnek talep: danışan randevusunu ertesi gün aynı saate almak istiyor. Takvim kontrolü bekleniyor.":"Örnek talep: ilk görüşme, hafta içi 17.00 sonrası tercih ediliyor. Henüz saat önerilmedi; Google müsaitliği kontrol edilmeli."}}});
      }
    }
  });
  console.log(`Prepared ${fixtures.length} example customers; removed ${extra.length} duplicate/demo records and ${therapistIds.length} test therapist profiles.`);
}
main().finally(()=>db.$disconnect()).catch(e=>{console.error(e.message);process.exitCode=1;});
