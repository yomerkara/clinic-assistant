import { describe, expect, it } from "vitest";
import { parseDelayNotice } from "./delay";

describe("delay notice", () => {
  it("extracts minutes from a late-arrival message", () => {
    expect(parseDelayNotice("5 dk gecikeceğim")).toEqual({
      minutes: 5,
      note: "Hasta yaklaşık 5 dakika gecikeceğini bildirdi.",
    });
    expect(parseDelayNotice("Yaklaşık 10 dakika geç kalacağım")?.minutes).toBe(10);
  });

  it("accepts a delay notice without a duration", () => {
    expect(parseDelayNotice("Biraz gecikebilirim")?.minutes).toBeNull();
  });

  it("does not match unrelated uses of geç", () => {
    expect(parseDelayNotice("Geçmiş randevumu görmek istiyorum")).toBeNull();
  });

  it.each([
    "Gecikmeyeceğim",
    "Gecikirsem ne olur?",
    "10 dk gecikeceğim, randevumu iptal edin",
    "5 dk gecikeceğim, kendime zarar vermek istiyorum",
    "Gecikeceğim, bir çalışanla görüşmek istiyorum",
    "Eşim 10 dakika gecikecek",
    "Gecikeceğim, ücret ne kadar?",
  ])("does not swallow another intent: %s", (text) => {
    expect(parseDelayNotice(text)).toBeNull();
  });
});
