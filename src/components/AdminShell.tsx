import { AdminBackdrop } from "./AdminBackdrop";
import { ProfileMenu } from "@/components/ProfileMenu";
import "./profile.css";
import { isSetupDeferred } from "@/lib/auth/session";
import Link from "@/components/NavigationLink";
import Image from "next/image";
import type { ReactNode } from "react";
import { roleLabel } from "@/lib/format";
import { AdminNavIcon } from "@/components/AdminIcons";

type Props = {
  user: { name: string; role: string };
  active:
    | "queue"
    | "conversations"
    | "patients"
    | "calendar"
    | "demo"
    | "usage"
    | "settings"
    | "invoices"
    | "requests";
  pendingCount?: number;
  children: ReactNode;
};

const nav = [
  { key: "queue", href: "/queue", label: "Onay kuyruğu", icon: "check" },
  { key: "conversations", href: "/conversations", label: "Konuşmalar", icon: "chat" },
  { key: "patients", href: "/patients", label: "Müşteriler", icon: "users" },
  { key: "calendar", href: "/calendar", label: "Takvim", icon: "calendar" },
  { key: "requests", href: "/requests", label: "Çalışan talepleri", icon: "check" },
  { key: "invoices", href: "/invoices", label: "Faturalar", icon: "chart" },
] as const;

export async function AdminShell({ user, active, pendingCount = 0, children }: Props) {
  const visibleNav = nav.filter((item) => {
    if (item.key === "calendar")
      return user.role === "ADMIN" || user.role === "THERAPIST";
    return true;
  });
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link
          className="admin-brand"
          href="/queue"
          aria-label="Santa Psikoloji ana sayfa"
        >
          <Image
            className="admin-brand__wordmark"
            src="/santa-wordmark-original.png"
            alt="Santa"
            width={164}
            height={69}
            priority
          />
          <span>Yönetim Paneli</span>
        </Link>
        <nav className="admin-nav" aria-label="Yönetim menüsü">
          <span className="admin-nav__label">Günlük işler</span>
          {visibleNav.map((item) => (
            <Link
              className={
                active === item.key ? "admin-nav__item is-active" : "admin-nav__item"
              }
              href={item.href}
              key={item.key}
            >
              <AdminNavIcon name={item.icon} />
              <span>{item.label}</span>
              {item.key === "queue" && pendingCount > 0 ? <em>{pendingCount}</em> : null}
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar__bottom">
          <div className="admin-health">
            <span />
            <div>
              <b>Sistem aktif</b>
              <small>Demo mesajlaşma bağlantısı</small>
            </div>
          </div>
          <ProfileMenu
            name={user.name}
            role={user.role}
            settingsActive={active === "settings" || active === "usage"}
          />
        </div>
      </aside>
      <main className="admin-main">
        <AdminBackdrop />
        <header className="admin-topbar">
          <div className="admin-topbar__workspace">
            <b>Santa Psikoloji</b>
            <span>Randevu ve İletişim Yönetimi</span>
          </div>
          <div className="admin-topbar__meta">
            {user.role === "ADMIN" && active !== "usage" ? (
              <Link className="admin-demo-shortcut" href="/demo">
                Asistanı incele <span>→</span>
              </Link>
            ) : null}
            <span className="admin-environment">
              <i /> {user.role === "ADMIN" ? "Demo ortamı" : "Sistem aktif"}
            </span>
            <span className="admin-topbar__user">
              {user.name} · {roleLabel(user.role)}
            </span>
          </div>
        </header>
        <header className="admin-mobile-header">
          <Link className="admin-brand admin-brand--mobile" href="/queue">
            <Image
              className="admin-brand__wordmark"
              src="/santa-wordmark-original.png"
              alt="Santa"
              width={134}
              height={56}
              priority
            />
          </Link>
          <Link
            className="mobile-profile-link"
            href="/settings/account"
            aria-label="Profil ve hesap ayarları"
          >
            Profilim
          </Link>
        </header>
        <nav className="admin-mobile-nav" aria-label="Mobil yönetim menüsü">
          <Link
            href="/settings"
            className={active === "settings" || active === "usage" ? "is-active" : ""}
          >
            <AdminNavIcon name="gear" />
            <span>Ayarlar</span>
          </Link>
          {visibleNav.map((item) => (
            <Link
              className={active === item.key ? "is-active" : ""}
              href={item.href}
              key={item.key}
            >
              <AdminNavIcon name={item.icon} />
              <span>{item.label}</span>
              {item.key === "queue" && pendingCount > 0 ? <em>{pendingCount}</em> : null}
            </Link>
          ))}
        </nav>
        {(await isSetupDeferred()) && (
          <div className="onboarding-error" role="status">
            Yerel önizleme: kurulum ertelendi.{" "}
            <Link className="admin-inline-action" href="/onboarding">
              Kuruluma dön
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
