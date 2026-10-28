import { describe, expect, it } from "vitest";
import { decideScope, introducedName } from "./scope";

describe("clinic scope gate", () => {
  it("allows appointment and therapy messages", () => {
    expect(decideScope("EMDR seansı hakkında bilgi almak istiyorum").kind).toBe("clinic");
    expect(decideScope("Gelecek haftaki randevumu değiştirmek istiyorum").kind).toBe(
      "clinic",
    );
  });

  it("blocks unrelated messages before the LLM", () => {
    expect(decideScope("Bugün hava nasıl olacak?").kind).toBe("out_of_scope");
    expect(decideScope("Bana Python kodu yazar mısın?").kind).toBe("out_of_scope");
  });

  it("keeps greetings friendly without an LLM call", () => {
    expect(decideScope("Merhaba").kind).toBe("greeting");
    expect(decideScope("Merhaba, ben Ömer").kind).toBe("greeting");
    expect(decideScope("Selamlar ben Ömer").kind).toBe("greeting");
    expect(
      decideScope(
        "Merhabalar ben randevu almak istiyorum ama kime almam gerektiğini bilmiyorum",
      ).kind,
    ).toBe("clinic");
    expect(introducedName("Selamlar ben Ömer")).toBe("Ömer");
    expect(introducedName("Merhabalar ben randevu almak istiyorum")).toBe(null);
  });

  it("keeps contextual follow-ups inside the clinic flow", () => {
    expect(
      decideScope("Verdiğiniz hizmetlerin listesi var mı?", [
        "Santa Psikoloji ne hizmeti veriyor?",
      ]).kind,
    ).toBe("clinic");
    expect(
      decideScope("Haftaya salı", ["Hangi gün ve saatler sizin için uygun?"]).kind,
    ).toBe("clinic");
    expect(
      decideScope("Merhaba", ["Uygun saatler:\n1) 26 Ağustos Çarşamba 17:00"]).kind,
    ).toBe("clinic");
  });
});

describe("pure introduction routing", () => {
  it("does not turn an introduction into a booking because the bot mentioned appointments", async () => {
    const { isPureIntroduction } = await import("./scope");
    expect(isPureIntroduction("ben ömer")).toBe(true);
    for (const text of [
      "ben randevu istiyorum",
      "ben depresif hissediyorum",
      "ben panik atak",
      "ben hastayım",
    ]) {
      expect(isPureIntroduction(text)).toBe(false);
    }
  });
});
