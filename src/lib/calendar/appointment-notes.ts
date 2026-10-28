import { prisma } from "@/lib/prisma";
import { getCalendar } from "@/lib/queue/ports";

export async function syncAppointmentNote(id: string) {
  const note = await prisma.appointmentNote.findUniqueOrThrow({
    where: { id },
    include: { appointment: { include: { therapist: true } } },
  });
  if (note.calendarSyncedAt) return true;
  const appointment = note.appointment;
  if (
    !appointment.calendarEventId ||
    !["SCHEDULED", "CONFIRMED"].includes(appointment.status)
  )
    return false;
  try {
    const calendar = getCalendar();
    if (!calendar.appendNote) return false;
    await calendar.appendNote({
      ownerUserId: appointment.therapist.userId,
      calendarEventId: appointment.calendarEventId,
      noteId: note.id,
      text: note.text,
    });
    await prisma.appointmentNote.update({
      where: { id },
      data: { calendarSyncedAt: new Date() },
    });
    return true;
  } catch {
    return false;
  }
}

export async function retryAppointmentNotes() {
  const pending = await prisma.appointmentNote.findMany({
    where: {
      calendarSyncedAt: null,
      appointment: {
        calendarEventId: { not: null },
        status: { in: ["SCHEDULED", "CONFIRMED"] },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { id: true },
  });
  let synced = 0;
  for (const note of pending) if (await syncAppointmentNote(note.id)) synced++;
  return { attempted: pending.length, synced };
}
