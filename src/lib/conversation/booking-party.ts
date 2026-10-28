import { z } from "zod";
import { bookingPartyKind, partyTherapist } from "./booking-party-intent";
import { prisma } from "@/lib/prisma";
import { normalizePatientName, hasFullPatientName } from "@/lib/patients/identity";
import { formatPatientName } from "@/lib/patients/profile";
import { planSimpleFlow } from "./simple-flow";
import { INTAKE_QUESTIONS } from "./booking-flow";
import { parseSlotPreference } from "@/lib/calendar/availability";

const schema = z.object({
  phase: z.enum(["kind", "names", "booking", "done"]),
  original: z.string(),
  ids: z.array(z.string()).max(2),
  index: z.number().int().min(0).max(1),
});
export function bookingParty(raw: unknown) {
  const p = schema.safeParse(raw);
  return p.success ? p.data : null;
}
export function partyPatientId(raw: unknown) {
  const p = bookingParty(raw);
  return p?.phase === "booking" ? p.ids[p.index] : undefined;
}
export async function prepareBookingParty(
  conversationId: string,
  phone: string,
  text: string,
  raw: unknown,
  now: Date,
  demoTherapistId?: string,
) {
  let party = bookingParty(raw);
  let switched = false;
  const fold = normalizePatientName(text);
  const started =
    (!party || party.phase === "done") &&
    /esimle|ikimiz|iki kisi|2 kisi/.test(fold) &&
    /gelmek|gelice|geliyor|randevu|seans/.test(fold);
  const save = async () =>
    prisma.conversation.update({
      where: { id: conversationId },
      data: { bookingParty: party! },
    });
  if (started) {
    party = { phase: "kind", original: text, ids: [], index: 0 };
    await save();
    return {
      reply:
        "İkiniz için iki ayrı bireysel seans mı, yoksa birlikte katılacağınız bir çift seansı mı istiyorsunuz?",
    };
  }
  if (!party || party.phase === "done") return null;
  if (party.phase === "kind") {
    const kind = bookingPartyKind(text);
    if (kind === "COUPLE") {
      party.phase = "done";
      await save();
      return {
        reply:
          "Çift seansı talebinizi ekibimize iletiyorum. Uygun uzman ve seans süresini birlikte netleştirecekler.",
        handoff: true,
      };
    }
    if (kind !== "INDIVIDUAL")
      return { reply: "İki ayrı bireysel seans mı, tek bir çift seansı mı olsun?" };
    party.phase = "names";
    await save();
    return {
      reply:
        "Sırayla ilerleyelim. Önce gelecek kişinin, ardından ikinci kişinin adını ve soyadını “Fatma Kara ve Ali Kara” şeklinde yazar mısınız? Her kişi için ayrı saat seçeceğiz.",
    };
  }
  if (party.phase === "names") {
    const names = text
      .trim()
      .split(/\s+ve\s+|\s*[,;]\s*/iu)
      .map((n) => n.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " "));
    if (
      names.length !== 2 ||
      normalizePatientName(names[0]) === normalizePatientName(names[1]) ||
      names.some(
        (n) =>
          !hasFullPatientName(n) ||
          !/^[\p{L}\s’'\-]+$/u.test(n) ||
          n.split(" ").length > 4 ||
          /randevu|istiyorum|saat|hayir|evet/.test(n),
      )
    )
      return {
        reply:
          "İki kişinin adını ve soyadını sırayla paylaşır mısınız? Örneğin: Fatma Kara ve Ali Kara.",
      };
    for (const name of names) {
      const candidates = await prisma.patient.findMany({ where: { phone } });
      const matches = candidates.filter(
        (p) => normalizePatientName(p.displayName) === normalizePatientName(name),
      );
      if (matches.length > 1)
        return {
          reply:
            "Aynı isimde birden fazla kayıt var. Doğru kişileri seçmek için ekibimize iletiyorum.",
          handoff: true,
        };
      const patient =
        matches[0] ??
        (await prisma.patient.create({ data: { phone, displayName: name } }));
      party.ids.push(patient.id);
    }
    party.phase = "booking";
    party.index = 0;
    await save();
    switched = true;
    const roster = await prisma.therapistProfile.findMany({
      where: {
        active: true,
        user: { active: true },
        OR: [
          { user: { role: "THERAPIST" } },
          ...(demoTherapistId ? [{ id: demoTherapistId }] : []),
        ],
      },
    });
    const initial = planSimpleFlow({
      text: party.original,
      now,
      stage: "INTAKE",
      lastReply: "",
      fixture: { patients: [], appointments: [] },
      roster,
      knowledge: [],
    }).result.turn.entities;
    // The ordinary intake parser intentionally suppresses identity fields when
    // another person is mentioned. Resolve the party's original preference separately.
    const therapist = partyTherapist(party.original, roster);
    if (therapist)
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { preferredTherapistId: therapist.id },
      });
    for (const id of party.ids)
      await prisma.patient.update({
        where: { id },
        data: {
          availabilityNotes: parseSlotPreference(party.original, {}, now).date
            ? (initial.availabilityNotes ?? party.original)
            : null,
          version: { increment: 1 },
        },
      });
  }
  if (party.phase === "booking") {
    let id = party.ids[party.index];
    const queued = await prisma.actionRequest.findFirst({
      where: {
        conversationId,
        type: "NEW_BOOKING",
        status: { in: ["PENDING", "APPROVED"] },
        proposedChanges: { path: ["patientId"], equals: id },
      },
    });
    if (
      queued &&
      party.index === 0 &&
      /^(?:evet|tamam|olur|devam|ikinci|siradaki)(?:\s+(?:devam|edelim|gecelim|olur|kisi))*$/.test(
        fold,
      )
    ) {
      party.index = 1;
      await save();
      id = party.ids[1];
      switched = true;
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          offeredSlots: [],
          offeredAt: null,
          offeredTherapistId: null,
          bookingStage: "INTAKE",
        },
      });
    }
    const patient = await prisma.patient.findFirstOrThrow({ where: { id, phone } });
    if (switched)
      return {
        patient,
        party,
        reply: `${formatPatientName(patient.displayName)} için ilerleyelim. ${patient.age == null ? INTAKE_QUESTIONS.age : patient.hasTherapyHistory == null ? INTAKE_QUESTIONS.therapyHistory : "Bilgileriniz tamam. Uygun saatleri kontrol etmek için devam yazabilirsiniz."}`,
      };
    return { patient, party };
  }
  return null;
}

export async function partyNextPrompt(raw: unknown) {
  const p = bookingParty(raw);
  if (!p || p.phase !== "booking") return "";
  if (p.index === 1)
    return " İki kişinin talepleri ayrı ayrı kaydedildi; ekip onayından sonra kesinleşecek.";
  const next = await prisma.patient.findUniqueOrThrow({ where: { id: p.ids[1] } });
  return ` Şimdi ${formatPatientName(next.displayName)} için devam edelim mi?`;
}

export async function partyReservedSlots(conversationId: string, patientId: string) {
  const actions = await prisma.actionRequest.findMany({
    where: { conversationId, type: "NEW_BOOKING", status: "PENDING" },
    select: { proposedChanges: true },
  });
  return actions.flatMap((a) => {
    const c = a.proposedChanges as {
      patientId?: string;
      startAt?: string;
      endAt?: string;
      therapistId?: string;
    };
    if (c.patientId === patientId || !c.startAt || !c.endAt) return [];
    const startAt = new Date(c.startAt),
      endAt = new Date(c.endAt);
    return Number.isFinite(startAt.getTime()) && Number.isFinite(endAt.getTime())
      ? [{ startAt, endAt, therapistId: c.therapistId }]
      : [];
  });
}
