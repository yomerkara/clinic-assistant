import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; returnTo?: string }>;
}) {
  const { token, returnTo } = await searchParams;
  const user = await getCurrentUser();
  return (
    <main className="account-public">
      <h1>E-postanızı doğrulayın</h1>
      {!user ? (
        <p>
          Önce <Link href="/login">hesabınıza giriş yapın</Link>, ardından e-postanızdaki
          bağlantıyı tekrar açın.
        </p>
      ) : !token ? (
        <p>Geçerli bir doğrulama bağlantısı kullanın.</p>
      ) : (
        <form action="/api/auth/verify-email" method="post" className="desk-form">
          <p>
            {user.name}, bağlantının gönderildiği adresi hesabınızın kurtarma adresi
            olarak doğrulayın.
          </p>
          <input type="hidden" name="token" value={token} />
          <input
            type="hidden"
            name="returnTo"
            value={returnTo === "account" ? "account" : "onboarding"}
          />
          <button className="admin-primary-btn">E-posta adresimi doğrula</button>
        </form>
      )}
    </main>
  );
}
