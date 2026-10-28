const errors: Record<string, string> = {
  incomplete_profile:
    "Randevu onaylanmadı. Müşteri sayfasında ad-soyad, yaş, terapi geçmişi ve uygun gün/saat bilgilerini tamamlayın.",
  forbidden: "Bu işlem için yetkiniz yok.",
  slot_conflict: "Bu saat artık müsait değil. Başka bir saat seçin.",
  conflict: "Talep değişmiş olabilir. Güncel bilgileri kontrol edin.",
  bot: "Mesaj göndermeden önce konuşmayı devralın.",
  calendar:
    "Takvim doğrulanamadı. Bağlantıyı kontrol edip yeniden deneyin; işlem onaylanmadı.",
  invalid_time: "Gelecekte bir başlangıç ve ondan sonraki bir bitiş saati seçin.",
};
export function OperationNotice({ error, done }: { error?: string; done?: string }) {
  const message = error
    ? (errors[error] ?? "İşlem tamamlanamadı. Yeniden deneyin.")
    : done === "approved"
      ? "Talep onaylandı."
      : done === "rejected"
        ? "Talep reddedildi."
        : done === "edited"
          ? "Yeni saat kaydedildi. Talep onaya hazır."
          : null;
  return message ? (
    <div className="admin-alert" role={error ? "alert" : "status"}>
      {message}
    </div>
  ) : null;
}
