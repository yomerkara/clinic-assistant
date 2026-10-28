import { normalizePatientName } from "@/lib/patients/identity";

/** Safe staff escalation for operational questions; never invent clinic policy. */
export function operationalSupport(text: string): { reply: string; reason: string } | null {
  const v = normalizePatientName(text);
  if (/(?:online|goruntulu|gorusme|seans|meet).{0,90}(?:baglanti|bos ekran|teknik destek)|(?:baglanti).{0,50}(?:gelmedi|acilmiyor|ne zaman|nereden)/.test(v))
    return { reply: "Görüşme bağlantınızla ilgili yardımcı olması için sizi ekibimize aktarıyorum.", reason: "Online seans bağlantısı / teknik destek" };
  if (/mesajlarimi kim|kimler gorebili|ne kadar sakli|bildirim.{0,50}(?:icerik|mahrem|kapat)|hatirlatma.{0,50}(?:kapat|gorunme)|gizlilik|mahremiyet/.test(v))
    return { reply: "Verilerinize erişim, saklama veya bildirim tercihleriniz konusunda doğru bilgiyi paylaşması için sizi ekibimize aktarıyorum.", reason: "Mahremiyet / veri saklama / bildirim tercihi sorusu" };
  if (/refakat|bekleme alan|arkadasim.{0,35}(?:gelebilir|benimle)|asansor|erisilebilir|tekerlekli|giris tarifi/.test(v))
    return { reply: "Refakat ve kliniğe erişim koşullarını netleştirmesi için sizi ekibimize aktarıyorum.", reason: "Refakat / erişilebilirlik / ulaşım koşulları" };
  if (/katilim belge|istirahat rapor|rapor duzenle/.test(v))
    return { reply: "Belge talebiniz konusunda bilgi vermesi için sizi ekibimize aktarıyorum.", reason: "Katılım belgesi / rapor hakkında bilgi" };
  if (/iptal (?:sart|kosul|politika|kural)|ne kadar surede.{0,20}(?:don|yanit)|ne zaman.{0,20}(?:donus|yanit)/.test(v))
    return { reply: "Bu konuda güncel bilgiyi paylaşması için sizi ekibimize aktarıyorum.", reason: "İptal koşulları / ekip yanıt süresi sorusu" };
  return null;
}
