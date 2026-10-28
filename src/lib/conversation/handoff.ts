import type { SimulationDiagnosis } from "@/lib/simulator/rules";
export type HandoffCategory =
  | "EMERGENCY"
  | "HUMAN_REQUEST"
  | "UNCERTAIN"
  | "PERSONAL_SUITABILITY"
  | "THERAPIST_SELECTION"
  | "THERAPIST_CHANGE"
  | "PAST_CANCELLATION"
  | "KNOWLEDGE_UNVERIFIED"
  | "CALENDAR_UNAVAILABLE"
  | "SERVICE_UNAVAILABLE";
export function handoffCategory(
  d: Pick<SimulationDiagnosis, "intent" | "handoff">,
): HandoffCategory | null {
  if (!d.handoff) return null;
  if (d.intent === "SENSITIVE_OR_EMERGENCY") return "EMERGENCY";
  if (d.intent === "HUMAN_REQUEST") return "HUMAN_REQUEST";
  if (d.intent === "THERAPIST_CHANGE") return "THERAPIST_CHANGE";
  if (d.intent === "CANCEL") return "PAST_CANCELLATION";
  const reason = d.handoff.reason.toLocaleLowerCase("tr-TR");
  if (/belirsiz/.test(reason)) return "UNCERTAIN";
  if (/kişisel uygunluk/.test(reason)) return "PERSONAL_SUITABILITY";
  if (/terapist seçimi/.test(reason)) return "THERAPIST_SELECTION";
  if (/kaynak|bilgi havuzu|onaylı/.test(reason)) return "KNOWLEDGE_UNVERIFIED";
  if (/takvim|calendar|müsaitlik/.test(reason)) return "CALENDAR_UNAVAILABLE";
  return "SERVICE_UNAVAILABLE";
}
