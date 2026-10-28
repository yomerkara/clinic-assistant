import type { KnowledgeSnippet } from "@/lib/llm/types";

// Use only the supplied clinic directory, never a model's suitability claim.
export function therapistInformation(inbound: string, knowledge: KnowledgeSnippet[]) {
  if (
    !/çalışma alan|hangi alan|uzmanlık|terapistler|hizmetleri|hakkında.*bilgi|(?:mi|mı|mu|mü)\s+çalışıyor|çalışıyor\s*(?:mu|mı)|kadronuzda|ekibinizde/iu.test(
      inbound,
    )
  )
    return;
  // The demo person is not in the clinical roster. Never substitute the
  // whole roster when this explicitly named test person is requested.
  if (
    inbound
      .toLocaleLowerCase("tr-TR")
      .match(/\p{L}+/gu)
      ?.includes("ömer")
  ) {
    const source = knowledge.find(
      (doc) =>
        doc.id === "demo_omer_services" &&
        doc.source === "demo-only" &&
        doc.version === 2,
    );
    return source
      ? { source, answer: source.content.replace(/\s*Profil:\s*https?:\/\/\S+/gu, "") }
      : undefined;
  }
  const source = knowledge.find((doc) =>
    ["kd_therapists", "official_santa_therapists"].includes(doc.id),
  );
  if (!source) return;
  const lines = source.content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const words = new Set(inbound.toLocaleLowerCase("tr-TR").match(/\p{L}+/gu));
  const titles = new Set(["klinik", "psikolog", "psikoloğu", "aile", "danışmanı", "ve"]);
  const matching = lines.filter((line) => {
    const [header, body] = line.split(" — ");
    if (!body) return false;
    return header
      .toLocaleLowerCase("tr-TR")
      .match(/\p{L}+/gu)
      ?.some((word) => word.length > 2 && !titles.has(word) && words.has(word));
  });
  const generic = /terapistler|uzmanlar|psikologlar/iu.test(inbound);
  if (!matching.length && !generic) return;
  const answer = (matching.length ? matching : lines)
    .map((line) => line.replace(/\s*Profil:.*$/u, "").trim())
    .join("\n");
  return answer ? { source, answer } : undefined;
}
