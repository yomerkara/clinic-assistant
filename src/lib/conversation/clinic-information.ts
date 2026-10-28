import type { KnowledgeSnippet } from "@/lib/llm/types";
import { asksNearbyFood, hasExplicitClinicQuestion } from "./nearby-information";

/** Read only the approved snippets supplied by the caller; no external lookup. */
export function clinicInformation(text: string, knowledge: KnowledgeSnippet[]) {
  if (asksNearbyFood(text) && !hasExplicitClinicQuestion(text)) return undefined;
  const addressQuestion = /adres|konum|nerede|neresi|harita/iu.test(text);
  const documents = knowledge.filter(
    (d) =>
      d.id === "kd_clinic" || /klinik|hakkımızda|iletişim|adres|konum/iu.test(d.title),
  );
  if (addressQuestion) {
    for (const source of documents) {
      const content = source.content.replace(/\s+/g, " ").trim();
      const labelled = content.match(
        /(?:klinik adresi|adresimiz|adres)\s*[:：]?\s+(.+?)(?=\s*(?:Çalışma saat|Telefon|Tel:|\+\d|https?:)|$)/iu,
      )?.[1];
      // Imported contact pages often have one flat paragraph after this heading.
      const heading = "iletişime geç";
      const contactIndex = content.toLocaleLowerCase("tr-TR").lastIndexOf(heading);
      const imported =
        contactIndex >= 0
          ? content
              .slice(contactIndex + heading.length)
              .trim()
              .split(
                /\s*(?:\+\d|Telefon|Tel:|P\.tesi|Pazartesi|Çalışma saat|https?:)/iu,
              )[0]
          : undefined;
      const address = (labelled ?? imported)?.trim().replace(/[.\s]+$/u, "");
      if (address && address.length <= 350)
        return {
          source,
          answer: `Adresimiz: ${address}\nHaritada ara: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
        };
    }
    return {
      answer:
        "Şu anda onaylı adres bilgisine ulaşamıyorum. Yanlış bir konum paylaşmamak için adresi ekibimizden teyit edebilirsiniz.",
    };
  }
  // Prefer an about page; contact-page navigation is not a clinic introduction.
  const ranked = [...documents].sort(
    (a, b) =>
      Number(/hakkımızda|hakkında/iu.test(b.title)) -
      Number(/hakkımızda|hakkında/iu.test(a.title)),
  );
  for (const source of ranked) {
    const flat = source.content.replace(/\s+/g, " ").trim();
    const body =
      flat.match(
        /(?:Santa (?:Psikoloji|Eğitim)|Bireysel ihtiyaçları|Kliniğimiz|Merkezimiz|Çocuk,? ergen)[\s\S]*/iu,
      )?.[0] ?? flat;
    const sentences = body.match(/[^.!?]+[.!?](?=\s|$)/gu) ?? [];
    const sentence = sentences
      .map((s) => s.trim())
      .find(
        (s) =>
          s.length >= 25 &&
          s.length <= 260 &&
          !/https?:|çalışma saat|pazar.*kapalı|iletişime geç|sorularınız|profil:/iu.test(
            s,
          ),
      );
    if (sentence) return { source, answer: sentence };
    if (flat.length <= 220 && !/https?:|İLETİŞİM|\b01\b/u.test(flat))
      return { source, answer: flat };
  }
  return undefined;
}
