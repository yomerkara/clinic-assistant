import { PatientDeleteForm } from "@/components/PatientDeleteForm";
import { formatPatientName } from "@/lib/patients/profile";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { requireUser, toActor } from "@/lib/auth/session";
import { patientScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { formatDateTime, maskPhone } from "@/lib/format";
import { PatientEditForm } from "@/components/PatientEditForm";
export const dynamic = "force-dynamic";
const status: Record<string, string> = {
  SCHEDULED: "Planlandı",
  CONFIRMED: "Onaylandı",
  CANCELLED: "İptal edildi",
  COMPLETED: "Tamamlandı",
  NO_SHOW_REVIEW: "Katılım kontrolü",
};
export default async function PatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; created?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { edit, created } = await searchParams;
  const patient = await prisma.patient.findFirst({
    where: { id, ...patientScope(toActor(user)) },
    include: {
      appointments: {
        where:
          user.role === "THERAPIST"
            ? { therapistId: user.therapistProfile?.id ?? "unassigned" }
            : {},
        include: { therapist: true },
        orderBy: { startAt: "desc" },
        take: 100,
      },
      conversations: { orderBy: { lastMessageAt: "desc" }, take: 30 },
    },
  });
  if (!patient) notFound();
  return (
    <AdminShell user={user} active="patients">
      <div className="desk-page">
        <Link className="desk-back" href="/patients">
          ← Müşterilere dön
        </Link>
        <div className="admin-page-head">
          <div>
            <span className="admin-kicker">Müşteri bilgileri</span>
            <h1>{formatPatientName(patient.displayName)}</h1>
            <p>{maskPhone(patient.phone)}</p>
          </div>
        </div>
        <section className="settings-section">
          <h2>Profil</h2>
          {created === "yes" && (
            <div className="admin-alert" role="status">
              Müşteri kaydı oluşturuldu.
            </div>
          )}
          {edit === "saved" && (
            <p role="status">
              Müşteri bilgileri kaydedildi. Sonraki işlemler güncel profili kullanacak.
            </p>
          )}
          {edit === "invalid" && (
            <p role="alert">
              Bilgiler kaydedilemedi. Ad-soyad, 0–120 arası yaş ve en fazla 500
              karakterlik uygunluk bilgisi girin.
            </p>
          )}
          {edit === "conflict" && (
            <p role="alert">
              Bu müşteri bilgileri siz düzenlerken değişti. Aşağıdaki güncel bilgileri
              kontrol edip tekrar kaydedin.
            </p>
          )}
          <PatientEditForm patient={patient} />
          <dl className="desk-profile">
            <div>
              <dt>Yaş</dt>
              <dd>{patient.age ?? "Belirtilmedi"}</dd>
            </div>
            <div>
              <dt>Terapi geçmişi</dt>
              <dd>
                {patient.hasTherapyHistory == null
                  ? "Belirtilmedi"
                  : patient.hasTherapyHistory
                    ? "Var"
                    : "Yok"}
              </dd>
            </div>
            <div>
              <dt>Uygun gün ve saatler</dt>
              <dd>{patient.availabilityNotes ?? "Belirtilmedi"}</dd>
            </div>
            <div>
              <dt>Alternatif günler</dt>
              <dd>
                {patient.alternativeDaysOkay == null
                  ? "Belirtilmedi"
                  : patient.alternativeDaysOkay
                    ? "Uygun"
                    : "Tercih edilmiyor"}
              </dd>
            </div>
            <div>
              <dt>İletişim izni</dt>
              <dd>
                {patient.consentStatus === "GRANTED"
                  ? "Verildi"
                  : patient.consentStatus === "WITHDRAWN"
                    ? "Geri çekildi"
                    : "Henüz kaydedilmedi"}
              </dd>
            </div>
          </dl>
        </section>
        <section className="settings-section">
          <h2>Randevular</h2>
          {patient.appointments.length ? (
            <div className="usage-table-wrap">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>Tarih · İstanbul saati</th>
                    <th>Terapist</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {patient.appointments.map((a) => (
                    <tr key={a.id}>
                      <td>{formatDateTime(a.startAt)}</td>
                      <td>{a.therapist.displayName}</td>
                      <td>{status[a.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Henüz randevu yok.</p>
          )}
        </section>
        <section className="settings-section">
          <h2>Konuşmalar</h2>
          {patient.conversations.map((c) => (
            <Link className="desk-record-link" key={c.id} href={`/conversations/${c.id}`}>
              <span>{formatDateTime(c.lastMessageAt)}</span>
              <span>{c.mode === "HUMAN" ? "Çalışan yönetiyor" : "Asistan aktif"} →</span>
            </Link>
          ))}
          {!patient.conversations.length ? <p>Henüz konuşma yok.</p> : null}
        </section>
        {user.role === "ADMIN" && (
          <PatientDeleteForm
            id={patient.id}
            name={formatPatientName(patient.displayName)}
          />
        )}
      </div>
    </AdminShell>
  );
}
