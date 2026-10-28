import { CONFIDENCE_THRESHOLD } from "@/lib/llm/types";
import { ensureHonorificGreeting } from "@/lib/patients/honorific";
import { INTAKE_QUESTIONS } from "./booking-flow";

export const MAX_REPLY_CHARS = 720;
export const HISTORY_MESSAGES = 24;
export const SLOT_OFFER_TTL_MS = 20 * 60 * 1000;
export const UNKNOWN_HANDOFF_AFTER = 2;

export const FALLBACK_OPTIONS =
  "Randevu, mevcut saatiniz, iptal veya klinik bilgisi için yazabilirsiniz. Hangisi size uygun?";

export function intakeAcknowledgement(text: string | null | undefined) {
  const reply = text?.trim();
  // Intake is not an occasion to praise or evaluate a patient's decision.
  // Keep ordinary empathetic acknowledgements of distress available.
  if (!reply || /cesaret|takdir|tebrik|değerli (?:bir |bul)|heyecan verici/iu.test(reply))
    return undefined;
  return reply;
}

export function clipReply(text: string, limit = MAX_REPLY_CHARS) {
  const marker = "\n\nUygun saatler:";
  const index = text.indexOf(marker);
  let prose = index >= 0 ? text.slice(0, index).trim() : text.trim();
  const slots = index >= 0 ? text.slice(index) : "";
  if (prose.length <= limit) return text.trim();
  // Reserve space for the exact code-owned next step; clipping a long source
  // must not leave the user with no way to continue the intake.
  const question = Object.values(INTAKE_QUESTIONS).find((q) =>
    prose.endsWith(`\n\n${q}`),
  );
  const tail = question ? `\n\n${question}` : "";
  if (tail) prose = prose.slice(0, -tail.length);
  const paragraphs = prose.split(/\n\s*\n/).filter(Boolean);
  if (paragraphs.length > 1) {
    // Allocate space across all answers, so a long introduction cannot silently
    // remove a later fee, invoice receipt or invitation.
    const budget = limit - tail.length - (paragraphs.length - 1) * 2;
    let low = 0,
      high = limit;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (paragraphs.reduce((sum, p) => sum + Math.min(p.length, mid), 0) <= budget)
        low = mid;
      else high = mid - 1;
    }
    const compact = paragraphs.map((p) => {
      if (p.length <= low) return p;
      const prefix = p.slice(0, Math.max(0, low - 1));
      const boundary = prefix.lastIndexOf(" ");
      return `${(boundary > 0 ? prefix.slice(0, boundary) : prefix).trimEnd()}…`;
    });
    return `${compact.join("\n\n")}${tail}${slots}`.trim();
  }
  const sliced = prose.slice(0, limit - tail.length);
  const sentence = sliced.match(/^[\s\S]*[.!?](?=\s|$)/);
  const clipped = (sentence?.[0] ?? sliced).trim();
  return `${clipped}${tail}${slots}`.trim();
}

export function isFreshTimestamp(createdAt: Date, now: Date, ttlMs = SLOT_OFFER_TTL_MS) {
  return now.getTime() - createdAt.getTime() <= ttlMs;
}

export function consecutiveLowUnknownCount(
  turns: Array<{ intent: string; confidence: number; promptVersion?: string | null }>,
) {
  let count = 0;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]!;
    if (turn.promptVersion?.startsWith("scope-")) break;
    if (turn.intent === "UNKNOWN" || turn.confidence < CONFIDENCE_THRESHOLD) {
      count += 1;
      continue;
    }
    break;
  }
  return count;
}

export function finalizeOutbound(reply: string, displayName: string) {
  const plain = reply.replace(/(^|\n\n)(?:👤|🌿|💬|👥|📅|💳|📍) /gu, "$1");
  const clipped = clipReply(
    ensureHonorificGreeting(plain, displayName),
    MAX_REPLY_CHARS - 30,
  );
  return decorateReply(clipped);
}

/** Presentation only: preserve canonical question text used by intake parsing. */
export function decorateReply(reply: string) {
  const plain = reply.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "").trim();
  // Sparse decoration, always at the end. Intake questions stay canonical.
  return /hoş geldiniz|iyi (?:günler|akşamlar)|onaylanmıştır/u.test(plain)
    ? `${plain} 🌸`
    : plain;
}
