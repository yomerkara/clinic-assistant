import { beforeEach, expect, it, vi } from "vitest";
const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { clinicSettings: { findUnique } } }));
import { currentModelConfiguration } from "./configuration";
beforeEach(() => {
  vi.unstubAllEnvs();
  findUnique.mockReset();
});
it("reads a changed setting on the next call and preserves the previous price snapshot", async () => {
  findUnique
    .mockResolvedValueOnce({ aiModelId: "claude-sonnet-4-5" })
    .mockResolvedValueOnce({ aiModelId: "qwen-3.6-35b-sovereign" });
  const previous = await currentModelConfiguration();
  const next = await currentModelConfiguration();
  expect(next.model).toBe("qwen-3.6-35b-sovereign");
  expect(next.pricing.providerOutput).toBe(0);
  expect(previous.pricing.providerOutput).toBe(16.5);
});
it("preserves the environment model until an administrator chooses a model", async () => {
  vi.stubEnv("AI_TIER", "BALANCED");
  vi.stubEnv("AI_BALANCED_MODEL", "claude-sonnet-4-5");
  findUnique.mockResolvedValue(null);
  expect((await currentModelConfiguration()).model).toBe("claude-sonnet-4-5");
});
it("rejects an unknown saved model instead of silently using a different one", async () => {
  findUnique.mockResolvedValue({ aiModelId: "unknown" });
  await expect(currentModelConfiguration()).rejects.toThrow("not in the catalog");
});
