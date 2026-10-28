import { redirect } from "next/navigation";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (currentUser) redirect(currentUser.onboardingCompletedAt ? "/queue" : "/onboarding");
  const { error, reset } = await searchParams;
  const errorText =
    error === "rate"
      ? "Çok fazla giriş denemesi. 15 dakika sonra yeniden deneyin."
      : error === "1"
        ? "Bilgileri kontrol edip tekrar deneyin."
        : error === "google_config"
          ? "Google girişi henüz yapılandırılmadı."
          : error === "google"
            ? "Google ile giriş tamamlanamadı."
            : error === "unknown_user"
              ? "Bu Google hesabı klinik ekibinde kayıtlı değil."
              : null;

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <Image
          className="auth-visual__wordmark"
          src="/santa-wordmark-original.png"
          alt="Santa"
          width={190}
          height={80}
          priority
        />
        <div className="auth-motto" aria-label="Santa Psikoloji yaklaşımı">
          <span>Zor zamanlarda anlayışla yanınızdayız.</span>
          <span>Zor zamanlarda şefkatle yanınızdayız.</span>
          <span>Zor zamanlarda güvenle yanınızdayız.</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel__inner">
          <div className="auth-heading">
            <h2>Yönetim Paneli</h2>
            <p>Yalnızca klinik ekibi giriş yapabilir.</p>
          </div>
          {errorText ? (
            <div className="auth-error" role="alert">
              {errorText}
            </div>
          ) : null}
          {reset ? (
            <p role="status">Şifreniz yenilendi. Yeni şifrenizle giriş yapabilirsiniz.</p>
          ) : null}
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
