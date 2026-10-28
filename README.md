# Santa Psikoloji WhatsApp Asistanı

Klinik operasyon konsolu: randevu taleplerini yönetici veya ilgili terapist onaylar; stajyer konuşmaları sürdürebilir. Google Calendar gerçek bağlantı gerektirir ve bağlantı yokken kesin saat önerilmez. WhatsApp gönderim adaptörü hâlen **MemoryWhatsApp** üzerindedir; gerçek WhatsApp teslimatı bu değişiklik kapsamında değildir. Yönetici **Asistan Test Ortamı** ekranında hasta gibi yazıp gerçek LLM yanıtı alabilir; bu simülasyon kuyruğa ve takvime yazmaz.

Kaynak gerçeklik: [`spec.md`](spec.md), görev listesi: [`todo.md`](todo.md).

**Canlıya geçişte başlangıç noktası:** [Deployment öncesi kontrol listesi](#deployment-oncesi-kontrol-listesi). Yerel geliştirmedeki başarı, üretim kabulü değildir.

## Çalıştırma (Docker Compose)

Bu proje şu anda **yerel geliştirme ortamıdır**. Çalışan servisler `app`, `db`, `inbound`, `reminders` ve HTTPS sağlayan `proxy` servisidir. Mevcut `.env` ve `.local/` dosyalarını örnek dosyayla değiştirmeyin.

Mevcut kurulumu başlatmak için:

```sh
docker compose up -d
```

- Uygulama: https://localhost
- Sağlık: https://localhost/api/health
- Eski http://localhost:3000 adresi HTTPS'e yönlenir.
- PostgreSQL yalnızca `127.0.0.1:55432` üzerinde yayınlanır ve TLS gerektirir.
- Uygulama portu Docker ağı dışına doğrudan açılmaz; web ve DB portları yalnızca bu bilgisayardan erişilir.
- `.env` içindeki mevcut kullanıcı/sağlayıcı ve veri şifreleme anahtarları korunur. Otomatik seed yoktur; mevcut kullanıcılar kullanılmalıdır.

Yeni boş bir kurulumda `.env.example` dosyasını `.env` olarak kopyalayıp bağımsız güçlü parolaları doldurun; sonra `sh scripts/db/tls/generate-local.sh` ve `sh scripts/ops/generate-local-https.sh` çalıştırın. Yerel HTTPS CA'sını macOS kullanıcı anahtar zincirine ekleyin:

```sh
security add-trusted-cert -r trustRoot -p ssl \
  -k "$HOME/Library/Keychains/login.keychain-db" .local/https-authority/root.crt
docker compose up -d --build
```

Bu CA sertifikasının ad kısıtları yalnızca localhost ve loopback adreslerine izin verir. Chrome güven doğrulaması atlanmadan test edilmiştir. Node/OpenSSL tabanlı araçlar sistem anahtar zincirini kullanmıyorsa `NODE_EXTRA_CA_CERTS="$PWD/.local/https-authority/root.crt"` veya `curl --cacert .local/https-authority/root.crt` kullanın; TLS doğrulamasını kapatmayın.

Model yapılandırması `.env` içindeki `OPENAI_API_KEY` veya `LLM_API_KEY` + `LLM_API_BASE` ile yapılır. Eksik tarife ücretsiz kullanım anlamına gelmez.

## Yerel Node geliştirmesi

Docker app/proxy 3000 portunu kullandığından `next dev` için ayrı port ve uygun geliştirme origin'i kullanın veya Docker web servislerini durdurun. Veritabanı için kısıtlı `DATABASE_URL`, şema değişiklikleri için ayrı `MIGRATION_DATABASE_URL` ve doğru CA dosyası gerekir. Seed yalnızca atılabilir ayrı geliştirme DB'sinde açık onayla çalıştırılmalıdır; mevcut veride çalıştırmayın.

## Komutlar

| Komut               | Ne yapar                                                    |
| ------------------- | ----------------------------------------------------------- |
| `npm test`          | Vitest (kuyruk servisi için ayrı TEST_DATABASE_URL gerekir) |
| `npm run typecheck` | TypeScript                                                  |
| `npm run lint`      | ESLint                                                      |
| `npm run format`    | Prettier                                                    |
| `npm run db:seed`   | Demo klinik verisi                                          |

## Mimari kısaca

- Next.js App Router, rol tabanlı oturum çerezi
- Prisma + PostgreSQL
- `CalendarPort`: gerçek Google bağlantısı; `WhatsAppPort`: henüz bellek içi adaptör
- `LlmPort`: OpenAI-uyumlu Chat Completions. Yönetici simülasyonu gerçek modeli çağırır; sahte adaptör yalnızca birim testlerdedir.
- Yönetici simülasyonu `SimulationThread` tablosunda durur; gerçek `ActionRequest` üretmez
- Diğer takvim değişiklikleri yönetici veya ilgili terapist onayı bekler; stajyer onaylayamaz
- Aynı randevu sürümüne ait çakışan taleplerde ilk onaylanan işlem kazanır; sonraki değişiklik yeni sürümle yapılır

## Sonraki adımlar

WhatsApp Cloud API, Google Calendar canlı hesap doğrulaması, e-posta sağlayıcısının etkinleştirilmesi — `prompt_plan.md`. Hatırlatma worker servisi yerel ortamda etkindir.

## Hesap güvenliği ve yeni ekranlar

- `/conversations/[id]` ve `/queue/[id]` mevcut Santa menüsünde konuşma ve karar panelini birlikte gösterir.
- `/patients` müşteri listesi, `/patients/[id]` profil/randevu/konuşma geçmişidir. Terapist sorguları müşteri ilişkisiyle sınırlandırılır; ilişkisiz kayıtlar varsayılan olarak reddedilir.
- `/calendar` bağlı Google takvimini ve yerel randevuları yedi günlük görünümde sunar. Özel Google etkinlikleri içerikleri yerine meşgul blokları olarak gösterilir. Yönetici/ilgili terapist doğrudan randevu oluşturabilir ve saati değiştirebilir; tüm yazımlar ortak müsaitlik ve yetki kontrolünden geçer.
- Giriş kullanıcı adı veya e-posta kabul eder. İlk kurulum; kullanıcı adı/şifre, doğrulanmış kurtarma e-postası, TOTP ve tek kullanımlık kurtarma kodlarını içerir. Kurulum API erişiminde de zorunludur. Şifre süresi altı takvim ayıdır (`PASSWORD_ROTATION_MONTHS=6`). Süre dolunca uygulama erişimi yenileme ekranına yönlenir.
- Şifreler salt içeren sürümlü scrypt hash'idir. Eski hash'ler girişte doğrulanabilir, yeni şifreler güçlendirilmiş parametrelerle kaydedilir. Google tokenları ve TOTP anahtarları kullanıcıya bağlı AES-256-GCM ile şifrelenir. Sıfırlama/doğrulama tokenları ile MFA kurtarma kodları yalnızca hash olarak tutulur.
- E-posta adaptörü Resend için hazırlanmıştır; başka sağlayıcı seçilirse `src/lib/auth/mail.ts` değiştirilebilir. Sağlayıcıya canlı bağlanılmadan e-posta teslimatı doğrulanmış sayılmaz.

### Etkinleştirmeden önce

1. `APP_URL` gerçek HTTPS origin'i olmalı; yönlendirmeler ve CSRF kontrolü bu değeri kullanır. Proxy Host başlığı güven kaynağı değildir.
2. `DATA_ENCRYPTION_KEY` için bağımsız 32 baytlık rastgele anahtarı hex biçiminde secret manager'a koyun. Anahtarı git'e veya veritabanına yazmayın; yedekleyin. Mevcut anahtarı plansız değiştirmek kayıtlı tokenları okunamaz hâle getirir.
3. Doğrulanmış gönderici alan adıyla `AUTH_MAIL_FROM` ve `RESEND_API_KEY` ayarlayın. Bunlar olmadan hesap kurulumunun e-posta adımı tamamlanamaz; canlı ortamda kurulum atlanamaz. Yerel önizlemede `ALLOW_LOCAL_SETUP_SKIP=true` ve localhost `APP_URL` ile “Şimdilik atla” açılır. Bu seçenek kurulum alanlarını doğrulanmış yapmaz; yalnızca mevcut oturumda 24 saatlik erişim sağlar.
4. Veritabanını yedekleyip `npm run db:migrate` çalıştırın. Mevcut plaintext Google tokenları varsa aynı ortamda `npx tsx scripts/encrypt-calendar-tokens.ts` çalıştırın veya hesapları tekrar bağlayın. Araç token içeriklerini yazdırmaz. Şifrelenmemiş eski tokenlar normal uygulama tarafından kullanılmaz.
5. Google OAuth redirect adreslerini ve izinlerini yapılandırın. Her terapist kendi hesabını bağlamalı; başka yöneticinin takvimine sessiz geçiş yapılmaz. Gerçek hesapla müsaitlik, ekleme/değiştirme, bağlantı iptali ve token yenileme testi yapın.
6. Araştırma tamamlandığında paket modellerini ve tarifelerini tanımlayın. Fiyatlar USD / milyon giriş-çıkış tokenı olarak ayrı saklanır. Farklı ticari birim seçilecekse müşteriye açmadan önce tarife katmanını uyarlayın.

### Sınırlar

Bu sürüm tek klinik kurulumudur; birden fazla kliniğin aynı veritabanını paylaşması için tenant modeli ve ayrı yetki denetimi gerekir. Google yazımı ile PostgreSQL işlemi dağıtık tek transaction değildir: dış hizmet kesintisi sonrası takvim/veritabanı uzlaştırması gerekebilir. Google'a yazılan yeni etkinliklerde işlemden türetilmiş kimlik tekrarın çift etkinlik üretmesini önler. Aynı terapiste yerel eşzamanlı yazımlar kilitlenir; dışarıdan Google takvimine eşzamanlı müdahale ayrıca izlenmelidir. Gerçek e-posta/Google teslimatı ve dağıtım altyapısının yedek, saklama, izleme politikaları canlı ortamda ayrıca doğrulanmalıdır.

Örnek müşteri verilerini yerel ortamda yenilemek için önce veritabanı yedeği alın, ardından `npx tsx scripts/refresh-demo-patients.ts` çalıştırın. Araç yalnızca bilinen demo/test kayıtlarını temizler; beklenmeyen müşteri kaydında durur. Personel giriş bilgilerini ve takvim bağlantılarını korur.

## Konuşma sırası ve peş peşe mesajlar

### AI kalite değerlendirmesi

`npm run test:ai` yerel `.env` ve kayıtlı model ile sentetik Türkçe konuşma testlerini çalıştırır. Model API'sine gerçek, ücretli çağrı yapar; kullanım kayıtlarını veritabanına yazar, hasta veya takvim kaydı oluşturmaz. Veritabanı ve model erişimi gerekir. Klinik ayarını değiştirmeden Sonnet denemek için `EVAL_MODEL=claude-sonnet-4-5 npm run test:ai` kullanılabilir; model katalogda bulunmalıdır.

Sonuç `artifacts/clinical-evaluation.json` dosyasına yazılır. Bağımsız senaryolar arasında profil, hafıza ve belirsizlik sayacı sıfırlanır. Güvenlik servisi hatasından kaynaklanan genel devir, başarılı klinik devir testi sayılmaz. Raporun `primaryModelUsage` alanı yalnızca ana üretim çağrılarını kapsar; güvenlik/kaynak doğrulamalarının kullanımı ayrıca `ModelUsage` tablosunda tutulur. Başarısız ağ çağrıları için sağlayıcı faturası ayrıca kontrol edilmelidir. Bu testler takvim yazımı, WhatsApp teslimatı veya insan değerlendirmesinin yerine geçmez.

Tek JSON bloğunun ardından açıklama döndüren sağlayıcı yanıtları desteklenir; açıklama hastaya gönderilmez. Birden fazla yapılandırılmış sonuç, eksik alanlar ve yarım kalmış yanıtlar kabul edilmez. Güvenlik yanıtı biçim hatasında aynı zaman aşımı içinde yalnızca bir kez yeniden istenir; geçerli bir güvenlik reddi yeniden denenmez. Başarılı yeniden denemelerde iki çağrının tokenları birlikte kaydedilir. `contentSafety.failureStage` bütçe, doğrulayıcı ve kullanım kaydı hatalarını ayırır. Tarih/saat alanları model çıktısı sınırında doğrulanır.

Yeni randevu akışı DB'de `Conversation.bookingStage` ile tutulur: tanışma → ad-soyad/yaş/terapi geçmişindeki eksikler → terapist tercihi → uygun gün/saat → sunulan saatin seçimi → çalışan onayı. Önceden verilen bilgiler tekrar sorulmaz. Ücret veya tanıtım sorusu tek başına randevu başlatmaz. Sunulan saatler terapist kimliği ve sunum zamanı ile saklanır; eski saat seçenekleri 20 dakika sonra yeniden kontrol edilir. Kesinleştirme ayrıca ortak servis düzeyinde eksik profil kontrolüne tabidir.

Demo mesajları önce ayrı kayıtlar olarak DB'ye alınır. `inbound` Docker servisi son mesajdan sonra 3 saniyelik sessizlik bekler (normal biriktirme üst sınırı 12 saniye), ardından mesajları tek model girdisinde birleştirir. Bu süre kişinin yazmayı bitirdiğinin kesin tespiti değildir. Model çalışırken yeni mesaj gelirse eski sonuç yayımlanmadan güncellik kontrolü yapılır ve yeni grup işlenir. Kuyruk DB'de kaldığından yeniden başlatmada korunur; aynı sağlayıcı mesaj kimliği tekrar işlenmez. Çalışanın devraldığı konuşmalar otomatik yanıtlanmaz. İşçi `/api/jobs/inbound` uç noktasını `REMINDER_JOB_SECRET` ile çağırır. Gerçek WhatsApp webhook/teslimat adaptörü henüz bağlı değildir; bağlandığında doğrulanmış gelen mesajlar aynı kuyruğa iletilmelidir.

## Excel aktarımı ve saatli takvim

Yönetici, Müşteriler ekranından `.xlsx` yükleyip sayfa/başlık satırı ve alanları eşleştirir. Ad soyad (veya ayrı ad/soyad) ile telefon zorunludur; yaş ve uygunluk notu isteğe bağlıdır. Önizleme yazım yapmaz. Son onayda yalnızca yeni ve geçerli satırlar eklenir; aynı ad+telefon atlanır, tek başına ad/telefon eşleşmesi inceleme gerektirir. Mevcut kayıtlar güncellenmez. Aktarım anında kontrol tekrar yapılır; değişen veride yeni önizleme gerekir. Dosyalar kalıcı saklanmaz; yükleme 5 MB, açılmış içerik 20 MB, sayfa başına 2.000 müşteri ile sınırlıdır.

Takvim gün/hafta görünümünde saatli ızgara, bugün/önceki/sonraki gezinmesi ve randevu detay penceresi sunar. Boş saate tıklama oluşturma formunu açar; kaydetme mevcut Google müsaitlik kontrolünü kullanır. Google'daki eşleştirilmemiş etkinlikler özel içerikleri açılmadan gösterilir. Excel müşterileri otomatik terapist veya eski Google etkinliğiyle eşleştirilmez. Kliniğin gerçek Excel sütunları ve etkinlik düzeni görülmeden ad benzerliğinden bağlantı kurulmaz.

## Ortak arayüz kontrolleri

Eylem butonları `globals.css` içindeki ortak kontrol değişkenlerini kullanır: 48 px asgari yükseklik, 10 px köşe, 14 px/600 yazı, 8 px simge aralığı. `admin-primary-btn` / `toolbar-apply-btn` ana işlem ve filtre gönderimi; `admin-secondary-btn` alternatif işlem ve gezinme; `btn--danger` yıkıcı işlem içindir. İkon butonları 48 × 48 px'dir. Özel işlevli sohbet göndericisi, sekmeler ve takvim etkinlikleri kendi yerleşimini korur.

Yeni eylem simgelerinde `ControlIcon` (Phosphor, 20 px, regular), tarih ve tarih-saat alanlarında `DateInput` kullanın. Native tarih seçici ve klavye erişimi korunur; görünür takvim simgesi tek kaynaktan gelir. Ekran bazında yeni buton ölçüsü veya Unicode simgesi eklemeyin; gerekirse ortak standardı güncelleyin.

### Dağıtım güvenliği

`SESSION_SECRET` ve `REMINDER_JOB_SECRET` için ayrı ayrı `openssl rand -hex 32` ile değer üretip yerel `.env` dosyanıza yazın. Gerçek değerleri paylaşmayın veya repoya eklemeyin. Worker anahtarını uygulama ve worker servislerinde birlikte güncelleyin. Üretim başlangıcı eksik, kısa veya aynı anahtarları reddeder; job uçları geliştirmede de kısa anahtarları kabul etmez.

Docker başlangıcı artık otomatik seed çalıştırmaz. Seed mevcut verileri siler; yalnızca boş/atılabilir geliştirme veritabanında `ALLOW_DESTRUCTIVE_SEED=true npm run db:seed` ile çalıştırılabilir ve production modunda engellenir.

Bu Compose dosyası yerel geliştirme içindir. PostgreSQL portu yalnızca `127.0.0.1` üzerinde yayınlanır. Üretimde port yayınını kaldırın; ayrı migration ve kısıtlı uygulama rolleri kullanın. Mevcut veritabanı parolası/rolü bu dosyanın değiştirilmesiyle dönüşmez. Kaynak değişiklikleri çalışan konteynerlere yeniden dağıtılana kadar etkili olmaz.

### İptal teslimat kuyruğu

`20261005190000_cancellation_delivery` migration'ı uygulama sürümünden önce uygulanmalıdır. Yönetici onayı, randevunun yerel iptali ve `CancellationDelivery` kaydı aynı transaction içindedir. Google çağrısı commit sonrasında yapılır. Hatalı işlemler mevcut inbound worker üzerinden bekleme süresi en fazla bir saate çıkacak şekilde artan aralıklarla tekrar denenir. İşlem kaydı yalnızca takvim ve bildirim adımları tamamlanınca kapanır. `lastError` sağlayıcı cevabını veya hasta verisini içermez.

Kuyrukta “Takvim bekliyor” / “Bildirim bekliyor” durumları görünür. Takvim bağlantı hatalarını giderdikten sonra worker otomatik devam eder; talebi yeniden onaylamayın. Eski worker'ın 120 saniyelik kilidi süreç çökmesinden sonra geri alınabilir. Google DELETE 410 önceki silmenin tamamlandığını ifade eder; 401/403/404 başarı kabul edilmez.

Bildirim adaptörüne işlem kimliğinden türetilen sabit bir `idempotencyKey` verilir. Mevcut MemoryWhatsApp aynı süreçte tekrarları engeller; gerçek WhatsApp sağlayıcısı bağlanırken süreçler arası teslimat/tekrar güvenliği ayrıca doğrulanmalıdır. Bu mekanizma gerçek WhatsApp teslimatı veya tüm dış servisler için tam olarak bir kez gönderim garantisi değildir. Yeni randevu ve saat değiştirme işlemleri bu iptal kuyruğunun kapsamında değildir.

### 5 Ekim 2026 bağımlılık yamaları

Next.js ve eslint-config-next 16.3.8 sürümüne sabitlendi; sharp 0.35.5'e yükseldi. Prisma ana sürümünü değiştirmeden `@prisma/config` altındaki `deepmerge-ts` için 8.0.0 override uygulandı (GHSA-ggr8-5vv4-36mx). Bu üst ana sürümün Map birleştirme davranışı değişir; mevcut Prisma yapılandırma yükleyicisi, schema doğrulaması, client üretimi ve DB testleri doğrulandı. Prisma bu bağımlılığı kendisi yamaladığında override tekrar değerlendirilmelidir.

Tarama kanıtları `artifacts/dependency-remediation-2026-10-05/` altında bulunur. Üretim bağımlılık taraması sıfır bulgu verdi; tam taramada braces zincirinde 5 high ve Vitest zincirinde 2 moderate paket düğümü kalıyor. Bunlar yedi bağımsız açık anlamına gelmez. Mevcut Dockerfile geliştirme bağımlılıklarını da runner'a kopyaladığı için yalnızca `--omit=dev` sonucu Docker imajının temiz olduğunu kanıtlamaz. Docker bağımlılık ayrımı ve Vitest ana sürüm yükseltmesi ayrı takip edilmelidir. Mevcut çalışan konteynerler bu yamalarla yeniden dağıtılmadı.

### Üretim imajı ve migration ayrımı

Web/worker imajı (`runner`) yalnızca Next.js standalone çıktısı, statik dosyalar ve worker betiklerini taşır; tüm `node_modules`, kaynak kod ve seed dosyası kopyalanmaz. Build sırasında Vitest, ESLint, Prisma CLI, TypeScript ve braces paketlerinin runner'a sızmadığı kontrol edilir.

`docker compose up --build` önce DB sağlık kontrolünü, sonra tek seferlik `migrate` servisini bekler. Migration başarısızsa app başlamaz. Worker'lar app sağlıklı olduktan sonra başlar ve DB kimlik bilgisi taşımaz. Compose, `santa_app` ve `santa_migrate` hesaplarını ayrı şifrelerle kullanır; `MIGRATION_DATABASE_URL` yalnızca yerel CLI komutları içindir. Migration servisi Prisma CLI içeren ayrı `migrator` build hedefini kullanır. Doğrudan runner imajını çalıştıran dağıtımlar migration'ı önceden ayrıca çalıştırmalıdır; web başlangıcı migration yapmaz.

Vitest 4.1.11, Vite 7.3.6 ile sabitlendi. CI artık DB testlerini atlamamak için ayrı `santa_test` veritabanı oluşturur ve production build çalıştırır. Yeni kontrollerin kanıtları `artifacts/runtime-isolation-2026-10-05/` altındadır. Önceki bölümde belirtilen geliştirme paketlerinin web imajına kopyalanması bu değişiklikle kaldırılmıştır; değişiklikler çalışan uygulamaya otomatik dağıtılmaz.

### Veritabanı hesapları ve mevcut veriye geçiş

Başlangıç sırası `db → db-provision → migrate → app → workers` şeklindedir. `db-provision` yalnızca özel uygulama veritabanında çalıştırılmalıdır. Kurulum hesabı `santa` yönetim için kalır; web uygulamasına verilmez. `santa_migrate` şema/nesne sahibidir ama superuser, CREATEDB, CREATEROLE veya BYPASSRLS değildir. `santa_app` yalnızca uygulama tablolarında SELECT/INSERT/UPDATE/DELETE, sequence üzerinde USAGE/SELECT ve schema üzerinde USAGE alır; migration geçmişine erişemez. Yeni migration tabloları için varsayılan izinler tanımlıdır; deploy sonunda migration geçmişinin izinleri tekrar kapatılır.

Yerel `.env` dosyasında birbirinden farklı `POSTGRES_ADMIN_PASSWORD`, `APP_DATABASE_PASSWORD`, `MIGRATION_DATABASE_PASSWORD` değerlerini tanımlayın. Yeni uygulama ve migration parolalarını ayrı `openssl rand -hex 32` çağrılarıyla oluşturun; iki değer de 64 hex karakter olmalıdır. Yeni PostgreSQL kurulumu için yönetim parolasını da rastgele üretin. Mevcut `pgdata` kullanılıyorsa yönetim parolası veritabanında zaten kayıtlı parola olmalıdır; `.env` değiştirmek mevcut PostgreSQL parolasını değiştirmez.

Mevcut ortamı dönüştürmeden önce yedek alın ve bakım aralığında web/worker servislerini durdurun. `docker compose run --rm db-provision` hesapları hazırlayıp bu DB'nin public şemasındaki mevcut uygulama tabloları, sequence'ler, enum'lar ve fonksiyonların sahipliğini migration hesabına aktarır; veri silmez. Kurulum ardından `docker compose run --rm migrate` ve `docker compose up -d --build app inbound reminders` sırasını kullanın. Sahiplik aktarımı yalnızca kurulum hesabının sahip olduğu nesneleri kapsar; paylaşılan veritabanına/başka uygulamaların public nesnelerine uygulanmamalıdır. Daha önce yüksek yetki veya rol üyeliği verilmiş santa_app/santa_migrate hesapları otomatik dönüştürülmez; kurulum durur.

Üretim başlangıcı yüksek yetkili uygulama hesabını reddeder. Yerel Prisma komutları için `DATABASE_URL` uygulama hesabını, migration komutları için ayrı `MIGRATION_DATABASE_URL` migration hesabını göstermelidir. `prisma migrate dev` shadow DB gerektirebilir; üretim migration hesabına CREATEDB vermeyin, ayrı geliştirme veritabanı kullanın.

Bu değişikliğin doğrulaması `artifacts/database-roles-2026-10-06/results.json` ve `tests.log` dosyalarındadır. Test aracı `verify.mjs`, ayrı geçici PostgreSQL konteynerinde yeni/eski şema akışını ve kısıtlı hesap testlerini çalıştırır; test kaynaklarını temizler. Mevcut uygulama veritabanı, gerçek parolalar ve çalışan servisler bu geliştirme sırasında değiştirilmedi. TLS, yönetim parolası rotasyonu ve yedekten geri yükleme doğrulaması ayrı dağıtım işleridir.

### PostgreSQL TLS ve geri yükleme provası

Compose artık PostgreSQL TCP bağlantılarında TLS 1.2 veya üstünü zorunlu tutar; şifresiz bağlantılar reddedilir. Prisma bağlantıları `sslmode=require&sslaccept=strict&sslcert=/certs/ca.crt`, PostgreSQL araçları `PGSSLMODE=verify-full` kullanır. Böylece hem CA hem sunucu adı doğrulanır. Parametre ayrıntıları: [Prisma TLS](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql#configuring-an-ssl-connection), [PostgreSQL TLS](https://www.postgresql.org/docs/16/libpq-ssl.html). Bu değişiklik veritabanı bağlantısını kapsar; tarayıcı–web uygulaması HTTPS kurulumu ayrı dağıtım işidir.

Yeni yerel kurulumdan önce:

```sh
sh scripts/db/tls/generate-local.sh
mkdir -p backups
chmod 700 backups
```

Araç `.local/db-tls` içinde yerel CA ve `db`, `localhost`, `127.0.0.1` için 90 günlük sunucu sertifikası üretir; mevcut dizini/anahtarları ezmez. CA anahtarı hiçbir konteynere bağlanmaz. Gerçek dağıtımda kurum tarafından yönetilen CA/sertifikaları kullanın; `DB_TLS_DIR` altında `server.crt`, `server.key`, `ca.crt` bulunsun ve sunucu DNS adı sertifikanın SAN alanıyla eşleşsin. Sertifika yenilemesini süre dolmadan yapıp DB'yi yeniden başlatın; CA değişirse istemcileri de güncelleyin. Anahtarlar, `.local/` ve `backups/` hem Git hem Docker build kapsamı dışındadır. Yerel Prisma CLI için `.env.example` içindeki CA yolu schema dizinine göredir.

Mevcut çalışan ortamda önce eski yapılandırmayla yedek alın; bakım aralığında TLS sertifikaları ve yeni Compose yapılandırmasıyla `db` servisini yeniden oluşturun. Ardından önceki bölümdeki hesap/migration/app geçişini uygulayın. Mevcut veri birimine `down -v` uygulamayın. Bu kaynak değişikliği çalışan konteynerleri kendiliğinden dönüştürmez.

TLS ve hesap ayrımı uygulanmış ortamda, her yedek için benzersiz dizin ve her prova için yeni DB adı kullanın:

```sh
docker compose run --rm --no-deps backup /backups/manual-20261006-01
docker compose run --rm --no-deps restore-test /backups/manual-20261006-01 restore_check_20261006_01
```

Yedek custom-format `pg_dump` çıktısıdır. Dizin izinleri 700'dür; başarısız yedekte tamamlanma dosyası `SHA256SUMS` oluşmaz. SHA-256 yanlışlıkla bozulmayı yakalar; kötü niyetli değiştirmeye karşı imza değildir. Dosyalar hasta verisi içerir ve bu betik tarafından disk üzerinde şifrelenmez; erişimi sınırlı, disk şifrelemeli depolama kullanın. Makine dışı şifreli kopya, saklama süresi ve zamanlanmış yedekleme ayrıca kurulmalıdır.

Geri yükleme önce checksum ve mevcut hesap parolalarını doğrular; yalnızca yeni `restore_...` veritabanı oluşturur. Aynı PostgreSQL sunucusundaki roller ortak olduğundan mevcut hesap bilgileriyle çalışır; uygulama/migration parolası farklıysa hiçbir rolü değiştirmeden durur. Var olan hedefi silmez veya üzerine yazmaz. Restore `--single-transaction --exit-on-error --no-owner --no-acl` ile migration hesabında yapılır, uygulama izinleri tekrar uygulanır. Hata sonrasında oluşturulmuş boş DB inceleme için kalabilir. Başka sunucuya felaket kurtarmada önce yönetim hesabını ve uygulama/migration rollerini ayrıca kurun. Veri şifreleme anahtarları, OAuth sırları, sertifikalar ve uygulama sürümü DB yedeğinin içinde değildir; bunlar için ayrı güvenli kurtarma kaydı gerekir.

Doğrulama: `node artifacts/database-tls-restore-2026-10-06/verify.mjs`. Araç `santa-db-runner:20261006` ve `santa-db-migrator:20261006` imajlarını bekler (`docker build --target runner -t santa-db-runner:20261006 .` ve aynı komutun `migrator` karşılığı). Ayrı geçici konteynerlerde yanlış CA/hostname, şifresiz bağlantı, gerçek schema restore, örnek hasta verisi özeti, migration geçmişi, yetki sınırları ve uygulama başlangıcını sınar. Ardından tam test takımını TLS ile geri yüklenmiş DB'de çalıştırır. Sonuçlar `artifacts/database-tls-restore-2026-10-06/` altındadır. Mevcut kullanıcı veritabanının yedeği veya canlı geri yükleme provası bu çalışma kapsamında yapılmadı.

### 6 Ekim 2026: geliştirme ortamına uygulanan geçiş

Önceki bölümlerdeki “çalışan servislere uygulanmadı” ifadeleri tarihsel aşamaları anlatır. Bu tarihte gerçek geliştirme veritabanı korunarak kaynak değişiklikleri çalışan servislere uygulanmıştır:

- Geçiş öncesi şifreli yedek alındı; 23 tablo ve 862 kayıt ayrı PostgreSQL'de geri yüklenerek tüm satırların içerik özetleriyle karşılaştırıldı. Migration sonrasında mevcut 22 uygulama tablosunun içerikleri değişmedi.
- PostgreSQL TLS, ayrı uygulama/migration hesapları, yönetici parola rotasyonu ve bağımsız güçlü oturum/worker anahtarları etkindir. Kayıtlı veriyi çözmek için kullanılan `DATA_ENCRYPTION_KEY` değiştirilmedi.
- App ve iki worker aynı doğrulanmış standalone imajı kullanır. Eski worker anahtarı reddedilir; proxy `/api/jobs/*` yollarını dış istemcilere açmaz.
- Yerel HTTPS'in sertifika kontrolü Chrome'da atlanmadan geçti. Google'ın önceden kayıtlı `http://localhost:3000/api/auth/google/callback` ve `/api/calendar/google/callback` adresleri `GOOGLE_LOCAL_OAUTH_ORIGIN` sayesinde korunur; sadece loopback'teki proxy isteği HTTPS'e aktarır, state/session çerezleri HTTPS'te okunur. Kamuya açık origin'de bu seçenek reddedilir. Hosting'e geçerken alan adı için HTTPS callback'lerini Google Console'a kaydedip bu yerel değişkeni boşaltın. Bu çalışma gerçek Google hesabıyla yeni OAuth izni veya takvim yazma testi değildir.
- Son doğrulama: 50 test dosyasında 222 test; lint, typecheck ve production build başarılı. Kanıtlar `artifacts/deployment-2026-10-06/` ile `artifacts/database-tls-restore-2026-10-06/` altındadır.

### Şifreli yedek ve günlük otomatik prova

Restic deposu `.local/backups/repository`, parola dosyası `.local/backups/password` konumundadır; Git/Docker build kapsamı dışındadır. Parola yedek deposuna dahil edilmez. Her yedek PostgreSQL custom-format dökümünü, `.env` yapılandırmasını ve DB/yerel HTTPS anahtarlarını **şifreli** saklar. Döküm ve kurtarma yapılandırmasının geçici kopyası konteyner tmpfs'inde hazırlanır; rutin işlem host diskte açık döküm bırakmaz. Mevcut yedekler otomatik silinmez.

```sh
node scripts/ops/maintenance.mjs
```

Komut yedek aldıktan sonra `restic check --read-data` çalıştırır; şifreli depodaki son DB yedeğini ağ bağlantısı olmayan, geçici PostgreSQL'e açıp checksum, tam restore ve migration geçmişini doğrular. Kalıcı uygulama DB'sine restore yapmaz. DB sertifikasının bitmesine 14 günden az kaldığında bildirim için işaret üretir. Son durum `.local/backups/status.json`, özel log `.local/backups/last-run.log` dosyasındadır. Hata/çakışmada işlem durur; kalmış `maintenance.lock` dizinini ancak çalışan yedek olmadığını kontrol ettikten sonra kaldırın.

Codex'te **“Geliştirme veritabanı yedeği ve geri yükleme kontrolü”** adlı günlük görev saat **12.00** için aktiftir. Normal başarılı kontroller sessizdir; hata veya sertifika yenileme ihtiyacı bildirilir. Yerel bilgisayar, Codex ve Docker çalışabilir durumda olmalıdır; bu kurulum bilgisayar kapalıyken çalışan uzak bir yedek hizmeti değildir. Makine dışı yedek kullanıcı kararıyla ertelenmiştir; mevcut kopyalar bu bilgisayarın kaybına karşı ayrı koruma sağlamaz.

Gerektiğinde son DB yedeğini açık döküm olarak **yeni** bir `backups/snapshot` dizinine çıkarıp farklı isimli test DB'sine geri yükleme:

```sh
# backups/snapshot daha önce yoksa çalıştırın.
mkdir -p backups
chmod 700 backups
docker run --rm \
  -v "$PWD/.local/backups/repository:/repository:ro" \
  -v "$PWD/.local/backups/password:/password:ro" \
  -v "$PWD/backups:/restore" \
  -e RESTIC_REPOSITORY=/repository -e RESTIC_PASSWORD_FILE=/password \
  restic/restic:0.18.1 --no-cache --no-lock restore latest --tag database \
  --target /restore --include /snapshot/database.dump --include /snapshot/SHA256SUMS
docker compose run --rm --no-deps restore-test /backups/snapshot restore_manual_check
```

Bu son komutlar bilinçli olarak host diske açık bir kurtarma kopyası çıkarır; normal günlük bakım bunu yapmaz. Gerçek geçiş/rollback sırasında önce web ve worker'ları durdurun, yeni isimli DB'de veriyi/yetkileri doğrulayın ve ancak sonra bağlantıyı değiştirin. `pgdata` birimini silmeyin. Geçiş öncesi şifreli snapshot `pre-upgrade` etiketiyle korunur.

<a id="deployment-oncesi-kontrol-listesi"></a>

## Deployment öncesi kontrol listesi

**Kayıt tarihi: 6 Ekim 2026.** Kullanıcının kararı: proje şu anda geliştirme ortamıdır; barındırma/alan adı ve makine dışı yedek hedefi deployment aşamasında seçilecek. O aşamada bu liste üzerinden kurulum adım adım anlatılıp uygulanacak. Bu kayıt yeni bir dağıtım başlatmaz veya tarih planlamaz.

### İlk internet demosu için seçilen yön

**6 Ekim 2026 kullanıcı kararı:** İlk paylaşılabilir internet demosunda **Render Free (web/API) + Neon Free (PostgreSQL)** hedeflenecek. Railway önceki öneriydi; ilk demo için seçilen platform değildir. Henüz hesap, kaynak veya dağıtım oluşturulmadı.

- [ ] Mevcut Next.js/Docker uygulamasının Render Free kaynak sınırlarına ve Neon bağlantı/rol/TLS yapılandırmasına uyumu ayrı test ortamında doğrulansın.
- [ ] Deployment gününde iki sağlayıcının ücretsiz kotaları, kullanım koşulları, uyku davranışı ve kota aşımı sonuçları yeniden kontrol edilsin. Ücretsizliğin süresiz veya sınırsız olduğu varsayılmasın.
- [ ] Sürekli DB sorgulayan inbound worker ve zamanlı hatırlatmalar için ücretsiz plana uygun tetikleme tasarımı belirlensin. Uyuyan web servisi, geciken tetikleme ve başarısız işlerin yeniden denenmesi sınansın. Mevcut worker'ların olduğu gibi ücretsiz ve kesintisiz çalışacağı kabul edilmesin.
- [ ] Demo için sentetik veri kullanılsın; üretim verisinin taşınması ve gerçek sağlayıcı teslimatı ayrı kabul aşaması olsun.
- [ ] Klinik kullanımına geçerken ölçülen ihtiyaçlara göre yalnızca gereken servisler ücretliye taşınsın. Üretim sağlayıcısı ve bütçesi bu demo kararıyla kesinleşmiş sayılmasın.

Model API'si ve diğer dış hizmetlerin maliyetleri hosting kotasından ayrıdır. Alan adı ve makine dışı yedek seçimi henüz açık; yayın öncesi kapılar aşağıdaki listede geçerliliğini korur. Bu karar mevcut yerel kurulumu veya günlük yerel yedek görevini değiştirmez.

### Mevcut doğrulanmış temel

- [x] Yerel HTTPS, PostgreSQL TLS ve sertifika doğrulaması.
- [x] Kısıtlı uygulama hesabı, ayrı migration hesabı, yönetici/worker parolalarının yenilenmesi.
- [x] Standalone runtime, geliştirme paketlerinin web imajından çıkarılması, uygulama ve worker imajlarının eşleşmesi.
- [x] Gerçek geliştirme verisinin şifreli yedeği ve izole geri yükleme provası; yerel günlük Codex görevi.
- [x] Son çalıştırmada 222 test, lint, typecheck, build ve Chrome HTTPS kontrolü başarılı.

Kanıt: `artifacts/deployment-2026-10-06/`. Bu sonuçların tarihi sabittir; deployment gününde güncel kod/imaj ve hedef altyapıda tekrar doğrulanacak.

### 1. Hosting, alan adı ve üretim yapılandırması — yayın öncesi zorunlu

- [ ] Hosting, PostgreSQL hizmeti, veri bölgesi, bütçe ve işletim sorumlusu seçilsin. Mevcut Compose yerel kurulumdur; olduğu gibi internete açılmasın.
- [ ] Alan adı/DNS ve herkesçe güvenilen HTTPS sertifikası kurulsun; yenilemesi doğrulansın. Yerel localhost CA'sı üretimde kullanılmasın. HTTPS yönlendirmesi ve HSTS, gerçek alan adındaki akışlar doğrulandıktan sonra yapılandırılsın.
- [ ] `APP_URL` üretim HTTPS origin'i olsun; `ALLOW_LOCAL_SETUP_SKIP=false`, `GOOGLE_LOCAL_OAUTH_ORIGIN` boş olsun. Google Console'da yeni `/api/auth/google/callback` ve `/api/calendar/google/callback` adresleri kaydedilsin.
- [ ] DB internete port yayınlamasın; uygulama/proxy/worker/DB ağ erişimleri sınırlandırılsın. `/api/jobs/*` dış erişime kapalı kalsın. Proxy başlıkları ve istek boyutu/zaman aşımı sınırları hedef ortamda test edilsin.
- [ ] Üretim secret'ları geliştirmeden ayrı oluşturulup platformun secret yönetimine taşınsın. Admin DB parolası web/worker'a verilmesin; migration hesabı yalnızca migration işinde kullanılsın.
- [ ] `DATA_ENCRYPTION_KEY` ve yedek parolasının ayrı güvenli kurtarma kopyası tutulsun. Var olan şifreli veri taşınacaksa anahtar körlemesine değiştirilmesin; veri/anahtar taşıma planı birlikte doğrulansın.
- [ ] Üretim DB sertifikası/CA/hostname kontrolü ve yenileme yöntemi tanımlansın. Yerel 90 günlük DB sertifikası kalıcı üretim çözümü sayılmasın.
- [ ] Kod sürümü Git commit/tag ile sabitlensin; imajlar değişmez digest ile kaydedilsin. Secret veya hasta verisi repoya/build context'e girmeden güvenilir kaynaktan yeniden build edilebilsin.

### 2. Makine dışı yedek, kurtarma ve izleme — şu an ertelendi, yayın öncesi zorunlu

- [ ] S3/R2/B2/SFTP veya uygun başka bir uzak hedef seçilsin; erişim bilgileri güvenli kanaldan tanımlansın. Gerçek verinin şifreli kopyası ayrı hata alanında saklansın.
- [ ] Yedek zamanlaması laptop/Codex'e bağımlı olmaktan çıkarılıp sunucu/platform tarafına taşınsın. Yerel görev ile üretim görevi yanlış DB'yi hedeflemesin; eski görev gerekiyorsa güncellensin.
- [ ] Kabul edilebilir veri kaybı süresi ve hizmete dönüş süresi (RPO/RTO) belirlensin. Yedek sıklığı, saklama süresi ve **eski yedeklerin silinme politikası ayrıca kararlaştırılsın**. Mevcut otomasyon yedek silmez.
- [ ] Uzak depodan alınan gerçek yedek ayrı ortamda geri yüklensin; satır/veri bütünlüğü, migration geçmişi, hesap izinleri ve uygulama başlangıcı doğrulansın. DB yanında gerekli secret'ların ve uygulama sürümünün kurtarılabildiği de kanıtlansın.
- [ ] Başarısız/gecikmiş yedek, sertifika süresi, disk kullanımı, uygulama/DB sağlığı, kuyruk gecikmesi ve dış sağlayıcı hataları için alarmlar ve sorumlu kişi belirlensin. Alarmın gerçekten ulaştığı sınansın.
- [ ] Loglardan secret, OAuth tokenı ve gereksiz hasta verisi çıkarılsın; log ve veri saklama/silme prosedürü klinikle kararlaştırılsın.

### 3. Gerçek ürün akışları — kullanıcıya açmadan önce zorunlu

- [ ] **WhatsApp:** MemoryWhatsApp yerine gerçek adaptör; Meta erişimi, imzalı webhook, tekrar güvenliği, delivery status, retry ve gerekli mesaj şablonları tamamlanıp sandbox numarasıyla doğrulansın. Bellek içi başarı gerçek teslimat sayılmasın.
- [ ] **E-posta:** Sağlayıcı ve gönderici alan adı doğrulansın; hesap doğrulama/şifre kurtarma gerçekten teslim edilsin. Üretimde kurulum atlama kullanılmasın.
- [ ] **Google:** Her terapistin gerçek hesabıyla OAuth, refresh, yetki iptali, müsaitlik ve etkinlik oluşturma/değiştirme/silme test edilsin. Yerel callback uyumluluk testi bu kapsamı karşılamaz.
- [ ] Teyit, hatırlatma, insan devralması, onaylı iptal ve yeniden planlama gerçek sağlayıcılarla uçtan uca sınansın. Kesinti/yeniden başlatma/tekrar gönderimde çift işlem ve kayıp mesaj olmadığı kontrol edilsin.
- [ ] Kalıcı teslimat kuyruğunun mevcut kapsamı iptaldir. Yeni randevu, saat değiştirme ve gerçek WhatsApp teslimatı için kısmi hata ve uzlaştırma davranışı ayrıca kapatılsın.
- [ ] Klinik içerikleri, acil yönlendirme metni, hizmetler/terapistler ve fiyatlar yetkili kişi tarafından onaylansın. Model/sağlayıcı tarifeleri ve maliyet limitleri gerçek kullanımda doğrulansın.

### 4. Audit'ten kalan yayın kapıları — kapandı varsayılmayacak

Kaynak: `artifacts/audit-2026-10-05/report.html`. Önceki güvenlik iyileştirmeleri raporun tamamının kapandığı anlamına gelmez. Aşağıdaki maddeler için güncel düzeltme ve tekrar-test kanıtı olmadan tamamlandı işareti konulmasın:

- [x] **F06 — teknik kontrol:** THERAPY_INFO dahil model yanıtları ve eski FAQ önbelleği gönderimden önce ayrı içerik kontrolünden geçer. Kontrol reddi/hatası/eksik yanıtı/bütçe engeli aday cevabı ve işlemi durdurup insan devrine gider. Kaynak doğrulaması ayrı yapılır; kontrol açıklamaları artık yapılmayan klinik kontrolü yapılmış gibi göstermez.
- [ ] **F06 — model/klinik kabul:** Gerçek sağlayıcı 6 Ekim testinde HTTP 403 verdi; sınıflandırma başarısı doğrulanamadı. Erişim düzeltildikten sonra sentetik olumsuz/olumlu, negasyon, alıntı, injection ve çok turlu örnekler gerçek modelle tekrar çalıştırılıp klinik uzmanla değerlendirilmelidir. Teknik kontrol klinik güvenlik garantisi değildir. Kanıt ve tekrar çalıştırma: `artifacts/ai-response-safety-2026-10-06/`.
- [ ] **F07:** Auth/reset yollarındaki senkron pahalı hash, geçersiz token sırası, güvenilen proxy üzerinden IP/global limitler, eşzamanlılık ve süresi dolan limit kayıtlarının temizliği; kontrollü yük testi.
- [ ] **F08:** Simülatör gövde/mesaj/geçmiş sınırları, bozuk JSON/senaryo için doğru hata cevabı ve kullanılmayan register route davranışı.
- [ ] Audit'teki kontrast, ARIA/tablist ve mobil erişilebilirlik bulguları ilgili ekranlarda tekrar test edilsin.
- [ ] Prompt injection/negasyon/alıntı/çok turlu örnekler, rol/terapist erişim sınırları ve maliyet kötüye kullanımı güncel kodda yeniden test edilsin. Model confidence değeri işlem yetkisi sayılmasın; aynı gün iptali dahil insan onayı korunsun.
- [ ] Onay/aydınlatma, verinin modele gönderilme kapsamı, minimizasyon, saklama/silme ve sağlayıcı işleme koşulları klinik ve ilgili uzmanlarla kararlaştırılsın; bir DB alanının bulunması yeterli uygulama kanıtı sayılmasın.
- [ ] Deployment gününde bağımlılık ve imaj taraması yenilensin. Önceki tam taramada geliştirme bağımlılıklarındaki braces zincirinde 5 high paket düğümü kalmıştı; bunların güncel durumu ve build/migration imajlarına etkisi ayrı değerlendirilsin. Runtime taraması tüm araç zincirinin güvenli olduğunu tek başına kanıtlamaz.

### 5. Birlikte izleyeceğimiz dağıtım sırası

1. Yukarıdaki kararları ve açık ürün/güvenlik kapılarını netleştir; kullanıcıya yapılacak kurulum ve maliyeti açıkla.
2. Secret ve gerçek hasta verisi içermeyen sabit sürümü build et; test, güncel tarama ve üretime benzer staging kontrollerini tamamla.
3. Üretim ağını, DB rollerini/TLS'i, domain/HTTPS'i, sağlayıcı ayarlarını, uzak yedeklemeyi ve alarmları kur.
4. Geçiş yedeğini al, ayrı ortamda geri yükleyerek doğrula; eski imajı, yapılandırmayı ve dönüş planını hazır tut.
5. Gerekli bakım aralığında yazımları/worker'ları durdur; tek migration işi çalıştır; veri ve yetki kontrollerini yap. Seed çalıştırma, mevcut volume'ü silme.
6. Uygulamayı başlat; sağlık, giriş/MFA, yetkiler, HTTPS ve callback'leri kontrol et; ardından worker'ları ve kontrollü uçtan uca sağlayıcı testlerini etkinleştir.
7. Kabul ölçütleri sağlanınca trafiği aç. Sağlanmıyorsa yazımları durdurup kanıtları incele; schema uyumluluğu doğrulanmadan eski kodu veya DB yedeğini körlemesine devreye alma.
8. İlk gün ve sonraki kontrol aralığında hata/teslimat/maliyet/backup durumunu gözle; gerçek uzak yedek ve alarm kanıtlarını bu listeye ekle.

**Kabul kuralı:** Her kapatılan madde için ortam, tarih ve kanıt kaydedilecek. Geliştirmede geçen bir kontrol üretimde yeniden yapılması gereken maddeyi otomatik kapatmaz.

## Model kullanmadan çalışan işlemler ve geçiş kontrolleri

Kalite önceliği Sonnet ile korunur. Hatırlatma, onay/iptal sonucu ve sunulan saat numarasının seçimi model çağrısı gerektirmez. Serbest mesajlar yorum gerektirdiğinde modele gider. 24 saatlik hatırlatma penceresi işçi tarafından varsayılan 15 dakikada bir kontrol edilir; yeni oluşturulan yakın randevular bir sonraki çalışmada ele alınır.

Hatırlatma işçisi randevu kilidini onay/iptal servisiyle paylaşır; aday listeyi aldıktan sonra güncel saat, durum ve önceki gönderimi tekrar okur. İptal edilmiş/geçmiş randevu atlanır. Saat değişikliğinde yeni saat için ayrı idempotency anahtarı kullanılır. Başarısız alıcı diğerlerini engellemez ve sonraki çalışmada yeniden denenir. Gerçek WhatsApp adaptörü halen bağlı değildir; süreçler MemoryWhatsApp ile test edilmiştir. Gerçek sağlayıcı entegrasyonunda gönderim sonrası bağlantı/DB kesintilerindeki teslimat belirsizliği ve sağlayıcı idempotency desteği ayrıca doğrulanmalıdır.

DB testleri; eşzamanlı hatırlatma işçileri, gönderim öncesi iptal, yeniden planlama, gönderim hatası, eksik profilin onayı engellemesi, stajyer yetkisi, eşzamanlı onay/ret, iptal teslimatı tekrarları ve çalışan devri yollarını kapsar. Yeni randevu reddedilince konuşma mevcut profiline göre bilgi toplama/tercih/müsaitlik aşamasına döner ve eski saat seçenekleri silinir. Son gelecek randevu iptal edildiğinde konuşma GREETING aşamasına döner. Onaylanan randevu CONFIRMED aşamasına geçer.

### AI yanıt kontrolünün çalışma biçimi

`content-safety-v1`, son 12 konuşma mesajını ve aday cevabı ayrı bir model çağrısıyla değerlendirir. Kişiye özel tanı/tedavi/ilaç talimatları, uygunsuz kriz yanıtları, sonuç garantileri ve veri ifşası reddedilir. Genel psikoeğitim tek başına kurum kaynağı gerektirmez; kurum/hizmet veya klinik sonuç iddiaları ayrıca onaylı kaynaklara karşı doğrulanır. Eylem veya insan devri etiketi kontrolü atlatmaz. FAQ önbelleği her kullanımda tekrar kontrol edilir.

Bu kontrol ek gecikme ve model maliyeti getirir; kullanım bütçesine dahildir. Aynı sağlayıcının ayrı model çağrısıdır ve hata yapabilir. Sağlayıcı erişimi veya doğrulama başarısız olduğunda serbest aday yanıt yerine sabit bir insan devri mesajı kaydedilir. Gerçek WhatsApp teslimatı ayrıca adaptör kabulüne bağlıdır.

### Adımlı ilk kurulum (7 Ekim 2026)

`/onboarding` tek görev gösteren beş adımdan oluşur: e-posta doğrulama, telefon, kullanıcı adı/ilk şifre değişikliği ve mevcut MFA kurulumu, Google Calendar, role göre uygulama tanıtımı. Tamamlanan hesap alanları veritabanında saklanır. Sunucu, e-posta doğrulanmadan telefon/şifre kaydını ve eksik hesap/MFA/telefonla tamamlamayı engeller. Terapist takvimi zorunludur; yönetici kişisel takvimsiz ilerleyebilir, stajyer için bağlantı gerekmez. Telefon iletişim bilgisidir; SMS doğrulaması veya telefonla hesap kurtarma uygulanmaz.

Yeni kurulumdaki şifre türetimi asenkron ve süreç başına iki eşzamanlı işle sınırlıdır. Bu, mevcut login/reset/MFA yollarının F07 incelemesinin tamamlandığı anlamına gelmez. Önceden tamamlanmış hesaplar telefon alanı eklendi diye topluca sıfırlanmaz. Yerel önizlemeyi erteleme yalnızca mevcut açık yerel ayarla çalışır; doğrulandı/tamamlandı alanlarını değiştirmez.

Alan adı alınana kadar Resend test göndereni `Santa <onboarding@resend.dev>` kullanılır. Kullanıcı Resend hesabını oluşturup yalnızca gönderim yetkili API anahtarını git dışında kalan `.env` dosyasındaki `RESEND_API_KEY` alanına eklemelidir; anahtar sohbetlere/loglara yazılmamalıdır. E-posta adımında **Resend hesabına kayıtlı adres** kullanılmalıdır. Anahtar/gönderici değişikliğinden sonra Docker app ortamı yeniden oluşturulmalıdır. Bu mod yalnızca hesap sahibinin adresine gerçek test teslimatına izin verir. Mail bağlantıları şu an `https://localhost` içerir; aynı bilgisayarda açılmalıdır. Domain doğrulanınca `AUTH_MAIL_FROM`, yayın sırasında `APP_URL` değiştirilir; adapter yeniden yazılmaz.

7 Ekim’de API anahtarı yerel yapılandırmaya eklendi ve gerçek bağlantı testi Resend tarafından HTTP 200 ile kabul edildi. Gönderim anahtarının teslimat durumunu okuma yetkisi yok; gelen kutusuna ulaşma kullanıcı tarafından doğrulanmalıdır. Gerçek kullanıcı hesabında doğrulama/şifre kurtarma uçtan uca kabulü ayrıca tamamlanmalıdır. Üretimde diğer alıcılara gönderim için alan adı doğrulaması yine gerekir. Test kanıtları: `artifacts/onboarding-2026-10-07/`.

Yerel admin istisnası: `ALLOW_LOCAL_SETUP_SKIP=true` ve `APP_URL` loopback olduğunda, oturumdaki ADMIN hesabının kendi e-postası `admin@santa.local` ise kurulum formuna aynı adres yazılarak yalnızca e-posta adımı ertelenebilir. İşlem audit kaydı bırakır; mail göndermez, `emailVerifiedAt` alanını değiştirmez. Telefon, şifre, MFA ve kalan kurulum kapıları korunur. İstisna hesap yeniden girişinde yerelde sürer; alan adı değiştiğinde, yerel izin kapandığında veya hesap e-postası değiştiğinde geçersiz olur. Şifre kurtarma için gerçek doğrulanmış e-posta gereksinimi değişmez.

Hesap güvenliği adımı da yerel geliştirmede `Şimdilik ertele ve devam et` ile ertelenebilir. Bu ayrı tercih audit kaydında saklanır; mevcut şifre, `mustChangePassword`, `mfaEnabledAt` ve MFA giriş kontrolü değiştirilmez. E-posta/telefon, role bağlı takvim ve tur koşulları devam eder. Ayarlar → Hesap → `Hesap güvenliği adımını yeniden aç` ertelemeyi kaldırıp güvenlik adımına döndürür. Yayın ortamında veya `ALLOW_LOCAL_SETUP_SKIP` kapalıysa erteleme geçersizdir ve eksik güvenlik adımları yeniden zorunludur. F07 düzeltme ve yük testi işi açık kalır.

### Profil ve hesap ayarları

Sol alttaki kullanıcı alanı profil menüsünü açar. `/settings/account` dört ayrı bölüm sunar: ad/telefon, e-posta, şifre ve güvenlik. Profil alanları yalnızca oturumdaki kullanıcıya yazılır; istemciden rol veya başka kullanıcı kimliği kabul edilmez. E-posta ve şifre işlemleri mevcut şifreyi ister. Yeni e-posta doğrulanana kadar kayıtlı adres korunur. Şifre değişimi eski oturumları ve bekleyen güvenlik tokenlarını iptal eder, mevcut kullanıcıya yeni oturum verir. Google ile giriş, kullanıcının kendi belirlediği profil adını artık değiştirmez. Yerel güvenlik ertelemesini yeniden açma seçeneği Güvenlik bölümündedir. Mobilde Profilim bağlantısı aynı sayfayı açar.
