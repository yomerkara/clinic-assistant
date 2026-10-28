import { describe, expect, it } from "vitest";
import { effectiveWorkingHours, withinClinicHours } from "./clinic-hours";
import { proposeSlots } from "./availability";

describe("approved clinic hours", () => {
  it.each([
    ["2026-10-06T07:59:00+03:00", false],
    ["2026-10-06T08:00:00+03:00", true],
    ["2026-10-09T22:59:00+03:00", true],
    ["2026-10-09T23:00:00+03:00", false],
    ["2026-10-05T12:00:00+03:00", false],
    ["2026-10-10T12:00:00+03:00", true],
    ["2026-10-11T12:00:00+03:00", true],
    ["2026-10-06T05:00:00Z", true],
  ])("checks Istanbul boundaries for %s", (date, expected) => {
    expect(withinClinicHours(new Date(date))).toBe(expected);
  });
  it.each(["2026-10-10", "2026-10-11"])("offers weekend appointments on %s", (day) => {
    const slots = proposeSlots({
      now: new Date(`${day}T06:00:00+03:00`),
      workingHours: effectiveWorkingHours([]),
      busy: [],
      windowDays: 1,
      count: 1,
    });
    expect(slots[0]?.toISOString()).toBe(`${day}T06:00:00.000Z`);
  });
  it("intersects personal hours without reopening closed days", () => {
    expect(
      effectiveWorkingHours([
        { weekday: 1, startMinute: 600, endMinute: 1080 },
        { weekday: 2, startMinute: 420, endMinute: 1080 },
        { weekday: 5, startMinute: 1200, endMinute: 1440 },
      ]),
    ).toEqual([
      { weekday: 2, startMinute: 480, endMinute: 1080 },
      { weekday: 5, startMinute: 1200, endMinute: 1380 },
    ]);
    expect(
      effectiveWorkingHours([{ weekday: 1, startMinute: 600, endMinute: 1080 }]),
    ).toEqual([]);
  });
  it("offers only complete sessions before closing and none on Monday", () => {
    const workingHours = effectiveWorkingHours([]);
    expect(
      proposeSlots({
        now: new Date("2026-10-05T06:00:00+03:00"),
        workingHours,
        busy: [],
        windowDays: 1,
        count: 30,
      }),
    ).toEqual([]);
    const slots = proposeSlots({
      now: new Date("2026-10-09T20:30:00+03:00"),
      workingHours,
      busy: [],
      windowDays: 1,
      count: 30,
    });
    expect(slots.map((d) => d.toISOString())).toEqual([]);
  });
});
