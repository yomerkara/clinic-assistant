import { calendarRequestEventId } from "@/lib/calendar/event-id";
import { createCancellationDelivery } from "./cancellation-delivery";
import { bookingFlow } from "@/lib/conversation/booking-flow";
import { hasFullPatientName } from "@/lib/patients/identity";
import { missingBookingProfile, formatPatientName } from "@/lib/patients/profile";
import { validAppointmentRange } from "@/lib/calendar/dates";
import { patientScope } from "@/lib/auth/scope";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { CalendarPort } from "@/lib/adapters/calendar";
import type { WhatsAppPort } from "@/lib/adapters/whatsapp";
import {
  canAccessTherapistRecord,
  canReviewQueue,
  canViewAllQueue,
  type Actor,
} from "@/lib/auth/rbac";
import { classifyApprove, classifyCancel } from "@/lib/queue/rules";

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message = "Conflict") {
    super(message);
    this.name = "ConflictError";
  }
}

export class IncompleteProfileError extends ConflictError {}

export class ScheduleConflictError extends ConflictError {
  constructor(message = "Requested slot is no longer available") {
    super(message);
    this.name = "ScheduleConflictError";
  }
}

export class BotActiveError extends Error {
  constructor(message = "Bot is still active") {
    super(message);
    this.name = "BotActiveError";
  }
}

export type ProposedChanges = {
  sessionMode?: string;
  startAt?: string;
  endAt?: string;
  therapistId?: string;
  patientId?: string;
  appointmentVersion?: number;
  operationalSummary?: string;
};

type Deps = {
  prisma: PrismaClient;
  calendar: CalendarPort;
  whatsapp: WhatsAppPort;
  now?: () => Date;
  timeZone?: string;
};

function asChanges(value: Prisma.JsonValue): ProposedChanges {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as ProposedChanges;
}

export function createActionRequestService(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  const timeZone = deps.timeZone ?? "Europe/Istanbul";
  const { prisma, calendar, whatsapp } = deps;

  async function loadAction(id: string, db: Prisma.TransactionClient = prisma) {
    const action = await db.actionRequest.findUnique({
      where: { id },
      include: {
        cancellationDelivery: true,
        appointment: { include: { patient: true, therapist: true } },
        conversation: { include: { patient: true } },
      },
    });
    if (!action) {
      throw new NotFoundError();
    }
    return action;
  }

  function therapistIdOf(action: Awaited<ReturnType<typeof loadAction>>) {
    return (
      action.appointment?.therapistId ??
      asChanges(action.proposedChanges).therapistId ??
      null
    );
  }

  function assertView(actor: Actor, therapistId: string | null) {
    if (canViewAllQueue(actor.role)) {
      return;
    }
    if (!therapistId) {
      throw new ForbiddenError();
    }
    if (!canAccessTherapistRecord(actor, therapistId)) {
      throw new ForbiddenError();
    }
  }

  function assertMutate(actor: Actor, therapistId: string | null) {
    if (!canReviewQueue(actor.role)) {
      throw new ForbiddenError();
    }
    if (
      actor.role === "THERAPIST" &&
      (!therapistId || actor.therapistProfileId !== therapistId)
    ) {
      throw new ForbiddenError();
    }
  }

  async function audit(
    actorId: string | null,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Prisma.InputJsonValue = {},
  ) {
    await prisma.auditEvent.create({
      data: { actorId, action, entityType, entityId, metadata },
    });
  }

  async function notifyPatient(
    phone: string,
    conversationId: string | null,
    text: string,
  ) {
    if (!conversationId) {
      return;
    }
    await whatsapp.sendMessage({ phone, text, conversationId });
    await prisma.message.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        authorKind: "BOT",
        text,
      },
    });
  }

  return {
    async listForActor(actor: Actor) {
      const where: Prisma.ActionRequestWhereInput = {
        OR: [
          { status: { in: ["PENDING", "NEEDS_RECHECK"] } },
          { cancellationDelivery: { is: { completedAt: null } } },
          {
            status: "AUTO_APPLIED",
            type: "CANCEL",
            createdAt: { gte: new Date(now().getTime() - 24 * 60 * 60 * 1000) },
          },
        ],
      };
      const items = await prisma.actionRequest.findMany({
        where,
        include: {
          cancellationDelivery: true,
          appointment: { include: { patient: true, therapist: true } },
          conversation: { include: { patient: true } },
        },
        orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
      });
      const activeTherapists = new Set(
        (
          await prisma.therapistProfile.findMany({
            where: { active: true },
            select: { id: true },
          })
        ).map((therapist) => therapist.id),
      );
      const activeItems = items.filter((item) => {
        const therapistId =
          item.appointment?.therapistId ?? asChanges(item.proposedChanges).therapistId;
        return !therapistId || activeTherapists.has(therapistId);
      });
      if (actor.role !== "THERAPIST") return activeItems;
      if (!actor.therapistProfileId) return [];
      return activeItems.filter(
        (item) =>
          (item.appointment?.therapistId ??
            asChanges(item.proposedChanges).therapistId) === actor.therapistProfileId,
      );
    },

    async getForActor(actor: Actor, id: string) {
      const action = await loadAction(id);
      assertView(actor, therapistIdOf(action));
      return action;
    },

    async approve(actor: Actor, id: string) {
      const result = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
          const meta = await tx.actionRequest.findUnique({
            where: { id },
            select: { appointmentId: true },
          });
          if (meta?.appointmentId)
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointment:${meta.appointmentId}`}))`;
          // Lifecycle workers use ordinary updates, so an advisory lock alone
          // cannot protect the snapshot used by approval.
          if (meta?.appointmentId)
            await tx.$queryRaw`SELECT id FROM "Appointment" WHERE id = ${meta.appointmentId} FOR UPDATE`;
          const action = await tx.actionRequest.findUnique({
            where: { id },
            include: {
              appointment: {
                include: { patient: true, therapist: { include: { user: true } } },
              },
              conversation: { include: { patient: true } },
            },
          });
          if (!action) {
            throw new NotFoundError();
          }
          assertMutate(
            actor,
            action.appointment?.therapistId ??
              asChanges(action.proposedChanges).therapistId ??
              null,
          );
          assertView(
            actor,
            action.appointment?.therapistId ??
              asChanges(action.proposedChanges).therapistId ??
              null,
          );
          if (action.status !== "PENDING") {
            throw new ConflictError("Action is not pending");
          }
          if (
            action.type === "CANCEL" &&
            (!action.appointment ||
              !["SCHEDULED", "CONFIRMED", "NO_SHOW_REVIEW"].includes(
                action.appointment.status,
              ))
          ) {
            throw new ConflictError("Randevu artık iptal edilebilir durumda değil.");
          }
          if (action.appointmentId) {
            const siblings = await tx.actionRequest.findMany({
              where: { appointmentId: action.appointmentId, id: { not: id } },
              select: { status: true },
            });
            const expectedVersion = asChanges(action.proposedChanges).appointmentVersion;
            if (
              expectedVersion != null
                ? expectedVersion !== action.appointment?.version
                : classifyApprove(siblings.map((s) => s.status)) === "needs_recheck"
            ) {
              const updated = await tx.actionRequest.update({
                where: { id },
                data: { status: "NEEDS_RECHECK" },
              });
              await tx.auditEvent.create({
                data: {
                  actorId: actor.userId,
                  action: "action.needs_recheck",
                  entityType: "ActionRequest",
                  entityId: id,
                  metadata: {},
                },
              });
              return { updated, notify: false as const, action };
            }
          }

          if (
            action.appointment &&
            ["RESCHEDULE", "NEW_BOOKING", "CONFIRM"].includes(action.type) &&
            !["SCHEDULED", "CONFIRMED"].includes(action.appointment.status)
          ) {
            throw new ConflictError("Randevu artık aktif değil.");
          }
          const changes = asChanges(action.proposedChanges);
          if (
            changes.sessionMode &&
            !["ONLINE", "IN_PERSON"].includes(changes.sessionMode)
          )
            throw new ConflictError("Invalid session mode");
          if (
            action.type === "NEW_BOOKING" &&
            (!changes.therapistId ||
              !changes.startAt ||
              !changes.endAt ||
              (!action.conversation && !changes.patientId))
          )
            throw new ConflictError("Incomplete booking");
          if (action.type === "RESCHEDULE" && !action.appointment)
            throw new ConflictError("Missing appointment");
          if (["NEW_BOOKING", "RESCHEDULE", "CONFIRM"].includes(action.type)) {
            const patientId =
              action.appointment?.patientId ??
              changes.patientId ??
              action.conversation?.patientId;
            if (patientId)
              await tx.$queryRaw`SELECT id FROM "Patient" WHERE id = ${patientId} FOR UPDATE`;
            const patient = patientId
              ? await tx.patient.findUnique({ where: { id: patientId } })
              : null;
            const missing = patient ? missingBookingProfile(patient) : ["müşteri kaydı"];
            if (patient && action.conversation) action.conversation.patient = patient;
            if (patient && action.appointment) action.appointment.patient = patient;
            if (missing.length)
              throw new IncompleteProfileError(
                `Eksik müşteri profili: ${missing.join(", ")}. Müşteri sayfasından tamamlayın.`,
              );
          }
          const proposedTherapistId =
            action.appointment?.therapistId ?? changes.therapistId;
          const proposedStartAt = changes.startAt
            ? new Date(changes.startAt)
            : action.appointment?.startAt;
          const proposedEndAt = changes.endAt
            ? new Date(changes.endAt)
            : action.appointment?.endAt;
          if (
            (action.type === "NEW_BOOKING" || action.type === "RESCHEDULE") &&
            proposedTherapistId &&
            proposedStartAt &&
            proposedEndAt
          ) {
            if (!validAppointmentRange(proposedStartAt, proposedEndAt, now()))
              throw new ConflictError("Invalid appointment time");
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${proposedTherapistId}))`;
            const overlap = await tx.appointment.findFirst({
              where: {
                OR: [
                  { therapistId: proposedTherapistId },
                  { patientId: action.appointment?.patientId ?? changes.patientId ?? action.conversation?.patientId },
                ],
                status: { in: ["SCHEDULED", "CONFIRMED"] },
                id: action.appointmentId ? { not: action.appointmentId } : undefined,
                startAt: { lt: proposedEndAt },
                endAt: { gt: proposedStartAt },
              },
              select: { id: true, startAt: true, endAt: true },
            });
            if (overlap) {
              const updated = await tx.actionRequest.update({
                where: { id },
                data: { status: "NEEDS_RECHECK" },
              });
              await tx.auditEvent.create({
                data: {
                  actorId: actor.userId,
                  action: "action.slot_conflict",
                  entityType: "ActionRequest",
                  entityId: id,
                  metadata: {
                    conflictingAppointmentId: overlap.id,
                    requestedStartAt: proposedStartAt.toISOString(),
                  },
                },
              });
              return {
                updated,
                notify: false as const,
                action,
                slotConflict: true as const,
              };
            }
            const owner = await tx.therapistProfile.findUniqueOrThrow({
              where: { id: proposedTherapistId },
            });
            const calendarBusy = await calendar.listBusy({
              ownerUserId: owner.userId,
              from: proposedStartAt,
              to: proposedEndAt,
              excludeEventId:
                action.appointment?.calendarEventId ??
                (action.type === "NEW_BOOKING"
                  ? calendarRequestEventId(action.id)
                  : undefined),
            });
            if (
              calendarBusy.some(
                (b) => b.startAt < proposedEndAt && b.endAt > proposedStartAt,
              )
            )
              throw new ScheduleConflictError();
          }
          let calendarEventId = action.appointment?.calendarEventId ?? null;
          const ownerUserId = action.appointment?.therapist.userId ?? null;

          if (action.type === "NEW_BOOKING" && !action.appointment) {
            const therapistId = changes.therapistId;
            const startAt = changes.startAt ? new Date(changes.startAt) : null;
            const endAt = changes.endAt ? new Date(changes.endAt) : null;
            const conversation = action.conversation;
            const bookingPatient = changes.patientId
              ? await tx.patient.findUnique({ where: { id: changes.patientId } })
              : conversation?.patient;
            if (!bookingPatient) throw new ConflictError("Missing patient");
            if (conversation && bookingPatient.phone !== conversation.phone)
              throw new ConflictError("Patient does not belong to this phone");
            if (therapistId && startAt && endAt) {
              const therapist = await tx.therapistProfile.findUniqueOrThrow({
                where: { id: therapistId },
              });
              const createdCal = await calendar.updateEvent({
                requestId: action.id,
                sessionMode:
                  changes.sessionMode ?? conversation?.sessionMode ?? "IN_PERSON",
                ownerUserId: therapist.userId,
                startAt,
                endAt,
                summary: `${conversation?.source === "demo" ? "[TEST] " : ""}${formatPatientName(bookingPatient.displayName)} · ${therapist.displayName}`,
              });
              const appointment = await tx.appointment.create({
                data: {
                  patientId: bookingPatient.id,
                  sessionMode:
                    changes.sessionMode ?? conversation?.sessionMode ?? "IN_PERSON",
                  therapistId,
                  startAt,
                  endAt,
                  calendarEventId: createdCal.calendarEventId,
                  status: "CONFIRMED",
                  source: conversation?.source === "demo" ? "demo" : "whatsapp",
                },
              });
              await tx.actionRequest.update({
                where: { id: action.id },
                data: { appointmentId: appointment.id },
              });
              calendarEventId = createdCal.calendarEventId;
            }
          } else if (action.appointment) {
            if (action.type === "CANCEL") {
              const connection = await tx.calendarConnection.findUnique({
                where: { userId: ownerUserId! },
                select: { calendarId: true },
              });
              await tx.cancellationDelivery.create({
                data: {
                  actionId: action.id,
                  calendarEventId,
                  ownerUserId: ownerUserId!,
                  calendarId:
                    connection?.calendarId ??
                    action.appointment.therapist.calendarId ??
                    "primary",
                  nextAttemptAt: now(),
                },
              });
              await tx.appointment.update({
                where: { id: action.appointment.id },
                data: { status: "CANCELLED", version: { increment: 1 } },
              });
            } else if (action.type === "RESCHEDULE" || action.type === "NEW_BOOKING") {
              const startAt = changes.startAt
                ? new Date(changes.startAt)
                : action.appointment.startAt;
              const endAt = changes.endAt
                ? new Date(changes.endAt)
                : action.appointment.endAt;
              const updatedCal = await calendar.updateEvent({
                calendarEventId,
                sessionMode: changes.sessionMode ?? action.appointment.sessionMode,
                ownerUserId,
                startAt,
                endAt,
                summary: `${formatPatientName(action.appointment.patient.displayName)} · ${action.appointment.therapist.displayName}`,
              });
              calendarEventId = updatedCal.calendarEventId;
              await tx.appointment.update({
                where: { id: action.appointment.id },
                data: {
                  startAt,
                  endAt,
                  calendarEventId,
                  status: "CONFIRMED",
                  reminderSentAt: null,
                  meetingSentAt: null,
                  sessionMode: changes.sessionMode ?? action.appointment.sessionMode,
                  version: { increment: 1 },
                },
              });
            } else if (action.type === "CONFIRM") {
              await tx.appointment.update({
                where: { id: action.appointment.id },
                data: { status: "CONFIRMED", version: { increment: 1 } },
              });
            }
          }

          const updated = await tx.actionRequest.update({
            where: { id },
            data: {
              status: "APPROVED",
              reviewedById: actor.userId,
              ...(action.type === "CANCEL"
                ? {
                    proposedChanges: {
                      ...changes,
                      operationalSummary:
                        "İptal onaylandı; takvim ve bildirim teslimatı ayrı izlenir.",
                    },
                  }
                : {}),
            },
          });

          await tx.auditEvent.create({
            data: {
              actorId: actor.userId,
              action: "action.approved",
              entityType: "ActionRequest",
              entityId: id,
              metadata: { type: action.type },
            },
          });

          if (
            action.conversationId &&
            (!(
              action.conversation?.bookingParty as {
                ids?: string[];
                index?: number;
              } | null
            )?.ids ||
              (action.conversation!.bookingParty as { ids: string[]; index: number }).ids[
                (action.conversation!.bookingParty as { index: number }).index
              ] === changes.patientId) &&
            ["NEW_BOOKING", "RESCHEDULE", "CONFIRM"].includes(action.type)
          )
            await tx.conversation.update({
              where: { id: action.conversationId },
              data: {
                bookingStage: "CONFIRMED",
                bookingPurpose: null,
                offeredSlots: [],
                offeredAt: null,
                offeredTherapistId: null,
              },
            });
          const party = action.conversation?.bookingParty as {
            phase: string;
            ids: string[];
            index: number;
          } | null;
          if (
            action.type === "NEW_BOOKING" &&
            action.conversationId &&
            party?.phase === "booking" &&
            party.ids?.length === 2
          ) {
            const approved = await tx.actionRequest.findMany({
              where: {
                conversationId: action.conversationId,
                type: "NEW_BOOKING",
                status: "APPROVED",
              },
              select: { proposedChanges: true },
            });
            if (
              party.ids.every((patientId) =>
                approved.some(
                  (a) =>
                    (a.proposedChanges as { patientId?: string }).patientId === patientId,
                ),
              )
            )
              await tx.conversation.update({
                where: { id: action.conversationId },
                data: {
                  bookingParty: { ...party, phase: "done" },
                  bookingStage: "CONFIRMED",
                  bookingPurpose: null,
                },
              });
          }
          if (action.type === "CANCEL" && action.conversationId) {
            const remaining = await tx.appointment.count({
              where: {
                patientId: action.appointment!.patientId,
                status: { in: ["SCHEDULED", "CONFIRMED"] },
                startAt: { gt: now() },
              },
            });
            await tx.conversation.update({
              where: { id: action.conversationId },
              data: {
                bookingStage: remaining ? "CONFIRMED" : "GREETING",
                offeredSlots: [],
                offeredAt: null,
                offeredTherapistId: null,
              },
            });
          }
          return { updated, notify: true as const, action, slotConflict: false as const };
        },
        { timeout: 45000 },
      );

      if ("slotConflict" in result && result.slotConflict) {
        throw new ScheduleConflictError();
      }

      if (result.notify && result.action.type === "CANCEL") {
        // The committed outbox survives request failure or process restart.
        // A failed attempt is persisted for the worker, not rolled back.
        await createCancellationDelivery(deps).deliver(id);
        return result.updated;
      }
      if (result.notify) {
        const phone =
          result.action.appointment?.patient.phone ?? result.action.conversation?.phone;
        if (phone && result.action.conversationId) {
          const summary =
            asChanges(result.action.proposedChanges).operationalSummary ??
            "Talebiniz onaylandı.";
          const booking = ["NEW_BOOKING", "RESCHEDULE", "CONFIRM"].includes(
            result.action.type,
          );
          const start =
            asChanges(result.action.proposedChanges).startAt ??
            result.action.appointment?.startAt?.toISOString();
          const date = start
            ? new Intl.DateTimeFormat("tr-TR", {
                timeZone,
                day: "numeric",
                month: "long",
                weekday: "long",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(start))
            : "";
          await notifyPatient(
            phone,
            result.action.conversationId,
            booking
              ? `${date ? date + " için randevunuz" : "Randevunuz"} onaylanmıştır. Sağlıklı günler dileriz. 🌸`
              : result.action.type === "CANCEL"
                ? "İptal talebiniz onaylandı. Randevunuz iptal edildi."
                : result.action.type === "INVOICE_REQUEST"
                  ? "Fatura talebiniz alındı. Belgenin hazırlanması ve paylaşılması için ekibimiz sizinle iletişime geçecek."
                  : result.action.type === "PRICE_REQUEST"
                    ? "Ücret talebiniz alındı. Ekibimiz size bilgi verecek."
                    : summary,
          );
        }
      }
      return result.updated;
    },

    async reject(actor: Actor, id: string) {
      const { action, updated } = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
        const action = await loadAction(id, tx);
        assertMutate(actor, therapistIdOf(action));
        assertView(actor, therapistIdOf(action));
        if (action.status !== "PENDING") throw new ConflictError("Action is not pending");
        const updated = await tx.actionRequest.update({
          where: { id },
          data: { status: "REJECTED", reviewedById: actor.userId },
        });
        if (
          action.type === "NEW_BOOKING" &&
          !action.appointmentId &&
          action.conversationId
        ) {
          const conversation = await tx.conversation.findUniqueOrThrow({
            where: { id: action.conversationId },
            include: { patient: true },
          });
          const flow = bookingFlow({
            requested: true,
            therapistSelected: Boolean(conversation.preferredTherapistId),
            intake: {
              hasFullName: hasFullPatientName(conversation.patient.displayName),
              age: conversation.patient.age,
              hasTherapyHistory: conversation.patient.hasTherapyHistory,
              availabilityNotes: conversation.patient.availabilityNotes,
            },
          });
          await tx.conversation.update({
            where: { id: conversation.id },
            data: {
              bookingStage: flow.stage,
              offeredSlots: [],
              offeredAt: null,
              offeredTherapistId: null,
            },
          });
        }
        await tx.auditEvent.create({
          data: {
            actorId: actor.userId,
            action: "action.rejected",
            entityType: "ActionRequest",
            entityId: id,
            metadata: { type: action.type },
          },
        });
        return { action, updated };
      });
      const phone = action.appointment?.patient.phone ?? action.conversation?.phone;
      if (phone && action.conversationId) {
        await notifyPatient(
          phone,
          action.conversationId,
          action.type === "NEW_BOOKING" && !action.appointmentId
            ? "Randevu talebiniz onaylanamadı. Başka bir gün veya saat tercih edebilirsiniz."
            : "Talebiniz şu anda uygulanamadı. Randevunuz aynı kaldı.",
        );
      }
      return updated;
    },

    async edit(actor: Actor, id: string, patch: { startAt: Date; endAt: Date }) {
      return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
        const meta = await tx.actionRequest.findUnique({
          where: { id },
          select: { appointmentId: true },
        });
        if (meta?.appointmentId)
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointment:${meta.appointmentId}`}))`;
        const action = await loadAction(id, tx);
        assertMutate(actor, therapistIdOf(action));
        assertView(actor, therapistIdOf(action));
        if (action.status !== "PENDING" && action.status !== "NEEDS_RECHECK") {
          throw new ConflictError("Action cannot be edited");
        }
        if (!validAppointmentRange(patch.startAt, patch.endAt, now()))
          throw new ConflictError("Invalid appointment time");
        const current = asChanges(action.proposedChanges);
        const updated = await tx.actionRequest.update({
          where: { id },
          data: {
            status: "PENDING",
            proposedChanges: {
              ...current,
              appointmentVersion: action.appointment?.version,
              startAt: patch.startAt.toISOString(),
              endAt: patch.endAt.toISOString(),
              operationalSummary: `Güncellenen randevu: ${new Intl.DateTimeFormat("tr-TR", { timeZone, dateStyle: "long", timeStyle: "short" }).format(patch.startAt)}.`,
            },
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId: actor.userId,
            action: "action.edited",
            entityType: "ActionRequest",
            entityId: id,
            metadata: { startAt: patch.startAt.toISOString() },
          },
        });
        return updated;
      });
    },

    async takeover(actor: Actor, conversationId: string, userId: string) {
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, patient: patientScope(actor) },
        include: { patient: { include: { appointments: true } } },
      });
      if (!conversation) {
        throw new NotFoundError();
      }
      const updated = await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          mode: "HUMAN",
          assignedToId: userId,
        },
      });
      await audit(userId, "conversation.takeover", "Conversation", conversationId);
      return updated;
    },

    async reactivateBot(actor: Actor, conversationId: string, userId: string) {
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, patient: patientScope(actor) },
        include: { patient: { include: { appointments: true } } },
      });
      if (!conversation) throw new NotFoundError();
      const updated = await prisma.conversation.update({
        where: { id: conversationId },
        data: { mode: "BOT", assignedToId: null },
      });
      await audit(userId, "conversation.bot_reactivated", "Conversation", conversationId);
      return updated;
    },

    async sendStaffMessage(
      actor: Actor,
      conversationId: string,
      userId: string,
      text: string,
    ) {
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, patient: patientScope(actor) },
        include: { patient: { include: { appointments: true } } },
      });
      if (!conversation) {
        throw new NotFoundError();
      }
      if (!text.trim() || text.length > 5000) throw new ConflictError("Invalid message");
      if (conversation.mode !== "HUMAN") {
        throw new BotActiveError();
      }
      const sent = await whatsapp.sendMessage({
        phone: conversation.phone,
        text,
        conversationId,
      });
      const message = await prisma.message.create({
        data: {
          conversationId,
          direction: "OUTBOUND",
          authorKind: "STAFF",
          text,
          providerMessageId: sent.providerMessageId,
        },
      });
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now() },
      });
      await audit(userId, "conversation.staff_message", "Conversation", conversationId);
      return message;
    },

    async applyIncomingCancel(input: {
      appointmentId: string;
      conversationId?: string;
      requestedBy?: string;
    }) {
      const appointment = await prisma.appointment.findUnique({
        where: { id: input.appointmentId },
        include: { patient: true, therapist: { include: { user: true } } },
      });
      if (!appointment) {
        throw new NotFoundError();
      }
      const decision = classifyCancel(appointment.startAt, now());
      if (decision === "no_show_review") {
        return prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointment:${appointment.id}`}))`;
          const current = await tx.appointment.findUniqueOrThrow({
            where: { id: appointment.id },
          });
          if (
            current.status === "CANCELLED" ||
            (current.status === "COMPLETED" && !current.completedAutomaticallyAt)
          )
            throw new ConflictError("Randevu artık aktif değil.");
          const existing = await tx.actionRequest.findFirst({
            where: { appointmentId: current.id, type: "CANCEL", status: "PENDING" },
          });
          if (current.status === "NO_SHOW_REVIEW" && existing) return existing;
          await tx.appointment.update({
            where: { id: current.id },
            data: {
              status: "NO_SHOW_REVIEW",
              completedAutomaticallyAt: null,
              version: { increment: 1 },
            },
          });
          const changes = {
            appointmentVersion: current.version + 1,
            operationalSummary: "Randevu saati geçmiş; inceleme bekliyor.",
          };
          const action = existing
            ? await tx.actionRequest.update({
                where: { id: existing.id },
                data: { proposedChanges: changes },
              })
            : await tx.actionRequest.create({
                data: {
                  type: "CANCEL",
                  appointmentId: current.id,
                  conversationId: input.conversationId,
                  status: "PENDING",
                  requestedBy: input.requestedBy ?? "patient",
                  proposedChanges: changes,
                },
              });
          await tx.auditEvent.create({
            data: {
              action: "appointment.no_show_review",
              entityType: "Appointment",
              entityId: current.id,
              metadata: { actionId: action.id },
            },
          });
          return action;
        });
      }
      // Share the approval path's appointment lock: concurrent inbound messages
      // create one pending request and never write to the external calendar.
      return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointment:${appointment.id}`}))`;
        const current = await tx.appointment.findUniqueOrThrow({
          where: { id: appointment.id },
        });
        if (!["SCHEDULED", "CONFIRMED"].includes(current.status)) {
          throw new ConflictError("Randevu artık aktif değil.");
        }
        const existing = await tx.actionRequest.findFirst({
          where: { appointmentId: current.id, type: "CANCEL", status: "PENDING" },
        });
        if (existing) return existing;
        return tx.actionRequest.create({
          data: {
            type: "CANCEL",
            appointmentId: current.id,
            conversationId: input.conversationId,
            status: "PENDING",
            requestedBy: input.requestedBy ?? "patient",
            proposedChanges: {
              appointmentVersion: current.version,
              operationalSummary:
                "İptal talebi — yönetici onayı bekliyor; randevu henüz iptal edilmedi.",
            },
          },
        });
      });
    },
  };
}

export type ActionRequestService = ReturnType<typeof createActionRequestService>;
