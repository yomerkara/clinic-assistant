import { expect, it } from "vitest";
import {
  shouldUnderstand,
  validateUnderstanding,
  type UnderstandingInput,
} from "./understanding";
const input: UnderstandingInput = {
  inbound: "Ben Duru Örnek, 29 yaşındayım, bu arada EMDR nedir?",
  history: [],
  stage: "INTAKE",
  known: { name: "Yeni hasta", age: null, hasTherapyHistory: null },
  nowIso: "2026-10-08T12:00:00Z",
};
const valid = {
  intents: ["THERAPY_INFO"],
  fields: [
    { name: "patientName", value: "Duru Örnek", evidence: "Duru Örnek" },
    { name: "age", value: 29, evidence: "29 yaşındayım" },
  ],
  questions: [{ topic: "THERAPY_INFO", evidence: "EMDR nedir?" }],
  corrections: [],
  needsClarification: false,
  clarification: null,
};
it("keeps clear menu/intake responses out of the paid model", () => {
  for (const text of ["29", "1", "evet", "hayır", "selamlar"])
    expect(shouldUnderstand(text)).toBe(false);
  expect(shouldUnderstand(input.inbound)).toBe(true);
  expect(shouldUnderstand("29 değil 31")).toBe(true);
});
it("extracts only structured evidence-backed data and preserves all questions", () => {
  expect(validateUnderstanding(valid, input).questions).toHaveLength(1);
  expect(() =>
    validateUnderstanding({ ...valid, approveAppointment: true }, input),
  ).toThrow();
  expect(() =>
    validateUnderstanding(
      { ...valid, fields: [{ name: "age", value: 50, evidence: "29 yaşındayım" }] },
      input,
    ),
  ).toThrow();
  expect(() =>
    validateUnderstanding(
      {
        ...valid,
        fields: [{ name: "patientName", value: "Elif", evidence: "Duru Örnek" }],
      },
      input,
    ),
  ).toThrow();
  expect(() =>
    validateUnderstanding(
      {
        ...valid,
        fields: [{ name: "age", value: 29, evidence: "Geçmiş mesajdan alıntı" }],
      },
      input,
    ),
  ).toThrow();
  expect(() =>
    validateUnderstanding(
      { ...valid, fields: [valid.fields[0], valid.fields[0]] },
      input,
    ),
  ).toThrow();
});
