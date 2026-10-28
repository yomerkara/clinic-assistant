import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, addSimulationTurn, saveConditions, loadSimulationThread } =
  vi.hoisted(() => ({
    requireUser: vi.fn(),
    addSimulationTurn: vi.fn(),
    saveConditions: vi.fn(),
    loadSimulationThread: vi.fn(),
  }));
vi.mock("@/lib/auth/session", () => ({ requireUser }));
vi.mock("@/lib/simulator/service", async () => {
  const actual = await import("@/lib/simulator/service");
  return {
    SIMULATOR_MESSAGE_LIMIT: actual.SIMULATOR_MESSAGE_LIMIT,
    addSimulationTurn,
    saveConditions,
    loadSimulationThread,
    resetSimulation: vi.fn(),
  };
});
import { POST } from "./route";
import { SIMULATOR_MESSAGE_LIMIT } from "@/lib/simulator/service";

const post = (body: string) =>
  POST(
    new Request("https://clinic.example/api/simulator", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  );

beforeEach(() => {
  requireUser.mockResolvedValue({ id: "user_admin", role: "ADMIN" });
  addSimulationTurn.mockResolvedValue({ conditions: {}, turns: [] });
  saveConditions.mockResolvedValue({ conditions: {}, turns: [] });
});
afterEach(() => vi.clearAllMocks());

describe("simulator request boundaries", () => {
  it("rejects a malformed body as a client error instead of failing", async () => {
    const response = await post('{"intent":');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_json" });
    expect(addSimulationTurn).not.toHaveBeenCalled();
  });

  it("rejects a body that is not an object", async () => {
    expect((await post('"merhaba"')).status).toBe(400);
    expect((await post("[]")).status).toBe(400);
    expect(addSimulationTurn).not.toHaveBeenCalled();
  });

  it("rejects an unusable scenario value with the offending field", async () => {
    const response = await post(
      JSON.stringify({ intent: "conditions", conditions: { scenario: "not-a-scenario" } }),
    );
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string; issues: string[] };
    expect(payload.error).toBe("invalid_conditions");
    expect(payload.issues).toContain("scenario");
    expect(saveConditions).not.toHaveBeenCalled();
  });

  it("refuses an empty message", async () => {
    expect((await post(JSON.stringify({ text: "   " }))).status).toBe(400);
    expect(addSimulationTurn).not.toHaveBeenCalled();
  });

  it("refuses a message past the stored-thread limit", async () => {
    const response = await post(
      JSON.stringify({ text: "a".repeat(SIMULATOR_MESSAGE_LIMIT + 1) }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("too_long");
    expect(addSimulationTurn).not.toHaveBeenCalled();
  });

  it("accepts a message at the limit", async () => {
    const response = await post(
      JSON.stringify({ text: "a".repeat(SIMULATOR_MESSAGE_LIMIT) }),
    );
    expect(response.status).toBe(200);
    expect(addSimulationTurn).toHaveBeenCalledOnce();
  });

  it("keeps the simulator closed to non-administrators", async () => {
    for (const role of ["INTERN", "THERAPIST"]) {
      requireUser.mockResolvedValue({ id: "user_other", role });
      const response = await post(JSON.stringify({ text: "merhaba" }));
      expect(response.status).toBe(403);
    }
    expect(addSimulationTurn).not.toHaveBeenCalled();
  });
});
