"use client";
import { useState } from "react";
import { GuidePreview } from "./ApplicationGuide";
import { SetupForm } from "./SetupForm";
export function OnboardingTour({ role }: { role: "ADMIN" | "THERAPIST" | "INTERN" }) {
  const [index, setIndex] = useState(0);
  const slides = [
    {
      name: "Konuşmalar",
      tag: "01 / İLETİŞİM",
      title: "Her konuşmanın bağlamı elinizin altında.",
      text: "Hasta mesajlarını ve asistanın cevaplarını birlikte okuyun. İnsan desteği gereken konuşmayı devralarak devam edebilirsiniz.",
      label: "Konuşma örneği",
      lines: [
        "Hasta · Randevumu başka bir güne alabilir miyim?",
        "Asistan · Uygun zamanı birlikte kontrol edelim.",
        "Ekip · Konuşmayı devral",
      ],
    },
    {
      name: "Onay kuyruğu",
      tag: "02 / KARAR",
      title: "Önerilen işlemi görün, sonra karar verin.",
      text:
        role === "INTERN"
          ? "Konuşmaları takip edebilirsiniz. Randevu işlemlerini yönetici veya ilgili terapist onaylar; bu hesap onay veremez."
          : role === "THERAPIST"
            ? "Size ait randevu taleplerini inceleyin. Hastanın mesajını, mevcut randevuyu ve önerilen değişikliği görerek karar verin."
            : "Klinik genelindeki randevu taleplerini inceleyin. Mesaj ve önerilen değişiklik üzerinden onay veya ret kararı verin.",
      label: "Talep örneği",
      lines: [
        "Saat değişikliği · Onay bekliyor",
        "Mevcut randevu → Önerilen yeni saat",
        role === "INTERN" ? "Yetkili onayı gerekli" : "İncele · Onayla · Reddet",
      ],
    },
    {
      name: role === "INTERN" ? "Çalışma alanı" : "Takvim ve kullanım",
      tag: "03 / TAKİP",
      title: "Gününüzü tek bir yerden takip edin.",
      text:
        role === "INTERN"
          ? "Yetkiniz olan konuşmalar ve bildirimlerle çalışın. Hesap bilgilerinizi Ayarlar bölümünden güncelleyebilirsiniz."
          : role === "THERAPIST"
            ? "Kendi randevularınızı ve size bağlı konuşmaların AI kullanımını takip edin. Google bağlantınızı Ayarlar bölümünden yönetin."
            : "Randevuları, klinik genelindeki AI kullanımını ve bağlantıları takip edin. Ekip hesaplarını ve ayarları yetkinize göre yönetin.",
      label: "Çalışma alanı örneği",
      lines: [
        "Bugün · Randevular ve bildirimler",
        role === "INTERN"
          ? "Konuşmalar · Ekiple koordinasyon"
          : "Kullanım · Çağrılar ve tahmini maliyet",
        "Ayarlar · Hesabınız ve bağlantılar",
      ],
    },
  ];
  const slide = slides[index];
  return (
    <div className="setup-tour">
      <div className="setup-tour-tabs" aria-label="Tanıtım ekranları">
        {slides.map((item, i) => (
          <button
            type="button"
            key={item.name}
            aria-current={i === index ? "step" : undefined}
            onClick={() => setIndex(i)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <section aria-live="polite" aria-atomic="true" className="setup-tour-slide">
        <span className="setup-eyebrow">{slide.tag}</span>
        <h2>{slide.title}</h2>
        <p>{slide.text}</p>
        <GuidePreview
          kind={
            index === 0
              ? "chat"
              : index === 1
                ? "queue"
                : role === "INTERN"
                  ? "account"
                  : "calendar"
          }
        />
      </section>
      <div className="setup-tour-controls">
        <button
          className="setup-text-button"
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
        >
          ← Önceki
        </button>
        <span>
          {index + 1} / {slides.length}
        </span>
        {index < slides.length - 1 ? (
          <button
            className="setup-primary"
            type="button"
            onClick={() => setIndex((i) => i + 1)}
          >
            Sonraki <span aria-hidden="true">→</span>
          </button>
        ) : (
          <SetupForm
            action="/api/onboarding/complete"
            label="Çalışma alanına geç"
            forward
          >
            <input type="hidden" name="intent" value="complete" />
            <input type="hidden" name="tourViewed" value="yes" />
          </SetupForm>
        )}
      </div>
    </div>
  );
}
