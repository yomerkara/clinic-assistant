import { expect, it } from "vitest";
import { informationSidecars } from "./information-sidecars";
const knowledge = [
  {
    id: "clinic_policy_price",
    title: "Ücret",
    content: "Seans ücretimiz 4.000 TL’dir.",
    source: "approved",
    version: 1,
  },
];
it("adds the fee and EMDR answer to an appointment response exactly once", () => {
  const text = "Randevum kaçta, ücret ne kadar ve EMDR nedir?";
  const extra = informationSidecars(text, "Randevunuz salı 16:00.", knowledge);
  expect(extra).toContain("4.000 TL");
  expect(extra).toContain("Göz Hareketleriyle");
  expect(informationSidecars(text, `${extra}\nRandevunuz salı 16:00.`, knowledge)).toBe(
    "",
  );
});
