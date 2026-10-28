import { createCancellationDelivery } from "./cancellation-delivery";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MemoryCalendar } from "@/lib/adapters/calendar";
import { MemoryWhatsApp } from "@/lib/adapters/whatsapp";
import { hashPassword } from "@/lib/auth/password";
import type { Actor } from "@/lib/auth/rbac";
import {
  ConflictError,
  ForbiddenError,
  ScheduleConflictError,
  createActionRequestService,
} from "@/lib/queue/action-request-service";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl && databaseUrl === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must be separate from the application database.");
}

describe.skipIf(!databaseUrl)("ActionRequestService", () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const suffix = `${Date.now()}`;
  let admin: Actor;
  let therapistSelin: Actor;
  let therapistBaris: Actor;

  beforeAll(async () => {
    await prisma.$connect();
    const passwordHash = hashPassword("test-pass");
    const adminUser = await prisma.user.create({
      data: {
        role: "ADMIN",
        name: "Admin",
        email: `admin-${suffix}@t.local`,
        passwordHash,
      },
    });
    const selinUser = await prisma.user.create({
      data: {
        role: "THERAPIST",
        name: "Selin",
        email: `selin-${suffix}@t.local`,
        passwordHash,
      },
    });
    const barisUser = await prisma.user.create({
      data: {
        role: "THERAPIST",
        name: "Baris",
        email: `baris-${suffix}@t.local`,
        passwordHash,
      },
    });
    const selin = await prisma.therapistProfile.create({
      data: {
        userId: selinUser.id,
        displayName: "Selin",
        specialties: [],
        active: false,
      },
    });
    const baris = await prisma.therapistProfile.create({
      data: {
        userId: barisUser.id,
        displayName: "Baris",
        specialties: [],
        active: false,
      },
    });
    admin = { userId: adminUser.id, role: "ADMIN", therapistProfileId: null };
    therapistSelin = {
      userId: selinUser.id,
      role: "THERAPIST",
      therapistProfileId: selin.id,
    };
    therapistBaris = {
      userId: barisUser.id,
      role: "THERAPIST",
      therapistProfileId: baris.id,
    };
  });

  afterAll(async () => {
    if (!admin || !therapistSelin || !therapistBaris) {
      await prisma.$disconnect();
      return;
    }
    const testUsers = [admin.userId, therapistSelin.userId, therapistBaris.userId];
    const testTherapists = [
      therapistSelin.therapistProfileId!,
      therapistBaris.therapistProfileId!,
    ];
    const testPatients = await prisma.patient.findMany({
      where: { phone: { contains: suffix } },
      select: { id: true },
    });
    const patientIds = testPatients.map((patient) => patient.id);
    const testAppointments = await prisma.appointment.findMany({
      where: { patientId: { in: patientIds } },
      select: { id: true },
    });
    const appointmentIds = testAppointments.map((appointment) => appointment.id);
    const testConversations = await prisma.conversation.findMany({
      where: { patientId: { in: patientIds } },
      select: { id: true },
    });
    const conversationIds = testConversations.map((conversation) => conversation.id);
    await prisma.notification.deleteMany({ where: { recipientId: { in: testUsers } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: testUsers } } });
    await prisma.actionRequest.deleteMany({
      where: {
        OR: [
          { appointmentId: { in: appointmentIds } },
          { conversationId: { in: conversationIds } },
        ],
      },
    });
    await prisma.appointmentNote.deleteMany({
      where: { appointmentId: { in: appointmentIds } },
    });
    await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
    await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.therapistProfile.deleteMany({ where: { id: { in: testTherapists } } });
    await prisma.user.deleteMany({ where: { id: { in: testUsers } } });
    await prisma.$disconnect();
  });

  it("deduplicates concurrent same-day cancellations without changing the appointment", async () => {
    const calendar = new MemoryCalendar();
    const whatsapp = new MemoryWhatsApp();
    const frozen = new Date("2026-03-14T09:30:00+03:00");
    const service = createActionRequestService({
      prisma,
      calendar,
      whatsapp,
      now: () => frozen,
      timeZone: "Europe/Istanbul",
    });
    const patient = await prisma.patient.create({
      data: {
        phone: `+90555${suffix}1`,
        displayName: "Mehmet Test",
        age: 30,
        hasTherapyHistory: false,
        availabilityNotes: "Salı 15:00",
      },
    });
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        therapistId: therapistBaris.therapistProfileId!,
        startAt: new Date("2026-03-14T11:00:00+03:00"),
        endAt: new Date("2026-03-14T11:50:00+03:00"),
        status: "SCHEDULED",
      },
    });

    const actions = await Promise.all(
      Array.from({ length: 4 }, () =>
        service.applyIncomingCancel({ appointmentId: appointment.id }),
      ),
    );
    const action = actions[0];
    expect(new Set(actions.map((item) => item.id)).size).toBe(1);
    const updated = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    const notes = await prisma.notification.findMany({
      where: {
        type: "same_day_cancel",
        payload: { path: ["appointmentId"], equals: appointment.id },
      },
    });

    expect(action.status).toBe("PENDING");
    expect(updated.status).toBe("SCHEDULED");
    expect(updated.version).toBe(appointment.version);
    expect(action.proposedChanges).toMatchObject({
      appointmentVersion: appointment.version,
    });
    expect(calendar.cancels).toHaveLength(0);
    expect(notes).toHaveLength(0);
    expect(
      await prisma.actionRequest.count({
        where: { appointmentId: appointment.id, type: "CANCEL" },
      }),
    ).toBe(1);
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: "CANCELLED" },
    });
    await expect(
      service.applyIncomingCancel({ appointmentId: appointment.id }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  async function cancellationFixture(tag: string) {
    const calendar = new MemoryCalendar();
    const whatsapp = new MemoryWhatsApp();
    const service = createActionRequestService({
      prisma,
      calendar,
      whatsapp,
      now: () => new Date("2026-03-14T09:00:00Z"),
    });
    const patient = await prisma.patient.create({
      data: {
        phone: `test:${suffix}:${tag}`,
        displayName: "Test Hasta",
      },
    });
    const conversation = await prisma.conversation.create({
      data: {
        patientId: patient.id,
        phone: patient.phone,
      },
    });
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        therapistId: therapistSelin.therapistProfileId!,
        startAt: new Date("2026-03-14T12:00:00Z"),
        endAt: new Date("2026-03-14T12:50:00Z"),
      },
    });
    const action = await service.applyIncomingCancel({
      appointmentId: appointment.id,
      conversationId: conversation.id,
    });
    return { calendar, whatsapp, service, appointment, action };
  }

  it("serializes simultaneous approval and rejection", async () => {
    const { service, action, appointment, calendar, whatsapp } =
      await cancellationFixture("review-race");
    const results = await Promise.allSettled([
      service.approve(admin, action.id),
      service.reject(admin, action.id),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const saved = await prisma.actionRequest.findUniqueOrThrow({
      where: { id: action.id },
    });
    const current = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(current.status).toBe(saved.status === "APPROVED" ? "CANCELLED" : "SCHEDULED");
    expect(calendar.cancels).toHaveLength(saved.status === "APPROVED" ? 1 : 0);
    expect(whatsapp.sent).toHaveLength(1);
  });

  it("sends the final cancellation result and rejects a second approval", async () => {
    const { service, action, calendar, whatsapp } =
      await cancellationFixture("approved-reply");
    await service.approve(admin, action.id);
    expect(whatsapp.sent[0].text).toContain("Randevunuz iptal edildi");
    expect(whatsapp.sent[0].text).not.toContain("onayı bekliyor");
    await expect(service.approve(admin, action.id)).rejects.toBeInstanceOf(ConflictError);
    expect(calendar.cancels).toHaveLength(1);
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: action.conversationId! },
    });
    expect(conversation.bookingStage).toBe("GREETING");
    expect(conversation.offeredSlots).toEqual([]);
  });

  it("requires recheck when the appointment version changed before approval", async () => {
    const { service, action, appointment, calendar } =
      await cancellationFixture("stale-version");
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { version: { increment: 1 } },
    });
    expect((await service.approve(admin, action.id)).status).toBe("NEEDS_RECHECK");
    expect(calendar.cancels).toHaveLength(0);
  });

  it("refuses cancellation of a completed appointment even if its version was not advanced", async () => {
    const { service, action, appointment, calendar } =
      await cancellationFixture("completed");
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: "COMPLETED" },
    });
    await expect(service.approve(admin, action.id)).rejects.toBeInstanceOf(ConflictError);
    expect(calendar.cancels).toHaveLength(0);
  });

  it("persists approved cancellation for retry when the calendar fails", async () => {
    const { service, action, appointment, calendar, whatsapp } =
      await cancellationFixture("calendar-failure");
    calendar.cancelEvent = async () => {
      throw new Error("calendar unavailable");
    };
    expect((await service.approve(admin, action.id)).status).toBe("APPROVED");
    expect(
      (await prisma.actionRequest.findUniqueOrThrow({ where: { id: action.id } })).status,
    ).toBe("APPROVED");
    expect(
      (await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } }))
        .status,
    ).toBe("CANCELLED");
    expect(whatsapp.sent).toHaveLength(0);
    const job = await prisma.cancellationDelivery.findUniqueOrThrow({
      where: { actionId: action.id },
    });
    expect(job.completedAt).toBeNull();
    expect(job.attempts).toBe(1);
    expect(job.lastError).toBe("delivery_failed");
    calendar.cancelEvent = MemoryCalendar.prototype.cancelEvent.bind(calendar);
    // New service instance represents a restarted worker after backoff.
    const worker = createCancellationDelivery({
      prisma,
      calendar,
      whatsapp,
      now: () => new Date("2026-03-14T09:01:00Z"),
    });
    expect(await worker.deliver(action.id)).toBe("completed");
    expect(await worker.deliver(action.id)).toBe("skipped");
    expect(calendar.cancels).toHaveLength(1);
    expect(whatsapp.sent).toHaveLength(1);
  });

  it("claims a failed job once across concurrent workers and recovers an expired lease", async () => {
    const { service, action, calendar, whatsapp } =
      await cancellationFixture("worker-race");
    calendar.cancelEvent = async () => {
      throw new Error("offline");
    };
    await service.approve(admin, action.id);
    calendar.cancelEvent = MemoryCalendar.prototype.cancelEvent.bind(calendar);
    const worker = createCancellationDelivery({
      prisma,
      calendar,
      whatsapp,
      now: () => new Date("2026-03-14T09:05:00Z"),
    });
    await prisma.cancellationDelivery.update({
      where: { actionId: action.id },
      data: {
        leaseToken: "crashed-worker",
        leaseUntil: new Date("2026-03-14T09:06:00Z"),
      },
    });
    expect(await worker.deliver(action.id)).toBe("skipped");
    await prisma.cancellationDelivery.update({
      where: { actionId: action.id },
      data: { leaseUntil: new Date("2026-03-14T09:04:00Z") },
    });
    const results = await Promise.all(
      Array.from({ length: 4 }, () => worker.deliver(action.id)),
    );
    expect(results.filter((result) => result === "completed")).toHaveLength(1);
    expect(calendar.cancels).toHaveLength(1);
    expect(whatsapp.sent).toHaveLength(1);
    expect(
      await prisma.message.count({ where: { providerMessageId: `cancel:${action.id}` } }),
    ).toBe(1);
  });

  it("retries the message without deleting the calendar event again", async () => {
    const { service, action, calendar, whatsapp } =
      await cancellationFixture("message-retry");
    whatsapp.sendMessage = async () => {
      throw new Error("offline");
    };
    await service.approve(admin, action.id);
    expect(calendar.cancels).toHaveLength(1);
    const job = await prisma.cancellationDelivery.findUniqueOrThrow({
      where: { actionId: action.id },
    });
    expect(job.calendarSyncedAt).not.toBeNull();
    expect(job.completedAt).toBeNull();
    whatsapp.sendMessage = MemoryWhatsApp.prototype.sendMessage.bind(whatsapp);
    const worker = createCancellationDelivery({
      prisma,
      calendar,
      whatsapp,
      now: () => new Date("2026-03-14T09:01:00Z"),
    });
    await worker.deliver(action.id);
    expect(calendar.cancels).toHaveLength(1);
    expect(whatsapp.sent).toHaveLength(1);
  });

  it("resumes an uncertain calendar result using the persisted event identity", async () => {
    const { service, action, calendar, whatsapp } =
      await cancellationFixture("uncertain-delete");
    const deleted = new Set<string>();
    calendar.cancelEvent = async (input) => {
      const key = input.calendarEventId ?? "test-event";
      if (deleted.has(key)) return;
      deleted.add(key);
      throw new Error("connection lost after external deletion");
    };
    await service.approve(admin, action.id);
    expect(whatsapp.sent).toHaveLength(0);
    const worker = createCancellationDelivery({
      prisma,
      calendar,
      whatsapp,
      now: () => new Date("2026-03-14T09:01:00Z"),
    });
    expect(await worker.deliver(action.id)).toBe("completed");
    expect(deleted.size).toBe(1);
    expect(whatsapp.sent).toHaveLength(1);
  });

  it("commits the outbox before external deletion and recovers a DB failure after deletion", async () => {
    const { service, action, appointment, calendar, whatsapp } =
      await cancellationFixture("db-after-delete");
    let fail = true;
    const originalUpdateMany = prisma.cancellationDelivery.updateMany;
    calendar.cancelEvent = async () => {
      // These independent reads cannot see uncommitted transaction writes.
      expect(
        await prisma.cancellationDelivery.count({ where: { actionId: action.id } }),
      ).toBe(1);
      expect(
        (await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } }))
          .status,
      ).toBe("CANCELLED");
      if (fail) {
        fail = false;
        prisma.cancellationDelivery.updateMany = () => {
          prisma.cancellationDelivery.updateMany = originalUpdateMany;
          throw new Error("DB connection lost");
        };
      }
    };
    try {
      await service.approve(admin, action.id);
      expect(whatsapp.sent).toHaveLength(0);
      expect(
        (
          await prisma.cancellationDelivery.findUniqueOrThrow({
            where: { actionId: action.id },
          })
        ).calendarSyncedAt,
      ).toBeNull();
    } finally {
      prisma.cancellationDelivery.updateMany = originalUpdateMany;
    }
    const worker = createCancellationDelivery({
      prisma,
      calendar,
      whatsapp,
      now: () => new Date("2026-03-14T09:01:00Z"),
    });
    expect(await worker.deliver(action.id)).toBe("completed");
    expect(whatsapp.sent).toHaveLength(1);
  });

  it("marks the later request as needs_recheck when another was already approved", async () => {
    const calendar = new MemoryCalendar();
    const service = createActionRequestService({
      now: () => new Date("2026-03-01T00:00:00Z"),
      prisma,
      calendar,
      whatsapp: new MemoryWhatsApp(),
    });
    const patient = await prisma.patient.create({
      data: {
        phone: `+90555${suffix}2`,
        displayName: "Ayse Test",
        age: 30,
        hasTherapyHistory: false,
        availabilityNotes: "Salı 15:00",
      },
    });
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        therapistId: therapistSelin.therapistProfileId!,
        startAt: new Date("2026-03-20T15:30:00+03:00"),
        endAt: new Date("2026-03-20T16:20:00+03:00"),
        status: "SCHEDULED",
      },
    });
    const first = await prisma.actionRequest.create({
      data: {
        type: "CANCEL",
        appointmentId: appointment.id,
        status: "PENDING",
        proposedChanges: {},
      },
    });
    const second = await prisma.actionRequest.create({
      data: {
        type: "RESCHEDULE",
        appointmentId: appointment.id,
        status: "PENDING",
        proposedChanges: {
          startAt: "2026-03-21T11:00:00.000+03:00",
          endAt: "2026-03-21T11:50:00.000+03:00",
        },
      },
    });

    await service.approve(admin, first.id);
    const result = await service.approve(admin, second.id);

    expect(result.status).toBe("NEEDS_RECHECK");
    const audit = await prisma.auditEvent.findFirst({
      where: { entityId: first.id, action: "action.approved" },
    });
    expect(audit).not.toBeNull();
  });

  it("forbids a therapist from viewing another therapist's action", async () => {
    const service = createActionRequestService({
      now: () => new Date("2026-03-01T00:00:00Z"),
      prisma,
      calendar: new MemoryCalendar(),
      whatsapp: new MemoryWhatsApp(),
    });
    const patient = await prisma.patient.create({
      data: {
        phone: `+90555${suffix}3`,
        displayName: "Mert Test",
        age: 30,
        hasTherapyHistory: false,
        availabilityNotes: "Salı 15:00",
      },
    });
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        therapistId: therapistSelin.therapistProfileId!,
        startAt: new Date("2026-03-22T17:00:00+03:00"),
        endAt: new Date("2026-03-22T17:50:00+03:00"),
        status: "SCHEDULED",
      },
    });
    const action = await prisma.actionRequest.create({
      data: {
        type: "NEW_BOOKING",
        appointmentId: appointment.id,
        status: "PENDING",
        proposedChanges: {},
      },
    });

    await expect(service.getForActor(therapistBaris, action.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("lets a therapist approve their own queue item", async () => {
    const service = createActionRequestService({
      now: () => new Date("2026-03-01T00:00:00Z"),
      prisma,
      calendar: new MemoryCalendar(),
      whatsapp: new MemoryWhatsApp(),
    });
    const patient = await prisma.patient.create({
      data: {
        phone: `+90555${suffix}4`,
        displayName: "Deniz Test",
        age: 30,
        hasTherapyHistory: false,
        availabilityNotes: "Salı 15:00",
      },
    });
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        therapistId: therapistSelin.therapistProfileId!,
        startAt: new Date("2026-03-23T17:00:00+03:00"),
        endAt: new Date("2026-03-23T17:50:00+03:00"),
        status: "SCHEDULED",
      },
    });
    const action = await prisma.actionRequest.create({
      data: {
        type: "CANCEL",
        appointmentId: appointment.id,
        status: "PENDING",
        proposedChanges: {},
      },
    });

    const approved = await service.approve(therapistSelin, action.id);
    expect(approved.status).toBe("APPROVED");
  });

  it("blocks the second booking for the same therapist and lets an admin correct it", async () => {
    const service = createActionRequestService({
      now: () => new Date("2026-03-01T00:00:00Z"),
      prisma,
      calendar: new MemoryCalendar(),
      whatsapp: new MemoryWhatsApp(),
    });
    const firstPatient = await prisma.patient.create({
      data: {
        phone: `+90555${suffix}51`,
        displayName: "Birinci Hasta",
        age: 30,
        hasTherapyHistory: false,
        availabilityNotes: "Salı 15:00",
      },
    });
    const secondPatient = await prisma.patient.create({
      data: {
        phone: `+90555${suffix}52`,
        displayName: "İkinci Hasta",
        age: 30,
        hasTherapyHistory: false,
        availabilityNotes: "Salı 15:00",
      },
    });
    const firstConversation = await prisma.conversation.create({
      data: { patientId: firstPatient.id, phone: firstPatient.phone },
    });
    const secondConversation = await prisma.conversation.create({
      data: { patientId: secondPatient.id, phone: secondPatient.phone },
    });
    const sharedSlot = {
      startAt: "2026-04-06T10:00:00.000+03:00",
      endAt: "2026-04-06T10:50:00.000+03:00",
      therapistId: therapistSelin.therapistProfileId!,
    };
    const first = await prisma.actionRequest.create({
      data: {
        type: "NEW_BOOKING",
        conversationId: firstConversation.id,
        status: "PENDING",
        proposedChanges: sharedSlot,
      },
    });
    const second = await prisma.actionRequest.create({
      data: {
        type: "NEW_BOOKING",
        conversationId: secondConversation.id,
        status: "PENDING",
        proposedChanges: sharedSlot,
      },
    });

    await service.approve(admin, first.id);
    await expect(service.approve(admin, second.id)).rejects.toBeInstanceOf(
      ScheduleConflictError,
    );
    expect(
      (await prisma.actionRequest.findUniqueOrThrow({ where: { id: second.id } })).status,
    ).toBe("NEEDS_RECHECK");

    await service.edit(admin, second.id, {
      startAt: new Date("2026-04-06T11:00:00.000+03:00"),
      endAt: new Date("2026-04-06T11:50:00.000+03:00"),
    });
    const edited = await prisma.actionRequest.findUniqueOrThrow({ where: { id: second.id } });
    expect((edited.proposedChanges as { operationalSummary: string }).operationalSummary).toContain("11:00");
    expect((edited.proposedChanges as { operationalSummary: string }).operationalSummary).not.toContain("10:00");
    expect((await service.approve(admin, second.id)).status).toBe("APPROVED");
  });
  it("allows a direct booking without a conversation and rejects a competing booking", async () => {
    const service = createActionRequestService({
      prisma,
      calendar: new MemoryCalendar(),
      whatsapp: new MemoryWhatsApp(),
      now: () => new Date("2026-03-01T00:00:00Z"),
    });
    const patient = await prisma.patient.create({
      data: {
        phone: `+90555${suffix}71`,
        displayName: "Takvim Müşterisi",
        age: 30,
        hasTherapyHistory: false,
        availabilityNotes: "Salı 15:00",
      },
    });
    const changes = {
      patientId: patient.id,
      therapistId: therapistSelin.therapistProfileId!,
      startAt: "2026-04-12T10:00:00Z",
      endAt: "2026-04-12T10:50:00Z",
    };
    const first = await prisma.actionRequest.create({
      data: { type: "NEW_BOOKING", proposedChanges: changes },
    });
    const second = await prisma.actionRequest.create({
      data: { type: "NEW_BOOKING", proposedChanges: changes },
    });
    const results = await Promise.allSettled([
      service.approve(admin, first.id),
      service.approve(admin, second.id),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.appointment.count({ where: { patientId: patient.id } })).toBe(1);
  });

  it("allows later calendar edits while detecting a stale appointment version", async () => {
    const service = createActionRequestService({
      prisma,
      calendar: new MemoryCalendar(),
      whatsapp: new MemoryWhatsApp(),
      now: () => new Date("2026-03-01T00:00:00Z"),
    });
    const patient = await prisma.patient.create({
      data: {
        phone: `+90555${suffix}72`,
        displayName: "Takvim Düzenleme",
        age: 30,
        hasTherapyHistory: false,
        availabilityNotes: "Salı 15:00",
      },
    });
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        therapistId: therapistBaris.therapistProfileId!,
        startAt: new Date("2026-04-15T10:00:00Z"),
        endAt: new Date("2026-04-15T10:50:00Z"),
      },
    });
    const make = (day: number, version: number) =>
      prisma.actionRequest.create({
        data: {
          type: "RESCHEDULE",
          appointmentId: appointment.id,
          proposedChanges: {
            appointmentVersion: version,
            startAt: `2026-04-${day}T10:00:00Z`,
            endAt: `2026-04-${day}T10:50:00Z`,
          },
        },
      });
    const first = await make(16, 0);
    expect((await service.approve(admin, first.id)).status).toBe("APPROVED");
    const next = await make(17, 1);
    expect((await service.approve(admin, next.id)).status).toBe("APPROVED");
    const stale = await make(18, 0);
    expect((await service.approve(admin, stale.id)).status).toBe("NEEDS_RECHECK");
    expect(
      (await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } }))
        .version,
    ).toBe(2);
  });

  it("denies bot reactivation and messages for another therapist and orphan conversations", async () => {
    const service = createActionRequestService({
      prisma,
      calendar: new MemoryCalendar(),
      whatsapp: new MemoryWhatsApp(),
    });
    const patient = await prisma.patient.create({
      data: {
        phone: `+90555${suffix}73`,
        displayName: "Atanmamış Test",
        age: 30,
        hasTherapyHistory: false,
        availabilityNotes: "Salı 15:00",
      },
    });
    const conversation = await prisma.conversation.create({
      data: { patientId: patient.id, phone: patient.phone, mode: "HUMAN" },
    });
    await expect(
      service.reactivateBot(therapistSelin, conversation.id, therapistSelin.userId),
    ).rejects.toThrow();
    await expect(
      service.sendStaffMessage(
        therapistSelin,
        conversation.id,
        therapistSelin.userId,
        "test",
      ),
    ).rejects.toThrow();
    expect(
      (await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } }))
        .mode,
    ).toBe("HUMAN");
  });
  it("blocks all approval side effects for an incomplete profile, then approves the edited profile", async () => {
    const calendar = new MemoryCalendar();
    const whatsapp = new MemoryWhatsApp();
    const service = createActionRequestService({
      prisma,
      calendar,
      whatsapp,
      now: () => new Date("2026-03-01T00:00:00Z"),
    });
    const patient = await prisma.patient.create({
      data: { phone: `demo:${suffix}guard`, displayName: "ALİ KARA" },
    });
    expect(patient.displayName).toBe("ali kara");
    const conversation = await prisma.conversation.create({
      data: { patientId: patient.id, phone: patient.phone, source: "demo" },
    });
    const action = await prisma.actionRequest.create({
      data: {
        type: "NEW_BOOKING",
        conversationId: conversation.id,
        proposedChanges: {
          therapistId: therapistSelin.therapistProfileId,
          startAt: "2026-03-24T12:00:00Z",
          endAt: "2026-03-24T12:50:00Z",
        },
      },
    });
    await expect(service.approve(admin, action.id)).rejects.toBeInstanceOf(ConflictError);
    expect(calendar.updates).toHaveLength(0);
    expect(whatsapp.sent).toHaveLength(0);
    await prisma.patient.update({
      where: { id: patient.id },
      data: { age: 27, hasTherapyHistory: false, availabilityNotes: "Salı 15" },
    });
    await expect(
      service.approve({ ...admin, role: "INTERN" }, action.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await service.approve(admin, action.id)).status).toBe("APPROVED");
    expect(calendar.updates).toHaveLength(1);
    expect(calendar.updates[0].summary).toContain("Ali Kara");
    expect(whatsapp.sent[0].text).toContain("onaylanmıştır. Sağlıklı günler dileriz. 🌸");
    const saved = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(saved.bookingStage).toBe("CONFIRMED");
    expect(saved.offeredSlots).toEqual([]);
  });

  it("rejected new booking resumes intake and does not claim an appointment exists", async () => {
    const whatsapp = new MemoryWhatsApp();
    const service = createActionRequestService({
      prisma,
      whatsapp,
      calendar: new MemoryCalendar(),
    });
    const patient = await prisma.patient.create({
      data: { phone: `test:${suffix}:rejected-new`, displayName: "Ali" },
    });
    const conversation = await prisma.conversation.create({
      data: {
        patientId: patient.id,
        phone: patient.phone,
        bookingStage: "PENDING_APPROVAL",
        preferredTherapistId: therapistSelin.therapistProfileId,
        offeredSlots: ["2035-06-01T10:00:00Z"],
        offeredAt: new Date(),
      },
    });
    const action = await prisma.actionRequest.create({
      data: {
        type: "NEW_BOOKING",
        conversationId: conversation.id,
        proposedChanges: { therapistId: therapistSelin.therapistProfileId },
      },
    });
    await service.reject(admin, action.id);
    const saved = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(saved.bookingStage).toBe("INTAKE");
    expect(saved.offeredSlots).toEqual([]);
    expect(whatsapp.sent[0].text).toContain("onaylanamadı");
    expect(whatsapp.sent[0].text).not.toContain("aynı kaldı");
    await expect(service.approve(admin, action.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("persists a past cancellation as NO_SHOW_REVIEW without cancelling the calendar event", async () => {
    const calendar = new MemoryCalendar();
    const service = createActionRequestService({
      prisma,
      calendar,
      whatsapp: new MemoryWhatsApp(),
      now: () => new Date("2026-03-14T12:00:00Z"),
    });
    const patient = await prisma.patient.create({
      data: { phone: `demo:${suffix}past`, displayName: "IŞIL İNCE" },
    });
    expect(patient.displayName).toBe("ışıl ince");
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        therapistId: therapistSelin.therapistProfileId!,
        startAt: new Date("2026-03-14T10:00:00Z"),
        endAt: new Date("2026-03-14T10:50:00Z"),
      },
    });
    await service.applyIncomingCancel({ appointmentId: appointment.id });
    expect(
      (await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } }))
        .status,
    ).toBe("NO_SHOW_REVIEW");
    expect(calendar.cancels).toHaveLength(0);
  });
});
