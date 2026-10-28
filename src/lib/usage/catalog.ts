import type { AiTier, PricingSnapshot } from "./tiers";

// Supplier catalog supplied by the operator on 2026-10-05. USD / million tokens.
export const CATALOG_VERSION = "operator-catalog-2026-10-08";
export type CatalogModel = {
  id: string;
  provider: string;
  input: number;
  output: number;
  tier: AiTier;
};
const entries: Array<[string, string, number, number]> = [
  ["qwen-3.6-35b-sovereign", "adesso", 0, 0],
  ["deepseek-v4-flash-sovereign", "adesso", 0, 0],
  ["claude-opus-5-5", "Google", 4.4, 22],
  ["claude-opus-5", "Google", 5.5, 27.5],
  ["claude-opus-4-5", "Google", 5.5, 27.5],
  ["claude-sonnet-4-5", "Google", 3.3, 16.5],
  ["claude-haiku-4-5", "Google", 1.1, 5.5],
  // Operator-confirmed provider tariff, 2026-10-08 (not Anthropic direct pricing).
  ["claude-haiku-5-5", "Google", 0.11, 0.55],
  ["claude-opus-4-6", "Google", 5.5, 27.5],
  ["claude-sonnet-4-6", "Google", 3.3, 16.5],
  ["claude-sonnet-5-5", "Google", 2.2, 11],
  ["claude-sonnet-5", "Google", 2.2, 11],
  ["claude-opus-4-7", "Google", 5.5, 27.5],
  ["claude-opus-4-8", "Google", 5.5, 27.5],
  ["claude-fable-5-1", "Google", 11, 55],
  ["gemini-3.5-flash", "Google", 1.65, 9.9],
  ["gemini-3.6-flash", "Google", 0.83, 4.13],
  ["gemini-3.7-flash", "Google", 0.83, 4.13],
  ["gemini-3.8-flash", "Google", 0.83, 4.13],
  ["gemini-3.5-flash-lite", "Google", 0.33, 2.75],
  ["google/gemma-4-31b-it", "StackIT", 0.53, 0.77],
  ["llama-3-3-70b", "StackIT", 0.53, 0.77],
  ["qwen3.8-27b", "StackIT", 0.53, 0.77],
  ["gpt-5-nano", "Azure", 0.06, 0.44],
  ["gpt-5.6-sol", "Azure", 4.4, 22],
  ["gpt-5.6-terra", "Azure", 2.2, 13.2],
  ["gpt-5.6-luna", "Azure", 0.22, 1.32],
  ["gpt-6-sol", "Azure", 2.4, 12],
  ["gpt-6.1-sol", "Azure", 2.4, 12],
  ["gpt-6-luna", "Azure", 0.12, 0.6],
  ["gpt-oss-120b", "AWS", 0.2, 0.79],
  ["gpt-oss-20b", "AWS", 0.09, 0.4],
  ["qwen3-coder-480b", "AWS", 0.45, 1.8],
  ["qwen3-235b", "AWS", 0.22, 0.88],
  ["devstral-2-123b", "AWS", 0.48, 2.4],
  ["nemotron-3-super-120b", "AWS", 0.18, 0.78],
  ["nova-2-lite", "AWS", 0.43, 3.6],
];
export const MODEL_CATALOG: CatalogModel[] = entries.map(
  ([id, provider, input, output]) => ({
    id,
    provider,
    input,
    output,
    tier: output >= 22 ? "ADVANCED" : output > 3 ? "BALANCED" : "ECONOMY",
  }),
);
export function catalogModel(id: unknown) {
  return MODEL_CATALOG.find((model) => model.id === id);
}
export function catalogConfiguration(model: CatalogModel) {
  return {
    model: model.id,
    pricing: {
      tier: model.tier,
      version: CATALOG_VERSION,
      providerInput: model.input,
      providerOutput: model.output,
      customerInput: model.input,
      customerOutput: model.output,
      configured: true,
      providerConfigured: true,
    } satisfies PricingSnapshot,
  };
}
