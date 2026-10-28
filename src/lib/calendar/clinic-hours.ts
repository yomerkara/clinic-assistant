import type { WorkingBlock } from "./availability";

export const CLINIC_HOURS_REPLY =
  "Çalışma saatlerimiz Salı–Pazar 08.00–23.00 arasındadır.";
export const CLINIC_WORKING_HOURS: WorkingBlock[] = [2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  startMinute: 480,
  endMinute: 1380,
}));
export function withinClinicHours(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Istanbul",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  return (
    ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(parts.weekday) &&
    minute >= 480 &&
    minute < 1380
  );
}
/** A clinician's narrower personal hours remain authoritative. */
export function effectiveWorkingHours(personal: WorkingBlock[]): WorkingBlock[] {
  if (!personal.length) return CLINIC_WORKING_HOURS;
  return personal.flatMap((block) => {
    const clinic = CLINIC_WORKING_HOURS.find((h) => h.weekday === block.weekday);
    if (!clinic) return [];
    const startMinute = Math.max(block.startMinute, clinic.startMinute);
    const endMinute = Math.min(block.endMinute, clinic.endMinute);
    return endMinute > startMinute ? [{ ...block, startMinute, endMinute }] : [];
  });
}
