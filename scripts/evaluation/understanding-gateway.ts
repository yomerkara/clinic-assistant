import { mkdir, writeFile } from "node:fs/promises";
import dataset from "../../src/lib/evaluation/data/understanding-v1.json";
import { OpenAiLlm } from "../../src/lib/llm/openai";
import type { UnderstandingInput } from "../../src/lib/llm/understanding";
import { catalogConfiguration, catalogModel } from "../../src/lib/usage/catalog";

async function main() {
  const output = process.env.EVAL_OUTPUT_DIR || "artifacts/gateway-2026-10-08";
  await mkdir(output, { recursive: true });
  const results = [];
  for (const model of (
    process.env.EVAL_UNDERSTANDING_MODELS || "claude-sonnet-4-5,qwen-3.6-35b-sovereign"
  ).split(",")) {
    const config = catalogConfiguration(catalogModel(model)!);
    const llm = new OpenAiLlm({
      model,
      pricing: config.pricing,
      answerOnly: true,
      apiKey: process.env.AI_GATEWAY_KEY!,
      baseUrl: process.env.AI_GATEWAY_URL || "http://127.0.0.1:4001/v1",
      fetchImpl: async (url, init) => {
        const body = JSON.parse(String(init?.body));
        body.metadata = { santa_task: "understand" };
        return fetch(url, { ...init, body: JSON.stringify(body) });
      },
    });
    for (const row of dataset.cases) {
      const started = Date.now();
      try {
        const result = await llm.understand(row.input as UnderstandingInput);
        const actual = result.interpretation;
        const failures: string[] = [];
        if (!actual) failures.push(result.status);
        else {
          for (const intent of row.expected.intents)
            if (!actual.intents.includes(intent as never))
              failures.push(`intent:${intent}`);
          for (const [name, value] of Object.entries(row.expected.fields)) {
            const found = actual.fields.find((f) => f.name === name)?.value;
            // The availability field is a verbatim span; extra punctuation is acceptable.
            if (
              name === "availabilityNotes"
                ? !(typeof found === "string" && found.includes(String(value)))
                : found !== value
            )
              failures.push(`field:${name}`);
          }
          for (const name of row.expected.absentFields)
            if (actual.fields.some((f) => f.name === name))
              failures.push(`invented:${name}`);
          for (const topic of row.expected.questions)
            if (!actual.questions.some((q) => q.topic === topic))
              failures.push(`question:${topic}`);
          if (
            row.expected.clarify !== null &&
            actual.needsClarification !== row.expected.clarify
          )
            failures.push("clarification");
        }
        results.push({ id: row.id, ...result, failures, pass: !failures.length });
        console.log(model, row.id, result.status, failures);
      } catch {
        results.push({
          id: row.id,
          model,
          status: "unavailable",
          pass: false,
          latencyMs: Date.now() - started,
        });
        console.log(model, row.id, "unavailable");
      }
      await writeFile(
        `${output}/understanding-comparison.json`,
        JSON.stringify({ datasetVersion: dataset.version, results }, null, 2),
      );
    }
  }
}
main().catch(() => {
  console.error("Understanding evaluation failed");
  process.exitCode = 1;
});
