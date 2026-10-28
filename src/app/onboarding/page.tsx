import { SetupEmailForm } from "@/components/SetupEmailForm";
import {
  canDeferAdminEmail,
  hasLocalEmailDeferral,
} from "@/lib/auth/local-email-deferral";
import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { roleLabel } from "@/lib/format";
import { canDeferSetup } from "@/lib/auth/setup-deferral";
import { setupSteps, visibleSetupStep, firstSetupStep } from "@/lib/auth/onboarding";
import { SetupForm } from "@/components/SetupForm";
import "./setup.css";

export const dynamic = "force-dynamic";
const headings = [
  [
    "Önce, size ulaşabilelim.",
    "Hesap kurtarma ve güvenlik bildirimleri için kullandığınız e-posta adresini doğrulayın.",
  ],
  [
    "Bir iletişim numarası ekleyin.",
    "Ekibin size ulaşabileceği telefon numarasını kaydedin.",
  ],
  [
    "Takviminizle aynı ritimde.",
    "Randevu akışını Google Calendar hesabınızla bir araya getirin.",
  ],
];
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{
    step?: string;
    calendar?: string;
    error?: string;
    security?: string;
    securityError?: string;
  }>;
}) {
  const user = await requireUser({ allowIncompleteOnboarding: true });
  const params = await searchParams;
  const emailDeferred = await hasLocalEmailDeferral(user);
  const connection = await prisma.calendarConnection.findUnique({
    where: { userId: user.id },
    select: { calendarId: true },
  });
  const pendingEmail = !user.emailVerifiedAt
    ? await prisma.securityToken.findFirst({
        where: { userId: user.id, kind: "verify", expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: { target: true },
      })
    : null;
  const current = visibleSetupStep(user, Boolean(connection), params.step, emailDeferred);
  const first = firstSetupStep(user, Boolean(connection), emailDeferred);
  const error =
    params.securityError ??
    (params.error === "google_config"
      ? "Google bağlantısı henüz hazır değil. Kurulum için yöneticinize başvurun."
      : params.error === "google"
        ? "Google bağlantısı tamamlanamadı. Tekrar deneyebilirsiniz."
        : params.error === "calendar_required"
          ? "Devam etmek için kendi Google takviminizi bağlayın."
          : null);
  return (
    <main className="setup-shell">
      <aside className="setup-aside">
        <Image
          src="/santa-wordmark-original.png"
          alt="Santa"
          width={148}
          height={62}
          priority
          className="setup-logo"
        />
        <div className="setup-aside-intro">
          <span className="setup-eyebrow">SİZE AİT BİR ÇALIŞMA ALANI</span>
          <h1>
            İyi bir başlangıç,
            <br />
            <em>adım adım.</em>
          </h1>
          <p>Birkaç küçük ayarla hesabınızı günlük çalışma akışınıza hazırlayalım.</p>
        </div>
        <ol className="setup-step-list" aria-label="Kurulum adımları">
          {setupSteps.map((name, i) => (
            <li
              key={name}
              data-active={i === current}
              data-done={i < first}
              aria-current={i === current ? "step" : undefined}
            >
              <span className="setup-step-index" aria-hidden="true">
                {i < first ? "✓" : `0${i + 1}`}
              </span>
              {i <= first ? (
                <Link href={`/onboarding?step=${i}`}>{name}</Link>
              ) : (
                <span>{name}</span>
              )}
              <small>
                {i === current
                  ? "Şimdi"
                  : i === 0 && emailDeferred && !user.emailVerifiedAt
                    ? "Ertelendi"
                    : i < first
                      ? "Tamamlandı"
                      : "Sırada"}
              </small>
            </li>
          ))}
        </ol>
        <div className="setup-person">
          <span>{user.name.slice(0, 1).toLocaleUpperCase("tr-TR")}</span>
          <div>
            <b>{user.name}</b>
            <small>{roleLabel(user.role)}</small>
          </div>
          <form action="/api/auth/logout" method="post">
            <button type="submit" aria-label="Oturumu kapat">
              Çıkış
            </button>
          </form>
        </div>
      </aside>
      <section className="setup-main" aria-labelledby="setup-title">
        <div className="setup-topline">
          <span>HESAP KURULUMU</span>
          <span>
            ADIM {current + 1} / {setupSteps.length}
          </span>
        </div>
        <div
          className="setup-progress-track"
          role="progressbar"
          aria-label="Kurulum ilerlemesi"
          aria-valuemin={0}
          aria-valuemax={setupSteps.length}
          aria-valuenow={current}
        >
          <span style={{ width: `${(current / setupSteps.length) * 100}%` }} />
        </div>
        <div className="setup-stage" key={current}>
          <header className="setup-heading">
            <span className="setup-stage-number">0{current + 1}</span>
            <h2 id="setup-title">{headings[current][0]}</h2>
            <p>{headings[current][1]}</p>
          </header>
          {emailDeferred && !user.emailVerifiedAt && (
            <div className="setup-notice" role="status">
              Yerel admin hesabında e-posta adımı ertelendi. Adres doğrulanmış değildir;
              diğer kurulum adımları devam eder.
            </div>
          )}
          {error && (
            <div className="setup-notice is-error" role="alert">
              {error}
            </div>
          )}
          {params.security === "verified" && (
            <div className="setup-notice" role="status">
              E-posta adresiniz doğrulandı. Bir sonraki adıma hazırsınız.
            </div>
          )}
          {current === 0 &&
            (user.emailVerifiedAt || emailDeferred ? (
              <>
                <div className="setup-confirmed">
                  <span>✓</span>
                  <b>
                    {emailDeferred && !user.emailVerifiedAt
                      ? "E-posta adımı yerel geliştirme için ertelendi"
                      : "E-posta doğrulandı"}
                  </b>
                  <p>{user.email}</p>
                </div>
                <Link className="setup-primary" href="/onboarding">
                  Devam et →
                </Link>
              </>
            ) : (
              <>
                {pendingEmail && (
                  <div className="setup-notice" role="status">
                    <b>Gelen kutunuzu kontrol edin.</b>
                    <p>
                      {pendingEmail.target} adresine gönderilen bağlantıyı bu bilgisayarda
                      açın. Bağlantı 30 dakika geçerli. Göremiyorsanız spam klasörünü de
                      kontrol edin.
                    </p>
                    <Link href="/onboarding">Doğrulamayı tamamladım, kontrol et →</Link>
                  </div>
                )}
                {canDeferAdminEmail(user) && (
                  <div className="setup-notice">
                    Yalnızca yerel admin için: aşağıya <strong>admin@santa.local</strong>{" "}
                    yazıp devam ederek e-posta adımını erteleyebilirsiniz. Mail
                    gönderilmez ve adres doğrulanmış sayılmaz.
                  </div>
                )}
                <SetupEmailForm
                  initialEmail={
                    pendingEmail?.target ??
                    (user.email.endsWith(".local") ? "" : user.email)
                  }
                  pending={Boolean(pendingEmail)}
                  allowLocalAdmin={canDeferAdminEmail(user)}
                />
              </>
            ))}
          {current === 1 && (
            <SetupForm forward>
              <input type="hidden" name="intent" value="phone" />
              <label htmlFor="setup-phone">Telefon numaranız</label>
              <input
                id="setup-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="+90 532 123 45 67"
                defaultValue={user.phone ?? ""}
                maxLength={40}
                required
              />
              <p className="setup-field-note">
                Türkiye için 05… ile başlayabilirsiniz. Diğer ülkeler için ülke kodunu
                ekleyin. Bu adım SMS doğrulaması yapmaz.
              </p>
            </SetupForm>
          )}
          {current === 2 && (
            <>
              <div className="setup-google">
                <Image src="/google-g.svg" alt="" width={32} height={32} />
                <div>
                  <b>Google Calendar</b>
                  <p>
                    {connection
                      ? "Takvim bağlantınız hazır."
                      : user.role === "INTERN"
                        ? "Rolünüz için kişisel takvim bağlantısı gerekmiyor."
                        : "Onaylanan randevular, ilgili terapistin takvimine işlenir."}
                  </p>
                </div>
              </div>
              <p className="setup-field-note">
                {user.role === "THERAPIST"
                  ? "Kendi çalışma takviminizi bağlayın. Google ekranında takvim izinlerini onayladıktan sonra buraya döneceksiniz."
                  : "Yönetici için kişisel takvim bağlantısı isteğe bağlıdır. Her terapist kendi takvimini bağlar."}
              </p>
              {!connection && user.role !== "INTERN" && (
                <a
                  className="setup-primary"
                  href="/api/calendar/google?returnTo=onboarding"
                >
                  Google ile bağlan <span aria-hidden="true">↗</span>
                </a>
              )}
              {(connection || user.role !== "THERAPIST") && (
                <SetupForm
                  action="/api/onboarding/complete"
                  label="Kurulumu tamamla"
                  forward
                >
                  <input type="hidden" name="intent" value="complete" />
                </SetupForm>
              )}
            </>
          )}
        </div>
        <footer className="setup-footer">
          <span>
            İlerlemeniz kaydedilir. Daha sonra kaldığınız yerden devam edebilirsiniz.
          </span>
          {canDeferSetup() && (
            <form action="/api/onboarding/complete" method="post">
              <input type="hidden" name="intent" value="skip" />
              <button type="submit" className="setup-text-button">
                Yerel önizleme için ertele
              </button>
            </form>
          )}
        </footer>
      </section>
    </main>
  );
}
