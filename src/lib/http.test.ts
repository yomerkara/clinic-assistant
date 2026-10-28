import { describe, expect, it } from "vitest";
import { cookieSecure, resolvePublicOrigin } from "./http";

const appUrl = "http://localhost:3000";

describe("resolvePublicOrigin", () => {
  it("prefers the Host header over a 0.0.0.0 listen address", () => {
    const request = new Request("http://0.0.0.0:3000/api/auth/login", {
      headers: { host: "localhost:3000" },
    });
    expect(resolvePublicOrigin(request, appUrl)).toBe("http://localhost:3000");
  });

  it("falls back to APP_URL when the host is the bind address", () => {
    const request = new Request("http://0.0.0.0:3000/api/auth/login", {
      headers: { host: "0.0.0.0:3000" },
    });
    expect(resolvePublicOrigin(request, appUrl)).toBe("http://localhost:3000");
  });

  it("ignores untrusted forwarded hosts", () => {
    const request = new Request("http://0.0.0.0:3000/queue", {
      headers: {
        host: "0.0.0.0:3000",
        "x-forwarded-host": "clinic.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(resolvePublicOrigin(request, appUrl)).toBe("http://localhost:3000");
  });
});

describe("cookieSecure", () => {
  it("is false for local http APP_URL", () => {
    expect(cookieSecure("http://localhost:3000")).toBe(false);
  });

  it("is true for https APP_URL", () => {
    expect(cookieSecure("https://clinic.example")).toBe(true);
  });
});
