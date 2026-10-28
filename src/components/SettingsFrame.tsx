import type { ReactNode } from "react";
import { SettingsNavigation } from "./SettingsNavigation";
export function SettingsFrame({
  active,
  role,
  children,
}: {
  active: string;
  role: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-workspace">
      <header className="settings-workspace-heading">
        <span className="admin-kicker">Çalışma alanınız</span>
        <h1>Ayarlar</h1>
        <p>Hesabınızı ve kliniğinizin çalışma tercihlerini yönetin.</p>
      </header>
      <div className="settings-workspace-grid">
        <SettingsNavigation active={active} role={role} />
        <div className="settings-workspace-content">{children}</div>
      </div>
    </div>
  );
}
