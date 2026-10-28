import { expect, it, vi } from "vitest";
import { OpenAiLlm } from "./openai";
const input = {
  inbound: "randevu",
  history: [],
  nowIso: "2026-10-07T14:00:00Z",
  appointmentsSummary: "",
  knowledge: [],
  modelVersion: "test",
};
const valid = () =>
  Response.json({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            intent: "NEW_BOOKING",
            confidence: 0.9,
            reply: "Adınız?",
            entities: {},
            needsHandoff: false,
          }),
        },
      },
    ],
  });
it("retries a shared deployment's capacity failure once", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(new Response("busy", { status: 429 }))
    .mockResolvedValueOnce(valid());
  const llm = new OpenAiLlm({
    apiKey: "test",
    model: "deepseek-v4-flash-sovereign",
    fetchImpl,
  });
  expect((await llm.complete(input)).turn.intent).toBe("NEW_BOOKING");
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
it("does not retry malformed model output", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(Response.json({ choices: [{ message: { content: "invalid" } }] }));
  const llm = new OpenAiLlm({
    apiKey: "test",
    model: "deepseek-v4-flash-sovereign",
    fetchImpl,
  });
  await expect(llm.complete(input)).rejects.toThrow();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it("stops after the second capacity failure", async () => {
  const fetchImpl = vi
    .fn()
    .mockImplementation(async () => new Response("busy", { status: 503 }));
  const llm = new OpenAiLlm({
    apiKey: "test",
    model: "deepseek-v4-flash-sovereign",
    fetchImpl,
  });
  await expect(llm.complete(input)).rejects.toThrow();
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

it("discards unused subrequests for exclusive handoff intents but validates the main decision", async () => {
  const { parseLlmJson } = await import("./openai");
  const turn = {
    intent: "HUMAN_REQUEST",
    confidence: 0.9,
    reply: "Sizi ekibimize aktarıyorum.",
    entities: {},
    needsHandoff: true,
    requests: [{ kind: null, answer: null }],
  };
  expect(parseLlmJson(JSON.stringify(turn)).requests).toEqual([]);
  expect(() => parseLlmJson(JSON.stringify({ ...turn, confidence: 5 }))).toThrow();
  expect(() =>
    parseLlmJson(JSON.stringify({ ...turn, intent: "NEW_BOOKING" })),
  ).toThrow();
});
