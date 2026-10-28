import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, toActor } from "@/lib/auth/session";
import { AdminShell } from "@/components/AdminShell";
import { ConversationThread } from "@/components/ConversationThread";
import { ActionPanel } from "@/components/ActionPanel";
import { OperationNotice } from "@/components/OperationNotice";
import { getActionRequestService } from "@/lib/queue/ports";
import { ForbiddenError, NotFoundError } from "@/lib/queue/action-request-service";

export const dynamic = "force-dynamic";
export default async function ActionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const user = await requireUser();
  const actor = toActor(user);
  const { id } = await params;
  const query = await searchParams;
  const action = await getActionRequestService()
    .getForActor(actor, id)
    .catch((error) => {
      if (error instanceof ForbiddenError || error instanceof NotFoundError) notFound();
      throw error;
    });
  const conversation = action.conversationId
    ? await prisma.conversation.findUnique({
        where: { id: action.conversationId },
        include: {
          patient: true,
          assignedTo: true,
          messages: { orderBy: { createdAt: "asc" } },
        },
      })
    : null;
  return (
    <AdminShell user={user} active="queue">
      <div className="desk-page">
        <Link className="desk-back" href="/queue">
          ← Onay kuyruğuna dön
        </Link>
        <OperationNotice {...query} />
        <div className="desk-workspace">
          {conversation ? (
            <ConversationThread conversation={conversation} />
          ) : (
            <section className="desk-thread">
              <div className="admin-empty">
                <h2>İşlem detayı</h2>
                <p>Bu talebe bağlı bir konuşma yok.</p>
                {action.appointment ? (
                  <Link href={`/patients/${action.appointment.patientId}`}>
                    Müşteri bilgilerini aç →
                  </Link>
                ) : null}
              </div>
            </section>
          )}
          <div id="current-requests"><ActionPanel id={id} actor={actor} /></div>
        </div>
      </div>
    </AdminShell>
  );
}
