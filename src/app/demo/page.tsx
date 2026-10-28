import { findNewDemoPatient } from "@/lib/demo/new-patient";
import { redirect } from "next/navigation";
import { canUseSimulator } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AdminShell } from "@/components/AdminShell";
import { DEMO_PERSONAS, personaById } from "@/lib/demo/personas";
import { quickRepliesFor, type QuickReply } from "@/lib/conversation/quick-replies";
import { DemoStudio, type DemoMessage } from "./studio";

export const dynamic = "force-dynamic";

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string }>;
}) {
  const user = await requireUser();
  if (!canUseSimulator(user.role)) {
    redirect("/queue");
  }
  const persona = personaById((await searchParams).persona);
  const patient =
    persona.id === "new"
      ? await findNewDemoPatient(user.id)
      : persona.patientId
        ? await prisma.patient.findUnique({ where: { id: persona.patientId } })
        : await prisma.patient.findFirst({
            where: { phone: persona.phone },
            orderBy: { createdAt: "desc" },
          });
  const conversation = patient
    ? await prisma.conversation.findFirst({
        where: { patientId: patient.id, source: "demo" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
        orderBy: { lastMessageAt: "desc" },
      })
    : null;
  const messages: DemoMessage[] =
    conversation?.messages.map((message) => ({
      id: message.id,
      role: message.authorKind === "PATIENT" ? "patient" : "assistant",
      text: message.text,
      createdAt: message.createdAt.toISOString(),
    })) ?? [];
  const lastOutbound =
    [...messages].reverse().find((item) => item.role === "assistant")?.text ?? "";
  const initialQuickReplies: QuickReply[] =
    conversation?.mode === "HUMAN"
      ? []
      : lastOutbound
        ? quickRepliesFor({
            outbound: lastOutbound,
            hasAppointment: persona.id !== "new",
            botStopped: false,
          })
        : persona.chips;

  return (
    <AdminShell user={user} active="demo">
      <DemoStudio
        key={persona.id}
        persona={persona}
        personas={DEMO_PERSONAS}
        initialMessages={messages}
        initialQuickReplies={initialQuickReplies}
      />
    </AdminShell>
  );
}
