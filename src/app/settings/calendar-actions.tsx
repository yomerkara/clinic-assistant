"use client";

import { useRouter } from "next/navigation";

export function DisconnectCalendarButton() {
  const router = useRouter();
  return (
    <button
      className="admin-secondary-btn"
      type="button"
      onClick={() => {
        void fetch("/api/calendar/google", { method: "DELETE" }).then(() => {
          router.push("/settings");
          router.refresh();
        });
      }}
    >
      Bağlantıyı kes
    </button>
  );
}
