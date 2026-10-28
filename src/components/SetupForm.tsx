"use client";
import { useState, type ReactNode } from "react";
export function SetupForm({
  children,
  action = "/api/onboarding/step",
  label = "Kaydet ve devam et",
  forward = false,
}: {
  children: ReactNode;
  action?: string;
  label?: string;
  forward?: boolean;
}) {
  const [pending, setPending] = useState(false);
  return (
    <form
      action={action}
      method="post"
      className="setup-form"
      onSubmit={() => setPending(true)}
      aria-busy={pending}
    >
      {children}
      <button className="setup-primary" type="submit" disabled={pending}>
        {pending ? "İşleminiz yapılıyor…" : label}
        {!pending && forward && <span aria-hidden="true">→</span>}
      </button>
    </form>
  );
}
