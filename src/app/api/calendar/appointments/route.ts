import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, toActor } from "@/lib/auth/session";
import { patientScope } from "@/lib/auth/scope";
import { canReviewQueue } from "@/lib/auth/rbac";
import { parseIstanbulInput, validAppointmentRange } from "@/lib/calendar/dates";
import { CalendarUnavailableError } from "@/lib/calendar/google";
import { getActionRequestService } from "@/lib/queue/ports";
import {
  ConflictError,
  IncompleteProfileError,
  ScheduleConflictError,
} from "@/lib/queue/action-request-service";
import { publicOrigin } from "@/lib/http";
export async function POST(request: Request) {
  const user = await requireUser();
  const actor = toActor(user);
  const form = await request.formData();
  const therapistId = String(form.get("therapistId") ?? "");
  const date = String(form.get("date") ?? "");
  const go = (key: string, value: string) => {
    const url = new URL("/calendar", publicOrigin(request));
    url.searchParams.set("therapist", therapistId);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) url.searchParams.set("date", date);
    url.searchParams.set(key, value);
    return NextResponse.redirect(url, 303);
  };
  if (!canReviewQueue(user.role)) return go("error", "forbidden");
  const therapist = await prisma.therapistProfile.findFirst({
    where: {
      id: therapistId,
      active: true,
      user: { role: "THERAPIST" },
      ...(user.role === "THERAPIST" ? { userId: user.id } : {}),
    },
  });
  if (!therapist) return go("error", "forbidden");
  const appointmentId = String(form.get("appointmentId") ?? "");
  const appointment = appointmentId
    ? await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
          therapistId: therapist.id,
          status: { in: ["SCHEDULED", "CONFIRMED"] },
        },
        include: { patient: true },
      })
    : null;
  if (appointmentId && !appointment) return go("error", "forbidden");
  const patientId = appointment?.patientId ?? String(form.get("patientId") ?? "");
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, ...patientScope(actor) },
  });
  if (!patient) return go("error", "forbidden");
  const startAt = parseIstanbulInput(String(form.get("startAt") ?? ""));
  const endAt = parseIstanbulInput(String(form.get("endAt") ?? ""));
  if (!validAppointmentRange(startAt, endAt)) return go("error", "invalid_time");
  const requestId = String(form.get("requestId") ?? "");
  if (!/^[a-f0-9-]{36}$/.test(requestId)) return go("error", "conflict");
  const id = `calendar_${requestId}`;
  const conversation = await prisma.conversation.findFirst({
    where: { patientId },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });
  const existing = await prisma.actionRequest.findUnique({ where: { id } });
  if (existing && existing.requestedBy !== user.id) return go("error", "forbidden");
  if (existing?.status === "APPROVED") return go("done", "approved");
  if (existing) return go("error", "conflict");
  try {
    await prisma.actionRequest.create({
      data: {
        id,
        type: appointment ? "RESCHEDULE" : "NEW_BOOKING",
        appointmentId: appointment?.id,
        conversationId: conversation?.id,
        requestedBy: user.id,
        status: "PENDING",
        proposedChanges: {
          patientId,
          sessionMode: form.get("sessionMode") === "ONLINE" ? "ONLINE" : "IN_PERSON",
          therapistId,
          appointmentVersion: appointment?.version,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          operationalSummary: "Takvim ekranından personel işlemi.",
        },
      },
    });
    const result = await getActionRequestService().approve(actor, id);
    return result.status === "APPROVED"
      ? go("done", "approved")
      : go("error", "conflict");
  } catch (error) {
    if (error instanceof CalendarUnavailableError) return go("error", "calendar");
    if (error instanceof ScheduleConflictError) return go("error", "slot_conflict");
    if (error instanceof IncompleteProfileError) return go("error", "incomplete_profile");
    if (error instanceof ConflictError) return go("error", "conflict");
    // A duplicate submitted request must not perform a second calendar write.
    if (error && typeof error === "object" && "code" in error && error.code === "P2002")
      return go("error", "conflict");
    throw error;
  }
}
