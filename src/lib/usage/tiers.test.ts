import { it, expect } from "vitest";
import { activeTier, tierConfiguration, tierLabel } from "./tiers";
it("does not invent prices or a model for an unconfigured tier", () => {
  const config = tierConfiguration("ECONOMY", {});
  expect(config.model).toBe("");
  expect(config.pricing.configured).toBe(false);
  expect(tierLabel("LEGACY")).toBe("Önceki kullanım");
  expect(() => activeTier({ AI_TIER: "unknown" })).toThrow();
});
it("separates supplier costs from customer prices", () => {
  const config = tierConfiguration("BALANCED", {
    AI_BALANCED_MODEL: "private-model",
    AI_BALANCED_PROVIDER_INPUT_USD: "0.2",
    AI_BALANCED_PROVIDER_OUTPUT_USD: "0.8",
    AI_BALANCED_CUSTOMER_INPUT_USD: "1",
    AI_BALANCED_CUSTOMER_OUTPUT_USD: "3",
    AI_BALANCED_TARIFF_VERSION: "2026-10",
  });
  expect(config.pricing.configured).toBe(true);
  expect(config.pricing.providerInput).toBe(0.2);
  expect(config.pricing.customerInput).toBe(1);
  expect(config.pricing.version).toBe("2026-10");
});
