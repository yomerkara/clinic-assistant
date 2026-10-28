import type { KnowledgeSnippet } from "@/lib/llm/types";

// These documents travel through the same APPROVED-only loader as other clinic
// knowledge. Removing approval immediately disables the deterministic answer.
export function approvedPolicy(knowledge: KnowledgeSnippet[], key: string) {
  return knowledge.find((document) => document.id === `clinic_policy_${key}`);
}

export function policyAnswers(text: string, knowledge: KnowledgeSnippet[]) {
  const folded = text
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");
  const keys: string[] = [];
  if (
    /online|cevrimici|cevrim ici|uzaktan|goruntulu/.test(folded) &&
    !/(?:online|uzaktan).{0,25}(?:istemiyorum|olmasin|gerek yok)|baglanti|bos ekran|online mi|yuz yuze mi/.test(folded)
  ) keys.push("online");
  // Turkish softens the final k, so "çocuk" becomes "çocuğum/çocuğumu"; both
  // stems must match, and a guardian question is not always worded as consent.
  if (
    /cocu[kg]|ergen|veli(?:si|niz|nin)?\s+(?:onay|izin|eslik|gerek|lazim|zorunlu|getir|gelme)|velisi|oglum|kizim/.test(
      folded,
    )
  )
    keys.push("guardian");
  if (
    /calisma saat|mesai|kacta ac|kacta kapan|kaca kadar|hangi gunler acik|hangi gun ve saat.{0,20}(?:acik|calis)|(?:pazartesi|sali|carsamba|persembe|cuma|cumartesi|pazar).{0,25}(?:acik|calis)/.test(
      folded,
    )
  )
    keys.push("hours");
  return keys.flatMap((key) => {
    const source = approvedPolicy(knowledge, key);
    return source ? [{ source, answer: source.content }] : [];
  });
}
