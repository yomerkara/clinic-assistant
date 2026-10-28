import { expect, it } from "vitest";
import dataset from "@/lib/evaluation/data/context-review-v2.json";
import { contextExamplePrompt, selectContextExamples } from "./context-examples";
import type { ContextReviewInput } from "./context-review";
import { OpenAiLlm } from "./openai";

const rows = dataset.examples;
it("keeps paired cases together and prevents reference/holdout leakage", () => {
  expect(rows).toHaveLength(106);
  expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  for (const group of new Set(rows.map((r) => r.groupId))) {
    const members = rows.filter((r) => r.groupId === group);
    expect(new Set(members.map((r) => r.split)).size).toBe(1);
    if (members.length === 2)
      expect(members.map((r) => r.expected.decision).sort()).toEqual(["FLAG", "PASS"]);
  }
  const ref = rows.filter((r) => r.split === "reference");
  for (const row of rows.filter((r) => r.split === "holdout")) {
    expect(ref.some((r) => r.input.inbound === row.input.inbound)).toBe(false);
    const selected = selectContextExamples(row.input as ContextReviewInput);
    expect(selected.length).toBeLessThanOrEqual(4);
    expect(selected.every((r) => r.split === "reference")).toBe(true);
    expect(JSON.stringify(selected).length).toBeLessThanOrEqual(14000);
  }
});
it("retrieves both the mistake and corrected answer for a relevant question", () => {
  const row = rows.find((r) => r.id === "r04-address-loop-pass")!;
  const selected = selectContextExamples(row.input as ContextReviewInput);
  expect(selected.map((r) => r.id)).toContain("r04-address-loop-flag");
  expect(selected.map((r) => r.id)).toContain("r04-address-loop-pass");
  expect(contextExamplePrompt(row.input as ContextReviewInput).text).toContain(
    "MUST NEVER support claims",
  );
});
it("supports a real off switch and records the exact supplied example IDs", async () => {
  const input = rows[0].input as ContextReviewInput;
  const requests: string[] = [];
  const llm = new OpenAiLlm({
    apiKey: "test",
    model: "test",
    fetchImpl: async (_url, init) => {
      requests.push(String(init?.body));
      return Response.json({
        choices: [{ message: { content: '{"decision":"PASS","issues":[]}' } }],
      });
    },
  });
  const off = await llm.reviewContext(input, { examples: false });
  const on = await llm.reviewContext(input, { examples: true });
  expect(off.exampleIds).toEqual([]);
  expect(on.exampleIds.length).toBeGreaterThan(0);
  expect(requests[0]).not.toContain("Curated behavioral examples");
  expect(requests[1]).toContain("Curated behavioral examples");
});

it("includes paired recent incidents with useful retrieval and keeps new controls held out", () => {
  for (const group of [
    "r29-polite-fullname",
    "r30-calendar-not-clinical",
    "r31-demo-affiliation",
    "r32-explicit-booking-mixed",
    "r33-remember-therapist",
    "r34-working-hours-clock",
    "r35-mixed-name-answer",
    "r36-preserve-both-requests",
  ]) {
    const pair = rows.filter((row) => row.groupId === group);
    expect(pair).toHaveLength(2);
    expect(pair.every((row) => row.split === "reference")).toBe(true);
    expect(pair.find((row) => row.expected.decision === "PASS")?.input.candidate).toBe(
      pair[0].expected.desiredBehavior,
    );
    const selected = selectContextExamples(pair[0].input as ContextReviewInput);
    expect(selected.some((row) => row.groupId === group)).toBe(true);
  }
  expect(rows.filter((row) => /^h(?:17|18|19|20)-/.test(row.groupId))).toHaveLength(8);
});
