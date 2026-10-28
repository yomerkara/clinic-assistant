import { toIstanbulInput } from "@/lib/calendar/dates";
export function ServiceWorkflowForm({
  id,
  kind,
  admin,
  therapists,
  configured,
  workflow,
  notified,
  appointments = [],
}: {
  id: string;
  kind: string;
  admin: boolean;
  therapists: Array<{ id: string; displayName: string }>;
  configured: boolean;
  workflow?: unknown;
  notified: boolean;
  appointments?: Array<{ id: string; label: string }>;
}) {
  const plan =
    workflow && typeof workflow === "object" ? (workflow as Record<string, unknown>) : {};
  const time = (value: unknown, fallback: string) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 1440
      ? `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
      : fallback;
  if (!["WAITLIST", "RECURRING", "DATA_REQUEST", "ONLINE"].includes(kind)) return null;
  if (kind === "DATA_REQUEST" && !admin)
    return <p>Veri işlemleri yönetici tarafından yapılır.</p>;
  return (
    <details className="service-workflow" id={`request-workflow-${id}`}>
      <summary>
        {kind === "WAITLIST"
          ? "Bekleme aralığını belirle"
          : kind === "RECURRING"
            ? "Haftalık seansları planla"
            : kind === "ONLINE"
              ? "Randevuyu online olarak ayarla"
              : "Veri talebini işle"}
      </summary>
      {configured && (
        <p>
          {notified
            ? "Saat önerisi mesaj kanalına gönderildi; teslim teyidi yok. Yeni aralık kaydederseniz takip yeniden başlar."
            : "Takip yapılandırıldı."}
        </p>
      )}
      <form
        className="patient-edit__form"
        action={`/api/service-requests/${id}/workflow`}
        method="post"
      >
        {kind === "ONLINE" ? (
          <>
            <input type="hidden" name="operation" value="ONLINE" />
            <label>
              Randevu
              <select name="appointmentId" required>
                <option value="">Randevu seçin</option>
                {appointments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Seçilen randevu Google takviminde online olarak işaretlenir; Meet bağlantısı
              hazırlanır.
            </p>
            <button className="toolbar-apply-btn" disabled={!appointments.length}>
              Online seansı kaydet
            </button>
            {!appointments.length && <p>Önce gelecekteki bir randevu oluşturulmalı.</p>}
          </>
        ) : kind !== "DATA_REQUEST" ? (
          <>
            <input type="hidden" name="operation" value={kind} />
            <label>
              Uzman
              <select
                name="therapistId"
                defaultValue={
                  typeof plan.therapistId === "string" ? plan.therapistId : ""
                }
                required
              >
                <option value="">Uzman seçin</option>
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName}
                  </option>
                ))}
              </select>
            </label>
            {kind === "WAITLIST" ? (
              <>
                <p>
                  Hastanın istediği tarih ve saat aralığını kaydedin. Takip
                  başlatıldığında asistan saat seçimi için yeniden devreye girer. Uygun
                  saat bulununca seçim sunulur; randevu otomatik kesinleşmez.
                </p>
                <label>
                  Başlangıç
                  <input
                    name="from"
                    type="datetime-local"
                    defaultValue={
                      typeof plan.from === "string" ? toIstanbulInput(plan.from) : ""
                    }
                    required
                  />
                </label>
                <label>
                  Son tarih
                  <input
                    name="until"
                    type="datetime-local"
                    defaultValue={
                      typeof plan.until === "string" ? toIstanbulInput(plan.until) : ""
                    }
                    required
                  />
                </label>
                <label>
                  Gün içi en erken
                  <input
                    name="startTime"
                    type="time"
                    defaultValue={time(plan.startMinute, "08:00")}
                    required
                  />
                </label>
                <label>
                  Gün içi en geç
                  <input
                    name="endTime"
                    type="time"
                    defaultValue={time(plan.endMinute, "23:00")}
                    required
                  />
                </label>
                <button className="toolbar-apply-btn">Takibi başlat</button>
              </>
            ) : (
              <>
                <p>
                  Her hafta aynı gün ve saatte, 50 dakikalık seanslar. Bütün tarihler
                  kontrol edilir; her seans onay kuyruğuna ayrı eklenir.
                </p>
                <label>
                  İlk seans
                  <input name="startAt" type="datetime-local" required />
                </label>
                <label>
                  Seans sayısı
                  <input
                    name="count"
                    type="number"
                    min={2}
                    max={12}
                    defaultValue={4}
                    required
                  />
                </label>
                <button className="toolbar-apply-btn">Kontrol et ve onaya gönder</button>
              </>
            )}
          </>
        ) : (
          <>
            <p>
              Önce kimlik ve talep kapsamını doğrulayın. İndirilen dosyayı hastaya teslim
              etmeden inceleyin. Silme, uygulama kayıtları ve bağlı takvim etkinliklerini
              kapsar; yedekler ve mesaj sağlayıcısındaki kopyalar ayrıca ele alınmalıdır.
            </p>
            <h3>1. Kimlik doğrulama</h3>
            <label className="service-check">
              <input type="checkbox" name="identityVerified" value="yes" required /> Talep
              sahibinin kimliğini doğruladım.
            </label>
            <h3>2. Talep edilen işlem</h3>
            <button name="operation" value="EXPORT" className="admin-secondary-btn">
              Verileri indir
            </button>
            <details>
              <summary>Kalıcı silme seçeneklerini aç</summary>
              <fieldset>
                <legend>Kalıcı silme</legend>
                <p>
                  Aktif randevular ve bekleyen işlemler önce sonuçlandırılmalıdır. Ortak
                  telefon kayıtları otomatik silinmez.
                </p>
                <label className="service-check">
                  <input type="checkbox" name="retentionReviewed" value="yes" /> Saklama
                  gerekliliklerini ve silme kapsamını inceledim.
                </label>
                <label>
                  Onay için SİL yazın
                  <input name="confirmation" autoComplete="off" />
                </label>
                <button name="operation" value="ERASE" className="admin-secondary-btn">
                  Kayıtları kalıcı sil
                </button>
              </fieldset>
            </details>
          </>
        )}
      </form>
    </details>
  );
}
