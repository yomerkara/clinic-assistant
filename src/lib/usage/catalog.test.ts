import { expect, it } from "vitest";
import { MODEL_CATALOG, catalogConfiguration, catalogModel } from "./catalog";

it("accepts only conversational catalog IDs, including provider-qualified IDs", () => {
  expect(new Set(MODEL_CATALOG.map((m) => m.id)).size).toBe(MODEL_CATALOG.length);
  expect(catalogModel("google/gemma-4-31b-it")?.input).toBe(0.53);
  for (const id of [
    "gpt-image-1.5",
    "text-embedding-3-large",
    "claude-sonnet-5-5*",
    "unknown",
  ])
    expect(catalogModel(id)).toBeUndefined();
});
it("uses supplier prices without markup and treats free as configured", () => {
  const paid = catalogConfiguration(catalogModel("claude-sonnet-4-5")!);
  expect(paid.pricing.providerInput).toBe(3.3);
  expect(paid.pricing.customerOutput).toBe(16.5);
  const haiku = catalogConfiguration(catalogModel("claude-haiku-5-5")!);
  expect(haiku.pricing.providerInput).toBe(0.11);
  expect(haiku.pricing.customerOutput).toBe(0.55);
  const free = catalogConfiguration(catalogModel("qwen-3.6-35b-sovereign")!);
  expect(free.pricing.configured).toBe(true);
  expect(free.pricing.providerConfigured).toBe(true);
  expect(free.pricing.customerInput + free.pricing.customerOutput).toBe(0);
});
