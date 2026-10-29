import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { canManageUsageBudget } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/session";
import { loadClinicStatistics, type Change } from "@/lib/statistics/service";
import { loadClinicControls } from "@/lib/settings/service";

export const dynamic = "force-dynamic";

function ChangeBadge({ change }: { change: Change }) {
  const className =
    change.direction === "up"
      ? "stat-change stat-change--up"
      : change.direction === "down"
        ? "stat-change stat-change--down"
        : "stat-change";
  const arrow =
    change.direction === "up" ? "↑" : change.direction === "down" ? "↓" : "→";
  return (
    <span className={className}>
      <span aria-hidden="true">{arrow}</span> {change.label}
    </span>
  );
}

export default async function StatisticsPage() {
  const user = await requireUser();
  // Clinic-wide figures are a manager view, like the usage budget.
  if (!canManageUsageBudget(user.role)) {
    return (
      <AdminShell user={user} active="statistics">
        <div className="desk-page">
          <div className="errorbox">
            <h3>Bu ekrana erişemezsiniz</h3>
            <p>
              Klinik istatistikleri yalnızca klinik yöneticisine açıktır. Kendi
              randevularınızı <Link href="/calendar">Takvim</Link> ekranından
              görebilirsiniz.
            </p>
          </div>
        </div>
      </AdminShell>
    );
  }
  const { flags } = await loadClinicControls();
  if (!flags["screen.statistics"]) {
    return (
      <AdminShell user={user} active="statistics">
        <div className="desk-page">
          <div className="errorbox">
            <h3>İstatistik ekranı kapalı</h3>
            <p>
              Bu ekran kontrol ekranından kapatılmış. Açmak için{" "}
              <Link href="/control">Kontrol ekranı</Link> üzerinden
              &quot;İstatistik ekranı&quot; ayarını açabilirsiniz.
            </p>
          </div>
        </div>
      </AdminShell>
    );
  }
  const stats = await loadClinicStatistics();

  return (
    <AdminShell user={user} active="statistics">
      <div className="desk-page">
        <div className="admin-page-head">
          <div>
            <span className="admin-kicker">{stats.current.label}</span>
            <h1>İstatistik</h1>
            <p>
              Bu ayın sayıları ve {stats.previous.label} ayına göre değişim.
              Seanslar yapıldığı güne, talepler oluşturulduğu güne göre sayılır;
              tüm tarihler klinik saatine göredir.
            </p>
          </div>
        </div>

        {stats.empty ? (
          <div className="admin-empty">
            <h3>Henüz sayı yok</h3>
            <p>
              Bu ay ve geçen ay için kayıt bulunmuyor. İlk randevular ve
              konuşmalar oluştukça bu ekran dolacak.
            </p>
          </div>
        ) : null}

        <section className="admin-panel">
          <div className="admin-panel__head">
            <div>
              <h2>Klinik toplamı</h2>
              <p>{stats.current.label} · geçen ay ile karşılaştırmalı</p>
            </div>
          </div>
          <div className="stat-grid">
            {stats.metrics.map((metric) => (
              <div className="stat-tile" key={metric.key}>
                <span className="stat-tile__label">{metric.label}</span>
                <b className="stat-tile__value">{metric.current}</b>
                <ChangeBadge change={metric.change} />
                <small>{metric.hint}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel__head">
            <div>
              <h2>Terapist kırılımı</h2>
              <p>
                Gerçekleşen seans sayısı ve geçen aya göre değişim. Yaklaşan
                randevular bugünden sonrasını kapsar.
              </p>
            </div>
          </div>
          {stats.therapists.length === 0 ? (
            <div className="admin-empty">
              <h3>Aktif terapist yok</h3>
              <p>
                Kırılım için en az bir aktif terapist profili gerekiyor.
                Terapistleri <Link href="/settings?section=team">Ayarlar</Link>{" "}
                ekranından yönetebilirsiniz.
              </p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Terapist</th>
                    <th>Gerçekleşen seans</th>
                    <th>Geçen aya göre</th>
                    <th>İptal</th>
                    <th>Yaklaşan</th>
                    <th>Bu ay gelen yeni müşteri</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.therapists.map((row) => (
                    <tr key={row.therapistId}>
                      <td>{row.displayName}</td>
                      <td>{row.held}</td>
                      <td>
                        <ChangeBadge change={row.change} />
                      </td>
                      <td>{row.cancelled}</td>
                      <td>{row.upcoming}</td>
                      <td>{row.newPatients}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
