import type { User } from "@prisma/client";
export function AccountSetup({
  user,
  account = false,
}: {
  user: User;
  account?: boolean;
}) {
  return (
    <section className="settings-section setup-security-card">
      <span className="setup-step-label">Hesap bilgileri</span>
      <h2>{account ? "Giriş ve kurtarma bilgileri" : "Hesabınızı güvenceye alın"}</h2>
      <p>
        İlk girişte kullanıcı adınızı ve şifrenizi belirleyin, e-posta adresinizi
        doğrulayın.
      </p>
      <form
        action="/api/auth/setup"
        method="post"
        className="desk-form account-security-form"
      >
        <input type="hidden" name="returnTo" value={account ? "account" : "onboarding"} />
        <label>
          Kullanıcı adı
          <input
            name="username"
            defaultValue={user.username ?? ""}
            autoComplete="username"
            pattern="[a-z0-9][a-z0-9._\-]{2,31}"
            minLength={3}
            maxLength={32}
            required
          />
        </label>
        <label>
          Kurtarma e-posta adresi
          <input
            name="email"
            type="email"
            defaultValue={user.emailVerifiedAt ? user.email : ""}
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>
        <small className="security-form-wide">
          {user.emailVerifiedAt
            ? "Mevcut e-posta doğrulandı. Yeni adres doğrulanana kadar eskisi korunur."
            : "Doğrulama bağlantısı bu adrese gönderilecek."}
        </small>
        <label className="security-form-wide">
          Mevcut / geçici şifre
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
          />
        </label>
        <label>
          Yeni şifre
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={15}
            maxLength={128}
            required={
              user.mustChangePassword ||
              Boolean(user.passwordExpiresAt && user.passwordExpiresAt < new Date())
            }
          />
        </label>
        <label>
          Yeni şifre tekrar
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={15}
            maxLength={128}
          />
        </label>
        <small className="security-form-wide">
          15–128 karakter. Uzun ve yalnızca bu uygulamada kullandığınız bir şifre seçin.
        </small>
        {user.passwordExpiresAt ? (
          <small className="security-form-wide">
            Şifre yenileme tarihi:{" "}
            {new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul" }).format(
              user.passwordExpiresAt,
            )}
          </small>
        ) : null}
        <button className="admin-primary-btn security-form-wide">
          Bilgileri kaydet ve e-postayı doğrula
        </button>
      </form>
    </section>
  );
}
