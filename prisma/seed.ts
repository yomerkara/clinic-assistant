import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ALLOW_DESTRUCTIVE_SEED !== "true"
  ) {
    throw new Error(
      "Seed deletes data. It requires ALLOW_DESTRUCTIVE_SEED=true in a non-production environment.",
    );
  }
  const passwords = {
    admin: hashPassword("SantaAdmin26!"),
    intern: hashPassword("SantaStaj26!"),
    hazal: hashPassword("SantaHazal26!"),
    merve: hashPassword("SantaMerve26!"),
  };

  await prisma.auditEvent.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.intentDecision.deleteMany();
  await prisma.message.deleteMany();
  await prisma.actionRequest.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.session.deleteMany();
  await prisma.calendarConnection.deleteMany();
  await prisma.therapistWorkingBlock.deleteMany();
  await prisma.therapistProfile.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.knowledgeDocument.deleteMany();
  await prisma.clinicSettings.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: {
      id: "user_admin",
      role: "ADMIN",
      name: "Klinik Yönetici",
      email: "admin@santa.local",
      passwordHash: passwords.admin,
    },
  });
  await prisma.clinicSettings.create({
    data: { id: "default", monthlyUsageLimitUsd: 50 },
  });
  await prisma.user.create({
    data: {
      id: "user_intern",
      role: "INTERN",
      name: "Klinik Stajyeri",
      email: "stajyer@santa.local",
      passwordHash: passwords.intern,
    },
  });
  const selinUser = await prisma.user.create({
    data: {
      id: "user_selin",
      role: "THERAPIST",
      name: "Hazal Gül Akkuş",
      email: "hazal@santa.local",
      passwordHash: passwords.hazal,
    },
  });
  const barisUser = await prisma.user.create({
    data: {
      id: "user_baris",
      role: "THERAPIST",
      name: "Merve Nur Akıl",
      email: "merve@santa.local",
      passwordHash: passwords.merve,
    },
  });

  const selin = await prisma.therapistProfile.create({
    data: {
      id: "therapist_selin",
      userId: selinUser.id,
      displayName: "Psikolog & Aile Danışmanı Hazal Gül Akkuş",
      specialties: [
        "Bilişsel Davranış Terapisi",
        "Aile Danışmanlığı",
        "Deneyimsel Oyun Terapisi",
        "EMDR",
      ],
      calendarId: "cal_hazal",
    },
  });
  const baris = await prisma.therapistProfile.create({
    data: {
      id: "therapist_baris",
      userId: barisUser.id,
      displayName: "Klinik Psikolog Merve Nur Akıl",
      specialties: [
        "Bilişsel Davranışçı Terapi",
        "Deneyimsel Oyun Terapisi",
        "EMDR",
        "Çocuk ve Ergen",
      ],
      calendarId: "cal_merve",
    },
  });
  for (const therapistId of [selin.id, baris.id]) {
    for (const weekday of [1, 2, 3, 4, 5]) {
      await prisma.therapistWorkingBlock.create({
        data: { therapistId, weekday, startMinute: 10 * 60, endMinute: 18 * 60 },
      });
    }
  }

  const mert = await prisma.patient.create({
    data: { id: "patient_mert", phone: "+905551110001", displayName: "Mert Aydın" },
  });
  const ayse = await prisma.patient.create({
    data: { id: "patient_ayse", phone: "+905551110017", displayName: "Ayşe Yıldırım" },
  });
  const deniz = await prisma.patient.create({
    data: { id: "patient_deniz", phone: "+905551110017", displayName: "Deniz Yıldırım" },
  });
  const mehmet = await prisma.patient.create({
    data: { id: "patient_mehmet", phone: "+905551110002", displayName: "Mehmet Şahin" },
  });
  const elifDogan = await prisma.patient.create({
    data: { id: "patient_elif", phone: "+905551110003", displayName: "Elif Doğan" },
  });

  const now = new Date();
  const inThreeHours = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const inFiveDays = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const inTenDays = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
  const inTwoHoursEnd = new Date(inThreeHours.getTime() + 50 * 60 * 1000);

  const newBookingAppt = await prisma.appointment.create({
    data: {
      id: "appt_mert_new",
      patientId: mert.id,
      therapistId: selin.id,
      startAt: inSevenDays,
      endAt: new Date(inSevenDays.getTime() + 50 * 60 * 1000),
      status: "SCHEDULED",
      source: "whatsapp",
    },
  });
  const ayseCurrent = await prisma.appointment.create({
    data: {
      id: "appt_ayse_current",
      patientId: ayse.id,
      therapistId: selin.id,
      startAt: inFiveDays,
      endAt: new Date(inFiveDays.getTime() + 50 * 60 * 1000),
      status: "SCHEDULED",
      source: "manual",
      calendarEventId: "gcal_ayse_1",
    },
  });
  await prisma.appointment.create({
    data: {
      id: "appt_deniz",
      patientId: deniz.id,
      therapistId: baris.id,
      startAt: inTenDays,
      endAt: new Date(inTenDays.getTime() + 50 * 60 * 1000),
      status: "SCHEDULED",
      source: "manual",
    },
  });
  await prisma.appointment.create({
    data: {
      id: "appt_mehmet_today",
      patientId: mehmet.id,
      therapistId: baris.id,
      startAt: inThreeHours,
      endAt: inTwoHoursEnd,
      status: "SCHEDULED",
      source: "whatsapp",
    },
  });
  const elifAppt = await prisma.appointment.create({
    data: {
      id: "appt_elif",
      patientId: elifDogan.id,
      therapistId: baris.id,
      startAt: inSevenDays,
      endAt: new Date(inSevenDays.getTime() + 50 * 60 * 1000),
      status: "SCHEDULED",
      source: "whatsapp",
    },
  });

  const mertConvo = await prisma.conversation.create({
    data: {
      id: "convo_mert",
      patientId: mert.id,
      phone: mert.phone,
      mode: "BOT",
    },
  });
  const ayseConvo = await prisma.conversation.create({
    data: {
      id: "convo_ayse",
      patientId: ayse.id,
      phone: ayse.phone,
      mode: "BOT",
    },
  });
  const elifConvo = await prisma.conversation.create({
    data: {
      id: "convo_elif",
      patientId: elifDogan.id,
      phone: elifDogan.phone,
      mode: "BOT",
      handoffReason: "Düşük güven — mesajın niyeti anlaşılamadı (%54)",
    },
  });

  await prisma.actionRequest.create({
    data: {
      id: "action_new_booking",
      type: "NEW_BOOKING",
      appointmentId: newBookingAppt.id,
      conversationId: mertConvo.id,
      status: "PENDING",
      expiresAt: new Date(now.getTime() + 25 * 60 * 1000),
      proposedChanges: {
        startAt: inSevenDays.toISOString(),
        endAt: new Date(inSevenDays.getTime() + 50 * 60 * 1000).toISOString(),
        operationalSummary: "Mert Aydın için yeni randevu önerisi.",
      },
    },
  });
  await prisma.actionRequest.create({
    data: {
      id: "action_reschedule",
      type: "RESCHEDULE",
      appointmentId: ayseCurrent.id,
      conversationId: ayseConvo.id,
      status: "PENDING",
      expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      proposedChanges: {
        startAt: inTenDays.toISOString(),
        endAt: new Date(inTenDays.getTime() + 50 * 60 * 1000).toISOString(),
        operationalSummary: "Ayşe Yıldırım saat değişikliği.",
      },
    },
  });
  await prisma.actionRequest.create({
    data: {
      id: "action_future_cancel",
      type: "CANCEL",
      appointmentId: elifAppt.id,
      conversationId: elifConvo.id,
      status: "PENDING",
      expiresAt: new Date(now.getTime() + 6 * 60 * 60 * 1000),
      proposedChanges: {
        operationalSummary: "Elif Doğan gelecek tarihli iptal.",
      },
    },
  });

  await prisma.message.createMany({
    data: [
      {
        conversationId: mertConvo.id,
        direction: "INBOUND",
        authorKind: "PATIENT",
        text: "Merhaba, önümüzdeki hafta için yeni bir randevu oluşturmak istiyorum.",
        createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      },
      {
        conversationId: mertConvo.id,
        direction: "OUTBOUND",
        authorKind: "BOT",
        text: "Merhaba Mert. Elbette, sizin için uygun randevu seçeneklerini kontrol ediyorum.",
        createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000 + 25_000),
      },
      {
        conversationId: mertConvo.id,
        direction: "INBOUND",
        authorKind: "PATIENT",
        text: "Mümkünse Hazal Hanım ile görüşmek isterim.",
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      },
      {
        conversationId: elifConvo.id,
        direction: "INBOUND",
        authorKind: "PATIENT",
        text: "Merhaba, çarşamba 10:00'daki randevumu iptal etmek istiyorum.",
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      },
      {
        conversationId: elifConvo.id,
        direction: "OUTBOUND",
        authorKind: "BOT",
        text: "Merhaba Elif. Talebinizi aldım, hemen kontrol ediyorum.",
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000 + 20_000),
      },
      {
        conversationId: elifConvo.id,
        direction: "INBOUND",
        authorKind: "PATIENT",
        text: "Aslında bir de terapist değişikliği mümkün mü diye sormak istiyorum.",
        createdAt: new Date(now.getTime() - 90 * 60 * 1000),
      },
    ],
  });

  await prisma.knowledgeDocument.createMany({
    data: [
      {
        id: "kd_clinic",
        title: "Klinik hakkında",
        content:
          "Santa Psikoloji, yetişkin ve çocuk terapisi sunar. Randevular 50 dakika sürer. Teşhis veya tedavi kararı yalnızca uzman görüşmesinde verilir.",
        source: "https://www.santapsikoloji.com/",
        sourceUrl: "https://www.santapsikoloji.com/",
        approvalStatus: "APPROVED",
        version: 1,
      },
      {
        id: "kd_emdr",
        title: "EMDR hakkında genel bilgi",
        content:
          "EMDR seansları kliniğimizde genellikle 50–60 dakika sürer. Size uygun olup olmadığını uzmanımız birlikte değerlendirir; asistan teşhis koymaz veya tedavi önermez.",
        source: "https://www.santapsikoloji.com/",
        sourceUrl: "https://www.santapsikoloji.com/",
        approvalStatus: "APPROVED",
        version: 3,
      },
      {
        id: "kd_cbt",
        title: "Davranışçı terapi hakkında",
        content:
          "Bilişsel davranışçı terapi, düşünce ve davranış kalıpları üzerine çalışır. Seans süresi ve plan uzmanla birlikte belirlenir.",
        source: "https://www.santapsikoloji.com/",
        sourceUrl: "https://www.santapsikoloji.com/",
        approvalStatus: "APPROVED",
        version: 1,
      },
      {
        id: "kd_therapists",
        title: "Santa Psikoloji psikologları",
        content:
          "Psikolog & Aile Danışmanı Hazal Gül Akkuş — Bilişsel Davranış Terapisi, Aile Danışmanlığı, Deneyimsel Oyun Terapisi, EMDR. Profil: https://www.santapsikoloji.com/team/hazal-gul-akkus/\nKlinik Psikolog Merve Nur Akıl — Bilişsel Davranışçı Terapi, Deneyimsel Oyun Terapisi, EMDR, Çocuk ve Ergen. Profil: https://www.santapsikoloji.com/team/merve-nur-akil/",
        source: "https://www.santapsikoloji.com/psikologlarimiz/",
        sourceUrl: "https://www.santapsikoloji.com/psikologlarimiz/",
        approvalStatus: "APPROVED",
        version: 1,
      },
    ],
  });

  console.log(`Seeded demo clinic data. Login: ${admin.email} / DemoSifre1!`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
