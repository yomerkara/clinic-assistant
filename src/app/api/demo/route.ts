import { missingBookingProfile } from "@/lib/patients/profile";
import { findNewDemoPatient, createNewDemoPatient } from "@/lib/demo/new-patient";
import { NextResponse } from "next/server";
import { canUseSimulator } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { DEMO_PERSONAS, personaById } from "@/lib/demo/personas";
import { inboundBuffer } from "@/lib/conversation/buffer-service";
import { randomUUID } from "node:crypto";
import { ModelCallError } from "@/lib/llm/types";
import { quickRepliesFor } from "@/lib/conversation/quick-replies";

function hasAppointmentPersona(personaId: string) {
  return personaId !== "new";
}

function chipsFor(
  conversation: {
    mode: string;
    messages: Array<{ authorKind: string; text: string }>;
  } | null,
  personaId: string,
) {
  if (!conversation || conversation.mode === "HUMAN") return [];
  const last = [...conversation.messages]
    .reverse()
    .find((item) => item.authorKind === "BOT");
  if (!last) return null;
  if (/^Rica ederim\. Görüşmek üzere\.$/i.test(last.text.trim())) return [];
  return quickRepliesFor({
    outbound: last.text,
    hasAppointment: hasAppointmentPersona(personaId),
    botStopped: false,
  });
}

export async function GET(request: Request) {
  const user = await requireUser();
  if (!canUseSimulator(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const persona = personaById(new URL(request.url).searchParams.get("persona"));
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
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          inboundBuffer: true,
          actionRequests: {
            where: { status: "PENDING" },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { lastMessageAt: "desc" },
      })
    : null;
  return NextResponse.json({
    personas: DEMO_PERSONAS,
    persona,
    patient,
    conversation,
    processing: Boolean(conversation?.inboundBuffer),
    actionId: conversation?.actionRequests[0]?.id ?? null,
    actions:
      conversation?.actionRequests.map(({ id, type, status }) => ({
        id,
        type,
        status,
      })) ?? [],
    quickReplies: conversation?.inboundBuffer
      ? []
      : (chipsFor(conversation, persona.id) ?? persona.chips),
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!canUseSimulator(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as {
    intent?: string;
    persona?: string;
    text?: string;
    messageId?: string;
  };
  const persona = personaById(body.persona);
  try {
    if (body.intent === "reset") {
      if (persona.id === "new") {
        await createNewDemoPatient(user.id);
        return NextResponse.json({ ok: true, persona });
      }
      const patient = persona.patientId
        ? await prisma.patient.findUnique({ where: { id: persona.patientId } })
        : await prisma.patient.findFirst({
            where: { phone: persona.phone },
            orderBy: { createdAt: "desc" },
          });
      if (patient) {
        await restorePersonaAppointment(persona.id);
        await prisma.conversation.create({
          data: {
            patientId: patient.id,
            phone: persona.phone,
            source: "demo",
            mode: "BOT",
          },
        });
      }
      return NextResponse.json({ ok: true, persona });
    }
    const text = String(body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "empty" }, { status: 400 });
    }
    const newDemoPatient =
      persona.id === "new"
        ? ((await findNewDemoPatient(user.id)) ?? (await createNewDemoPatient(user.id)))
        : null;
    const patient =
      newDemoPatient ??
      (persona.patientId
        ? await prisma.patient.findUnique({ where: { id: persona.patientId } })
        : await prisma.patient.findFirst({ where: { phone: persona.phone } }));
    if (!patient)
      return NextResponse.json({ error: "Müşteri bulunamadı" }, { status: 404 });
    if (text.length > 4000)
      return NextResponse.json(
        { message: "Mesaj en fazla 4000 karakter olabilir." },
        { status: 400 },
      );
    const messageId =
      body.messageId && /^[a-f0-9-]{36}$/i.test(body.messageId)
        ? body.messageId
        : randomUUID();
    const result = await inboundBuffer.enqueue({
      phone: patient.phone,
      text,
      patientId: patient.id,
      source: "demo",
      demoAdminUserId: user.id,
      providerMessageId: `demo:${user.id}:${messageId}`,
    });
    return NextResponse.json({ ...result, processing: true }, { status: 202 });
  } catch (error) {
    if (error instanceof ModelCallError) {
      return NextResponse.json(
        { error: "model", message: error.message, detail: error.detail },
        { status: 502 },
      );
    }
    throw error;
  }
}

async function restorePersonaAppointment(personaId: string) {
  const now = new Date();
  if (personaId === "mehmet") {
    const startAt = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    await prisma.appointment.updateMany({
      where: { id: "appt_mehmet_today" },
      data: {
        status: "SCHEDULED",
        startAt,
        endAt: new Date(startAt.getTime() + 50 * 60 * 1000),
      },
    });
  }
  if (personaId === "ayse") {
    const current = await prisma.appointment.findUnique({
      where: { id: "appt_ayse_current" },
      include: { patient: true },
    });
    if (!current || missingBookingProfile(current.patient).length) return;
    const startAt =
      current.startAt > now
        ? current.startAt
        : new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    await prisma.appointment.update({
      where: { id: current.id },
      data: {
        status: "CONFIRMED",
        startAt,
        endAt: new Date(startAt.getTime() + 50 * 60 * 1000),
      },
    });
  }
}
