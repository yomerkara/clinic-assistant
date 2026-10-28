import { describe, expect, it } from "vitest";
import { classifyApprove, classifyCancel } from "./rules";

describe("classifyCancel", () => {
  it("requires approval for a same-day cancel before the appointment start", () => {
    const start = new Date("2026-03-14T11:00:00+03:00");
    const now = new Date("2026-03-14T09:30:00+03:00");
    expect(classifyCancel(start, now)).toBe("needs_approval");
  });

  it("queues a future-dated cancel for intern approval", () => {
    const start = new Date("2026-03-19T10:00:00+03:00");
    const now = new Date("2026-03-14T12:00:00+03:00");
    expect(classifyCancel(start, now)).toBe("needs_approval");
  });

  it("marks a past appointment as no-show review instead of cancelling", () => {
    const start = new Date("2026-03-14T11:00:00+03:00");
    const now = new Date("2026-03-14T11:01:00+03:00");
    expect(classifyCancel(start, now)).toBe("no_show_review");
  });
});

describe("classifyApprove", () => {
  it("allows approve when no sibling request has already been applied", () => {
    expect(classifyApprove(["PENDING", "REJECTED"])).toBe("ok");
  });

  it("requires recheck when another request on the same appointment was approved first", () => {
    expect(classifyApprove(["APPROVED", "PENDING"])).toBe("needs_recheck");
  });

  it("requires recheck when a sibling was auto-applied", () => {
    expect(classifyApprove(["AUTO_APPLIED"])).toBe("needs_recheck");
  });
});
