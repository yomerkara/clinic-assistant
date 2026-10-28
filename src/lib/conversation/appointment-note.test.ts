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

it.each([
  "Randevuma 10 dakika gecikeceğim, not eder misiniz?",
  "Randevuma 10 dakika gecikeceğim, not düşer misiniz?",
  "15 dakika gecikeceğim lütfen not eder misiniz?",
  "Biraz geç kalacağım, not alır mısınız?",
])("records a delay notice asked for politely: %s", (text) => {
  expect(appointmentNoteText(text)?.text, text).toBeTruthy();
});

it.each([
  // Still a question about whether lateness is allowed, not a notice.
  "10 dakika geç kalabilir miyim?",
  "Gecikirsem not eder misiniz?",
  // Free-form text is deliberately never written to a shared calendar.
  "Randevum için not ekler misiniz: binaya geldiğimde arayacağım",
  "Not eder misiniz?",
])("keeps rejecting what is not a canonical delay notice: %s", (text) => {
  expect(appointmentNoteText(text), text).toBeNull();
});
