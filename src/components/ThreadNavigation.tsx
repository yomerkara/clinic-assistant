"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ThreadNavigation({
  conversationId,
  lastMessageId,
  unreadId,
  count,
}: {
  conversationId: string;
  lastMessageId?: string;
  unreadId?: string;
  count: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const jump = (id?: string) => {
    if (id)
      document
        .getElementById(`message-${id}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const mark = async () => {
    if (!lastMessageId) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("messageId", lastMessageId);
      const r = await fetch(`/api/conversations/${conversationId}/read`, {
        method: "POST",
        body,
      });
      if (!r.ok) throw Error();
      router.refresh();
    } catch {
      setError("Okundu bilgisi kaydedilemedi. Tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <nav className="thread-navigation" aria-label="Mesajlarda gezinme">
      <button type="button" onClick={() => jump(lastMessageId)} disabled={!lastMessageId}>
        Son mesaja git ↓
      </button>
      {unreadId && (
        <>
          <button type="button" onClick={() => jump(unreadId)}>
            {count} okunmamış mesaj
          </button>
          <button type="button" disabled={busy} onClick={mark}>
            {busy ? "Kaydediliyor…" : "Okundu işaretle"}
          </button>
        </>
      )}
      <a href="#current-requests">Açık talepler →</a>
      {error && <span role="alert">{error}</span>}
    </nav>
  );
}
