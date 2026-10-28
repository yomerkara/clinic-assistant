import dataset from "@/lib/evaluation/data/context-review-v2.json";
import type { ContextReviewInput } from "./context-review";

export const CONTEXT_EXAMPLES_VERSION = dataset.version;
// Held-out rows are never eligible, even if they exactly match the current input.
const references = dataset.examples.filter((row) => row.split === "reference");
const normalized = (s: string) =>
  s
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");
const categories: [string, RegExp][] = [
  ["emdr", /emdr/],
  ["address", /adres|konum|nerede/],
  ["name", /isim|adiniz|soyad|ben /],
  ["age", /yas|\b\d{2}\b/],
  ["history", /deneyim|ilk kez|ilk defa|terapiye gitt/],
  ["time", /saat|\d{1,2}:\d{2}|sabah|ogleden/],
  ["date", /yarin|pazartesi|cuma|bugun/],
  ["price", /ucret|fiyat|lira/],
  ["invoice", /fatura/],
  ["approval", /onay|kesinles|kesinlest/],
  ["cancel", /iptal/],
  ["reschedule", /ertesi|degisikligi|degistir/],
  ["therapist", /uzman|terapist|calisma alan|hizmet|calisiyor|kadronuzda|ekibinizde/],
  ["suitability", /uygun.*mi|tani|iyi gelir|kayip/],
  ["correction", /pardon|yerine|vazgectim|belirtmedim|yanlis/],
  ["greeting", /merhaba|selam/],
  ["injection", /denetci|pass ver|kurallari unut/],
];

export function selectContextExamples(input: ContextReviewInput) {
  const current = normalized(`${input.inbound} ${input.candidate}`);
  const tags = new Set(
    categories.filter(([, pattern]) => pattern.test(current)).map(([tag]) => tag),
  );
  const words = new Set(current.split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const groups = [...new Set(references.map((r) => r.groupId))]
    .map((groupId) => {
      const rows = references.filter((r) => r.groupId === groupId);
      const exampleWords = new Set(normalized(rows[0].input.inbound).split(/[^a-z0-9]+/));
      const score =
        rows[0].tags.filter((t) => tags.has(t)).length * 10 +
        [...words].filter((w) => exampleWords.has(w)).length;
      return { groupId, rows, score };
    })
    .sort((a, b) => b.score - a.score || a.groupId.localeCompare(b.groupId));
  const chosen = groups
    .filter((g) => g.score > 0)
    .slice(0, 2)
    .flatMap((g) => g.rows);
  // Keep context bounded. A paired good/bad scenario is included atomically.
  const result: typeof chosen = [];
  for (const groupId of new Set(chosen.map((r) => r.groupId))) {
    const pair = chosen.filter((r) => r.groupId === groupId);
    if (JSON.stringify([...result, ...pair]).length <= 14000) result.push(...pair);
  }
  return result;
}

export function contextExamplePrompt(input: ContextReviewInput) {
  const rows = selectContextExamples(input);
  return {
    ids: rows.map((r) => r.id),
    text: rows.length
      ? `\nCurated behavioral examples follow. Their names, fees, clinic facts and dates are SYNTHETIC and MUST NEVER support claims about the current conversation. Only the current input's knowledge, profile and calendar are factual evidence. Apply the reasoning pattern, not the example outcome. Both good and bad examples are included; an example labelled FLAG does not make a similar current reply wrong.\n${JSON.stringify(rows.map((r) => ({ example: r.input, expected: r.expected })))}`
      : "",
  };
}
