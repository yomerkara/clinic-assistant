import { beforeEach, afterEach, it, expect, vi } from "vitest";
const connection = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { calendarConnection: connection } }));
import { GoogleCalendar, CalendarUnavailableError } from "./google";
import { encryptSecret } from "@/lib/security/encryption";
beforeEach(() => {
  vi.stubEnv("DATA_ENCRYPTION_KEY", "1".repeat(64));
  // The token refresh path reads the validated application environment, so the
  // test supplies it instead of depending on a developer's local .env file.
  vi.stubEnv("DATABASE_URL", "postgresql://santa:santa@127.0.0.1:5432/santa_test");
  vi.stubEnv("SESSION_SECRET", "0".repeat(32));
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  connection.findUnique.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("never substitutes another account or an empty calendar for a disconnected owner", async () => {
  connection.findUnique.mockResolvedValue(null);
  await expect(
    new GoogleCalendar().listBusy({
      ownerUserId: "missing",
      from: new Date(),
      to: new Date(Date.now() + 3600000),
    }),
  ).rejects.toBeInstanceOf(CalendarUnavailableError);
});
it("treats calendar-specific Google errors as unavailable rather than free", async () => {
  connection.findUnique.mockResolvedValue({
    accessToken: encryptSecret("test-token", "owner:access"),
    refreshToken: encryptSecret("test-refresh", "owner:refresh"),
    expiresAt: new Date(Date.now() + 3600000),
    calendarId: "primary",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          calendars: { primary: { errors: [{ reason: "notFound" }] } },
        }),
        { status: 200 },
      ),
    ),
  );
  await expect(
    new GoogleCalendar().listBusy({
      ownerUserId: "owner",
      from: new Date(),
      to: new Date(Date.now() + 3600000),
    }),
  ).rejects.toBeInstanceOf(CalendarUnavailableError);
});
it("reads external busy blocks with the actual owner's encrypted token", async () => {
  connection.findUnique.mockResolvedValue({
    accessToken: encryptSecret("test-token", "owner:access"),
    refreshToken: encryptSecret("test-refresh", "owner:refresh"),
    expiresAt: new Date(Date.now() + 3600000),
    calendarId: "primary",
  });
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        calendars: {
          primary: {
            busy: [{ start: "2026-10-06T13:00:00Z", end: "2026-10-06T14:00:00Z" }],
          },
        },
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  const busy = await new GoogleCalendar().listBusy({
    ownerUserId: "owner",
    from: new Date("2026-10-06"),
    to: new Date("2026-10-07"),
  });
  expect(busy[0]?.startAt.toISOString()).toBe("2026-10-06T13:00:00.000Z");
  expect(fetcher.mock.calls[0]?.[1].headers.Authorization).toBe("Bearer test-token");
});

it("treats DELETE 410 as an already completed cancellation", async () => {
  connection.findUnique.mockResolvedValue({
    accessToken: encryptSecret("test-token", "owner:access"),
    refreshToken: encryptSecret("test-refresh", "owner:refresh"),
    expiresAt: new Date(Date.now() + 3600000),
    calendarId: "primary",
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 410 })));
  await expect(
    new GoogleCalendar().cancelEvent({
      ownerUserId: "owner",
      calendarEventId: "event-1",
    }),
  ).resolves.toBeUndefined();
});
it.each([401, 403, 404, 429, 500])(
  "does not mistake DELETE %s for completed cancellation",
  async (status) => {
    connection.findUnique.mockResolvedValue({
      accessToken: encryptSecret("test-token", "owner:access"),
      refreshToken: encryptSecret("test-refresh", "owner:refresh"),
      expiresAt: new Date(Date.now() + 3600000),
      calendarId: "primary",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    await expect(
      new GoogleCalendar().cancelEvent({
        ownerUserId: "owner",
        calendarEventId: "event-1",
      }),
    ).rejects.toBeInstanceOf(CalendarUnavailableError);
  },
);

it("appends a note without overwriting the existing event, and deduplicates retries", async () => {
  connection.findUnique.mockResolvedValue({
    accessToken: encryptSecret("test-token", "owner:access"),
    refreshToken: encryptSecret("test-refresh", "owner:refresh"),
    expiresAt: new Date(Date.now() + 3600000),
    calendarId: "primary",
  });
  const description = "Mevcut açıklama\n\n[Santa not:note-1]\n10 dakika gecikeceğim";
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ description: "Mevcut açıklama", etag: '"v1"' })),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ description })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ description, etag: '"v2"' })));
  vi.stubGlobal("fetch", fetcher);
  const input = {
    ownerUserId: "owner",
    calendarEventId: "event-1",
    noteId: "note-1",
    text: "10 dakika gecikeceğim",
  };
  await new GoogleCalendar().appendNote(input);
  await new GoogleCalendar().appendNote(input);
  expect(fetcher).toHaveBeenCalledTimes(3);
  const patch = fetcher.mock.calls[1][1];
  expect(patch.method).toBe("PATCH");
  expect(patch.headers["If-Match"]).toBe('"v1"');
  expect(JSON.parse(patch.body)).toEqual({ description });
});

it("keeps a concurrent calendar edit safe by rejecting a stale etag", async () => {
  connection.findUnique.mockResolvedValue({
    accessToken: encryptSecret("test-token", "owner:access"),
    refreshToken: encryptSecret("test-refresh", "owner:refresh"),
    expiresAt: new Date(Date.now() + 3600000),
    calendarId: "primary",
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ description: "Eski", etag: '"v1"' })),
      )
      .mockResolvedValueOnce(new Response(null, { status: 412 })),
  );
  await expect(
    new GoogleCalendar().appendNote({
      ownerUserId: "owner",
      calendarEventId: "event",
      noteId: "note",
      text: "Not",
    }),
  ).rejects.toBeInstanceOf(CalendarUnavailableError);
});

function connectedOwner() {
  connection.findUnique.mockResolvedValue({
    accessToken: encryptSecret("test-token", "owner:access"),
    refreshToken: encryptSecret("test-refresh", "owner:refresh"),
    expiresAt: new Date(Date.now() + 3600000),
    calendarId: "primary",
  });
}
it.each([401, 403, 404, 429, 500, 503])(
  "Meet HTTP %s fails without inventing a link",
  async (status) => {
    connectedOwner();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    await expect(
      new GoogleCalendar().ensureMeeting({
        ownerUserId: "owner",
        calendarEventId: "event",
      }),
    ).rejects.toBeInstanceOf(CalendarUnavailableError);
  },
);
it("reuses existing Meet data without overwriting the event", async () => {
  connectedOwner();
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ hangoutLink: "https://meet.google.com/abc-defg-hij" }),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  expect(
    await new GoogleCalendar().ensureMeeting({
      ownerUserId: "owner",
      calendarEventId: "event",
    }),
  ).toBe("https://meet.google.com/abc-defg-hij");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("requests conference data with stable key and waits for asynchronous creation", async () => {
  connectedOwner();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ etag: "v1" })))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conferenceData: { createRequest: { status: { statusCode: "pending" } } },
        }),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  expect(
    await new GoogleCalendar().ensureMeeting({
      ownerUserId: "owner",
      calendarEventId: "event",
    }),
  ).toBeNull();
  expect(fetcher.mock.calls[1][0]).toContain("conferenceDataVersion=1");
  expect(fetcher.mock.calls[1][1].headers["If-Match"]).toBe("v1");
});
it("handles network timeouts as unavailable", async () => {
  connectedOwner();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError")),
  );
  await expect(
    new GoogleCalendar().ensureMeeting({
      ownerUserId: "owner",
      calendarEventId: "event",
    }),
  ).rejects.toBeInstanceOf(CalendarUnavailableError);
});
it("recovers a committed insert after response loss using the same event ID", async () => {
  connectedOwner();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 409 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: "confirmed" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "recovered-event" })));
  vi.stubGlobal("fetch", fetcher);
  const result = await new GoogleCalendar().updateEvent({
    ownerUserId: "owner",
    requestId: "request-1",
    startAt: new Date("2026-10-15T10:00:00Z"),
    endAt: new Date("2026-10-15T10:50:00Z"),
    summary: "test",
  });
  expect(result.calendarEventId).toBe("recovered-event");
  expect(fetcher.mock.calls[1][0]).toBe(fetcher.mock.calls[2][0]);
  expect(fetcher.mock.calls[2][1].method).toBe("PATCH");
});
it("uses a fresh conference request key after Google reports creation failure", async () => {
  connectedOwner();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conferenceData: {
            createRequest: { requestId: "failed-key", status: { statusCode: "failure" } },
          },
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ hangoutLink: "https://meet.google.com/abc-defg-hij" }),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  expect(
    await new GoogleCalendar().ensureMeeting({
      ownerUserId: "owner",
      calendarEventId: "event",
    }),
  ).toContain("meet.google.com");
  expect(
    JSON.parse(fetcher.mock.calls[1][1].body).conferenceData.createRequest.requestId,
  ).not.toBe("failed-key");
});

it("identifies revoked Google authorization without reporting free slots", async () => {
  connection.findUnique.mockResolvedValue({
    accessToken: encryptSecret("test-token", "owner:access"),
    refreshToken: encryptSecret("test-refresh", "owner:refresh"),
    expiresAt: new Date(Date.now() - 3600000),
    calendarId: "primary",
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
      ),
  );
  await expect(
    new GoogleCalendar().listBusy({
      ownerUserId: "owner",
      from: new Date(),
      to: new Date(Date.now() + 3600000),
    }),
  ).rejects.toMatchObject({ name: "CalendarReconnectRequiredError" });
});
