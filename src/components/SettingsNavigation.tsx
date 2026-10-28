import Link from "@/components/NavigationLink";
import "./settings-navigation.css";

export function SettingsNavigation({ active, role }: { active: string; role: string }) {
  const items = [
    { id: "calendar", label: "Takvim bağlantıları", href: "/settings" },
    { id: "profile", label: "Profil", href: "/settings/account?section=profile" },
    { id: "security", label: "Güvenlik", href: "/settings/account?section=security" },
    ...(role === "ADMIN"
      ? [
          {
            id: "knowledge",
            label: "Bilgi havuzu kaynakları",
            href: "/settings?section=knowledge",
          },
          { id: "team", label: "Ekip ve roller", href: "/settings?section=team" },
        ]
      : []),
    ...(role !== "INTERN"
      ? [{ id: "cost", label: "Kullanım ve maliyet", href: "/usage" }]
      : []),
  ];
  return (
    <nav className="settings-navigation" aria-label="Ayar bölümleri">
      {[
        { name: "Hesabım", ids: ["profile", "security"] },
        { name: "Çalışma alanı", ids: ["calendar", "knowledge", "team", "cost"] },
      ].map((group) => (
        <div className="settings-navigation-group" key={group.name}>
          <span>{group.name}</span>
          <div>
            {items
              .filter((item) => group.ids.includes(item.id))
              .sort((a, b) => group.ids.indexOf(a.id) - group.ids.indexOf(b.id))
              .map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  scroll={false}
                  aria-current={active === item.id ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
