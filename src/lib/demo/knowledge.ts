import type { KnowledgeSnippet } from "@/lib/llm/types";

// Only the application-created demo document supplies this fixed reply.
// Other questions still go through normal generation and verification.
export function demoServiceAnswer(
  inbound: string,
  selected: string | null | undefined,
  knowledge: KnowledgeSnippet[],
): string | undefined {
  if (!selected || !/hangi hizmet|hizmetleri (?:neler|ne|ver)/iu.test(inbound)) return;
  if (/nedir|ne demek|neden|ilaç|ücret|fiyat|iyi gelir|uygun mu/iu.test(inbound)) return;
  const doc = knowledge.find(
    (entry) =>
      entry.id === "demo_omer_services" &&
      entry.source === "demo-only" &&
      entry.content.startsWith(`${selected},`),
  );
  return doc?.version === 2 ? doc.content : undefined;
}

export function demoTherapistKnowledge(
  source: string | undefined,
  profile: { displayName: string } | null,
  knowledge: KnowledgeSnippet[],
): KnowledgeSnippet[] {
  if (source !== "demo" || !profile) return knowledge;
  const merve = knowledge
    .find((doc) => doc.id === "official_santa_therapists" || doc.id === "kd_therapists")
    ?.content.split("\n")
    .find((line) => line.includes("Merve Nur Akıl"));
  if (!merve) return knowledge;
  return [
    ...knowledge,
    {
      id: "demo_omer_services",
      title: "Yönetici Ömer hizmetleri — demo test senaryosu",
      content: `${profile.displayName}, yalnızca bu demo senaryosunda Merve Hanım ile aynı hizmetleri temsil eden test kişisidir.\n\n${merve.replace(/[.\s]+$/, "")}.`,
      source: "demo-only",
      version: 2,
    },
  ];
}
