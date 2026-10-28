import { INTAKE_QUESTIONS } from "./booking-flow";

// General terminology only; no clinic service, duration, outcome or personal
// suitability claim. Safety verification still runs on the combined response.
export const EMDR_DEFINITION =
  "EMDR, ‘Göz Hareketleriyle Duyarsızlaştırma ve Yeniden İşleme’ olarak adlandırılan bir psikoterapi yaklaşımıdır. Sizin için uygun olup olmadığını terapistinizle değerlendirebilirsiniz.";

export const FIRST_SESSION =
  "İlk görüşmede genellikle sizi getiren konular, beklentileriniz ve paylaşmak istediğiniz geçmiş bilgiler konuşulur. Terapist çalışma biçimini ve gizlilik çerçevesini açıklayabilir; sorularınızı sorabilirsiniz. Görüşmenin içeriği kişiye göre değişir; belirli bir sonuç veya iyileşme süresi vaat edilemez.";
export const MEDICATION_REPLY =
  "İlaç öneremem veya reçete düzenleyemem. Bu konuyu terapistinizle paylaşabilirsiniz; ilaç değerlendirmesi için yetkili bir hekime, örneğin psikiyatriste danışmalısınız.";

export function generalDefinition(inbound: string): string | undefined {
  const text = inbound.trim().toLocaleLowerCase("tr-TR");
  if (/ilaç|ilac/iu.test(text)) return MEDICATION_REPLY;
  if (/ilk (?:görüşme|seans)|seans nasıl|terapi (?:seansı|süreci).*nasıl/iu.test(text))
    return FIRST_SESSION;
  if (/bana|benim için|iyi gelir|kaç seans|ilaç|nasıl uygulan/iu.test(text)) return;
  return /(?:^|\s)emdr(?:[’'][\p{L}]+)?[^.!?]{0,60}(?:nedir|ne demek|ne anlama geliyor|sormuştum|sormustum)/u.test(
    text,
  )
    ? EMDR_DEFINITION
    : undefined;
}
export function isGeneralDefinitionReply(text: string) {
  return (
    [EMDR_DEFINITION, FIRST_SESSION, MEDICATION_REPLY].includes(text) ||
    Object.values(INTAKE_QUESTIONS).some(
      (question) => text === `${EMDR_DEFINITION}\n\n${question}`,
    )
  );
}
