import { expect, it } from "vitest";
import { isBroadClinicQuestion } from "./clinic-clarification";

it.each([
  "klinik bilgisi",
  "Klinik hakkında bilgi almak istiyorum.",
  "kliniğiniz hakkında bilgi alabilir miyim?",
])("clarifies a broad topic: %s", (text) => {
  expect(isBroadClinicQuestion(text)).toBe(true);
});
it.each([
  "klinik bilgisi ve ücretler",
  "klinik adresi nedir",
  "klinik bilgisi, bir çalışanla görüşeyim",
  "klinik bilgisi, kendime zarar vermek istiyorum",
])("preserves concrete or critical requests: %s", (text) => {
  expect(isBroadClinicQuestion(text)).toBe(false);
});
