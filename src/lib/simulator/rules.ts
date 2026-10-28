import { asksPersonalSuitability } from "@/lib/conversation/personal-suitability";
import { routeRequests, type RouteTrace } from "@/lib/conversation/request-router";
import { therapistInformation } from "@/lib/conversation/therapist-information";
import {
  buildClinicClarification,
  isBroadClinicQuestion,
} from "@/lib/conversation/clinic-clarification";
import { bookingFlow } from "@/lib/conversation/booking-flow";
import { demoServiceAnswer } from "@/lib/demo/knowledge";
import {
  BOOKING_ACKNOWLEDGEMENT,
  SLOT_SELECTION_CLARIFICATION,
  AGE_REQUEST_EXPLANATION,
  asksWhyAgeIsNeeded,
  CALENDAR_UNAVAILABLE_REPLY,
  INVOICE_REQUEST_REPLY,
  PRICE_REQUEST_REPLY,
  PRICE_REQUEST_MEDICATION_REPLY,
  RESCHEDULE_ACKNOWLEDGEMENT,
} from "@/lib/conversation/administrative-replies";
import { classifyCancel } from "@/lib/queue/rules";
import {
  CONFIDENCE_THRESHOLD,
  PROMPT_VERSION,
  type AssistantIntent,
  type KnowledgeSnippet,
  type LlmCompleteResult,
  type LlmTurn,
} from "@/lib/llm/types";
import {
  identityQuestion,
  shouldAskWhoTheAppointmentIsFor,
} from "@/lib/patients/identity";
import { ABUSE_REPLY } from "@/lib/conversation/guardrails";
import {
  FALLBACK_OPTIONS,
  UNKNOWN_HANDOFF_AFTER,
  intakeAcknowledgement,
} from "@/lib/conversation/style";
import { introducedName } from "@/lib/simulator/scope";

export type SimulatedAction = {
  id: string;
  type:
    | "CONFIRM"
    | "CANCEL"
    | "RESCHEDULE"
    | "NEW_BOOKING"
    | "PRICE_REQUEST"
    | "INVOICE_REQUEST";
  status: "PENDING" | "AUTO_APPLIED";
  currentLabel: string;
  proposedLabel: string;
  therapistName: string;
} | null;

export type SimulationDiagnosis = {
  id: string;
  inbound: string;
  outbound: string;
  createdAt: string;
  intent: AssistantIntent;
  intentLabel: string;
  confidence: number;
  entities: LlmTurn["entities"];
  knowledge: { id: string; title: string; source: string; version: number } | null;
  action: SimulatedAction;
  additionalActions?: NonNullable<SimulatedAction>[];
  routing?: RouteTrace[];
  serviceFailure?: import("@/lib/llm/failure").ModelFailure;
  handoff: { reason: string } | null;
  botStopped: boolean;
  rules: string[];
  raw: unknown;
  offeredSlots?: string[];
  offeredTherapistId?: string;
  contentSafety?: import("@/lib/llm/content-safety").ContentSafetyCheck;
  grounding?: import("@/lib/llm/grounding").GroundingResult;
  latencyMs: number | null;
  model: string | null;
  promptVersion: string | null;
  provider: "openai" | "fake";
};

export function buildScopeGuardDiagnosis(input: {
  inbound: string;
  now: Date;
  model: string;
  greeting: boolean;
  reason?: string;
}): SimulationDiagnosis {
  const name = input.greeting ? introducedName(input.inbound) : null;
  const outbound = input.greeting
    ? name
      ? `Merhaba ${name}, size nasıl yardımcı olabiliriz? ${FALLBACK_OPTIONS}`
      : `Merhaba, size nasıl yardımcı olabiliriz? ${FALLBACK_OPTIONS}`
    : "Bu konuda yardımcı olamıyorum; ancak psikoloji, terapi süreçleri, uzman seçimi ve randevular hakkında konuşabiliriz. Bunlardan hangisinde destek istersiniz?";
  return {
    id: `scope_${Date.now().toString(36)}`,
    inbound: input.inbound,
    outbound,
    createdAt: input.now.toISOString(),
    intent: "UNKNOWN",
    intentLabel: "Klinik kapsamı dışında",
    confidence: 1,
    entities: {},
    knowledge: null,
    action: null,
    handoff: null,
    botStopped: false,
    rules: [
      "Kapsam kapısı: klinik dışı mesajda LLM çağrısı yapılmadı.",
      ...(input.reason ? [`Gerekçe: ${input.reason}.`] : []),
    ],
    raw: {
      scope: input.greeting ? "GREETING" : "OUT_OF_SCOPE",
      reason: input.reason ?? null,
    },
    latencyMs: 0,
    model: input.model,
    promptVersion: "scope-gate-v1",
    provider: "openai",
  };
}

export function buildHumanRequestDiagnosis(input: {
  inbound: string;
  now: Date;
  model: string;
}): SimulationDiagnosis {
  return {
    id: `human_${Date.now().toString(36)}`,
    inbound: input.inbound,
    outbound: "Sizi bir çalışanımızla görüştürmek üzere ekibe iletiyorum.",
    createdAt: input.now.toISOString(),
    intent: "HUMAN_REQUEST",
    intentLabel: intentLabel("HUMAN_REQUEST"),
    confidence: 1,
    entities: {},
    knowledge: null,
    action: null,
    handoff: { reason: "Hasta çalışanla görüşmek istedi." },
    botStopped: true,
    rules: ["Hasta açıkça çalışanla konuşmak istiyorsa devir başlar — §5.5."],
    raw: { humanRequest: true },
    latencyMs: 0,
    model: input.model,
    promptVersion: "handoff-v1",
    provider: "openai",
  };
}

export function buildAbuseDiagnosis(input: {
  inbound: string;
  now: Date;
  model: string;
}): SimulationDiagnosis {
  return {
    id: `abuse_${Date.now().toString(36)}`,
    inbound: input.inbound,
    outbound: ABUSE_REPLY,
    createdAt: input.now.toISOString(),
    intent: "UNKNOWN",
    intentLabel: "Üslup uyarısı",
    confidence: 1,
    entities: {},
    knowledge: null,
    action: null,
    handoff: null,
    botStopped: false,
    rules: ["Hakaret veya argo algılandı; işlem yapılmadı."],
    raw: { abuse: true },
    latencyMs: 0,
    model: input.model,
    promptVersion: "guardrail-v1",
    provider: "openai",
  };
}

export function buildConversationClosingDiagnosis(input: {
  inbound: string;
  now: Date;
  model: string;
}): SimulationDiagnosis {
  return {
    id: `closing_${Date.now().toString(36)}`,
    inbound: input.inbound,
    outbound: "Rica ederim. Görüşmek üzere.",
    createdAt: input.now.toISOString(),
    intent: "UNKNOWN",
    intentLabel: "Konuşma tamamlandı",
    confidence: 1,
    entities: {},
    knowledge: null,
    action: null,
    handoff: null,
    botStopped: false,
    rules: [
      "Teşekkür veya kapanış mesajı kısa biçimde yanıtlandı; yeni soru ve saat önerisi eklenmedi.",
    ],
    raw: { conversationClosing: true },
    latencyMs: 0,
    model: input.model,
    promptVersion: "closing-v1",
    provider: "fake",
  };
}

export type FixtureAppointment = {
  id: string;
  patientName: string;
  therapistName: string;
  therapistId?: string;
  startAt: Date;
  endAt: Date;
};

export type SimulationFixture = {
  awaitingSlotSelection?: boolean;
  selectedTherapistName?: string | null;
  patients: Array<{ name: string; phone: string }>;
  appointments: FixtureAppointment[];
  intake?: {
    hasFullName: boolean;
    givenName?: string;
    sessionModeConfirmed?: boolean;
    age: number | null;
    hasTherapyHistory: boolean | null;
    availabilityNotes: string | null;
    alternativeDaysOkay: boolean | null;
    isExistingPatient?: boolean;
  };
};

export function intentLabel(intent: AssistantIntent): string {
  switch (intent) {
    case "CONFIRM":
      return "Randevu teyidi";
    case "CANCEL":
      return "İptal talebi";
    case "RESCHEDULE":
      return "Saat değişikliği";
    case "NEW_BOOKING":
      return "Yeni randevu";
    case "CLINIC_INFO":
      return "Klinik bilgisi";
    case "THERAPIST_INFO":
      return "Terapist bilgisi";
    case "THERAPY_INFO":
      return "Klinik / terapi bilgisi";
    case "HUMAN_REQUEST":
      return "Çalışanla görüşme";
    case "SENSITIVE_OR_EMERGENCY":
      return "Hassas / acil konu";
    case "THERAPIST_CHANGE":
      return "Terapist değişikliği";
    case "LATE_NOTICE":
      return "Gecikme notu";
    case "PRICE_REQUEST":
      return "Fiyat bilgisi talebi";
    case "INVOICE_REQUEST":
      return "Fatura talebi";
    default:
      return "Belirlenemedi";
  }
}

export function buildLateNoticeDiagnosis(input: {
  inbound: string;
  now: Date;
  model: string;
  minutes: number | null;
  status: "recorded" | "missing" | "ambiguous";
}): SimulationDiagnosis {
  const outbound =
    input.status === "recorded"
      ? input.minutes
        ? `Bilgilendirdiğiniz için teşekkür ederim. Yaklaşık ${input.minutes} dakika gecikeceğinizi bugünkü randevunuza not olarak ekledim.`
        : "Bilgilendirdiğiniz için teşekkür ederim. Gecikeceğinizi bugünkü randevunuza not olarak ekledim."
      : input.status === "ambiguous"
        ? "Bugün birden fazla randevu görünüyor. Gecikme notunu hangi saat ve kişi için eklememi istersiniz?"
        : "Gecikme notunu ekleyebileceğim bugüne ait aktif bir randevu bulamadım. Randevu saatinizi paylaşır mısınız?";
  return {
    id: `late_${Date.now().toString(36)}`,
    inbound: input.inbound,
    outbound,
    createdAt: input.now.toISOString(),
    intent: "LATE_NOTICE",
    intentLabel: intentLabel("LATE_NOTICE"),
    confidence: 1,
    entities: { time: null },
    knowledge: null,
    action: null,
    handoff: null,
    botStopped: false,
    rules: [
      input.status === "recorded"
        ? "Gecikme mesajı aynı günkü aktif randevuya operasyon notu olarak eklendi."
        : "Yanlış randevuya not eklememek için randevu netleştirmesi istendi.",
    ],
    raw: { lateNotice: true, minutes: input.minutes, status: input.status },
    latencyMs: 0,
    model: input.model,
    promptVersion: "late-notice-v1",
    provider: "openai",
  };
}

export function groundWeekdayInReply(
  reply: string,
  date: string | null | undefined,
  timeZone = "Europe/Istanbul",
): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return reply;
  }
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return reply;
  }
  const weekday = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    timeZone,
  }).format(parsed);
  const corrected = weekday.charAt(0).toLocaleUpperCase("tr-TR") + weekday.slice(1);
  return reply.replace(
    /(Cumartesi|Pazartesi|Çarşamba|Perşembe|Cuma|Salı|Pazar)/giu,
    corrected,
  );
}

function resolveClinicRules(input: {
  llm: LlmCompleteResult;
  inbound: string;
  fixture: SimulationFixture;
  now: Date;
  timeZone: string;
  calendarAvailable: boolean;
  knowledge: KnowledgeSnippet[];
  emergencyText?: string;
  unknownStreak?: number;
  strictKnowledge?: boolean;
}): SimulationDiagnosis {
  const {
    llm,
    inbound,
    fixture,
    now,
    timeZone,
    calendarAvailable,
    knowledge,
    emergencyText,
  } = input;
  const id = `sim_${Date.now().toString(36)}`;
  const createdAt = now.toISOString();
  const provider = llm.provider;
  const latencyMs = provider === "fake" ? null : llm.latencyMs;
  const model = provider === "fake" ? null : llm.model;
  const promptVersion = provider === "fake" ? null : PROMPT_VERSION;
  const groundedReply = groundWeekdayInReply(
    llm.turn.reply,
    llm.turn.entities.date,
    timeZone,
  );
  const base = {
    id,
    inbound,
    createdAt,
    raw: llm.turn,
    latencyMs,
    model,
    promptVersion,
    provider,
    knowledge: null as SimulationDiagnosis["knowledge"],
    action: null as SimulatedAction,
    handoff: null as SimulationDiagnosis["handoff"],
    botStopped: false,
    rules: [] as string[],
  };

  const sourceMatches = knowledge.filter((doc) => doc.source === llm.turn.knowledgeDocId);
  const matched =
    knowledge.find(
      (doc) =>
        doc.id === llm.turn.knowledgeDocId ||
        `${doc.id} v${doc.version}` === llm.turn.knowledgeDocId,
    ) ??
    (sourceMatches.length === 1 ? sourceMatches[0] : undefined) ??
    (input.strictKnowledge ? null : findKnowledgeMatch(inbound, knowledge));
  const primary = fixture.appointments[0];
  const twoPeople = fixture.patients.length > 1;

  if (llm.turn.intent === "SENSITIVE_OR_EMERGENCY") {
    return {
      ...base,
      outbound:
        emergencyText ??
        "Bu konuda otomatik danışmanlık veremiyorum. Konuşmanızı klinik ekibine aktarıyorum. Bu kanal acil yardım hizmeti değildir.",
      intent: llm.turn.intent,
      intentLabel: intentLabel(llm.turn.intent),
      confidence: llm.turn.confidence,
      entities: llm.turn.entities,
      handoff: { reason: "Hassas / acil içerik algılandı — asistan işlem yapmadı." },
      botStopped: true,
      rules: ["Asistan teşhis, tedavi, ilaç veya kriz önerisi vermez — kural 12."],
    };
  }

  if (llm.turn.confidence < CONFIDENCE_THRESHOLD || llm.turn.intent === "UNKNOWN") {
    return {
      ...base,
      outbound:
        (input.unknownStreak ?? 0) + 1 >= UNKNOWN_HANDOFF_AFTER
          ? "Talebinizi doğru anlayabilmemiz için sizi ekibimize aktarıyorum."
          : "Talebinizi biraz daha açıklayabilir misiniz? Randevu, iptal veya klinik bilgisi hakkında mı yazıyorsunuz?",
      intent: llm.turn.intent === "UNKNOWN" ? "UNKNOWN" : llm.turn.intent,
      intentLabel: intentLabel(
        llm.turn.intent === "UNKNOWN" ? "UNKNOWN" : llm.turn.intent,
      ),
      confidence: llm.turn.confidence,
      entities: llm.turn.entities,
      handoff:
        (input.unknownStreak ?? 0) + 1 >= UNKNOWN_HANDOFF_AFTER
          ? { reason: "İki ardışık belirsiz mesaj." }
          : null,
      botStopped: (input.unknownStreak ?? 0) + 1 >= UNKNOWN_HANDOFF_AFTER,
      rules: [
        "Belirsiz mesaj doğal bir takip sorusuyla netleştirilir; konuşma otomatik olarak sürdürülür.",
      ],
    };
  }

  if (
    llm.turn.intent === "NEW_BOOKING" &&
    !fixture.selectedTherapistName &&
    llm.turn.needsHandoff &&
    /ekibe|çalışan|terapist.*danış/i.test(llm.turn.handoffReason ?? "")
  ) {
    return {
      ...base,
      outbound: "Terapist seçimi için sizi ekibe aktarıyorum.",
      intent: llm.turn.intent,
      intentLabel: intentLabel(llm.turn.intent),
      confidence: llm.turn.confidence,
      entities: llm.turn.entities,
      handoff: { reason: "Terapist seçimi ekibe bırakıldı." },
      botStopped: true,
      rules: ["Seçim desteği; otomatik terapist atanmadı."],
    };
  }
  if (llm.turn.intent === "THERAPIST_CHANGE") {
    return {
      ...base,
      outbound:
        "Terapist değişikliği talebinizi ekibe ilettim. Bir çalışanımız sizinle iletişime geçecek.",
      intent: llm.turn.intent,
      intentLabel: intentLabel(llm.turn.intent),
      confidence: llm.turn.confidence,
      entities: llm.turn.entities,
      handoff: { reason: "Terapist değişikliği talebi — otomatik yapılmaz." },
      botStopped: true,
      rules: [
        "Terapist değişikliği otomatik yapılmaz — kural 3.",
        "Çalışan devraldığında otomatik yanıtlar durur — kural 10.",
      ],
    };
  }

  if (llm.turn.intent === "HUMAN_REQUEST") {
    return {
      ...base,
      outbound: "Sizi bir çalışanımızla görüştürmek üzere ekibe iletiyorum.",
      intent: llm.turn.intent,
      intentLabel: intentLabel(llm.turn.intent),
      confidence: llm.turn.confidence,
      entities: llm.turn.entities,
      handoff: { reason: "Hasta çalışanla görüşmek istedi." },
      botStopped: true,
      rules: ["Hasta açıkça çalışanla konuşmak istiyorsa devir başlar — §5.5."],
    };
  }

  if (llm.turn.intent === "PRICE_REQUEST" || llm.turn.intent === "INVOICE_REQUEST") {
    const price = llm.turn.intent === "PRICE_REQUEST";
    const operationalReply = price
      ? asksMedication(input.inbound)
        ? PRICE_REQUEST_MEDICATION_REPLY
        : PRICE_REQUEST_REPLY
      : INVOICE_REQUEST_REPLY;
    return {
      ...base,
      outbound: [
        price && /terapist|uzman|doktor/iu.test(inbound)
          ? llm.turn.questionAnswer?.trim()
          : undefined,
        operationalReply,
      ]
        .filter(Boolean)
        .join("\n\n"),
      intent: llm.turn.intent,
      intentLabel: intentLabel(llm.turn.intent),
      confidence: llm.turn.confidence,
      entities: llm.turn.entities,
      action: {
        id: `SIM-${id.slice(-4).toUpperCase()}`,
        type: llm.turn.intent,
        status: "PENDING",
        currentLabel: price ? "Güncel fiyat bilgisi isteniyor" : "Fatura talebi alındı",
        proposedLabel: price
          ? "Yetkili fiyat dönüşü bekliyor"
          : "Fatura ve ilgili randevu çalışan kontrolü bekliyor",
        therapistName: price
          ? (primary?.therapistName ?? "Santa Psikoloji")
          : "Santa Psikoloji",
      },
      rules: [
        price
          ? "Resmî kaynakta kesin tutar olmadığı için fiyat uydurulmadı; talep yetkili onayına alındı."
          : "Fatura talebi operasyon kuyruğuna alındı; hassas mali bilgi istenmedi.",
      ],
    };
  }

  if (
    llm.turn.intent === "CLINIC_INFO" ||
    llm.turn.intent === "THERAPIST_INFO" ||
    llm.turn.intent === "THERAPY_INFO"
  ) {
    if (!matched) {
      if (llm.turn.intent === "THERAPY_INFO") {
        return {
          ...base,
          outbound: groundedReply,
          intent: llm.turn.intent,
          intentLabel: intentLabel(llm.turn.intent),
          confidence: llm.turn.confidence,
          entities: llm.turn.entities,
          rules: [
            "Genel psikoeğitim yanıtı adayı oluşturuldu; içerik güvenliği kontrolü gerekiyor.",
            "İçerik güvenliği bu kural adımında henüz doğrulanmadı.",
          ],
        };
      }
      return {
        ...base,
        outbound:
          "Bu konuda onaylı bir klinik metnim yok. Sizi bir çalışanımıza aktarıyorum; uydurma bilgi vermiyorum.",
        intent: llm.turn.intent,
        intentLabel: intentLabel(llm.turn.intent),
        confidence: llm.turn.confidence,
        entities: llm.turn.entities,
        handoff: { reason: "Bilgi havuzunda yanıt yok." },
        botStopped: true,
        rules: [
          "Klinik içeriği yalnızca onaylı kaynaklardan yanıtlanır; yoksa uydurma yapılmaz — kural 11.",
        ],
      };
    }
    return {
      ...base,
      outbound: groundedReply,
      intent: llm.turn.intent,
      intentLabel: intentLabel(llm.turn.intent),
      confidence: llm.turn.confidence,
      entities: llm.turn.entities,
      knowledge: {
        id: matched.id,
        title: matched.title,
        source: matched.source,
        version: matched.version,
      },
      rules: [
        "Yanıt adayı onaylı kaynakla eşleştirildi; kaynak desteği ayrıca doğrulanacak.",
        "İçerik güvenliği bu kural adımında henüz doğrulanmadı.",
      ],
    };
  }

  if (llm.turn.intent === "CANCEL" && (twoPeople || fixture.appointments.length > 1)) {
    const [first, second] = fixture.appointments;
    return {
      ...base,
      outbound: `Bu numarada iki randevu görüyorum: ${labelAppointment(first)} ve ${labelAppointment(second)}. Hangisini iptal etmek istiyorsunuz?`,
      intent: llm.turn.intent,
      intentLabel: intentLabel(llm.turn.intent),
      confidence: llm.turn.confidence,
      entities: llm.turn.entities,
      rules: [
        "Bir numara birden fazla kişiye bağlı olabilir; randevu tarih, saat, terapist ve kişi adıyla netleştirilir — kural 2.",
      ],
    };
  }

  if (
    (llm.turn.intent === "NEW_BOOKING" ||
      llm.turn.intent === "CANCEL" ||
      llm.turn.intent === "RESCHEDULE") &&
    shouldAskWhoTheAppointmentIsFor({
      text: inbound,
      intent: llm.turn.intent,
      patients: fixture.patients,
    })
  ) {
    return {
      ...base,
      outbound: identityQuestion(fixture.patients),
      intent: llm.turn.intent,
      intentLabel: intentLabel(llm.turn.intent),
      confidence: llm.turn.confidence,
      entities: llm.turn.entities,
      rules: [
        "Telefon numarası tek başına hasta kimliği değildir; aynı numaraya bağlı kişilerden işlem sahibi netleştirilir.",
        "Kişi adı alınmadan randevu veya mevcut randevu işlemi uygulanmaz.",
      ],
    };
  }

  if (llm.turn.intent === "CANCEL" && primary) {
    const decision = classifyCancel(primary.startAt, now);
    if (decision === "no_show_review") {
      return {
        ...base,
        outbound:
          "Randevu saati geçmiş görünüyor. Otomatik iptal uygulamadım; ekibimiz kaydı inceleyecek.",
        intent: llm.turn.intent,
        intentLabel: intentLabel(llm.turn.intent),
        confidence: llm.turn.confidence,
        entities: llm.turn.entities,
        action: {
          id: `SIM-${id}`,
          type: "CANCEL",
          status: "PENDING",
          currentLabel: labelAppointment(primary),
          proposedLabel: "Saati geçmiş randevu incelemesi",
          therapistName: primary.therapistName,
        },
        handoff: { reason: "Randevu saati geçmiş — otomatik iptal yok." },
        botStopped: true,
        rules: ["Randevu saati geçmişse sistem otomatik iptal yapmaz — kural 8."],
      };
    }
    return {
      ...base,
      outbound: `${labelAppointment(primary)} randevunuz için iptal talebiniz ekibe iletildi. Onaylandığında size haber vereceğim.`,
      intent: llm.turn.intent,
      intentLabel: intentLabel(llm.turn.intent),
      confidence: llm.turn.confidence,
      entities: llm.turn.entities,
      action: {
        id: `SIM-${id.slice(-4).toUpperCase()}`,
        type: "CANCEL",
        status: "PENDING",
        currentLabel: labelAppointment(primary),
        proposedLabel: "Randevu iptal · yönetici onayı bekler",
        therapistName: primary.therapistName,
      },
      rules: [
        "Aynı gün dahil tüm iptaller yönetici onayı bekler — kural 5.",
        "Onaylandıktan sonra takvim güncellenir.",
      ],
    };
  }

  if (llm.turn.intent === "NEW_BOOKING") {
    const questionAnswer = asksWhyAgeIsNeeded(inbound)
      ? AGE_REQUEST_EXPLANATION
      : (demoServiceAnswer(inbound, fixture.selectedTherapistName, knowledge) ??
        llm.turn.questionAnswer?.trim());
    const flow = bookingFlow({
      requested: true,
      intake: fixture.intake,
      therapistSelected: Boolean(fixture.selectedTherapistName ?? primary?.therapistName),
    });
    if (flow.question)
      return {
        ...base,
        intent: llm.turn.intent,
        intentLabel: intentLabel(llm.turn.intent),
        confidence: llm.turn.confidence,
        entities: llm.turn.entities,
        outbound: [
          questionAnswer ||
            (/(?:nedir|ne demek|nasıl|anlatır|anlatabilir|hangi (?:doktor|uzman|terapist|hizmet))/iu.test(
              inbound,
            )
              ? groundedReply
              : intakeAcknowledgement(llm.turn.acknowledgement)),
          flow.question,
        ]
          .filter(Boolean)
          .join("\n\n"),
        rules: [
          `Randevu durum makinesi: ${flow.stage}. Bu aşama tamamlanmadan sonraki aşamaya geçilmez.`,
        ],
      };
    // Even a complete profile must not cause the calendar branch to erase
    // the answer to an explicit information question in the same message.
    if (questionAnswer)
      return {
        ...base,
        intent: llm.turn.intent,
        intentLabel: intentLabel(llm.turn.intent),
        confidence: llm.turn.confidence,
        entities: llm.turn.entities,
        outbound: questionAnswer,
        rules: [
          "Önce müşterinin bilgi sorusu yanıtlandı; kayıtlı randevu tercihleri korundu.",
        ],
      };
  }

  if (llm.turn.intent === "NEW_BOOKING" && fixture.awaitingSlotSelection) {
    return {
      ...base,
      outbound: SLOT_SELECTION_CLARIFICATION,
      intent: llm.turn.intent,
      intentLabel: intentLabel(llm.turn.intent),
      confidence: llm.turn.confidence,
      entities: llm.turn.entities,
      rules: [
        "Sunulan saatlerden seçim doğrulanamadı; onay talebi oluşturulmadan netleştirme istendi.",
      ],
    };
  }

  if (
    (llm.turn.intent === "RESCHEDULE" || llm.turn.intent === "NEW_BOOKING") &&
    !calendarAvailable
  ) {
    return {
      ...base,
      outbound: CALENDAR_UNAVAILABLE_REPLY,
      intent: llm.turn.intent,
      intentLabel: intentLabel(llm.turn.intent),
      confidence: llm.turn.confidence,
      entities: llm.turn.entities,
      handoff: { reason: "Google Calendar'a erişilemiyor — kesin saat önerilmedi." },
      botStopped: true,
      rules: [
        "Google Calendar erişimi yoksa hastaya kesin saat verilmez; çalışan bildirimi oluşur — §9.",
      ],
    };
  }

  if (llm.turn.intent === "CONFIRM" && primary) {
    return {
      ...base,
      outbound: "Teşekkürler, randevunuzu teyit ettim. Görüşmek üzere.",
      intent: llm.turn.intent,
      intentLabel: intentLabel(llm.turn.intent),
      confidence: llm.turn.confidence,
      entities: llm.turn.entities,
      action: {
        id: `SIM-${id.slice(-4).toUpperCase()}`,
        type: "CONFIRM",
        status: "AUTO_APPLIED",
        currentLabel: labelAppointment(primary),
        proposedLabel: "Teyit kaydı",
        therapistName: primary.therapistName,
      },
      rules: ["“Geleceğim” yanıtında randevu teyit edilir — §5.1."],
    };
  }

  if (llm.turn.intent === "RESCHEDULE" && primary) {
    return {
      ...base,
      outbound: RESCHEDULE_ACKNOWLEDGEMENT,
      intent: llm.turn.intent,
      intentLabel: intentLabel(llm.turn.intent),
      confidence: llm.turn.confidence,
      entities: llm.turn.entities,
      action: {
        id: `SIM-${id.slice(-4).toUpperCase()}`,
        type: "RESCHEDULE",
        status: "PENDING",
        currentLabel: labelAppointment(primary),
        proposedLabel: "Yeni saat önerisi · yönetici onayı bekler",
        therapistName: primary.therapistName,
      },
      rules: [
        "Yeni saat değişikliği yönetici onayı bekler — kural 4. Onaydan sonra takvim güncellenir.",
      ],
    };
  }

  if (llm.turn.intent === "NEW_BOOKING") {
    return {
      ...base,
      outbound: BOOKING_ACKNOWLEDGEMENT,
      intent: llm.turn.intent,
      intentLabel: intentLabel(llm.turn.intent),
      confidence: llm.turn.confidence,
      entities: llm.turn.entities,
      action: null,
      rules: [
        "Yeni randevu yönetici onayı bekler — kural 4. Onaydan sonra takvime yazılır.",
      ],
    };
  }

  return {
    ...base,
    outbound: groundedReply,
    intent: llm.turn.intent,
    intentLabel: intentLabel(llm.turn.intent),
    confidence: llm.turn.confidence,
    entities: llm.turn.entities,
    rules: ["Konuşma kaydı tutuldu."],
  };
}

export function applyClinicRules(input: Parameters<typeof resolveClinicRules>[0]) {
  if (
    isBroadClinicQuestion(input.inbound) &&
    !["HUMAN_REQUEST", "SENSITIVE_OR_EMERGENCY"].includes(input.llm.turn.intent)
  )
    return buildClinicClarification(input.inbound, input.now);
  const resolved =
    routeRequests(
      input.llm.turn,
      input.knowledge,
      (turn) =>
        resolveClinicRules({
          ...input,
          strictKnowledge: true,
          llm: { ...input.llm, turn },
        }),
      input.inbound,
    ) ?? resolveClinicRules(input);
  const selected = input.fixture.selectedTherapistName;
  if (
    selected &&
    input.knowledge.some(
      (doc) => doc.source === "demo-only" && doc.content.startsWith(`${selected},`),
    ) &&
    resolved.outbound
      .toLocaleLowerCase("tr-TR")
      .includes(selected.toLocaleLowerCase("tr-TR")) &&
    !/demo|test senaryosu/iu.test(resolved.outbound)
  ) {
    resolved.outbound = `Bu demo senaryosunda: ${resolved.outbound}`;
    resolved.rules.push(
      "Demo kişisinin hizmet bilgisi gerçek klinik yetkinliği olarak sunulmadı.",
    );
  }
  return applySafetyOverlay(resolved, input.inbound, input.knowledge);
}

export function buildSlotChoiceDiagnosis(input: {
  inbound: string;
  slot: Date;
  now: Date;
  hasAppointment: boolean;
  therapistName: string;
}) {
  const label = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(input.slot);
  const type = input.hasAppointment ? ("RESCHEDULE" as const) : ("NEW_BOOKING" as const);
  return {
    id: `slot_${input.now.getTime().toString(36)}`,
    inbound: input.inbound,
    outbound: `${label} için talebinizi ekibe ilettim. Onaylandığında size yazacağım.`,
    createdAt: input.now.toISOString(),
    intent: type,
    intentLabel: intentLabel(type),
    confidence: 1,
    entities: {
      date: input.slot.toISOString().slice(0, 10),
      time: new Intl.DateTimeFormat("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Istanbul",
      }).format(input.slot),
    },
    knowledge: null,
    action: {
      id: `SLOT-${input.now.getTime().toString(36).slice(-4).toUpperCase()}`,
      type,
      status: "PENDING" as const,
      currentLabel: input.hasAppointment ? "Mevcut randevu" : "Mevcut randevu yok",
      proposedLabel: label,
      therapistName: input.therapistName,
    },
    handoff: null,
    botStopped: false,
    rules: ["Önerilen saatlerden biri seçildi; talep onay kuyruğuna yazıldı."],
    raw: { slotStart: input.slot.toISOString() },
    latencyMs: 0,
    model: null,
    promptVersion: "slot-choice-v1",
    provider: "fake" as const,
  } satisfies SimulationDiagnosis;
}

function asksMedication(inbound: string) {
  return /ilaç|recete|reçete|\bdoz\b|antidepresan/.test(
    inbound.toLocaleLowerCase("tr-TR"),
  );
}

function asksFees(inbound: string) {
  return /ücret|ucret|\bfiyat\b/.test(inbound.toLocaleLowerCase("tr-TR"));
}

function knowledgeCoversFees(knowledge: KnowledgeSnippet[]) {
  return knowledge.some((doc) =>
    /ücret|ucret|fiyat|tl\b/.test(
      `${doc.title} ${doc.content}`.toLocaleLowerCase("tr-TR"),
    ),
  );
}

function stripInventedContacts(text: string) {
  return text
    .replace(/\b0\d{3}\s?\d{3}\s?\d{2}\s?\d{2}\b/g, "")
    .replace(/\b\+90\s?\d{3}\s?\d{3}\s?\d{2}\s?\d{2}\b/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function applySafetyOverlay(
  diagnosis: SimulationDiagnosis,
  inbound: string,
  knowledge: KnowledgeSnippet[],
): SimulationDiagnosis {
  if (diagnosis.intent === "SENSITIVE_OR_EMERGENCY") return diagnosis;
  if (asksPersonalSuitability(inbound)) {
    const therapistInfo = therapistInformation(inbound, knowledge);
    const ageGroup = inbound
      .toLocaleLowerCase("tr-TR")
      .match(/ergen|çocuk|cocuk|yetişkin/)?.[0];
    const relevantAge = (line: string) =>
      Boolean(
        ageGroup &&
        line.toLocaleLowerCase("tr-TR").includes(ageGroup) &&
        /\d+/.test(line) &&
        /yaş|yas/i.test(line) &&
        line.length <= 300,
      );
    const ageSource = knowledge.find((doc) =>
      doc.content.split(/[.\n]/).some(relevantAge),
    );
    const ageExcerpt = ageSource?.content.split(/[.\n]/).find(relevantAge)?.trim();
    return {
      ...diagnosis,
      knowledge: therapistInfo
        ? {
            id: therapistInfo.source.id,
            title: therapistInfo.source.title,
            source: therapistInfo.source.source,
            version: therapistInfo.source.version,
          }
        : ageSource
          ? {
              id: ageSource.id,
              title: ageSource.title,
              source: ageSource.source,
              version: ageSource.version,
            }
          : diagnosis.knowledge,
      outbound:
        (therapistInfo ? `${therapistInfo.answer}\n\n` : "") +
        (ageExcerpt ? `Onaylı genel bilgi: ${ageExcerpt}. ` : "") +
        "Size uygun terapi desteğini terapistimizle birlikte değerlendirebilirsiniz. Bu konuda yardımcı olmaları için talebinizi ekibimize iletiyorum.",
      action: null,
      additionalActions: [],
      handoff: { reason: "Kişisel uygunluk için terapiste danışılması gerekiyor." },
      botStopped: true,
      rules: [
        ...diagnosis.rules,
        "Asistan kişisel terapi veya uzman uygunluğu kararı vermedi; değerlendirmeyi uzmana bıraktı.",
      ],
    };
  }
  if (diagnosis.intent === "PRICE_REQUEST") return diagnosis;
  if (
    diagnosis.routing?.some((r) => r.kind === "PRICE_REQUEST") &&
    !asksMedication(inbound)
  )
    return diagnosis;
  const medication = asksMedication(inbound);
  const unsourcedFees = asksFees(inbound) && !knowledgeCoversFees(knowledge);
  if (!medication && !unsourcedFees) {
    return diagnosis;
  }
  if (
    unsourcedFees &&
    !medication &&
    !diagnosis.action &&
    !diagnosis.botStopped &&
    ["THERAPIST_INFO", "THERAPY_INFO", "CLINIC_INFO"].includes(diagnosis.intent)
  ) {
    return {
      ...diagnosis,
      outbound: `${diagnosis.outbound}\n\n${PRICE_REQUEST_REPLY}`,
      intent: "PRICE_REQUEST",
      intentLabel: intentLabel("PRICE_REQUEST"),
      action: {
        id: `SIM-${diagnosis.id.slice(-4).toUpperCase()}`,
        type: "PRICE_REQUEST",
        status: "PENDING",
        currentLabel: "Güncel fiyat bilgisi isteniyor",
        proposedLabel: "Yetkili fiyat dönüşü bekliyor",
        therapistName: "Santa Psikoloji",
      },
      rules: [
        ...diagnosis.rules,
        "Bilgi yanıtı korundu; ücret talebi ayrıca işlem kuyruğuna alındı. Yanıt güvenlik ve kaynak kontrolünden geçmelidir.",
      ],
    };
  }
  const disclaimer =
    "Ücret ve ilaç yazımı için onaylı bir klinik metnim yok. Çalışanımız size dönecek; bu konuda bilgi uydurmuyorum.";
  const cleaned = stripInventedContacts(diagnosis.outbound)
    .replace(/ilaç yazımı konusunda detaylı bilgi için[^.]*\./gi, "")
    .replace(/ücret bilgisi ve ilaç yazımı konusunda[^.]*\./gi, "")
    .trim();
  const scheduling = diagnosis.action
    ? cleaned
    : cleaned &&
        diagnosis.intent !== "CLINIC_INFO" &&
        diagnosis.intent !== "THERAPY_INFO" &&
        diagnosis.intent !== "THERAPIST_INFO"
      ? cleaned
      : "";
  return {
    ...diagnosis,
    outbound: [scheduling, disclaimer].filter(Boolean).join("\n\n"),
    handoff: diagnosis.handoff ?? {
      reason: "Ücret veya ilaç sorusu onaylı kaynakta yok.",
    },
    rules: [
      ...diagnosis.rules,
      "Onaylı kaynakta olmayan ücret/ilaç bilgisi uydurulmadı — kural 11–12.",
    ],
  };
}

function findKnowledgeMatch(inbound: string, knowledge: KnowledgeSnippet[]) {
  const text = inbound.toLocaleLowerCase("tr-TR");
  return (
    knowledge.find((doc) => {
      const title = doc.title.toLocaleLowerCase("tr-TR");
      const keywords = title
        .split(/\s+/)
        .filter(
          (word) => word.length > 3 && !["hakkında", "genel", "bilgi"].includes(word),
        );
      return keywords.some((keyword) => text.includes(keyword));
    }) ?? null
  );
}

function labelAppointment(appointment?: FixtureAppointment) {
  if (!appointment) {
    return "randevu";
  }
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(appointment.startAt);
}
