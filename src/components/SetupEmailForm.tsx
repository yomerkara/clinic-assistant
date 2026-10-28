"use client";
import { useState } from "react";
import { SetupForm } from "./SetupForm";
export function SetupEmailForm({
  initialEmail,
  pending,
  allowLocalAdmin,
}: {
  initialEmail: string;
  pending: boolean;
  allowLocalAdmin: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const deferred = allowLocalAdmin && email.trim().toLowerCase() === "admin@santa.local";
  return (
    <SetupForm
      forward={deferred}
      label={
        deferred
          ? "E-posta adımını ertele ve devam et"
          : pending
            ? "Doğrulama mailini yeniden gönder"
            : "Doğrulama bağlantısı gönder"
      }
    >
      <input type="hidden" name="intent" value="email" />
      <label htmlFor="setup-email">E-posta adresiniz</label>
      <input
        id="setup-email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="adiniz@ornek.com"
        maxLength={254}
        required
      />
      <p className="setup-field-note">
        {deferred
          ? "Yalnızca yerel geliştirme: mail gönderilmeden telefon adımına geçilir. E-posta doğrulanmış sayılmaz."
          : "Doğrulama bağlantısı bu adrese gönderilir. İsterseniz gönderimden önce adresi değiştirebilirsiniz."}
      </p>
    </SetupForm>
  );
}
