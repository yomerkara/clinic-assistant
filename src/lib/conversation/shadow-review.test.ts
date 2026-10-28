import { afterEach, expect, it, vi } from "vitest";
import { observeReply } from "./shadow-review";
import { prisma } from "@/lib/prisma";
import type { SimulationDiagnosis } from "@/lib/simulator/rules";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: { findUniqueOrThrow: vi.fn() },
    auditEvent: { create: vi.fn(), findFirst: vi.fn() },
  },
}));
const input = {
  conversationId: "demo",
  messageId: "message",
  inbound: "merhaba",
  diagnosis: { outbound: "Merhaba" } as SimulationDiagnosis,
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
it("off performs no reads, model calls or writes", async () => {
  vi.stubEnv("CONTEXT_REVIEW", "off");
  await observeReply(input);
  expect(prisma.conversation.findUniqueOrThrow).not.toHaveBeenCalled();
  expect(prisma.auditEvent.create).not.toHaveBeenCalled();
});
it("does not review WhatsApp traffic", async () => {
  vi.stubEnv("CONTEXT_REVIEW", "shadow");
  vi.mocked(prisma.conversation.findUniqueOrThrow).mockResolvedValue({
    source: "whatsapp",
  } as never);
  await observeReply(input);
  expect(prisma.auditEvent.findFirst).not.toHaveBeenCalled();
  expect(prisma.auditEvent.create).not.toHaveBeenCalled();
});
it("review and audit failures cannot change or reject the reply", async () => {
  vi.stubEnv("CONTEXT_REVIEW", "shadow");
  vi.mocked(prisma.conversation.findUniqueOrThrow).mockRejectedValue(
    new Error("offline"),
  );
  vi.mocked(prisma.auditEvent.create).mockRejectedValue(new Error("offline"));
  const before = structuredClone(input);
  await expect(observeReply(input)).resolves.toBeUndefined();
  expect(input).toEqual(before);
});
