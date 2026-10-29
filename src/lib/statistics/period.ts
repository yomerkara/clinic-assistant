// Month windows and month-over-month comparison for the clinic's own calendar.
// The server runs in UTC, so a month boundary taken from the host clock would
// cut the month three hours early and move rows between periods.
import { CLINIC_TIME_ZONE } from "@/lib/clinic-clock";

export type Period = { from: Date; to: Date; label: string };

function clinicParts(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: CLINIC_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return { year: Number(parts.year), month: Number(parts.month) };
}

/** Istanbul is UTC+3 all year, so a month starts at 21:00 UTC the day before. */
function clinicMonthStart(year: number, month: number) {
  const normalisedYear = year + Math.floor((month - 1) / 12);
  const normalisedMonth = ((((month - 1) % 12) + 12) % 12) + 1;
  return new Date(
    `${normalisedYear}-${String(normalisedMonth).padStart(2, "0")}-01T00:00:00+03:00`,
  );
}

export function clinicMonth(now: Date, monthsBack = 0): Period {
  const { year, month } = clinicParts(now);
  const from = clinicMonthStart(year, month - monthsBack);
  const to = clinicMonthStart(year, month - monthsBack + 1);
  return {
    from,
    to,
    label: new Intl.DateTimeFormat("tr-TR", {
      timeZone: CLINIC_TIME_ZONE,
      month: "long",
      year: "numeric",
    }).format(from),
  };
}

export type Change = {
  direction: "up" | "down" | "flat" | "new";
  /** Percentage change, rounded; null when there is no comparable base. */
  percent: number | null;
  label: string;
};

/** Month-over-month change. Growth from zero is reported as new, not as +100%. */
export function compare(current: number, previous: number): Change {
  if (previous === 0 && current === 0)
    return { direction: "flat", percent: 0, label: "Değişim yok" };
  if (previous === 0)
    return { direction: "new", percent: null, label: "Geçen ay kayıt yoktu" };
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return { direction: "flat", percent: 0, label: "Değişim yok" };
  return {
    direction: percent > 0 ? "up" : "down",
    percent,
    label: `${percent > 0 ? "+" : ""}${percent}% (geçen ay ${previous})`,
  };
}
