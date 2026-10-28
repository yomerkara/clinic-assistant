import { expect, it } from "vitest";
import { finalizeOutbound } from "./style";
import { INTAKE_QUESTIONS } from "./booking-flow";
it("formats fee and next question separately and remains idempotent", () => {
  const reply = finalizeOutbound(
    `Seans ücretimiz 4.000 TL’dir.\n\n${INTAKE_QUESTIONS.therapyHistory}`,
    "Selinnur Kara",
  );
  expect(reply).toBe(
    `Seans ücretimiz 4.000 TL’dir.\n\n${INTAKE_QUESTIONS.therapyHistory}`,
  );
  expect(finalizeOutbound(reply, "Selinnur Kara")).toBe(reply);
});
it("does not decorate a service failure as a successful booking", () => {
  const text = "Takvime şu an erişemiyorum; talebinizi ekibimize iletiyorum.";
  expect(finalizeOutbound(text, "Selinnur Kara")).toBe(text);
});
