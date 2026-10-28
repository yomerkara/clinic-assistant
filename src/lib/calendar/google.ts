import { calendarRequestEventId } from "./event-id";
import { createHash, randomUUID } from "node:crypto";
import { encryptSecret, decryptSecret } from "@/lib/security/encryption";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import type {
  BusyBlock,
  CalendarEventInput,
  CalendarPort,
} from "@/lib/adapters/calendar";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
].join(" ");

export class CalendarUnavailableError extends Error {
  constructor(public readonly status?: number) {
    super("Takvim doğrulanamadı");
    this.name = "CalendarUnavailableError";
  }
}

export class CalendarReconnectRequiredError extends CalendarUnavailableError {
  constructor() {
    super(401);
    this.name = "CalendarReconnectRequiredError";
  }
}

type TokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  calendarId: string;
};

async function refreshAccessToken(refreshToken: string) {
  const env = getEnv();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error?: string };
    if (error.error === "invalid_grant") throw new CalendarReconnectRequiredError();
    throw new CalendarUnavailableError(response.status);
  }
  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!payload.access_token) {
    throw new Error("google token refresh missing access_token");
  }
  return {
    accessToken: payload.access_token,
    expiresAt: new Date(
      Date.now() + Math.max(30, (payload.expires_in ?? 3600) - 60) * 1000,
    ),
  };
}

export async function getCalendarConnection(userId: string): Promise<TokenSet | null> {
  const row = await prisma.calendarConnection.findUnique({ where: { userId } });
  if (!row) return null;
  if (row.expiresAt.getTime() - Date.now() > 60_000) {
    return {
      accessToken: decryptSecret(row.accessToken, `${userId}:access`),
      refreshToken: decryptSecret(row.refreshToken, `${userId}:refresh`),
      expiresAt: row.expiresAt,
      calendarId: row.calendarId,
    };
  }
  const refreshed = await refreshAccessToken(
    decryptSecret(row.refreshToken, `${userId}:refresh`),
  );
  const updated = await prisma.calendarConnection.update({
    where: { userId },
    data: {
      accessToken: encryptSecret(refreshed.accessToken, `${userId}:access`),
      expiresAt: refreshed.expiresAt,
    },
  });
  return {
    accessToken: decryptSecret(updated.accessToken, `${userId}:access`),
    refreshToken: decryptSecret(updated.refreshToken, `${userId}:refresh`),
    expiresAt: updated.expiresAt,
    calendarId: updated.calendarId,
  };
}

async function resolveOwner(ownerUserId?: string | null): Promise<TokenSet> {
  if (!ownerUserId) throw new CalendarUnavailableError();
  try {
    const connection = await getCalendarConnection(ownerUserId);
    if (!connection) throw new CalendarUnavailableError();
    return connection;
  } catch (error) {
    if (error instanceof CalendarReconnectRequiredError) throw error;
    throw new CalendarUnavailableError();
  }
}

export async function hasCalendarConnection(ownerUserId?: string | null) {
  if (!ownerUserId) return false;
  const own = await prisma.calendarConnection.findUnique({
    where: { userId: ownerUserId },
    select: { id: true },
  });
  return Boolean(own);
}

export type CalendarConnectionHealth =
  | "absent"
  | "connected"
  | "reconnect_required"
  | "unverified";

/** A stored row is not a working grant: Google can reject the refresh token
 *  while the row still exists, and staff would otherwise read "connected"
 *  while the assistant cannot see the calendar at all. A short read proves it. */
export async function checkCalendarConnection(
  ownerUserId?: string | null,
): Promise<CalendarConnectionHealth> {
  if (!(await hasCalendarConnection(ownerUserId))) return "absent";
  const from = new Date();
  try {
    await new GoogleCalendar().listBusy({
      ownerUserId,
      from,
      to: new Date(from.getTime() + 60_000),
    });
    return "connected";
  } catch (error) {
    // Only a revoked or expired grant is the owner's to fix; a provider outage
    // must not tell them to reconnect.
    return error instanceof CalendarReconnectRequiredError
      ? "reconnect_required"
      : "unverified";
  }
}

async function calendarFetch(token: TokenSet, path: string, init?: RequestInit) {
  try {
    const response = await fetch(`${CAL_BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    // DELETE of an already deleted event is complete. A 404 may instead
    // mean lost calendar access, so it must remain a retryable failure.
    if (init?.method === "DELETE" && response.status === 410) return null;
    if (!response.ok) {
      throw new CalendarUnavailableError(response.status);
    }
    if (response.status === 204) return null;
    return await response.json();
  } catch (error) {
    if (error instanceof CalendarUnavailableError) throw error;
    throw new CalendarUnavailableError();
  }
}

export class GoogleCalendar implements CalendarPort {
  async ensureMeeting(input: { ownerUserId: string; calendarEventId: string }) {
    const token = await resolveOwner(input.ownerUserId);
    const path = `/calendars/${encodeURIComponent(token.calendarId)}/events/${encodeURIComponent(input.calendarEventId)}`;
    const event = await calendarFetch(token, path);
    if (event.status === "cancelled") throw new CalendarUnavailableError();
    const link =
      event.hangoutLink ??
      event.conferenceData?.entryPoints?.find(
        (p: { entryPointType: string }) => p.entryPointType === "video",
      )?.uri;
    if (link && /^https:\/\/meet\.google\.com\//.test(link)) return link as string;
    if (event.conferenceData?.createRequest?.status?.statusCode === "pending")
      return null;
    const result = await calendarFetch(token, `${path}?conferenceDataVersion=1`, {
      method: "PATCH",
      headers: event.etag ? { "If-Match": event.etag } : {},
      body: JSON.stringify({
        conferenceData: {
          createRequest: {
            requestId: createHash("sha256")
              .update(
                `meet:${input.calendarEventId}:${event.conferenceData?.createRequest?.status?.statusCode === "failure" ? randomUUID() : "initial"}`,
              )
              .digest("hex"),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    });
    const created =
      result.hangoutLink ??
      result.conferenceData?.entryPoints?.find(
        (p: { entryPointType: string }) => p.entryPointType === "video",
      )?.uri;
    if (result.conferenceData?.createRequest?.status?.statusCode === "failure")
      throw new CalendarUnavailableError();
    return created && /^https:\/\/meet\.google\.com\//.test(created)
      ? (created as string)
      : null;
  }

  async appendNote(input: {
    ownerUserId: string;
    calendarEventId: string;
    noteId: string;
    text: string;
  }) {
    const token = await resolveOwner(input.ownerUserId);
    if (!token) throw new CalendarUnavailableError();
    const path = `/calendars/${encodeURIComponent(token.calendarId)}/events/${encodeURIComponent(input.calendarEventId)}`;
    const event = (await calendarFetch(token, path)) as {
      description?: string;
      etag?: string;
    };
    const marker = `[Santa not:${input.noteId}]`;
    if (event.description?.includes(marker)) return;
    await calendarFetch(token, path, {
      method: "PATCH",
      headers: event.etag ? { "If-Match": event.etag } : {},
      body: JSON.stringify({
        description: [event.description, `${marker}\n${input.text}`]
          .filter(Boolean)
          .join("\n\n"),
      }),
    });
  }
  async updateEvent(input: CalendarEventInput) {
    const token = await resolveOwner(input.ownerUserId);
    if (!token) {
      throw new Error("Google Calendar bağlı değil");
    }
    const calendarId = encodeURIComponent(input.calendarId ?? token.calendarId);
    const body = {
      ...(input.requestId && !input.calendarEventId
        ? { id: calendarRequestEventId(input.requestId) }
        : {}),
      summary: input.summary,
      ...(input.sessionMode
        ? {
            location:
              input.sessionMode === "ONLINE" ? "Online · Google Meet" : "Klinikte",
          }
        : {}),
      start: { dateTime: input.startAt.toISOString(), timeZone: "Europe/Istanbul" },
      end: { dateTime: input.endAt.toISOString(), timeZone: "Europe/Istanbul" },
    };
    if (input.calendarEventId) {
      const payload = (await calendarFetch(
        token,
        `/calendars/${calendarId}/events/${encodeURIComponent(input.calendarEventId)}`,
        { method: "PATCH", body: JSON.stringify(body) },
      )) as { id?: string };
      return { calendarEventId: payload.id ?? input.calendarEventId };
    }
    let payload: { id?: string };
    try {
      payload = await calendarFetch(token, `/calendars/${calendarId}/events`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (
        !(error instanceof CalendarUnavailableError) ||
        error.status !== 409 ||
        !input.requestId
      )
        throw error;
      // A previous insert may have succeeded while its response or DB commit failed.
      // Retry the same owned event instead of creating another booking.
      const id = calendarRequestEventId(input.requestId);
      const existing = await calendarFetch(
        token,
        `/calendars/${calendarId}/events/${id}`,
      );
      if (existing.status === "cancelled") throw new CalendarUnavailableError();
      payload = await calendarFetch(token, `/calendars/${calendarId}/events/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    }
    if (!payload.id) throw new CalendarUnavailableError();
    return { calendarEventId: payload.id };
  }

  async cancelEvent(input: {
    calendarEventId?: string | null;
    calendarId?: string | null;
    ownerUserId?: string | null;
  }) {
    if (!input.calendarEventId) return;
    const token = await resolveOwner(input.ownerUserId);
    if (!token) throw new CalendarUnavailableError();
    const calendarId = encodeURIComponent(input.calendarId ?? token.calendarId);
    await calendarFetch(
      token,
      `/calendars/${calendarId}/events/${encodeURIComponent(input.calendarEventId)}`,
      { method: "DELETE" },
    );
  }

  async listBusy(input: {
    ownerUserId?: string | null;
    calendarId?: string | null;
    excludeEventId?: string | null;
    from: Date;
    to: Date;
  }): Promise<BusyBlock[]> {
    if (input.excludeEventId && input.ownerUserId) {
      const events = await listCalendarEvents(input.ownerUserId, input.from, input.to);
      return events
        .filter((e) => e.busy && e.id !== input.excludeEventId)
        .map((e) => ({
          startAt: new Date(e.allDay ? `${e.start}T00:00:00+03:00` : e.start),
          endAt: new Date(e.allDay ? `${e.end}T00:00:00+03:00` : e.end),
        }));
    }
    const token = await resolveOwner(input.ownerUserId);
    if (!token) throw new CalendarUnavailableError();
    const calendarId = input.calendarId ?? token.calendarId;
    const payload = (await calendarFetch(token, "/freeBusy", {
      method: "POST",
      body: JSON.stringify({
        timeMin: input.from.toISOString(),
        timeMax: input.to.toISOString(),
        items: [{ id: calendarId }],
      }),
    })) as {
      calendars?: Record<
        string,
        { busy?: Array<{ start: string; end: string }>; errors?: unknown[] }
      >;
    };
    const result = payload.calendars?.[calendarId];
    if (!result || result.errors?.length || !Array.isArray(result.busy))
      throw new CalendarUnavailableError();
    return result.busy.map((block) => ({
      startAt: new Date(block.start),
      endAt: new Date(block.end),
    }));
  }
}

export class ResolvingCalendar implements CalendarPort {
  async appendNote(input: {
    ownerUserId: string;
    calendarEventId: string;
    noteId: string;
    text: string;
  }) {
    if (!(await this.connected(input.ownerUserId)) || !this.google.appendNote)
      throw new CalendarUnavailableError();
    return this.google.appendNote(input);
  }
  constructor(
    private readonly google: CalendarPort,
    private readonly fallback: CalendarPort,
  ) {}

  private async connected(ownerUserId?: string | null) {
    return hasCalendarConnection(ownerUserId);
  }

  async updateEvent(input: CalendarEventInput) {
    if (await this.connected(input.ownerUserId)) {
      return this.google.updateEvent(input);
    }
    throw new CalendarUnavailableError();
  }

  async cancelEvent(input: {
    calendarEventId?: string | null;
    calendarId?: string | null;
    ownerUserId?: string | null;
  }) {
    if (await this.connected(input.ownerUserId)) {
      return this.google.cancelEvent(input);
    }
    throw new CalendarUnavailableError();
  }

  async listBusy(input: {
    ownerUserId?: string | null;
    calendarId?: string | null;
    excludeEventId?: string | null;
    from: Date;
    to: Date;
  }) {
    if (await this.connected(input.ownerUserId)) {
      return this.google.listBusy(input);
    }
    throw new CalendarUnavailableError();
  }
}

export type CalendarDisplayEvent = {
  id: string;
  start: string;
  end: string;
  allDay: boolean;
  busy: boolean;
};
export async function listCalendarEvents(
  ownerUserId: string,
  from: Date,
  to: Date,
): Promise<CalendarDisplayEvent[]> {
  const token = await resolveOwner(ownerUserId);
  const items: CalendarDisplayEvent[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      timeZone: "Europe/Istanbul",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const payload = (await calendarFetch(
      token,
      `/calendars/${encodeURIComponent(token.calendarId)}/events?${query}`,
    )) as {
      nextPageToken?: string;
      items?: Array<{
        id: string;
        status?: string;
        transparency?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
    };
    if (!Array.isArray(payload.items)) throw new CalendarUnavailableError();
    for (const event of payload.items) {
      const start = event.start?.dateTime ?? event.start?.date;
      const end = event.end?.dateTime ?? event.end?.date;
      if (event.status !== "cancelled" && start && end)
        items.push({
          id: event.id,
          start,
          end,
          allDay: !event.start?.dateTime,
          busy: event.transparency !== "transparent",
        });
    }
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return items;
}
