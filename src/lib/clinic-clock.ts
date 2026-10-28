// Clock rendering shared by client components. The server container runs in UTC
// while a browser runs in the viewer's own zone, so a formatter without an
// explicit time zone renders two different strings for the same instant and
// React discards the server markup (hydration error #418). Every clinic time is
// read in the clinic's zone, matching the scheduling rules in src/lib/calendar.
export const CLINIC_TIME_ZONE = "Europe/Istanbul";

export function formatClinicClock(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatClinicDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: CLINIC_TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
