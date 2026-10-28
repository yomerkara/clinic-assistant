import type { Prisma } from "@prisma/client";
import type { Actor } from "./rbac";

/** An unassigned therapist must never fall through to an unrestricted query. */
export function patientScope(actor: Actor): Prisma.PatientWhereInput {
  if (actor.role !== "THERAPIST") return {};
  if (!actor.therapistProfileId) return { id: { in: [] } };
  return {
    OR: [
      { appointments: { some: { therapistId: actor.therapistProfileId } } },
      {
        conversations: {
          some: {
            actionRequests: {
              some: {
                proposedChanges: {
                  path: ["therapistId"],
                  equals: actor.therapistProfileId,
                },
              },
            },
          },
        },
      },
    ],
  };
}

export function canReadPatient(
  actor: Actor,
  appointments: Array<{ therapistId: string }>,
) {
  return (
    actor.role !== "THERAPIST" ||
    Boolean(
      actor.therapistProfileId &&
      appointments.some(
        (appointment) => appointment.therapistId === actor.therapistProfileId,
      ),
    )
  );
}
