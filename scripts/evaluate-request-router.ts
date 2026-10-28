import { currentModelConfiguration } from "../src/lib/usage/configuration";
import { writeFile, mkdir } from "node:fs/promises";
import { OpenAiLlm } from "../src/lib/llm/openai";
import { PROMPT_VERSION } from "../src/lib/llm/types";
import { getEnv } from "../src/lib/env";
import { catalogConfiguration, catalogModel } from "../src/lib/usage/catalog";
import { assertUsageBudgetAvailable, recordModelUsage } from "../src/lib/usage/record";
import { applyClinicRules } from "../src/lib/simulator/rules";
import { verifyDiagnosis } from "../src/lib/llm/verify-diagnosis";
import { prisma } from "../src/lib/prisma";

async function main() {
  const env = getEnv();
  const model = catalogModel(
    process.env.EVAL_MODEL ?? (await currentModelConfiguration()).model,
  );
  if (!model) throw new Error("Unknown evaluation model");
  const config = catalogConfiguration(model);
  const llm = new OpenAiLlm({
    apiKey: env.OPENAI_API_KEY!,
    baseUrl: env.LLM_BASE_URL,
    model: config.model,
    pricing: config.pricing,
    timeoutMs: process.env.EVAL_TIMEOUT_MS
      ? Number(process.env.EVAL_TIMEOUT_MS)
      : undefined,
  });
  // Invented fixture only: no patient, conversation, or clinic documents are read.
  const knowledge = [
    {
      id: "kd_therapists",
      title: "Sentetik test uzmanları",
      content:
        "Psikolog Deniz Test — genel yetişkin danışmanlığı.\nPsikolog Ekin Örnek — aile danışmanlığı.",
      source: "synthetic-evaluation",
      version: 1,
    },
  ];
  const inputs: Array<{ text: string; expected: string[]; suitability?: boolean }> = [
    {
      text: "İlk randevumu almak istiyorum. Terapistleriniz hakkında bilgi alabilir miyim ve ücretler nasıl?",
      expected: ["THERAPIST_INFO", "PRICE_REQUEST", "NEW_BOOKING"],
    },
    {
      text: "Faturamı iletir misiniz, ayrıca yeni seans ücretini öğrenmek istiyorum.",
      expected: ["INVOICE_REQUEST", "PRICE_REQUEST"],
    },
    {
      text: "Deniz Test ile randevu alacağım, bu arada EMDR nedir?",
      expected: ["THERAPY_INFO", "NEW_BOOKING"],
    },
  ];
  inputs.push({
    text: "İlk kez treapiye geleceğim, Deniz Test'i tavsiye ettiler.",
    expected: ["NEW_BOOKING"],
  });
  inputs.push({
    text: "Deniz Test'in çalışma alanlarından bahsedebilir misiniz, benim için uygun mu bilmiyorum.",
    expected: [],
    suitability: true,
  });
  const results = [];
  for (const item of inputs.filter(
    (_, index) => !process.env.EVAL_CASE || index === Number(process.env.EVAL_CASE),
  )) {
    await assertUsageBudgetAvailable(config.pricing);
    const result = await llm.complete({
      inbound: item.text,
      history: [],
      nowIso: "2026-10-07T14:00:00Z",
      appointmentsSummary: "Mevcut randevu yok.",
      knowledge,
      modelVersion: PROMPT_VERSION,
      sessionNotes:
        "Sentetik yazılım testi. Hasta adı henüz bilinmiyor. Verilen belgeler sadece bu testin onaylı bilgi kaynağıdır.",
    });
    await recordModelUsage(result, {});
    console.log(`Generation ${config.model}: ${result.latencyMs}ms`);
    const candidate = applyClinicRules({
      llm: result,
      inbound: item.text,
      now: new Date("2026-10-07T14:00:00Z"),
      timeZone: "Europe/Istanbul",
      calendarAvailable: false,
      knowledge,
      fixture: {
        patients: [{ name: "Yeni Hasta", phone: "synthetic" }],
        appointments: [],
        selectedTherapistName: result.turn.entities.therapistName ?? null,
        intake: {
          hasFullName: false,
          age: null,
          hasTherapyHistory: null,
          availabilityNotes: null,
          alternativeDaysOkay: null,
        },
      },
    });
    const checked = await verifyDiagnosis(candidate, llm, knowledge, {});
    const kinds = checked.routing?.map((r) => r.kind) ?? [];
    const pass =
      item.expected.every((kind) => kinds.includes(kind as (typeof kinds)[number])) &&
      (item.suitability
        ? checked.botStopped && !checked.action &&
          checked.outbound.includes("genel yetişkin danışmanlığı") &&
          checked.outbound.includes("talebinizi ekibimize iletiyorum") &&
          checked.grounding?.supported === true
        : !checked.botStopped) &&
      checked.contentSafety?.status === "passed";
    results.push({
      input: item.text,
      pass,
      routing: checked.routing,
      candidate: candidate.outbound,
      requests: result.turn.requests,
      output: checked.outbound,
      safety: checked.contentSafety,
      grounding: checked.grounding,
      action: checked.action?.type,
      additionalActions: checked.additionalActions?.map((a) => a.type),
    });
    console.log(`${pass ? "PASS" : "FAIL"} ${item.text}\n${checked.outbound}`);
  }
  await mkdir("artifacts/ai-improvements-2026-10-07", { recursive: true });
  await writeFile(
    "artifacts/ai-improvements-2026-10-07/request-router-evaluation.json",
    JSON.stringify(
      {
        model: config.model,
        prompt: PROMPT_VERSION,
        scope: "Synthetic routing smoke test, no patient/calendar writes",
        results,
      },
      null,
      2,
    ),
  );
  if (results.some((r) => !r.pass)) process.exitCode = 1;
}
main()
  .catch((error) => {
    let detail = String(error.detail ?? "");
    for (const secret of [process.env.OPENAI_API_KEY, process.env.LLM_API_KEY]) {
      if (secret) detail = detail.replaceAll(secret, "[redacted]");
    }
    console.error(error.message, detail.slice(0, 500));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
