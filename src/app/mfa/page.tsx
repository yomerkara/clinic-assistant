import Link from "next/link";
export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="account-public">
      <h1>İki aşamalı doğrulama</h1>
      <p>Doğrulayıcı uygulamanızdaki 6 haneli kodu veya bir kurtarma kodunu girin.</p>
      {error ? (
        <p role="alert">
          Kod hatalı, kullanılmış veya giriş isteğinin süresi dolmuş. Yeniden deneyin ya
          da girişe dönün.
        </p>
      ) : null}
      <form className="desk-form" action="/api/auth/mfa/verify" method="post">
        <label>
          Doğrulama / kurtarma kodu
          <input
            name="code"
            autoComplete="one-time-code"
            maxLength={27}
            required
            autoFocus
          />
        </label>
        <button className="admin-primary-btn">Doğrula</button>
      </form>
      <p>
        <Link href="/login">Girişe dön</Link>
      </p>
    </main>
  );
}
