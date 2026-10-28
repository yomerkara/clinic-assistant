import { operationalSupport } from "@/lib/conversation/operational-support";
import {
  ASSISTANT_OFF_REPLY,
  assistantOffHandoffReason,
} from "@/lib/settings/control";
import { loadClinicControls } from "@/lib/settings/service";
import { serviceFailureReply } from "@/lib/conversation/service-failure";
import {
  CALENDAR_FAILURE_REPLY,
  calendarFailureHandoffReason,
  decideSlotOffer,
} from "@/lib/conversation/slot-offer";
import {
  actsOnExistingAppointment,
  cancelsAppointmentNote,
  changesAppointment,
  reportsMissedAppointment,
  requestedSessionMode,
  requestsNewBooking,
  selectsExistingAppointment,
  wantsDifferentTime,
} from "@/lib/conversation/message-signals";
import { securityHandoff } from "@/lib/conversation/security-boundary";
import {
  requestedServices,
  serviceReceipt,
  type ServiceKind,
} from "@/lib/conversation/service-requests";
import { withinClinicHours, effectiveWorkingHours } from "@/lib/calendar/clinic-hours";
import { informationSidecars } from "@/lib/conversation/information-sidecars";
import { remindWaitingConversations } from "@/lib/conversation/staff-followup";
import {
  BOOKING_INVITATION,
  SIMPLE_FLOW_VERSION,
  simpleFlowEnabled,
  planSimpleFlow,
  renderSimpleFlow,
  correctedBatch,
  type SimplePlan,
} from "@/lib/conversation/simple-flow";
import { modelFailure } from "@/lib/llm/failure";
import {
  asksAppointmentLookup,
  historicalLookup,
  LOOKUP_PERSON_QUESTION,
  appointmentLookupLabel,
  explicitLookupDate,
  rescheduleParts,
  additionalBookingText,
} from "@/lib/conversation/appointment-lookup";
import {
  asksExistingAvailability,
  namedAvailabilityTherapists,
  availabilityWindow,
} from "@/lib/conversation/existing-availability";
import { observeReply } from "@/lib/conversation/shadow-review";
import { observeUnderstanding } from "@/lib/conversation/understanding-shadow";
import {
  buildClinicClarification,
  isBroadClinicQuestion,
} from "@/lib/conversation/clinic-clarification";
import { SupersededInboundError } from "@/lib/conversation/inbound-buffer";
import { bookingFlow } from "@/lib/conversation/booking-flow";
import { handoffCategory } from "@/lib/conversation/handoff";
import { blockUnverifiedDiagnosis, verifyDiagnosis } from "@/lib/llm/verify-diagnosis";
import { missingBookingProfile } from "@/lib/patients/profile";
import {
  normalizeBookingPreference,
  isAvailabilityConstraintReply,
} from "@/lib/patients/booking-preference";
import { demoTherapistKnowledge } from "@/lib/demo/knowledge";
import { ensureDemoCalendarProfile } from "@/lib/demo/calendar-profile";
import { resolveTherapist } from "@/lib/patients/therapist-preference";
import { createTaskLlm } from "@/lib/llm/task-client";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatPatientName } from "@/lib/patients/profile";
import { getEnv } from "@/lib/env";
import { type KnowledgeSnippet } from "@/lib/llm/types";
import {
  mentionsAnotherPerson,
  normalizePatientName,
  hasFullPatientName,
} from "@/lib/patients/identity";
import { decideScope, introducedName, isPureIntroduction } from "@/lib/simulator/scope";
import {
  applyClinicRules,
  buildAbuseDiagnosis,
  buildConversationClosingDiagnosis,
  buildHumanRequestDiagnosis,
  buildLateNoticeDiagnosis,
  buildScopeGuardDiagnosis,
  buildSlotChoiceDiagnosis,
  type SimulationDiagnosis,
  type SimulationFixture,
} from "@/lib/simulator/rules";
import { addressedName } from "@/lib/patients/honorific";
import {
  extractOfferedSlotLabels,
  formatSlotOptions,
  formatSlotLabel,
  istanbulDay,
  parseSlotChoice,
  parseSlotPreference,
  proposePreferredSlots,
  SESSION_MINUTES,
} from "@/lib/calendar/availability";
import { getActionRequestService, getCalendar } from "@/lib/queue/ports";
import { hasCalendarConnection } from "@/lib/calendar/google";
import {
  isCrisisMessage,
  isAbuseMessage,
  isConversationClosing,
  isHumanRequest,
} from "@/lib/conversation/guardrails";
import {
  findCachedFaq,
  isCachedIntent,
  saveCachedFaq,
} from "@/lib/conversation/faq-cache";
import { appointmentNoteText } from "@/lib/conversation/appointment-note";
import { syncAppointmentNote } from "@/lib/calendar/appointment-notes";
import {
  prepareBookingParty,
  partyPatientId,
  partyNextPrompt,
  partyReservedSlots,
  bookingParty,
} from "@/lib/conversation/booking-party";
import { quickRepliesFor, type QuickReply } from "@/lib/conversation/quick-replies";
import { recordModelUsage, UsageBudgetExceededError } from "@/lib/usage/record";
import {
  HISTORY_MESSAGES,
  consecutiveLowUnknownCount,
  finalizeOutbound,
  isFreshTimestamp,
} from "@/lib/conversation/style";

export type InboundResult = {
  diagnosis: SimulationDiagnosis;
  conversationId: string;
  patientId: string;
  actionId: string | null;
  quickReplies: QuickReply[];
};

async function loadKnowledge(): Promise<KnowledgeSnippet[]> {
  const docs = await prisma.knowledgeDocument.findMany({
    where: { approvalStatus: "APPROVED" },
    orderBy: { createdAt: "asc" },
  });
  return docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    content: doc.content,
    source: doc.sourceUrl ?? doc.source,
    version: doc.version,
  }));
}

async function createLlm(answerOnly = false) {
  return createTaskLlm(answerOnly ? "answer" : "legacy");
}

function isPlaceholderName(name: string) {
  return normalizePatientName(name).startsWith("yeni hasta") || !name.trim();
}

function hasFullName(name: string) {
  return hasFullPatientName(name);
}

function intakeSummary(patient: {
  displayName: string;
  age: number | null;
  hasTherapyHistory: boolean | null;
  availabilityNotes: string | null;
  alternativeDaysOkay: boolean | null;
  isExistingPatient: boolean;
}) {
  return [
    patient.isExistingPatient
      ? "Hasta türü: Kayıtlı hasta. Mevcut bilgileri tekrar sorma; eksik alanları tamamla."
      : "Hasta türü: Yeni hasta. Eksik temel bilgileri sırayla tamamla.",
    `Ad soyad: ${hasFullName(patient.displayName) ? patient.displayName : "eksik"}`,
    `Yaş: ${patient.age ?? "eksik"}`,
    `Daha önce terapi deneyimi: ${patient.hasTherapyHistory == null ? "eksik" : patient.hasTherapyHistory ? "var" : "yok"}`,
    `Uygun gün/saatler: ${patient.availabilityNotes ?? "eksik"}`,
    `Başka günler uygun mu: ${patient.alternativeDaysOkay == null ? "henüz sorulmadı" : patient.alternativeDaysOkay ? "evet" : "hayır"}`,
  ].join("\n");
}

async function resolvePatient(input: {
  phone: string;
  patientId?: string;
  text: string;
  displayName?: string;
}) {
  const named = input.displayName ?? introducedName(input.text);
  if (input.patientId) {
    const existing = await prisma.patient.findUnique({ where: { id: input.patientId } });
    if (existing && existing.phone !== input.phone)
      throw new Error("patient_phone_scope_mismatch");
    if (existing && named && isPlaceholderName(existing.displayName)) {
      await prisma.patient.updateMany({
        where: { id: existing.id, version: existing.version },
        data: { displayName: named, version: { increment: 1 } },
      });
      return prisma.patient.findUniqueOrThrow({ where: { id: existing.id } });
    }
    if (existing) return existing;
  }
  const matches = await prisma.patient.findMany({
    where: { phone: input.phone },
    orderBy: { createdAt: "asc" },
  });
  if (matches.length === 1) {
    const existing = matches[0]!;
    if (named && isPlaceholderName(existing.displayName)) {
      await prisma.patient.updateMany({
        where: { id: existing.id, version: existing.version },
        data: { displayName: named, version: { increment: 1 } },
      });
      return prisma.patient.findUniqueOrThrow({ where: { id: existing.id } });
    }
    return existing;
  }
  if (matches.length > 1) {
    const byName = matches.find((patient) =>
      input.text
        .toLocaleLowerCase("tr-TR")
        .includes(patient.displayName.split(" ")[0]!.toLocaleLowerCase("tr-TR")),
    );
    return byName ?? matches[0]!;
  }
  return prisma.patient.create({
    data: { phone: input.phone, displayName: named ?? "Yeni hasta" },
  });
}

export async function handleInbound(input: {
  phone: string;
  text: string;
  patientId?: string;
  displayName?: string;
  source?: "demo" | "whatsapp";
  demoAdminUserId?: string;
  conversationId?: string;
  inboundMessageIds?: string[];
  ensureCurrent?: () => Promise<void>;
}): Promise<InboundResult> {
  let savedServiceKinds: ServiceKind[] = [];
  const persistOutbound = async (...args: Parameters<typeof saveOutbound>) => {
    await input.ensureCurrent?.();
    if (
      args[2].outbound &&
      args[2].intent !== "SENSITIVE_OR_EMERGENCY" &&
      !args[2].botStopped
    ) {
      const extra = informationSidecars(
        input.text,
        args[2].outbound,
        await loadKnowledge(),
      );
      if (extra) args[2].outbound = `${extra}\n\n${args[2].outbound}`;
      if (
        /fatura/iu.test(input.text) &&
        !/istemiyorum|gerek yok|vazgeç/iu.test(input.text)
      ) {
        await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${args[0]} FOR UPDATE`;
          const existing = await tx.actionRequest.findFirst({
            where: {
              conversationId: args[0],
              type: "INVOICE_REQUEST",
              status: "PENDING",
            },
          });
          if (!existing)
            await tx.actionRequest.create({
              data: {
                conversationId: args[0],
                type: "INVOICE_REQUEST",
                requestedBy: "patient",
                proposedChanges: { operationalSummary: input.text.slice(0, 2000) },
              },
            });
        });
        if (!/fatura talebinizi/iu.test(args[2].outbound))
          args[2].outbound += "\n\nFatura talebinizi ekibimize ilettim.";
      }
    }
    if (
      savedServiceKinds.length &&
      args[2].intent !== "SENSITIVE_OR_EMERGENCY" &&
      args[2].outbound
    ) {
      args[2].outbound = `${serviceReceipt(savedServiceKinds)}\n\n${args[2].outbound}`;
    }
    await saveOutbound(...args);
    if (input.source === "demo")
      await observeReply({
        conversationId: args[0],
        messageId: args[1],
        diagnosis: args[2],
        inbound: input.text,
        demoAdminUserId: input.demoAdminUserId,
      });
  };
  const persistAction = async (...args: Parameters<typeof saveAction>) => {
    await input.ensureCurrent?.();
    return saveAction(...args);
  };
  const simple = simpleFlowEnabled();
  let text = simple
    ? correctedBatch(input.text.trim()) || input.text.trim()
    : input.text.trim();
  if (!text) {
    throw new Error("empty");
  }
  const env = getEnv();
  const now = new Date();
  let patient = await resolvePatient({ ...input, text });
  let conversation = await prisma.conversation.findFirst({
    where: {
      id: input.conversationId,
      patientId: patient.id,
      source: input.source ?? "whatsapp",
    },
    orderBy: { lastMessageAt: "desc" },
  });
  const previousLastAt = conversation?.lastMessageAt ?? now;
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        patientId: patient.id,
        phone: input.phone,
        source: input.source ?? "whatsapp",
        mode: "BOT",
        lastMessageAt: now,
      },
    });
  } else {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: now, phone: input.phone },
    });
  }

  const inboundMessage = input.inboundMessageIds?.length
    ? await prisma.message.findFirstOrThrow({
        where: { id: input.inboundMessageIds.at(-1), conversationId: conversation.id },
      })
    : await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: "INBOUND",
          authorKind: "PATIENT",
          text,
        },
      });

  // Operator shutdown: no model call, no action, no promise of a time. The
  // conversation moves to staff exactly as a security handoff would.
  const controls = await loadClinicControls();
  if (!controls.assistantEnabled) {
    const diagnosis = buildHumanRequestDiagnosis({
      inbound: text,
      now,
      model: "assistant-disabled-v1",
    });
    diagnosis.intentLabel = "Asistan kapalı";
    diagnosis.promptVersion = "assistant-disabled-v1";
    diagnosis.provider = "fake";
    diagnosis.outbound = ASSISTANT_OFF_REPLY;
    diagnosis.action = null;
    diagnosis.botStopped = true;
    diagnosis.handoff = { reason: assistantOffHandoffReason(controls.assistantOffReason) };
    diagnosis.rules = ["Asistan kapalı; otomatik yanıt ve işlem üretilmedi."];
    await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { mode: "HUMAN", handoffReason: diagnosis.handoff.reason },
    });
    await prisma.auditEvent.create({
      data: {
        action: "assistant.disabled_handoff",
        entityType: "Message",
        entityId: inboundMessage.id,
        metadata: { reason: controls.assistantOffReason },
      },
    });
    return finish({
      diagnosis,
      conversationId: conversation.id,
      patientId: patient.id,
      actionId: null,
      hasAppointment: false,
    });
  }

  const security = securityHandoff(text);
  if (security && !isCrisisMessage(text)) {
    const diagnosis = buildHumanRequestDiagnosis({
      inbound: text,
      now,
      model: "security-code-v1",
    });
    diagnosis.handoff = { reason: security.reason };
    diagnosis.outbound = security.silent
      ? ""
      : "Bu işlemi otomatik tamamlayamıyorum. Konuşmanızı klinik ekibine aktarıyorum.";
    if (!security.silent)
      await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { mode: "HUMAN", handoffReason: security.reason },
    });
    await prisma.auditEvent.create({
      data: {
        action: "assistant.security_handoff",
        entityType: "Message",
        entityId: inboundMessage.id,
        metadata: { reason: security.reason, silent: security.silent },
      },
    });
    await remindWaitingConversations(now, conversation.id);
    return finish({
      diagnosis,
      conversationId: conversation.id,
      patientId: patient.id,
      actionId: null,
      hasAppointment: false,
    });
  }

  const serviceKinds = requestedServices(text);
  for (const kind of serviceKinds) {
    await prisma.serviceRequest.upsert({
      where: { messageId_kind: { messageId: inboundMessage.id, kind } },
      create: {
        conversationId: conversation.id,
        messageId: inboundMessage.id,
        kind,
        summary: text.slice(0, 4000),
      },
      update: {},
    });
  }
  const requestedMode = requestedSessionMode(text);
  if (requestedMode)
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { sessionMode: requestedMode, sessionModeConfirmed: true },
    });
  savedServiceKinds = serviceKinds;
  let displayName = introducedName(text) ?? patient.displayName;

  if (conversation.mode === "HUMAN") {
    if (
      /kimse.{0,30}donmedi|hala bekliyorum|donus yapilmadi/.test(
        normalizePatientName(text),
      )
    ) {
      await remindWaitingConversations(now, conversation.id);
    }
    const diagnosis = buildScopeGuardDiagnosis({
      inbound: text,
      now,
      model: env.LLM_MODEL,
      greeting: false,
      reason: "Konuşma çalışanda; asistan yanıt vermedi.",
    });
    diagnosis.outbound = "";
    diagnosis.botStopped = true;
    return finish({
      diagnosis,
      conversationId: conversation.id,
      patientId: patient.id,
      actionId: null,
      hasAppointment: false,
    });
  }

  if (
    simple &&
    !isCrisisMessage(text) &&
    !isAbuseMessage(text) &&
    !isHumanRequest(text)
  ) {
    await input.ensureCurrent?.();
    const partyDemoTherapist =
      input.source === "demo" && input.demoAdminUserId
        ? await ensureDemoCalendarProfile(input.demoAdminUserId)
        : null;
    const party = await prepareBookingParty(
      conversation.id,
      input.phone,
      text,
      conversation.bookingParty,
      now,
      partyDemoTherapist?.id,
    );
    conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    if (party?.reply) {
      const diagnosis = buildScopeGuardDiagnosis({
        inbound: text,
        now,
        model: env.LLM_MODEL,
        greeting: false,
        reason: "Çok kişili randevu netleştiriliyor.",
      });
      diagnosis.outbound = party.reply;
      diagnosis.botStopped = Boolean(party.handoff);
      diagnosis.handoff = party.handoff ? { reason: party.reply } : null;
      await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
      if (party.handoff)
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { mode: "HUMAN", handoffReason: party.reply },
        });
      return finish({
        diagnosis,
        conversationId: conversation.id,
        patientId: patient.id,
        actionId: null,
        hasAppointment: false,
      });
    }
    if (party?.patient) {
      patient = party.patient;
      displayName = patient.displayName;
      if (conversation.bookingStage === "GREETING")
        conversation = await prisma.conversation.update({
          where: { id: conversation.id },
          data: { bookingStage: "INTAKE" },
        });
    }
  }
  const partyId = partyPatientId(conversation.bookingParty);
  const patients = partyId
    ? [patient]
    : input.patientId && !mentionsAnotherPerson(text)
      ? await prisma.patient.findMany({ where: { id: input.patientId } })
      : await prisma.patient.findMany({ where: { phone: input.phone } });
  // An additional booking must never silently become a reschedule.
  const additionalBooking = additionalBookingText(text);
  const explicitNewBooking = requestsNewBooking(text);
  if (explicitNewBooking && /(?:bir|1) hafta sonra/iu.test(text)) {
    const previous = await prisma.appointment.findFirst({
      where: {
        patientId: patient.id,
        status: { in: ["SCHEDULED", "CONFIRMED"] },
        startAt: { gte: now },
      },
      orderBy: { startAt: "asc" },
    });
    if (previous) {
      const next = new Date(previous.startAt.getTime() + 7 * 86400000);
      const preference = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Istanbul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(next);
      patient = await prisma.patient.update({
        where: { id: patient.id },
        data: { availabilityNotes: preference, version: { increment: 1 } },
      });
    }
  }
  const missedAppointment = reportsMissedAppointment(text);
  const movingParts = rescheduleParts(text);
  const existingOperation = actsOnExistingAppointment(text);
  if (simple && (explicitNewBooking || existingOperation)) {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        bookingPurpose: existingOperation ? null : "NEW",
        appointmentSelection: Prisma.DbNull,
        ...(existingOperation
          ? { offeredSlots: [], offeredAt: null, offeredTherapistId: null }
          : {}),
      },
    });
  }
  let appointments = await prisma.appointment.findMany({
    where: {
      patientId: {
        in:
          partyId || conversation.bookingPurpose === "NEW"
            ? []
            : patients.map((item) => item.id),
      },
      therapist: { user: { role: input.source === "demo" ? undefined : "THERAPIST" } },
      ...(missedAppointment
        ? {
            OR: [
              { status: { in: ["SCHEDULED", "CONFIRMED"] as const } },
              { status: "COMPLETED" as const, completedAutomaticallyAt: { not: null } },
            ],
          }
        : { status: { in: ["SCHEDULED", "CONFIRMED"] as const } }),
      startAt: missedAppointment
        ? { gte: new Date(now.getTime() - 30 * 86400000), lt: now }
        : { gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
    },
    include: { therapist: true, patient: true },
    orderBy: { startAt: "asc" },
  });
  const selection = conversation.appointmentSelection as {
    ids: string[];
    original: string;
    selectedId?: string;
    createdAt: string;
  } | null;
  const selectionFresh =
    selection && now.getTime() - Date.parse(selection.createdAt) < 30 * 60000;
  const selectsOperation = selectsExistingAppointment(text);
  if (
    simple &&
    !partyId &&
    (conversation.bookingPurpose !== "NEW" || selectsOperation) &&
    (selectsOperation || selectionFresh)
  ) {
    const candidates =
      selectionFresh && !selectsOperation
        ? appointments.filter((a) => selection.ids.includes(a.id))
        : appointments;
    const choice = text.trim().match(/^(\d+)(?:\s+olsun)?[.!]*$/u);
    const targetText = /iptal/iu.test(text) ? text.split(/iptal/iu)[0] : text;
    const date = parseSlotPreference(movingParts?.source ?? targetText, {}, now).date;
    const named = patients.filter(
      (p) =>
        hasFullName(p.displayName) &&
        normalizePatientName(text).includes(normalizePatientName(p.displayName)),
    );
    const clock = text.match(/(?:^|\s)(\d{1,2})[:.](\d{2})(?:\s|$)/u);
    let selected =
      selectionFresh && !selectsOperation && selection.selectedId
        ? candidates.find((a) => a.id === selection.selectedId)
        : undefined;
    if (!selected && selectionFresh && choice)
      selected = candidates[Number(choice[1]) - 1];
    if (
      !selected &&
      (movingParts || !selectsOperation || /iptal/.test(normalizePatientName(text)))
    ) {
      const matches = candidates.filter(
        (a) =>
          (!date || istanbulDay(a.startAt) === date) &&
          (!named.length || named.some((p) => p.id === a.patientId)) &&
          (!clock ||
            new Intl.DateTimeFormat("en-GB", {
              timeZone: "Europe/Istanbul",
              hour: "2-digit",
              minute: "2-digit",
            }).format(a.startAt) === `${clock[1].padStart(2, "0")}:${clock[2]}`),
      );
      if (matches.length === 1 && (date || named.length || clock)) selected = matches[0];
    }
    if (selected) {
      appointments = [selected];
      if (movingParts) text = `${movingParts.destination} randevumu değiştir`;
      if (selectionFresh && !selection.selectedId && !selectsOperation)
        text = `${selection.original} — ${selected.patient.displayName}`;
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          appointmentSelection: {
            ids: [selected.id],
            selectedId: selected.id,
            original: selection?.original ?? text,
            createdAt: now.toISOString(),
          },
        },
      });
    } else if (
      (selectsOperation && candidates.length > 1) ||
      (selectionFresh && choice && !selected)
    ) {
      const diagnosis = buildScopeGuardDiagnosis({
        inbound: text,
        now,
        model: "appointment-target-v1",
        greeting: false,
      });
      diagnosis.outbound = `Hangi randevunuz için işlem yapalım? Seçenek numarasını veya kişi, tarih ve saati paylaşabilirsiniz.\n${candidates.map((a, i) => `${i + 1}) ${formatPatientName(a.patient.displayName)} — ${appointmentLookupLabel(a.startAt)} — ${a.therapist.displayName}`).join("\n")}`;
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          appointmentSelection: {
            ids: candidates.map((a) => a.id),
            original: selectionFresh ? selection.original : text,
            createdAt: now.toISOString(),
          },
          offeredSlots: [],
          offeredAt: null,
        },
      });
      await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
      return finish({
        diagnosis,
        conversationId: conversation.id,
        patientId: patient.id,
        actionId: null,
        hasAppointment: true,
      });
    }
  }
  const hasAppointment = Boolean(appointments[0]);
  const isExistingPatient =
    hasFullName(patient.displayName) &&
    (await prisma.appointment.count({ where: { patientId: patient.id } })) > 0;

  const fixture: SimulationFixture = {
    patients: patients.map((item) => ({ name: item.displayName, phone: item.phone })),
    appointments: appointments.map((item) => ({
      id: item.id,
      patientName: item.patient.displayName,
      therapistName: item.therapist.displayName,
      therapistId: item.therapistId,
      startAt: item.startAt,
      endAt: item.endAt,
    })),
    intake: {
      hasFullName: hasFullName(patient.displayName),
      givenName: /yeni hasta/i.test(patient.displayName)
        ? undefined
        : patient.displayName,
      sessionModeConfirmed: conversation.sessionModeConfirmed,
      age: patient.age,
      hasTherapyHistory: patient.hasTherapyHistory,
      availabilityNotes: patient.availabilityNotes,
      alternativeDaysOkay: patient.alternativeDaysOkay,
      isExistingPatient,
    },
  };

  const recent = await prisma.message.findMany({
    where: {
      conversationId: conversation.id,
      id: { notIn: input.inboundMessageIds ?? [inboundMessage.id] },
    },
    orderBy: { createdAt: "desc" },
    take: HISTORY_MESSAGES,
  });
  const history = [...recent].reverse();
  const safetyHistory = history.map((item) => ({
    role: item.authorKind === "PATIENT" ? ("patient" as const) : ("assistant" as const),
    text: item.text,
  }));
  // Buffered messages already updated lastMessageAt on receipt. Use the last
  // message outside this batch to preserve the conversation inactivity timeout.
  const previousActivity = input.inboundMessageIds?.length
    ? (recent[0]?.createdAt ?? now)
    : previousLastAt;
  const idle = !isFreshTimestamp(previousActivity, now);
  const context = idle ? [] : history.map((item) => item.text);
  if (simple && appointments.length === 1 && !conversation.preferredTherapistId) {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { preferredTherapistId: appointments[0]!.therapistId },
    });
  }
  const freshOffer = Boolean(
    conversation.offeredAt &&
    isFreshTimestamp(conversation.offeredAt, now) &&
    conversation.offeredTherapistId === conversation.preferredTherapistId &&
    conversation.offeredSlots.length,
  );
  const chosenSlot = freshOffer
    ? parseSlotChoice(
        text,
        `Uygun saatler:\n${formatSlotOptions(conversation.offeredSlots.map((value) => new Date(value)))}`,
        now,
      )
    : null;
  const demoAdmin =
    input.source === "demo" && input.demoAdminUserId
      ? await ensureDemoCalendarProfile(input.demoAdminUserId)
      : null;
  const activeTherapists = await prisma.therapistProfile.findMany({
    where: {
      active: true,
      user: { active: true },
      OR: [{ user: { role: "THERAPIST" } }, ...(demoAdmin ? [{ id: demoAdmin.id }] : [])],
    },
    orderBy: { displayName: "asc" },
  });
  const previousAppointment = isExistingPatient
    ? await prisma.appointment.findFirst({
        where: {
          patientId: patient.id,
          status: { in: ["SCHEDULED", "CONFIRMED", "COMPLETED"] },
          therapistId: { in: activeTherapists.map((t) => t.id) },
        },
        orderBy: [{ startAt: "desc" }, { id: "desc" }],
        include: { therapist: true },
      })
    : null;
  let defaultTherapist: (typeof activeTherapists)[number] | null =
    appointments[0]?.therapist ??
    activeTherapists.find((item) => item.id === conversation?.preferredTherapistId) ??
    previousAppointment?.therapist ??
    null;
  fixture.selectedTherapistName = defaultTherapist?.displayName ?? null;
  if (
    simple &&
    patients.length === 1 &&
    !conversation.preferredTherapistId &&
    defaultTherapist
  ) {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { preferredTherapistId: defaultTherapist.id },
    });
  }

  if (isCrisisMessage(text)) {
    const diagnosis = applyClinicRules({
      inbound: text,
      now,
      timeZone: env.APP_TIMEZONE,
      fixture,
      calendarAvailable: false,
      knowledge: [],
      emergencyText:
        "Konuşmanızı klinik ekibine aktarıyorum. Yakın bir tehlike varsa lütfen 112’yi arayın veya en yakın acil servise başvurun.",
      llm: {
        provider: "fake",
        model: "crisis-guard-v1",
        latencyMs: 0,
        turn: {
          intent: "SENSITIVE_OR_EMERGENCY",
          confidence: 1,
          reply: "Ekibe aktarılıyor",
          entities: {},
          needsHandoff: true,
        },
      },
    });
    await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { mode: "HUMAN", handoffReason: diagnosis.handoff?.reason },
    });
    return finish({
      diagnosis,
      conversationId: conversation.id,
      patientId: patient.id,
      actionId: null,
      hasAppointment,
    });
  }

  if (isAbuseMessage(text)) {
    const diagnosis = polish(
      buildAbuseDiagnosis({ inbound: text, now, model: env.LLM_MODEL }),
      displayName,
    );
    await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
    return finish({
      diagnosis,
      conversationId: conversation.id,
      patientId: patient.id,
      actionId: null,
      hasAppointment,
    });
  }

  const support = operationalSupport(text);
  if (isHumanRequest(text) || support) {
    const diagnosis = polish(
      buildHumanRequestDiagnosis({ inbound: text, now, model: env.LLM_MODEL }),
      displayName,
    );
    if (support) {
      diagnosis.outbound = support.reply;
      diagnosis.handoff = { reason: support.reason };
    }
    await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        mode: "HUMAN",
        handoffReason: diagnosis.handoff?.reason ?? "Çalışana aktarıldı",
      },
    });
    return finish({
      diagnosis,
      conversationId: conversation.id,
      patientId: patient.id,
      actionId: null,
      hasAppointment,
    });
  }

  const lastBotText = [...history].reverse().find((m) => m.authorKind === "BOT")?.text;
  const lookupContinuation =
    lastBotText === LOOKUP_PERSON_QUESTION &&
    hasFullPatientName(text) &&
    !/[?]|fatura|ücret|iptal|değiştir|ertele/iu.test(text);
  if (
    simple &&
    process.env.APPOINTMENT_LOOKUP !== "off" &&
    (asksAppointmentLookup(text) || lookupContinuation)
  ) {
    const owners = await prisma.patient.findMany({ where: { phone: input.phone } });
    const namedOwners = owners.filter(
      (p) =>
        normalizePatientName(text).includes(normalizePatientName(p.displayName)) &&
        hasFullPatientName(p.displayName),
    );
    const asksOtherPatient =
      /sizin hastan[ıi]z|hastan[ıi]z m[ıi]|onun randevu|randevusu/iu.test(text) &&
      namedOwners.length === 0;
    const owner = asksOtherPatient
      ? null
      : namedOwners.length === 1
        ? namedOwners[0]
        : owners.length === 1 && !lookupContinuation && !mentionsAnotherPerson(text)
          ? owners[0]
          : null;
    const diagnosis = buildScopeGuardDiagnosis({
      inbound: text,
      now,
      model: "appointment-lookup-v1",
      greeting: false,
    });
    diagnosis.intentLabel = "Randevu bilgisi sorgusu";
    diagnosis.provider = "fake";
    diagnosis.promptVersion = "appointment-lookup-v1";
    diagnosis.rules = [
      "Yalnızca bu telefon numarasına bağlı kişinin kayıtları okunur.",
      "Sorgulama randevu veya onay talebi oluşturmaz ve değiştirmez.",
    ];
    diagnosis.raw = { appointmentLookup: true };
    diagnosis.outbound = asksOtherPatient
      ? "Bu numarayla ilişkili olmayan kişilerin hasta veya randevu bilgilerini paylaşamam. Bu numaraya bağlı kendi randevunuz için yardımcı olabilirim."
      : LOOKUP_PERSON_QUESTION;
    if (owner) {
      const originalQuery = lookupContinuation
        ? ([...history]
            .reverse()
            .find((m) => m.authorKind === "PATIENT" && asksAppointmentLookup(m.text))
            ?.text ?? text)
        : text;
      const date =
        explicitLookupDate(originalQuery, now) ??
        parseSlotPreference(originalQuery, {}, now).date;
      const past =
        historicalLookup(originalQuery) ||
        Boolean(
          date &&
          new Date(new Date(`${date}T00:00:00+03:00`).getTime() + 86400000) <= now,
        );
      const namedTherapists = namedAvailabilityTherapists(
        originalQuery,
        activeTherapists,
      );
      const unknownTherapist =
        /bey|hanım|hanim/iu.test(originalQuery) &&
        !namedTherapists.length &&
        !namedOwners.length;
      const rows = unknownTherapist
        ? []
        : await prisma.appointment.findMany({
            where: {
              patientId: owner.id,
              therapistId: {
                in: (namedTherapists.length ? namedTherapists : activeTherapists).map(
                  (t) => t.id,
                ),
              },
              ...(past
                ? { startAt: { lt: now } }
                : { status: { in: ["SCHEDULED", "CONFIRMED"] }, endAt: { gt: now } }),
              ...(date
                ? {
                    startAt: {
                      gte: new Date(`${date}T00:00:00+03:00`),
                      lt: new Date(
                        new Date(`${date}T00:00:00+03:00`).getTime() + 86400000,
                      ),
                    },
                  }
                : {}),
            },
            include: { therapist: true },
            orderBy: { startAt: past ? "desc" : "asc" },
            take: 6,
          });
      const pendingRequest = await prisma.actionRequest.findFirst({
        where: {
          type: "NEW_BOOKING",
          status: "PENDING",
          conversation: { phone: input.phone },
          OR: [
            { proposedChanges: { path: ["patientId"], equals: owner.id } },
            {
              conversation: { patientId: owner.id },
              proposedChanges: { path: ["patientId"], equals: Prisma.DbNull },
            },
          ],
        },
      });
      const labels: Record<string, string> = {
        SCHEDULED: "Planlandı",
        CONFIRMED: "Katılım teyit edildi",
        CANCELLED: "İptal edildi",
        COMPLETED: "Tamamlandı",
        NO_SHOW_REVIEW: "İnceleme bekliyor",
      };
      diagnosis.outbound = rows.length
        ? `${formatPatientName(owner.displayName)} için ${past ? "geçmiş" : "kayıtlı"} randevular:\n${rows
            .slice(0, 5)
            .map(
              (a) =>
                `${appointmentLookupLabel(a.startAt)} — ${a.therapist.displayName} — ${a.sessionMode === "ONLINE" ? "Online" : "Yüz yüze"}${past ? ` (${labels[a.status]})` : ""}`,
            )
            .join(
              "\n",
            )}${rows.length > 5 ? "\nBaşka kayıtlar da var; belirli bir tarih sorabilirsiniz." : ""}`
        : unknownTherapist
          ? "Belirttiğiniz uzmanı eşleştiremedim. Uzmanın adını netleştirir misiniz?"
          : `${formatPatientName(owner.displayName)} için ${date ? "belirttiğiniz günde" : past ? "geçmişte" : "yaklaşan tarihlerde"} bu sorguya uyan randevu kaydı bulunmuyor.`;
      if (pendingRequest && !past)
        diagnosis.outbound +=
          "\nAyrıca ekip onayı bekleyen bir randevu talebiniz var; henüz kesinleşmedi.";
    }
    await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
    return finish({
      diagnosis,
      conversationId: conversation.id,
      patientId: patient.id,
      actionId: null,
      hasAppointment,
    });
  }

  if (
    simple &&
    isExistingPatient &&
    !partyId &&
    !chosenSlot &&
    asksExistingAvailability(text)
  ) {
    const named = namedAvailabilityTherapists(text, activeTherapists);
    const unknownNamed =
      /(?:bey|hanım|hanim|hocanın|hocanin)/iu.test(text) && !named.length;
    const target =
      named.length === 1
        ? named[0]
        : named.length > 1 || unknownNamed || patients.length > 1
          ? null
          : defaultTherapist;
    const diagnosis = buildScopeGuardDiagnosis({
      inbound: text,
      now,
      model: "existing-availability-v1",
      greeting: false,
    });
    diagnosis.intentLabel = "Mevcut hasta müsaitlik sorgusu";
    diagnosis.provider = "fake";
    diagnosis.promptVersion = "existing-availability-v1";
    diagnosis.rules = [
      "Açık terapist adı önceliklidir; ad yoksa kayıtlı terapist kullanılır.",
      "Müsaitlik sorgusu randevuyu değiştirmez veya onay talebi oluşturmaz.",
    ];
    diagnosis.raw = { existingAvailability: true, therapistId: target?.id ?? null };
    diagnosis.outbound =
      "Müsaitliğini kontrol etmemi istediğiniz uzmanın adını paylaşır mısınız?";
    if (target) {
      try {
        if (!(await hasCalendarConnection(target.userId)))
          throw new Error("Calendar unavailable");
        const window = availabilityWindow(text, now);
        const [busy, records, hours] = await Promise.all([
          getCalendar().listBusy({
            ownerUserId: target.userId,
            from: window.from,
            to: window.to,
          }),
          prisma.appointment.findMany({
            where: {
              therapistId: target.id,
              status: { in: ["SCHEDULED", "CONFIRMED"] },
              startAt: { lt: window.to },
              endAt: { gt: window.from },
            },
            select: { startAt: true, endAt: true },
          }),
          prisma.therapistWorkingBlock.findMany({ where: { therapistId: target.id } }),
        ]);
        const slots = proposePreferredSlots({
          now: window.from,
          workingHours: effectiveWorkingHours(hours),
          busy: [...busy, ...records],
          preference: window.preference,
          count: 30,
        })
          .filter((s) => s >= window.from && s < window.to)
          .slice(0, 3);
        if (slots.length) {
          await input.ensureCurrent?.();
          conversation = await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              bookingPurpose: "NEW",
              appointmentSelection: Prisma.DbNull,
              preferredTherapistId: target.id,
              offeredTherapistId: target.id,
              offeredAt: now,
              offeredSlots: slots.map((slot) => slot.toISOString()),
              bookingStage: "SLOT_SELECTION",
            },
          });
        }
        diagnosis.outbound = slots.length
          ? `${target.displayName} için sorduğunuz dönemde şu saatler uygun görünüyor. Yeni bir randevu talebi için saat veya seçenek numarasıyla seçim yapabilirsiniz; mevcut randevularınız korunur. Seçiminiz ekip onayıyla kesinleşir.\nUygun saatler:\n${formatSlotOptions(slots)}`
          : `${target.displayName} için sorduğunuz dönemde uygun saat görünmüyor. Başka bir gün veya haftaya bakmamı ister misiniz?`;
      } catch {
        diagnosis.outbound = `${target.displayName} için takvim müsaitliğini şu anda doğrulayamıyorum. Daha sonra tekrar deneyebilir veya ekibimizden kontrol etmesini isteyebilirsiniz.`;
      }
    }
    await input.ensureCurrent?.();
    await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
    return finish({
      diagnosis,
      conversationId: conversation.id,
      patientId: patient.id,
      actionId: null,
      hasAppointment,
    });
  }

  const savedNote = conversation.pendingAppointmentNote as {
    text: string;
    today: boolean;
    messageId: string;
    createdAt?: string;
    date?: string;
  } | null;
  const newNote = appointmentNoteText(text);
  const noteCancelled = cancelsAppointmentNote(text);
  const savedNoteFresh =
    savedNote?.createdAt &&
    now.getTime() - Date.parse(savedNote.createdAt) < 30 * 60 * 1000;
  const appointmentChanging = changesAppointment(text);
  const notePatients =
    newNote || savedNote
      ? await prisma.patient.findMany({ where: { phone: input.phone } })
      : [];
  const notePreference = parseSlotPreference(text, {}, now);
  const identifiesNote =
    notePatients.some(
      (p) =>
        hasFullName(p.displayName) &&
        normalizePatientName(text).includes(normalizePatientName(p.displayName)),
    ) ||
    Boolean(notePreference.date) ||
    /\d{1,2}[:.]\d{2}/.test(text);
  if (savedNote && (!savedNoteFresh || noteCancelled || appointmentChanging))
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { pendingAppointmentNote: Prisma.DbNull },
    });
  const note =
    newNote && !noteCancelled
      ? {
          ...newNote,
          messageId: inboundMessage.id,
          createdAt: now.toISOString(),
          date: notePreference.date ?? (newNote.today ? istanbulDay(now) : undefined),
        }
      : savedNoteFresh &&
          !noteCancelled &&
          !appointmentChanging &&
          !/fatura|ücret|nedir|nerede/iu.test(text) &&
          identifiesNote
        ? savedNote
        : null;
  if (note) {
    await input.ensureCurrent?.();
    const preference = parseSlotPreference(text, {}, now);
    const named = notePatients.filter(
      (p) =>
        hasFullName(p.displayName) &&
        normalizePatientName(text).includes(normalizePatientName(p.displayName)),
    );
    const noteAppointments = await prisma.appointment.findMany({
      where: {
        patientId: { in: notePatients.map((p) => p.id) },
        status: { in: ["SCHEDULED", "CONFIRMED"] },
        startAt: { gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
        therapist: { user: { role: input.source === "demo" ? undefined : "THERAPIST" } },
      },
      include: { patient: true },
    });
    const candidates = noteAppointments.filter(
      (a) =>
        (!named.length || named.some((p) => p.id === a.patientId)) &&
        (preference.date
          ? istanbulDay(a.startAt) === preference.date
          : !note.date || istanbulDay(a.startAt) === note.date),
    );
    const time = text.match(/(?:saat\s*)?(\d{1,2})[:.](\d{2})/u);
    const selected = time
      ? candidates.filter(
          (a) =>
            new Intl.DateTimeFormat("en-GB", {
              timeZone: "Europe/Istanbul",
              hour: "2-digit",
              minute: "2-digit",
            }).format(a.startAt) === `${time[1].padStart(2, "0")}:${time[2]}`,
        )
      : candidates;
    const status =
      selected.length === 1 ? "recorded" : selected.length ? "ambiguous" : "missing";
    let synced = false;
    if (status === "recorded") {
      const stored = await prisma.appointmentNote.upsert({
        where: { messageId: note.messageId },
        create: {
          appointmentId: selected[0]!.id,
          messageId: note.messageId,
          text: note.text,
        },
        update: {},
      });
      synced = await syncAppointmentNote(stored.id);
    }
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { pendingAppointmentNote: status === "recorded" ? Prisma.DbNull : note },
    });
    const diagnosis = polish(
      buildLateNoticeDiagnosis({
        inbound: text,
        now,
        model: env.LLM_MODEL,
        minutes: null,
        status,
      }),
      displayName,
    );
    diagnosis.outbound =
      status === "recorded"
        ? `Notunuzu ${formatPatientName(selected[0]!.patient.displayName)} için ${formatSlotLabel(selected[0]!.startAt)} randevusuna kaydettim.${synced ? " Takvim açıklamasına da eklendi." : " Takvime aktarım henüz tamamlanmadı; yeniden denenecek."} Randevu saatiniz değişmedi.`
        : "Notu doğru randevuya eklemek için kişinin adını, randevu gününü ve saatini paylaşır mısınız?";
    await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
    return finish({
      diagnosis,
      conversationId: conversation.id,
      patientId: patient.id,
      actionId: null,
      hasAppointment,
    });
  }

  if (
    isConversationClosing(text) &&
    !(
      simple &&
      history
        .filter((m) => m.direction === "OUTBOUND")
        .at(-1)
        ?.text.match(
          /Randevu almak ister misiniz\?|mı kastediyorsunuz\?|başka.{0,35}gün|yakın.{0,25}gün/i,
        )
    )
  ) {
    const diagnosis = polish(
      buildConversationClosingDiagnosis({ inbound: text, now, model: env.LLM_MODEL }),
      displayName,
    );
    await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
    return finish({
      diagnosis,
      conversationId: conversation.id,
      patientId: patient.id,
      actionId: null,
      hasAppointment,
    });
  }

  if (chosenSlot && !patient.availabilityNotes?.trim()) {
    patient = await prisma.patient.update({
      where: { id: patient.id },
      data: { availabilityNotes: formatSlotLabel(chosenSlot), version: { increment: 1 } },
    });
    if (fixture.intake) fixture.intake.availabilityNotes = patient.availabilityNotes;
  }
  if (
    chosenSlot &&
    (conversation.sessionModeConfirmed || appointments.length > 0) &&
    defaultTherapist &&
    missingBookingProfile(patient).length === 0
  ) {
    try {
      if (!defaultTherapist || !(await hasCalendarConnection(defaultTherapist.userId)))
        throw new Error("Calendar unavailable");
      const endAt = new Date(chosenSlot.getTime() + SESSION_MINUTES * 60000);
      const busy = await getCalendar().listBusy({
        ownerUserId: defaultTherapist.userId,
        from: chosenSlot,
        to: endAt,
      });
      const overlap = await prisma.appointment.findFirst({
        where: {
          therapistId: defaultTherapist.id,
          status: { in: ["SCHEDULED", "CONFIRMED"] },
          startAt: { lt: endAt },
          endAt: { gt: chosenSlot },
        },
        select: { id: true },
      });
      const reserved = partyId
        ? await partyReservedSlots(conversation.id, patient.id)
        : [];
      if (
        chosenSlot.getTime() < now.getTime() + 3 * 3600000 ||
        !withinClinicHours(chosenSlot) ||
        !withinClinicHours(new Date(endAt.getTime() - 1)) ||
        reserved.some(
          (b) =>
            b.therapistId === defaultTherapist?.id &&
            b.startAt < endAt &&
            b.endAt > chosenSlot,
        ) ||
        overlap ||
        busy.some((b) => b.startAt < endAt && b.endAt > chosenSlot)
      )
        throw new Error("Slot no longer available");
    } catch {
      const diagnosis = buildScopeGuardDiagnosis({
        inbound: text,
        now,
        model: env.LLM_MODEL,
        greeting: false,
        reason: "Seçilen saat doğrulanamadı.",
      });
      diagnosis.outbound =
        "Seçtiğiniz saatin müsaitliğini şu an doğrulayamıyorum. Talebinizi kontrol için ekibe iletiyorum.";
      diagnosis.action = null;
      diagnosis.botStopped = true;
      diagnosis.handoff = {
        reason: "Seçilen saat veya takvim bağlantısı yeniden kontrol edilmeli.",
      };
      await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { mode: "HUMAN", handoffReason: diagnosis.handoff.reason },
      });
      return finish({
        diagnosis,
        conversationId: conversation.id,
        patientId: patient.id,
        actionId: null,
        hasAppointment,
      });
    }
    const diagnosis: SimulationDiagnosis = polish(
      buildSlotChoiceDiagnosis({
        inbound: text,
        slot: chosenSlot,
        now,
        hasAppointment,
        therapistName:
          appointments[0]?.therapist.displayName ??
          defaultTherapist?.displayName ??
          "Santa Psikoloji",
      }),
      displayName,
    );
    (diagnosis as SimulationDiagnosis & { slotStart?: string }).slotStart =
      chosenSlot.toISOString();
    const actionId = await persistAction({
      diagnosis,
      conversationId: conversation.id,
      patientId: patient.id,
      appointments,
      defaultTherapistId: defaultTherapist?.id ?? null,
    });
    if (actionId && partyId)
      diagnosis.outbound = `${formatPatientName(patient.displayName)}: ${diagnosis.outbound}${await partyNextPrompt(conversation.bookingParty)}`;
    await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
    return finish({
      diagnosis,
      conversationId: conversation.id,
      patientId: patient.id,
      actionId,
      hasAppointment,
    });
  }

  if (!simple && isBroadClinicQuestion(text)) {
    const diagnosis = buildClinicClarification(text, now);
    await input.ensureCurrent?.();
    await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
    return finish({
      diagnosis,
      conversationId: conversation.id,
      patientId: patient.id,
      actionId: null,
      hasAppointment,
    });
  }

  const scope =
    isPureIntroduction(text) && conversation.bookingStage === "GREETING"
      ? { kind: "greeting" as const }
      : decideScope(text, context);
  if (
    scope.kind === "out_of_scope" ||
    (scope.kind === "greeting" &&
      conversation.bookingStage === "GREETING" &&
      !fixture.selectedTherapistName &&
      !appointments.length)
  ) {
    const diagnosis = polish(
      buildScopeGuardDiagnosis({
        inbound: text,
        now,
        model: env.LLM_MODEL,
        greeting: scope.kind === "greeting",
        reason: scope.kind === "out_of_scope" ? scope.reason : "Yeni selamlaşma",
      }),
      displayName,
    );
    await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
    return finish({
      diagnosis,
      conversationId: conversation.id,
      patientId: patient.id,
      actionId: null,
      hasAppointment,
    });
  }

  const knowledge = demoTherapistKnowledge(
    input.source,
    demoAdmin,
    await loadKnowledge(),
  );
  const cachedFaq = simple || input.source === "demo" ? null : await findCachedFaq(text);
  if (cachedFaq && isCachedIntent(cachedFaq.intent)) {
    let diagnosis = polish(
      {
        id: `faq_${cachedFaq.id}`,
        inbound: text,
        outbound: cachedFaq.answer,
        createdAt: now.toISOString(),
        intent: cachedFaq.intent,
        intentLabel: "Önbellekten klinik bilgisi",
        confidence: 1,
        entities: {},
        knowledge: cachedFaq.knowledgeDocId
          ? {
              id: cachedFaq.knowledgeDocId,
              title: "Onaylı bilgi önbelleği",
              source: "Santa Psikoloji",
              version: cachedFaq.knowledgeVersion ?? 1,
            }
          : null,
        action: null,
        handoff: null,
        botStopped: false,
        rules: [
          "Önceki yanıt adayı önbellekten alındı; içerik ve kaynak yeniden doğrulanacak.",
        ],
        raw: { faqCacheHit: true },
        latencyMs: 0,
        model: null,
        promptVersion: "faq-cache-v1",
        provider: "fake",
      },
      displayName,
    );
    try {
      diagnosis = await verifyDiagnosis(
        diagnosis,
        await createLlm(),
        knowledge,
        {
          conversationId: conversation.id,
          therapistId: defaultTherapist?.id,
          messageId: inboundMessage.id,
        },
        safetyHistory,
      );
    } catch {
      diagnosis = blockUnverifiedDiagnosis(diagnosis);
    }
    await input.ensureCurrent?.();
    if (diagnosis.botStopped)
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { mode: "HUMAN", handoffReason: diagnosis.handoff?.reason },
      });
    await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
    return finish({
      diagnosis,
      conversationId: conversation.id,
      patientId: patient.id,
      actionId: null,
      hasAppointment,
    });
  }

  const pending = await prisma.actionRequest.findFirst({
    where: {
      conversationId: conversation.id,
      status: "PENDING",
      type: { in: ["NEW_BOOKING", "RESCHEDULE"] },
      ...(partyId ? { proposedChanges: { path: ["patientId"], equals: partyId } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  fixture.awaitingSlotSelection = freshOffer && !chosenSlot && !pending;
  const offered = freshOffer
    ? extractOfferedSlotLabels(
        `Uygun saatler:\n${formatSlotOptions(conversation.offeredSlots.map((value) => new Date(value)))}`,
      )
    : [];
  const sessionNotes = [
    "Güncel müşteri profili tek doğru kaynaktır. Önceki mesajlar veya hafıza özeti bu profille çelişirse güncel profili kullan. Entities alanına yalnızca hastanın BU mesajında açıkça verdiği yeni bilgiyi yaz; eski konuşmadan profil alanlarını geri doldurma.",
    demoAdmin
      ? `Bu bir test konuşmasıdır. ${demoAdmin.displayName} yalnızca demoda randevu alınabilir test kişisidir. Yönetici Ömer adı bu kişiyi ifade eder. Terapist randevusuyla aynı bilgi toplama, müsaitlik ve onay akışını uygula; Demo hizmet bilgisi varsa Ömer için o bilgiyi kullan; gerçek klinik uzmanlık iddiasında bulunma.`
      : null,
    `Kayıtlı randevu aşaması: ${conversation.bookingStage}.`,
    `Terapist tercihi: ${defaultTherapist?.displayName ?? "Henüz seçilmedi. Yeni randevu için müşteriye sor; kendin seçme."}`,
    `Aktif terapistler: ${activeTherapists.map((t) => t.displayName).join("; ")}. Tanıtım için yalnızca onaylı bilgi havuzunu kullan.`,
    conversation.memorySummary
      ? `Konuşma hafızası:\n${conversation.memorySummary}`
      : null,
    pending ? `Bekleyen işlem: ${pending.type}` : null,
    offered.length
      ? `Son sunulan saatler:\n${offered.map((label, index) => `${index + 1}) ${label}`).join("\n")}`
      : null,
    `Hasta ve randevu bilgileri:\n${intakeSummary({ ...patient, isExistingPatient })}`,
  ]
    .filter(Boolean)
    .join("\n");
  const priorDecisions = await prisma.intentDecision.findMany({
    where: {
      message: { conversationId: conversation.id, id: { not: inboundMessage.id } },
      intent: { not: "MODEL_UNAVAILABLE" },
    },
    orderBy: { message: { createdAt: "desc" } },
    take: 8,
    select: { intent: true, confidence: true },
  });
  const unknownStreak = consecutiveLowUnknownCount([...priorDecisions].reverse());

  let diagnosis: SimulationDiagnosis;
  let simplePlan: SimplePlan | undefined;
  try {
    const planningHours = simple
      ? await prisma.therapistWorkingBlock.findMany({
          where: { therapistId: { in: activeTherapists.map((t) => t.id) } },
        })
      : [];
    const planningInput = {
      invitationAlreadySent: history.some(
        (m) =>
          (m.authorKind === "BOT" && m.text.includes(BOOKING_INVITATION)) ||
          (m.authorKind === "PATIENT" &&
            /randevu (?:almak istemiyorum|istemiyorum)|sadece bilgi/iu.test(m.text)),
      ),
      text,
      now,
      stage: conversation.bookingStage,
      lastReply: history.filter((m) => m.direction === "OUTBOUND").at(-1)?.text ?? "",
      fixture,
      roster: activeTherapists.map((t) => ({
        ...t,
        workingHours: effectiveWorkingHours(
          planningHours.filter((b) => b.therapistId === t.id),
        ),
      })),
      knowledge,
    };
    simplePlan = simple ? planSimpleFlow(planningInput) : undefined;
    if (simplePlan) {
      const interpretation = await observeUnderstanding({
        source: input.source,
        conversationId: conversation.id,
        messageId: inboundMessage.id,
        inbound: text,
        history: safetyHistory,
        stage: conversation.bookingStage,
        known: {
          name: patient.displayName,
          age: patient.age,
          hasTherapyHistory: patient.hasTherapyHistory,
        },
        nowIso: now.toISOString(),
        codeTurn: simplePlan.result.turn,
      });
      await input.ensureCurrent?.();
      if (interpretation) {
        const codeTurn = simplePlan.result.turn;
        simplePlan = planSimpleFlow({ ...planningInput, interpretation });
        await prisma.auditEvent.create({
          data: {
            action: "assistant.understanding_applied",
            entityType: "Message",
            entityId: inboundMessage.id,
            metadata: JSON.parse(
              JSON.stringify({
                mode: "active",
                version: "understand-integration-v1",
                changedPlan:
                  JSON.stringify(codeTurn) !== JSON.stringify(simplePlan.result.turn),
                before: codeTurn,
                after: simplePlan.result.turn,
              }),
            ),
          },
        });
      }
    }
    const llm = !simple ? await createLlm() : null;
    const llmResult =
      simplePlan?.result ??
      (await llm!.complete({
        history: history.map((item) => ({
          role:
            item.authorKind === "PATIENT" ? ("patient" as const) : ("assistant" as const),
          text: item.text,
        })),
        inbound: text,
        nowIso: now.toISOString(),
        appointmentsSummary:
          fixture.appointments
            .map(
              (item) =>
                `${item.patientName} · ${item.therapistName} · ${item.startAt.toISOString()}`,
            )
            .join("\n") || "Bu numarada yaklaşan randevu yok.",
        knowledge,
        modelVersion: "intent-v3",
        patientAddress: addressedName(displayName),
        sessionNotes: sessionNotes || null,
      }));
    llmResult.turn = normalizeBookingPreference(
      llmResult.turn,
      appointments.length > 0 ||
        (isExistingPatient && llmResult.turn.intent === "THERAPIST_CHANGE"),
      pending?.type === "NEW_BOOKING",
      {
        inbound: text,
        roster: activeTherapists,
        selectedName: defaultTherapist?.displayName ?? null,
      },
    );
    await recordModelUsage(llmResult, {
      therapistId: defaultTherapist?.id,
      conversationId: conversation.id,
      messageId: inboundMessage.id,
      task: "legacy",
      output: llmResult.turn,
    }).catch(() => undefined);
    await input.ensureCurrent?.();
    if (
      !appointments.length &&
      llmResult.turn.intent === "NEW_BOOKING" &&
      llmResult.turn.confidence >= 0.7
    ) {
      const preference = llmResult.turn.entities.therapistPreference;
      if (preference === "SELECTED") {
        const selected = resolveTherapist(
          llmResult.turn.entities.therapistName,
          activeTherapists,
        );
        // An omitted or unresolvable name does not erase a saved choice.
        if (selected) defaultTherapist = selected;
      } else if (preference === "UNDECIDED") {
        defaultTherapist = null;
      }
      if (preference) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { preferredTherapistId: defaultTherapist?.id ?? null },
        });
      }
      fixture.selectedTherapistName = defaultTherapist?.displayName ?? null;
    }
    if (
      llmResult.turn.intent === "CANCEL" &&
      llmResult.turn.confidence >= 0.7 &&
      /^\d{4}-\d{2}-\d{2}$/.test(llmResult.turn.entities.date ?? "")
    ) {
      const from = new Date(`${llmResult.turn.entities.date}T00:00:00+03:00`);
      const matches = await prisma.appointment.findMany({
        where: {
          patientId: { in: patients.map((p) => p.id) },
          status: { in: ["SCHEDULED", "CONFIRMED"] },
          startAt: { gte: from, lt: new Date(from.getTime() + 86400000) },
        },
        include: { patient: true, therapist: true },
        orderBy: { startAt: "asc" },
      });
      const requestedTime = llmResult.turn.entities.time;
      const selectedAppointments = requestedTime
        ? matches.filter(
            (a) =>
              new Intl.DateTimeFormat("en-GB", {
                timeZone: "Europe/Istanbul",
                hour: "2-digit",
                minute: "2-digit",
              }).format(a.startAt) === requestedTime,
          )
        : matches;
      appointments.splice(0, appointments.length, ...selectedAppointments);
      fixture.appointments = appointments.map((a) => ({
        id: a.id,
        patientName: a.patient.displayName,
        therapistName: a.therapist.displayName,
        therapistId: a.therapistId,
        startAt: a.startAt,
        endAt: a.endAt,
      }));
    }
    const trustedEntities =
      llmResult.turn.confidence >= 0.7 &&
      llmResult.turn.intent !== "SENSITIVE_OR_EMERGENCY"
        ? llmResult.turn.entities
        : {};
    const entityName = trustedEntities.patientName?.trim();
    await input.ensureCurrent?.();
    const nextPatient = await prisma.$transaction(async (tx) => {
      const updated = await tx.patient.updateMany({
        where: { id: patient.id, version: patient.version },
        data: {
          displayName:
            entityName && hasFullPatientName(entityName) ? entityName : undefined,
          age: trustedEntities.age ?? undefined,
          hasTherapyHistory: trustedEntities.hasTherapyHistory ?? undefined,
          availabilityNotes: trustedEntities.availabilityNotes?.trim() || undefined,
          alternativeDaysOkay: trustedEntities.alternativeDaysOkay ?? undefined,
          version: { increment: 1 },
        },
      });
      if (updated.count && llmResult.turn.memorySummary?.trim()) {
        await tx.conversation.update({
          where: { id: conversation.id },
          data: { memorySummary: llmResult.turn.memorySummary.trim() },
        });
      }
      return tx.patient.findUniqueOrThrow({ where: { id: patient.id } });
    });
    displayName = nextPatient.displayName;
    fixture.intake = {
      hasFullName: hasFullName(nextPatient.displayName),
      givenName: /yeni hasta/i.test(nextPatient.displayName)
        ? undefined
        : nextPatient.displayName,
      sessionModeConfirmed: conversation.sessionModeConfirmed,
      age: nextPatient.age,
      hasTherapyHistory: nextPatient.hasTherapyHistory,
      availabilityNotes: nextPatient.availabilityNotes,
      alternativeDaysOkay: nextPatient.alternativeDaysOkay,
      isExistingPatient,
    };
    diagnosis = applyClinicRules({
      llm: llmResult,
      inbound: text,
      fixture,
      now,
      timeZone: env.APP_TIMEZONE,
      calendarAvailable: await hasCalendarConnection(defaultTherapist?.userId),
      knowledge,
      emergencyText:
        "Konuşmanızı klinik ekibine aktarıyorum. Yakın bir tehlike varsa lütfen 112’yi arayın veya en yakın acil servise başvurun.",
      unknownStreak,
    });
    if (simplePlan) {
      if (simplePlan.needsAnswer) {
        // The answer model has no authority over entities, actions, or state.
        try {
          const answerLlm = await createLlm(true);
          const answer = await answerLlm.complete({
            history: safetyHistory,
            inbound: text,
            nowIso: now.toISOString(),
            appointmentsSummary: "",
            knowledge,
            modelVersion: "answer-only-v1",
            sessionNotes:
              "Yalnızca müşterinin terapi süreci hakkındaki bilgi sorusuna kısa yanıt ver. Profil bilgisi toplama, randevu veya işlem kararı verme. Kişiye özel tanı/tedavi önerme.",
          });
          await recordModelUsage(answer, {
            conversationId: conversation.id,
            messageId: inboundMessage.id,
            task: "answer",
            output: answer.turn.questionAnswer || answer.turn.reply,
          });
          const candidate = answer.turn.questionAnswer || answer.turn.reply;
          if (
            /yalnızca bu soruya yanıt|işlem kod tarafından|örnek yanıt/i.test(candidate)
          )
            throw new Error("Placeholder reply");
          const checked = await verifyDiagnosis(
            {
              ...diagnosis,
              intent: "THERAPY_INFO",
              action: null,
              additionalActions: [],
              entities: {},
              knowledge: null,
              outbound: candidate,
              model: answer.model,
              provider: answer.provider,
              routing: [{ kind: "CLINIC_INFO", handler: "ai" }],
            },
            answerLlm,
            knowledge,
            { conversationId: conversation.id, messageId: inboundMessage.id },
            safetyHistory,
          );
          simplePlan.information.push(
            checked.botStopped
              ? "Bu soruya şu anda doğrulanmış bir yanıt veremiyorum. Dilerseniz ekibimize danışabilirsiniz."
              : checked.outbound,
          );
          diagnosis = {
            ...diagnosis,
            model: answer.model,
            provider: answer.provider,
            contentSafety: checked.contentSafety,
            grounding: checked.grounding,
          };
        } catch {
          simplePlan.information.push(
            "Bu soruya şu anda doğrulanmış bir yanıt veremiyorum. Dilerseniz ekibimize danışabilirsiniz.",
          );
        }
      }
      diagnosis = renderSimpleFlow(simplePlan, diagnosis, fixture, Boolean(pending));
      if (
        simplePlan.booking &&
        nextPatient.age != null &&
        nextPatient.age < 18 &&
        missingBookingProfile(nextPatient).some((field) => field.startsWith("veli"))
      ) {
        diagnosis = {
          ...diagnosis,
          action: null,
          botStopped: true,
          handoff: {
            reason: "Çocuk/ergen başvurusu: veli bilgisi, onay ve eşlik teyidi gerekli.",
          },
          outbound: [
            ...simplePlan.information,
            "Çocuk ve ergen başvurularında veli onayı ve eşliği gerekiyor. Veli bilgilerini ve onayı teyit ederek süreci tamamlaması için sizi ekibimize aktarıyorum.",
          ].join("\n\n"),
        };
      }
    } else {
      diagnosis = await verifyDiagnosis(
        diagnosis,
        llm!,
        knowledge,
        {
          conversationId: conversation.id,
          therapistId: defaultTherapist?.id,
          messageId: inboundMessage.id,
        },
        safetyHistory,
      );
    }
  } catch (error) {
    if (error instanceof SupersededInboundError) throw error;
    const budgetExceeded = error instanceof UsageBudgetExceededError;
    const failure = modelFailure(error);
    const reply = serviceFailureReply({ failure, budgetExceeded });
    diagnosis = buildScopeGuardDiagnosis({
      inbound: text,
      now,
      model: env.LLM_MODEL,
      greeting: false,
      reason: reply.reason,
    });
    diagnosis.serviceFailure = failure;
    diagnosis.intentLabel = reply.intentLabel;
    diagnosis.provider = "openai";
    diagnosis.promptVersion = reply.promptVersion;
    diagnosis.confidence = 0;
    diagnosis.rules = [reply.rule];
    diagnosis.raw = { serviceFailure: failure };
    diagnosis.outbound = reply.outbound;
    diagnosis.handoff = reply.handoff;
    diagnosis.botStopped = reply.botStopped;
  }

  if (
    !simple &&
    !diagnosis.serviceFailure &&
    input.source !== "demo" &&
    !diagnosis.handoff &&
    !diagnosis.botStopped &&
    !diagnosis.action
  )
    await saveCachedFaq({
      question: text,
      answer: stripPatientAddress(diagnosis.outbound, displayName),
      intent: diagnosis.intent,
      knowledgeDocId: diagnosis.knowledge?.id,
      knowledgeVersion: diagnosis.knowledge?.version,
    }).catch(() => undefined);

  const wantsNewTime = wantsDifferentTime(text);
  const currentPreference = parseSlotPreference(
    additionalBooking ?? text,
    simple ? diagnosis.entities : {},
    now,
  );
  const partyPreference = partyId
    ? parseSlotPreference(
        bookingParty(conversation.bookingParty)?.original ?? "",
        {},
        now,
      )
    : {};
  const preference = simple
    ? {
        ...(partyId
          ? {
              startMinute: partyPreference.startMinute,
              endMinute: partyPreference.endMinute,
            }
          : {}),
        ...(!currentPreference.date
          ? parseSlotPreference(fixture.intake?.availabilityNotes ?? "", {}, now)
          : {}),
        ...currentPreference,
      }
    : parseSlotPreference(
        [text, fixture.intake?.availabilityNotes].filter(Boolean).join(" "),
        diagnosis.entities,
        now,
      );
  const namedSlot = Boolean(currentPreference.date || currentPreference.startMinute);
  const intakeComplete = Boolean(
    conversation.sessionModeConfirmed &&
    fixture.intake?.hasFullName &&
    fixture.intake.age != null &&
    fixture.intake.hasTherapyHistory != null &&
    fixture.intake.availabilityNotes,
  );
  const explicitlyRequestsAvailability =
    (Boolean(defaultTherapist && fixture.intake?.availabilityNotes) &&
      isAvailabilityConstraintReply(text)) ||
    wantsNewTime ||
    namedSlot ||
    /\b(uygun|musait|müsait|bos|boş)\b.{0,24}\b(saat|gun|gün|zaman)|\b(saat|gun|gün|zaman)\b.{0,24}\b(uygun|musait|müsait|bos|boş)/i.test(
      text,
    );
  const answeringInformationQuestion = Boolean(
    (diagnosis.raw as { questionAnswer?: string } | null)?.questionAnswer?.trim() ||
    diagnosis.routing?.some((r) =>
      ["THERAPIST_INFO", "CLINIC_INFO", "THERAPY_INFO"].includes(r.kind),
    ),
  );
  if (
    !diagnosis.serviceFailure &&
    !answeringInformationQuestion &&
    !["CANCEL", "CONFIRM", "HUMAN_REQUEST", "THERAPIST_CHANGE", "INVOICE_REQUEST", "PRICE_REQUEST"].includes(diagnosis.intent) &&
    !simplePlan?.timeQuestion &&
    !simplePlan?.availabilityExplanation &&
    !simplePlan?.conversationalReply &&
    !(simple && (appointments.length > 1 || simplePlan?.identityBlocked)) &&
    (diagnosis.intent === "NEW_BOOKING" ||
      diagnosis.intent === "RESCHEDULE" ||
      (diagnosis.intent === "UNKNOWN" && !appointments.length)) &&
    (diagnosis.action ||
      wantsNewTime ||
      namedSlot ||
      (diagnosis.intent === "NEW_BOOKING" && intakeComplete && !freshOffer)) &&
    !diagnosis.botStopped &&
    !pending &&
    (explicitlyRequestsAvailability ||
      (diagnosis.intent === "NEW_BOOKING" && intakeComplete && !freshOffer)) &&
    (appointments.length > 0 || intakeComplete) &&
    defaultTherapist
  ) {
    const workingHours = await prisma.therapistWorkingBlock.findMany({
      where: { therapistId: defaultTherapist.id },
    });
    try {
      const calendarConnected = await hasCalendarConnection(defaultTherapist.userId);
      if (!calendarConnected) throw new Error("Calendar unavailable");
      const calendarBusy = calendarConnected
        ? await getCalendar().listBusy({
            ownerUserId: defaultTherapist.userId,
            from: now,
            to: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
          })
        : [];
      const dbBusy = (
        await prisma.appointment.findMany({
          where: {
            therapistId: defaultTherapist.id,
            status: { in: ["SCHEDULED", "CONFIRMED"] },
            startAt: { gte: now },
          },
        })
      ).map((item) => ({ startAt: item.startAt, endAt: item.endAt }));
      if (partyId)
        dbBusy.push(
          ...(await partyReservedSlots(conversation.id, patient.id)).filter(
            (b) => b.therapistId === defaultTherapist.id,
          ),
        );
      let slots = proposePreferredSlots({
        now,
        workingHours: effectiveWorkingHours(workingHours),
        busy: [...calendarBusy, ...dbBusy],
        preference,
      });
      if (
        partyId &&
        preference.startMinute != null &&
        preference.endMinute != null &&
        preference.endMinute - preference.startMinute > 60
      ) {
        slots = slots.filter((slot) => {
          const parts = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Europe/Istanbul",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          })
            .format(slot)
            .split(":")
            .map(Number);
          const minute = parts[0] * 60 + parts[1];
          return (
            minute >= preference.startMinute! &&
            minute + SESSION_MINUTES <= preference.endMinute!
          );
        });
      }
      if (
        simple &&
        fixture.intake?.alternativeDaysOkay === true &&
        preference.date &&
        slots[0] &&
        istanbulDay(slots[0]) !== preference.date
      ) {
        slots = proposePreferredSlots({
          now,
          workingHours: effectiveWorkingHours(workingHours),
          busy: [...calendarBusy, ...dbBusy],
          preference: {
            startMinute: preference.startMinute,
            endMinute: preference.endMinute,
          },
        });
      }
      const requestedStart =
        preference.date && preference.startMinute != null
          ? new Date(
              `${preference.date}T${String(Math.floor(preference.startMinute / 60)).padStart(2, "0")}:${String(preference.startMinute % 60).padStart(2, "0")}:00+03:00`,
            )
          : null;
      const requestedEnd = requestedStart
        ? new Date(requestedStart.getTime() + SESSION_MINUTES * 60000)
        : null;
      const requestedBusy = Boolean(
        requestedStart &&
        requestedEnd &&
        [...calendarBusy, ...dbBusy].some(
          (b) => b.startAt < requestedEnd && b.endAt > requestedStart,
        ),
      );
      await prisma.auditEvent.create({
        data: {
          action: "assistant.calendar_check",
          entityType: "Message",
          entityId: inboundMessage.id,
          metadata: {
            requestedStart: requestedStart?.toISOString() ?? null,
            requestedBusy,
            checked: true,
            offeredSlots: slots.map((slot) => slot.toISOString()),
            source: "google-and-appointments",
          },
        },
      });
      const offer = decideSlotOffer({
        slots,
        preference,
        now,
        calendarConnected,
        alternativeDaysOkay: fixture.intake?.alternativeDaysOkay,
        workingHours,
        requestedStart,
        requestedBusy,
        simple,
      });
      if (offer.kind === "requested_day_full") {
        diagnosis = {
          ...diagnosis,
          outbound: offer.outbound,
          action: null,
          rules: [...diagnosis.rules, offer.rule],
        };
      } else if (offer.kind === "offer") {
        diagnosis = {
          ...diagnosis,
          outbound: offer.outbound,
          entities: { ...diagnosis.entities, date: offer.slotDate },
          offeredSlots: offer.offeredSlots,
          offeredTherapistId: defaultTherapist.id,
          action: null,
          rules: [...diagnosis.rules, offer.rule],
        };
      } else {
        diagnosis = {
          ...diagnosis,
          action: null,
          botStopped: true,
          outbound: offer.outbound,
          handoff: { reason: offer.handoffReason },
        };
      }
    } catch (error) {
      diagnosis = {
        ...diagnosis,
        action: null,
        botStopped: true,
        outbound: CALENDAR_FAILURE_REPLY,
        handoff: { reason: calendarFailureHandoffReason(error) },
      };
    }
  }

  if (
    simplePlan?.information.length &&
    !diagnosis.outbound.startsWith(simplePlan.information.join("\n\n"))
  )
    diagnosis.outbound = `${simplePlan.information.join("\n\n")}\n\n${diagnosis.outbound}`;
  diagnosis = polish(diagnosis, displayName);
  const actionId = await persistAction({
    diagnosis,
    conversationId: conversation.id,
    patientId: patient.id,
    appointments,
    defaultTherapistId: defaultTherapist?.id ?? null,
  });
  await persistOutbound(conversation.id, inboundMessage.id, diagnosis);
  if (actionId && diagnosis.action) {
    diagnosis = { ...diagnosis, action: { ...diagnosis.action, id: actionId } };
  }
  if (diagnosis.botStopped) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        mode: "HUMAN",
        handoffReason: diagnosis.handoff?.reason ?? "Çalışana aktarıldı",
      },
    });
  }
  return finish({
    diagnosis,
    conversationId: conversation.id,
    patientId: patient.id,
    actionId,
    hasAppointment,
  });
}

function polish(
  diagnosis: SimulationDiagnosis,
  displayName: string,
): SimulationDiagnosis {
  return { ...diagnosis, outbound: finalizeOutbound(diagnosis.outbound, displayName) };
}

function stripPatientAddress(reply: string, displayName: string) {
  const first = displayName.trim().split(/\s+/)[0];
  if (!first || first.length < 2) return reply.trim();
  const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return reply
    .replace(
      new RegExp(
        `^(Merhaba|Selamlar|Selam)\\s+${escaped}(?:\\s+(Hanım|Bey))?[,.:;!]?\\s*`,
        "iu",
      ),
      "",
    )
    .replace(new RegExp(`\\b${escaped}\\s+(Hanım|Bey)\\b[,.:;!]?`, "giu"), "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function finish(input: {
  diagnosis: SimulationDiagnosis;
  conversationId: string;
  patientId: string;
  actionId: string | null;
  hasAppointment: boolean;
}): InboundResult {
  const raw = input.diagnosis.raw as { conversationClosing?: boolean } | null;
  return {
    diagnosis: input.diagnosis,
    conversationId: input.conversationId,
    patientId: input.patientId,
    actionId: input.actionId,
    quickReplies: raw?.conversationClosing
      ? []
      : quickRepliesFor({
          outbound: input.diagnosis.outbound,
          intent: input.diagnosis.intent,
          hasAppointment: input.hasAppointment,
          botStopped: input.diagnosis.botStopped,
        }),
  };
}

async function saveOutbound(
  conversationId: string,
  inboundMessageId: string,
  diagnosis: SimulationDiagnosis,
) {
  await prisma.$transaction(async (tx) => {
    if (await tx.intentDecision.findUnique({ where: { messageId: inboundMessageId } }))
      return;
    const conversation = await tx.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: { patient: true },
    });
    if (conversation.mode === "HUMAN") return;
    const pendingBooking = await tx.actionRequest.findFirst({
      where: {
        conversationId,
        type: "NEW_BOOKING",
        status: "PENDING",
        ...(partyPatientId(conversation.bookingParty)
          ? {
              proposedChanges: {
                path: ["patientId"],
                equals: partyPatientId(conversation.bookingParty),
              },
            }
          : {}),
      },
    });
    const flowPatient = partyPatientId(conversation.bookingParty)
      ? await tx.patient.findUniqueOrThrow({
          where: { id: partyPatientId(conversation.bookingParty) },
        })
      : conversation.patient;
    const requested =
      diagnosis.intent === "NEW_BOOKING" ||
      diagnosis.routing?.some((r) => r.kind === "NEW_BOOKING") ||
      conversation.bookingStage !== "GREETING";
    const flow = bookingFlow({
      requested,
      intake: {
        hasFullName: hasFullPatientName(flowPatient.displayName),
        givenName: /yeni hasta/i.test(flowPatient.displayName)
          ? undefined
          : flowPatient.displayName,
        sessionModeConfirmed: conversation.sessionModeConfirmed,
        age: flowPatient.age,
        hasTherapyHistory: flowPatient.hasTherapyHistory,
        availabilityNotes: flowPatient.availabilityNotes,
      },
      therapistSelected: Boolean(conversation.preferredTherapistId),
      pendingApproval: Boolean(pendingBooking),
      slotsOffered: diagnosis.offeredSlots
        ? diagnosis.offeredSlots.length > 0
        : Boolean(
            conversation.offeredAt &&
            isFreshTimestamp(conversation.offeredAt, new Date()) &&
            conversation.offeredSlots.length &&
            conversation.offeredTherapistId === conversation.preferredTherapistId,
          ),
      confirmed:
        conversation.bookingStage === "CONFIRMED" && diagnosis.intent !== "NEW_BOOKING",
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        bookingStage: flow.stage,
        ...(diagnosis.offeredSlots
          ? {
              offeredSlots: diagnosis.offeredSlots,
              offeredAt: new Date(),
              offeredTherapistId: diagnosis.offeredTherapistId,
            }
          : {}),
      },
    });
    const outboundMessage = await tx.message.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        authorKind: "BOT",
        text: diagnosis.outbound,
      },
    });
    await tx.auditEvent.create({
      data: {
        action: "assistant.decision",
        entityType: "Message",
        entityId: inboundMessageId,
        metadata: JSON.parse(
          JSON.stringify({
            outboundMessageId: outboundMessage.id,
            finalReply: diagnosis.outbound,
            promptVersion: diagnosis.promptVersion,
            ruleVersion: simpleFlowEnabled()
              ? SIMPLE_FLOW_VERSION
              : "2026-10-07-router-v1",
            flow: simpleFlowEnabled() ? "simple" : "legacy",
            knowledgeSources: simpleFlowEnabled()
              ? (diagnosis.raw as { sources?: unknown } | null)?.sources
              : undefined,
            routing: diagnosis.routing,
            serviceFailure: diagnosis.serviceFailure,
            model: diagnosis.model,
            rules: diagnosis.rules,
            source: diagnosis.knowledge,
            grounding: diagnosis.grounding,
            contentSafety: diagnosis.contentSafety,
            handoff: diagnosis.handoff,
            handoffCategory: handoffCategory(diagnosis),
            intent: diagnosis.intent,
            confidence: diagnosis.confidence,
            confidenceMeaning: simpleFlowEnabled()
              ? "code_route_not_probability"
              : "uncalibrated_model_score",
          }),
        ),
      },
    });
    await tx.intentDecision.create({
      data: {
        messageId: inboundMessageId,
        intent: diagnosis.serviceFailure
          ? "MODEL_UNAVAILABLE"
          : diagnosis.promptVersion?.startsWith("scope-")
            ? "SCOPE_GUARD"
            : diagnosis.intent,
        confidence: diagnosis.confidence,
        extractedEntities: diagnosis.entities,
        modelVersion: diagnosis.model ?? "intent-v3",
      },
    });
  });
}

async function saveAction(input: Parameters<typeof saveSingleAction>[0]) {
  const primaryId = await saveSingleAction(input);
  for (const action of input.diagnosis.additionalActions ?? []) {
    // Secondary writes are limited to administrative queue requests. Calendar
    // mutations remain exclusively behind the existing primary action checks.
    if (!["PRICE_REQUEST", "INVOICE_REQUEST"].includes(action.type)) continue;
    const id = await saveSingleAction({
      ...input,
      diagnosis: {
        ...input.diagnosis,
        intent: action.type,
        action,
        additionalActions: [],
      },
    });
    if (id) action.id = id;
  }
  return primaryId;
}

async function saveSingleAction(input: {
  diagnosis: SimulationDiagnosis;
  conversationId: string;
  patientId: string;
  appointments: Array<{ id: string; therapistId: string }>;
  defaultTherapistId: string | null;
}) {
  const { diagnosis } = input;
  const primary = input.appointments[0];
  if (
    diagnosis.action &&
    ["NEW_BOOKING", "RESCHEDULE", "CONFIRM"].includes(diagnosis.intent)
  ) {
    const profile = await prisma.patient.findUniqueOrThrow({
      where: { id: input.patientId },
    });
    const missing = missingBookingProfile(profile);
    if (missing.length) {
      diagnosis.action = null;
      diagnosis.outbound = `Randevuyu kesinleştirmeden önce ${missing[0]} bilgisini tamamlamamız gerekiyor. Paylaşır mısınız?`;
      diagnosis.rules.push("Eksik profil nedeniyle işlem engellendi.");
      return null;
    }
  }
  if (
    (diagnosis.intent === "PRICE_REQUEST" || diagnosis.intent === "INVOICE_REQUEST") &&
    diagnosis.action
  ) {
    const existing = await prisma.actionRequest.findFirst({
      where: {
        conversationId: input.conversationId,
        type: diagnosis.intent,
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing.id;
    const created = await prisma.actionRequest.create({
      data: {
        type: diagnosis.intent,
        // This list contains upcoming/recent active bookings, not necessarily
        // the attended session being invoiced. Staff resolves it from the
        // linked conversation rather than attaching an unrelated next booking.
        appointmentId: diagnosis.intent === "INVOICE_REQUEST" ? undefined : primary?.id,
        conversationId: input.conversationId,
        status: "PENDING",
        requestedBy: "patient",
        proposedChanges: { operationalSummary: diagnosis.action.proposedLabel },
      },
    });
    return created.id;
  }
  if (diagnosis.intent === "CANCEL" && primary && diagnosis.action) {
    const created = await getActionRequestService().applyIncomingCancel({
      appointmentId: primary.id,
      conversationId: input.conversationId,
      requestedBy: "patient",
    });
    return created.id;
  }
  if (diagnosis.intent === "CONFIRM" && primary && diagnosis.action) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Patient" WHERE id = ${input.patientId} FOR UPDATE`;
      const patient = await tx.patient.findUniqueOrThrow({
        where: { id: input.patientId },
      });
      const missing = missingBookingProfile(patient);
      if (missing.length) {
        diagnosis.action = null;
        diagnosis.outbound = `Randevuyu kesinleştirmeden önce ${missing[0]} bilgisini tamamlamamız gerekiyor. Paylaşır mısınız?`;
        return null;
      }
      const changed = await tx.appointment.updateMany({
        where: {
          id: primary.id,
          patientId: patient.id,
          status: { in: ["SCHEDULED", "CONFIRMED"] },
        },
        data: { status: "CONFIRMED", version: { increment: 1 } },
      });
      if (!changed.count) {
        diagnosis.action = null;
        diagnosis.outbound =
          "Randevu kaydı değişmiş. Ekibimizin kontrol etmesi gerekiyor.";
        return null;
      }
      const created = await tx.actionRequest.create({
        data: {
          type: "CONFIRM",
          appointmentId: primary.id,
          conversationId: input.conversationId,
          status: "AUTO_APPLIED",
          requestedBy: "patient",
          proposedChanges: { operationalSummary: "Randevu teyit edildi." },
        },
      });
      return created.id;
    });
  }

  if (
    (diagnosis.intent === "RESCHEDULE" || diagnosis.intent === "NEW_BOOKING") &&
    diagnosis.action
  ) {
    const slotStart = (diagnosis as SimulationDiagnosis & { slotStart?: string })
      .slotStart;
    const startAt = slotStart ? new Date(slotStart) : undefined;
    const endAt = startAt
      ? new Date(startAt.getTime() + SESSION_MINUTES * 60 * 1000)
      : undefined;
    const currentAppointment =
      diagnosis.intent === "RESCHEDULE" && primary
        ? await prisma.appointment.findUniqueOrThrow({ where: { id: primary.id } })
        : null;
    const bookingConversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: input.conversationId },
    });
    const proposedChanges = {
      sessionMode: currentAppointment?.sessionMode ?? bookingConversation.sessionMode,
      ...(currentAppointment ? { appointmentVersion: currentAppointment.version } : {}),
      patientId: input.patientId,
      startAt: startAt?.toISOString(),
      endAt: endAt?.toISOString(),
      therapistId: primary?.therapistId ?? input.defaultTherapistId,
      operationalSummary: diagnosis.action.proposedLabel,
    };
    const existing = await prisma.actionRequest.findFirst({
      where: {
        conversationId: input.conversationId,
        type: diagnosis.intent,
        status: "PENDING",
        OR: [
          { proposedChanges: { path: ["patientId"], equals: input.patientId } },
          {
            proposedChanges: { path: ["patientId"], equals: Prisma.DbNull },
            conversation: {
              patientId: input.patientId,
              bookingParty: { equals: Prisma.DbNull },
            },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      await prisma.actionRequest.update({
        where: { id: existing.id },
        data: { proposedChanges },
      });
      return existing.id;
    }
    const created = await prisma.actionRequest.create({
      data: {
        type: diagnosis.intent,
        appointmentId: diagnosis.intent === "RESCHEDULE" ? primary?.id : undefined,
        conversationId: input.conversationId,
        status: "PENDING",
        requestedBy: "patient",
        proposedChanges,
      },
    });
    return created.id;
  }
  return null;
}
