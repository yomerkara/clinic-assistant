"use client";

import { useState } from "react";
import { formatClinicDateTime } from "@/lib/clinic-clock";
import { useRouter } from "next/navigation";

type Doc = {
  id: string;
  title: string;
  source: string;
  sourceUrl: string | null;
  version: number;
  lastSyncedAt: string | null;
  pendingContent: string | null;
  approvalStatus: string;
};

export function KnowledgePanel({ docs }: { docs: Doc[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function sync() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/knowledge/sync", { method: "POST" });
      if (!response.ok) throw new Error("sync");
      setMessage("Kaynaklar güncellendi. Değişen metinler onay bekler.");
      router.refresh();
    } catch {
      setMessage("Senkron tamamlanamadı. Siteye şu an ulaşılamıyor olabilir.");
    } finally {
      setPending(false);
    }
  }

  async function approve(id: string, kind: "pending" | "draft") {
    await fetch("/api/knowledge/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, kind }),
    });
    router.refresh();
  }

  return (
    <section className="settings-section">
      <header className="settings-section__head">
        <div>
          <span className="admin-kicker">Bilgi havuzu</span>
          <h2>Resmi siteden onaylı içerik</h2>
          <p>Asistan yalnızca burada onaylı metinlerden yanıt verir. Sitede değişen sayfa önce onaya düşer.</p>
        </div>
        <button className="admin-secondary-btn" type="button" onClick={() => void sync()} disabled={pending}>
          {pending ? "Güncelleniyor…" : "Kaynakları güncelle"}
        </button>
      </header>
      {message ? <p className="settings-note">{message}</p> : null}
      <ul className="settings-doc-list">
        {docs.map((doc) => (
          <li key={doc.id}>
            <div>
              <b>{doc.title}</b>
              <small>
                v{doc.version}
                {doc.sourceUrl ? ` · ${new URL(doc.sourceUrl).hostname}` : ""}
                {doc.lastSyncedAt
                  ? ` · son kontrol ${formatClinicDateTime(doc.lastSyncedAt)}`
                  : ""}
              </small>
            </div>
            {doc.pendingContent ? (
              <button className="admin-primary-btn" type="button" onClick={() => void approve(doc.id, "pending")}>
                Değişikliği onayla
              </button>
            ) : doc.approvalStatus !== "APPROVED" ? (
              <button className="admin-primary-btn" type="button" onClick={() => void approve(doc.id, "draft")}>
                Taslağı onayla
              </button>
            ) : (
              <span className="settings-pill settings-pill--ok">Onaylı</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
