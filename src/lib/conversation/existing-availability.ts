import { normalizePatientName } from "@/lib/patients/identity";
import { parseSlotPreference, istanbulDay } from "@/lib/calendar/availability";

/** A read-only availability question; cancellation, booking and mixed questions retain normal routing. */
export function asksExistingAvailability(text: string) {
  const v = normalizePatientName(text);
  return (
    /musait|uygun.*(?:saat|gun)|(?:saat|gun).*uygun|bos.*(?:saat|yer)|yer.*var mi/.test(
      v,
    ) &&
    !/iptal|degistir|ertele|hangi hizmet|randevu (?:al|olustur|ayarla)|gecik|zarar/.test(
      v,
    )
  );
}
export function namedAvailabilityTherapists<T extends { displayName: string }>(
  text: string,
  roster: T[],
) {
  const v = normalizePatientName(text);
  return roster.filter((t) =>
    normalizePatientName(t.displayName)
      .split(" ")
      .some(
        (word) =>
          word.length > 2 &&
          !["yonetici", "test", "klinik", "psikolog", "aile", "danismani"].includes(
            word,
          ) &&
          new RegExp(`(?:^|\\s)${word}(?:nin|nun|in|un|e|a|ye|ya|le|la)?(?:\\s|$)`).test(
            v,
          ),
      ),
  );
}
export function availabilityWindow(text: string, now: Date) {
  const v = normalizePatientName(text);
  const preference = parseSlotPreference(text, {}, now);
  const today = new Date(`${istanbulDay(now)}T00:00:00+03:00`);
  if (/bu hafta|haftaya|gelecek hafta/.test(v)) {
    const weekday = new Date(today.getTime() + 3 * 3600000).getUTCDay() || 7;
    const monday = new Date(today.getTime() - (weekday - 1) * 86400000);
    const next = /haftaya|gelecek hafta/.test(v);
    const from = next ? new Date(monday.getTime() + 7 * 86400000) : now;
    const to = new Date(monday.getTime() + (next ? 14 : 7) * 86400000);
    return { from, to, preference };
  }
  if (preference.date) {
    const from = new Date(`${preference.date}T00:00:00+03:00`);
    return {
      from: from < now ? now : from,
      to: new Date(from.getTime() + 86400000),
      preference,
    };
  }
  return { from: now, to: new Date(today.getTime() + 7 * 86400000), preference };
}
