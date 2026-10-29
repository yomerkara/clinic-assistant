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
  searchParams: Promise<{ q?: string; mode?: string; page?: string }>;
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
  // The list is paged rather than capped: a clinic has hundreds of
  // conversations and the old fixed limit silently hid the rest.
  const pageSize = 50;
  const total = await prisma.conversation.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Math.min(
    pageCount,
    Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1),
  );
  const conversations = await prisma.conversation.findMany({
    where,
    include: { patient: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { lastMessageAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const pageHref = (target: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (mode) search.set("mode", mode);
    if (target > 1) search.set("page", String(target));
    const suffix = search.toString();
    return suffix ? `/conversations?${suffix}` : "/conversations";
  };
  const firstShown = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = Math.min(total, page * pageSize);

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
      {total > 0 ? (
        <p className="admin-result-count" role="status">
          {total} konuşma{query || mode ? " (filtrelenmiş)" : ""} ·{" "}
          {firstShown}-{lastShown} arası gösteriliyor
          {pageCount > 1 ? ` · sayfa ${page}/${pageCount}` : ""}
        </p>
      ) : null}
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
      {pageCount > 1 ? (
        <nav className="desk-pagination" aria-label="Konuşma sayfaları">
          {page > 1 ? <Link href={pageHref(page - 1)}>← Önceki</Link> : <span />}
          <span>
            Sayfa {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={pageHref(page + 1)}>Sonraki →</Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </AdminShell>
  );
}
