export type ScopeDecision =
  { kind: "clinic" } | { kind: "greeting" } | { kind: "out_of_scope"; reason: string };

export function introducedName(input: string) {
  const match = input.match(
    /\b(?:ben|benim adım)[ \t]+([a-zçğıöşü]+(?:[ \t]+[a-zçğıöşü]+)?)/i,
  );
  if (!match) return null;
  const name = match[1]
    .trim()
    .split(/\s+/)
    .map(
      (part) =>
        part.charAt(0).toLocaleUpperCase("tr-TR") +
        part.slice(1).toLocaleLowerCase("tr-TR"),
    )
    .join(" ");
  if (
    ["randevu", "almak", "istiyorum", "için", "hakkında", "bilgi", "yardım"].includes(
      name.split(" ")[0]!.toLocaleLowerCase("tr-TR"),
    )
  )
    return null;
  return name;
}

const clinicTerms = [
  "randevu",
  "seans",
  "terapi",
  "terapist",
  "psikolog",
  "psikoloji",
  "emdr",
  "klinik",
  "santa",
  "uzman",
  "görüşme",
  "iptal",
  "gelem",
  "teyit",
  "onay",
  "tarih",
  "saat",
  "müsait",
  "uygun",
  "çocuk",
  "yetişkin",
  "davranışçı",
  "bilişsel",
  "travma",
  "kaygı",
  "anksiyete",
  "panik",
  "depresyon",
  "depresif",
  "uyku",
  "kabus",
  "ağlıyorum",
  "kötü hissed",
  "kendime zarar",
  "intihar",
  "kriz",
  "acil",
  "ücret",
  "ilaç",
  "reçete",
  "hizmet",
  "liste",
  "seans",
  "haftaya",
  "yarın",
  "pazartesi",
  "salı",
  "çarşamba",
  "perşembe",
  "cuma",
  "cumartesi",
  "pazar",
  "çalışan",
  "temsilci",
  "canlı destek",
];

const unrelatedPatterns: Array<[RegExp, string]> = [
  [
    /hava durumu|hava kaç derece|hava nasıl|yağmur yağacak mı/,
    "hava durumu klinik kapsamı dışında",
  ],
  [
    /\b(python|javascript|typescript|html|css|kod yaz|programlama|debug|sql)\b/,
    "yazılım sorusu klinik kapsamı dışında",
  ],
  [
    /ödev|matematik sorusu|denklem çöz|sınav|kompozisyon/,
    "eğitim sorusu klinik kapsamı dışında",
  ],
  [
    /siyaset|seçim|futbol|basketbol|kripto|bitcoin|borsa|bahis/,
    "genel gündem sorusu klinik kapsamı dışında",
  ],
  [
    /film öner|dizi öner|şarkı sözü|şiir yaz|hikaye anlat|espri yap/,
    "genel içerik isteği klinik kapsamı dışında",
  ],
  [
    /yemek tarifi|nasıl pişirilir|seyahat|otel öner|restoran öner/,
    "genel yaşam sorusu klinik kapsamı dışında",
  ],
];

export function decideScope(input: string, context: string[] = []): ScopeDecision {
  const text = input.trim().toLocaleLowerCase("tr-TR");
  if (!text) return { kind: "out_of_scope", reason: "boş mesaj" };
  const hasClinicContext = context.some((item) =>
    clinicTerms.some((term) => item.toLocaleLowerCase("tr-TR").includes(term)),
  );
  if (
    /^(merhaba|merhabalar|selam|selamlar|günaydın|iyi akşamlar|iyi geceler|hey|hello)([,\s]+|$)/.test(
      text,
    )
  ) {
    if (clinicTerms.some((term) => text.includes(term))) return { kind: "clinic" };
    if (hasClinicContext) return { kind: "clinic" };
    return { kind: "greeting" };
  }
  if (clinicTerms.some((term) => text.includes(term))) return { kind: "clinic" };
  for (const [pattern, reason] of unrelatedPatterns) {
    if (pattern.test(text)) return { kind: "out_of_scope", reason };
  }
  if (
    hasClinicContext &&
    (text.split(/\s+/).length <= 8 ||
      /^(evet|hayır|tamam|olur|peki|haftaya|yarın|bugün|salı|çarşamba|perşembe|cuma|cumartesi|pazar)/.test(
        text,
      ))
  ) {
    return { kind: "clinic" };
  }
  if (text.split(/\s+/).length <= 2) return { kind: "greeting" };
  return { kind: "clinic" };
}

export function isPureIntroduction(input: string) {
  const text = input.trim();
  return (
    /^(?:ben|benim adım)\s+[\p{L}]+(?:\s+[\p{L}]+){0,3}[.!]*$/iu.test(text) &&
    Boolean(introducedName(text)) &&
    decideScope(text, []).kind === "greeting" &&
    !/randevu|istiyorum|hissediyorum|hastayım/iu.test(text)
  );
}
