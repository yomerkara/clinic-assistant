import { parseDelayNotice } from "./delay";

/** Calendar notes are canonical arrival notices, never arbitrary patient text. */
export function appointmentNoteText(text: string) {
  // A request to KEEP the appointment is compatible with a delay notice.
  // Strip only this narrowly recognised trailing phrase, never an actual cancel.
  text = text.replace(/[,;.!\s]+(?:randevumu\s+)?iptal etmeyin(?:\s+(?:ltf|lütfen))?[.!\s]*$/iu, "");
  // A polite closing request ("not eder misiniz?") is how patients normally ask
  // for the notice to be recorded. Only this trailing phrase is removed, so the
  // question-mark guard below still rejects an actual question such as
  // "10 dakika geç kalabilir miyim?".
  text = text.replace(
    /[,;.!\s]*(?:lütfen\s+)?not\s+(?:eder|ed(?:ebilir)?|düşer|alır|ekler)\s+m[iı]s[iı]n[iı]z[.!?\s]*$/iu,
    "",
  );
  const safe = !/iptal|vazgeç|gecikmeyece|geç kalmay|intihar|kendime zarar|\?/iu.test(
    text,
  );
  const suffix = safe
    ? text.match(
        /(?:\d{1,3}\s*(?:dk|dakika)\s+)?(?:gecikeceğim|gecikebilirim|geç kalacağım|geç kalabilirim)[.!\s]*$/iu,
      )?.[0]
    : undefined;
  const delay = safe ? parseDelayNotice(suffix ?? text) : null;
  return delay ? { text: delay.note, today: true } : null;
}
