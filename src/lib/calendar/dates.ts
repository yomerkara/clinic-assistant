export function toIstanbulInput(value: string | Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function parseIstanbulInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return new Date(NaN);
  const date = new Date(`${value}:00+03:00`);
  return toIstanbulInput(date) === value ? date : new Date(NaN);
}
export function validAppointmentRange(start: Date, end: Date, now = new Date()) {
  return (
    Number.isFinite(start.getTime()) &&
    Number.isFinite(end.getTime()) &&
    start > now &&
    end > start &&
    end.getTime() - start.getTime() <= 24 * 60 * 60 * 1000
  );
}
