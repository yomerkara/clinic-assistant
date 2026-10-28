import { expect, it } from "vitest";
import {
  EMDR_DEFINITION,
  generalDefinition,
  isGeneralDefinitionReply,
} from "./general-definitions";
import { INTAKE_QUESTIONS } from "./booking-flow";
it("handles a time preference followed by a definition question without adding efficacy claims", () => {
  expect(generalDefinition("yarın saat 19 bu arada EMDR nedir?")).toBe(EMDR_DEFINITION);
  expect(generalDefinition("EMDR ne demek?")).toBe(EMDR_DEFINITION);
});
it.each([
  "EMDR bana iyi gelir mi?",
  "EMDR nedir, kaç seans sürer?",
  "EMDR nasıl uygulanır?",
])("leaves broader/personal questions to the normal pipeline: %s", (text) => {
  expect(generalDefinition(text)).toBeUndefined();
});
it("only recognizes exact code replies, never appended claims", () => {
  expect(isGeneralDefinitionReply(EMDR_DEFINITION)).toBe(true);
  expect(isGeneralDefinitionReply(`${EMDR_DEFINITION}\n\n${INTAKE_QUESTIONS.name}`)).toBe(
    true,
  );
  expect(isGeneralDefinitionReply(`${EMDR_DEFINITION} Kesin iyileşirsiniz.`)).toBe(false);
});

it.each([
  "tabiki adım Lale Deneme bu arada ücretiniz ne kadar acaba bir de açıklamada EMDR yazmışsınız o nedir?",
  "hayır olmadı ama EMDR'ı sormuştum bir de",
  "EMDR nedir ve ücret ne kadar?",
])("answers the definition in mixed or follow-up wording: %s", (text) => {
  expect(generalDefinition(text)).toBe(EMDR_DEFINITION);
});
