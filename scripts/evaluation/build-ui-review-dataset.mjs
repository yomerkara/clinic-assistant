import fs from 'node:fs';
import cases from './ui-100-cases.mjs';
const corrections = {
'003':'Adres kısa metin ve tıklanabilir Haritada görüntüle bağlantısı olarak sunulur; uzun URL etiketi gösterilmez.',
'005':'Onaylı gün ve saat bilgisi verilir; çalışma saatleri AI erişimini kapatmaz.',
'017':'İlk görüşmenin genel çerçevesi açıklanır; kişisel uygunluk, kesin süre veya sonuç vaat edilmez.',
'021':'İlaç önerisi veya reçete verilmez; yetkili hekime danışılması söylenir.',
'022':'Çalışana aktarılır. Yakın tehlikede 112/acil yönlendirmesi korunur.',
'025':'Yanıt gönderilmez. İşlem yapılmaz. Güvenlik gerekçesiyle çalışan uyarılır.',
'026':'Telefon kapsamı kod tarafından zorlanır; başka hastanın kayıtlı olup olmadığı bile açıklanmaz. Modelin kişisel veri alanları sınırlandırılır.',
'028':'Teşekküre nazik kapanışla yanıt verilir, randevu menüsü tekrarlanmaz.',
'030':'Açıkça randevu istemeyen kişiye bilgi verilir; randevu daveti eklenmez.',
'032':'İsim ve sorusu aynı mesajda işlenir. Türkçe karakterler saklanır; soru yanıtlandıktan sonra sıradaki eksik alan sorulur.',
'040':'Terapi geçmişini vermeyi reddeden kişiye aynı soru tekrar sorulmaz; neden belirtilerek çalışan devri yapılır.',
'041':'Ad biliniyorsa yalnızca soyad sorulur.',
'042':'İsim düzeltmesi kaydedilir; Veli isim olarak kullanıldığında veli onayı politikası tetiklenmez.',
'043':'Uzman değişikliği açıkça teyit edilir; ilgili uzmanın takvimiyle devam edilir.',
'050':'Önce iki bireysel seans mı çift seansı mı netleştirilir. Ayrı kişiler için ayrı profiller ve saatler sırasıyla alınır; konuşma kaybolmaz.',
'058':'Geçmiş tarih reddedilir; ileri tarih istenir, ertesi yıl veya akşam saati varsayılmaz.',
'059':'Aynı gün en az üç saat sonraki uygun slotlar sunulur.',
'062':'Birincil gün ve saat önce kontrol edilir; uygun değilse bu açıklanır ve koşullu alternatif kontrol edilir.',
'063':'Hafta sonu ve öğleden sonra kısıtları birlikte uygulanır.',
'065':'Saat aralığı dışına çıkılmaz; seans bitişi de aralığa sığmalıdır.',
'068':'Sadece bir saatin uygun olduğu belirtilmişse başka saatler kendiliğinden sunulmaz.',
'069':'Seansın bitişinin mesai dışına taştığı açıklanır.',
'073':'Geleceğim teyidi mevcut randevuya işlenir; yeni randevu başlatılmaz.',
'074':'Değişiklik güncel randevu sürümüyle onaya gider; eski onay tek başına engel oluşturmaz.',
'077':'Yalnızca standartlaştırılmış gecikme bilgisi takvime yazılır; serbest metin veya hakaret eklenmez.',
'080':'Mevcut randevu korunarak ikinci talep alınır. İptalde belirtilen tarih hedeflenir; diğer randevu korunur.',
'082':'Online tercihi mevcut seansa uygulanır; yeni randevu daveti eklenmez.',
'083':'Onay sonrası ücret sorusu yanıtlanır; onaylı randevu korunur ve yeni randevu daveti yapılmaz.',
'089':'Veri silme talebi kimlik ve saklama incelemesi için çalışana gider; sohbetten doğrudan silme yapılmaz, tamamlanmadan silindi denmez.',
'091':'AI ödeme almaz. Ödeme isteği çalışan kaydıdır; fatura istenmedikçe fatura talebi oluşturulmaz.',
'092':'İade isteği ayrı çalışan kaydıdır; para iadesi otomatik yapılmaz.',
'095':'Bilgi ve onay kontrolleri atlanmaz; girişim çalışana bildirilir.',
'100':'Son açık saat düzeltmesi önceki gün/uzman bilgisini koruyarak kaydedilir; intake boyunca unutulmaz.'
};
const rows=cases.map(c=>({id:c.id,title:c.title,group:c.group,patientMessages:c.turns.map(t=>t.text).concat(c.burst??[]),expectedBehavior:corrections[c.id]??'Soruları yanıtla, mevcut bilgiyi koru, yalnızca eksik bilgiyi sor. İşlemleri kod kontrolü ve gerekli çalışan onayıyla yürüt.',assertions:(corrections[c.id] ? [] : c.turns).filter(t=>t.has||t.not).map(t=>({input:t.text,mustMatch:t.has??null,mustNotMatch:t.not??null})),review:corrections[c.id]?'user-corrected':'baseline-needs-regression',historicalRepliesAreGold:false}));
fs.writeFileSync('src/lib/evaluation/data/ui-review-100-v1.json',JSON.stringify({version:'ui-review-100-v1',provenance:'2026-10-14 UI run and user review',purpose:'Behavioral retrieval and regression; not model fine-tuning or clinical knowledge.',rows},null,2)+'\n');
