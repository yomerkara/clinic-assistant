import { getEnv } from "@/lib/env";
import { currentModelConfiguration } from "@/lib/usage/configuration";
import { catalogConfiguration, catalogModel } from "@/lib/usage/catalog";
import { assertUsageBudgetAvailable } from "@/lib/usage/record";
import { OpenAiLlm } from "./openai";
import { ModelCallError } from "./types";

export type ModelTask = "understand" | "answer" | "review" | "legacy";
export async function taskModelConfiguration(task: ModelTask, modelId?: string) {
  const override =
    modelId ??
    (task === "legacy" ? "" : process.env[`AI_${task.toUpperCase()}_MODEL`]?.trim());
  if (!override) return currentModelConfiguration();
  const model = catalogModel(override);
  if (!model) throw new ModelCallError("Görev modeli izin verilen katalogda yok.");
  return catalogConfiguration(model);
}

export async function createTaskLlm(task: ModelTask, modelId?: string) {
  const config = await taskModelConfiguration(task, modelId);
  await assertUsageBudgetAvailable(config.pricing);
  const env = getEnv();
  const gateway = process.env.AI_GATEWAY === "litellm";
  const apiKey = gateway ? process.env.AI_GATEWAY_KEY : env.OPENAI_API_KEY;
  const baseUrl = gateway ? process.env.AI_GATEWAY_URL : env.LLM_BASE_URL;
  if (!apiKey || !config.model || (gateway && !baseUrl))
    throw new ModelCallError("AI bağlantı yapılandırması eksik.");
  return new OpenAiLlm({
    apiKey,
    baseUrl,
    model: config.model,
    pricing: config.pricing,
    answerOnly: task !== "legacy",
    fetchImpl: gateway
      ? async (url, init) => {
          const body = JSON.parse(String(init?.body));
          body.metadata = { ...body.metadata, santa_task: task };
          return fetch(url, { ...init, body: JSON.stringify(body) });
        }
      : undefined,
  });
}
