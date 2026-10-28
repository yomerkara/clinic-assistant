// The assistant must offer times from the calendar of the therapist the
// conversation is about: that therapist's working hours, that therapist's
// Google busy blocks and that therapist's existing appointments. Another
// therapist's full calendar must never remove a slot, and a therapist without a
// calendar connection must never get a promised time.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL }) };
});
const connected = new Set<string>();
vi.mock("@/lib/calendar/google", () => ({
  hasCalendarConnection: async (userId?: string | null) =>
    Boolean(userId && connected.has(userId)),
}));
vi.mock("@/lib/queue/ports", async () => {
  const { MemoryCalendar } = await import("@/lib/adapters/calendar");
  const { MemoryWhatsApp } = await import("@/lib/adapters/whatsapp");
  const { createActionRequestService } = await import(
    "@/lib/queue/action-request-service"
  );
  const { prisma } = await import("@/lib/prisma");
  const calendar = new MemoryCalendar();
  const whatsapp = new MemoryWhatsApp();
  return {
    getCalendar: () => calendar,
    getActionRequestService: () =>
      createActionRequestService({
        prisma,
        calendar,
        whatsapp,
        timeZone: "Europe/Istanbul",
      }),
  };
});

import { prisma } from "@/lib/prisma";
import { handleInbound } from "@/lib/orchestrator/inbound";
import { getCalendar } from "@/lib/queue/ports";
import type { MemoryCalendar } from "@/lib/adapters/calendar";
import { istanbulDay } from "@/lib/calendar/availability";

const url = process.env.TEST_DATABASE_URL;
const PHONE = "+905550000911";
const ADA = { userId: "user_avail_ada", therapistId: "therapist_avail_ada" };
const BORA = { userId: "user_avail_bora", therapistId: "therapist_avail_bora" };
// 4 November 2026 is a Wednesday, inside the Tuesday-Sunday clinic week.
const DAY = "2026-11-04";
const at = (hour: number, minute = 0) =>
  new Date(`${DAY}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+03:00`);

async function seedTherapist(
  who: typeof ADA,
  name: string,
  hours: { startMinute: number; endMinute: number },
) {
  await prisma.user.upsert({
    where: { id: who.userId },
    create: {
      id: who.userId,
      role: "THERAPIST",
      name,
      email: `${who.userId}@example.test`,
      active: true,
      // Never used to sign in; the test only needs the row to exist.
      passwordHash: "test-only-unusable-hash",
    },
    update: { active: true },
  });
  await prisma.therapistProfile.upsert({
    where: { id: who.therapistId },
    create: {
      id: who.therapistId,
      userId: who.userId,
      displayName: name,
      calendarId: `cal_${who.therapistId}`,
      active: true,
    },
    update: { active: true, displayName: name },
  });
  await prisma.therapistWorkingBlock.deleteMany({ where: { therapistId: who.therapistId } });
  await prisma.therapistWorkingBlock.create({
    // Weekday 3 is Wednesday in the stored schedule.
    data: { therapistId: who.therapistId, weekday: 3, ...hours },
  });
}

async function askForTimes(preferredTherapistId: string) {
  const patient = await prisma.patient.create({
    data: {
      phone: PHONE,
      displayName: "Ada Deneme",
      age: 30,
      hasTherapyHistory: false,
      availabilityNotes: "4 Kasım",
    },
  });
  const conversation = await prisma.conversation.create({
    data: {
      patientId: patient.id,
      phone: PHONE,
      source: "whatsapp",
      mode: "BOT",
      bookingStage: "AVAILABILITY",
      bookingPurpose: "NEW",
      sessionMode: "IN_PERSON",
      sessionModeConfirmed: true,
      preferredTherapistId,
      lastMessageAt: new Date(),
    },
  });
  const result = await handleInbound({
    phone: PHONE,
    text: "4 Kasım günü uygun saatleriniz neler?",
    patientId: patient.id,
    conversationId: conversation.id,
  });
  const saved = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversation.id },
  });
  return {
    outbound: result.diagnosis.outbound,
    botStopped: result.diagnosis.botStopped,
    offered: saved.offeredSlots.map((slot) => new Date(slot)),
    offeredTherapistId: saved.offeredTherapistId,
  };
}

beforeEach(async () => {
  if (!url) return;
  vi.useFakeTimers();
  // Two days before the requested day, inside working hours.
  vi.setSystemTime(new Date("2026-11-02T09:00:00+03:00"));
  const calendar = getCalendar() as MemoryCalendar;
  calendar.busy.length = 0;
  connected.clear();
  connected.add(ADA.userId);
  connected.add(BORA.userId);
  await seedTherapist(ADA, "Psikolog Ada Deneme", { startMinute: 600, endMinute: 780 });
  await seedTherapist(BORA, "Psikolog Bora Deneme", { startMinute: 600, endMinute: 780 });
  await prisma.appointment.deleteMany({ where: { patient: { phone: PHONE } } });
  await prisma.conversation.deleteMany({ where: { phone: PHONE } });
  await prisma.patient.deleteMany({ where: { phone: PHONE } });
});

afterAll(async () => {
  vi.useRealTimers();
  if (url) {
    await prisma.appointment.deleteMany({ where: { patient: { phone: PHONE } } });
    await prisma.conversation.deleteMany({ where: { phone: PHONE } });
    await prisma.patient.deleteMany({ where: { phone: PHONE } });
    for (const who of [ADA, BORA]) {
      await prisma.therapistWorkingBlock.deleteMany({
        where: { therapistId: who.therapistId },
      });
      await prisma.therapistProfile.deleteMany({ where: { id: who.therapistId } });
      await prisma.user.deleteMany({ where: { id: who.userId } });
    }
  }
  await prisma.$disconnect();
});

describe.skipIf(!url)("slots come from the related therapist's calendar", () => {
  it("offers times inside that therapist's own working hours", async () => {
    const result = await askForTimes(ADA.therapistId);
    expect(result.offered.length).toBeGreaterThan(0);
    expect(result.offeredTherapistId).toBe(ADA.therapistId);
    for (const slot of result.offered) {
      expect(istanbulDay(slot)).toBe(DAY);
      const minutes = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Istanbul",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(slot),
      ) * 60;
      // 10:00-13:00 for this therapist; a 50-minute session must fit.
      expect(minutes).toBeGreaterThanOrEqual(600);
      expect(minutes + 50).toBeLessThanOrEqual(780);
    }
  });

  it("drops a slot the therapist's own Google calendar marks busy", async () => {
    const calendar = getCalendar() as MemoryCalendar;
    calendar.addBusy({ ownerUserId: ADA.userId, startAt: at(10), endAt: at(11) });
    const result = await askForTimes(ADA.therapistId);
    expect(result.offered.length).toBeGreaterThan(0);
    expect(result.offered.some((slot) => slot.getTime() === at(10).getTime())).toBe(false);
  });

  it("keeps a slot that only another therapist is busy for", async () => {
    const calendar = getCalendar() as MemoryCalendar;
    // Bora is fully booked; Ada's 10:00 must survive.
    calendar.addBusy({ ownerUserId: BORA.userId, startAt: at(10), endAt: at(13) });
    const result = await askForTimes(ADA.therapistId);
    expect(result.offeredTherapistId).toBe(ADA.therapistId);
    expect(result.offered.some((slot) => slot.getTime() === at(10).getTime())).toBe(true);
  });

  it("drops a slot already taken by that therapist's appointment", async () => {
    const other = await prisma.patient.create({
      data: { phone: PHONE, displayName: "Bora Deneme", age: 31, hasTherapyHistory: false },
    });
    await prisma.appointment.create({
      data: {
        patientId: other.id,
        therapistId: ADA.therapistId,
        startAt: at(10),
        endAt: at(10, 50),
        status: "SCHEDULED",
        source: "staff",
      },
    });
    const result = await askForTimes(ADA.therapistId);
    expect(result.offered.some((slot) => slot.getTime() === at(10).getTime())).toBe(false);
  });

  it("promises no time when that therapist has no calendar connection", async () => {
    connected.delete(ADA.therapistId);
    connected.delete(ADA.userId);
    const result = await askForTimes(ADA.therapistId);
    expect(result.offered).toHaveLength(0);
    expect(result.outbound).not.toContain("Uygun saatler");
    expect(result.botStopped).toBe(true);
  });

  it("still offers times for a connected therapist when another is disconnected", async () => {
    connected.delete(BORA.userId);
    const result = await askForTimes(ADA.therapistId);
    expect(result.offered.length).toBeGreaterThan(0);
    expect(result.offeredTherapistId).toBe(ADA.therapistId);
  });
});
