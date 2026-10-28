"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ControlIcon } from "./ControlIcon";
import "./patient-create.css";

export function PatientCreate() {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [existingId, setExistingId] = useState<string>();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setExistingId(undefined);
    try {
      const response = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
      });
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error("Oturumunuzu yenileyip tekrar deneyin.");
      const data = await response.json();
      if (!response.ok) {
        setExistingId(data.existingId);
        throw new Error(data.error);
      }
      form.current?.reset();
      dialog.current?.close();
      router.push(`/patients/${encodeURIComponent(data.id)}?created=yes`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt oluşturulamadı. Tekrar deneyin.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="admin-primary-btn"
        onClick={() => {
          setError("");
          setExistingId(undefined);
          dialog.current?.showModal();
        }}
      >
        <ControlIcon name="plus" /> Müşteri ekle
      </button>
      <dialog
        ref={dialog}
        className="patient-create-dialog"
        aria-labelledby="patient-create-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <header>
          <div>
            <span className="admin-kicker">Yeni kayıt</span>
            <h2 id="patient-create-title">Müşteri ekle</h2>
          </div>
          <button
            type="button"
            className="patient-create-close"
            aria-label="Formu kapat"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            <ControlIcon name="close" />
          </button>
        </header>
        <p>
          İletişim bilgileriyle başlayın. Diğer bilgileri daha sonra tamamlayabilirsiniz.
        </p>
        <form ref={form} onSubmit={submit}>
          <fieldset disabled={busy}>
            <label>
              Ad soyad <span>*</span>
              <input
                name="displayName"
                required
                minLength={3}
                maxLength={120}
                autoComplete="off"
                placeholder="Adı ve soyadı"
              />
            </label>
            <label>
              Telefon <span>*</span>
              <input
                name="phone"
                type="tel"
                required
                maxLength={40}
                autoComplete="off"
                placeholder="0532 123 45 67"
              />
              <small>
                Türkiye numaraları için 05…; diğer ülkeler için ülke koduyla +…
              </small>
            </label>
            <div className="patient-create-columns">
              <label>
                Yaş
                <input name="age" type="number" min={0} max={120} step={1} />
              </label>
              <label>
                Daha önce terapi aldı mı?
                <select name="hasTherapyHistory" defaultValue="">
                  <option value="">Bilinmiyor</option>
                  <option value="true">Evet</option>
                  <option value="false">Hayır</option>
                </select>
              </label>
            </div>
            <label>
              Uygun gün ve saatler
              <textarea
                name="availabilityNotes"
                maxLength={500}
                rows={2}
                placeholder="Örn. hafta içi 17.00 sonrası"
              />
            </label>
            <label>
              Alternatif günler uygun mu?
              <select name="alternativeDaysOkay" defaultValue="">
                <option value="">Bilinmiyor</option>
                <option value="true">Evet</option>
                <option value="false">Hayır</option>
              </select>
            </label>
          </fieldset>
          {error && (
            <div className="patient-create-error" role="alert">
              {error}
              {existingId && (
                <Link
                  href={`/patients/${encodeURIComponent(existingId)}`}
                  onClick={() => dialog.current?.close()}
                >
                  Mevcut kaydı aç →
                </Link>
              )}
            </div>
          )}
          <footer>
            <button
              type="button"
              className="admin-secondary-btn"
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              Vazgeç
            </button>
            <button type="submit" className="admin-primary-btn" disabled={busy}>
              {busy ? "Kaydediliyor…" : "Müşteriyi kaydet"}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
