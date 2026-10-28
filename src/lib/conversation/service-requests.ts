import { normalizePatientName } from "@/lib/patients/identity";

export const serviceRequestLabels = {
  WAITLIST: "Yer açılınca bilgilendirme",
  RECURRING: "Tekrarlayan randevu isteği",
  PAYMENT: "Ödeme kontrolü / bağlantı isteği",
  REFUND: "İade isteği",
  INSURANCE: "Sigorta / indirim kontrolü",
  DATA_REQUEST: "Kişisel veri talebi — kimlik teyidi gerekli",
  PROFILE_UPDATE: "İletişim / kimlik bilgisi düzeltme",
  ATTENDANCE: "Seansa katılım bildirimi",
  ONLINE: "Online seans tercihi",
} as const;
export type ServiceKind = keyof typeof serviceRequestLabels;
export function requestedServices(text: string): ServiceKind[] {
  // Negation belongs to a clause, not to every request in the message.
  const clauses = text.split(/[,;.!?\n]+|\s+(?:ama|fakat|ancak|bir de|ayrıca)\s+/iu);
  return [...new Set(clauses.flatMap(requestedServicesInClause))];
}
function requestedServicesInClause(text: string): ServiceKind[] {
  const v = normalizePatientName(text);
  if (/istemiyorum|vazgectim|gerek yok/.test(v)) return [];
  const found: ServiceKind[] = [];
  if (/yer acilirsa|bosalirsa|bekleme listesi/.test(v)) found.push("WAITLIST");
  if (
    /her (?:hafta|sali|pazartesi|carsamba|persembe|cuma|cumartesi|pazar)|haftalik.*randevu/.test(
      v,
    )
  )
    found.push("RECURRING");
  if (/odeme.*(?:ulasti|yap|baglanti|link|kontrol)|kartla ode|odeme linki/.test(v))
    found.push("PAYMENT");
  if (/iade(?:sini|mi|yi)? (?:ist|talep|al)|parami geri/.test(v)) found.push("REFUND");
  if (/sigorta|sirket indirimi|kurum indirimi/.test(v)) found.push("INSURANCE");
  if (/(?:kayitlarimi|verilerimi).*(?:sil|paylas|gonder|istiyorum)/.test(v))
    found.push("DATA_REQUEST");
  if (/(?:telefonum|numaram|soyadim|adim).*(?:degisti|duzelt|guncelle)/.test(v))
    found.push("PROFILE_UPDATE");
  if (/katildim|seansa geldim|gorusmeye geldim/.test(v) && !/katilmadim/.test(v))
    found.push("ATTENDANCE");
  if (
    /online.*(?:istiyorum|olsun|yapalim|randevu al)|uzaktan.*(?:istiyorum|olsun)/.test(v)
  )
    found.push("ONLINE");
  return found;
}
export function serviceReceipt(kinds: ServiceKind[]) {
  if (kinds.includes("PAYMENT") && kinds.includes("REFUND"))
    return "Bu sohbet üzerinden ödeme veya iade işlemi yapamıyoruz. Ekibimiz size yardımcı olacak.";
  if (kinds.includes("PAYMENT"))
    return "Bu sohbet üzerinden ödeme almıyoruz. Ödeme konusunda ekibimiz size yardımcı olacak.";
  if (kinds.includes("REFUND"))
    return "İade konusunda ekibimiz size yardımcı olacak.";
  return "Teşekkür ederiz, ekibimiz bu konuda size yardımcı olacak.";
}
