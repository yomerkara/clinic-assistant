import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  user: vi.fn(),
  limit: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  audit: vi.fn(),
  lock: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireUser: db.user }));
vi.mock("@/lib/auth/rate-limit", () => ({ allowAuthAttempt: db.limit }));
vi.mock("next/cache", () => ({ revalidatePath: db.refresh }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        $executeRaw: db.lock,
        patient: { findMany: db.find, create: db.create },
        auditEvent: { create: db.audit },
      }),
  },
}));
import { POST } from "./route";
function request(overrides = {}) {
  return new Request("http://localhost/api/patients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: "Örnek Danışan",
      phone: "0532 123 45 67",
      age: "",
      hasTherapyHistory: "",
      availabilityNotes: "",
      alternativeDaysOkay: "",
      ...overrides,
    }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  db.user.mockResolvedValue({ id: "admin", role: "ADMIN" });
  db.limit.mockResolvedValue(true);
  db.find.mockResolvedValue([]);
  db.create.mockResolvedValue({ id: "patient" });
});
it("normalizes phone, preserves unknown optional values and audits without personal data", async () => {
  expect((await POST(request())).status).toBe(201);
  expect(db.create).toHaveBeenCalledWith({
    data: {
      displayName: "Örnek Danışan",
      phone: "+905321234567",
      age: null,
      hasTherapyHistory: null,
      availabilityNotes: null,
      alternativeDaysOkay: null,
    },
    select: { id: true },
  });
  expect(db.audit).toHaveBeenCalledWith({
    data: {
      actorId: "admin",
      action: "patient_created_manually",
      entityType: "Patient",
      entityId: "patient",
      metadata: { source: "manual" },
    },
  });
});
it.each(["INTERN", "THERAPIST"])("denies creation for %s", async (role) => {
  db.user.mockResolvedValue({ id: "staff", role });
  expect((await POST(request())).status).toBe(403);
  expect(db.create).not.toHaveBeenCalled();
});
it.each([{ phone: "123" }, { displayName: "Örnek" }, { age: "-1" }, { age: "121" }])(
  "rejects invalid intake %j",
  async (input) => {
    expect((await POST(request(input))).status).toBe(400);
    expect(db.create).not.toHaveBeenCalled();
  },
);
it("detects equivalent names and legacy telephone formatting without changing the existing record", async () => {
  db.find.mockResolvedValue([
    { id: "existing", displayName: "ÖRNEK DANIŞAN", phone: "0532 123 45 67" },
  ]);
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ existingId: "existing" });
  expect(db.create).not.toHaveBeenCalled();
});
it("allows family members sharing a telephone number", async () => {
  db.find.mockResolvedValue([
    { id: "existing", displayName: "Başka Kişi", phone: "+905321234567" },
  ]);
  expect((await POST(request())).status).toBe(201);
});
it("limits requests before writing", async () => {
  db.limit.mockResolvedValue(false);
  expect((await POST(request())).status).toBe(429);
  expect(db.create).not.toHaveBeenCalled();
});
