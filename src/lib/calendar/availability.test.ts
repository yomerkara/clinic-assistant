import { describe, expect, it } from "vitest";
import {
  formatSlotOptions,
  istanbulDateTime,
  parseSlotChoice,
  parseSlotPreference,
  proposePreferredSlots,
  proposeSlots,
  proposeSlotsWithFallback,
} from "./availability";

const hours = [{ weekday: 1, startMinute: 10 * 60, endMinute: 18 * 60 }];

describe("availability", () => {
  it("skips busy blocks and stays inside working hours", () => {
    const now = new Date("2026-08-24T08:00:00+03:00");
    const busyStart = istanbulDateTime("2026-08-24", 10 * 60);
    const slots = proposeSlots({
      now,
      workingHours: hours,
      busy: [
        { startAt: busyStart, endAt: new Date(busyStart.getTime() + 50 * 60 * 1000) },
      ],
      windowDays: 1,
      count: 2,
    });
    expect(slots[0]?.toISOString()).toBe(
      istanbulDateTime("2026-08-24", 11 * 60).toISOString(),
    );
    expect(slots).toHaveLength(2);
  });

  it("falls back to 14 days when 7 days are full", () => {
    const now = new Date("2026-08-24T08:00:00+03:00");
    const busy = proposeSlots({
      now,
      workingHours: hours,
      busy: [],
      windowDays: 7,
      count: 40,
    }).map((startAt) => ({
      startAt,
      endAt: new Date(startAt.getTime() + 50 * 60 * 1000),
    }));
    const slots = proposeSlotsWithFallback({ now, workingHours: hours, busy, count: 3 });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0]!.getTime()).toBeGreaterThan(
      now.getTime() + 7 * 24 * 60 * 60 * 1000 - 12 * 60 * 60 * 1000,
    );
  });

  it("reads a numbered or labelled slot choice from the previous offer", () => {
    const now = new Date("2026-08-26T12:00:00+03:00");
    const first = istanbulDateTime("2026-08-26", 17 * 60);
    const second = istanbulDateTime("2026-08-27", 10 * 60);
    const offered = `Uygun saatler:\n${formatSlotOptions([first, second])}`;
    expect(
      parseSlotChoice("26 Ağustos Çarşamba 17:00", offered, now)?.toISOString(),
    ).toBe(first.toISOString());
    expect(parseSlotChoice("1", offered, now)?.toISOString()).toBe(first.toISOString());
    expect(parseSlotChoice("2", offered, now)?.toISOString()).toBe(second.toISOString());
    expect(parseSlotChoice("1 olsun", offered, now)?.toISOString()).toBe(
      first.toISOString(),
    );
    expect(parseSlotChoice("1 lütfen", offered, now)?.toISOString()).toBe(
      first.toISOString(),
    );
    expect(parseSlotChoice("1 alksjdlkasjkdja", offered, now)).toBeNull();
    expect(parseSlotChoice("1 istemiyorum", offered, now)).toBeNull();
    for (const text of ["1 olsun ozaman", "1 olsun o zaman", "2 olsun lütfen"])
      expect(parseSlotChoice(text, offered, now)?.toISOString()).toBe(
        text.startsWith("1") ? first.toISOString() : second.toISOString(),
      );
    for (const text of [
      "1 olsun o zaman mı?",
      "1 olsun ama 2 de olur",
      "1 olsun istemiyorum",
    ])
      expect(parseSlotChoice(text, offered, now)).toBeNull();
  });

  it("proposes the requested day and time window instead of the next free hours", () => {
    const now = new Date("2026-08-31T11:00:00+03:00");
    const hours = [
      { weekday: 1, startMinute: 10 * 60, endMinute: 18 * 60 },
      { weekday: 4, startMinute: 10 * 60, endMinute: 18 * 60 },
    ];
    const preference = parseSlotPreference(
      "3 Eylül Perşembe 16:00-17:00 arası müsaitim",
      { date: "2026-09-03", time: "16:00" },
      now,
    );
    expect(preference.date).toBe("2026-09-03");
    expect(preference.startMinute).toBe(16 * 60);
    const slots = proposePreferredSlots({
      now,
      workingHours: hours,
      busy: [],
      preference,
      count: 3,
    });
    expect(slots.map((slot) => slot.toISOString())).toEqual([
      istanbulDateTime("2026-09-03", 16 * 60).toISOString(),
    ]);
  });

  it("keeps next Friday at 16:00 even if the model reused Tuesday", () => {
    const now = new Date("2026-08-31T18:52:00+03:00");
    const hours = [
      { weekday: 1, startMinute: 10 * 60, endMinute: 18 * 60 },
      { weekday: 2, startMinute: 10 * 60, endMinute: 18 * 60 },
      { weekday: 3, startMinute: 10 * 60, endMinute: 18 * 60 },
      { weekday: 4, startMinute: 10 * 60, endMinute: 18 * 60 },
      { weekday: 5, startMinute: 10 * 60, endMinute: 18 * 60 },
    ];
    const preference = parseSlotPreference(
      "haftaya cuma akşam 4 uygun mu?",
      { date: "2026-09-01", time: "16:00" },
      now,
    );
    expect(preference.date).toBe("2026-09-11");
    expect(preference.startMinute).toBe(16 * 60);
    const slots = proposePreferredSlots({
      now,
      workingHours: hours,
      busy: [],
      preference,
      count: 3,
    });
    expect(slots.map((slot) => slot.toISOString())).toEqual([
      istanbulDateTime("2026-09-11", 16 * 60).toISOString(),
      istanbulDateTime("2026-09-11", 17 * 60).toISOString(),
      istanbulDateTime("2026-09-11", 15 * 60).toISOString(),
    ]);
  });

  it("does not treat cuma as cumartesi", () => {
    const now = new Date("2026-08-31T18:52:00+03:00");
    expect(parseSlotPreference("haftaya cumartesi 16:00", {}, now).date).toBe(
      "2026-09-12",
    );
    expect(parseSlotPreference("haftaya cuma 16:00", {}, now).date).toBe("2026-09-11");
  });
});

it("resolves a spoken clock only when one offered slot matches", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const offered =
    "Uygun saatler:\n1) 9 Ekim Cuma 17:00\n2) 9 Ekim Cuma 14:00\n3) 9 Ekim Cuma 13:00";
  expect(parseSlotChoice("5 olsun", offered, now)?.toISOString()).toBe(
    "2026-10-09T14:00:00.000Z",
  );
  expect(parseSlotChoice("saat 17:00 olsun", offered, now)?.toISOString()).toBe(
    "2026-10-09T14:00:00.000Z",
  );
  expect(parseSlotChoice("5 numara", offered, now)).toBeNull();
  expect(parseSlotChoice("5 uygun mu?", offered, now)).toBeNull();
  expect(parseSlotChoice("05:00 olsun", offered, now)).toBeNull();
  expect(
    parseSlotChoice("5 olsun", offered + "\n4) 10 Ekim Cumartesi 17:00", now),
  ).toBeNull();
});

 describe("same-day conditional alternatives", () => {
  const now = new Date("2026-10-14T12:00:00+03:00");
  const workingHours = [2, 3, 4, 5, 6, 7].map(weekday => ({ weekday, startMinute: 480, endMinute: 1380 }));
  const preferenceFor = (date: string, alternative = "aynı gün başka saat de olur") =>
    parseSlotPreference(`${date} saat 10:00 uygunum. O saat doluysa ${alternative}.`, {}, now);

  it("retains the requested day instead of searching from today", () => {
    const preference = preferenceFor("20 Ekim 2026");
    expect(preference.alternatives?.[0].date).toBe("2026-10-20");
    const slots = proposePreferredSlots({ now, workingHours, preference, busy: [
      { startAt: istanbulDateTime("2026-10-20", 600), endAt: istanbulDateTime("2026-10-20", 650) },
    ] });
    expect(slots).toHaveLength(3);
    for (const slot of slots) expect(slot.toISOString().slice(0, 10)).toBe("2026-10-20");
    expect(slots.some(s => s.getTime() === istanbulDateTime("2026-10-20", 600).getTime())).toBe(false);
  });
  it("offers nothing on a closed requested day despite other days being free", () => {
    expect(proposePreferredSlots({ now, workingHours, preference: preferenceFor("19 Ekim 2026"), busy: [] })).toEqual([]);
  });
  it("offers nothing when the entire requested day is full", () => {
    expect(proposePreferredSlots({ now, workingHours, preference: preferenceFor("20 Ekim 2026"), busy: [
      { startAt: istanbulDateTime("2026-10-20", 0), endAt: istanbulDateTime("2026-10-21", 0) },
    ] })).toEqual([]);
  });
  it("keeps a separately named alternative date", () => {
    const preference = preferenceFor("20 Ekim 2026", "23 Ekim 2026 saat 14:00 olur");
    expect(preference.alternatives?.[0].date).toBe("2026-10-23");
    const slots = proposePreferredSlots({ now, workingHours, preference, busy: [
      { startAt: istanbulDateTime("2026-10-20", 0), endAt: istanbulDateTime("2026-10-21", 0) },
    ] });
    expect(slots[0]).toEqual(istanbulDateTime("2026-10-23", 840));
  });
  it("does not invent a date for an unresolved same-day alternative", () => {
    expect(parseSlotPreference("O saat doluysa aynı gün başka saat olur", {}, now).alternatives).toBeUndefined();
  });
 });
