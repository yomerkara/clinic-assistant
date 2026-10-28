import { MemoryWhatsApp } from "@/lib/adapters/whatsapp";
import { GoogleCalendar } from "@/lib/calendar/google";
import { prisma } from "@/lib/prisma";
import { createActionRequestService } from "@/lib/queue/action-request-service";

const calendar = new GoogleCalendar();
const whatsapp = new MemoryWhatsApp();

export function getCalendar() {
  return calendar;
}

export function getActionRequestService() {
  return createActionRequestService({
    prisma,
    calendar,
    whatsapp,
    timeZone: process.env.APP_TIMEZONE ?? "Europe/Istanbul",
  });
}

export { calendar as calendarPort, whatsapp as whatsappPort };
