import { it, expect } from "vitest";
import { clinicInformation } from "./clinic-information";
const source = {
  id: "kd_clinic",
  title: "Klinik hakkında",
  source: "approved",
  version: 1,
  content:
    "Klinik hakkında açıklama. İLETİŞİM Sorularınız mı var? İletişime Geç Örnek Plaza, Test Merkezi Çankaya/Ankara +90 000 000 00 00 P.tesi-Cumartesi: 10:00 – 19:00 Pazar: Kapalı",
};
it("does not serve a clinic document for a nearby restaurant question", () => {
  expect(
    clinicInformation("yakında sizin oralarda dönerci var mı yaşım 35", [source]),
  ).toBeUndefined();
});
it("still answers a clinic address mixed with a restaurant question", () => {
  expect(
    clinicInformation("Kliniğin adresi nedir, yakında dönerci var mı?", [source])?.answer,
  ).toContain("Adresimiz:");
});
it("extracts the approved address from a flat contact section", () => {
  const result = clinicInformation("kliniğin konumunu atabilir misiniz?", [source]);
  expect(result?.answer).toContain("Adresimiz: Örnek Plaza, Test Merkezi Çankaya/Ankara");
  expect(result?.answer).toContain("https://www.google.com/maps/search/?api=1&query=");
  expect(result?.answer).not.toContain("Sorularınız");
  expect(result?.answer).not.toContain("000 000");
  expect(result?.source).toBe(source);
});
it("reads a labelled address without changing the approved text", () => {
  expect(
    clinicInformation("adres", [
      {
        ...source,
        content:
          "Klinik adresi Örnek Mahallesi No 12 Ankara. Çalışma saatleri hafta içi 10:00-18:00.",
      },
    ])?.answer,
  ).toContain("Adresimiz: Örnek Mahallesi No 12 Ankara\n");
});
it("does not invent an address or ask which information again", () => {
  const answer = clinicInformation("adres", [])?.answer;
  expect(answer).toContain("onaylı adres bilgisine ulaşamıyorum");
  expect(answer).not.toContain("hangi bilgisine");
  expect(answer).not.toContain("maps");
});
it("extracts a brief approved introduction without website slogans", () => {
  const content =
    "Uzman Desteğiyle Yanınızdayız PSİKOLOJİK DANIŞMANLIK Yanınızda Olan Profesyonel Destek Bireysel ihtiyaçları merkeze alan, etik ilkelere bağlı ve bilimsel temelli yaklaşımlarımızla danışanlarımıza güvenli bir danışmanlık süreci sunuyoruz. Her bireyin sürecinin kendine özgü olduğuna inanıyor, bu yolculukta yanınızda olmayı önemsiyoruz. 01. Deneyimli uzmanlarla çalışıyoruz.";
  const result = clinicInformation("santa ile ilgili bilgi almak istiyordum", [
    { ...source, content },
  ]);
  expect(result?.answer).toBe(
    "Bireysel ihtiyaçları merkeze alan, etik ilkelere bağlı ve bilimsel temelli yaklaşımlarımızla danışanlarımıza güvenli bir danışmanlık süreci sunuyoruz.",
  );
  expect(result?.answer.length).toBeLessThan(260);
});
