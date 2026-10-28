import type { LlmTurn } from "@/lib/llm/types";
import { resolveTherapist } from "./therapist-preference";

/** Narrow scheduling replies only: never suppress an explicit support or safety request. */
export function isAvailabilityConstraintReply(text: string) {
  const normalized = text
    .toLocaleLowerCase("tr-TR")
    .trim()
    .replace(/[.!?]+$/, "");
  return (
    /^(?:(?:şu\s*an(?:lık)?|şimdilik)\s+)?(?:sadece|yalnızca)\s+(?:o|bu)\s+(?:saat|gün)(?:\s+(?:uygun|olur|olabilir))?$/.test(
      normalized,
    ) ||
    /^(?:başka gün (?:olmaz|uygun değil)|başka gün de olur|alternatif günler? (?:uygun|uygun değil))$/.test(
      normalized,
    )
  );
}

export function normalizeBookingPreference(
  turn: LlmTurn,
  hasAppointment: boolean,
  hasPendingBooking: boolean,
  context?: { inbound: string; roster: Array<{ displayName: string }>; selectedName: string | null },
): LlmTurn {
  if (context && turn.intent === "NEW_BOOKING" && !hasAppointment && !hasPendingBooking) {
    const text = context.inbound.toLocaleLowerCase("tr-TR");
    // A bare intake answer cannot revoke a choice saved in an earlier turn.
    if (context.selectedName && turn.entities.therapistPreference === "UNDECIDED" &&
        /^(?:\d{1,3}|hayır(?: hiç)?(?: olmadı)?|evet(?: oldu)?)[.!\s]*$/u.test(text.trim())) {
      turn = { ...turn, entities: { ...turn.entities, therapistName: context.selectedName, therapistPreference: "SELECTED" } };
    }
    // Narrow referral + booking statement. Questions and negation must not
    // silently select a clinician; match only a unique active roster entry.
    if (!context.selectedName && !turn.entities.therapistName &&
        /önerdi|tavsiye etti/u.test(text) && /başlamak istiyorum|randevu (?:almak istiyorum|istiyorum)/u.test(text) &&
        !/\?|\bama\b|değil|istemiyorum|hangi|uygun mu/u.test(text)) {
      const named = text.match(/([\p{L}]+)\s+(?:hanım|bey)/u)?.[1];
      const therapist = resolveTherapist(named, context.roster);
      if (therapist) turn = { ...turn, entities: { ...turn.entities, therapistName: therapist.displayName, therapistPreference: "SELECTED" } };
    }
  }
  // A named new-booking choice must not disappear merely because the model
  // omitted the redundant preference flag. Informational intents stay untouched.
  if (
    turn.intent === "NEW_BOOKING" &&
    turn.entities.therapistName?.trim() &&
    !turn.entities.therapistPreference
  )
    return {
      ...turn,
      entities: { ...turn.entities, therapistPreference: "SELECTED" },
    };
  if (turn.intent !== "THERAPIST_CHANGE" || hasAppointment || hasPendingBooking)
    return turn;
  return {
    ...turn,
    intent: "NEW_BOOKING",
    needsHandoff: false,
    handoffReason: null,
    entities: {
      ...turn.entities,
      therapistPreference: turn.entities.therapistName ? "SELECTED" : "UNDECIDED",
    },
  };
}
