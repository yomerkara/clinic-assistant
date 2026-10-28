import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { POST } from "./app/api/jobs/inbound/route";

const { drain } = vi.hoisted(() => ({ drain: vi.fn() }));
vi.mock("@/lib/conversation/buffer-service", () => ({ inboundBuffer: { drain } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("background job authentication", () => {
  it("lets workers reach their bearer authentication without a browser session", () => {
    for (const path of ["/api/jobs/inbound", "/api/jobs/reminders"]) {
      const response = proxy(
        new NextRequest(`http://localhost:3000${path}`, { method: "POST" }),
      );
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
    expect(proxy(new NextRequest("http://localhost:3000/invoices")).status).toBe(307);
  });

  it("does not process messages without the worker secret", async () => {
    vi.stubEnv("REMINDER_JOB_SECRET", "test-worker-secret");
    const response = await POST(
      new Request("http://localhost:3000/api/jobs/inbound", { method: "POST" }),
    );
    expect(response.status).toBe(401);
    expect(drain).not.toHaveBeenCalled();
  });
});

describe("response security headers", () => {
  it("sends a nonce-based content security policy with every rendered page", () => {
    const response = proxy(
      new NextRequest("http://localhost:3000/queue", {
        headers: { cookie: `${"santa_session"}=token` },
      }),
    );
    const policy = response.headers.get("content-security-policy") ?? "";
    expect(policy).toMatch(/script-src 'self' 'nonce-[a-f0-9]{32}' 'strict-dynamic'/);
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("base-uri 'self'");
    // Inline style attributes are used by the admin screens and cannot be nonced,
    // but inline <style> and <script> blocks stay disallowed.
    expect(policy).toContain("style-src-attr 'unsafe-inline'");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("same-origin");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("gives each request its own nonce so a leaked value cannot be replayed", () => {
    const policies = [0, 1].map(
      () =>
        proxy(
          new NextRequest("http://localhost:3000/queue", {
            headers: { cookie: "santa_session=token" },
          }),
        ).headers.get("content-security-policy") ?? "",
    );
    expect(policies[0]).not.toBe(policies[1]);
  });

  it("passes the nonce to the renderer so Next.js can mark its own scripts", () => {
    const response = proxy(
      new NextRequest("http://localhost:3000/queue", {
        headers: { cookie: "santa_session=token" },
      }),
    );
    const forwarded = response.headers.get("x-middleware-override-headers") ?? "";
    expect(forwarded).toContain("x-nonce");
  });
});

describe("cross-origin write protection", () => {
  it("refuses a state-changing request from another site", () => {
    vi.stubEnv("APP_URL", "https://clinic.example");
    const cases: Array<Record<string, string>> = [
      { origin: "https://evil.example" },
      { origin: "https://clinic.example", "sec-fetch-site": "cross-site" },
      {},
    ];
    for (const headers of cases) {
      const response = proxy(
        new NextRequest("https://clinic.example/api/simulator", {
          method: "POST",
          headers: { cookie: "santa_session=token", ...headers },
        }),
      );
      expect(response.status).toBe(403);
    }
  });

  it("allows a same-origin write", () => {
    vi.stubEnv("APP_URL", "https://clinic.example");
    const response = proxy(
      new NextRequest("https://clinic.example/api/simulator", {
        method: "POST",
        headers: {
          cookie: "santa_session=token",
          origin: "https://clinic.example",
          "sec-fetch-site": "same-origin",
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
  });
});
