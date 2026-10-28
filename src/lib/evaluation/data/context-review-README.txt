Bağlam denetçisi veri kümesi: context-review-v2.json
Sürüm: context-examples-v2

106 örnek / 56 senaryo grubu: 69 referans, 37 sınama.
50 FLAG, 50 PASS, 6 INSUFFICIENT_CONTEXT.

Referanslar önceki kullanıcı demo konuşmalarındaki hata örüntülerinden anonimleştirilerek yeniden yazıldı. Doğru karşılıklar ve kanıt sınırı örnekleri sentetiktir. Kişiler, kurum, adres, yaş ve işlem bağlamı test verisidir. Orijinal hasta kayıtları, telefonlar veya kimlikler kullanılmadı. Klinik çalışma alanları ve fiyatlar güncel uygulama bilgisi olarak kullanılamaz.

Her kayıt: id, groupId, split, tags, provenance, labelStatus, input, expected.
input: mesaj, aday cevap, yakın konuşma geçmişi, profil, aşama, uzman kimliği, takvim sonucu, talepler, örneğe ait onaylı test bilgisi.
expected: karar, beklenen hata sınıfı, gerekçe, beklenen davranış.
Etiketler kod ve kullanıcının kabul ettiği akışa göre mühendislik değerlendirmesidir. Klinik politika onayı veya profesyonel klinik değerlendirme değildir.

Her hatalı/doğru çift aynı groupId ve split içindedir. Sınama senaryoları ayrı yazıldı; aynı cümlenin isim değiştirilmiş kopyaları değildir. Aynı hata ailesinin yeni bağlamlarını içerir. Sınama satırları model bağlamına örnek olarak gönderilemez. Seçim testi bu sınırı korur.

src/lib/llm/context-examples.ts yalnızca reference satırlarında deterministik kategori/kelime eşleştirmesi yapar. En fazla iki senaryo grubu/dört örnek, en fazla 14.000 karakter seçilir. Güncel kullanıcı mesajı, profil, onaylı kaynaklar ve takvim bu örneklerden daha yetkilidir. Bunlar model eğitimi/fine-tuning değildir.

Çalıştırma:
node --env-file=.env --import tsx scripts/evaluation/context-dataset.ts
EVAL_MODEL ve EVAL_OUTPUT_DIR ile model ve çıktı klasörü değiştirilebilir.
Aynı 37 sınama örneği examples:false ve examples:true olarak karşı dengeli sırayla değerlendirilir. Karar doğruluğu yanında hata sınıfı, yanlış pozitif, kaçan hata, invalid/unavailable, token ve süre ayrı incelenmelidir. Ulaşılamayan model başarılı kontrol sayılmaz.

Sınama sonuçları görüldükten sonra bu sürümü değiştirmeyin; sonraki ayarlamalarda yeni bağımsız sınama kümesi ekleyin. Kullanıcının yeni hata bildirimlerini önce ayrı aday kümeye koyun, gerekçesini gözden geçirin, sonra sürümlü referansa alın. Model çıktısını kendiliğinden doğru etiket olarak kabul etmeyin.

CONTEXT_REVIEW_EXAMPLES=off ile örnek katkısı kapatılır. CONTEXT_REVIEW=off gözlem katmanını tamamen kapatır. Docker ayar değişiklikleri için app yeniden oluşturulmalıdır. Hiçbir ayar denetçiye cevap değiştirme veya operasyon yapma yetkisi vermez.

V2 ekleri (8 Ekim 2026):
8 referans senaryosu / 16 çift satırı: nezaketle verilen tam ad; takvim uygunluğu ile klinik uygunluğun ayrımı; demo kişinin kurumda çalışıp çalışmadığı sorusu; aynı mesajdaki randevu, ad, yaş, uzman, saat ve EMDR; kayıtlı uzmanı hatırlama; çalışma saatleriyle 4→16; ad+soru; ücret+randevu kayıtlarını koruma.
4 bağımsız sınama senaryosu / 8 satır: aynı mesajda saat ve çocuk için klinik uygunluk; açık gece 04:00 düzeltmesi; nezaketle soyadı paylaşmayı reddetme; takvim kontrolü olmadan onay isteği. Yeni kontroller model bağlamına verilmez.
V1 dosyası ve geçmiş ölçümleri korunmuştur. V2'de r08 referansının çalışma saatleri sentetik olarak 03:00–18:00 yapıldı: yalnız bu bağlamda 04:00/16:00 gerçekten belirsizdir. Normal 10:00–18:00 kuralı için r34 eklendi. Önceki sınama satırları değiştirilmedi.
Yeni PASS yanıtları mühendislikçe yazılmış beklenen yanıtlardır; tamamının gerçek model tarafından üretildiği iddia edilmez. Veri yapısı, eşleşmeler, erişim sınırı ve örnek seçimi test edilir. Yeni 37 satırla canlı model karşılaştırması ayrıca çalıştırılmalıdır; eski başarı oranı V2 sonucu değildir.
