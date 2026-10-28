"use client";
import { formatPatientName } from "@/lib/patients/profile";
import { UploadIcon } from "@/components/AdminIcons";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportMapping, ImportRow } from "@/lib/patients/import";
type Workbook = { sheets: string[]; sample: string[][]; total: number };
const fields = [
  ["name", "Ad soyad / Ad *"],
  ["surname", "Soyad (ayrı sütundaysa)"],
  ["phone", "Telefon *"],
  ["age", "Yaş"],
  ["notes", "Uygun gün ve saat notu"],
] as const;
export function PatientImport() {
  const router = useRouter();
  const file = useRef<File | null>(null);
  const [open, setOpen] = useState(false),
    [book, setBook] = useState<Workbook | null>(null),
    [sheet, setSheet] = useState(0),
    [header, setHeader] = useState(0),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [preview, setPreview] = useState<{ rows: ImportRow[]; fingerprint: string } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState("");
  async function send(mode: string, sheetValue = sheet) {
    if (!file.current) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      const body = new FormData();
      body.set("file", file.current);
      body.set("sheet", String(sheetValue));
      body.set("headerRow", String(header));
      body.set("mode", mode);
      body.set(
        "mapping",
        JSON.stringify(
          Object.fromEntries(
            Object.entries(mapping)
              .filter(([, v]) => v !== "")
              .map(([k, v]) => [k, Number(v)]),
          ) as ImportMapping,
        ),
      );
      if (preview) body.set("fingerprint", preview.fingerprint);
      const response = await fetch("/api/patients/import", { method: "POST", body });
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error("Oturumunuzu yenileyip tekrar deneyin.");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (mode === "read") {
        setBook(data);
        setPreview(null);
        setMapping({});
      }
      if (mode === "preview") setPreview(data);
      if (mode === "commit") {
        setDone(`${data.created} müşteri eklendi, ${data.skipped} satır atlandı.`);
        setPreview(null);
        setBook(null);
        file.current = null;
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem tamamlanamadı.");
      if (mode === "commit") setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  const count = preview?.rows.filter((r) => r.status === "new").length ?? 0;
  return (
    <section className="patient-import">
      <button
        className="admin-primary-btn import-trigger"
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <UploadIcon /> Excel’den müşteri yükle
      </button>
      {open && (
        <div className="import-body">
          <h2>Müşterileri Excel’den aktar</h2>
          <p>
            Ad soyad ve telefon zorunludur. İlk satırdaki başlıkları aşağıda eşleştirin.
            Kayıtlar onayınızdan sonra eklenir; mevcut müşteriler değiştirilmez.
          </p>
          <p className="desk-muted">
            .xlsx · En fazla 5 MB ve 2.000 müşteri. Telefonu metin olarak, tercihen +90
            ile kaydedin. Dosya kalıcı olarak saklanmaz. Bu işlem Google etkinliklerini
            otomatik eşleştirmez.
          </p>
          <label className="import-file">
            Excel dosyası
            <input
              type="file"
              accept=".xlsx"
              disabled={busy}
              onChange={(e) => {
                file.current = e.target.files?.[0] ?? null;
                setSheet(0);
                setHeader(0);
                setBook(null);
                setPreview(null);
                if (file.current) void send("read", 0);
              }}
            />
          </label>
          {book && (
            <>
              <div className="import-map">
                <label>
                  Excel sayfası
                  <select
                    disabled={busy}
                    value={sheet}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setSheet(n);
                      setHeader(0);
                      void send("read", n);
                    }}
                  >
                    {book.sheets.map((s, i) => (
                      <option value={i} key={i}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Başlık satırı
                  <select
                    disabled={busy}
                    value={header}
                    onChange={(e) => {
                      setHeader(Number(e.target.value));
                      setPreview(null);
                      setMapping({});
                    }}
                  >
                    {book.sample.slice(0, 20).map((_, i) => (
                      <option value={i} key={i}>
                        {i + 1}. satır
                      </option>
                    ))}
                  </select>
                </label>
                {fields.map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <select
                      value={mapping[key] ?? ""}
                      disabled={busy}
                      onChange={(e) => {
                        setMapping({ ...mapping, [key]: e.target.value });
                        setPreview(null);
                      }}
                    >
                      <option value="">Seçin</option>
                      {(book.sample[header] ?? []).map((v, i) => (
                        <option value={i} key={i}>
                          {i + 1}. {v || "(boş başlık)"}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <details>
                <summary>Dosyadan ilk satırları göster</summary>
                <div className="import-table">
                  <table>
                    <tbody>
                      {book.sample.slice(header, header + 5).map((r, i) => (
                        <tr key={i}>
                          {r.map((c, j) => (
                            <td key={j}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <button
                type="button"
                className="admin-secondary-btn"
                disabled={busy || !mapping.name || !mapping.phone}
                onClick={() => void send("preview")}
              >
                Önizle ve kontrol et
              </button>
            </>
          )}
          {preview && (
            <>
              <p>
                <b>{count} yeni müşteri</b> · {preview.rows.length - count} satır
                eklenmeyecek. Aynı isim ya da telefonla farklı kayıtlar varsa dosyayı
                kontrol ederek düzeltin.
              </p>
              <div className="import-table">
                <table>
                  <thead>
                    <tr>
                      <th>Satır</th>
                      <th>Müşteri</th>
                      <th>Telefon</th>
                      <th>Sonuç</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.row} className={`import-${r.status}`}>
                        <td>{r.row}</td>
                        <td>{formatPatientName(r.displayName)}</td>
                        <td>{r.phone}</td>
                        <td>{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="admin-primary-btn"
                disabled={busy || count === 0}
                onClick={() => void send("commit")}
              >
                {count} yeni müşteriyi içe aktar
              </button>
            </>
          )}
          {busy && <p role="status">Dosya kontrol ediliyor…</p>}
          {error && (
            <p role="alert" className="onboarding-error">
              {error}
            </p>
          )}
          {done && (
            <p role="status" className="onboarding-success">
              {done}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
