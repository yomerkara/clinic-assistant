# Cursor Uygulama Prompt Planı

Bu plan greenfield uygulama içindir. Her prompt ayrı bir Cursor oturumunda veya ayrı bir görevde çalıştırılabilir. Bir adıma geçmeden önce önceki adımın testleri geçmeli ve çalışan kod repoda bulunmalıdır.

## Cursor çalışma kuralları

- `spec.md` ve `todo.md`yi kaynak gerçeklik kabul et.
- Küçük, geri alınabilir değişiklikler yap.
- Her adımda test ekle veya mevcut testleri güncelle.
- Gerçek WhatsApp, Google ve LLM çağrılarını testlerde kullanma; adapter ve fake implementasyon kullan.
- Varsayım yaparsan `todo.md`nin açık kararlar bölümüne ekle.
- Güvenlik, RBAC ve audit logları sonradan eklenmek üzere bırakma.
- Bir görevin sonunda ne yaptığını, hangi testleri çalıştırdığını ve açık kalan noktaları raporla.

## Prompt 1 — Proje iskeleti ve kalite kapıları

```text
spec.md dosyasını oku. Bu greenfield proje için mobil öncelikli Next.js + TypeScript uygulama iskeleti kur. Prisma/PostgreSQL bağlantı katmanını, environment validation yapısını, lint/format/test komutlarını ve temel CI kalite kapılarını ekle. Henüz gerçek entegrasyonlara bağlanma. Basit bir health endpoint ve smoke test oluştur. README’ye local kurulum ve komutları yaz. Önce mevcut dosyaları kontrol et, gereksiz teknoloji ekleme. İş bitince testleri çalıştır ve özet raporla.
```

## Prompt 2 — Veri modeli, migration ve seed

```text
spec.md içindeki veri modelini Prisma ile uygula. User, TherapistProfile, Patient, Appointment, Conversation, Message, IntentDecision, ActionRequest, KnowledgeDocument, Notification ve AuditEvent modellerini ekle. Role ve status enumlarını tanımla. İlişkiler, indeksler, unique alanlar ve soft-state davranışlarını düşün. Demo seed verisi ekle: iki terapist, çalışma blokları, izin bloğu, birkaç hasta ve randevu. Migration ve model testlerini yaz. Gerçek kişisel veri kullanma.
```

## Prompt 3 — RBAC ve mobil yönetim kabuğu

```text
Spec’e göre admin, intern ve therapist rollerini uygula. Server-side authorization ile therapist kullanıcısının yalnızca kendi randevu ve bildirimlerini görmesini sağla; intern tüm operasyon kuyruğunu, admin tüm ayarları görsün. Mobil öncelikli dashboard shell, login placeholder ve rol bazlı navigation oluştur. Yetki ihlali testleri yaz. UI gizleme tek güvenlik katmanı olmasın.
```

## Prompt 4 — Google Calendar adapter ve availability servisi

```text
Google Calendar entegrasyonu için interface tabanlı bir adapter tasarla. Terapist takvim event’lerini, randevuları ve busy blokları tek bir availability servisinde birleştir. 7 ve 14 günlük pencere, çalışma saatleri, izinler ve meşgul bloklar için deterministik saat önerme fonksiyonu yaz. Gerçek OAuth çağrısını şimdilik fake adapter ile değiştir; bir sonraki entegrasyon için TODO bırak. Çakışma ve timezone testlerini ekle.
```

## Prompt 5 — WhatsApp adapter, webhook ve mesajlaşma

```text
WhatsApp Business Cloud API için provider-agnostic inbound/outbound adapter interface oluştur. Webhook signature doğrulama, idempotency ve retry sınırlarını ekle. Gelen mesajı Conversation ve Message kayıtlarına yaz; gönderilecek yanıtları outbox mantığıyla oluştur. Gerçek Meta credential gerektirmeyen fake adapter ve webhook integration testleri yaz. Secret’ları loglama.
```

## Prompt 6 — Türkçe intent ve entity extraction katmanı

```text
spec.md’deki intentleri Türkçe serbest metin için yapılandırılmış bir domain çıktısına dönüştür. Intent enumları: confirm, cancel, reschedule, new_booking, clinic_info, therapist_info, therapy_info, human_request, sensitive_or_emergency, unknown. Tarih, saat, kişi, terapist ve randevu adaylarını çıkar. LLM provider interface kullan; JSON schema ile doğrulama ve düşük confidence fallback ekle. LLM olmadan çalışan fixture-based testler yaz. Yönetici Asistan Test Ortamı (`/settings/simulator`) aynı LLM sözleşmesini gerçek modelle dener; simülasyon kuyruğa yazmaz.
```

## Prompt 7 — Conversation orchestrator

```text
Intent kararını, hasta/randevu çözümünü, availability servisini ve mesaj şablonlarını bir orchestrator içinde birleştir. Aynı telefon numarasındaki birden fazla randevuyu listeleyip seçim isteyebilsin. Teyit, iptal, yeniden planlama, klinik bilgisi, human handoff ve unknown akışlarını uygula. Bu adımda Calendar’a kritik mutation yapma; ActionRequest üret. Her akış için unit ve integration test ekle.
```

## Prompt 8 — Action request ve stajyer onayı

```text
ActionRequest kuyruğunu ve mobil yönetim ekranını uygula. Stajyer işlemi approve, reject, edit veya takeover yapabilsin. Approve sonrası ilgili adapter üzerinden Calendar mutation çalışsın ve audit event yazılsın. Aynı gün iptal kuralını uygula: randevu tarihi bugün ve saat geçmemişse iptal otomatik çalışsın; stajyere ve terapiste operasyonel mesaj özetiyle bildirim gönderilsin. Aynı randevuya iki işlemin çakışmasını transaction/idempotency ile koru.
```

## Prompt 9 — Human takeover ve bildirimler

```text
Çalışan mesaj yazdığında veya takeover seçtiğinde Conversation.mode=human olsun ve bot otomatik yanıt üretmesin. Yönetim ekranından botu yeniden etkinleştirme ekle. Stajyer, terapist ve admin bildirim tercihlerini ve Notification kayıtlarını uygula. Hassas mesajın tamamını bildirim payload’ına taşımama; operasyonel özet üretme ve log maskesi ekle. Testleri yaz.
```

## Prompt 10 — Hatırlatma scheduler ve yanıtsızlar

```text
Randevudan varsayılan olarak 1 gün önce reminder job üreten scheduler ekle. Job’lar idempotent olsun. Yanıt gelmezse bir kez follow-up gönder ve unresponsive listesine al; ikiden fazla otomatik hatırlatma gönderme. Clinic settings üzerinden hatırlatma zamanını değiştirilebilir yap. Fake clock ile scheduler testleri yaz.
```

## Prompt 11 — Bilgi havuzu ve güvenli cevaplama

```text
KnowledgeDocument CRUD ve approval workflow oluştur. Klinik tarafından onaylanmamış içerik cevap kaynağı olmasın. Terapist, terapi yöntemi ve klinik SSS cevaplarında yalnızca onaylı içerik kullan. Teşhis, tedavi, ilaç, kriz veya kişisel tıbbi tavsiye içeren mesajları human handoff’a yönlendir. Acil yönlendirme metnini clinic settings ile yapılandırılabilir bırak. Retrieval ve fallback testleri yaz.
```

## Prompt 12 — Gerçek Google OAuth ve WhatsApp bağlantısı

```text
Önceki fake adapter sözleşmelerini koruyarak Google OAuth ve WhatsApp Business Cloud API entegrasyonlarını uygula. Token saklama, webhook doğrulama, timezone ve retry davranışlarını güvenli yap. Local development için mock mode bırak. Gerçek secret’ları repoya yazma. Sağlayıcı hatalarını kullanıcıya güvenli mesajla, personele ayrıntılı audit logla yansıt. Entegrasyon testleri için fixture ve contract testleri ekle.
```

## Prompt 13 — E2E demo ve operasyonel sertleştirme

```text
spec.md’deki tüm demo senaryolarını E2E test olarak uygula: teyit, gelecek tarihli iptal, aynı gün otomatik iptal, yeniden planlama, aynı numarada iki kişi, klinik sorusu, düşük güven ve human takeover. Seed edilmiş demo ortamı ve mobil dashboard akışını hazırla. Error boundary, empty states, loading states, audit log görünümü ve güvenli redaction ekle. Testleri çalıştır, README’ye demo walkthrough yaz ve todo.md’yi güncelle.
```

## Prompt 14 — Son güvenlik ve teslim incelemesi

```text
Projeyi senior engineer ve privacy-aware reviewer gibi incele. RBAC bypass, webhook replay, duplicate action, timezone, prompt injection, hassas veri loglama, yanlış tıbbi tavsiye ve Calendar race condition risklerini ara. Somut bulguları dosya ve satırla raporla; yüksek öncelikli düzeltmeleri uygula; testleri yeniden çalıştır. Varsayımları ve production öncesi açık maddeleri README’ye ekle.
```
