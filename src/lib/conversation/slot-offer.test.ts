import { describe, expect, it } from "vitest";
import { CLINIC_WORKING_HOURS } from "@/lib/calendar/clinic-hours";
import {
  CALENDAR_FAILURE_REPLY,
  calendarFailureHandoffReason,
  decideSlotOffer,
  requestedDayIsFull,
  requestedOutsideWorkingHours,
  type SlotOfferInput,
} from "./slot-offer";

const now = new Date("2026-11-03T09:00:00+03:00");
// 4 November 2026 is a Wednesday, inside clinic hours.
const slot = (iso: string) => new Date(iso);
const base = (overrides: Partial<SlotOfferInput> = {}): SlotOfferInput => ({
  slots: [],
  preference: {},
  now,
  calendarConnected: true,
  alternativeDaysOkay: null,
  workingHours: CLINIC_WORKING_HOURS,
  requestedStart: null,
  requestedBusy: false,
  simple: true,
  ...overrides,
});

describe("decideSlotOffer", () => {
  it("offers the available times and marks them for team approval", () => {
    const decision = decideSlotOffer(
      base({ slots: [slot("2026-11-04T14:00:00+03:00"), slot("2026-11-04T15:00:00+03:00")] }),
    );
    expect(decision.kind).toBe("offer");
    if (decision.kind !== "offer") return;
    expect(decision.outbound).toContain("Uygun saatler:");
    expect(decision.outbound).toContain("ekip onayına sunulacak");
    expect(decision.offeredSlots).toHaveLength(2);
    expect(decision.slotDate).toBe("2026-11-04");
    expect(decision.rule).toContain("7–14 günlük");
  });

  it("asks before moving the patient to another day when the requested one is full", () => {
    const input = base({
      slots: [slot("2026-11-05T14:00:00+03:00")],
      preference: { date: "2026-11-04" },
    });
    expect(requestedDayIsFull(input)).toBe(true);
    const decision = decideSlotOffer(input);
    expect(decision.kind).toBe("requested_day_full");
    expect(decision.outbound).toContain("Belirttiğiniz gün için uygun saat görünmüyor");
    // No times are leaked before the patient agrees to another day.
    expect(decision.outbound).not.toContain("Uygun saatler:");
  });

  it("words the full-day reply for today differently", () => {
    const decision = decideSlotOffer(
      base({
        slots: [slot("2026-11-05T14:00:00+03:00")],
        preference: { date: "2026-11-03" },
      }),
    );
    expect(decision.outbound).toContain("Bugün için uygun randevu saati görünmüyor");
  });

  it("offers another day directly once the patient allowed it", () => {
    const decision = decideSlotOffer(
      base({
        slots: [slot("2026-11-05T14:00:00+03:00")],
        preference: { date: "2026-11-04" },
        alternativeDaysOkay: true,
      }),
    );
    expect(decision.kind).toBe("offer");
  });

  it("explains that the requested hour was already taken", () => {
    const decision = decideSlotOffer(
      base({
        slots: [slot("2026-11-04T15:00:00+03:00")],
        preference: { date: "2026-11-04", startMinute: 840 },
        requestedStart: slot("2026-11-04T14:00:00+03:00"),
        requestedBusy: true,
      }),
    );
    expect(decision.outbound).toContain("dolu görünüyor");
  });

  it("explains that the session would not fit inside working hours", () => {
    const input = base({
      slots: [slot("2026-11-04T15:00:00+03:00")],
      // 22:30 start leaves only 30 minutes before the 23:00 close.
      preference: { date: "2026-11-04", startMinute: 1350 },
      requestedStart: slot("2026-11-04T22:30:00+03:00"),
    });
    expect(requestedOutsideWorkingHours(input)).toBe(true);
    expect(decideSlotOffer(input).outbound).toContain("çalışma saatleri içine sığmıyor");
  });

  it("accepts a start whose session still ends before closing", () => {
    expect(
      requestedOutsideWorkingHours(
        base({
          preference: { date: "2026-11-04", startMinute: 1320 },
          requestedStart: slot("2026-11-04T22:00:00+03:00"),
        }),
      ),
    ).toBe(false);
  });

  it("labels an offer that came from the stated alternative", () => {
    const decision = decideSlotOffer(
      base({
        slots: [slot("2026-11-08T15:00:00+03:00")],
        preference: { date: "2026-11-04", alternatives: [{ date: "2026-11-08" }] },
      }),
    );
    expect(decision.outbound).toContain("Belirttiğiniz alternatif için uygun saatler");
  });

  it("hands a strict request to staff instead of proposing unwanted times", () => {
    const decision = decideSlotOffer(base({ preference: { strict: true } }));
    expect(decision.kind).toBe("no_slot");
    if (decision.kind !== "no_slot") return;
    expect(decision.outbound).toContain("İstemediğiniz saatleri önermeden");
    expect(decision.handoffReason).toContain("uygun saat bulunamadı");
  });

  it("hands an open request to staff when two weeks hold nothing", () => {
    const decision = decideSlotOffer(base());
    expect(decision.kind).toBe("no_slot");
    expect(decision.outbound).toContain("Önümüzdeki iki haftada");
  });

  it("does not claim a day is full when the calendar was never read", () => {
    expect(
      requestedDayIsFull(
        base({
          calendarConnected: false,
          slots: [slot("2026-11-05T14:00:00+03:00")],
          preference: { date: "2026-11-04" },
        }),
      ),
    ).toBe(false);
  });
});

describe("calendar failure", () => {
  it("names a revoked Google grant so the owner can reconnect", () => {
    const error = new Error("invalid_grant");
    error.name = "CalendarReconnectRequiredError";
    expect(calendarFailureHandoffReason(error)).toContain("yeniden kurmalı");
  });

  it("falls back to an unverified-availability reason", () => {
    expect(calendarFailureHandoffReason(new Error("socket hang up"))).toContain(
      "doğrulanamadı",
    );
  });

  it("never promises a time when the calendar is unreachable", () => {
    expect(CALENDAR_FAILURE_REPLY).not.toContain("Uygun saatler");
    expect(CALENDAR_FAILURE_REPLY).toContain("ekibimize iletiyorum");
  });
});
