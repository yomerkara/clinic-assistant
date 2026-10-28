import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ user: vi.fn(), update: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: db.user,
  toActor: (u: { id: string; role: string }) => ({
    userId: u.id,
    role: u.role,
    therapistProfileId: null,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/http", () => ({ publicOrigin: () => "http://localhost:3000" }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (f: (tx: unknown) => unknown) =>
      f({ serviceRequest: { updateMany: db.update }, auditEvent: { create: db.audit } }),
  },
}));
import { POST } from "./route";
const call = (resolution = "Hasta ile görüşüldü, tercih kaydedildi.") =>
  POST(
    new Request("http://localhost:3000/api/service-requests/test", {
      method: "POST",
      body: new URLSearchParams({ resolution }),
    }),
    { params: Promise.resolve({ id: "test" }) },
  );
beforeEach(() => {
  vi.clearAllMocks();
  db.user.mockResolvedValue({ id: "admin", role: "ADMIN" });
  db.update.mockResolvedValue({ count: 1 });
});
it("denies intern resolution without a database write", async () => {
  db.user.mockResolvedValue({ id: "intern", role: "INTERN" });
  expect((await call()).status).toBe(403);
  expect(db.update).not.toHaveBeenCalled();
});
it("requires an actual resolution note", async () => {
  expect((await call(" ")).status).toBe(400);
  expect(db.update).not.toHaveBeenCalled();
});
it("records the reviewer and audit only after a successful update", async () => {
  expect((await call()).status).toBe(303);
  expect(db.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ resolvedById: "admin", status: "RESOLVED" }),
    }),
  );
  expect(db.audit).toHaveBeenCalledOnce();
});
it("does not audit or report success for an inaccessible or already closed request", async () => {
  db.user.mockResolvedValue({ id: "therapist", role: "THERAPIST" });
  db.update.mockResolvedValue({ count: 0 });
  expect((await call()).status).toBe(409);
  expect(db.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ conversation: { patient: { id: { in: [] } } } }),
    }),
  );
  expect(db.audit).not.toHaveBeenCalled();
});
const track = (fields: Record<string, string>) =>
  POST(
    new Request("http://localhost/api/service-requests/test", {
      method: "POST",
      body: new URLSearchParams({ intent: "track", progress: "IN_PROGRESS", ...fields }),
    }),
    { params: Promise.resolve({ id: "test" }) },
  );
it("stores progress and Istanbul follow-up without closing the request", async () => {
  expect((await track({ followUpAt: "2026-11-20T15:00" })).status).toBe(303);
  expect(db.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ status: "OPEN" }),
      data: {
        progress: "IN_PROGRESS",
        ownerId: null,
        followUpAt: new Date("2026-11-20T12:00:00Z"),
      },
    }),
  );
  expect(db.audit).toHaveBeenCalledOnce();
});
it("rejects malformed tracking states and dates", async () => {
  expect((await track({ progress: "RESOLVED" })).status).toBe(400);
  expect((await track({ followUpAt: "2026-02-31T12:00" })).status).toBe(400);
  expect(db.update).not.toHaveBeenCalled();
});
it("blocks therapists from assigning someone else and interns from tracking", async () => {
  db.user.mockResolvedValue({ id: "t", role: "THERAPIST" });
  expect((await track({ ownerId: "other" })).status).toBe(403);
  db.user.mockResolvedValue({ id: "i", role: "INTERN" });
  expect((await track({})).status).toBe(403);
  expect(db.update).not.toHaveBeenCalled();
});
