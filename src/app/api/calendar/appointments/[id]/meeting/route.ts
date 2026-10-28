import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getCalendar, whatsappPort } from "@/lib/queue/ports";
import { processOnlineSession } from "@/lib/calendar/online-sessions";
import { publicOrigin } from "@/lib/http";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (user.role === "INTERN")
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
  const { id } = await context.params;
  const appointment = await prisma.appointment.findFirst({
    where: {
      id,
      ...(user.role === "THERAPIST" ? { therapist: { userId: user.id } } : {}),
    },
  });
  if (!appointment)
    return NextResponse.json({ error: "Randevu bulunamadı." }, { status: 404 });
  try {
    const result = await processOnlineSession(
      { prisma, calendar: getCalendar(), whatsapp: whatsappPort },
      id,
      true,
    );
    if (!["sent", "already_sent"].includes(result))
      return NextResponse.json(
        {
          error:
            result === "pending"
              ? "Google bağlantıyı hazırlıyor. Birazdan tekrar deneyin."
              : "Gönderime uygun online randevu bulunamadı.",
        },
        { status: 409 },
      );
    await prisma.auditEvent.create({
      data: {
        actorId: user.id,
        action: "appointment.meeting_sent",
        entityType: "Appointment",
        entityId: id,
        metadata: { result },
      },
    });
    revalidatePath("/calendar");
    return NextResponse.redirect(new URL("/calendar", publicOrigin(request)), 303);
  } catch {
    return NextResponse.json(
      { error: "Bağlantı gönderilemedi; yeniden deneyebilirsiniz." },
      { status: 503 },
    );
  }
}
