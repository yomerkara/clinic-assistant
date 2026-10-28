# Santa Psikoloji WhatsApp Asistanı — Uygulama Checklist

## Deployment takibi

Canlıya geçişin güncel kapıları ve adım sırası [README — Deployment öncesi kontrol listesi](README.md#deployment-oncesi-kontrol-listesi) bölümündedir. 6 Ekim 2026 kararı: geliştirme ortamı devam ediyor; hosting/alan adı ve makine dışı yedek deployment aşamasına bırakıldı. Aşağıdaki eski ürün checklist'i üretim kabul kanıtı olarak kullanılmamalıdır.

İlk paylaşılabilir internet demosu için kabul edilen hedef **Render Free + Neon Free**. Dağıtımdan önce ücretsiz kota/uyku sınırları, Neon rol/TLS uyumu ve inbound worker/hatırlatma tetikleme tasarımı doğrulanacak. Gerçek klinik kullanımı için gerekli servislerin ücretliye geçişi ayrıca değerlendirilecek; Railway ilk demo hedefi değil.

## Gelecek sektör konseptleri — 7 Ekim 2026

Mevcut geliştirme odağı Santa Psikoloji'dir. Aşağıdaki alanlar sonraki ürün konseptleri için kaydedildi; bu liste şu anda sektör uyarlaması geliştirme kararı değildir.

- [ ] Diş klinikleri
- [ ] Güzellik salonları
- [ ] Medikal estetik
- [ ] Sağlık turizmi
- [ ] Diyetisyenlik

Kullanıcının ilk dört alan için paylaştığı referans: [KlinikPilot sektörler](https://www.klinikpilot.com/#sectors). Referansın özellikleri bu liste kapsamında incelenmedi.

Gelecek uyarlamalarda ortak randevu altyapısı, sektör kuralları ve işletmeye özel bilgiler ayrı ele alınacak. Sektöre göre gerekli profil alanları, hizmet süreleri, personel/oda/cihaz kaynakları, onay ve yönlendirme kuralları değerlendirilecek.

## Checklist kullanımı

- Her kutuyu küçük bir Cursor görevi tamamlandıktan sonra işaretle.
- Bir görev testleri geçmeden sonraki göreve geçme.
- Klinikle ilgili açık kararları `spec.md` içindeki açık kararlar bölümünde güncelle.

## 0. Ürün kararları

- [x] WhatsApp Business mevcut numarası kullanılacak.
- [x] Google Calendar kullanılacak.
- [x] Her terapist için ayrı takvim oluşturulacak.
- [x] Terapist çalışma saatleri, izinleri ve meşgul blokları sisteme girilecek.
- [x] Hatırlatma varsayılan olarak 1 gün önce gönderilecek.
- [x] Yeni saat önerileri 7–14 günlük pencerede yapılacak.
- [x] İlk sürüm mobil öncelikli olacak.
- [x] Stajyer onayı yönetim ekranı ve WhatsApp bağlantısı üzerinden yapılabilecek.
- [x] Audit sonrası karar: aynı gün dahil tüm iptaller insan onayı gerektirir; otomatik iptal kaldırıldı.
- [x] Terapist değişikliği çalışana aktarılacak.
- [x] Aynı numarada birden fazla kişi/randevu desteklenecek.
- [x] Klinik bilgi ve terapi açıklamaları klinik onaylı içerikten beslenecek.
- [ ] Resmi Santa sitesi için kaynak sayfa senkronizasyonu ve URL/sürüm takibi ekle.
- [ ] Siteden gelen değişiklikleri otomatik yanıt havuzuna almadan önce onaya düşür.
- [ ] Bilgi yanıtlarında kaynak sayfa ve içerik sürümünü logla.
- [ ] Onaylı kaynakta karşılığı olmayan hizmet/uzman/terapi sorularında otomatik insan devri için E2E test ekle.
- [x] Kritik ve hassas konular insana devredilecek.

## 1. Proje temeli

- [x] Next.js + TypeScript iskeletini oluştur.
- [x] Lint, format, typecheck ve test komutlarını ekle.
- [x] Environment validation ekle.
- [x] Health endpoint ve smoke test ekle.
- [x] Local README ve `.env.example` yaz.
- [x] CI kalite kapılarını ekle.
- [x] Docker Compose çalıştırma sözleşmesi: `app` + `postgres:16` (ücretli barındırıcı yok).

## 2. Veri ve yetkilendirme

- [x] Prisma schema ve PostgreSQL migration oluştur.
- [x] Demo seed verisi oluştur.
- [x] User ve rol modelini uygula.
- [x] Admin/intern/therapist authorization middleware’i ekle.
- [x] Therapist data isolation testlerini yaz.
- [x] AuditEvent modelini ve yazma servislerini ekle.

## 3. Takvim ve müsaitlik

- [x] Google Calendar adapter interface’i oluştur.
- [x] Fake Calendar adapter yaz.
- [ ] Çalışma saatleri ve busy blok modelini uygula.
- [ ] 7 günlük uygunluk önerisini uygula.
- [ ] 14 günlük fallback önerisini uygula.
- [ ] Timezone ve çakışma testlerini yaz.
- [ ] Gerçek Google OAuth akışını ekle.

## 4. WhatsApp ve konuşma

- [x] WhatsApp adapter interface’i oluştur.
- [x] Fake WhatsApp adapter yaz.
- [ ] Webhook signature verification ekle.
- [ ] Webhook idempotency ekle.
- [x] Conversation ve Message persistence ekle.
- [ ] Outbox ve retry davranışını ekle.
- [x] Human takeover modunu ekle.
- [ ] Gerçek WhatsApp Cloud API adapter’ını ekle.

## 5. Yapay zekâ ve güvenli yönlendirme

- [x] Intent enumlarını ve structured output şemasını oluştur.
- [x] Türkçe fixture test seti oluştur.
- [x] Tarih/saat/kişi/terapist extraction ekle.
- [x] Confidence threshold ve unknown fallback ekle.
- [x] Clinic/therapy knowledge document modeli ekle.
- [ ] Onaylı içerik workflow’u ekle.
- [x] Hassas ve acil mesaj handoff kuralını ekle.
- [x] AI aday yanıtlarına ve FAQ önbelleğine gönderim öncesi içerik kontrolü ve reddetme/hata durumunda insan devri testleri ekle.
- [ ] Sağlayıcının HTTP 403 erişim sorununu gider; gerçek model örneklerini ve klinik uzman kabulünü tamamla (F06).
- [x] Yönetici asistan test ortamı (simülasyon; kuyruğa yazmaz).

## 6. Randevu operasyonu

- [ ] Hatırlatma scheduler’ını ekle.
- [ ] Teyit akışını ekle.
- [ ] Yanıtsız hasta akışını ekle.
- [x] Gelecek tarihli iptal action request’ini ekle.
- [x] Aynı gün otomatik iptali kaldır; sürüme bağlı insan onayı ve tekrar güvenliği uygula.
- [x] Yeniden planlama akışını ekle.
- [x] Aynı telefon numarasında randevu seçimini ekle.
- [ ] Terapist değişikliği handoff’unu ekle.

## 7. Yönetim ekranı

- [x] Mobil dashboard shell oluştur.
- [x] Bekleyen işlemler listesini oluştur.
- [x] Action request detayını oluştur.
- [x] Approve/reject/edit/takeover işlemlerini ekle.
- [ ] WhatsApp onay bağlantısını ekle.
- [ ] Yanıtsızlar listesini ekle.
- [x] Otomatik iptal bildirimlerini ekle.
- [x] Terapist görünümünü sınırla.
- [ ] Admin terapist ve çalışma ayarlarını ekle.
- [x] Ayarlar sekmesi ve yönetici asistan test ortamı ekranı.
- [ ] Loading, empty ve error durumlarını tasarla.

## 8. Test ve teslim

- [x] Unit test suite çalışıyor.
- [x] Integration test suite çalışıyor.
- [ ] E2E teyit senaryosu çalışıyor.
- [ ] E2E iptal senaryosu çalışıyor.
- [ ] E2E yeniden planlama senaryosu çalışıyor.
- [ ] Gerçek sağlayıcılarla aynı gün iptalinin insan onayı olmadan uygulanmadığını ve onay sonrası teslimatını E2E doğrula.
- [ ] E2E human takeover senaryosu çalışıyor.
- [ ] E2E knowledge answer senaryosu çalışıyor.
- [ ] RBAC ve webhook güvenlik incelemesi tamamlandı.
- [ ] Hassas veri loglama incelemesi tamamlandı.
- [x] Klinik demo seed ve walkthrough hazır.
- [ ] Production öncesi açık kararlar klinikle onaylandı.

## Klinikten beklenen açık girdiler

- [ ] Kesin terapist listesi.
- [ ] Terapist uzmanlıkları ve tanıtım metinleri.
- [ ] Klinik hizmetleri ve terapi açıklamaları.
- [ ] Sık sorular ve onaylı yanıtlar.
- [ ] Acil durum yönlendirme metni.
- [ ] Klinik çalışma saatleri ve gün sonu saati.
- [ ] WhatsApp/Meta Business erişim bilgileri.
- [ ] Google Calendar sahiplik ve OAuth kararı.
- [ ] Veri saklama ve KVKK operasyon kararı.
