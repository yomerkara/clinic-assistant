/** Last outbound boundary, shared by every provider task. Never mutate DB input. */
export function redactPatientText(text: string) {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[e-posta gizlendi]")
    .replace(
      /(?:\+?90[ ()-]*)?0?5\d{2}[ ()-]*\d{3}[ ()-]*\d{2}[ ()-]*\d{2}\b/g,
      "[telefon gizlendi]",
    )
    .replace(
      /(?:\+\d{1,3}[ ()-]*)?(?:\d[ ()-]*){10,16}/g,
      "[iletişim veya kimlik numarası gizlendi]",
    )
    .replace(/\b\d{11}\b/g, "[kimlik numarası gizlendi]")
    .replace(/\bTR\s*(?:\d\s*){24}\b/gi, "[IBAN gizlendi]")
    .replace(
      /(?:yaşım\s*:?\s*\d{1,3}|\b\d{1,3}\s*yaş(?:ındayım|ındayım|ımda|ında)?)/giu,
      "[profil bilgisi kodda işlendi]",
    )
    .replace(
      /(?:ev adresim|adresim|telefonum|numaram)\s*[:：]?[^\n.!?]+/giu,
      "[iletişim bilgisi gizlendi]",
    )
    .replace(
      /(?:daha önce|geçmişte).{0,40}terapi (?:aldım|gördüm|almadım|görmedim)/giu,
      "[terapi geçmişi kodda işlendi]",
    );
}
const privateKeys = new Set([
  "phone",
  "phoneNumber",
  "email",
  "address",
  "age",
  "hasTherapyHistory",
  "guardianName",
  "guardianConsent",
  "guardianAccompanies",
  "memorySummary",
  "availabilityNotes",
  "appointmentsSummary",
  "sessionNotes",
  "patientId",
  "conversationId",
]);
export function privateModelInput(value: unknown): unknown {
  if (typeof value === "string") return redactPatientText(value);
  if (Array.isArray(value)) return value.map(privateModelInput);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !privateKeys.has(key))
        .map(([key, item]) => [
          key,
          ["known", "profile"].includes(key) && item && typeof item === "object"
            ? { name: redactPatientText(String((item as { name?: string }).name ?? "")) }
            : privateModelInput(item),
        ]),
    );
  return value;
}
