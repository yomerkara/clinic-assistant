import { PatientCreate } from "@/components/PatientCreate";
import { formatPatientName } from "@/lib/patients/profile";
import { SearchIcon } from "@/components/AdminIcons";
import { PatientImport } from "@/components/PatientImport";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { requireUser, toActor } from "@/lib/auth/session";
import { patientScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { initials, maskPhone } from "@/lib/format";
export const dynamic = "force-dynamic";
export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; deleted?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const q = (query.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.min(10000, Number(query.page) || 1));
  const where = {
    AND: [
      patientScope(toActor(user)),
      q
        ? {
            OR: [
              { displayName: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
            ],
          }
        : {},
    ],
  };
  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      orderBy: { displayName: "asc" },
      take: 30,
      skip: (page - 1) * 30,
    }),
    prisma.patient.count({ where }),
  ]);
  return (
    <AdminShell user={user} active="patients">
      <div className="desk-page">
        {query.deleted === "yes" && (
          <p className="admin-alert" role="status">
            Müşteri kaydı silindi.
          </p>
        )}
        <div className="admin-page-head patient-page-head">
          <div>
            <span className="admin-kicker">Müşteri kayıtları</span>
            <div className="patient-title-row">
              <h1>Müşteriler</h1>
              <span className="patient-count">{total} müşteri</span>
            </div>
            <p>İletişim bilgileri, randevular ve konuşma geçmişi.</p>
          </div>
          {user.role === "ADMIN" && (
            <div className="patient-header-actions">
              <PatientCreate />
              <PatientImport />
            </div>
          )}
        </div>
        <form className="desk-search" method="get">
          <label className="admin-search">
            <input
              name="q"
              defaultValue={q}
              placeholder="Ad veya telefon ara"
              aria-label="Müşteri ara"
            />
          </label>
          <button
            className="admin-secondary-btn patient-search-button"
            aria-label="Müşteri ara"
            title="Ara"
          >
            <SearchIcon />
          </button>
        </form>
        <div className="conversation-list">
          {patients.map((p) => (
            <Link className="conversation-row" href={`/patients/${p.id}`} key={p.id}>
              <span className="conversation-avatar">
                {initials(formatPatientName(p.displayName))}
              </span>
              <span className="conversation-copy">
                <b>{formatPatientName(p.displayName)}</b>
                <small>{maskPhone(p.phone)}</small>
              </span>
              <span className="conversation-arrow">→</span>
            </Link>
          ))}
          {!patients.length ? (
            <div className="admin-empty">Eşleşen müşteri bulunamadı.</div>
          ) : null}
        </div>
        <nav className="desk-pagination" aria-label="Müşteri sayfaları">
          {page > 1 ? (
            <Link href={`/patients?q=${encodeURIComponent(q)}&page=${page - 1}`}>
              ← Önceki
            </Link>
          ) : null}
          <span>Sayfa {page}</span>
          {page * 30 < total ? (
            <Link href={`/patients?q=${encodeURIComponent(q)}&page=${page + 1}`}>
              Sonraki →
            </Link>
          ) : null}
        </nav>
      </div>
    </AdminShell>
  );
}
