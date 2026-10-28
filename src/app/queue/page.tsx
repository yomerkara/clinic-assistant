import { patientScope } from "@/lib/auth/scope";
import { ApplicationGuide } from "@/components/ApplicationGuide";
import { formatPatientName } from "@/lib/patients/profile";
import { ConversationIcon } from "@/components/AdminIcons";
import Link from "@/components/NavigationLink";
import { prisma } from "@/lib/prisma";
import { canReviewQueue } from "@/lib/auth/rbac";
import { requireUser, toActor } from "@/lib/auth/session";
import { AdminShell } from "@/components/AdminShell";
import {
  actionStatusLabel,
  actionTypeLabel,
  formatAge,
  formatDateTime,
  formatRemaining,
} from "@/lib/format";
import { getActionRequestService } from "@/lib/queue/ports";
import type { ActionType, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const filters: Array<{ key: string; type?: ActionType; label: string }> = [
  { key: "all", label: "Tümü" },
  { key: "CANCEL", type: "CANCEL", label: "İptal" },
  { key: "RESCHEDULE", type: "RESCHEDULE", label: "Saat değişikliği" },
  { key: "NEW_BOOKING", type: "NEW_BOOKING", label: "Yeni randevu" },
  { key: "THERAPIST_CHANGE", type: "THERAPIST_CHANGE", label: "Terapist değişikliği" },
  { key: "PRICE_REQUEST", type: "PRICE_REQUEST", label: "Fiyat" },
  { key: "INVOICE_REQUEST", type: "INVOICE_REQUEST", label: "Fatura" },
];

type Proposed = { patientId?: string; startAt?: string; operationalSummary?: string };

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string; guide?: string }>;
}) {
  const user = await requireUser();
  const actor = toActor(user);
  const { type, page: pageParam } = await searchParams;
  const now = new Date();
  const service = getActionRequestService();
  const [items, therapistCount, conversationCount] = await Promise.all([
    service.listForActor(actor),
    prisma.therapistProfile.count({
      where: { active: true, user: { active: true, role: "THERAPIST" } },
    }),
    prisma.conversation.count({
      where: {
        OR: [
          { patient: { appointments: { none: {} } } },
          { patient: { appointments: { some: { therapist: { active: true } } } } },
        ],
      },
    }),
  ]);
  const notices = items.filter((item) => item.status === "AUTO_APPLIED");
  const pending = items.filter((item) => item.status !== "AUTO_APPLIED");
  const filtered =
    type && type !== "all" ? pending.filter((item) => item.type === type) : pending;
  const pageSize = 12;
  const requestedPage = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(requestedPage, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const proposedPatientIds = visible.flatMap((item) => {
    const id = (item.proposedChanges as Proposed | null)?.patientId;
    return id ? [id] : [];
  });
  const proposedPatients = await prisma.patient.findMany({
    where: { id: { in: proposedPatientIds } },
  });
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (type && type !== "all") query.set("type", type);
    if (page > 1) query.set("page", String(page));
    const suffix = query.toString();
    return suffix ? `/queue?${suffix}` : "/queue";
  };
  const counts = Object.fromEntries(
    filters.map((filter) => [
      filter.key,
      filter.type
        ? pending.filter((item) => item.type === filter.type).length
        : pending.length,
    ]),
  );
  const todayLabel = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(now);

  const internNotices =
    canReviewQueue(user.role) || user.role === "THERAPIST"
      ? await prisma.notification.findMany({
          where: {
            recipientId: user.id,
            type: { in: ["same_day_cancel", "WAITING_CONVERSATION"] },
          },
          orderBy: { createdAt: "desc" },
          take: 12,
        })
      : notices.length
        ? []
        : [];
  const noticeConversations = await prisma.conversation.findMany({
    where: {
      id: { in: internNotices.flatMap(note => {
        const value = (note.payload as Prisma.JsonObject).conversationId;
        return typeof value === "string" ? [value] : [];
      }) },
      patient: patientScope(toActor(user)),
    },
    select: { id: true, mode: true, handoffReason: true, patient: { select: { displayName: true } }, assignedTo: { select: { name: true } } },
  });
  const seenNotices = new Set<string>();
  const visibleNotices = internNotices.filter((note) => {
    const payload = note.payload as Prisma.JsonObject;
    if (note.type === "WAITING_CONVERSATION" && !noticeConversations.some(c => c.id === payload.conversationId && c.mode === "HUMAN")) return false;
    const key = String(payload.conversationId ?? payload.summary ?? note.type);
    if (seenNotices.has(key)) return false;
    seenNotices.add(key);
    return true;
  });

  return (
    <AdminShell user={user} active="queue" pendingCount={pending.length}>
      {user.onboardingCompletedAt && <ApplicationGuide role={user.role} autoOpen once />}
      <div className="admin-page-head">
        <div>
          <span className="admin-kicker">{todayLabel}</span>
          <h1>Onay kuyruğu</h1>
          <p>
            Hasta taleplerini kontrol edin, gerekiyorsa düzeltin ve tek adımda
            sonuçlandırın.
          </p>
        </div>
        <div className="admin-head-actions">
          <Link className="toolbar-apply-btn" href="/conversations">
            <ConversationIcon /> Konuşmaları aç
          </Link>
        </div>
      </div>
      <div className="admin-guide" role="note">
        <span className="admin-guide__icon">i</span>
        <p>
          <b>
            {canReviewQueue(user.role)
              ? "Onay yetkiniz var."
              : "Talepleri görebilir ve konuşmayı sürdürebilirsiniz."}
          </b>{" "}
          {canReviewQueue(user.role)
            ? "Bir talebi açın, önerilen değişikliği kontrol edin ve onaylayın. Onaylanan randevu Google Calendar’a işlenir."
            : "Randevu onayını yönetici veya ilgili terapist verir."}
        </p>
      </div>
      <div className="admin-overview" aria-label="Günlük özet">
        <Link href="/queue">
          <strong>{pending.length}</strong>
          <span>Bekleyen talep</span>
        </Link>
        <Link href="/queue?type=CANCEL">
          <strong>{counts.CANCEL ?? 0}</strong>
          <span>İptal talebi</span>
        </Link>
        <Link href="/conversations">
          <strong>{conversationCount}</strong>
          <span>Konuşma</span>
        </Link>
        <Link href="/settings#therapistler">
          <strong>{therapistCount}</strong>
          <span>Aktif terapist</span>
        </Link>
      </div>
      <div className="admin-content-grid">
        <section className="admin-panel admin-panel--queue">
          <div className="admin-panel__head">
            <div>
              <h2>Hasta talepleri</h2>
              <p>Öncelikli ve onay bekleyen işlemler</p>
            </div>
            <span className="admin-result-count">{filtered.length} kayıt</span>
          </div>
          <div
            className="admin-filter-row"
            role="group"
            aria-label="Talep türüne göre filtrele"
          >
            {filters.map((filter) => {
              const count = counts[filter.key] ?? 0;
              const on = (type ?? "all") === filter.key;
              return (
                <Link
                  key={filter.key}
                  className={on ? "admin-filter-pill is-active" : "admin-filter-pill"}
                  href={filter.key === "all" ? "/queue" : `/queue?type=${filter.key}`}
                >
                  {filter.label}
                  <b>{count}</b>
                </Link>
              );
            })}
          </div>
          {visibleNotices.map((note) => {
            const payload = note.payload as Prisma.JsonObject;
            const waiting = noticeConversations.find(c => c.id === payload.conversationId);
            return (
              <div className="admin-alert" key={note.id}>
                <span>↗</span>
                <div>
                  <b>
                    {note.type === "WAITING_CONVERSATION"
                      ? "Konuşma yanıt bekliyor"
                      : "Aynı gün iptali otomatik uygulandı"}
                  </b>
                  {waiting && (
                    <p>
                      {formatPatientName(waiting.patient.displayName)} · {waiting.handoffReason ?? "Çalışan yanıtı bekleniyor"}
                      <br />Sorumlu: {waiting.assignedTo?.name ?? "Henüz atanmadı"} · Bekleme: {formatAge(typeof payload.waitingSince === "string" && Number.isFinite(Date.parse(payload.waitingSince)) ? new Date(payload.waitingSince) : note.createdAt, now)}
                    </p>
                  )}
                  {note.type === "WAITING_CONVERSATION" ? (
                    <Link
                      className="admin-inline-action"
                      href={`/conversations/${encodeURIComponent(String(payload.conversationId))}`}
                    >
                      Bekleyen konuşmayı aç →
                    </Link>
                  ) : (
                    <p>
                      {String(
                        payload.summary ??
                          "Randevu iptal edildi ve terapiste bilgi verildi.",
                      )}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          {visible.length === 0 ? (
            <div className="admin-empty">
              <span>✓</span>
              <h3>Her şey yolunda</h3>
              <p>Bekleyen bir randevu işlemi bulunmuyor.</p>
            </div>
          ) : (
            <div className="admin-queue-list">
              {visible.map((item) => {
                const proposed = (item.proposedChanges ?? {}) as Proposed;
                const patient =
                  item.appointment?.patient ??
                  proposedPatients.find(
                    (p) =>
                      p.id === proposed.patientId && p.phone === item.conversation?.phone,
                  ) ??
                  item.conversation?.patient;
                const remaining = item.expiresAt
                  ? formatRemaining(item.expiresAt, now)
                  : null;
                return (
                  <Link
                    className="admin-queue-row"
                    href={`/queue/${item.id}`}
                    key={item.id}
                  >
                    <span className="queue-row__avatar">
                      {formatPatientName(patient?.displayName ?? "H").slice(0, 1)}
                    </span>
                    <span className="queue-row__main">
                      <span className="queue-row__top">
                        <b>{formatPatientName(patient?.displayName ?? "Hasta")}</b>
                        <em className="admin-tag">{actionTypeLabel(item.type)}</em>
                      </span>
                      <small>
                        {item.appointment?.therapist.displayName ?? "Terapist atanmadı"}
                      </small>
                      <span className="queue-row__detail">
                        {proposed.startAt
                          ? `Önerilen: ${formatDateTime(new Date(proposed.startAt))}`
                          : item.appointment
                            ? formatDateTime(item.appointment.startAt)
                            : actionTypeLabel(item.type)}
                      </span>
                    </span>
                    <span className="queue-row__status">
                      <em>
                        {item.cancellationDelivery &&
                        !item.cancellationDelivery.completedAt
                          ? item.cancellationDelivery.calendarSyncedAt
                            ? "Bildirim bekliyor"
                            : "Takvim bekliyor"
                          : actionStatusLabel(item.status)}
                      </em>
                      {proposed.startAt && new Date(proposed.startAt) <= now && ["NEW_BOOKING", "RESCHEDULE"].includes(item.type) ? <small>Tarih geçti · Saat yeniden seçilmeli</small> : null}
                      <small>{remaining ?? formatAge(item.createdAt, now)}</small>
                    </span>
                    <span className="queue-row__arrow">→</span>
                  </Link>
                );
              })}
            </div>
          )}
          {filtered.length > pageSize ? (
            <nav className="admin-pagination" aria-label="İşlem sayfaları">
              {currentPage > 1 ? (
                <Link href={pageHref(currentPage - 1)}>← Önceki</Link>
              ) : (
                <span />
              )}
              <b>
                {currentPage} / {pageCount}
              </b>
              {currentPage < pageCount ? (
                <Link href={pageHref(currentPage + 1)}>Sonraki →</Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
        <aside className="admin-side-column">
          <section className="admin-panel admin-panel--summary">
            <div className="admin-panel__head">
              <div>
                <h2>Bugünün durumu</h2>
                <p>Sistem ve ekip özeti</p>
              </div>
            </div>
            <dl className="admin-summary-list">
              <div>
                <dt>
                  <i className="is-online" />
                  WhatsApp
                </dt>
                <dd>Hazır</dd>
              </div>
              <div>
                <dt>Hatırlatmalar</dt>
                <dd>24 saat önce</dd>
              </div>
              <div>
                <dt>Onay bekleyen</dt>
                <dd>{pending.length}</dd>
              </div>
              <div>
                <dt>Aktif ekip</dt>
                <dd>{therapistCount} terapist</dd>
              </div>
            </dl>
            <Link
              className="admin-secondary-btn admin-secondary-btn--block"
              href="/settings"
            >
              Sistem ayarları <span>→</span>
            </Link>
          </section>
        </aside>
      </div>
    </AdminShell>
  );
}
