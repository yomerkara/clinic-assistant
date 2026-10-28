import { expect, it } from "vitest";
import { appointmentNoteText } from "./appointment-note";
it.each([
  "10 dakika gecikeceğim",
  "Fatma Kara bugün 15:00 randevuma biraz geç kalacağım",
])("recognizes an explicit appointment note: %s", (text) => {
  expect(appointmentNoteText(text)?.text).toBeTruthy();
});
it.each([
  "Randevuma not eklemek istiyorum: yanımda refakatçi olacak",
  "Gecikmeyeceğim",
  "Randevumu iptal etmek istiyorum",
  "10 dakika geç kalabilir miyim?",
  "EMDR nedir?",
  "Kendime zarar vermek istiyorum, not ekleyin",
])("does not swallow other intentions: %s", (text) => {
  expect(appointmentNoteText(text)).toBeNull();
});
