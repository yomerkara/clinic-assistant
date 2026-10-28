// Decides what the patient is told after a calendar check: the requested day is
// full, concrete options are available, or nothing fits and staff take over.
// Extracted verbatim from handleInbound so each branch can be tested directly.
import { effectiveWorkingHours } from "@/lib/calendar/clinic-hours";
import {
  formatSlotLabel,
  formatSlotOptions,
  istanbulDay,
  SESSION_MINUTES,
  type WorkingBlock,
} from "@/lib/calendar/availability";

export type SlotPreference = {
  date?: string;
  startMinute?: number;
  endMinute?: number;
  strict?: boolean;
  alternatives?: unknown[];
};

export type SlotOfferInput = {
  slots: Date[];
  preference: SlotPreference;
  now: Date;
  calendarConnected: boolean;
  alternativeDaysOkay: boolean | null | undefined;
  workingHours: WorkingBlock[];
  requestedStart: Date | null;
  requestedBusy: boolean;
  simple: boolean;
};

export type SlotOfferDecision =
  | { kind: "requested_day_full"; outbound: string; rule: string }
  | {
      kind: "offer";
      outbound: string;
      rule: string;
      slotDate: string;
      offeredSlots: string[];
    }
  | { kind: "no_slot"; outbound: string; handoffReason: string };

/** True when options exist but none fall on the day the patient asked for. */
export function requestedDayIsFull(input: SlotOfferInput): boolean {
  return Boolean(
    input.calendarConnected &&
    input.preference.date &&
    input.slots[0] &&
    istanbulDay(input.slots[0]) !== input.preference.date &&
    input.alternativeDaysOkay !== true &&
    !input.preference.alternatives?.length,
  );
}

/** A session must both start and end inside the clinician's working block. */
export function requestedOutsideWorkingHours(input: SlotOfferInput): boolean {
  const { requestedStart, preference, workingHours } = input;
  if (!requestedStart || preference.startMinute == null) return false;
  return !effectiveWorkingHours(workingHours).some((block) => {
    const weekday = requestedStart.getUTCDay() || 7;
    const minute = preference.startMinute!;
    return (
      block.weekday === weekday &&
      minute >= block.startMinute &&
      minute + SESSION_MINUTES <= block.endMinute
    );
  });
}

export function decideSlotOffer(input: SlotOfferInput): SlotOfferDecision {
  const { slots, preference, now, simple } = input;
  if (requestedDayIsFull(input))
    return {
      kind: "requested_day_full",
      outbound:
        simple && preference.date === istanbulDay(now)
          ? "Bugün için uygun randevu saati görünmüyor. Başka bir günün uygun saatlerini paylaşmamı ister misiniz?"
          : "Belirttiğiniz gün için uygun saat görünmüyor. Size yakın başka günlerdeki uygun saatleri de paylaşmamı ister misiniz?",
      rule: "İstenen gün dolu; farklı gün önerilmeden önce hastanın onayı istendi.",
    };
  if (slots.length) {
    const alternativeUsed = Boolean(
      preference.alternatives?.length && preference.date !== istanbulDay(slots[0]!),
    );
    const explanation =
      input.requestedBusy && input.requestedStart
        ? `${formatSlotLabel(input.requestedStart)} dolu görünüyor. `
        : requestedOutsideWorkingHours(input)
          ? "İstediğiniz saatte seans çalışma saatleri içine sığmıyor; seans bitişinin de mesai içinde olması gerekiyor. "
          : alternativeUsed
            ? "İlk belirttiğiniz gün ve saatte uygun yer görünmüyor. "
            : "";
    return {
      kind: "offer",
      outbound: `${explanation}${alternativeUsed ? "Belirttiğiniz alternatif için uygun saatler" : "Uygun saatler"}:\n${formatSlotOptions(slots)}\n\nHangisini tercih edersiniz? Seçiminiz ekip onayına sunulacak.`,
      rule: preference.date
        ? "Uygun saatler istenen gün ve saate göre önerildi."
        : "Uygun saatler 7–14 günlük pencereden önerildi.",
      slotDate: istanbulDay(slots[0]!),
      offeredSlots: slots.map((slot) => slot.toISOString()),
    };
  }
  return {
    kind: "no_slot",
    outbound: preference.strict
      ? "Belirttiğiniz gün ve saat kısıtlarına uyan boş yer görünmüyor. İstemediğiniz saatleri önermeden talebinizi ekibe iletiyorum."
      : "Önümüzdeki iki haftada tercihinize uygun boş saat bulamadım. Talebinizi uygun alternatifler için ekibe iletiyorum.",
    handoffReason: "Kontrol edilen takvim aralığında uygun saat bulunamadı.",
  };
}

/** Why the request goes to staff when the calendar itself cannot be read. */
export function calendarFailureHandoffReason(error: unknown): string {
  return error instanceof Error && error.name === "CalendarReconnectRequiredError"
    ? "Google Takvim yetkisi geçersiz (invalid_grant). Hesap sahibi Ayarlar'dan Google Takvim bağlantısını yeniden kurmalı."
    : "Takvim bağlantısı yok veya müsaitlik doğrulanamadı.";
}

export const CALENDAR_FAILURE_REPLY =
  "Randevu tercihinizi kaydettim. Takvime şu an erişemiyorum; müsaitliği kontrol etmeleri için talebinizi ekibimize iletiyorum.";
