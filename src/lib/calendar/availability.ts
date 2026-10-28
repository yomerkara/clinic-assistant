import type { BusyBlock } from "@/lib/adapters/calendar";
import { CLINIC_WORKING_HOURS } from "./clinic-hours";

export type WorkingBlock = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export const SESSION_MINUTES = 50;
export const SLOT_STEP_MINUTES = 60;
export const DEFAULT_WORKING_HOURS: WorkingBlock[] = CLINIC_WORKING_HOURS;

// Only normalize number words when introduced as a clock, never names/ages.
export function normalizeClockWords(text: string) {
  const numbers: Record<string, string> = {
    bir: "1",
    iki: "2",
    üç: "3",
    dört: "4",
    beş: "5",
    altı: "6",
    yedi: "7",
    sekiz: "8",
    dokuz: "9",
    on: "10",
    "on bir": "11",
    "on iki": "12",
  };
  return text.replace(
    /((?:^|[^\p{L}])(?:saat|yarın|bugün|öğleden sonra|akşam|sabah)\s+)(on iki|on bir|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)(?:['’]?(?:te|ta|de|da))?(?=\s|[,;.!?]|$)/giu,
    (_, prefix: string, word: string) =>
      prefix + numbers[word.toLocaleLowerCase("tr-TR")],
  );
}

function istanbulDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return {
    date: `${lookup.year}-${lookup.month}-${lookup.day}`,
    weekday: weekdayMap[lookup.weekday ?? "Mon"] ?? 1,
  };
}

export function istanbulDateTime(date: string, minuteOfDay: number) {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return new Date(
    `${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+03:00`,
  );
}

function overlaps(a: BusyBlock, b: BusyBlock) {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

export function proposeSlots(input: {
  now: Date;
  workingHours: WorkingBlock[];
  busy: BusyBlock[];
  windowDays?: number;
  count?: number;
}): Date[] {
  const windowDays = input.windowDays ?? 7;
  const count = input.count ?? 3;
  const slots: Date[] = [];
  for (let dayOffset = 0; dayOffset < windowDays; dayOffset += 1) {
    const cursor = new Date(input.now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const { date, weekday } = istanbulDateParts(cursor);
    const blocks = input.workingHours.filter((block) => block.weekday === weekday);
    for (const block of blocks) {
      for (
        let minute = block.startMinute;
        minute + SESSION_MINUTES <= block.endMinute;
        minute += SLOT_STEP_MINUTES
      ) {
        const startAt = istanbulDateTime(date, minute);
        if (startAt.getTime() < input.now.getTime() + 3 * 60 * 60 * 1000) continue;
        const endAt = new Date(startAt.getTime() + SESSION_MINUTES * 60 * 1000);
        const candidate = { startAt, endAt };
        if (input.busy.some((busy) => overlaps(busy, candidate))) continue;
        slots.push(startAt);
        if (slots.length >= count) return slots;
      }
    }
  }
  return slots;
}

export function proposeSlotsWithFallback(input: {
  now: Date;
  workingHours: WorkingBlock[];
  busy: BusyBlock[];
  count?: number;
}) {
  const first = proposeSlots({ ...input, windowDays: 7 });
  if (first.length >= (input.count ?? 3)) return first;
  return proposeSlots({ ...input, windowDays: 14 });
}

export type SlotPreference = {
  date?: string;
  startMinute?: number;
  endMinute?: number;
  strict?: boolean;
  alternatives?: SlotPreference[];
};

const WEEKDAYS: Array<[string, number]> = [
  ["cumartesi", 6],
  ["pazartesi", 1],
  ["carsamba", 3],
  ["persembe", 4],
  ["pazar", 7],
  ["sali", 2],
  ["cuma", 5],
];

function minuteOfDay(slot: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(slot);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(lookup.hour) * 60 + Number(lookup.minute);
}

function collectDaySlots(input: {
  date: string;
  now: Date;
  workingHours: WorkingBlock[];
  busy: BusyBlock[];
}) {
  const weekday = istanbulDateParts(istanbulDateTime(input.date, 12 * 60)).weekday;
  const blocks = input.workingHours.filter((block) => block.weekday === weekday);
  const slots: Date[] = [];
  for (const block of blocks) {
    for (
      let minute = block.startMinute;
      minute + SESSION_MINUTES <= block.endMinute;
      minute += SLOT_STEP_MINUTES
    ) {
      const startAt = istanbulDateTime(input.date, minute);
      if (startAt.getTime() < input.now.getTime() + 3 * 60 * 60 * 1000) continue;
      const endAt = new Date(startAt.getTime() + SESSION_MINUTES * 60 * 1000);
      if (input.busy.some((busy) => overlaps(busy, { startAt, endAt }))) continue;
      slots.push(startAt);
    }
  }
  return slots;
}

function rankSlot(slot: Date, preference: SlotPreference) {
  if (preference.startMinute == null) return 0;
  const minute = minuteOfDay(slot);
  const start = preference.startMinute;
  const end = preference.endMinute ?? start + 60;
  if (minute >= start && minute <= end) return 0;
  return Math.min(Math.abs(minute - start), Math.abs(minute - (end - SLOT_STEP_MINUTES)));
}

function matchWeekday(folded: string) {
  for (const [name, weekday] of WEEKDAYS) {
    if (new RegExp(`(?:^|[^a-z])${name}(?:[^a-z]|$)`).test(folded)) return weekday;
  }
  return null;
}

function addIstanbulDays(date: string, days: number) {
  const base = istanbulDateTime(date, 12 * 60);
  return istanbulDateParts(new Date(base.getTime() + days * 24 * 60 * 60 * 1000)).date;
}

function dateForWeekday(now: Date, weekday: number, nextWeek: boolean) {
  const today = istanbulDateParts(now);
  if (nextWeek) {
    const daysUntilNextMonday = (8 - today.weekday) % 7 || 7;
    return addIstanbulDays(today.date, daysUntilNextMonday + (weekday - 1));
  }
  for (let offset = 0; offset <= 14; offset += 1) {
    const date = addIstanbulDays(today.date, offset);
    if (istanbulDateParts(istanbulDateTime(date, 12 * 60)).weekday !== weekday) continue;
    if (istanbulDateTime(date, 18 * 60).getTime() <= now.getTime()) continue;
    return date;
  }
  return undefined;
}

function dateFromInbound(folded: string, now: Date) {
  if (/\bdun\b/.test(folded)) return addIstanbulDays(istanbulDateParts(now).date, -1);
  if (/hafta sonu/.test(folded))
    return dateForWeekday(now, 6, /gelecek|haftaya/.test(folded));
  const exact = folded.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (exact && Number.isFinite(Date.parse(`${exact}T12:00:00+03:00`))) return exact;
  const year = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
    }).format(now),
  );
  const month = MONTHS.findIndex((name) => folded.includes(name));
  const dayMatch = folded.match(
    /\b(\d{1,2})\s+(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\b/,
  );
  if (month >= 0 && dayMatch) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(Number(dayMatch[1])).padStart(2, "0")}`;
    const endOfDay = istanbulDateTime(date, 18 * 60);
    return endOfDay.getTime() < now.getTime() ? `${year + 1}-${date.slice(5)}` : date;
  }
  if (/(^|[^a-z])bugun([^a-z]|$)/.test(folded)) return istanbulDateParts(now).date;
  if (/(^|[^a-z])yarin([^a-z]|$)/.test(folded))
    return addIstanbulDays(istanbulDateParts(now).date, 1);
  const weekday = matchWeekday(folded);
  if (!weekday) return undefined;
  const nextWeek = /(^|[^a-z])(haftaya|gelecek hafta)([^a-z]|$)/.test(folded);
  return dateForWeekday(now, weekday, nextWeek);
}

function parseClock(folded: string, entitiesTime?: string | null) {
  const range = folded.match(
    /\b(\d{1,2})(?:[.:](\d{2}))?\s*(?:[-–]|ile)\s*(\d{1,2})(?:[.:](\d{2}))?\b/,
  );
  if (range) {
    const afternoon =
      !/sabah|gece/.test(folded) &&
      Number(range[1]) >= 1 &&
      Number(range[3]) <= 6 &&
      Number(range[3]) > Number(range[1]);
    return {
      startMinute: (Number(range[1]) + (afternoon ? 12 : 0)) * 60 + Number(range[2] ?? 0),
      endMinute: (Number(range[3]) + (afternoon ? 12 : 0)) * 60 + Number(range[4] ?? 0),
    };
  }
  const evening = folded.match(/(?:aksam|ogleden sonra)\s+(\d{1,2})(?:[.:](\d{2}))?/);
  if (evening) {
    let hour = Number(evening[1]);
    if (hour > 0 && hour < 12) hour += 12;
    const startMinute = hour * 60 + Number(evening[2] ?? 0);
    return { startMinute, endMinute: startMinute + 60 };
  }
  const morning = folded.match(/sabah\s+(\d{1,2})(?:[.:](\d{2}))?/);
  if (morning) {
    const startMinute = Number(morning[1]) * 60 + Number(morning[2] ?? 0);
    return { startMinute, endMinute: startMinute + 60 };
  }
  if (/ogleden sonra/.test(folded)) return { startMinute: 12 * 60, endMinute: 18 * 60 };
  const single =
    folded.match(/\b(\d{1,2})[.:](\d{2})\b/) ??
    entitiesTime?.match(/^(\d{1,2})[.:](\d{2})$/) ??
    folded.match(
      /(?:saat|cuma|cumartesi|pazar|pazartesi|sali|carsamba|persembe|yarin|bugun)\s+(\d{1,2})(?:[.:](\d{2}))?/,
    );
  if (single) {
    const hour = Number(single[1]);
    const startMinute =
      (hour > 0 && hour < 8 && !/gece|sabah/.test(folded) ? hour + 12 : hour) * 60 +
      Number(single[2] ?? 0);
    return { startMinute, endMinute: startMinute + 60 };
  }
  return null;
}

function entityDateWeekday(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return istanbulDateParts(istanbulDateTime(date, 12 * 60)).weekday;
}

export function istanbulDay(slot: Date) {
  return istanbulDateParts(slot).date;
}

export function parseSlotPreference(
  inbound: string,
  entities: { date?: string | null; time?: string | null },
  now: Date,
): SlotPreference {
  const conditional = inbound.split(/\s+(?:olmazsa|doluysa|uygun değilse)\s+/iu);
  if (conditional.length === 2) {
    const first = parseSlotPreference(conditional[0], {}, now);
    const second = parseSlotPreference(conditional[1], {}, now);
    const alternativeText = foldTr(conditional[1]);
    // An alternative time is not permission to change the requested day.
    // Without a new explicit date, retain the first day unless the patient
    // expressly allows other days. Never turn an unresolved date into today.
    if (!second.date && !/baska gun|farkli gun|herhangi bir gun/.test(alternativeText)) {
      if (!first.date) return first;
      second.date = first.date;
    }
    return { ...first, strict: true, alternatives: [{ ...second, strict: true }] };
  }
  const preference: SlotPreference = {};
  const folded = foldTr(normalizeClockWords(inbound));
  const fromText = dateFromInbound(folded, now);
  const weekdayFromText = matchWeekday(folded);
  if (fromText) {
    preference.date = fromText;
  } else if (entities.date && /^\d{4}-\d{2}-\d{2}$/.test(entities.date)) {
    preference.date = entities.date;
  }
  if (
    preference.date &&
    weekdayFromText &&
    entityDateWeekday(preference.date) !== weekdayFromText
  ) {
    const nextWeek = /(^|[^a-z])(haftaya|gelecek hafta)([^a-z]|$)/.test(folded);
    preference.date = dateForWeekday(now, weekdayFromText, nextWeek) ?? preference.date;
  }
  const clock = parseClock(folded.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ""), entities.time);
  if (/sadece|baska saat olmaz|\d\s*(?:ile|[-–])\s*\d|ogleden sonra/.test(folded))
    preference.strict = true;
  if (clock) {
    preference.startMinute = clock.startMinute;
    preference.endMinute = clock.endMinute;
  }
  return preference;
}

export function proposePreferredSlots(input: {
  now: Date;
  workingHours: WorkingBlock[];
  busy: BusyBlock[];
  count?: number;
  preference?: SlotPreference;
}): Date[] {
  const count = input.count ?? 3;
  const preference = input.preference ?? {};
  if (preference.alternatives?.length) {
    for (const option of [
      { ...preference, alternatives: undefined },
      ...preference.alternatives,
    ]) {
      const slots = proposePreferredSlots({ ...input, preference: option });
      if (slots.length) return slots;
    }
    return [];
  }
  const sortDay = (slots: Date[]) =>
    [...slots].sort(
      (a, b) =>
        rankSlot(a, preference) - rankSlot(b, preference) || a.getTime() - b.getTime(),
    );

  if (preference.date) {
    if (preference.date < istanbulDay(input.now)) return [];
    const daySlots = sortDay(collectDaySlots({ ...input, date: preference.date })).filter(
      (slot) =>
        !preference.strict ||
        preference.startMinute == null ||
        (minuteOfDay(slot) >= preference.startMinute &&
          minuteOfDay(slot) + SESSION_MINUTES <=
            (preference.endMinute ?? preference.startMinute + 60)),
    );
    if (preference.strict) return daySlots.slice(0, count);
    if (daySlots.length) return daySlots.slice(0, count);
    for (const week of [7, 14]) {
      const later = sortDay(
        collectDaySlots({ ...input, date: addIstanbulDays(preference.date, week) }),
      );
      if (later.length) return later.slice(0, count);
    }
    const afterRequestedDay = istanbulDateTime(preference.date, 23 * 60);
    const forward = proposeSlots({
      now:
        afterRequestedDay.getTime() > input.now.getTime() ? afterRequestedDay : input.now,
      workingHours: input.workingHours,
      busy: input.busy,
      windowDays: 14,
      count,
    });
    if (forward.length) return sortDay(forward).slice(0, count);
  }

  const fallback = proposeSlotsWithFallback({ ...input, count: Math.max(count, 8) });
  if (preference.startMinute != null) {
    return sortDay(fallback).slice(0, count);
  }
  return fallback.slice(0, count);
}

export function stripOfferedSlotList(text: string) {
  return text.replace(/\n*Uygun saatler:\s*(?:\n\d+[).]\s+.+)+\s*/gi, "\n").trim();
}

export function formatSlotLabel(slot: Date, timeZone = "Europe/Istanbul") {
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(slot);
}

export function formatSlotOptions(slots: Date[], timeZone = "Europe/Istanbul") {
  return slots
    .map((slot, index) => `${index + 1}) ${formatSlotLabel(slot, timeZone)}`)
    .join("\n");
}

const MONTHS = [
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

function foldTr(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

export function extractOfferedSlotLabels(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)[.)]\s+(.+)$/))
    .flatMap((match) => (match ? [match[2]!.trim()] : []));
}

export function parseTurkishSlotLabel(label: string, now: Date) {
  const folded = foldTr(label);
  const month = MONTHS.findIndex((name) => folded.includes(name));
  const dayMatch = folded.match(/\b(\d{1,2})\b/);
  const timeMatch = folded.match(/\b(\d{1,2})[.:](\d{2})\b/);
  if (month < 0 || !dayMatch || !timeMatch) return null;
  const year = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
    }).format(now),
  );
  const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(Number(dayMatch[1])).padStart(2, "0")}`;
  return istanbulDateTime(date, Number(timeMatch[1]) * 60 + Number(timeMatch[2]));
}

export function parseSlotChoice(
  inbound: string,
  previousAssistantText: string,
  now: Date,
) {
  const labels = extractOfferedSlotLabels(previousAssistantText);
  if (!labels.length) return null;
  const text = inbound
    .trim()
    .replace(
      /^(birinci|ikinci|üçüncü)(?:si|sini|sini alayım)?(?:\s+seçenek)?(?=\s|$)/iu,
      (word) => (/birinci/iu.test(word) ? "1" : /ikinci/iu.test(word) ? "2" : "3"),
    );
  if (/\?|istemiyorum|değil|degil|iptal|uygun mu|müsait mi|musait mi/i.test(text))
    return null;
  const numbered = text.match(/^(\d{1,2})(?:[).:]|\s*-)?\s*(.*)$/);
  if (numbered) {
    const index = Number(numbered[1]) - 1;
    const rest = numbered[2]?.trim() ?? "";
    const label = labels[index];
    const affirmative =
      /^(?:alayim|olsun|olur|lutfen|numara|numara olsun|secenek|secenek olsun|istiyorum|seciyorum)(?:\s+(?:o\s*zaman|lutfen))?[.!]*$/u.test(
        foldTr(rest),
      );
    if (label && (!rest || affirmative || foldTr(label) === foldTr(rest))) {
      return parseTurkishSlotLabel(label, now);
    }
  }
  // A clock choice such as "5 olsun" may select an offered 17:00, but
  // never guess when both AM/PM or multiple days match. Explicit menu numbers
  // above keep precedence; a question or unrelated suffix is not consent.
  const clockChoice = foldTr(text).match(
    /^(?:saat\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:olsun|olur|lutfen|istiyorum|seciyorum)?[.!]*$/,
  );
  if (clockChoice) {
    const hour = Number(clockChoice[1]);
    const minute = Number(clockChoice[2] ?? 0);
    const candidates = labels
      .map((label) => parseTurkishSlotLabel(label, now))
      .filter((slot): slot is Date => {
        if (!slot) return false;
        const parts = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Istanbul",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .format(slot)
          .split(":")
          .map(Number);
        return (
          parts[1] === minute &&
          (parts[0] === hour ||
            (!clockChoice[2] &&
              !clockChoice[1].startsWith("0") &&
              hour < 12 &&
              parts[0] === hour + 12))
        );
      });
    return candidates.length === 1 ? candidates[0] : null;
  }
  const foldedInbound = foldTr(text);
  const hit = labels.find((label) => {
    const folded = foldTr(label);
    return (
      foldedInbound === folded ||
      foldedInbound.includes(folded) ||
      folded.includes(foldedInbound)
    );
  });
  return hit ? parseTurkishSlotLabel(hit, now) : null;
}
