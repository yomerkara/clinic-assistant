import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  user: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  summary: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: db.user,
  toActor: (user: { id: string; role: string; therapistProfile?: { id: string } }) => ({
    userId: user.id,
    role: user.role,
    therapistProfileId: user.therapistProfile?.id ?? null,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: db.revalidate }));
vi.mock("@/lib/http", () => ({ publicOrigin: () => "http://localhost:3000" }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        patient: { findFirst: db.find, updateMany: db.update },
        conversation: { updateMany: db.summary },
        auditEvent: { create: db.audit },
      }),
  },
}));
import { POST } from "./route";
function request() {
  return new Request("http://localhost:3000/api/patients/test", {
    method: "POST",
    body: new URLSearchParams({
      version: "2",
      displayName: "Ali Kara",
      age: "29",
      hasTherapyHistory: "false",
      availabilityNotes: "Salı 16.00",
      alternativeDaysOkay: "true",
    }),
  });
}
const params = { params: Promise.resolve({ id: "test" }) };
beforeEach(() => {
  vi.clearAllMocks();
  db.user.mockResolvedValue({ id: "staff", role: "INTERN" });
  db.find.mockResolvedValue({ id: "test" });
  db.update.mockResolvedValue({ count: 1 });
});
it("persists a staff correction, invalidates stale memory and refreshes dependent pages", async () => {
  const response = await POST(request(), params);
  expect(response.headers.get("location")).toContain("edit=saved");
  expect(db.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: "test", version: 2 },
      data: expect.objectContaining({
        displayName: "Ali Kara",
        age: 29,
        hasTherapyHistory: false,
        version: { increment: 1 },
      }),
    }),
  );
  expect(db.summary).toHaveBeenCalledWith({
    where: { patientId: "test" },
    data: {
      memorySummary: null,
      offeredSlots: [],
      offeredAt: null,
      offeredTherapistId: null,
    },
  });
  expect(db.revalidate).toHaveBeenCalledWith("/", "layout");
  expect(db.audit).toHaveBeenCalled();
});
it("does not overwrite a newer edit or reset conversation memory on conflict", async () => {
  db.update.mockResolvedValue({ count: 0 });
  expect((await POST(request(), params)).headers.get("location")).toContain(
    "edit=conflict",
  );
  expect(db.summary).not.toHaveBeenCalled();
  expect(db.audit).not.toHaveBeenCalled();
});
it("denies therapists access to unrelated patients", async () => {
  db.user.mockResolvedValue({ id: "therapist", role: "THERAPIST" });
  db.find.mockResolvedValue(null);
  expect((await POST(request(), params)).status).toBe(403);
  expect(db.find).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: { in: [] } } }),
  );
  expect(db.update).not.toHaveBeenCalled();
});
