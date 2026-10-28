"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CalendarAutoRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const lastRefresh = useRef(0);

  useEffect(() => {
    const refresh = () => {
      if (
        pending ||
        document.visibilityState !== "visible" ||
        document.querySelector("dialog[open]") ||
        document.activeElement?.closest("input, textarea, select, [contenteditable]") ||
        Date.now() - lastRefresh.current < 2000
      )
        return;
      lastRefresh.current = Date.now();
      startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, pending]);

  return null;
}
