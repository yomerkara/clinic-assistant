import { formatPatientName } from "@/lib/patients/profile";
import { FilterIcon } from "@/components/AdminIcons";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { patientScope } from "@/lib/auth/scope";
import { requireUser, toActor } from "@/lib/auth/session";
import { AdminShell } from "@/components/AdminShell";
import { formatAge } from "@/lib/format";
import type { Prisma } from "@prisma/client";
import { ConversationStatus } from "@/components/ConversationStatus";
import "./conversations.css";

export const dynamic = "force-dynamic";

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mode?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const mode =
    params.mode === "HUMAN" ? "HUMAN" : params.mode === "BOT" ? "BOT" : undefined;
  const therapistScope = patientScope(toActor(user));
  const where: Prisma.ConversationWhereInput = {
    ...(mode ? { mode } : {}),
    patient: {
      AND: [
        therapistScope,
        ...(query
          ? [
              {
                OR: [
                  { displayName: { contains: query, mode: "insensitive" as const } },
                  { phone: { contains: query } },
                ],
              },
            ]
          : []),
      ],
    },
  };
  const conversations = await prisma.conversation.findMany({
    where,
    include: { patient: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { lastMessageAt: "desc" },
    take: 30,
  });

  return (
    <AdminShell user={user} active="conversations">
      <div className="admin-page-head">
        <div>
          <span className="admin-kicker">İletişim merkezi</span>
          <h1>Konuşmalar</h1>
          <p>Hastalarla yapılan görüşmeleri tek yerden takip edin.</p>
        </div>
      </div>
      <form className="admin-toolbar" method="get">
        <label className="admin-search">
          ⌕ <input name="q" defaultValue={query} placeholder="Hasta veya telefon ara" />
        </label>
        <select
          className="admin-filter"
          name="mode"
          defaultValue={mode ?? "ALL"}
          aria-label="Konuşma türü"
        >
          <option value="ALL">Tüm konuşmalar</option>
          <option value="BOT">Asistan konuşmaları</option>
          <option value="HUMAN">Çalışana devredilenler</option>
        </select>
        <button className="toolbar-apply-btn" type="submit">
          <FilterIcon /> Filtrele
        </button>
      </form>
      <div className="conversation-list">
        {conversations.map((conversation) => {
          const message = conversation.messages[0];
          const waiting =
            conversation.mode === "HUMAN" && message?.authorKind !== "STAFF";
          return (
            <Link
              className="conversation-row"
              href={`/conversations/${conversation.id}`}
              key={conversation.id}
            >
              <span className="conversation-avatar">
                {formatPatientName(conversation.patient.displayName).slice(0, 1)}
              </span>
              <span className="conversation-copy">
                <span className="conversation-row__title">
                  <b>{formatPatientName(conversation.patient.displayName)}</b>
                  <ConversationStatus
                    mode={conversation.mode}
                    stage={conversation.bookingStage}
                  />
                </span>
                <small>{message?.text ?? "Henüz mesaj yok"}</small>
              </span>
              <span className="conversation-meta">
                <b>
                  {waiting
                    ? "● Çalışan yanıtı bekliyor"
                    : conversation.mode === "HUMAN"
                      ? "Çalışan"
                      : "Asistan"}
                </b>
                <small>{formatAge(conversation.lastMessageAt)}</small>
              </span>
              <span className="conversation-arrow">→</span>
            </Link>
          );
        })}
        {conversations.length === 0 ? (
          <div className="admin-empty">
            <span>◌</span>
            <h3>{query || mode ? "Eşleşen konuşma yok" : "Henüz konuşma yok"}</h3>
            <p>
              {query || mode
                ? "Arama veya filtreyi değiştirip tekrar deneyin."
                : "WhatsApp mesajları geldiğinde burada görünecek."}
            </p>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
