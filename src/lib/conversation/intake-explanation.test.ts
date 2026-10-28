import { expect, it } from "vitest";
import {
  AGE_REQUEST_EXPLANATION,
  asksWhyAgeIsNeeded,
  isAdministrativeAcknowledgement,
} from "./administrative-replies";
import { INTAKE_QUESTIONS } from "./booking-flow";

it("recognizes an age-purpose question without stealing other clinical questions", () => {
  expect(asksWhyAgeIsNeeded("27 ama niye paylaşıyorum")).toBe(true);
  expect(asksWhyAgeIsNeeded("Yaşımı neden soruyorsunuz?")).toBe(true);
  expect(asksWhyAgeIsNeeded("27 yaşındayım, EMDR neden gerekli?")).toBe(false);
});
it("allows only the exact purpose explanation with a known follow-up question", () => {
  expect(
    isAdministrativeAcknowledgement(
      `${AGE_REQUEST_EXPLANATION}\n\n${INTAKE_QUESTIONS.therapyHistory}`,
      "NEW_BOOKING",
    ),
  ).toBe(true);
  expect(
    isAdministrativeAcknowledgement(
      `${AGE_REQUEST_EXPLANATION} Size EMDR kesin iyi gelir.`,
      "NEW_BOOKING",
    ),
  ).toBe(false);
});

it("allows exact combined administrative replies but never appended factual claims", async () => {
  const { INVOICE_REQUEST_REPLY, PRICE_REQUEST_REPLY } =
    await import("./administrative-replies");
  for (const text of [
    `${INVOICE_REQUEST_REPLY}\n\n${PRICE_REQUEST_REPLY}`,
    `${PRICE_REQUEST_REPLY}\n\n${INVOICE_REQUEST_REPLY}`,
  ]) {
    expect(isAdministrativeAcknowledgement(text, "INVOICE_REQUEST")).toBe(true);
    expect(isAdministrativeAcknowledgement(text, "PRICE_REQUEST")).toBe(true);
    expect(
      isAdministrativeAcknowledgement(`${text} Ücret 500 TL.`, "PRICE_REQUEST"),
    ).toBe(false);
  }
});
