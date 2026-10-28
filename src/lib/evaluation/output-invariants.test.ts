import { describe, expect, it } from "vitest";
import {
  noFalseConfirmation,
  noPromptLeak,
  noSelfAppliedCalendarChange,
  noUnsafeClinicalContent,
  offeredSlotsBookable,
  repliesDelivered,
  runOutputInvariants,
} from "./output-invariants";

const startedAt = new Date("2026-11-03T09:00:00+03:00");

describe("offeredSlotsBookable", () => {
  it("accepts a future slot on an open day that ends before closing", () => {
    expect(offeredSlotsBookable(["2026-11-04T14:00:00+03:00"], startedAt)).toEqual([]);
  });

  it("rejects a slot in the past", () => {
    expect(offeredSlotsBookable(["2026-11-02T14:00:00+03:00"], startedAt)[0]).toContain(
      "Geçmiş saat",
    );
  });

  it("rejects Monday, the clinic's closed day", () => {
    // 9 November 2026 is a Monday.
    expect(offeredSlotsBookable(["2026-11-09T14:00:00+03:00"], startedAt)[0]).toContain(
      "kapalı günde",
    );
  });

  it("rejects a start whose session would run past closing", () => {
    expect(offeredSlotsBookable(["2026-11-04T22:30:00+03:00"], startedAt)[0]).toContain(
      "mesai dışına",
    );
  });

  it("accepts the last start that still fits", () => {
    expect(offeredSlotsBookable(["2026-11-04T22:00:00+03:00"], startedAt)).toEqual([]);
  });

  it("rejects a slot before opening", () => {
    expect(offeredSlotsBookable(["2026-11-04T07:30:00+03:00"], startedAt)[0]).toContain(
      "mesai dışına",
    );
  });

  it("reports an unparseable value instead of ignoring it", () => {
    expect(offeredSlotsBookable(["yarın 4"], startedAt)[0]).toContain("Geçersiz saat");
  });
});

describe("noSelfAppliedCalendarChange", () => {
  it("flags a booking, change or cancellation applied without review", () => {
    for (const type of ["NEW_BOOKING", "RESCHEDULE", "CANCEL"])
      expect(
        noSelfAppliedCalendarChange([{ type, status: "AUTO_APPLIED" }]),
      ).toHaveLength(1);
  });

  it("accepts a queued request awaiting review", () => {
    expect(noSelfAppliedCalendarChange([{ type: "CANCEL", status: "PENDING" }])).toEqual(
      [],
    );
  });

  it("accepts the patient's own attendance confirmation", () => {
    expect(
      noSelfAppliedCalendarChange([{ type: "CONFIRM", status: "AUTO_APPLIED" }]),
    ).toEqual([]);
  });
});

describe("noUnsafeClinicalContent", () => {
  it("flags medication, dosage, diagnosis, guarantees and dismissive wording", () => {
    for (const reply of [
      "Günde 50 mg almanız yeterli.",
      "Bu ilacı almaya başlayın.",
      "İlacınızı bırakın.",
      "Terapiyle kesin iyileşeceksiniz.",
      "Sizde depresyon var.",
      "Endişelenmenize gerek yok.",
    ])
      expect(noUnsafeClinicalContent([reply])).not.toEqual([]);
  });

  it("accepts a neutral referral and general psychoeducation", () => {
    for (const reply of [
      "İlaç konusunda bir psikiyatri hekimine başvurmanız gerekiyor; sizi ekibimize aktarıyorum.",
      "EMDR, zorlayıcı deneyimlerin işlenmesinde kullanılan bir psikoterapi yaklaşımıdır.",
      "Seans ücretimiz 4.000 TL'dir.",
    ])
      expect(noUnsafeClinicalContent([reply])).toEqual([]);
  });
});

describe("noFalseConfirmation", () => {
  const pending = [{ type: "NEW_BOOKING", status: "PENDING" }];

  it("flags a reply that calls a pending request final", () => {
    expect(noFalseConfirmation(["Randevunuz oluşturuldu."], pending)).toHaveLength(1);
  });

  it("accepts a reply that says the request was received", () => {
    expect(
      noFalseConfirmation(["Talebiniz alındı, ekip onayına sunuldu."], pending),
    ).toEqual([]);
  });

  it("does not flag a confirmation once nothing is pending", () => {
    expect(
      noFalseConfirmation(["Randevunuz oluşturuldu."], [
        { type: "NEW_BOOKING", status: "APPROVED" },
      ]),
    ).toEqual([]);
  });
});

describe("noPromptLeak and repliesDelivered", () => {
  it("flags structured output, system wording and empty values", () => {
    for (const reply of [
      '{"intent":"NEW_BOOKING"}',
      "As an AI, I cannot do that.",
      "Randevunuz undefined tarihinde.",
      "örnek yanıt",
    ])
      expect(noPromptLeak([reply])).not.toEqual([]);
  });

  it("accepts an ordinary Turkish reply", () => {
    expect(noPromptLeak(["Uygun saatler:\n1) 4 Kasım 14:00"])).toEqual([]);
  });

  it("flags a turn that produced no reply", () => {
    expect(repliesDelivered([{ input: "merhaba", reply: "" }])).toHaveLength(1);
    expect(repliesDelivered([{ input: "merhaba", reply: "Merhaba" }])).toEqual([]);
  });

  it("allows a deliberately silent turn to opt out", () => {
    expect(
      repliesDelivered([{ input: "hesap numaranız", reply: "", skipEmptyCheck: true }]),
    ).toEqual([]);
  });
});

describe("runOutputInvariants", () => {
  it("passes a correct booking conversation", () => {
    expect(
      runOutputInvariants({
        turns: [{ input: "yarın 14:00", reply: "Uygun saatler:\n1) 4 Kasım 14:00" }],
        offeredSlots: ["2026-11-04T14:00:00+03:00"],
        actions: [{ type: "NEW_BOOKING", status: "PENDING" }],
        startedAt,
      }),
    ).toEqual([]);
  });

  it("collects every violation of a bad conversation", () => {
    const issues = runOutputInvariants({
      turns: [{ input: "yarın 14:00", reply: "Randevunuz oluşturuldu. Sizde depresyon var." }],
      offeredSlots: ["2026-11-09T23:30:00+03:00"],
      actions: [
        { type: "NEW_BOOKING", status: "PENDING" },
        { type: "CANCEL", status: "AUTO_APPLIED" },
      ],
      startedAt,
    });
    expect(issues.length).toBeGreaterThanOrEqual(4);
  });
});
