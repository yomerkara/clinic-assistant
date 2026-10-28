import { expect, it } from "vitest";
import { validateGrounding } from "./grounding";
const docs = [
  {
    id: "doc",
    title: "Onaylı",
    content: "Ergen danışmanlığı 12–18 yaş aralığına yöneliktir.",
    source: "clinic",
    version: 2,
  },
];
it("requires exact evidence from a known document even if the verifier claims success", () => {
  expect(
    validateGrounding(
      {
        supported: true,
        evidence: [
          {
            documentId: "doc",
            quote: "Ergen danışmanlığı 12–18 yaş aralığına yöneliktir.",
          },
        ],
        reason: "Doğrulandı",
      },
      docs,
    ).supported,
  ).toBe(true);
  expect(
    validateGrounding(
      {
        supported: true,
        evidence: [{ documentId: "doc", quote: "EMDR kesin sonuç verir" }],
        reason: "Doğrulandı",
      },
      docs,
    ).supported,
  ).toBe(false);
  expect(
    validateGrounding({ supported: true, evidence: [], reason: "Eminim" }, docs)
      .supported,
  ).toBe(false);
  expect(validateGrounding({}, docs).supported).toBe(false);
});

it("accepts a gateway's fenced JSON response and still verifies the quote", async () => {
  const { OpenAiLlm } = await import("./openai");
  const reply = {
    supported: true,
    evidence: [{ documentId: "doc", quote: docs[0].content }],
    reason: "Kaynak destekliyor",
  };
  const llm = new OpenAiLlm({
    apiKey: "test",
    model: "test",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: "```json\n" + JSON.stringify(reply) + "\n```" } },
          ],
        }),
      ),
  });
  expect(
    (
      await llm.verifyGrounding(
        "Ergen danışmanlığı 12–18 yaş aralığına yöneliktir.",
        docs,
      )
    ).supported,
  ).toBe(true);
});
