import { normalizePatientName } from "@/lib/patients/identity";

export function securityHandoff(text: string) {
  const v = normalizePatientName(text);
  if (
    /talimatlari unut|kurallari unut|sistem prompt|system prompt|onceki talimat|tum hastalar|butun hastalar/.test(
      v,
    )
  )
    return {
      silent: true,
      reason:
        "Prompt manipülasyonu / toplu hasta verisi talebi; hiçbir veri veya yanıt gönderilmedi.",
    };
  // "onayı almadan ... kesinleştir" is the same request as "onayı atla", so the
  // skip wording is matched together with a finalise verb. A patient who simply
  // waits for approval, or asks how it works, is not asking to bypass it.
  if (
    /onay(?:i|ini)? atla|kurallari atla|onaysiz|onay(?:i|ini)? (?:almadan|beklemeden|bekleme)\b.{0,80}(?:kesinlestir|onayla|olustur|ayarla)|eksik olsa.*(?:onay|takvim)/.test(
      v,
    )
  )
    return {
      silent: false,
      reason:
        "Hasta bilgi veya çalışan onayı kontrolünü atlamayı istedi; işlem yapılmadı.",
    };
  if (
    /(?:yasimi|soyadimi|adimi|bilgilerimi|terapi deneyimimi|terapi gecmisimi).{0,40}(?:soylemek|vermek|paylasmak) istemiyorum/.test(
      v,
    )
  )
    return {
      silent: false,
      reason:
        "Hasta zorunlu profil bilgisini paylaşmak istemedi. Aynı soru tekrar sorulmadı; çalışan görüşmesi gerekiyor.",
    };
  return null;
}
