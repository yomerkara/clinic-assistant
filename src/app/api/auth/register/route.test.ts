import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

it("sends a posted sign-up attempt to the login screen on the configured origin", async () => {
  vi.stubEnv("APP_URL", "https://clinic.example");
  const response = await POST(
    new Request("https://clinic.example/api/auth/register", { method: "POST" }),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("https://clinic.example/login?error=1");
});

it("ignores a forged Host header and uses the configured origin", async () => {
  vi.stubEnv("APP_URL", "https://clinic.example");
  const response = await POST(
    new Request("https://evil.example/api/auth/register", {
      method: "POST",
      headers: { host: "evil.example" },
    }),
  );
  expect(response.headers.get("location")).toBe("https://clinic.example/login?error=1");
});
