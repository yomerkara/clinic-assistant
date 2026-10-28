export type CancelDecision = "needs_approval" | "no_show_review";
export type ApproveDecision = "ok" | "needs_recheck";
export type ActionStatus =
  "PENDING" | "APPROVED" | "REJECTED" | "AUTO_APPLIED" | "NEEDS_RECHECK" | "EXPIRED";

export function calendarDayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function classifyCancel(startAt: Date, now: Date): CancelDecision {
  if (startAt.getTime() <= now.getTime()) {
    return "no_show_review";
  }
  // Model intent and confidence never authorize cancellation.
  return "needs_approval";
}

export function classifyApprove(siblingStatuses: ActionStatus[]): ApproveDecision {
  if (
    siblingStatuses.some((status) => status === "APPROVED" || status === "AUTO_APPLIED")
  ) {
    return "needs_recheck";
  }
  return "ok";
}
