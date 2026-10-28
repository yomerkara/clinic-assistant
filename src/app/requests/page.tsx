import { RequestActions, CompleteRequestIcon } from "@/components/RequestActions";
import { RequestsInbox } from "@/components/RequestsInbox";
import { taskProgressLabels } from "@/lib/conversation/task-progress";
import { toIstanbulInput } from "@/lib/calendar/dates";
import { ServiceWorkflowForm } from "@/components/ServiceWorkflowForm";
import Link from "next/link";
import "./requests.css";
import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/prisma";
import { requireUser, toActor } from "@/lib/auth/session";
import { patientScope } from "@/lib/auth/scope";
import { formatPatientName } from "@/lib/patients/profile";
import {
  serviceRequestLabels,
  type ServiceKind,
} from "@/lib/conversation/service-requests";

export const dynamic = "force-dynamic";
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; owner?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const status = query.status === "RESOLVED" ? "RESOLVED" : "OPEN";
  const ownerFilter =
    query.owner === "mine" ? "mine" : query.owner === "unassigned" ? "unassigned" : "all";
  const scope = { conversation: { patient: patientScope(toActor(user)) } };
  const [openCount, mineCount, unassignedCount] = await Promise.all([
    prisma.serviceRequest.count({ where: { ...scope, status: "OPEN" } }),
    prisma.serviceRequest.count({
      where: { ...scope, status: "OPEN", ownerId: user.id },
    }),
    prisma.serviceRequest.count({ where: { ...scope, status: "OPEN", ownerId: null } }),
  ]);
  const requests = await prisma.serviceRequest.findMany({
    where: {
      status,
      ...scope,
      ...(ownerFilter === "mine"
        ? { ownerId: user.id }
        : ownerFilter === "unassigned"
          ? { ownerId: null }
          : {}),
    },
    include: {
      owner: true,
      conversation: {
        include: {
          patient: {
            include: {
              appointments: {
                where: {
                  status: { in: ["SCHEDULED", "CONFIRMED"] },
                  startAt: { gt: new Date() },
                  ...(user.role === "THERAPIST"
                    ? { therapist: { userId: user.id } }
                    : {}),
                },
                include: { therapist: true },
                orderBy: { startAt: "asc" },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  const therapists = await prisma.therapistProfile.findMany({
    where: { active: true, ...(user.role === "THERAPIST" ? { userId: user.id } : {}) },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
  const owners = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: ["ADMIN", "THERAPIST"] },
      ...(user.role !== "ADMIN" ? { id: user.id } : {}),
    },
    select: { id: true, name: true },
  });
  const responders = await prisma.user.findMany({
    where: {
      id: {
        in: [
          ...new Set(requests.flatMap((r) => (r.resolvedById ? [r.resolvedById] : []))),
        ],
      },
    },
    select: { id: true, name: true },
  });
  const responderNames = new Map(responders.map((r) => [r.id, r.name]));
  return (
    <AdminShell user={user} active="requests">
      <div className="admin-page-head requests-page-head">
        <div>
          <span className="admin-kicker">Takip</span>
          <h1>Çalışan talepleri</h1>
          <p>
            Danışan taleplerini ekibinizle paylaşın, ilerlemeyi tek yerden takip edin.
          </p>
        </div>
      </div>
      <div className="request-overview" aria-label="Açık talepler özeti">
        <Link href="/requests">
          <strong>{openCount}</strong>
          <span>Açık talep</span>
        </Link>
        <Link href="/requests?owner=mine">
          <strong>{mineCount}</strong>
          <span>Bana atanan</span>
        </Link>
        <Link href="/requests?owner=unassigned">
          <strong>{unassignedCount}</strong>
          <span>Sorumlu bekleyen</span>
        </Link>
      </div>
      <div className="request-toolbar">
        <nav aria-label="Talep durumu">
          <Link
            className={status === "OPEN" ? "is-selected" : ""}
            href="/requests"
            aria-current={status === "OPEN" ? "page" : undefined}
          >
            Açık talepler
          </Link>
          <Link
            className={status === "RESOLVED" ? "is-selected" : ""}
            href="/requests?status=RESOLVED"
            aria-current={status === "RESOLVED" ? "page" : undefined}
          >
            Tamamlananlar
          </Link>
        </nav>
        <form method="get">
          <input type="hidden" name="status" value={status} />
          <label htmlFor="request-owner-filter">Sorumlu</label>
          <select name="owner" id="request-owner-filter" defaultValue={ownerFilter}>
            <option value="all">Tüm çalışanlar</option>
            <option value="mine">Bana atananlar</option>
            <option value="unassigned">Atanmamış</option>
          </select>
          <button className="admin-secondary-btn">Filtrele</button>
        </form>
      </div>
      <p className="request-result-count">
        {requests.length} talep gösteriliyor
        {requests.length === 100 ? " · İlk 100 kayıt" : ""}
      </p>
      <RequestsInbox
        rows={requests.map((item) => ({
          id: item.id,
          name: formatPatientName(item.conversation.patient.displayName),
          title: serviceRequestLabels[item.kind as ServiceKind] ?? item.kind,
          preview: item.summary,
          status:
            item.status === "RESOLVED"
              ? "Tamamlandı"
              : (taskProgressLabels[item.progress] ?? "Yeni talep"),
          owner: item.owner?.name ?? "Atanmamış",
          date: item.createdAt.toLocaleDateString("tr-TR", {
            timeZone: "Europe/Istanbul",
            day: "numeric",
            month: "short",
          }),
          overdue:
            item.status === "OPEN" &&
            Boolean(item.followUpAt && item.followUpAt < new Date()),
          detail: (
            <article className="service-request" id={`request-${item.id}`} key={item.id}>
              <div>
                <header className="request-card-head">
                  <h2>{serviceRequestLabels[item.kind as ServiceKind] ?? item.kind}</h2>
                  <span
                    className={`request-badge ${item.status === "RESOLVED" ? "is-done" : ""}`}
                  >
                    {item.status === "RESOLVED"
                      ? "Tamamlandı"
                      : (taskProgressLabels[item.progress] ?? "Yeni talep")}
                  </span>
                </header>
                <p>
                  <Link href={`/patients/${item.conversation.patientId}`}>
                    {formatPatientName(item.conversation.patient.displayName)}
                  </Link>{" "}
                  ·{" "}
                  {item.createdAt.toLocaleString("tr-TR", {
                    timeZone: "Europe/Istanbul",
                  })}
                </p>
                <p className="request-summary">{item.summary}</p>

                <p className="task-state">
                  <strong>
                    {item.status === "RESOLVED"
                      ? "İşlem tamamlandı"
                      : (taskProgressLabels[item.progress] ?? "Yeni talep")}
                  </strong>{" "}
                  · {item.owner?.name ?? "Sorumlu atanmamış"}
                  {item.followUpAt && (
                    <span>
                      {" "}
                      · Takip:{" "}
                      {item.followUpAt.toLocaleString("tr-TR", {
                        timeZone: "Europe/Istanbul",
                      })}
                      {item.status === "OPEN" && item.followUpAt < new Date()
                        ? " — takip zamanı geçti"
                        : ""}
                    </span>
                  )}
                </p>
                <RequestActions
                  id={item.id}
                  conversationId={item.conversationId}
                  canEdit={user.role !== "INTERN" && item.status === "OPEN"}
                  kind={
                    item.kind === "DATA_REQUEST" && user.role !== "ADMIN" ? "" : item.kind
                  }
                />
                {user.role !== "INTERN" && item.status === "OPEN" && (
                  <details className="request-controls" id={`request-assign-${item.id}`}>
                    <summary>Sorumlu ata / takibi düzenle</summary>
                    <form
                      className="task-tracking"
                      action={`/api/service-requests/${item.id}`}
                      method="post"
                    >
                      <input type="hidden" name="intent" value="track" />
                      <label>
                        İlerleme
                        <select name="progress" defaultValue={item.progress}>
                          {Object.entries(taskProgressLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Sorumlu
                        <select name="ownerId" defaultValue={item.ownerId ?? ""}>
                          <option value="">Atanmamış</option>
                          {owners.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                          {item.owner && !owners.some((o) => o.id === item.ownerId) && (
                            <option value={item.owner.id}>{item.owner.name}</option>
                          )}
                        </select>
                      </label>
                      <label>
                        Takip tarihi (İstanbul)
                        <input
                          type="datetime-local"
                          name="followUpAt"
                          defaultValue={
                            item.followUpAt ? toIstanbulInput(item.followUpAt) : ""
                          }
                        />
                      </label>
                      <button className="admin-secondary-btn">
                        Atama ve takibi kaydet
                      </button>
                    </form>
                  </details>
                )}
                {item.kind === "WAITLIST" && (
                  <p>
                    Son değerlendirme:{" "}
                    {item.lastCheckedAt
                      ? item.lastCheckedAt.toLocaleString("tr-TR", {
                          timeZone: "Europe/Istanbul",
                        })
                      : "Henüz çalışmadı"}{" "}
                    ·{" "}
                    {(
                      {
                        NO_SLOT: "Uygun saat yok",
                        OFFERED:
                          "Saat önerisi mesaj kanalına gönderildi; teslim teyidi yok",
                        PAUSED: "Devam eden işlem veya çalışan görüşmesi bekleniyor",
                        EXPIRED: "Takip aralığı sona erdi",
                        ERROR: "Kontrol başarısız; tekrar denenecek",
                      } as Record<string, string>
                    )[item.lastCheckResult ?? ""] ?? "Kontrol bekleniyor"}
                  </p>
                )}
                {item.resolution && (
                  <div className="request-resolution">
                    <span className="request-eyebrow">Sonuç notu</span>
                    <p>{item.resolution}</p>
                    <small>
                      Yanıtlayan:{" "}
                      <strong>
                        {item.resolvedById
                          ? (responderNames.get(item.resolvedById) ?? "Eski çalışan")
                          : "Kaydedilmemiş"}
                      </strong>{" "}
                      ·{" "}
                      {item.updatedAt.toLocaleString("tr-TR", {
                        timeZone: "Europe/Istanbul",
                      })}
                    </small>
                  </div>
                )}
                {user.role !== "INTERN" && item.status === "OPEN" && (
                  <ServiceWorkflowForm
                    id={item.id}
                    kind={item.kind}
                    admin={user.role === "ADMIN"}
                    therapists={therapists}
                    configured={Boolean(item.workflow)}
                    workflow={item.workflow}
                    notified={Boolean(item.notificationSentAt)}
                    appointments={item.conversation.patient.appointments.map((a) => ({
                      id: a.id,
                      label: `${a.startAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })} · ${a.therapist.displayName}`,
                    }))}
                  />
                )}
                {user.role !== "INTERN" && item.status === "OPEN" && (
                  <details
                    className="request-controls request-reply"
                    id={`request-reply-${item.id}`}
                  >
                    <summary>Sonuç yaz ve talebi tamamla</summary>
                    <p className="request-reply-note">
                      Yanıtlayan: <strong>{user.name}</strong>. Bu not çalışan kaydına
                      eklenir. Danışana mesaj göndermek için konuşmayı açın.
                    </p>
                    <form
                      action={`/api/service-requests/${item.id}`}
                      method="post"
                      className="patient-edit__form"
                    >
                      <label>
                        Sonuç notu
                        <textarea
                          name="resolution"
                          required
                          minLength={5}
                          maxLength={2000}
                          placeholder="Ne yapıldı? Hasta bilgilendirildi mi?"
                        />
                      </label>
                      <button className="toolbar-apply-btn" type="submit">
                        <CompleteRequestIcon /> Sonucu kaydet ve kapat
                      </button>
                    </form>
                  </details>
                )}
              </div>
            </article>
          ),
        }))}
      />
    </AdminShell>
  );
}
