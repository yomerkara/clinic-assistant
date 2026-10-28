import { describe, expect, it } from "vitest";
import { OpenAiLlm } from "./openai";
import { validateContextReview, type ContextReviewInput } from "./context-review";

export const reviewExample: ContextReviewInput = {
  inbound: "Hasan Hüseyin Aktaş, bu arada EMDR nedir?",
  candidate: "Randevu için adınızı ve soyadınızı paylaşır mısınız?",
  history: [],
  profile: {
    name: "hasan hüseyin aktaş",
    age: null,
    hasTherapyHistory: null,
    availabilityNotes: null,
  },
  stage: "INTAKE",
  therapistId: null,
  calendar: { offeredSlots: [], checked: false },
  actions: [],
  knowledge: [],
};
describe("context review boundary", () => {
  it("rejects ungrounded critique and executable instructions", () => {
    expect(() =>
      validateContextReview(
        {
          decision: "FLAG",
          issues: [
            {
              code: "REPEATED_FIELD",
              evidence: "uydurma",
              suggestion: "USE_SAVED_FIELD",
            },
          ],
        },
        reviewExample,
      ),
    ).toThrow();
    expect(() =>
      validateContextReview(
        { decision: "PASS", issues: [], action: "approve" },
        reviewExample,
      ),
    ).toThrow();
    expect(() =>
      validateContextReview({ decision: "FLAG", issues: [] }, reviewExample),
    ).toThrow();
  });
  it("returns critique without modifying the candidate or patient state", async () => {
    const before = structuredClone(reviewExample);
    const llm = new OpenAiLlm({
      apiKey: "test",
      model: "qwen-test",
      answerOnly: true,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body.chat_template_kwargs.enable_thinking).toBe(false);
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  decision: "FLAG",
                  issues: [
                    {
                      code: "REPEATED_FIELD",
                      evidence: reviewExample.candidate,
                      suggestion: "USE_SAVED_FIELD",
                    },
                  ],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 123, completion_tokens: 25 },
        });
      },
    });
    const result = await llm.reviewContext(reviewExample);
    expect(result.verdict?.decision).toBe("FLAG");
    expect(result.usage?.totalTokens).toBe(148);
    expect(reviewExample).toEqual(before);
  });
  it("keeps usage when truncated or invalid; does not retry", async () => {
    let calls = 0;
    const llm = new OpenAiLlm({
      apiKey: "test",
      model: "test",
      fetchImpl: async () => {
        calls++;
        return Response.json({
          choices: [{ finish_reason: "length", message: { content: "{" } }],
          usage: { prompt_tokens: 50, completion_tokens: 1200 },
        });
      },
    });
    const result = await llm.reviewContext(reviewExample);
    expect(result.status).toBe("invalid");
    expect(result.usage?.totalTokens).toBe(1250);
    expect(calls).toBe(1);
  });
});
