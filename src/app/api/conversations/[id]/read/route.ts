import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, toActor } from "@/lib/auth/session";
import { patientScope } from "@/lib/auth/scope";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const form = await request.formData();
  const message = await prisma.message.findFirst({
    where: {
      id: String(form.get("messageId") ?? ""),
      conversationId: id,
      conversation: { patient: patientScope(toActor(user)) },
    },
    select: { createdAt: true },
  });
  if (!message) return NextResponse.json({ error: "Mesaj bulunamadı." }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.conversationRead.upsert({
      where: { userId_conversationId: { userId: user.id, conversationId: id } },
      create: { userId: user.id, conversationId: id, readThroughAt: message.createdAt },
      update: {},
    });
    await tx.conversationRead.updateMany({
      where: {
        userId: user.id,
        conversationId: id,
        readThroughAt: { lt: message.createdAt },
      },
      data: { readThroughAt: message.createdAt },
    });
  });
  return NextResponse.json({ ok: true });
}
