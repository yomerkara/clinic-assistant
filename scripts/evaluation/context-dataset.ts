import { mkdir, writeFile } from "node:fs/promises";
import dataset from "../../src/lib/evaluation/data/context-review-v2.json";
import { OpenAiLlm } from "../../src/lib/llm/openai";
import {
  CONTEXT_REVIEW_VERSION,
  type ContextReviewInput,
} from "../../src/lib/llm/context-review";

async function main() {
  const model = process.env.EVAL_MODEL || "qwen-3.6-35b-sovereign";
  const directory = process.env.EVAL_OUTPUT_DIR || "artifacts/context-dataset-v2-2026-10-08";
  const llm = new OpenAiLlm({
    model,
    answerOnly: true,
    apiKey: process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || "",
    baseUrl: process.env.LLM_BASE_URL || process.env.LLM_API_BASE,
  });
  const rows = dataset.examples.filter((r) => r.split === "holdout");
  const results: Record<string, unknown>[] = [];
  await mkdir(directory, { recursive: true });
  for (const [index, row] of rows.entries()) {
    // Counterbalance order to reduce time/load bias; no tuning on this set.
    for (const examples of index % 2 ? [true, false] : [false, true]) {
      let result;
      try {
        result = await llm.reviewContext(row.input as ContextReviewInput, { examples });
      } catch {
        result = { status: "unavailable", verdict: null };
      }
      const match = result.verdict?.decision === row.expected.decision;
      const issueMatch =
        row.expected.decision !== "FLAG" ||
        row.expected.issueCodes.some((code) =>
          result.verdict?.issues.some((i) => i.code === code),
        );
      results.push({
        id: row.id,
        groupId: row.groupId,
        examples,
        expected: row.expected,
        ...result,
        decisionMatch: match,
        issueMatch: match && issueMatch,
      });
      console.log(
        row.id,
        examples ? "examples" : "baseline",
        result.status,
        result.verdict?.decision ?? "none",
        match,
      );
      await writeFile(
        `${directory}/holdout-${model}.json`,
        JSON.stringify(
          {
            model,
            datasetVersion: dataset.version,
            promptVersion: CONTEXT_REVIEW_VERSION,
            results,
          },
          null,
          2,
        ),
      );
    }
  }
}
main().catch(() => {
  console.error("Dataset evaluation failed");
  process.exitCode = 1;
});
