import { describe, expect, it } from "vitest";
import {
  applyHonorific,
  addressedName,
  ensureHonorificGreeting,
  honorificForName,
} from "./honorific";

describe("honorific", () => {
  it.each([
    "Merhaba Ayşe Kara, hoş geldiniz.",
    "Merhaba Ayşe Hanım Kara, hoş geldiniz.",
    "Merhaba Ayşe Kara Hanım, hoş geldiniz.",
  ])("uses only the first name and title in a full-name greeting: %s", (reply) => {
    expect(ensureHonorificGreeting(reply, "ayşe kara")).toBe(
      "Merhaba Ayşe Hanım, hoş geldiniz.",
    );
  });
  it("does not insert an honorific inside another word or name", () => {
    expect(
      applyHonorific("Kaliteli hizmet. Aliye Hanım ile görüşebilirsiniz.", "Ali Kara"),
    ).toBe("Kaliteli hizmet. Aliye Hanım ile görüşebilirsiniz.");
  });
  it("uses Bey or Hanım when the first name is gendered", () => {
    expect(honorificForName("Ömer")).toBe("Bey");
    expect(honorificForName("Ayşe")).toBe("Hanım");
    expect(honorificForName("Elifnur")).toBe("Hanım");
    expect(addressedName("Ömer")).toBe("Ömer Bey");
    expect(applyHonorific("Merhaba Ömer, Santa Psikoloji’ye hoş geldiniz.", "Ömer")).toBe(
      "Merhaba Ömer Bey, Santa Psikoloji’ye hoş geldiniz.",
    );
  });

  it("does not guess for unisex names", () => {
    expect(honorificForName("Deniz")).toBeNull();
    expect(
      applyHonorific("Merhaba Deniz Bey, randevu talebiniz alındı.", "Deniz Kaya"),
    ).toBe("Merhaba, randevu talebiniz alındı.");
  });

  it("adds Hanım or Bey to a bare greeting", () => {
    expect(
      ensureHonorificGreeting("Merhaba, size nasıl yardımcı olabiliriz?", "Ömer"),
    ).toBe("Merhaba Ömer Bey, size nasıl yardımcı olabiliriz?");
  });

  it("does not repeat the honorific when the name is already in the greeting", () => {
    expect(
      ensureHonorificGreeting("Merhaba Ömer, size nasıl yardımcı olabiliriz?", "Ömer"),
    ).toBe("Merhaba Ömer Bey, size nasıl yardımcı olabiliriz?");
  });
});
