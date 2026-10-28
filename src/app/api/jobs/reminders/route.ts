import { notifyWaitingList } from "@/lib/conversation/service-workflows";
import { authorizeJob } from "@/lib/security/job-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAppointmentLifecycle } from "@/lib/calendar/online-sessions";
import { getCalendar } from "@/lib/queue/ports";
import { whatsappPort } from "@/lib/queue/ports";
import { createReminderService } from "@/lib/reminders/service";
import { retryAppointmentNotes } from "@/lib/calendar/appointment-notes";
import { remindWaitingConversations } from "@/lib/conversation/staff-followup";

export async function POST(request: Request) {
  if (!authorizeJob(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await createReminderService({
    prisma,
    whatsapp: whatsappPort,
    timeZone: process.env.APP_TIMEZONE ?? "Europe/Istanbul",
  }).sendDueReminders();
  const lifecycle = await runAppointmentLifecycle({
    prisma,
    calendar: getCalendar(),
    whatsapp: whatsappPort,
  });
  const waitlist = await notifyWaitingList({
    prisma,
    calendar: getCalendar(),
    whatsapp: whatsappPort,
  });
  const notes = await retryAppointmentNotes();
  const waiting = await remindWaitingConversations();
  return NextResponse.json({ ok: true, ...result, notes, waiting, lifecycle, waitlist });
}
