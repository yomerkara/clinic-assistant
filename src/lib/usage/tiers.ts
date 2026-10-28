export const tierLabels = {
  ECONOMY: "Ekonomik",
  BALANCED: "Dengeli",
  ADVANCED: "Gelişmiş",
} as const;
export type AiTier = keyof typeof tierLabels;
export type PricingSnapshot = {
  tier: AiTier;
  version: string;
  providerInput: number;
  providerOutput: number;
  customerInput: number;
  customerOutput: number;
  configured: boolean;
  providerConfigured: boolean;
};
function rate(name: string, source: Record<string, string | undefined>) {
  const raw = source[name];
  const value = Number(raw);
  return raw?.trim() && Number.isFinite(value) && value >= 0 ? value : null;
}
export function activeTier(
  source: Record<string, string | undefined> = process.env,
): AiTier {
  const tier = source.AI_TIER ?? "BALANCED";
  if (!(tier in tierLabels)) throw new Error("Invalid AI_TIER");
  return tier as AiTier;
}
export function tierConfiguration(
  tier = activeTier(),
  source: Record<string, string | undefined> = process.env,
) {
  const prefix = `AI_${tier}_`;
  const providerInput = rate(`${prefix}PROVIDER_INPUT_USD`, source);
  const providerOutput = rate(`${prefix}PROVIDER_OUTPUT_USD`, source);
  const customerInput = rate(`${prefix}CUSTOMER_INPUT_USD`, source);
  const customerOutput = rate(`${prefix}CUSTOMER_OUTPUT_USD`, source);
  const model =
    source[`${prefix}MODEL`]?.trim() ||
    (tier === "BALANCED" ? source.LLM_MODEL?.trim() || "gpt-4o-mini" : "");
  return {
    model,
    pricing: {
      tier,
      version: source[`${prefix}TARIFF_VERSION`]?.trim() || "unconfigured",
      providerInput: providerInput ?? 0,
      providerOutput: providerOutput ?? 0,
      customerInput: customerInput ?? 0,
      customerOutput: customerOutput ?? 0,
      configured: customerInput !== null && customerOutput !== null,
      providerConfigured: providerInput !== null && providerOutput !== null,
    } satisfies PricingSnapshot,
  };
}
export function tierLabel(value: string) {
  return tierLabels[value as AiTier] ?? "Önceki kullanım";
}
