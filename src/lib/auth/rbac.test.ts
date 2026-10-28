import { describe, expect, it } from "vitest";
import {
  canAccessTherapistRecord,
  canConnectCalendar,
  canContinueConversation,
  canManageUsageBudget,
  canReviewQueue,
  canUseSimulator,
  canViewAllQueue,
  canViewUsage,
} from "./rbac";

describe("canReviewQueue", () => {
  it("lets admins approve globally and therapists review their own queue", () => {
    expect(canReviewQueue("ADMIN")).toBe(true);
    expect(canReviewQueue("INTERN")).toBe(false);
    expect(canReviewQueue("THERAPIST")).toBe(true);
    expect(canViewAllQueue("ADMIN")).toBe(true);
    expect(canViewAllQueue("INTERN")).toBe(true);
    expect(canViewAllQueue("THERAPIST")).toBe(false);
    expect(canContinueConversation("INTERN")).toBe(true);
  });
});

describe("canUseSimulator", () => {
  it("is limited to the clinic admin", () => {
    expect(canUseSimulator("ADMIN")).toBe(true);
    expect(canUseSimulator("INTERN")).toBe(false);
    expect(canUseSimulator("THERAPIST")).toBe(false);
  });
});

describe("usage and calendar permissions", () => {
  it("keeps interns away from financial data and calendar connections", () => {
    expect(canViewUsage("ADMIN")).toBe(true);
    expect(canViewUsage("THERAPIST")).toBe(true);
    expect(canViewUsage("INTERN")).toBe(false);
    expect(canManageUsageBudget("ADMIN")).toBe(true);
    expect(canManageUsageBudget("THERAPIST")).toBe(false);
    expect(canConnectCalendar("ADMIN")).toBe(true);
    expect(canConnectCalendar("THERAPIST")).toBe(true);
    expect(canConnectCalendar("INTERN")).toBe(false);
  });
});

describe("canAccessTherapistRecord", () => {
  it("lets admin access any therapist record", () => {
    expect(
      canAccessTherapistRecord(
        { userId: "admin", role: "ADMIN", therapistProfileId: null },
        "therapist-selin",
      ),
    ).toBe(true);
  });

  it("lets a therapist access only their own record", () => {
    const actor = {
      userId: "selin",
      role: "THERAPIST" as const,
      therapistProfileId: "therapist-selin",
    };
    expect(canAccessTherapistRecord(actor, "therapist-selin")).toBe(true);
    expect(canAccessTherapistRecord(actor, "therapist-baris")).toBe(false);
  });
});
