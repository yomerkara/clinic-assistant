import { additionalBookingText } from "./appointment-lookup";
import type { validateUnderstanding } from "@/lib/llm/understanding";
import { resolveTherapist } from "@/lib/patients/therapist-preference";
import { asksPersonalSuitability } from "./personal-suitability";
import { requestedServices } from "./service-requests";
import { approvedPolicy, policyAnswers } from "./approved-policies";
import { clinicInformation } from "./clinic-information";
import {
  asksNearbyFood,
  hasExplicitClinicQuestion,
  NEARBY_FOOD_REPLY,
} from "./nearby-information";
import type { KnowledgeSnippet, LlmCompleteResult, LlmTurn } from "@/lib/llm/types";
import type { SimulationDiagnosis, SimulationFixture } from "@/lib/simulator/rules";
import { bookingFlow, INTAKE_QUESTIONS } from "./booking-flow";
import { generalDefinition } from "./general-definitions";
import { therapistInformation } from "./therapist-information";
import { AGE_REQUEST_EXPLANATION, asksWhyAgeIsNeeded } from "./administrative-replies";
import {
  storedPatientName,
  shouldAskWhoTheAppointmentIsFor,
  identityQuestion,
} from "@/lib/patients/identity";
import {
  parseSlotPreference,
  normalizeClockWords,
  DEFAULT_WORKING_HOURS,
  SESSION_MINUTES,
  type WorkingBlock,
} from "@/lib/calendar/availability";

export const SIMPLE_FLOW_VERSION = "simple-flow-v5";
export const BOOKING_INVITATION =
  "Dilerseniz randevu oluşturabiliriz. Randevu almak ister misiniz?";
export const simpleFlowEnabled = () => process.env.CONVERSATION_FLOW === "simple";
const fold = (s: string) =>
  s
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");

// Only an explicit correction retracts the immediately preceding buffered message.
// An ambiguous standalone correction leaves persisted information untouched.
export function correctedBatch(text: string) {
  const lines: string[] = [];
  for (const line of text.split("\n").filter((s) => s.trim())) {
    if (/^(pardon|ozur).*yanlis oldu[.!\s]*$/.test(fold(line).trim())) lines.pop();
    else if (
      /^(?:pardon|hayir|duzeltme)\s+(?:saat\s*)?\d{1,2}(?:[:.]\d{2})?\s*(?:olsun)?[.!]*$/.test(
        fold(line).trim(),
      ) &&
      lines.length
    ) {
      const previous = lines.at(-1)!;
      const clock = line.match(/\d{1,2}(?:[:.]\d{2})?/)![0];
      if (/\d{1,2}/.test(previous))
        lines[lines.length - 1] = previous.replace(/\d{1,2}(?:[:.]\d{2})?/, clock);
      else lines.push(line);
    } else lines.push(line);
  }
  return lines.join("\n");
}
export type SimplePlan = {
  invitation: string | null;
  conversationalReply: string | null;
  closing: boolean;
  result: LlmCompleteResult;
  information: string[];
  sources: KnowledgeSnippet[];
  booking: boolean;
  suitability: boolean;
  needsAnswer: boolean;
  clarify: string | null;
  price: boolean;
  invoice: boolean;
  approvedPrice: string | null;
  priceTarget: string | null;
  identityBlocked: boolean;
  timeQuestion: string | null;
  availabilityExplanation: string | null;
};
export type SimpleInput = {
  text: string;
  now: Date;
  stage: string;
  lastReply: string;
  invitationAlreadySent?: boolean;
  fixture: SimulationFixture;
  roster: Array<{ displayName: string; workingHours?: WorkingBlock[] }>;
  knowledge: KnowledgeSnippet[];
  interpretation?: ReturnType<typeof validateUnderstanding>;
};

export function planSimpleFlow(input: SimpleInput): SimplePlan {
  const text = correctedBatch(input.text);
  const additionalBooking = additionalBookingText(text);
  const v = fold(text);
  const closing =
    (input.stage !== "GREETING" || /tesekkur|sag olun|gorusuruz|hosca/.test(v)) &&
    /tesekkur|sag olun|sagolun|iyi aksamlar|iyi gunler|iyi geceler|hosca|gorusuruz/.test(
      v,
    ) &&
    /^(?:(?:iyi aksamlar|iyi gunler|iyi geceler|tesekkur(?:ler| ederim| ederiz)|sag olun|sagolun|tamam|hosca kalin|hoscakal|gorusuruz)[\s,.!🌸]*)+$/.test(
      v.trim(),
    );
  const gameReply =
    "Oyun oynayamıyorum; klinik ve randevu konularında yardımcı olabilirim.";
  const game =
    /tas\s+kagit\s+makas|(?:oyun|satranc).{0,25}oynay/.test(v) ||
    (input.lastReply.includes(gameReply) &&
      /^(?:oynamayalim mi|neden|niye|hadi oynayalim)[?.!\s]*$/.test(v.trim()));
  // Do not let a greeting or unrelated game restart or mutate a pending booking.
  const conversationalReply = closing
    ? /iyi aksamlar/.test(v)
      ? "Rica ederiz, iyi akşamlar dileriz. 🌸"
      : "Rica ederiz, iyi günler dileriz. 🌸"
    : game && !/randevu|ucret|fiyat|fatura|emdr|adres|konum|yasim/.test(v)
      ? gameReply
      : null;
  const entities: LlmTurn["entities"] = {};
  const understood = input.interpretation;
  const hasIntent = (intent: string) =>
    understood?.intents.some((i) => i === intent) ?? false;
  const hasQuestion = (topic: string) =>
    understood?.questions.some((q) => q.topic === topic) ?? false;
  const field = (name: string) => understood?.fields.find((f) => f.name === name)?.value;

  const information: string[] = [];
  const sources: KnowledgeSnippet[] = [];
  const add = (answer: string, source?: KnowledgeSnippet) => {
    information.push(answer);
    if (source) sources.push(source);
  };
  const price =
    !requestedServices(text).some((kind) => kind === "REFUND" || kind === "PAYMENT") &&
    (hasIntent("PRICE_REQUEST") ||
      hasQuestion("PRICE_REQUEST") ||
      /ucret|fiyat|kac (?:tl|lira)|ne kadar (?:tut|ode)/.test(v));
  const invoice =
    /fatura/.test(v) && !/fatura.{0,25}(?:istemiyorum|gerek yok)|fatura isteme/.test(v);
  const affiliation =
    /(?:mi|mı|mu|mü)\s+çalışıyor|çalışıyor\s*(?:mu|mı)|kadronuzda|ekibinizde/iu.test(
      text,
    );
  const expertise =
    hasQuestion("THERAPIST_INFO") ||
    hasIntent("THERAPIST_INFO") ||
    affiliation ||
    /calisma alan|hangi alan|uzmanlik|terapistler|uzmanlar|hangi (?:doktor|terapist|uzman)|hizmetleri|tek danisman|kac (?:uzman|terapist)/.test(
      v,
    );
  const nearbyFood = asksNearbyFood(text);
  const availabilityQuestion =
    /(?:bugun|yarin|saat|gun).{0,40}(?:musait|uygun|bos)|(?:musait|uygun|bos).{0,20}(?:saat|gun)/.test(
      v,
    );
  const clinic =
    (!availabilityQuestion || hasExplicitClinicQuestion(text)) &&
    (!nearbyFood || hasExplicitClinicQuestion(text)) &&
    (hasQuestion("CLINIC_INFO") ||
      hasIntent("CLINIC_INFO") ||
      /santa(?: psikoloji)? (?:ile ilgili|hakkinda)|klinik (?:bilgisi|hakkinda)|klinig|adres|konum|harita|nerede|neresi|hangi gun ve saat.{0,20}(?:acik|calis)|calisma saat|kacta ac|kacta kapan/.test(
        v,
      ));
  const suitability = asksPersonalSuitability(text);
  const cancel = !additionalBooking && (
    /randevu.{0,60}(?:gelemedim|katilamadim|kacirdim)|(?:gelemedim|katilamadim).{0,40}randevu/.test(
      v,
    ) ||
    (/iptal (?:et(?:mek)?|edin|edilsin|edebilir[a-z]*|olsun|istiyorum)\b|randevumu iptal/.test(v) &&
      !/iptal (?:etme(?:yin)?(?:[.!?\s]|$)|etmek istemiyorum|istemiyorum)|nasil iptal|iptal (?:kural|kosul|politika)/.test(
        v,
      ))
  );
  const reschedule =
    /erte(le|si)|degistir|baska (?:gun|saat)|ayni saat|one al/.test(v) &&
    !/degistirme(?:[.!?\s]|$)|degistirmek istemiyorum/.test(v);
  const explicitBooking = Boolean(additionalBooking) ||
    /randevum kalsin.{0,70}(?:bir tane daha|bir daha|ikinci|randevu daha)|randevu (?:al|ist|olustur|ayarla)|randev[uı] (?:icin)|terapiye (?:baslamak|gel)|ilk defa (?:terapi|treapi)/.test(
      v,
    ) && !/randevu (?:almak istemiyorum|istemiyorum)|randevu alma\b/.test(v);
  const wantsMeeting =
    /(?:ile|beyle|hanimla).{0,90}(?:gorusmek|calismak) istiyorum/.test(v) &&
    !/gorusmek istemiyorum|calismak istemiyorum/.test(v);
  const acceptedInvitation =
    /^(?:(?:tabii?|evet|tamam)\s+)?(?:evet|olur|tamam|isterim)(?=[.!?,;\s]|$)/.test(
      v.trim(),
    ) &&
    !/istemiyorum|olmaz|olur mu|olursa/.test(v) &&
    input.lastReply.includes(BOOKING_INVITATION);
  const booking =
    !input.fixture.appointments.length &&
    (explicitBooking ||
      (hasIntent("NEW_BOOKING") &&
        !/randevu (?:almak istemiyorum|istemiyorum)|randevu alma\b|sadece bilgi/.test(
          v,
        )) ||
      wantsMeeting ||
      acceptedInvitation ||
      input.stage !== "GREETING");

  // Literal spans or replies to the exact code-owned question. No model guesses.
  const introduction = text.match(
    /(?:^|[^\p{L}])(?:benim adım|adım|ben)\s+([\p{L}]+(?:[ \t]+[\p{L}]+){0,3})/iu,
  )?.[1];
  const nameAnswer = input.lastReply.includes(INTAKE_QUESTIONS.name)
    ? text.replace(
        /^\s*(?:tabi(?:i)?\s*ki|tabii?|elbette|olur|evet)(?:\s*[,;:]\s*|\s+)/iu,
        "",
      )
    : text;
  const namePart = nameAnswer.split(/[,;\n]|\s+bu arada\b/iu)[0]!.trim();
  const standaloneName =
    input.lastReply.includes(INTAKE_QUESTIONS.name) &&
    !/klinik|bilgi|hakkinda|ucret|fiyat|fatura|merhaba|selam|neden|nasil|nedir|tesekkur|musait|uygun|hangi/.test(
      fold(namePart),
    ) &&
    /^[\p{L}]+(?:[ \t]+[\p{L}]+){1,3}[.!\s]*$/u.test(namePart)
      ? namePart.replace(/[.!]+$/, "")
      : null;
  const surname =
    input.lastReply.includes(INTAKE_QUESTIONS.surname) &&
    /^[\p{L}’'-]+(?: [\p{L}’'-]+)?[.!]*$/u.test(text.trim())
      ? `${input.fixture.intake?.givenName ?? ""} ${text.trim().replace(/[.!]+$/, "")}`
      : null;
  const name =
    surname ??
    introduction?.split(/\s+(?:bu arada|ama|ve|randevu|yaşındayım|istiyorum)\b/iu)[0] ??
    standaloneName;
  if (name && !/terapi|randevu|yonetici|istem|olmad|hayir|evet/.test(fold(name)))
    entities.patientName = storedPatientName(name);
  const age =
    text.match(/(?:^|\s)(\d{1,3})\s*yaş/iu)?.[1] ??
    text.match(/(?:^|\s)yaşım\s*[:：]?\s*(\d{1,3})(?=\s|[,.!?]|$)/iu)?.[1] ??
    (input.lastReply.includes(INTAKE_QUESTIONS.age)
      ? text.match(/^\s*(\d{1,3})(?=\s|[,.!?]|$)/)?.[1]
      : undefined);
  if (age && Number(age) <= 120 && !/degil/.test(v)) entities.age = Number(age);
  const askedHistory = input.lastReply.includes(INTAKE_QUESTIONS.therapyHistory);
  if (
    /daha once (?:hic )?terapi (?:almadim|gormedim|olmad)|hic terapi (?:almadim|gorme)|ilk (?:kez|defa) terapi/.test(
      v,
    ) ||
    (askedHistory && /^hayir(?:\b|\s)/.test(v.trim()))
  )
    entities.hasTherapyHistory = false;
  else if (
    /daha once terapi (?:aldim|gordum)/.test(v) ||
    (askedHistory && /^evet(?:\b|\s)/.test(v.trim()))
  )
    entities.hasTherapyHistory = true;

  // Model fields fill gaps; an explicit, evidenced correction may replace a
  // lexical extraction. Identity and required-profile guards still run below.
  const mayUse = (key: keyof typeof entities) =>
    entities[key] == null || understood?.corrections.some((c) => c.field === key);
  const modelName = field("patientName");
  if (typeof modelName === "string" && !entities.patientName && mayUse("patientName")) {
    const index = fold(text).indexOf(fold(modelName));
    if (index >= 0)
      entities.patientName = storedPatientName(
        text.slice(index, index + modelName.length),
      );
  }
  const modelAge = field("age");
  if (typeof modelAge === "number" && mayUse("age")) entities.age = modelAge;
  const modelHistory = field("hasTherapyHistory");
  if (typeof modelHistory === "boolean" && mayUse("hasTherapyHistory"))
    entities.hasTherapyHistory = modelHistory;

  // A patient's own surname can coincide with a clinician's; exclude the
  // explicit self-introduction before resolving the requested clinician.
  const preferenceText = name ? v.replace(fold(name), "") : v;
  const words: string[] = preferenceText.match(/[a-z]+/g) ?? [];
  const named = input.roster.filter((r) =>
    fold(r.displayName)
      .split(/\s+/)
      .some(
        (w) =>
          w.length > 2 &&
          !["yonetici", "test", "klinik", "psikolog", "danismani", "aile"].includes(w) &&
          words.includes(w),
      ),
  );
  const affirmative = named.filter(
    (r) =>
      !new RegExp(`${fold(r.displayName).split(" ")[0]}(?: hanim| bey)? degil`).test(v),
  );
  if (
    booking &&
    affirmative.length === 1 &&
    (!expertise ||
      explicitBooking ||
      /ile (?:gorus|calis)|tercih/.test(v) ||
      ((acceptedInvitation || /terapiye baslamak/.test(v)) &&
        /onerdi|tavsiye/.test(v) &&
        !/istemiyorum|istemem|degil/.test(v)))
  ) {
    entities.therapistName = affirmative[0]!.displayName;
    entities.therapistPreference = "SELECTED";
  }
  const modelTherapist = field("therapistName");
  const resolved =
    typeof modelTherapist === "string"
      ? resolveTherapist(modelTherapist, input.roster)
      : null;
  if (
    booking &&
    resolved &&
    (mayUse("therapistName") ||
      understood?.corrections.some((c) => c.field === "therapistName"))
  ) {
    entities.therapistName = resolved.displayName;
    entities.therapistPreference = "SELECTED";
  }
  const normalizedTimeText = normalizeClockWords((additionalBooking ?? text).replace(/yarın+/giu, "yarın"));
  let timeQuestion: string | null = null;
  const timeText = fold(normalizedTimeText);
  const clock =
    timeText.match(
      /(?:saat\s*|yarin\s+|bugun\s+|cuma\s+|cumartesi\s+|pazar\s+|sali\s+|carsamba\s+|persembe\s+|pazartesi\s+|ogleden sonra\s+|aksam\s+|sabah\s+)(\d{1,2})(?:[.:](\d{2}))?/,
    ) ??
    timeText.match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(?:musait|uygun|bos)/) ??
    (input.stage === "SLOT_SELECTION" && /^[4-9]$/.test(timeText.trim())
      ? [timeText, timeText.trim(), undefined]
      : null);
  const clarification = input.lastReply.match(/Saat (\d{2}:\d{2})'yı mı kastediyorsunuz/);
  if (
    clarification &&
    /^(?:evet|olur|tamam|ogleden sonra|aksam)[.!\s]*$/.test(timeText.trim())
  )
    entities.time = clarification[1];
  if (clock && Number(clock[1]) < 24 && Number(clock[2] ?? 0) < 60) {
    let hour = Number(clock[1]);
    const pm = /ogleden sonra|aksam|sabahtan? calis|sabah(?:tan)? (?:calis|iste)/.test(
      timeText,
    );
    const am = !pm && /sabah|gece/.test(timeText);
    if (hour > 0 && hour < 12 && pm) hour += 12;
    else if (hour > 0 && hour < 12 && !am && !clock[2] && !clock[1].startsWith("0")) {
      const selected = input.roster.find(
        (r) =>
          r.displayName === entities.therapistName ||
          r.displayName === input.fixture.selectedTherapistName,
      );
      const blocks = selected
        ? selected.workingHours?.length
          ? selected.workingHours
          : DEFAULT_WORKING_HOURS
        : input.roster.flatMap((r) =>
            r.workingHours?.length ? r.workingHours : DEFAULT_WORKING_HOURS,
          );
      const allHours = blocks.length ? blocks : DEFAULT_WORKING_HOURS;
      const requestedDate = parseSlotPreference(normalizedTimeText, {}, input.now).date;
      const weekday = requestedDate
        ? new Date(`${requestedDate}T12:00:00+03:00`).getUTCDay() || 7
        : null;
      const dayHours = weekday ? allHours.filter((b) => b.weekday === weekday) : allHours;
      const hours = dayHours.length ? dayHours : allHours;
      const fits = (h: number) =>
        hours.some(
          (b) => h * 60 >= b.startMinute && h * 60 + SESSION_MINUTES <= b.endMinute,
        );
      if (fits(hour) !== fits(hour + 12)) hour = fits(hour) ? hour : hour + 12;
      else if (hour < 8 || fits(hour + 12))
        timeQuestion = `Saat ${String(hour + 12).padStart(2, "0")}:00'yı mı kastediyorsunuz? Sabah veya öğleden sonra olarak da yazabilirsiniz.`;
    }
    if (!timeQuestion)
      entities.time = `${String(hour).padStart(2, "0")}:${clock[2] ?? "00"}`;
  }
  let preference = parseSlotPreference(normalizedTimeText, entities, input.now);
  if (
    preference.date &&
    preference.date <
      input.now.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
  ) {
    timeQuestion =
      "Geçmiş bir tarih için randevu oluşturamıyoruz. İleri bir gün ve saat paylaşır mısınız?";
  }
  if (
    reschedule &&
    input.fixture.appointments.length === 1 &&
    /ertesi gun.*ayni saat/.test(v)
  ) {
    const next = new Date(input.fixture.appointments[0]!.startAt.getTime() + 86400000);
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(next)
      .split(" ");
    entities.date = parts[0];
    entities.time = parts[1];
    preference = parseSlotPreference("", entities, input.now);
  }
  if (preference.date) entities.date = preference.date;
  if ((booking || reschedule) && (preference.date || preference.startMinute != null)) {
    const previous = parseSlotPreference(
      input.fixture.intake?.availabilityNotes ?? "",
      {},
      input.now,
    );
    const date = preference.date ?? previous.date;
    const minute = preference.startMinute;
    const time =
      entities.time ??
      (minute != null
        ? `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
        : "");
    entities.availabilityNotes = [date, time, text]
      .filter(Boolean)
      .join(" ")
      .slice(0, 500);
  }

  if (
    /başka.{0,35}gün|yakın.{0,25}gün/iu.test(input.lastReply) &&
    /^(?:evet|olur|tamam|uygun|hayır)[.!\s]*$/iu.test(text.trim())
  )
    entities.alternativeDaysOkay = !/^hayır/iu.test(text.trim());
  const disputesTime = /saat.{0,20}(?:belirtmedim|söylemedim|seçmedim)/iu.test(text);
  const savedPreference = parseSlotPreference(
    input.fixture.intake?.availabilityNotes ?? "",
    {},
    input.now,
  );
  const availabilityExplanation =
    disputesTime &&
    /uygun.{0,35}saat|saat.{0,20}(?:görünmüyor|bulunmadı)/iu.test(input.lastReply)
      ? `Belirli bir saat söylemediniz; ${savedPreference.date ? "önceki mesajınızda belirttiğiniz gün" : "uygun günler"} için kontrol yaptım. Son kontrolde o gün için sunabileceğim bir başlangıç saati bulunmadı. Başka bir günün uygun saatlerini paylaşmamı ister misiniz?`
      : null;
  // Keep a literal preference that deterministic time parsing cannot yet
  // resolve; never let the model manufacture an ISO date or a free slot.
  const modelAvailability = field("availabilityNotes");
  if (
    booking &&
    typeof modelAvailability === "string" &&
    !entities.availabilityNotes &&
    /saat|bugun|yarin|hafta|pazartesi|sali|carsamba|persembe|cuma|cumartesi|pazar|sabah|ogleden|aksam|\d[.:]/.test(
      fold(modelAvailability),
    )
  )
    entities.availabilityNotes = modelAvailability;
  if (asksWhyAgeIsNeeded(text) || hasQuestion("WHY_AGE")) add(AGE_REQUEST_EXPLANATION);
  if (nearbyFood) add(NEARBY_FOOD_REPLY);
  if (expertise) {
    const found =
      therapistInformation(text, input.knowledge) ??
      (!affiliation
        ? therapistInformation("terapistler hakkında bilgi", input.knowledge)
        : undefined);
    if (found) {
      const asksRoster = /hangi (?:terapist|uzman|doktor)|terapistler|uzmanlar/.test(v);
      const rosterInfo =
        found.source.id === "demo_omer_services" && asksRoster
          ? therapistInformation("terapistler hakkında bilgi", input.knowledge)
          : undefined;
      if (rosterInfo) {
        add(rosterInfo.answer, rosterInfo.source);
        add(found.answer.split(/(?<=\.)\s/)[0]!, found.source);
      } else add(found.answer, found.source);
    } else
      add(
        "Uzmanlarımızın çalışma alanları için şu anda onaylı bilgiye ulaşamıyorum. Ekibimizden bilgi isteyebilirsiniz.",
      );
  }
  const policyInfo = policyAnswers(text, input.knowledge);
  for (const item of policyInfo) add(item.answer, item.source);
  const pricePolicy = price ? approvedPolicy(input.knowledge, "price") : undefined;
  if (pricePolicy) sources.push(pricePolicy);
  if (clinic && (!policyInfo.length || /adres|konum|harita/.test(v))) {
    const found = clinicInformation(text, input.knowledge);
    if (found) add(found.answer, found.source);
    else
      add(
        "Kliniğin hangi bilgisine ihtiyacınız var: adres, çalışma saatleri veya uzmanlarımız?",
      );
  }
  const definition = generalDefinition(text);
  if (definition) add(definition);
  const needsAnswer =
    !suitability &&
    !definition &&
    !policyInfo.length &&
    (hasQuestion("THERAPY_INFO") ||
      (!expertise &&
        !clinic &&
        !asksWhyAgeIsNeeded(text) &&
        /nedir|ne demek|nasil|anlat|neden|ne kadar sur|kac dakika/.test(v) &&
        /terapi|seans|emdr|psikolog/.test(v)));
  let intent: LlmTurn["intent"] = cancel
    ? "CANCEL"
    : reschedule && input.fixture.appointments.length
      ? "RESCHEDULE"
      : booking
        ? "NEW_BOOKING"
        : invoice
          ? "INVOICE_REQUEST"
          : price
            ? "PRICE_REQUEST"
            : expertise
              ? "THERAPIST_INFO"
              : clinic || policyInfo.length > 0
                ? "CLINIC_INFO"
                : definition || needsAnswer
                  ? "THERAPY_INFO"
                  : "UNKNOWN";
  if (
    /terapistimi degistir|(?:merve|hazal|omer).{0,30}yerine|baska (?:bir )?(?:terapist|uzman).{0,35}(?:calis|gorus)/.test(
      v,
    ) &&
    !/degistirmek istemiyorum|degistirme(?:[.!\s]|$)/.test(v)
  )
    intent = "THERAPIST_CHANGE";
  const refusesProfile =
    /(?:yasimi|soyadimi|adimi|bilgilerimi|(?:gecmis )?terapi (?:deneyimimi|gecmisimi)).{0,35}(?:soylemek|vermek|paylasmak) istemiyorum/.test(
      v,
    );
  if (refusesProfile) intent = "HUMAN_REQUEST";
  if (intent === "UNKNOWN" && requestedServices(text).length) intent = "HUMAN_REQUEST";
  if (
    input.fixture.appointments.length &&
    intent === "UNKNOWN" &&
    /gelecegim|katilacagim|teyit ediyorum/.test(v) &&
    !/gelmeyecegim|katilmayacagim|gecik|degistir|iptal|\?/.test(v)
  )
    intent = "CONFIRM";
  if (
    /(?:gorevli|calisan|insan|resepsiyon|ekip).{0,45}(?:gorusmek|konusmak|devam etmek) istiyorum/.test(v) &&
    !/(?:gorusmek|konusmak|devam etmek) istemiyorum/.test(v)
  )
    intent = "HUMAN_REQUEST";
  if (["CANCEL", "CONFIRM", "HUMAN_REQUEST"].includes(intent))
    timeQuestion = null;
  const injection =
    /talimatlari unut|kurallari (?:unut|atla)|eksik olsa|takvime yaz/.test(v);
  if (injection) {
    intent = "UNKNOWN";
    for (const key of Object.keys(entities))
      delete entities[key as keyof typeof entities];
  }
  const clarify = injection
    ? "Randevu ancak gerekli bilgiler tamamlanıp saat seçildikten ve ekip onayından sonra kesinleşir."
    : intent === "UNKNOWN" && !information.length
      ? "Randevu, klinik bilgisi veya mevcut randevunuzla ilgili nasıl yardımcı olabiliriz?"
      : null;
  const turn: LlmTurn = {
    intent,
    confidence: 1,
    reply: "İşlem kod tarafından yönetilir.",
    entities,
    needsHandoff: false,
  };
  const identityBlocked =
    ["NEW_BOOKING", "CANCEL", "RESCHEDULE"].includes(intent) &&
    shouldAskWhoTheAppointmentIsFor({
      text,
      intent: intent as "NEW_BOOKING" | "CANCEL" | "RESCHEDULE",
      patients: input.fixture.patients,
    });
  if (identityBlocked) turn.entities = {};
  return {
    invitation:
      input.fixture.appointments.length > 0 ||
      input.stage === "PENDING_APPROVAL" ||
      /randevu (?:almak istemiyorum|istemiyorum)|sadece bilgi/.test(v) ||
      input.invitationAlreadySent ||
      input.lastReply.includes(BOOKING_INVITATION)
        ? null
        : BOOKING_INVITATION,
    conversationalReply,
    closing,
    result: { turn, latencyMs: 0, model: SIMPLE_FLOW_VERSION, provider: "fake" },
    information,
    sources,
    booking: intent === "NEW_BOOKING",
    suitability,
    needsAnswer,
    clarify,
    price,
    invoice,
    approvedPrice: pricePolicy?.content ?? null,
    priceTarget: affirmative.length === 1 ? affirmative[0]!.displayName : null,
    identityBlocked,
    timeQuestion,
    availabilityExplanation,
  };
}

// Only code-owned strings and exact approved source text enter this renderer.
export function renderSimpleFlow(
  plan: SimplePlan,
  diagnosis: SimulationDiagnosis,
  fixture: SimulationFixture,
  pending: boolean,
) {
  let result = {
    ...diagnosis,
    promptVersion: SIMPLE_FLOW_VERSION,
    rules: [
      ...diagnosis.rules,
      `${SIMPLE_FLOW_VERSION}: alanlar kullanıcı ifadesinden; işlem ve aşama koddan.`,
    ],
    raw: {
      simpleFlow: true,
      sources: plan.sources.map((d) => ({ id: d.id, version: d.version })),
    },
  };
  if (
    result.intent === "THERAPIST_CHANGE" &&
    plan.result.turn.entities.therapistName &&
    !fixture.appointments.length &&
    !fixture.intake?.isExistingPatient
  ) {
    result = { ...result, intent: "NEW_BOOKING", botStopped: false, handoff: null };
    plan = {
      ...plan,
      booking: true,
      information: [
        ...plan.information,
        `Tamamdır, ${plan.result.turn.entities.therapistName} tercihinizi kaydettim.`,
      ],
    };
  }
  const info = plan.information.join("\n\n");
  if (plan.identityBlocked)
    return {
      ...result,
      action: null,
      additionalActions: [],
      // Clarifying who the appointment is for must not swallow the approved
      // answer already prepared for the same message.
      outbound: [info, identityQuestion(fixture.patients)].filter(Boolean).join("\n\n"),
    };
  if (
    result.botStopped &&
    !["CLINIC_INFO", "THERAPIST_INFO", "THERAPY_INFO"].includes(result.intent)
  )
    return result;
  if (plan.conversationalReply)
    return {
      ...result,
      action: null,
      additionalActions: [],
      handoff: null,
      outbound: plan.conversationalReply,
      raw: { ...result.raw, conversationClosing: plan.closing },
    };
  if (result.intent === "RESCHEDULE" && fixture.appointments.length !== 1)
    return {
      ...result,
      action: null,
      outbound:
        "Hangi randevunuzun saatini değiştirmek istiyorsunuz? Tarih ve saati paylaşır mısınız?",
    };
  if (result.intent === "RESCHEDULE")
    result = {
      ...result,
      action: null,
      outbound:
        "Hangi gün ve saate almak istersiniz? Yeni saat ekip onayıyla kesinleşecek.",
    };
  if (
    ["CANCEL", "RESCHEDULE", "CONFIRM"].includes(result.intent) &&
    !fixture.appointments.length
  )
    return {
      ...result,
      action: null,
      outbound:
        "İşlem yapabileceğim bir randevu bulamadım. Randevu tarihinizi ve uzmanınızı paylaşır mısınız?",
    };
  const priceReply =
    plan.approvedPrice ??
    (plan.priceTarget
      ? `${plan.priceTarget} için güncel ücret talebinizi ekibimize ilettim. Ücret bilgisini yetkili ekibimiz paylaşacak.`
      : "Güncel ücret bilgisini yetkili ekibimiz paylaşacak. Ücret talebinizi ekibimize ilettim.");
  if (plan.suitability)
    return {
      ...result,
      action: null,
      additionalActions: [],
      outbound: [
        info,
        "Size uygun desteği terapistimizle birlikte değerlendirebilirsiniz. Yardımcı olmaları için sizi ekibimize aktarıyorum.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      botStopped: true,
      handoff: { reason: "Kişisel uygunluk için terapiste danışılmalı." },
    };
  if (plan.availabilityExplanation)
    return {
      ...result,
      action: null,
      additionalActions: [],
      outbound: [info, plan.availabilityExplanation].filter(Boolean).join("\n\n"),
    };
  if (plan.timeQuestion)
    return {
      ...result,
      action: null,
      additionalActions: [],
      outbound: [info, plan.timeQuestion].filter(Boolean).join("\n\n"),
    };
  if (plan.booking) {
    const flow = bookingFlow({
      requested: true,
      intake: fixture.intake,
      therapistSelected: Boolean(fixture.selectedTherapistName),
      pendingApproval: pending,
      slotsOffered: fixture.awaitingSlotSelection,
    });
    result = {
      ...result,
      action: null,
      additionalActions: [],
      handoff: null,
      botStopped: false,
      outbound: [
        info,
        plan.price ? priceReply : null,
        pending
          ? info || plan.price
            ? null
            : "Randevu talebiniz ekip onayı bekliyor. Onaylandığında size haber vereceğiz."
          : (flow.question ??
            (fixture.awaitingSlotSelection
              ? "Lütfen sunulan saatlerden seçtiğiniz numarayı tek başına yazın."
              : "Tercihinize uygun saatleri kontrol ediyorum.")),
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
    if (plan.price && !plan.approvedPrice)
      result.additionalActions = [
        {
          id: "simple-price",
          type: "PRICE_REQUEST",
          status: "PENDING",
          currentLabel: "Güncel ücret talebi",
          proposedLabel: plan.priceTarget ?? "Uzman seçimi bekliyor",
          therapistName: plan.priceTarget ?? "Santa Psikoloji",
        },
      ];
  } else if (["CLINIC_INFO", "THERAPIST_INFO", "THERAPY_INFO"].includes(result.intent)) {
    result = {
      ...result,
      action: null,
      handoff: null,
      botStopped: false,
      outbound: [
        info || "Bu konuda doğrulanmış bir açıklamaya şu an ulaşamıyorum.",
        plan.invitation,
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  } else if (plan.clarify)
    result = {
      ...result,
      action: null,
      handoff: null,
      botStopped: false,
      outbound: plan.clarify,
    };
  else if (result.intent === "PRICE_REQUEST")
    result = {
      ...result,
      outbound: [info, priceReply, plan.invitation].filter(Boolean).join("\n\n"),
    };
  else if (info) result = { ...result, outbound: [info, result.outbound].join("\n\n") };
  if (plan.price && result.intent === "INVOICE_REQUEST") {
    result.outbound = `${result.outbound}\n\n${priceReply}`;
    result.additionalActions = [
      {
        id: "simple-price",
        type: "PRICE_REQUEST",
        status: "PENDING",
        currentLabel: "Güncel ücret talebi",
        proposedLabel: plan.priceTarget ?? "Uzman seçimi bekliyor",
        therapistName: plan.priceTarget ?? "Santa Psikoloji",
      },
    ];
  }
  if (plan.approvedPrice) {
    if (result.action?.type === "PRICE_REQUEST") result.action = null;
    result.additionalActions = result.additionalActions?.filter(
      (action) => action.type !== "PRICE_REQUEST",
    );
  }
  if (plan.invoice && plan.booking) {
    result.outbound = ["Fatura talebinizi ekibimize ilettim.", result.outbound].join(
      "\n\n",
    );
    result.additionalActions = [
      ...(result.additionalActions ?? []),
      {
        id: "simple-invoice",
        type: "INVOICE_REQUEST",
        status: "PENDING",
        currentLabel: "Fatura talebi",
        proposedLabel: "Faturanın iletilmesi",
        therapistName: fixture.selectedTherapistName ?? "Santa Psikoloji",
      },
    ];
  }
  return result;
}
