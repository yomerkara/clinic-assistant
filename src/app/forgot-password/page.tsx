import Link from "next/link";
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;
  return (
    <main className="account-public">
      <Link href="/login">← Girişe dön</Link>
      <h1>Şifremi unuttum</h1>
      <p>Hesabınızda doğruladığınız e-posta adresini yazın.</p>
      {sent ? (
        <p className="admin-alert" role="status">
          Bu adresle eşleşen doğrulanmış bir hesap varsa sıfırlama bağlantısı
          gönderilecektir. E-postanızı ve spam klasörünü kontrol edin.
        </p>
      ) : null}
      <form className="desk-form" action="/api/auth/forgot-password" method="post">
        <label>
          E-posta
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            maxLength={254}
          />
        </label>
        <button className="admin-primary-btn">Sıfırlama bağlantısı gönder</button>
      </form>
      <p className="desk-muted">
        E-posta adresinizi henüz doğrulamadıysanız klinik yöneticinizden hesap kurtarma
        desteği alın.
      </p>
    </main>
  );
}
