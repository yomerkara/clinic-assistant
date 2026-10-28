"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PendingRequestRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      // Leave active reply/appointment forms undisturbed while the user edits.
      if (
        document.visibilityState === "visible" &&
        !document.activeElement?.closest("input, textarea, select, [contenteditable]")
      ) {
        router.refresh();
      }
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);
  return null;
}
