"use client";
import Link from "@/components/NavigationLink";
import { Gear } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { initials, roleLabel } from "@/lib/format";
export function ProfileMenu({
  name,
  role,
  settingsActive = false,
}: {
  name: string;
  role: string;
  settingsActive?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node))
        ref.current?.removeAttribute("open");
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <div className="profile-identity">
      <details className="profile-menu" ref={ref}>
        <summary aria-label="Profil ve hesap menüsü" title="Profil ve hesap menüsü">
          <span className="profile-avatar">{initials(name)}</span>
        </summary>
        <nav
          className="profile-menu-panel"
          aria-label="Profil işlemleri"
          onClick={() => ref.current?.removeAttribute("open")}
        >
          <span className="profile-menu-caption">HESABINIZ</span>
          <Link href="/settings/account?section=profile">Profilim</Link>
          <Link href="/settings?guide=welcome">Yardım ve rehber</Link>
          <form action="/api/auth/logout" method="post">
            <button type="submit">Çıkış yap</button>
          </form>
        </nav>
      </details>
      <span className="profile-menu-person">
        <b title={name}>{name}</b>
        <small>{roleLabel(role)}</small>
      </span>
      <Link
        className="profile-settings-link"
        href="/settings"
        aria-label="Ayarlar"
        title="Ayarlar"
        aria-current={settingsActive ? "page" : undefined}
      >
        <Gear size={22} weight="regular" aria-hidden="true" />
      </Link>
    </div>
  );
}
