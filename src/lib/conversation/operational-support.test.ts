import { expect, it } from "vitest";
import { operationalSupport } from "./operational-support";
import { asksAppointmentLookup } from "./appointment-lookup";
import { policyAnswers } from "./approved-policies";
it.each([
  "15 Ekim 16.00 online görüşmemin bağlantısı henüz gelmedi; nereden ve ne zaman gelecek?",
  "16 Ekim online görüşmesi için bağlantıyı denediğimde boş ekran açılıyor. Telefon kullanıyorum.",
  "Mesajlarımı kimler görebiliyor ve ne kadar saklıyorsunuz?",
  "Randevu hatırlatmalarında mesaj içeriği görünmesin istiyorum.",
  "15 Ekim randevuma bir arkadaşım benimle gelebilir mi? Bekleme alanında olacak.",
  "Ekran okuyucu kullanıyorum. Binada asansör var mı?",
  "16 Ekim görüşmem için katılım belgesi alabilir miyim?",
  "İptal şartları nelerdir?",
])("escalates operational uncertainty without inventing policy: %s", text => {
  expect(operationalSupport(text)?.reply).toContain("ekibimize aktarıyorum");
});
it.each(["Yarın 16:00 randevu istiyorum", "EMDR nedir?", "Online seans var mı?"])("keeps supported ordinary requests: %s", text => {
  expect(operationalSupport(text)).toBeNull();
});
it("recognizes a request for the actual appointment format", () => {
  expect(asksAppointmentLookup("Ömer Bey ile randevumun gününü, saatini ve yüz yüze mi online mı olduğunu tekrar yazar mısınız?")).toBe(true);
});
it("does not append an online sales answer to a refusal or existing meeting issue", () => {
  const knowledge = [{ id: "clinic_policy_online", title: "Online", source: "approved", content: "Online seans var.", version: 1 }];
  expect(policyAnswers("Online istemiyorum ama ödeme linki istiyorum", knowledge)).toEqual([]);
  expect(policyAnswers("Online bağlantım gelmedi", knowledge)).toEqual([]);
});
