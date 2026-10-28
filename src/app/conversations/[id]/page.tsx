import {
  serviceRequestLabels,
  type ServiceKind,
} from "@/lib/conversation/service-requests";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, toActor } from "@/lib/auth/session";
import { patientScope } from "@/lib/auth/scope";
import { AdminShell } from "@/components/AdminShell";
import { ConversationThread } from "@/components/ConversationThread";
import { ActionPanel } from "@/components/ActionPanel";
import { OperationNotice } from "@/components/OperationNotice";
import { BackIcon, UsageTraceIcon } from "@/components/AdminIcons";
import { ConversationStatus } from "@/components/ConversationStatus";
import "../conversations.css";

export const dynamic = "force-dynamic";
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; done?: string; action?: string }>;
}) {
  const user = await requireUser();
  const actor = toActor(user);
  const { id } = await params;
  const query = await searchParams;
  const conversation = await prisma.conversation.findFirst({
    where: { id, patient: patientScope(actor) },
    include: {
      patient: true,
      assignedTo: true,
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!conversation) notFound();
  const actions = await prisma.actionRequest.findMany({
    where: {
      conversationId: id,
      ...(actor.role === "THERAPIST"
        ? {
            OR: [
              { appointment: { therapistId: actor.therapistProfileId ?? "unassigned" } },
              {
                proposedChanges: {
                  path: ["therapistId"],
                  equals: actor.therapistProfileId ?? "unassigned",
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const tasks = await prisma.serviceRequest.findMany({
    where: { conversationId: id, status: "OPEN" },
    orderBy: { createdAt: "asc" },
  });
  const selected =
    actions.find((a) => a.id === query.action) ??
    actions.find((a) => ["PENDING", "NEEDS_RECHECK"].includes(a.status));
  return (
    <AdminShell user={user} active="conversations">
      <div className="desk-page">
        <nav className="conversation-topbar" aria-label="Konuşma gezinmesi">
          <Link className="conversation-topbar__back" href="/conversations">
            <BackIcon /> Konuşmalar
          </Link>
          <div className="conversation-topbar__actions">
            <ConversationStatus
              mode={conversation.mode}
              stage={conversation.bookingStage}
            />
            {user.role === "ADMIN" && (
              <Link
                className="conversation-topbar__trace"
                href={`/usage/conversations/${id}`}
              >
                <UsageTraceIcon /> AI ve kullanım
              </Link>
            )}
          </div>
        </nav>
        <OperationNotice {...query} />
        {actions.length > 0 ? (
          <nav className="desk-action-tabs" aria-label="Konuşmanın talepleri">
            {actions.map((a) => (
              <Link
                key={a.id}
                className={selected?.id === a.id ? "is-active" : ""}
                href={`/conversations/${id}?action=${a.id}`}
              >
                {a.type === "NEW_BOOKING"
                  ? "Randevu"
                  : a.type === "RESCHEDULE"
                    ? "Saat değişikliği"
                    : a.type === "CANCEL"
                      ? "İptal"
                      : a.type === "INVOICE_REQUEST"
                        ? "Fatura talebi"
                        : "İşlem"}{" "}
                ·{" "}
                {["PENDING", "NEEDS_RECHECK"].includes(a.status)
                  ? "Bekliyor"
                  : "Geçmiş işlem"}
              </Link>
            ))}
          </nav>
        ) : null}
        <div className="desk-workspace">
          <ConversationThread conversation={conversation} />
          <div className="desk-sidebar" id="current-requests">
            <section className="thread-context">
              <h2>Açık talepler</h2>
              {actions
                .filter((a) => ["PENDING", "NEEDS_RECHECK"].includes(a.status))
                .map((a) => (
                  <p key={a.id}>
                    <Link href={`/conversations/${id}?action=${a.id}`}>
                      Onay bekleyen işlem →
                    </Link>
                  </p>
                ))}
              {tasks.map((t) => (
                <p key={t.id}>
                  <Link href={`/requests#request-${t.id}`}>
                    {serviceRequestLabels[t.kind as ServiceKind] ?? t.kind} →
                  </Link>
                </p>
              ))}
              {!tasks.length &&
                !actions.some((a) => ["PENDING", "NEEDS_RECHECK"].includes(a.status)) && (
                  <p>İlgilenilmesi gereken açık talep yok.</p>
                )}
            </section>
            {selected && !["PENDING", "NEEDS_RECHECK"].includes(selected.status) && (
              <p className="thread-context">Geçmiş işlem görüntüleniyor.</p>
            )}
            {selected ? (
              <ActionPanel
                id={selected.id}
                actor={actor}
                returnTo={`/conversations/${id}?action=${selected.id}`}
              />
            ) : (
              <aside className="desk-decision">
                <h2>Müşteri bilgileri</h2>
                <p>Yeni işlem gerektiğinde açık talepler burada görünür.</p>
                <Link
                  className="admin-secondary-btn"
                  href={`/patients/${conversation.patientId}`}
                >
                  Müşteri sayfasını aç →
                </Link>
              </aside>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
