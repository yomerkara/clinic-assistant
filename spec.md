# Santa Psikoloji WhatsApp Asistanı — Ürün ve Teknik Spesifikasyon

## 1. Amaç

Santa Psikoloji’nin mevcut WhatsApp Business numarası üzerinden randevu teyidi, iptal ve yeniden planlama operasyonunu azaltmak; hastalara klinik, terapistler ve terapi yaklaşımları hakkında onaylı genel bilgiler vermek; belirsiz veya hassas konuşmaları çalışanlara devretmek.

İlk sürüm gerçek klinik kullanımına hazırlanacak ancak kritik takvim işlemlerinde insan-onaylı başlayacaktır. Sistem zamanla güvenilir işlemleri otomatikleştirebilecek şekilde tasarlanmalıdır.

## 2. Kapsam

### MVP kapsamı

- WhatsApp Business numarasından gelen mesajları alma ve yanıt gönderme.
- Randevudan varsayılan olarak 1 gün önce hatırlatma gönderme.
- Serbest metin yanıtlarını aşağıdaki niyetlere ayırma:
  - teyit
  - iptal
  - tarih/saat değiştirme
  - yeni randevu
  - klinik/terapist/terapi bilgisi
  - uzmanla görüşme talebi
  - belirsiz veya hassas mesaj
- Terapist bazlı Google Calendar müsaitlik kontrolü.
- Randevuların, çalışma saatlerinin, izinlerin ve meşgul blokların dikkate alınması.
- Yeni saat önerilerinin 7–14 günlük pencerede, hastanın mesaj bağlamına göre üretilmesi.
- Aynı WhatsApp numarasına bağlı birden fazla kişi/randevuyu ayırt etme.
- İnsan-onaylı işlem kuyruğu.
- Yönetici veya ilgili terapistin işlemi onaylaması/reddetmesi; stajyerin müşteri bilgilerini düzeltmesi veya konuşmayı devralması.
- WhatsApp üzerinden onay bağlantısı.
- Çalışanın WhatsApp konuşmasını devralmasıyla botun durması.
- Terapistin yalnızca kendisine ait randevu ve bildirimleri görmesi.
- Klinik yöneticisinin terapist ve çalışma ayarlarını yönetmesi.
- Aynı gün gelen iptal taleplerinin otomatik uygulanması; stajyer ve terapiste mesaj özetiyle bildirim gönderilmesi.
- Yanıt vermeyen hastaların bir kez hatırlatıldıktan sonra listeye alınması.
- Santa’nın resmi web sitesinden alınan ve klinik tarafından onaylanan bilgi içeriğiyle SSS/terapi açıklamaları; her bilgi yanıtında kaynak sayfa ve içerik sürümü izlenebilir olmalı.
- Kısa, sıcak, sade ve teşhis/tedavi önerisi vermeyen Türkçe iletişim.
- Hastaya yalnızca adıyla hitap edilmez; kayıtlı hitap tercihi biliniyorsa “Hanım/Bey” kullanılır, bilinmiyorsa cinsiyet tahmini yapılmadan nötr hitap tercih edilir.

### MVP dışı

- Ödeme alma.
- Online terapi görüşmesinin otomatik başlatılması.
- Teşhis, kriz değerlendirmesi veya kişisel tedavi önerisi.
- Terapist değişikliğinin otomatik yapılması.
- Çoklu dil.
- Gelişmiş raporlama ve performans analitiği.

## 3. Kullanıcı rolleri

### Hasta

WhatsApp üzerinden mesajlaşır; randevusunu teyit eder, iptal eder veya yeni saat ister; genel bilgi sorar.

### Stajyer / operasyon çalışanı

Tüm bekleyen işlemleri görür; müşteri bilgisini düzeltir, hastaya yazar veya konuşmayı devralır. Yetkili onay veya ret veremez.

### Terapist

Yalnızca kendi randevularını, kendi çalışma/izin durumunu ve kendisine gönderilen operasyon bildirimlerini görür.

### Klinik yöneticisi

Terapist ekler/çıkarır; çalışma saatlerini, izinleri, meşgul blokları, mesaj şablonlarını ve klinik içeriklerini yönetir; tüm kayıtları görür.

## 4. İş kuralları

1. Randevu hatırlatması varsayılan olarak randevudan 1 gün önce gönderilir. Bu ayar klinik yöneticisi tarafından değiştirilebilir.
2. Bir telefon numarası birden fazla kişi veya randevuya bağlı olabilir. Sistem tarih, saat, terapist ve kişi adıyla randevuyu netleştirmelidir.
3. Terapistin başka bir terapistle değiştirilmesi otomatik yapılmaz; çalışan devreye alınır.
4. Yeni randevu ve saat değişikliği ilk sürümde yönetici veya ilgili terapist onayı bekler.
5. Gelecekteki randevu iptalleri stajyer kuyruğuna düşer.
6. Randevu aynı gün içindeyse ve randevu saati geçmemişse iptal talebi otomatik uygulanır.
7. Aynı gün otomatik iptalde stajyere ve ilgili terapiste, mesajın operasyonel özetiyle bildirim gönderilir. Gereksiz hassas içerik aktarılmaz.
8. Randevu saati geçmişse sistem otomatik iptal yapmaz; kayıt “gelmedi / inceleme bekliyor” durumuna düşer.
9. Yetkili onaylamadığında yeni randevu veya saat değişikliği kesinleşmez.
10. Çalışan konuşmayı devraldığında otomatik bot yanıtları durur.
11. Klinik içeriği yalnızca klinik tarafından sağlanıp onaylanan kaynaklardan yanıtlanır. Bilgi yoksa uydurma yapılmaz; çalışan devreye alınır.
12. Asistan kişisel teşhis, tedavi, ilaç, acil durum veya kriz önerisi vermez. Klinik tarafından belirlenecek acil yönlendirme metni kullanılır.

## 5. Ana akışlar

### 5.1 Hatırlatma ve teyit

1. Scheduler, yaklaşan randevuları bulur.
2. Hatırlatma mesajı WhatsApp’tan gönderilir.
3. Gelen yanıt intent sınıflandırmasından geçer.
4. “Geleceğim” yanıtında randevu teyit edilir ve audit kaydı oluşturulur.
5. Yanıt gelmezse bir kez hatırlatma yapılır; hasta yanıtsızlar listesine alınır.

### 5.2 İptal

- Gelecekteki randevu: iptal önerisi stajyer kuyruğuna düşer.
- Aynı gün, saat geçmemiş: iptal otomatik gerçekleşir; bildirimler gönderilir.
- Hasta iptalden sonra yeni randevu isterse yeni uygunluk akışı başlar.

### 5.3 Yeniden planlama

1. Hasta tarih/saat isteğini serbest metinle yazar.
2. Sistem mevcut randevuyu ve istenen bağlamı çözer.
3. İlgili terapistin Google Calendar müsaitliği kontrol edilir.
4. 7–14 günlük pencereden 2–3 seçenek önerilir.
5. Hasta seçimi bekleyen işlem olarak kaydedilir.
6. Yetkili onayından sonra Calendar güncellenir ve hasta bilgilendirilir.

### 5.4 Klinik bilgisi

Asistan yalnızca Santa’nın resmi web sitesinden (`santapsikoloji.com`) senkronize edilen ve klinik tarafından onaylanan içerik havuzundan klinik, terapistler, hizmetler, EMDR, davranışçı terapi, çocuk terapisi ve benzeri başlıklarda genel açıklama verir. Her bilgi yanıtı kullanılan kaynak sayfa, içerik sürümü ve son doğrulama zamanı ile kaydedilir.

- Site içeriği canlı olarak her mesajda körlemesine kullanılmaz; sayfalar düzenli senkronize edilir, değişen içerik yeniden onaya düşer.
- Onaylı kaynakta karşılığı bulunmayan hizmet, uzman, ücret, süre veya yöntem bilgisi tahmin edilmez.
- Kaynak bulunamazsa asistan açıkça bilgi veremediğini söyler ve konuşmayı çalışana aktarır.
- Randevu müsaitliği ve takvim bilgisi web sitesinden değil, Google Calendar’dan doğrulanır.

### 5.5 İnsan devri

İnsan devri şu durumlarda başlatılır:

- Hasta uzmanla görüşmek istiyor.
- Asistanın güveni düşük.
- Terapist değişikliği isteniyor.
- Acil/hassas bir konu algılanıyor.
- Bilgi havuzunda yanıt yok.
- Hasta açıkça çalışanla konuşmak istiyor.

### 5.6 Asistan test ortamı (simülasyon)

Klinik yöneticisi, gerçek WhatsApp veya takvime dokunmadan asistanı dener:

- Ekran Ayarlar altındadır; alt sekme çubuğuna beşinci sekme eklenmez. Yalnızca `ADMIN` erişir (sunucu tarafında zorunlu).
- Yönetici hasta olarak yazar; asistan gerçek LLM çağrısıyla (veya sahte adaptörle) yanıtlar.
- Çözümleme paneli niyet, güven, varlıklar, bilgi kaynağı, oluşacak işlem, devir ve uygulanan kuralları aynı anda gösterir.
- Simülasyonda hiçbir WhatsApp mesajı gitmez, Google Calendar değişmez, onay kuyruğuna kayıt düşmez, bildirim oluşmaz.
- “Şu an” değeri sahte saat olarak verilebilir; aynı gün iptal ve saati geçmiş randevu kuralları böyle denenir.
- Güven eşiği geçici olarak %70’tir (spec §9 sayı vermez; klinik netleştirene kadar).

## 6. Önerilen teknik mimari

Greenfield proje için önerilen başlangıç:

- Web uygulaması: Next.js + TypeScript.
- UI: responsive, mobil öncelikli; erişilebilir bileşenler.
- API: Next.js route handlers veya ayrı TypeScript servis katmanı.
- Veritabanı: PostgreSQL + Prisma.
- Çalıştırma sözleşmesi: Docker Compose (`app` + `db`). Yerel ve ilerideki üretim aynı imajı kullanır. Ücretli bir barındırıcı henüz seçilmez.
- Kuyruk/scheduler: ilk prototipte veritabanı tabanlı job tablosu; ayrı worker konteyneri sonraya bırakılır. Üretimde güvenilir queue/cron sağlayıcısına taşınabilir.
- WhatsApp: WhatsApp Cloud API adapter’ı; sağlayıcı ayrıntıları uygulama kodundan soyutlanmalı.
- Takvim: Google Calendar OAuth adapter’ı; terapist takvimleri ve “busy” blokları ortak availability servisinden okunmalı.
- LLM: provider-agnostic adapter; yapılandırılmış intent çıktısı ve güven skoru zorunlu. Yönetici test ortamı her zaman gerçek modeli çağırır. Sahte adapter yalnızca otomatik testlerdedir.
- Yetkilendirme: rol tabanlı erişim (admin, intern, therapist).
- Gözlemlenebilirlik: inbound/outbound mesaj, intent, işlem, onay ve hata audit logları.
- Sağlık: `GET /api/health` veritabanını yoklar; Docker `HEALTHCHECK` bunu kullanır.

Harici entegrasyonlar için interface/adapter kullanılmalıdır. Testlerde gerçek WhatsApp veya Google Calendar çağrısı yapılmamalı; fake adapter kullanılmalıdır.

## 7. Temel veri modeli

- `User`: id, role, name, email, active.
- `TherapistProfile`: userId, displayName, specialties, calendarId, active.
- `Patient`: id, phone, displayName, consentStatus, createdAt. Aynı phone birden fazla Patient kaydına bağlanabilir; telefon numarası kişi kimliği olarak kullanılmaz.
- `Appointment`: id, patientId, therapistId, calendarEventId, startAt, endAt, status, source.
- `Conversation`: id, patientId, phone, mode (`bot`, `human`), assignedTo, lastMessageAt. Yeni bir kişi konuşmada ortaya çıkarsa mevcut numaranın altına ayrı Patient kaydı açılır ve işlem sahibi netleşmeden aksiyon uygulanmaz.
- `Message`: id, conversationId, direction, text, providerMessageId, createdAt, redaction metadata.
- `IntentDecision`: messageId, intent, confidence, extractedEntities, modelVersion.
- `ActionRequest`: id, type, appointmentId, proposedChanges, status, requestedBy, reviewedBy, expiresAt.
- `KnowledgeDocument`: id, title, content, source, approvalStatus, version.
- `Notification`: recipient, type, payload, deliveryStatus.
- `AuditEvent`: actor, action, entityType, entityId, metadata, createdAt.
- `SimulationThread`: adminUserId (unique), conditions JSON, turns JSON. Gerçek Conversation/Appointment/ActionRequest satırlarına bağlanmaz.

## 8. Güvenlik ve gizlilik

- API anahtarları yalnızca sunucu tarafında tutulmalı.
- Webhook imzaları doğrulanmalı.
- RBAC her endpoint’te uygulanmalı; yalnızca UI gizlemesine güvenilmemeli.
- Terapist sorguları therapistId ile sınırlandırılmalı.
- Hassas mesajlar bildirim özetlerinde minimize edilmeli.
- Production loglarında telefon numarası ve mesaj metni maskelenmeli veya erişim kontrollü saklanmalı.
- Klinikle veri saklama süresi, hasta bilgilendirmesi ve KVKK sorumlulukları ayrıca netleştirilmelidir; uygulama bunları varsaymamalıdır.

## 9. Hata ve belirsizlik davranışı

- Düşük güvenli intent: işlem yapma, çalışan kuyruğuna aktar.
- Google Calendar erişimi yok: hastaya kesin saat verme; çalışan bildirimi oluştur.
- WhatsApp gönderimi başarısız: retry yap, tekrarları idempotency key ile engelle.
- Aynı randevu üzerinde çakışan talepler: ilk onaylı işlem kazanır; diğer işlem tekrar kontrol edilir.
- Yetkili onayı olmadan kesinleşmeyen işlem hastaya “talebiniz alındı” olarak gösterilir.

## 10. Test planı

### Birim testleri

- Türkçe intent sınıflandırma örnekleri.
- Tarih/saat ve “bu hafta / perşembe akşamı” entity extraction.
- Aynı telefon numarasındaki birden fazla randevuyu ayırt etme.
- Aynı gün iptal kuralı.
- Randevu saati geçmiş iptal kuralı.
- 7–14 günlük uygunluk seçimi.
- Terapist rol izolasyonu.
- İdempotent webhook işleme.

### Entegrasyon testleri

- Fake WhatsApp adapter ile mesaj alıp yanıt gönderme.
- Fake Google Calendar ile busy bloklara göre saat önerme.
- Yetkili onayının Calendar event’ine yansıması.
- Human takeover sonrası botun durması.

### E2E / demo testleri

- Hatırlatma → teyit.
- Gelecek tarihli iptal → yönetici veya ilgili terapist onayı.
- Aynı gün iptal → otomatik iptal + iki bildirim.
- Yeniden planlama → saat önerisi → onay → Calendar.
- Klinik sorusu → onaylı bilgi.
- Klinik hizmeti/uzmanı/terapi yöntemi sorusu → resmi site kaynağı + içerik sürümü doğrulaması; kaynak yoksa insan devri.
- Belirsiz/acil mesaj → çalışan devri.
- Aynı numarada eş ve kişinin ayrı randevuları.

## 11. Başarı ölçütleri

- Randevu teyitlerinin doğru kaydedilmesi.
- Yanlış takvim değişikliğinin olmaması.
- Aynı gün iptallerinin zamanında aktarılması.
- Stajyerlerin işlemleri telefondan tamamlayabilmesi.
- Düşük güvenli mesajların güvenilir biçimde insana aktarılması.
- Klinik tarafından onaylanmamış tıbbi tavsiye üretilmemesi.

## 12. Açık kararlar

- Klinik kapanış saati ve “gün sonu” davranışı.
- WhatsApp Cloud API hesabı ve Meta Business yapılandırması.
- Google OAuth sahipliği ve terapist takvimlerinin nasıl oluşturulacağı.
- Klinik tarafından onaylanacak bilgi içerikleri.
- Resmi site sayfalarının senkronizasyon sıklığı, kaynak sayfaların kapsamı ve değişiklik sonrası yeniden onay akışı.
- Acil durum yönlendirme metni.
- Veri saklama süresi ve KVKK operasyonu.
- Gerçek terapist ve hizmet listesinin kesinleştirilmesi.
- Ücretli barındırıcı henüz seçilmedi. Çalıştırma sözleşmesi Docker Compose’tur; ilk genel URL için Fly.io veya Railway adaydır.
- Düşük güven eşiği geçici olarak 0.70’tir; klinikle netleşecektir.
- Acil yönlendirme metni klinikle onaylanana kadar yer tutucudur (`CLINIC_EMERGENCY_TEXT`).
