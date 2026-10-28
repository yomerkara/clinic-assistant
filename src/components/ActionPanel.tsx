import { DateInput } from "@/components/DateInput";
import { formatPatientName, missingBookingProfile } from "@/lib/patients/profile";
import Link from "next/link";
import { getLiveSummary } from "@/lib/queue/live-summary";
import { PendingRequestRefresh } from "@/components/PendingRequestRefresh";
import { prisma } from "@/lib/prisma";
import { getActionRequestService } from "@/lib/queue/ports";
import { canReviewQueue, type Actor } from "@/lib/auth/rbac";
import {
  actionStatusLabel,
  actionTypeLabel,
  formatDateTime,
  formatAge,
} from "@/lib/format";
import { toIstanbulInput } from "@/lib/calendar/dates";

export async function ActionPanel({
  id,
  actor,
  returnTo,
}: {
  id: string;
  actor: Actor;
  returnTo?: string;
}) {
  const action = await getActionRequestService().getForActor(actor, id);
  const liveSummary = await getLiveSummary(prisma, action);
  const changes = action.proposedChanges as {
    patientId?: string;
    startAt?: string;
    endAt?: string;
    therapistId?: string;
    operationalSummary?: string;
  } | null;
  const therapist =
    action.appointment?.therapist ??
    (changes?.therapistId
      ? await prisma.therapistProfile.findUnique({ where: { id: changes.therapistId } })
      : null);
  const connected = therapist
    ? await prisma.calendarConnection.findUnique({
        where: { userId: therapist.userId },
        select: { id: true },
      })
    : null;
  const proposedPatient =
    changes?.patientId && action.conversation
      ? await prisma.patient.findFirst({
          where: { id: changes.patientId, phone: action.conversation.phone },
        })
      : null;
  const patient =
    action.appointment?.patient ?? proposedPatient ?? action.conversation?.patient;
  const editable =
    canReviewQueue(actor.role) && ["PENDING", "NEEDS_RECHECK"].includes(action.status);
  const pending = action.status === "PENDING";
  const informational = ["PRICE_REQUEST", "INVOICE_REQUEST"].includes(action.type);
  const target = `/api/queue/${id}`;
  return (
    <aside className="desk-decision" aria-label="İşlem detayı">
      <header>
        <span className={`badge ${pending ? "badge--wait" : "badge--ok"}`}>
          {actionStatusLabel(action.status)}
        </span>
        <small>{formatAge(action.createdAt)}</small>
      </header>
      <h2>{actionTypeLabel(action.type)}</h2>
      {action.cancellationDelivery && !action.cancellationDelivery.completedAt ? (
        <p role="status">
          <PendingRequestRefresh />
          İptal onaylandı.{" "}
          {action.cancellationDelivery.calendarSyncedAt
            ? "Takvim güncellendi; müşteri bildirimi tamamlanmayı bekliyor."
            : "Takvim güncellemesi bekliyor; bağlantı hatalarında otomatik tekrar denenecek."}
        </p>
      ) : null}
      {patient ? (
        <Link className="desk-customer-link" href={`/patients/${patient.id}`}>
          {formatPatientName(patient.displayName)} · Müşteri bilgileri ↗
        </Link>
      ) : null}
      <p className="desk-muted">{therapist?.displayName ?? "İlgili ekip"}</p>
      {patient &&
        ["NEW_BOOKING", "RESCHEDULE", "CONFIRM"].includes(action.type) &&
        missingBookingProfile(patient).length > 0 && (
          <p role="alert">
            Onay için eksik bilgiler: {missingBookingProfile(patient).join(", ")}. Müşteri
            sayfasından tamamlayın.
          </p>
        )}
      {!informational ? (
        <div className="desk-change">
          <div>
            <small>Mevcut randevu</small>
            <strong>
              {action.appointment
                ? formatDateTime(action.appointment.startAt)
                : "Henüz randevu yok"}
            </strong>
          </div>
          {changes?.startAt ? (
            <>
              <span className="desk-change-arrow" aria-hidden="true">
                ↓
              </span>
              <div className="is-proposed">
                <small>Önerilen randevu</small>
                <strong>{formatDateTime(new Date(changes.startAt))}</strong>
                <span>
                  {changes.endAt
                    ? `Bitiş: ${formatDateTime(new Date(changes.endAt))}`
                    : ""}
                </span>
              </div>
            </>
          ) : null}
          <p className="desk-muted">
            {connected
              ? "Takvim bağlı · Müsaitlik onay sırasında kontrol edilir."
              : "Takvim bağlı değil · Randevu işlemi için terapistin takvimini bağlaması gerekiyor."}
          </p>
          <small>İstanbul saati (UTC+3)</small>
        </div>
      ) : null}
      {changes?.startAt && !informational ? (
        <section className="desk-summary">
          <h3>İşlemin güncel özeti</h3>
          <p>{actionTypeLabel(action.type)} · {actionStatusLabel(action.status)}</p>
          <p>{patient ? formatPatientName(patient.displayName) : "Müşteri"} — {therapist?.displayName ?? "Uzman"}</p>
          <p>{formatDateTime(new Date(changes.startAt))}</p>
        </section>
      ) : null}
      {liveSummary ? (
        <section className="desk-summary">
          <PendingRequestRefresh />
          <h3>Konuşma geçmişi</h3>
          {liveSummary.initial ? (
            <p>
              <strong>Talebi oluşturan mesaj (alıntı):</strong> {liveSummary.initial}
            </p>
          ) : null}
          {liveSummary.updates.length ? <h4>Son gelişmeler</h4> : null}
          {liveSummary.updates.map((message) => (
            <div key={message.id}>
              {message.context ? (
                <p className="desk-muted">Asistan: “{message.context}”</p>
              ) : null}
              <p>
                <strong>{message.authorKind === "STAFF" ? "Çalışan" : "Müşteri"}:</strong>{" "}
                “{message.text}”{" "}
                <small className="desk-muted">
                  ({formatDateTime(message.createdAt)})
                </small>
              </p>
            </div>
          ))}
          <p>
            <strong>
              {informational
                ? "Ekibin işlemi tamamlaması bekleniyor."
                : action.type === "NEW_BOOKING"
                  ? "Randevu henüz kesinleşmedi. Güncel takvim müsaitliği kontrol edilerek talep onaylanmalı."
                  : "Bu talep henüz onaylanmadı. Müşterinin mesajı mevcut randevuyu tek başına değiştirmez."}
            </strong>
          </p>
          <small className="desk-muted">
            Son bilgi: {formatDateTime(liveSummary.updatedAt)}
          </small>
        </section>
      ) : changes?.operationalSummary && !changes?.startAt ? (
        <section className="desk-summary">
          <h3>Talep özeti</h3>
          <p>{changes.operationalSummary}</p>
        </section>
      ) : null}
      {editable && changes?.startAt ? (
        <details className="desk-edit">
          <summary>Saati düzenle</summary>
          <form action={target} method="post" className="desk-form">
            <input type="hidden" name="intent" value="edit" />
            <input type="hidden" name="returnTo" value={returnTo ?? ""} />
            <label>
              Yeni başlangıç
              <DateInput
                name="startAt"
                type="datetime-local"
                required
                defaultValue={toIstanbulInput(changes.startAt)}
              />
            </label>
            <label>
              Yeni bitiş
              <DateInput
                name="endAt"
                type="datetime-local"
                required
                defaultValue={toIstanbulInput(changes.endAt ?? changes.startAt)}
              />
            </label>
            <button className="admin-primary-btn">Saati kaydet</button>
          </form>
        </details>
      ) : null}
      {editable && pending ? (
        <div className="desk-decision-actions">
          <details className="desk-confirm">
            <summary className="admin-primary-btn">
              {informational ? "Talebi sonuçlandır" : "Değişikliği onayla"}
            </summary>
            <p>
              {informational
                ? "Talep sonuçlandırılacak ve müşteri bilgilendirilecek."
                : "Takvim yeniden kontrol edilerek randevu güncellenecek."}
            </p>
            <form action={target} method="post">
              <input type="hidden" name="intent" value="approve" />
              <input type="hidden" name="returnTo" value={returnTo ?? ""} />
              <button
                className="admin-primary-btn"
                disabled={
                  !informational &&
                  (!connected ||
                    Boolean(
                      patient &&
                      ["NEW_BOOKING", "RESCHEDULE", "CONFIRM"].includes(action.type) &&
                      missingBookingProfile(patient).length,
                    ))
                }
              >
                Evet, onayla
              </button>
            </form>
          </details>
          <details className="desk-confirm">
            <summary className="admin-secondary-btn">Talebi reddet</summary>
            <p>Talep reddedilecek. Mevcut randevu korunacak.</p>
            <form action={target} method="post">
              <input type="hidden" name="intent" value="reject" />
              <input type="hidden" name="returnTo" value={returnTo ?? ""} />
              <button className="admin-secondary-btn">Evet, reddet</button>
            </form>
          </details>
        </div>
      ) : null}
      {!canReviewQueue(actor.role) ? (
        <p className="desk-muted">
          Talebi yalnızca yönetici veya ilgili terapist onaylayabilir.
        </p>
      ) : null}
      {!pending && !editable ? (
        <p className="desk-muted">Bu talep sonuçlandırılmıştır.</p>
      ) : null}
    </aside>
  );
}
