import Link from "next/link";
import { canUseSimulator } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/session";
import { initials, roleLabel } from "@/lib/format";
import { loadSimulationThread } from "@/lib/simulator/service";
import { SimulatorWorkbench } from "./workbench";

export const dynamic = "force-dynamic";

export default async function SimulatorPage() {
  const user = await requireUser();
  if (!canUseSimulator(user.role)) {
    return (
      <div className="app">
        <header className="topbar">
          <Link className="iconbtn" href="/queue" aria-label="Geri dön">
            ←
          </Link>
          <h1>Asistan Test Ortamı</h1>
        </header>
        <main>
          <div className="errorbox">
            <h3>Bu ekrana erişemezsiniz</h3>
            <p>Asistan test ortamı yalnızca klinik yöneticisine açıktır.</p>
          </div>
        </main>
      </div>
    );
  }
  const thread = await loadSimulationThread(user.id);
  return (
    <div className="app app--sim">
      <header className="topbar">
        <Link className="iconbtn" href="/settings" aria-label="Geri dön">
          <svg className="ic ic-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="grow">
          <div className="titlerow">
            <h1>Asistan Test Ortamı</h1>
            <span className="badge badge--sim">SİMÜLASYON</span>
          </div>
          <p className="meta" style={{ margin: "2px 0 0" }}>
            Ayarlar · yalnızca klinik yöneticisi
          </p>
        </div>
        <div className="role">
          <span className="initials" aria-hidden="true">
            {initials(user.name)}
          </span>
          <span className="who">
            <b>{user.name}</b>
            {roleLabel(user.role)}
          </span>
        </div>
      </header>
      <SimulatorWorkbench initial={thread} />
    </div>
  );
}
