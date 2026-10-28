import { INTAKE_QUESTIONS } from "./booking-flow";
import { CLINIC_CLARIFICATION } from "./clinic-clarification";

// Application-owned operational text. No patient-specific availability,
// treatment suitability, service, fee or confirmed-booking claim belongs here.
export const BOOKING_ACKNOWLEDGEMENT =
  "Randevu tercihinizi not aldım. Takvim kontrolü ve ekip onayından sonra randevunuz kesinleşecek.";
export const SLOT_SELECTION_CLARIFICATION =
  "Hangi saati seçtiğinizi netleştirebilir misiniz? Lütfen listedeki seçeneğin numarasını tek başına yazın (örneğin: 1). Henüz onay talebi oluşturmadım.";
export const RESCHEDULE_ACKNOWLEDGEMENT =
  "Saat değişikliği tercihinizi not aldım. Takvim kontrolü ve ekip onayından sonra randevunuz kesinleşecek.";
export const CALENDAR_UNAVAILABLE_REPLY =
  "İstediğiniz saati not aldım. Seçtiğiniz uzmanın takvimine şu an erişemediğim için müsaitliği doğrulayamıyorum. Kontrol için talebinizi ekibimize iletiyorum; randevunuz henüz kesinleşmedi.";

export const INVOICE_REQUEST_REPLY =
  "Fatura talebinizi ekibimize ilettim. İlgili randevu ve fatura bilgileri kontrol edilerek size dönüş yapılacak.";
export const AGE_REQUEST_EXPLANATION =
  "Yaşınızı ön görüşme kaydını tamamlamak ve yaş grubunu ekibimize iletmek için soruyoruz. Bu bilgiyle tanı koymuyor veya sizin için terapi seçmiyoruz.";

export function asksWhyAgeIsNeeded(text: string) {
  const value = text.toLocaleLowerCase("tr-TR");
  return (
    !/emdr|terapi|hizmet|ücret|fiyat|fatura/u.test(value) &&
    /yaş|\b\d{1,3}\b/u.test(value) &&
    /neden|niye|ne için/u.test(value) &&
    /paylaş|sor|gerek|iste/u.test(value)
  );
}
export const PRICE_REQUEST_REPLY =
  "Güncel seans ücretini yetkili ekibimiz sizinle paylaşacak. Hangi hizmet veya uzman için fiyat bilgisi almak istersiniz?";
export const PRICE_REQUEST_MEDICATION_REPLY = `${PRICE_REQUEST_REPLY} İlaç konusunda tıbbi yönlendirme yapamam; bu konuyu doktorunuzla görüşmeniz gerekir.`;

// Exact combinations of two code-owned operational replies remain code-owned.
// Any appended model claim must still undergo institutional grounding.
const combinedOperationalReplies = [
  `${INVOICE_REQUEST_REPLY}\n\n${PRICE_REQUEST_REPLY}`,
  `${PRICE_REQUEST_REPLY}\n\n${INVOICE_REQUEST_REPLY}`,
];

const administrativeReplies: Readonly<Record<string, readonly string[]>> = {
  CLINIC_INFO: [CLINIC_CLARIFICATION],
  NEW_BOOKING: [
    SLOT_SELECTION_CLARIFICATION,
    BOOKING_ACKNOWLEDGEMENT,
    CALENDAR_UNAVAILABLE_REPLY,
    AGE_REQUEST_EXPLANATION,
    ...Object.values(INTAKE_QUESTIONS).map(
      (question) => `${AGE_REQUEST_EXPLANATION}\n\n${question}`,
    ),
  ],
  RESCHEDULE: [RESCHEDULE_ACKNOWLEDGEMENT, CALENDAR_UNAVAILABLE_REPLY],
  INVOICE_REQUEST: [INVOICE_REQUEST_REPLY, ...combinedOperationalReplies],
  PRICE_REQUEST: [
    PRICE_REQUEST_REPLY,
    PRICE_REQUEST_MEDICATION_REPLY,
    ...combinedOperationalReplies,
  ],
};

export function isAdministrativeAcknowledgement(text: string, intent: string) {
  return administrativeReplies[intent]?.includes(text) === true;
}
