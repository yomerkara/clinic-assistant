import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/rbac";
import { MemoryCalendar, type CalendarEventInput } from "@/lib/adapters/calendar";
import { MemoryWhatsApp } from "@/lib/adapters/whatsapp";
import { createActionRequestService, ScheduleConflictError } from "./action-request-service";

const url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL) throw new Error("Separate test DB required");
describe.skipIf(!url)("Concurrent customer approvals", () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  afterAll(() => prisma.$disconnect());
  async function fixture() {
    const user = await prisma.user.create({ data: { name: "Concurrency", email: `${randomUUID()}@test.local`, passwordHash: "test", role: "ADMIN" } });
    const therapist = await prisma.therapistProfile.create({ data: { userId: user.id, displayName: "Test Uzman", specialties: [] } });
    const actor: Actor = { userId: user.id, role: "ADMIN", therapistProfileId: null };
    // Deliberately stale external availability: DB protection must work even
    // when Google has not yet reflected the first write.
    class DelayedCalendar extends MemoryCalendar {
      async listBusy() { return []; }
      async updateEvent(input: CalendarEventInput) {
        await new Promise(resolve => setTimeout(resolve, 50));
        return super.updateEvent(input);
      }
    }
    const calendar = new DelayedCalendar();
    const whatsapp = new MemoryWhatsApp();
    const service = createActionRequestService({ prisma, calendar, whatsapp, now: () => new Date("2026-03-01T00:00:00Z") });
    async function customer() {
      const patient = await prisma.patient.create({ data: { phone: `test-${randomUUID()}`, displayName: "Deneme Hasta", age: 29, hasTherapyHistory: false, availabilityNotes: "Salı" } });
      const conversation = await prisma.conversation.create({ data: { patientId: patient.id, phone: patient.phone } });
      return { patient, conversation };
    }
    async function booking(hour = 10, person?: Awaited<ReturnType<typeof customer>>, therapistId = therapist.id) {
      const c = person ?? await customer();
      const action = await prisma.actionRequest.create({ data: { conversationId: c.conversation.id, type: "NEW_BOOKING", proposedChanges: { patientId: c.patient.id, therapistId, startAt: `2026-04-07T${hour}:00:00Z`, endAt: `2026-04-07T${hour}:50:00Z` } } });
      return { ...c, action };
    }
    return { actor, therapist, calendar, whatsapp, service, customer, booking };
  }

  it("ten different customers compete for one slot: one booking, one calendar write, one confirmation", async () => {
    const f = await fixture();
    const requests = await Promise.all(Array.from({ length: 10 }, () => f.booking()));
    const results = await Promise.allSettled(requests.map(r => f.service.approve(f.actor, r.action.id)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(ScheduleConflictError);
    expect(await prisma.appointment.count({ where: { therapistId: f.therapist.id } })).toBe(1);
    expect(await prisma.actionRequest.count({ where: { id: { in: requests.map(r => r.action.id) }, status: "NEEDS_RECHECK" } })).toBe(9);
    expect(f.calendar.updates).toHaveLength(1);
    expect(f.whatsapp.sent).toHaveLength(1);
    const winner = results.findIndex(r => r.status === "fulfilled");
    expect(f.whatsapp.sent[0].phone).toBe(requests[winner].patient.phone);
  });

  it("two staff approvals of the same request produce one event and notification", async () => {
    const f = await fixture(), r = await f.booking();
    const results = await Promise.allSettled([f.service.approve(f.actor, r.action.id), f.service.approve(f.actor, r.action.id)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(f.calendar.updates).toHaveLength(1);
    expect(f.whatsapp.sent).toHaveLength(1);
  });

  it("different times for different customers both succeed", async () => {
    const f = await fixture();
    const requests = await Promise.all([f.booking(10), f.booking(11)]);
    const results = await Promise.all(requests.map(r => f.service.approve(f.actor, r.action.id)));
    expect(results.map(r => r.status)).toEqual(["APPROVED", "APPROVED"]);
    expect(f.whatsapp.sent.map(r => r.phone).sort()).toEqual(requests.map(r => r.patient.phone).sort());
  });

  it("same patient cannot book overlapping sessions with different therapists", async () => {
    const f = await fixture(), other = await fixture(), person = await f.customer();
    const requests = await Promise.all([f.booking(10, person), f.booking(10, person, other.therapist.id)]);
    const results = await Promise.allSettled(requests.map(r => f.service.approve(f.actor, r.action.id)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.appointment.count({ where: { patientId: person.patient.id } })).toBe(1);
    expect(f.calendar.updates).toHaveLength(1);
  });

  it("different customers and therapists can use the same time", async () => {
    const f = await fixture(), other = await fixture();
    const requests = await Promise.all([f.booking(), f.booking(10, undefined, other.therapist.id)]);
    const results = await Promise.all(requests.map(r => f.service.approve(f.actor, r.action.id)));
    expect(results.every(r => r.status === "APPROVED")).toBe(true);
  });

  it("partially overlapping sessions also conflict", async () => {
    const f = await fixture();
    const a = await f.booking(), b = await f.booking();
    await prisma.actionRequest.update({ where: { id: b.action.id }, data: { proposedChanges: { patientId: b.patient.id, therapistId: f.therapist.id, startAt: "2026-04-07T10:30:00Z", endAt: "2026-04-07T11:20:00Z" } } });
    const results = await Promise.allSettled([a, b].map(r => f.service.approve(f.actor, r.action.id)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(f.calendar.updates).toHaveLength(1);
  });

  it("one phone with two people preserves both nonoverlapping bookings", async () => {
    const f = await fixture();
    const first = await f.customer(), second = await f.customer();
    await prisma.patient.update({ where: { id: second.patient.id }, data: { phone: first.patient.phone } });
    await prisma.conversation.update({ where: { id: second.conversation.id }, data: { phone: first.patient.phone } });
    const requests = await Promise.all([f.booking(10, first), f.booking(11, second)]);
    await Promise.all(requests.map(r => f.service.approve(f.actor, r.action.id)));
    const rows = await prisma.appointment.findMany({ where: { therapistId: f.therapist.id }, orderBy: { startAt: "asc" } });
    expect(rows.map(r => r.patientId)).toEqual([first.patient.id, second.patient.id]);
    expect(f.whatsapp.sent).toHaveLength(2);
  });

  it("new booking and another patient's reschedule compete for the same target slot", async () => {
    const f = await fixture(), existing = await f.booking(10);
    const approved = await f.service.approve(f.actor, existing.action.id);
    const newcomer = await f.booking(12);
    const move = await prisma.actionRequest.create({ data: { type: "RESCHEDULE", appointmentId: approved.appointmentId, conversationId: existing.conversation.id, proposedChanges: { appointmentVersion: 0, startAt: "2026-04-07T12:00:00Z", endAt: "2026-04-07T12:50:00Z" } } });
    const results = await Promise.allSettled([move, newcomer.action].map(r => f.service.approve(f.actor, r.id)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.appointment.count({ where: { therapistId: f.therapist.id, startAt: new Date("2026-04-07T12:00:00Z") } })).toBe(1);
    expect(f.calendar.updates).toHaveLength(2);
  });

  it("two simultaneous reschedules of one appointment apply only one version", async () => {
    const f = await fixture(), r = await f.booking();
    const approved = await f.service.approve(f.actor, r.action.id);
    const requests = await Promise.all([11, 12].map(hour => prisma.actionRequest.create({ data: { type: "RESCHEDULE", appointmentId: approved.appointmentId, conversationId: r.conversation.id, proposedChanges: { appointmentVersion: 0, startAt: `2026-04-07T${hour}:00:00Z`, endAt: `2026-04-07T${hour}:50:00Z` } } })));
    const results = await Promise.all(requests.map(a => f.service.approve(f.actor, a.id)));
    expect(results.map(r => r.status).sort()).toEqual(["APPROVED", "NEEDS_RECHECK"]);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: approved.appointmentId! } })).version).toBe(1);
    expect(f.calendar.updates).toHaveLength(2);
  });

  it("cancel and reschedule cannot both approve from the same appointment version", async () => {
    const f = await fixture(), r = await f.booking();
    const approved = await f.service.approve(f.actor, r.action.id);
    const requests = await Promise.all((["CANCEL", "RESCHEDULE"] as const).map(type => prisma.actionRequest.create({ data: { type, appointmentId: approved.appointmentId, conversationId: r.conversation.id, proposedChanges: { appointmentVersion: 0, startAt: "2026-04-07T12:00:00Z", endAt: "2026-04-07T12:50:00Z" } } })));
    await Promise.allSettled(requests.map(a => f.service.approve(f.actor, a.id)));
    expect(await prisma.actionRequest.count({ where: { id: { in: requests.map(r => r.id) }, status: "APPROVED" } })).toBe(1);
    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: approved.appointmentId! } });
    expect(appointment.version).toBe(1);
    expect(["CANCELLED", "CONFIRMED"]).toContain(appointment.status);
  });
});
