import { describe, expect, it } from "vitest";
import { parseJsonResponse } from "./json-response";
import { validateContentSafety } from "./content-safety";

const verdict = { safe: true, requiresGrounding: false, issues: [] };
describe("gateway JSON envelopes", () => {
  it.each([
    JSON.stringify(verdict),
    `\`\`\`json\n${JSON.stringify(verdict)}\n\`\`\``,
    `\`\`\`json\n${JSON.stringify(verdict)}\n\`\`\`\nThe candidate is a neutral scheduling question.`,
  ])("accepts exactly one validated verdict", (content) => {
    expect(validateContentSafety(parseJsonResponse(content))).toEqual(verdict);
  });
  it.each([
    `\`\`\`json\n${JSON.stringify(verdict)}\n\`\`\`\n{"safe":false}`,
    `\`\`\`json\n${JSON.stringify(verdict)}\n\`\`\`\n\`\`\`json\n{}\n\`\`\``,
    `Explanation first. ${JSON.stringify(verdict)}`,
    `${JSON.stringify(verdict)} trailing content`,
    `\`\`\`json\n${JSON.stringify(verdict)}`,
  ])("rejects ambiguous or incomplete output", (content) => {
    expect(() => parseJsonResponse(content)).toThrow();
  });
  it("does not relax safety schema validation", () => {
    expect(() =>
      validateContentSafety(parseJsonResponse('```json\n{"safe":true}\n```')),
    ).toThrow();
    expect(
      validateContentSafety(
        parseJsonResponse(
          '```json\n{"safe":true,"requiresGrounding":false,"issues":["personal_treatment"]}\n```',
        ),
      ).safe,
    ).toBe(false);
  });
});
