import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { buildLiveSummary, getLiveSummary, type SummaryMessage } from "./live-summary";

const message = (
  id: string,
  authorKind: string,
  text: string,
  minute: number,
): SummaryMessage => ({
  id,
  authorKind,
  text,
  createdAt: new Date(Date.UTC(2026, 9, 5, 8, minute)),
});

describe("pending request summary", () => {
  it("retains the staff proposal, acceptance and later day preference without confirming a booking", () => {
    const initial = message("1", "PATIENT", "Hazal Hanım ile ilk görüşme istiyorum.", 0);
    const result = buildLiveSummary(initial, [
      message("5", "PATIENT", "bu salı olur", 4),
      message("4", "BOT", "Hangi gün size uygun?", 3),
      message("3", "PATIENT", "evet uygunum", 2),
      message("2", "STAFF", "19:00'a uygun musunuz?", 1),
    ]);
    expect(result?.updates.map((m) => m.text)).toEqual([
      "19:00'a uygun musunuz?",
      "evet uygunum",
      "bu salı olur",
    ]);
    expect(result?.updates[2].context).toBe("Hangi gün size uygun?");
    expect(result?.updatedAt).toEqual(new Date("2026-10-05T08:04:00Z"));
    expect(result).not.toHaveProperty("startAt");
    expect(result).not.toHaveProperty("status");
  });

  it("keeps a changed preference as the latest evidence instead of treating the previous acceptance as final", () => {
    const result = buildLiveSummary(null, [
      message("1", "PATIENT", "evet uygunum", 1),
      message("2", "PATIENT", "Vazgeçtim, salı olmaz. Çarşamba olsun.", 2),
    ]);
    expect(result?.updates.at(-1)?.text).toBe("Vazgeçtim, salı olmaz. Çarşamba olsun.");
  });

  it.each(["APPROVED", "REJECTED", "AUTO_APPLIED", "EXPIRED"])(
    "does not rewrite %s requests from later conversation",
    async (status) => {
      const findFirst = vi.fn();
      const prisma = { message: { findFirst } } as unknown as PrismaClient;
      expect(
        await getLiveSummary(prisma, {
          status,
          conversationId: "conversation",
          createdAt: new Date(),
        }),
      ).toBeNull();
      expect(findFirst).not.toHaveBeenCalled();
    },
  );

  it("returns no fabricated summary when there is no conversation evidence", () => {
    expect(buildLiveSummary(null, [])).toBeNull();
  });
});
