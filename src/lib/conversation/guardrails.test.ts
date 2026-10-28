import { describe, expect, it } from "vitest";
import { isConversationClosing } from "./guardrails";

describe("conversation closing", () => {
  it("recognizes short thanks and farewells", () => {
    expect(isConversationClosing("tamamdır teşekkürler")).toBe(true);
    expect(isConversationClosing("Görüşürüz! ")).toBe(true);
  });

  it("does not close when the patient still requests an action", () => {
    expect(isConversationClosing("Tamam, randevu alalım")).toBe(false);
  });
});
