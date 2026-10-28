import { parseIstanbulInput, validAppointmentRange } from "@/lib/calendar/dates";
import { CalendarUnavailableError } from "@/lib/calendar/google";
import { NextResponse } from "next/server";
import { requireUser, toActor } from "@/lib/auth/session";
import { publicOrigin } from "@/lib/http";
import { getActionRequestService } from "@/lib/queue/ports";
import {
  BotActiveError,
  ConflictError,
  IncompleteProfileError,
  ForbiddenError,
  NotFoundError,
  ScheduleConflictError,
} from "@/lib/queue/action-request-service";

function originOf(request: Request) {
  return publicOrigin(request);
}

async function current() {
  const user = await requireUser();
  return { user, actor: toActor(user) };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "approve");
  const { user, actor } = await current();
  const service = getActionRequestService();
  const origin = originOf(request);
  const requestedReturn = String(form.get("returnTo") ?? "");
  const back = /^\/conversations\/[a-zA-Z0-9_-]+(?:\?action=[a-zA-Z0-9_-]+)?$/.test(
    requestedReturn,
  )
    ? requestedReturn
    : `/queue/${id}`;
  const resultUrl = (key: string, value: string) => {
    const url = new URL(back, origin);
    url.searchParams.set(key, value);
    return url;
  };

  try {
    if (intent === "approve") {
      const result = await service.approve(actor, id);
      return NextResponse.redirect(
        result.status === "APPROVED"
          ? resultUrl("done", "approved")
          : resultUrl("error", "conflict"),
        303,
      );
    }
    if (intent === "reject") {
      await service.reject(actor, id);
      return NextResponse.redirect(resultUrl("done", "rejected"), 303);
    }
    if (intent === "edit") {
      const startAt = parseIstanbulInput(String(form.get("startAt") ?? ""));
      const endAt = parseIstanbulInput(String(form.get("endAt") ?? ""));
      if (!validAppointmentRange(startAt, endAt))
        return NextResponse.redirect(resultUrl("error", "invalid_time"), 303);
      await service.edit(actor, id, { startAt, endAt });
      return NextResponse.redirect(resultUrl("done", "edited"), 303);
    }
    if (intent === "takeover") {
      const conversationId = String(form.get("conversationId") ?? "");
      await service.takeover(actor, conversationId, user.id);
      return NextResponse.redirect(
        new URL(`/conversations/${conversationId}`, origin),
        303,
      );
    }
  } catch (error) {
    if (error instanceof CalendarUnavailableError)
      return NextResponse.redirect(resultUrl("error", "calendar"), 303);
    if (error instanceof ForbiddenError || error instanceof NotFoundError) {
      return NextResponse.redirect(resultUrl("error", "forbidden"), 303);
    }
    if (error instanceof ScheduleConflictError) {
      return NextResponse.redirect(resultUrl("error", "slot_conflict"), 303);
    }
    if (error instanceof IncompleteProfileError) return NextResponse.redirect(resultUrl("error", "incomplete_profile"), 303);
    if (error instanceof ConflictError) {
      return NextResponse.redirect(resultUrl("error", "conflict"), 303);
    }
    throw error;
  }
  return NextResponse.redirect(new URL(`/queue/${id}`, origin), 303);
}

export async function handleConversation(request: Request, conversationId: string) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "takeover");
  const { user, actor } = await current();
  const service = getActionRequestService();
  const origin = originOf(request);
  try {
    if (intent === "takeover") {
      await service.takeover(actor, conversationId, user.id);
    } else if (intent === "reactivate") {
      await service.reactivateBot(actor, conversationId, user.id);
    } else if (intent === "message") {
      await service.sendStaffMessage(
        actor,
        conversationId,
        user.id,
        String(form.get("text") ?? "").trim(),
      );
    }
  } catch (error) {
    if (error instanceof BotActiveError) {
      return NextResponse.redirect(
        new URL(`/conversations/${conversationId}?error=bot`, origin),
        303,
      );
    }
    if (error instanceof ForbiddenError || error instanceof NotFoundError) {
      return NextResponse.redirect(
        new URL(`/conversations/${conversationId}?error=forbidden`, origin),
        303,
      );
    }
    throw error;
  }
  return NextResponse.redirect(new URL(`/conversations/${conversationId}`, origin), 303);
}
