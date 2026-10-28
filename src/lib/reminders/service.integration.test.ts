import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MemoryWhatsApp } from "@/lib/adapters/whatsapp";
import { createReminderService } from "./service";

const url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL) throw new Error("Separate test DB required");
describe.skipIf(!url)("reminder state transitions (database)", () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const suffix = randomUUID();
  let userId: string;
  let therapistId: string;
  const patientIds: string[] = [];
  const current = new Date("2035-06-01T09:00:00Z");
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `reminder-${suffix}@test.local`,
        name: "Test",
        role: "THERAPIST",
        passwordHash: "unused",
      },
    });
    userId = user.id;
    therapistId = (
      await prisma.therapistProfile.create({
        data: { userId, displayName: "Test Uzman" },
      })
    ).id;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.conversation.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
    if (therapistId) await prisma.therapistProfile.delete({ where: { id: therapistId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });
  async function fixture(offsetHours = 23) {
    const patient = await prisma.patient.create({
      data: { phone: `reminder:${randomUUID()}`, displayName: "Ali Kara" },
    });
    patientIds.push(patient.id);
    const conversation = await prisma.conversation.create({
      data: { patientId: patient.id, phone: patient.phone },
    });
    const startAt = new Date(current.getTime() + offsetHours * 3600000);
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        therapistId,
        startAt,
        endAt: new Date(startAt.getTime() + 3000000),
      },
    });
    return { appointment, conversation };
  }
  const run = (whatsapp = new MemoryWhatsApp()) =>
    createReminderService({ prisma, whatsapp, now: () => current }).sendDueReminders();

  it("sends once across two workers, persists the message, and skips the next run", async () => {
    const { appointment, conversation } = await fixture();
    const wa = new MemoryWhatsApp();
    await Promise.all([run(wa), run(wa)]);
    await run(wa);
    expect(wa.sent.filter((m) => m.conversationId === conversation.id)).toHaveLength(1);
    expect(
      await prisma.message.count({ where: { conversationId: conversation.id } }),
    ).toBe(1);
    expect(
      (await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } }))
        .reminderSentAt,
    ).not.toBeNull();
  });

  it("does not remind cancelled, past or more-than-24-hour appointments", async () => {
    const cancelled = await fixture();
    await prisma.appointment.update({
      where: { id: cancelled.appointment.id },
      data: { status: "CANCELLED" },
    });
    const past = await fixture(-1);
    const future = await fixture(25);
    const wa = new MemoryWhatsApp();
    await run(wa);
    for (const f of [cancelled, past, future])
      expect(wa.sent.some((m) => m.conversationId === f.conversation.id)).toBe(false);
  });

  it("rechecks cancellation after the candidate list was read", async () => {
    const { appointment, conversation } = await fixture();
    const find = prisma.appointment.findMany.bind(prisma.appointment);
    vi.spyOn(prisma.appointment, "findMany").mockImplementationOnce((async (
      args: Parameters<typeof find>[0],
    ) => {
      const found = await find(args);
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: "CANCELLED" },
      });
      return found;
    }) as unknown as typeof find);
    const wa = new MemoryWhatsApp();
    await run(wa);
    expect(wa.sent.some((m) => m.conversationId === conversation.id)).toBe(false);
  });

  it("uses a rescheduled time and sends a new reminder for the new slot", async () => {
    const { appointment, conversation } = await fixture();
    const wa = new MemoryWhatsApp();
    await run(wa);
    const startAt = new Date(current.getTime() + 22 * 3600000);
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { startAt, reminderSentAt: null },
    });
    await run(wa);
    const messages = wa.sent.filter((m) => m.conversationId === conversation.id);
    expect(messages).toHaveLength(2);
    expect(messages[1].text).toContain("10:00");
    expect(messages[1].idempotencyKey).not.toBe(messages[0].idempotencyKey);
  });

  it("retries a failed recipient without blocking others", async () => {
    const failed = await fixture();
    const next = await fixture();
    const wa = new MemoryWhatsApp();
    const send = wa.sendMessage.bind(wa);
    vi.spyOn(wa, "sendMessage").mockImplementation(async (input) => {
      if (input.conversationId === failed.conversation.id) throw new Error("unavailable");
      return send(input);
    });
    expect((await run(wa)).failed).toBeGreaterThan(0);
    expect(wa.sent.some((m) => m.conversationId === next.conversation.id)).toBe(true);
    expect(
      (
        await prisma.appointment.findUniqueOrThrow({
          where: { id: failed.appointment.id },
        })
      ).reminderSentAt,
    ).toBeNull();
    vi.restoreAllMocks();
    await run(wa);
    expect(wa.sent.some((m) => m.conversationId === failed.conversation.id)).toBe(true);
  });
});
