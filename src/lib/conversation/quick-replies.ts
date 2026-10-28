import { extractOfferedSlotLabels } from "@/lib/calendar/availability";

export type QuickReply = { label: string; text: string };

const CORE: QuickReply[] = [
  { label: "Yeni randevu", text: "Yeni bir randevu almak istiyorum." },
  { label: "Saat değişsin", text: "Randevumun saatini değiştirebilir miyiz?" },
  { label: "İptal", text: "Randevumu iptal etmek istiyorum." },
  { label: "Çalışanla konuş", text: "Bir çalışanla görüşmek istiyorum." },
];

export function quickRepliesFor(input: {
  outbound: string;
  intent?: string | null;
  hasAppointment: boolean;
  botStopped?: boolean;
}): QuickReply[] {
  if (input.botStopped) return [];
  const offered = extractOfferedSlotLabels(input.outbound);
  if (offered.length) {
    return offered.slice(0, 3).map((label, index) => ({
      label: `${index + 1}) ${label}`.slice(0, 42),
      text: String(index + 1),
    }));
  }
  if (input.intent === "UNKNOWN") return CORE;
  if (
    input.intent === "CLINIC_INFO" ||
    input.intent === "THERAPIST_INFO" ||
    input.intent === "THERAPY_INFO"
  ) {
    return [
      CORE[0]!,
      { label: "EMDR nedir?", text: "EMDR seansları nasıl ilerliyor?" },
      CORE[3]!,
    ];
  }
  if (!input.hasAppointment) return [CORE[0]!, CORE[3]!];
  return [CORE[1]!, CORE[2]!, CORE[3]!];
}
