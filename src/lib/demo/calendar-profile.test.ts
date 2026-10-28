import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  therapistProfile: { upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { ensureDemoCalendarProfile } from "./calendar-profile";
import { resolveTherapist } from "@/lib/patients/therapist-preference";

beforeEach(() => vi.clearAllMocks());

it.each([
  null,
  { active: true, role: "ADMIN", calendarConnection: null },
  { active: false, role: "ADMIN", calendarConnection: { id: "cal" } },
  { active: true, role: "THERAPIST", calendarConnection: { id: "cal" } },
])("does not expose an unconnected or unauthorized account: %j", async (user) => {
  db.user.findUnique.mockResolvedValue(user);
  expect(await ensureDemoCalendarProfile("admin")).toBeNull();
  expect(db.therapistProfile.upsert).not.toHaveBeenCalled();
});

it("uses the connected administrator's own profile and resolves the requested name", async () => {
  db.user.findUnique.mockResolvedValue({
    active: true,
    role: "ADMIN",
    calendarConnection: { id: "cal" },
  });
  const profile = { id: "test-admin", displayName: "Yönetici Ömer (test)" };
  db.therapistProfile.upsert.mockResolvedValue(profile);
  expect(await ensureDemoCalendarProfile("admin")).toEqual(profile);
  expect(db.therapistProfile.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { userId: "admin" },
      create: expect.objectContaining({ userId: "admin" }),
    }),
  );
  expect(resolveTherapist("yönetici ömer", [profile])).toEqual(profile);
  expect(resolveTherapist("Ömer", [profile])).toEqual(profile);
});
