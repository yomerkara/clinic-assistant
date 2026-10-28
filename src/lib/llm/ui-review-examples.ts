import dataset from "@/lib/evaluation/data/ui-review-100-v1.json";
import { normalizePatientName } from "@/lib/patients/identity";

export function uiReviewExamples(inbound: string) {
  const words = new Set(
    normalizePatientName(inbound)
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
  const rows = dataset.rows
    .filter((r) => r.review === "user-corrected")
    .map((row) => ({
      row,
      score: [
        ...new Set(normalizePatientName(row.patientMessages.join(" ")).split(/\s+/)),
      ].filter((w) => words.has(w)).length,
    }))
    .filter((r) => r.score >= 2)
    .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id))
    .slice(0, 2)
    .map((r) => r.row);
  return {
    ids: rows.map((r) => r.id),
    text: rows.length
      ? `\n${dataset.version}: Reviewed behavioral rules, not patient or clinic facts. Do not copy example identities, dates or fees.\n${rows.map((r) => `${r.id}: ${r.expectedBehavior}`).join("\n")}`
      : "",
  };
}
