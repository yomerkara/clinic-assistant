// Operator controls: which screens the team sees, which optional behaviour is
// on, and whether the assistant answers patients at all. Everything here is
// data, so a clinic can change it without a deploy. Access is still decided by
// RBAC: a flag can hide a screen, never grant one.
import { z } from "zod";

export const FEATURE_FLAGS = [
  "screen.conversations",
  "screen.patients",
  "screen.calendar",
  "screen.requests",
  "screen.invoices",
  "screen.usage",
  "screen.statistics",
  "assistant.answerClinicInfo",
  "assistant.proposeSlots",
  "assistant.recordNotes",
  "assistant.secondPassReview",
  "ops.hourlyTherapistDigest",
  "ops.satisfactionSurvey",
] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/** A flag absent from the stored map falls back to this. */
const DEFAULTS: Record<FeatureFlag, boolean> = {
  "screen.conversations": true,
  "screen.patients": true,
  "screen.calendar": true,
  "screen.requests": true,
  "screen.invoices": true,
  "screen.usage": true,
  "screen.statistics": true,
  "assistant.answerClinicInfo": true,
  "assistant.proposeSlots": true,
  "assistant.recordNotes": true,
  // Off until the clinic accepts the extra latency and model cost.
  "assistant.secondPassReview": false,
  "ops.hourlyTherapistDigest": false,
  "ops.satisfactionSurvey": false,
};

const flagMapSchema = z.record(z.string(), z.unknown());

export type ClinicControls = {
  assistantEnabled: boolean;
  assistantOffReason: string | null;
  flags: Record<FeatureFlag, boolean>;
};

export function isFeatureFlag(value: string): value is FeatureFlag {
  return (FEATURE_FLAGS as readonly string[]).includes(value);
}

function resolveFlags(raw: Record<string, unknown>): Record<FeatureFlag, boolean> {
  return Object.fromEntries(
    FEATURE_FLAGS.map((flag) => [
      flag,
      // A stored value counts only when it is actually a boolean; anything else
      // falls back to the default rather than being read as "on".
      typeof raw[flag] === "boolean" ? (raw[flag] as boolean) : DEFAULTS[flag],
    ]),
  ) as Record<FeatureFlag, boolean>;
}

export function parseControls(
  row:
    | {
        assistantEnabled?: boolean;
        assistantOffReason?: string | null;
        featureFlags?: unknown;
      }
    | null
    | undefined,
): ClinicControls {
  const parsed = flagMapSchema.safeParse(row?.featureFlags);
  const raw =
    parsed.success && !Array.isArray(row?.featureFlags) && row?.featureFlags !== null
      ? parsed.data
      : {};
  return {
    assistantEnabled: row?.assistantEnabled ?? true,
    assistantOffReason: row?.assistantOffReason ?? null,
    flags: resolveFlags(raw),
  };
}

/** Only known flags are stored; unknown keys are dropped rather than kept. */
export function mergeFlags(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<FeatureFlag, boolean> {
  const next = resolveFlags(current);
  for (const [key, value] of Object.entries(patch))
    if (isFeatureFlag(key) && typeof value === "boolean") next[key] = value;
  return next;
}

export const ASSISTANT_OFF_REPLY =
  "Mesajınızı aldım. Şu anda otomatik yanıt kapalı; konuşmanızı klinik ekibimize aktarıyorum.";

export function assistantOffHandoffReason(reason: string | null | undefined): string {
  return reason?.trim()
    ? `Asistan yönetici tarafından kapatıldı: ${reason.trim()}`
    : "Asistan yönetici tarafından kapatıldı.";
}

export const FLAG_LABELS: Record<FeatureFlag, string> = {
  "screen.conversations": "Konuşmalar ekranı",
  "screen.patients": "Müşteriler ekranı",
  "screen.calendar": "Takvim ekranı",
  "screen.requests": "Çalışan talepleri ekranı",
  "screen.invoices": "Fatura ekranı",
  "screen.usage": "AI ve kullanım ekranı",
  "screen.statistics": "İstatistik ekranı",
  "assistant.answerClinicInfo": "Klinik bilgisi yanıtlama",
  "assistant.proposeSlots": "Uygun saat önerme",
  "assistant.recordNotes": "Randevu notu kaydetme",
  "assistant.secondPassReview": "İkinci aşama bağlam denetimi",
  "ops.hourlyTherapistDigest": "Saatlik terapist özeti",
  "ops.satisfactionSurvey": "Memnuniyet anketi",
};
