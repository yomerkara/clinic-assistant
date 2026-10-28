import { normalizePatientName } from "@/lib/patients/identity";

export const LOOKUP_PERSON_QUESTION =
  "Randevu bilgisini kimin için kontrol edelim? Lütfen kişinin adını ve soyadını paylaşın.";
export function asksAppointmentLookup(text: string) {
  const v = normalizePatientName(text);
  if (
    /iptal|degistir|ertele|not ekle|gecik|randevu (?:al|olustur|ayarla)|musait|uygun/.test(
      v,
    )
  )
    return false;
  return (
    /randevu/.test(v) &&
    /ne zaman|kac|hangi|kiminle|kimle|kimde|liste|goster|paylas|hatirlat|var mi|var midir|onaylandi|onaylandi mi|gununu|saatini|online mi|yuz yuze mi/.test(
      v,
    )
  );
}
export function historicalLookup(text: string) {
  return /gecmis|onceki|son randevum|katildigim/.test(normalizePatientName(text));
}
export function appointmentLookupLabel(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Appointment history must not roll an explicit past month/day into next year. */
export function explicitLookupDate(text: string, now: Date): string | undefined {
  const v = normalizePatientName(text);
  const months = [
    "ocak",
    "subat",
    "mart",
    "nisan",
    "mayis",
    "haziran",
    "temmuz",
    "agustos",
    "eylul",
    "ekim",
    "kasim",
    "aralik",
  ];
  const match = v.match(
    /\b(\d{1,2})\s+(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)(?:\s+(20\d{2}))?\b/,
  );
  if (!match) return undefined;
  const year =
    match[3] ??
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
    }).format(now);
  const day = `${year}-${String(months.indexOf(match[2]) + 1).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return day;
}

/** Separate the appointment being moved from its requested destination. */
export function rescheduleParts(text: string) {
  const folded = text
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");
  if (
    !/degistir|ertele|tasiy|tasir|alabilir|alalim|alin|alir/.test(folded) ||
    /iptal|degistirme\b|istemiyorum/.test(folded)
  )
    return null;
  const marker = /randevu(?:mu|mi|mun|m|yu)?\b/.exec(folded);
  if (!marker) return null;
  const source = folded.slice(0, marker.index).trim();
  const destination = folded.slice(marker.index + marker[0].length).trim();
  const timeReference =
    /\d{1,2}\s+(?:ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)|pazartesi|sali|carsamba|persembe|cuma|cumartesi|pazar|bugun|yarin/;
  return timeReference.test(source) && timeReference.test(destination)
    ? { source, destination }
    : null;
}

/** Extract only an explicitly requested additional booking after a protected old record. */
export function additionalBookingText(text: string): string | null {
  const boundary = /(?:randevum\s+kalsın|randevum\s+korunsun|geri açmayın)[.!;,]?\s*/iu.exec(text);
  if (!boundary) return null;
  const next = text.slice(boundary.index + boundary[0].length).trim();
  const v = normalizePatientName(next);
  if (!/(?:yeni|ek|ikinci)\s+(?:bir\s+)?(?:randevu|seans|gorusme)|ayrica\s+(?:bir\s+)?(?:gorusme|randevu|seans)/.test(v)) return null;
  if (!/istiyorum|almak|olustur|ayarla/.test(v) || /istemiyorum|iptal|ertele|degistir/.test(v)) return null;
  return next;
}
