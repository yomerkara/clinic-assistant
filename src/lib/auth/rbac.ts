export type Role = "ADMIN" | "INTERN" | "THERAPIST";

export type Actor = {
  userId: string;
  role: Role;
  therapistProfileId: string | null;
};

export function canReviewQueue(role: Role): boolean {
  return role === "ADMIN" || role === "THERAPIST";
}

export function canViewAllQueue(role: Role): boolean {
  return role === "ADMIN" || role === "INTERN";
}

export function canContinueConversation(role: Role): boolean {
  return role === "ADMIN" || role === "INTERN" || role === "THERAPIST";
}

export function canUseSimulator(role: Role): boolean {
  return role === "ADMIN";
}

export function canManageKnowledge(role: Role): boolean {
  return role === "ADMIN";
}

export function canViewUsage(role: Role): boolean {
  return role === "ADMIN" || role === "THERAPIST";
}

export function canManageUsageBudget(role: Role): boolean {
  return role === "ADMIN";
}

export function canConnectCalendar(role: Role): boolean {
  return role === "ADMIN" || role === "THERAPIST";
}

export function canAccessTherapistRecord(actor: Actor, therapistProfileId: string): boolean {
  if (actor.role === "ADMIN") {
    return true;
  }
  return actor.therapistProfileId === therapistProfileId;
}
