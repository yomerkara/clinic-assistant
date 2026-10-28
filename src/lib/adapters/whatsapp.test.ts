import { it, expect } from "vitest";
import { MemoryWhatsApp } from "./whatsapp";
it("does not reuse simulated delivery identifiers across restarts", async () => {
  const message = { phone: "test", text: "test", conversationId: "test" };
  const first = await new MemoryWhatsApp().sendMessage(message);
  const second = await new MemoryWhatsApp().sendMessage(message);
  expect(first.providerMessageId).not.toBe(second.providerMessageId);
});

it("deduplicates a retried logical message in the memory adapter", async () => {
  const adapter = new MemoryWhatsApp();
  const message = {
    phone: "test",
    text: "test",
    conversationId: "test",
    idempotencyKey: "cancel:action",
  };
  const first = await adapter.sendMessage(message);
  expect(await adapter.sendMessage(message)).toEqual(first);
  expect(adapter.sent).toHaveLength(1);
});
