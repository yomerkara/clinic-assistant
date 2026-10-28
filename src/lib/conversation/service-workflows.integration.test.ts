import { PrismaClient } from "@prisma/client";
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { MemoryCalendar } from "@/lib/adapters/calendar";
import { MemoryWhatsApp } from "@/lib/adapters/whatsapp";
import {
  processOnlineSession,
  runAppointmentLifecycle,
} from "@/lib/calendar/online-sessions";
import { notifyWaitingList, planRecurringAppointments } from "./service-workflows";
import { createActionRequestService } from "@/lib/queue/action-request-service";
import { exportPatientData, erasePatientData } from "@/lib/patients/privacy";

const url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL) throw new Error("Separate test DB required");
describe.skipIf(!url)("service workflows with real persistence", () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const now = new Date("2026-10-13T10:00:00+03:00");
  const ids: string[] = [];
  let actorId: string, therapistId: string;
  const deps = () => ({
    prisma,
    calendar: new MemoryCalendar(),
    whatsapp: new MemoryWhatsApp(),
    now: () => now,
  });
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "Workflow test",
        email: `${crypto.randomUUID()}@test.local`,
        passwordHash: "unused",
        role: "ADMIN",
        therapistProfile: { create: { displayName: "Uzman Test" } },
      },
      include: { therapistProfile: true },
    });
    actorId = user.id;
    therapistId = user.therapistProfile!.id;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await prisma.actionRequest.deleteMany({
      where: { conversation: { patientId: { in: ids } } },
    });
    await prisma.conversation.deleteMany({ where: { patientId: { in: ids } } });
    await prisma.appointment.deleteMany({ where: { patientId: { in: ids } } });
    await prisma.patient.deleteMany({ where: { id: { in: ids } } });
    if (actorId) await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  });
  async function fixture(kind = "ONLINE") {
    const patient = await prisma.patient.create({
      data: {
        phone: `workflow:${crypto.randomUUID()}`,
        displayName: "deniz örnek",
        age: 30,
        hasTherapyHistory: true,
        availabilityNotes: "salı öğleden sonra",
      },
    });
    ids.push(patient.id);
    const conversation = await prisma.conversation.create({
      data: { patientId: patient.id, phone: patient.phone },
    });
    const request = await prisma.serviceRequest.create({
      data: {
        kind,
        conversationId: conversation.id,
        messageId: crypto.randomUUID(),
        summary: "test",
      },
    });
    return { patient, conversation, request };
  }
  async function appointment(patientId: string, offset = 10, mode = "ONLINE") {
    return prisma.appointment.create({
      data: {
        patientId,
        therapistId,
        startAt: new Date(now.getTime() + offset * 60000),
        endAt: new Date(now.getTime() + (offset + 50) * 60000),
        sessionMode: mode,
        calendarEventId: `event_${crypto.randomUUID()}`,
        status: "CONFIRMED",
      },
    });
  }
  it("prepares Meet early, sends at ten minutes, and serializes concurrent manual/automatic sends", async () => {
    const f = await fixture();
    const a = await appointment(f.patient.id, 30);
    const d = deps();
    expect(await processOnlineSession(d, a.id)).toBe("ready");
    expect(d.whatsapp.sent).toHaveLength(0);
    const near = { ...d, now: () => new Date(now.getTime() + 20 * 60000) };
    const results = await Promise.all([
      processOnlineSession(near, a.id),
      processOnlineSession(near, a.id, true),
    ]);
    expect(results.sort()).toEqual(["already_sent", "sent"]);
    expect(d.whatsapp.sent).toHaveLength(1);
    expect(
      (await prisma.appointment.findUniqueOrThrow({ where: { id: a.id } })).meetingSentAt,
    ).not.toBeNull();
  });
  it("does not mark a failed message sent and retries without duplicates", async () => {
    const f = await fixture();
    const a = await appointment(f.patient.id);
    const d = deps();
    vi.spyOn(d.whatsapp, "sendMessage").mockRejectedValueOnce(
      new Error("provider unavailable"),
    );
    await expect(processOnlineSession(d, a.id)).rejects.toThrow();
    expect(
      (await prisma.appointment.findUniqueOrThrow({ where: { id: a.id } })).meetingSentAt,
    ).toBeNull();
    expect(await processOnlineSession(d, a.id)).toBe("sent");
    expect(await processOnlineSession(d, a.id)).toBe("already_sent");
  });
  it("does not send cancelled, in-person, or finished sessions", async () => {
    const f = await fixture();
    const d = deps();
    const cancelled = await appointment(f.patient.id);
    await prisma.appointment.update({
      where: { id: cancelled.id },
      data: { status: "CANCELLED" },
    });
    const physical = await appointment(f.patient.id, 10, "IN_PERSON");
    const past = await appointment(f.patient.id, -60);
    for (const a of [cancelled, physical, past])
      expect(await processOnlineSession(d, a.id, true)).toBe("ineligible");
    expect(d.whatsapp.sent).toHaveLength(0);
  });
  it("automatically completes only ended active sessions; cancellation/no-show review survive", async () => {
    const f = await fixture();
    const active = await appointment(f.patient.id, -60);
    const cancelled = await appointment(f.patient.id, -70);
    const review = await appointment(f.patient.id, -80);
    const running = await appointment(f.patient.id, -20);
    await prisma.appointment.update({
      where: { id: cancelled.id },
      data: { status: "CANCELLED" },
    });
    await prisma.appointment.update({
      where: { id: review.id },
      data: { status: "NO_SHOW_REVIEW" },
    });
    await runAppointmentLifecycle(deps());
    const rows = await prisma.appointment.findMany({
      where: { patientId: f.patient.id },
    });
    expect(rows.find((a) => a.id === active.id)?.completedAutomaticallyAt).toEqual(now);
    expect(rows.find((a) => a.id === cancelled.id)?.status).toBe("CANCELLED");
    expect(rows.find((a) => a.id === review.id)?.status).toBe("NO_SHOW_REVIEW");
    expect(rows.find((a) => a.id === running.id)?.status).toBe("CONFIRMED");
  });
  it("waitlist offers only matching available hours, sends once and preserves old appointments", async () => {
    const f = await fixture("WAITLIST");
    const old = await appointment(f.patient.id, 300, "IN_PERSON");
    const d = deps();
    await prisma.serviceRequest.update({
      where: { id: f.request.id },
      data: {
        workflow: {
          type: "WAITLIST",
          therapistId,
          from: "2026-10-14T08:00:00+03:00",
          until: "2026-10-15T23:00:00+03:00",
          startMinute: 900,
          endMinute: 1080,
        },
      },
    });
    vi.spyOn(d.calendar, "listBusy").mockRejectedValueOnce(new Error("calendar down"));
    expect((await notifyWaitingList(d)).failed).toBeGreaterThan(0);
    expect(
      (await prisma.serviceRequest.findUniqueOrThrow({ where: { id: f.request.id } }))
        .notificationSentAt,
    ).toBeNull();
    await Promise.all([notifyWaitingList(d), notifyWaitingList(d)]);
    expect(
      d.whatsapp.sent.filter((m) => m.conversationId === f.conversation.id),
    ).toHaveLength(1);
    const c = await prisma.conversation.findUniqueOrThrow({
      where: { id: f.conversation.id },
    });
    expect(c.bookingPurpose).toBe("NEW");
    expect(c.offeredSlots[0]).toBe("2026-10-14T12:00:00.000Z");
    expect(
      (await prisma.appointment.findUniqueOrThrow({ where: { id: old.id } })).status,
    ).toBe("CONFIRMED");
  });
  it("checks every recurring date, creates no partial series on conflict, then queues all dates once", async () => {
    const f = await fixture("RECURRING");
    const d = deps();
    const startAt = new Date("2026-10-16T14:00:00+03:00");
    const input = { requestId: f.request.id, therapistId, startAt, count: 3, actorId };
    d.calendar.busy.push({
      startAt: new Date("2026-10-23T14:00:00+03:00"),
      endAt: new Date("2026-10-23T14:50:00+03:00"),
    });
    await expect(planRecurringAppointments(d, input)).rejects.toThrow("dolu");
    expect(
      await prisma.actionRequest.count({ where: { conversationId: f.conversation.id } }),
    ).toBe(0);
    d.calendar.busy.length = 0;
    const series = await planRecurringAppointments(d, input);
    expect(series).toHaveLength(3);
    const service = createActionRequestService(d);
    for (const id of series)
      await service.approve(
        { userId: actorId, role: "ADMIN", therapistProfileId: therapistId },
        id,
      );
    expect(
      await prisma.appointment.count({
        where: { patientId: f.patient.id, status: "CONFIRMED" },
      }),
    ).toBe(3);
    expect(d.calendar.updates).toHaveLength(3);
    await expect(planRecurringAppointments(d, input)).rejects.toThrow("Açık");
    expect(
      await prisma.actionRequest.count({ where: { conversationId: f.conversation.id } }),
    ).toBe(3);
  });
  it("exports only the selected patient and refuses ambiguous shared-phone export", async () => {
    const f = await fixture("DATA_REQUEST");
    await prisma.message.create({
      data: {
        conversationId: f.conversation.id,
        direction: "INBOUND",
        authorKind: "PATIENT",
        text: "verilerimi paylaşın",
      },
    });
    const exported = await exportPatientData(prisma, f.patient.id, actorId);
    expect(exported.patient.conversations).toHaveLength(1);
    const other = await prisma.patient.create({
      data: { phone: f.patient.phone, displayName: "diğer kişi" },
    });
    ids.push(other.id);
    await expect(exportPatientData(prisma, f.patient.id, actorId)).rejects.toThrow(
      "Ortak telefon",
    );
  });
  it("blocks erasure of active appointments; removes local data only after calendar cleanup succeeds", async () => {
    const f = await fixture("DATA_REQUEST");
    const a = await appointment(f.patient.id);
    const d = deps();
    await expect(
      erasePatientData(prisma, d.calendar, f.patient.id, actorId),
    ).rejects.toThrow("aktif");
    await prisma.appointment.update({
      where: { id: a.id },
      data: { status: "COMPLETED" },
    });
    vi.spyOn(d.calendar, "cancelEvent").mockRejectedValueOnce(new Error("calendar down"));
    await expect(
      erasePatientData(prisma, d.calendar, f.patient.id, actorId),
    ).rejects.toThrow("calendar down");
    expect(
      await prisma.patient.findUnique({ where: { id: f.patient.id } }),
    ).not.toBeNull();
    await erasePatientData(prisma, d.calendar, f.patient.id, actorId);
    expect(await prisma.patient.findUnique({ where: { id: f.patient.id } })).toBeNull();
    expect(
      await prisma.conversation.findUnique({ where: { id: f.conversation.id } }),
    ).toBeNull();
  });
  it("a later missed-session report reopens only automatically completed sessions for review", async () => {
    const f = await fixture();
    const a = await appointment(f.patient.id, -60);
    const d = deps();
    await runAppointmentLifecycle(d);
    await createActionRequestService(d).applyIncomingCancel({
      appointmentId: a.id,
      conversationId: f.conversation.id,
    });
    const saved = await prisma.appointment.findUniqueOrThrow({ where: { id: a.id } });
    expect(saved.status).toBe("NO_SHOW_REVIEW");
    expect(saved.completedAutomaticallyAt).toBeNull();
  });
});
