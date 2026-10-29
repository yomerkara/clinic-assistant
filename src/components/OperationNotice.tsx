// Result of a staff action. Every message says what happened to the request,
// why, and what to do next, because the member of staff cannot see the server
// error and needs to know whether the appointment changed.
type Notice = { title: string; detail: string };

const ERRORS: Record<string, Notice> = {
  incomplete_profile: {
    title: "Randevu onaylanmadı: müşteri bilgileri eksik",
    detail:
      "Randevu kesinleşmeden önce ad-soyad, yaş, terapi geçmişi ve uygun gün/saat bilgilerinin dolu olması gerekiyor. Müşteri sayfasından eksikleri tamamlayıp talebi yeniden onaylayın. Takvimde değişiklik yapılmadı.",
  },
  forbidden: {
    title: "Bu işlemi yapma yetkiniz yok",
    detail:
      "Randevu onayı yönetici veya randevunun ilgili terapistine açıktır; stajyer hesapları konuşmayı sürdürebilir ancak onay veremez. Kendinize ait olmayan bir kayda eriştiyseniz talep listesine dönün. Hiçbir değişiklik yapılmadı.",
  },
  slot_conflict: {
    title: "Seçilen saat artık müsait değil",
    detail:
      "Onay sırasında yapılan kontrolde bu saat terapistin takviminde dolu çıktı; çift randevu oluşmaması için işlem durduruldu. Talebi düzenleyip başka bir saat seçin veya müşteriden yeni saat isteyin.",
  },
  conflict: {
    title: "Talep bu arada değişti",
    detail:
      "Aynı randevu için başka bir işlem önce onaylanmış ya da kayıt güncellenmiş. Güvenlik için bu onay uygulanmadı. Sayfayı yenileyip güncel randevu saatini ve talebi kontrol edin, hâlâ gerekliyse yeniden onaylayın.",
  },
  bot: {
    title: "Mesaj gönderilmedi: konuşma asistanda",
    detail:
      "Asistan yanıt verirken çalışan mesajı gönderilmez, aksi hâlde müşteriye iki farklı yanıt gider. Önce konuşmayı devralın, sonra mesajınızı gönderin.",
  },
  calendar: {
    title: "Takvim doğrulanamadı",
    detail:
      "Google Takvim şu anda okunamadı, bu yüzden işlem onaylanmadı ve takvimde değişiklik yapılmadı. Ayarlar ekranından ilgili kişinin takvim bağlantısını kontrol edip tekrar deneyin.",
  },
  invalid_time: {
    title: "Girilen saat kullanılamıyor",
    detail:
      "Başlangıç saati gelecekte olmalı, bitiş saati başlangıçtan sonra gelmeli ve randevu aynı gün içinde kalmalı. Saatleri düzeltip tekrar kaydedin.",
  },
  calendar_required: {
    title: "Takvim bağlantısı gerekiyor",
    detail:
      "Bu işlem için ilgili kişinin Google Takvim bağlantısı kurulmuş olmalı. Ayarlar ekranından bağlantıyı tamamladıktan sonra tekrar deneyin.",
  },
  rate: {
    title: "Çok fazla deneme yapıldı",
    detail:
      "Güvenlik için bir süre beklemeniz gerekiyor. Birkaç dakika sonra tekrar deneyin; hesabınızda bir değişiklik yapılmadı.",
  },
};

const DONE: Record<string, Notice> = {
  approved: {
    title: "Talep onaylandı",
    detail:
      "Randevu kaydedildi, terapistin takvimine işlendi ve müşteriye bilgi mesajı kuyruğa alındı.",
  },
  rejected: {
    title: "Talep reddedildi",
    detail:
      "Randevu oluşturulmadı. Konuşma müşterinin mevcut bilgilerine göre devam eder; gerekiyorsa konuşmadan yeni bir saat isteyebilirsiniz.",
  },
  edited: {
    title: "Yeni saat kaydedildi",
    detail:
      "Talep güncellendi ve onaya hazır. Randevu, siz onaylayana kadar kesinleşmez.",
  },
};

const UNKNOWN_ERROR: Notice = {
  title: "İşlem tamamlanamadı",
  detail:
    "Beklenmeyen bir durum oluştu ve güvenlik için hiçbir değişiklik uygulanmadı. Sayfayı yenileyip tekrar deneyin; sorun sürerse talebin ekran görüntüsüyle birlikte sistem sorumlusuna bildirin.",
};

export function OperationNotice({ error, done }: { error?: string; done?: string }) {
  const notice = error
    ? (ERRORS[error] ?? UNKNOWN_ERROR)
    : done
      ? (DONE[done] ?? null)
      : null;
  if (!notice) return null;
  return (
    <div className="admin-alert" role={error ? "alert" : "status"}>
      <b>{notice.title}</b>
      <span>{notice.detail}</span>
    </div>
  );
}

export const OPERATION_NOTICES = { ERRORS, DONE, UNKNOWN_ERROR };
