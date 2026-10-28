"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ChatCircle,
  UserPlus,
  NotePencil,
  CalendarBlank,
  ShieldCheck,
  VideoCamera,
  CheckCircle,
} from "@phosphor-icons/react";
export function RequestActions({
  id,
  conversationId,
  canEdit,
  kind,
}: {
  id: string;
  conversationId: string;
  canEdit: boolean;
  kind: string;
}) {
  const [active, setActive] = useState("");
  const workflow = ["WAITLIST", "RECURRING", "ONLINE", "DATA_REQUEST"].includes(kind);
  const open = (part: string) => {
    const next = active === part ? "" : part;
    setActive(next);
    for (const key of ["assign", "reply", "workflow"]) {
      const element = document.getElementById(
        `request-${key}-${id}`,
      ) as HTMLDetailsElement | null;
      if (element) element.open = key === next;
    }
  };
  const WorkflowIcon =
    kind === "DATA_REQUEST"
      ? ShieldCheck
      : kind === "ONLINE"
        ? VideoCamera
        : CalendarBlank;
  const workflowLabel =
    kind === "WAITLIST"
      ? "Bekleme"
      : kind === "RECURRING"
        ? "Planla"
        : kind === "ONLINE"
          ? "Online"
          : "Veri işlemi";
  return (
    <nav className="request-action-bar" aria-label="Talep işlemleri">
      <Link
        href={`/conversations/${conversationId}`}
        className="request-action"
        title="Müşteri konuşmasını aç"
        aria-label="Müşteri konuşmasını aç"
      >
        <ChatCircle size={25} weight="duotone" aria-hidden />
        <span>Konuşma</span>
      </Link>
      {canEdit && (
        <>
          <button
            type="button"
            className={`request-action${active === "assign" ? " is-active" : ""}`}
            title="Sorumlu ata ve takibi düzenle"
            aria-label="Sorumlu ata ve takibi düzenle"
            aria-expanded={active === "assign"}
            aria-controls={`request-assign-${id}`}
            onClick={() => open("assign")}
          >
            <UserPlus size={25} weight="duotone" aria-hidden />
            <span>Ata</span>
          </button>
          {workflow && (
            <button
              type="button"
              className={`request-action${active === "workflow" ? " is-active" : ""}`}
              title={workflowLabel}
              aria-expanded={active === "workflow"}
              aria-controls={`request-workflow-${id}`}
              onClick={() => open("workflow")}
            >
              <WorkflowIcon size={25} weight="duotone" aria-hidden />
              <span>{workflowLabel}</span>
            </button>
          )}
          <button
            type="button"
            className={`request-action request-action-primary${active === "reply" ? " is-active" : ""}`}
            title="Sonuç notu yaz ve talebi tamamla"
            aria-label="Sonuç notu yaz ve talebi tamamla"
            aria-expanded={active === "reply"}
            aria-controls={`request-reply-${id}`}
            onClick={() => open("reply")}
          >
            <NotePencil size={25} weight="duotone" aria-hidden />
            <span>Yanıtla</span>
          </button>
        </>
      )}
    </nav>
  );
}
export function CompleteRequestIcon() {
  return <CheckCircle size={20} weight="duotone" aria-hidden />;
}
