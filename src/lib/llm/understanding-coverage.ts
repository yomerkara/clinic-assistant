// How much of the patient's message the interpretation actually accounted for.
//
// Every field, question and correction the understanding model returns carries a
// verbatim quote from the current message, so coverage can be measured without
// asking a model: split the message into clauses, mark the clauses a quote
// touches, and whatever is left is text nobody explained. Those leftovers are
// what a second pass should look at, instead of re-reading the whole message.
import type { understandingSchema } from "./understanding";
import type { z } from "zod";

export type Understanding = z.infer<typeof understandingSchema>;

export type Segment = {
  text: string;
  start: number;
  end: number;
  covered: boolean;
  /** Courtesy and acknowledgement carry no request, so they need no second look. */
  filler: boolean;
};

export type CoverageReport = {
  segments: Segment[];
  /** Share of substantive clauses an evidence quote touched, 0-1. */
  ratio: number;
  /** Substantive clauses no quote touched. */
  uncovered: string[];
  needsSecondPass: boolean;
  reasons: Array<"uncovered_clause" | "open_question" | "model_unsure">;
};

const CONNECTIVES =
  /\b(?:bir de|ayrıca|bu arada|ama|fakat|ancak|pardon|özür dilerim|yalnız|hem de)\b/giu;

const FILLER =
  /^(?:merhaba(?:lar)?|selam(?:lar)?|iyi günler|iyi akşamlar|günaydın|teşekkür(?:ler| ederim)?|çok teşekkür(?:ler| ederim)?|sağ ol(?:un)?|rica ederim|tamam(?:dır)?|peki|olur|evet|hayır|hayir|anlaştık|görüşürüz|kolay gelsin|eline sağlık|lütfen|tabii(?: ki)?|elbette)[\s.!,]*$/iu;

/** Clause-level split: sentence marks plus the connectives Turkish uses to
 *  staple a second request onto the same sentence. */
export function messageSegments(inbound: string): Array<{ text: string; start: number; end: number }> {
  const boundaries = new Set<number>([0, inbound.length]);
  for (const match of inbound.matchAll(/[.!?;\n]+\s*/gu))
    boundaries.add(match.index + match[0].length);
  for (const match of inbound.matchAll(CONNECTIVES)) boundaries.add(match.index);
  // A comma only splits when both sides are long enough to be separate clauses.
  for (const match of inbound.matchAll(/,\s*/gu)) {
    const at = match.index + match[0].length;
    if (at >= 12 && inbound.length - at >= 12) boundaries.add(at);
  }
  const ordered = [...boundaries].sort((a, b) => a - b);
  const segments: Array<{ text: string; start: number; end: number }> = [];
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const start = ordered[i]!;
    const end = ordered[i + 1]!;
    const text = inbound.slice(start, end).trim();
    if (text.length > 1) segments.push({ text, start, end });
  }
  return segments.length
    ? segments
    : inbound.trim()
      ? [{ text: inbound.trim(), start: 0, end: inbound.length }]
      : [];
}

function evidenceSpans(inbound: string, understanding: Understanding) {
  const quotes = [
    ...understanding.fields.map((field) => field.evidence),
    ...understanding.questions.map((question) => question.evidence),
    ...understanding.corrections.map((correction) => correction.evidence),
  ];
  const spans: Array<{ start: number; end: number }> = [];
  for (const quote of quotes) {
    const trimmed = quote.trim();
    if (trimmed.length < 2) continue;
    let from = 0;
    for (;;) {
      const at = inbound.indexOf(trimmed, from);
      if (at < 0) break;
      spans.push({ start: at, end: at + trimmed.length });
      from = at + 1;
    }
  }
  return spans;
}

/** Courtesy often arrives stacked: "Merhaba, teşekkürler". Every part must be
 *  courtesy for the clause to count as carrying no request. */
export function isFiller(text: string): boolean {
  const parts = text
    .split(/[,;]|\bve\b/giu)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
  if (!parts.length) return true;
  return parts.every((part) => FILLER.test(part));
}

export function coverageReport(
  inbound: string,
  understanding: Understanding,
): CoverageReport {
  const spans = evidenceSpans(inbound, understanding);
  const segments: Segment[] = messageSegments(inbound).map((segment) => ({
    ...segment,
    filler: isFiller(segment.text),
    covered: spans.some(
      (span) => span.start < segment.end && span.end > segment.start,
    ),
  }));
  const substantive = segments.filter((segment) => !segment.filler);
  const uncovered = substantive.filter((segment) => !segment.covered);
  const reasons: CoverageReport["reasons"] = [];
  if (uncovered.length) reasons.push("uncovered_clause");
  // A question the interpretation never quoted is the costliest thing to miss.
  if (uncovered.some((segment) => segment.text.includes("?")))
    reasons.push("open_question");
  if (understanding.needsClarification) reasons.push("model_unsure");
  return {
    segments,
    ratio: substantive.length
      ? (substantive.length - uncovered.length) / substantive.length
      : 1,
    uncovered: uncovered.map((segment) => segment.text),
    needsSecondPass: reasons.length > 0,
    reasons,
  };
}
