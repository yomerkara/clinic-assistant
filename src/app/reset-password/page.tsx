import Link from "next/link";
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <main className="account-public">
      <Link href="/login">← Girişe dön</Link>
      <h1>Yeni şifre belirleyin</h1>
      {error || !token ? (
        <p role="alert">
          Bağlantı geçersiz, kullanılmış veya şifreler uygun değil.{" "}
          <Link href="/forgot-password">Yeni bağlantı isteyin.</Link>
        </p>
      ) : (
        <form action="/api/auth/reset-password" method="post" className="desk-form">
          <input type="hidden" name="token" value={token} />
          <label>
            Yeni şifre
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
              required
            />
          </label>
          <label>
            Yeni şifre tekrar
            <input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
              required
            />
          </label>
          <small>
            En az 15 karakter kullanın. Kaydettiğinizde tüm eski oturumlar kapatılır.
          </small>
          <button className="admin-primary-btn">Şifreyi yenile</button>
        </form>
      )}
    </main>
  );
}
