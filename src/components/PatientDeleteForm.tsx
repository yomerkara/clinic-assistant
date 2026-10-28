"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function PatientDeleteForm({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <details className="settings-section">
      <summary style={{ color: "#943c32", cursor: "pointer", fontWeight: 600 }}>
        Müşteriyi sil
      </summary>
      <p>
        <strong>{name}</strong> adlı müşterinin profili, konuşmaları, randevuları ve bağlı
        takvim kayıtları kalıcı olarak silinir. Bu işlem geri alınamaz.
      </p>
      <p>
        Aktif randevular önce sonuçlandırılmalıdır. Ortak telefon kayıtları başka
        kişilerin bilgilerini korumak için otomatik silinmez. Yedekler ve mesaj
        sağlayıcısındaki kopyalar bu işlemin dışında kalır.
      </p>
      <form
        className="patient-edit__form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const body = new FormData(event.currentTarget);
          setBusy(true);
          setError("");
          try {
            const response = await fetch(`/api/patients/${id}/delete`, {
              method: "POST",
              body,
            });
            const result = await response.json();
            if (!response.ok) {
              setError(result.error ?? "Silinemedi.");
              setBusy(false);
              return;
            }
            router.replace("/patients?deleted=yes");
            router.refresh();
          } catch {
            setError("Silme sonucu alınamadı. Müşteri listesini kontrol edin.");
            setBusy(false);
          }
        }}
      >
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <input
            type="checkbox"
            name="reviewed"
            value="yes"
            required
            style={{ width: 18, minWidth: 18, height: 18, marginTop: 4 }}
          />
          Doğru müşteri kaydını seçtiğimi, kimlik ve saklama gerekliliklerini kontrol
          ettim.
        </label>
        <label>
          Onaylamak için SİL yazın
          <input
            name="confirmation"
            autoComplete="off"
            required
            pattern="SİL"
            disabled={busy}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button
          type="submit"
          className="admin-secondary-btn"
          disabled={busy}
          style={{ color: "#943c32", borderColor: "#c89991" }}
        >
          {busy ? "Siliniyor…" : "Müşteriyi kalıcı sil"}
        </button>
      </form>
    </details>
  );
}
