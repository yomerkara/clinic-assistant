import { expect, it } from "vitest";
import dataset from "@/lib/evaluation/data/ui-review-100-v1.json";
import { uiReviewExamples } from "./ui-review-examples";
import { OpenAiLlm } from "./openai";
it("has 100 unique scenarios and never treats historical bot replies as gold", () => {
  expect(dataset.rows).toHaveLength(100);
  expect(new Set(dataset.rows.map((r) => r.id)).size).toBe(100);
  expect(dataset.rows.every((r) => r.historicalRepliesAreGold === false)).toBe(true);
});
it("retrieves bounded corrected behavior instead of replaying stale facts", () => {
  const examples = uiReviewExamples("Geçmiş terapi deneyimimi paylaşmak istemiyorum");
  expect(examples.ids).toContain("040");
  expect(examples.ids.length).toBeLessThanOrEqual(2);
  expect(examples.text).toContain("aynı soru tekrar sorulmaz");
});
it("provider payload excludes private profile/contact fields and uses reviewed examples", async () => {
  let payload = "";
  const llm = new OpenAiLlm({
    model: "test",
    apiKey: "test",
    fetchImpl: async (_url, init) => {
      payload = String(init?.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
        status: 200,
      });
    },
  });
  await llm.understand({
    inbound: "Geçmiş terapi deneyimimi paylaşmak istemiyorum. Telefonum 05321234567",
    history: [],
    stage: "INTAKE",
    known: { name: "Ayşe Kara", age: 29, hasTherapyHistory: false },
    nowIso: "2026-10-14T12:00:00Z",
  });
  expect(payload).not.toContain("05321234567");
  const body = JSON.parse(payload);
  const input = JSON.parse(body.messages[1].content);
  expect(input.known).toEqual({ name: "Ayşe Kara" });
  expect(body.messages[0].content).toContain("ui-review-100-v1");
});
