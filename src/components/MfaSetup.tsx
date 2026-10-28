import type { User } from "@prisma/client";
import { decryptSecret } from "@/lib/security/encryption";
export function MfaSetup({
  user,
  emailDeferred = false,
}: {
  user: User;
  emailDeferred?: boolean;
}) {
  if (user.mfaEnabledAt)
    return (
      <div className="onboarding-success">
        İki aşamalı doğrulama etkin. Girişte doğrulayıcı kodunuz istenecek.
      </div>
    );
  if (
    user.mustChangePassword ||
    !user.username ||
    (!user.emailVerifiedAt && !emailDeferred)
  )
    return (
      <p className="desk-muted">
        İki aşamalı doğrulama, giriş bilgileriniz ve e-posta doğrulaması tamamlandıktan
        sonra kurulacak.
      </p>
    );
  let secret: string | null = null;
  if (user.totpPendingEncrypted) {
    try {
      secret = decryptSecret(user.totpPendingEncrypted, `${user.id}:totp`);
    } catch {
      secret = null;
    }
  }
  return (
    <section className="settings-section">
      <h2>İki aşamalı doğrulama</h2>
      <p>
        Google Authenticator, Microsoft Authenticator veya uyumlu bir doğrulayıcı uygulama
        kullanın.
      </p>
      {secret ? (
        <>
          <p>
            Uygulamada “Kurulum anahtarı gir” seçeneğini açın. Hesap:{" "}
            <b>Santa · {user.username}</b>. Tür: zamana dayalı.
          </p>
          <code className="mfa-secret">{secret}</code>
          <form
            className="desk-form account-security-form"
            action="/api/auth/mfa/setup"
            method="post"
          >
            <input type="hidden" name="intent" value="confirm" />
            <label>
              Mevcut şifre
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <label>
              6 haneli doğrulama kodu
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
              />
            </label>
            <button className="admin-primary-btn">Doğrulamayı etkinleştir</button>
          </form>
        </>
      ) : (
        <form
          className="desk-form account-security-form"
          action="/api/auth/mfa/setup"
          method="post"
        >
          <input type="hidden" name="intent" value="start" />
          <label>
            Mevcut şifre
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              required
            />
          </label>
          <button className="admin-primary-btn">Doğrulayıcı kurulumunu başlat</button>
        </form>
      )}
    </section>
  );
}
