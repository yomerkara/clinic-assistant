import { DateInput } from "@/components/DateInput";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { requireUser, toActor } from "@/lib/auth/session";
import { patientScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { formatPatientName } from "@/lib/patients/profile";
import styles from "./invoices.module.css";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(
    new Date(),
  );
  const requested = query.date ?? today;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(requested)
    ? new Date(`${requested}T00:00:00+03:00`)
    : new Date(NaN);
  const date = Number.isNaN(parsed.getTime()) ? today : requested;
  const start = new Date(`${date}T00:00:00+03:00`);
  const end = new Date(start.getTime() + 86400000);
  const requests = await prisma.actionRequest.findMany({
    where: {
      type: "INVOICE_REQUEST",
      OR: [
        { createdAt: { gte: start, lt: end } },
        { status: "PENDING", createdAt: { lt: start } },
      ],
      conversation: { patient: patientScope(toActor(user)) },
    },
    include: {
      appointment: { include: { therapist: true } },
      conversation: {
        include: {
          patient: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const names = new Set(requests.map((r) => r.conversation?.patientId));
  const statuses: Record<string, string> = {
    PENDING: "Bekliyor",
    APPROVED: "Talep onaylandı",
    REJECTED: "Kapatıldı",
    NEEDS_RECHECK: "Kontrol gerekli",
    AUTO_APPLIED: "Tamamlandı",
    EXPIRED: "Süresi doldu",
  };
  return (
    <AdminShell user={user} active="invoices">
      <div className="desk-page">
        <div className="admin-page-head">
          <div>
            <span className="admin-kicker">Günlük operasyon</span>
            <h1>Fatura</h1>
            <p>
              Seçilen gündeki fatura talepleri ile önceki günlerden bekleyen fatura
              talepleri. Talep onayı, fatura düzenlendiği anlamına gelmez.
            </p>
          </div>
        </div>
        <form method="get" className={styles.reportFilter}>
          <label className={styles.dateField}>
            <span>Rapor tarihi</span>
            <DateInput type="date" name="date" defaultValue={date} required />
          </label>
          <button type="submit" className={`toolbar-apply-btn ${styles.submit}`}>
            Listeyi göster
          </button>
        </form>
        <p>
          {names.size} müşteri fatura talep etti ·{" "}
          {requests.filter((r) => r.status === "PENDING").length} fatura talebi bekliyor
        </p>
        <div className="invoice-table-wrap">
          <table className="invoice-table">
            <thead>
              <tr>
                <th>Müşteri</th>
                <th>Talep</th>
                <th>Talep tarihi</th>
                <th>İlgili randevu</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/patients/${r.conversation!.patientId}`}>
                      {formatPatientName(r.conversation!.patient.displayName)}
                    </Link>
                    <br />
                    <small>
                      {r.conversation!.patient.phone.startsWith("demo:")
                        ? "Demo müşterisi"
                        : r.conversation!.patient.phone}
                    </small>
                  </td>
                  <td>Fatura</td>
                  <td>
                    {new Intl.DateTimeFormat("tr-TR", {
                      timeZone: "Europe/Istanbul",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(r.createdAt)}
                  </td>
                  <td>
                    {r.appointment
                      ? `${r.appointment.startAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })} · ${r.appointment.therapist.displayName}`
                      : "Randevu ilişkilendirilmemiş"}
                  </td>
                  <td>{statuses[r.status]}</td>
                  <td>
                    <Link href={`/queue/${r.id}`}>Talebi ve konuşmayı aç →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {requests.length === 0 && (
            <p className="admin-empty">Bu tarih için fatura talebi yok.</p>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
