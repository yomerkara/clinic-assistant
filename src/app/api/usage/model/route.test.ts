import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  upsert: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/http", () => ({ publicOrigin: () => "http://localhost:3000" }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/usage/verify-model", () => ({ verifyModel: vi.fn() }));
import { verifyModel } from "@/lib/usage/verify-model";
import { POST } from "./route";
function request(id: string) {
  const body = new FormData();
  body.set("modelId", id);
  return new Request("http://localhost:3000/api/usage/model", { method: "POST", body });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyModel).mockResolvedValue({} as Awaited<ReturnType<typeof verifyModel>>);
  mocks.user.mockResolvedValue({ id: "admin", role: "ADMIN" });
  mocks.transaction.mockImplementation((fn) =>
    fn({ clinicSettings: { upsert: mocks.upsert }, auditEvent: { create: mocks.audit } }),
  );
});
it.each(["INTERN", "THERAPIST"])("rejects model changes by %s", async (role) => {
  mocks.user.mockResolvedValue({ id: "user", role });
  expect((await POST(request("claude-sonnet-5-5"))).status).toBe(403);
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("rejects arbitrary IDs without a database write", async () => {
  expect(
    (await POST(request("text-embedding-3-large"))).headers.get("location"),
  ).toContain("model=invalid");
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("saves model and audit together using server-owned prices", async () => {
  expect((await POST(request("claude-sonnet-5-5"))).headers.get("location")).toContain(
    "model=saved",
  );
  expect(mocks.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ update: { aiModelId: "claude-sonnet-5-5" } }),
  );
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ inputUsd: 2.2, outputUsd: 11 }),
      }),
    }),
  );
});

it("preserves the active model when the provider rejects the test", async () => {
  vi.mocked(verifyModel).mockRejectedValue(new Error("unsupported model"));
  expect((await POST(request("claude-sonnet-5-5"))).headers.get("location")).toContain(
    "model=failed",
  );
  expect(mocks.transaction).not.toHaveBeenCalled();
});
