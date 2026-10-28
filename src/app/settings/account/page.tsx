import { SettingsFrame } from "@/components/SettingsFrame";
import Link from "@/components/NavigationLink";
import { requireUser } from "@/lib/auth/session";
import { hasLocalEmailDeferral } from "@/lib/auth/local-email-deferral";
import { prisma } from "@/lib/prisma";
import { initials, roleLabel } from "@/lib/format";
import { AdminShell } from "@/components/AdminShell";
import { SetupForm } from "@/components/SetupForm";
import { MfaSetup } from "@/components/MfaSetup";
export const dynamic = "force-dynamic";
const tabs = [
  { id: "profile", name: "Profil bilgileri" },
  { id: "email", name: "E-posta" },
  { id: "password", name: "Şifre" },
  { id: "security", name: "Güvenlik" },
];
const notices: Record<string, string> = {
  profile_saved: "Profil bilgileriniz güncellendi.",
  password_saved: "Şifreniz güncellendi. Diğer oturumlarınız kapatıldı.",
  sent: "Doğrulama bağlantısı gönderildi. Yeni adres doğrulanana kadar mevcut adresiniz korunur.",
  verified: "E-posta adresiniz doğrulandı.",
};
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; security?: string; securityError?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const section = tabs.some((tab) => tab.id === query.section)
    ? query.section!
    : "profile";
  const [emailDeferred, pending] = await Promise.all([
    hasLocalEmailDeferral(user),
    prisma.securityToken.findFirst({
      where: { userId: user.id, kind: "verify", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { target: true },
    }),
  ]);
  return (
    <AdminShell user={user} active="settings">
      <SettingsFrame
        active={section === "password" || section === "security" ? "security" : "profile"}
        role={user.role}
      >
        <div className="account-page">
          <header className="settings-category-heading">
            <h2>
              {section === "password" || section === "security"
                ? "Güvenlik"
                : "Profil ve iletişim bilgileri"}
            </h2>
            <p>Size ait bilgiler ve hesabınızın güvenliği.</p>
          </header>
          <div className="account-layout">
            <aside className="account-identity">
              <span className="account-avatar">{initials(user.name)}</span>
              <h2>{user.name}</h2>
              <span className="account-role">{roleLabel(user.role)}</span>
              <dl>
                <div>
                  <dt>Kullanıcı adı</dt>
                  <dd>{user.username ?? "Henüz belirlenmedi"}</dd>
                </div>
                <div>
                  <dt>E-posta</dt>
                  <dd>{user.email}</dd>
                </div>
                <div>
                  <dt>Doğrulama</dt>
                  <dd>
                    {user.emailVerifiedAt
                      ? "Doğrulandı"
                      : emailDeferred
                        ? "Yerel geliştirmede ertelendi"
                        : "Doğrulama bekliyor"}
                  </dd>
                </div>
              </dl>
              <p>Bu alandaki değişiklikler yalnızca kendi hesabınıza uygulanır.</p>
            </aside>
            <div className="account-workspace">
              <nav className="account-tabs" aria-label="Hesap bölümleri">
                {tabs
                  .filter((tab) =>
                    ["password", "security"].includes(section)
                      ? ["password", "security"].includes(tab.id)
                      : ["profile", "email"].includes(tab.id),
                  )
                  .map((tab) => (
                    <Link
                      href={`/settings/account?section=${tab.id}`}
                      scroll={false}
                      key={tab.id}
                      aria-current={section === tab.id ? "page" : undefined}
                    >
                      {tab.name}
                    </Link>
                  ))}
              </nav>
              {query.securityError && (
                <div className="account-notice is-error" role="alert">
                  {query.securityError}
                </div>
              )}
              {query.security && notices[query.security] && (
                <div className="account-notice" role="status">
                  {notices[query.security]}
                </div>
              )}
              <section className="account-editor">
                {section === "profile" && (
                  <>
                    <span className="admin-kicker">01 / PROFİL</span>
                    <h2>Sizi nasıl tanıyalım?</h2>
                    <p>Panelde görünen adınızı ve iletişim numaranızı güncelleyin.</p>
                    <SetupForm action="/api/account" label="Profili güncelle">
                      <input type="hidden" name="intent" value="profile" />
                      <label htmlFor="profile-name">Ad soyad</label>
                      <input
                        id="profile-name"
                        name="name"
                        defaultValue={user.name}
                        autoComplete="name"
                        minLength={2}
                        maxLength={100}
                        required
                      />
                      <label htmlFor="profile-phone">Telefon numarası</label>
                      <input
                        id="profile-phone"
                        name="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        defaultValue={user.phone ?? ""}
                        placeholder="+90 532 123 45 67"
                        maxLength={40}
                        required
                      />
                      <small>
                        Telefon iletişim bilgisi olarak kaydedilir; SMS doğrulaması
                        yapılmaz.
                      </small>
                    </SetupForm>
                  </>
                )}
                {section === "email" && (
                  <>
                    <span className="admin-kicker">02 / E-POSTA</span>
                    <h2>Doğru adreste buluşalım.</h2>
                    <p>
                      Giriş ve hesap kurtarma için kullandığınız adres. Yeni adres,
                      bağlantıya tıklayıp doğruladığınızda geçerli olur.
                    </p>
                    {pending && (
                      <div className="account-notice" role="status">
                        <b>Doğrulama bekleniyor</b>
                        <p>
                          {pending.target} adresine gönderilen son bağlantıyı açın.
                          Bağlantı 30 dakika geçerlidir.
                        </p>
                      </div>
                    )}
                    <SetupForm action="/api/account" label="Doğrulama bağlantısı gönder">
                      <input type="hidden" name="intent" value="email" />
                      <label htmlFor="profile-email">E-posta adresi</label>
                      <input
                        id="profile-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        defaultValue={pending?.target ?? user.email}
                        maxLength={254}
                        required
                      />
                      <label htmlFor="email-password">Mevcut şifreniz</label>
                      <input
                        id="email-password"
                        name="currentPassword"
                        type="password"
                        autoComplete="current-password"
                        maxLength={128}
                        required
                      />
                      <small>Eski adresiniz doğrulama tamamlanana kadar değişmez.</small>
                    </SetupForm>
                  </>
                )}
                {section === "password" && (
                  <>
                    <span className="admin-kicker">03 / ŞİFRE</span>
                    <h2>Yalnızca sizin bildiğiniz.</h2>
                    <p>
                      Uzun ve başka bir yerde kullanmadığınız bir şifre seçin.
                      Değişiklikten sonra diğer oturumlarınız kapatılır.
                    </p>
                    <SetupForm action="/api/account" label="Şifremi güncelle">
                      <input type="hidden" name="intent" value="password" />
                      <label htmlFor="password-current">Mevcut şifreniz</label>
                      <input
                        id="password-current"
                        name="currentPassword"
                        type="password"
                        autoComplete="current-password"
                        maxLength={128}
                        required
                      />
                      <label htmlFor="password-new">Yeni şifre</label>
                      <input
                        id="password-new"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        minLength={15}
                        maxLength={128}
                        required
                      />
                      <label htmlFor="password-confirm">Yeni şifre tekrar</label>
                      <input
                        id="password-confirm"
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        minLength={15}
                        maxLength={128}
                        required
                      />
                      <small>
                        15–128 karakter. Yeni şifreniz mevcut şifrenizden farklı olmalı.
                      </small>
                    </SetupForm>
                  </>
                )}
                {section === "security" && (
                  <>
                    <span className="admin-kicker">04 / GÜVENLİK</span>
                    <h2>Hesabınıza bir katman daha.</h2>
                    <MfaSetup user={user} emailDeferred={emailDeferred} />
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
      </SettingsFrame>
    </AdminShell>
  );
}
