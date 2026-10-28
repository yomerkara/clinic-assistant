export function ConversationStatus({ mode, stage }: { mode: string; stage: string }) {
  const status =
    mode === "HUMAN"
      ? { label: "Çalışanda", tone: "human" }
      : stage === "PENDING_APPROVAL"
        ? { label: "Onay bekliyor", tone: "pending" }
        : stage === "SLOT_SELECTION"
          ? { label: "Saat seçiliyor", tone: "active" }
          : ["INTAKE", "THERAPIST_PREFERENCE", "AVAILABILITY"].includes(stage)
            ? { label: "Bilgi bekleniyor", tone: "active" }
            : null;
  if (!status) return null;
  return (
    <span className={`conversation-status conversation-status--${status.tone}`}>
      <span className="conversation-status__dot" aria-hidden="true" />
      {status.label}
    </span>
  );
}
