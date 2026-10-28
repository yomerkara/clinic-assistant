import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://santa:santa@localhost:5432/santa",
  SESSION_SECRET: "a-session-secret-of-at-least-16",
  APP_URL: "http://localhost:3000",
};

describe("loadEnv", () => {
  it("returns validated config from process env", () => {
    const env = loadEnv(valid);
    expect(env.DATABASE_URL).toContain("postgresql://");
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.APP_TIMEZONE).toBe("Europe/Istanbul");
    expect(env.LLM_MODEL).toBe("gpt-4o-mini");
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it("accepts an OpenAI key and ignores a blank base URL", () => {
    const env = loadEnv({
      ...valid,
      OPENAI_API_KEY: " sk-test ",
      LLM_BASE_URL: "",
    });
    expect(env.OPENAI_API_KEY).toBe("sk-test");
    expect(env.LLM_BASE_URL).toBeUndefined();
  });

  it("accepts LLM_API_KEY and LLM_API_BASE aliases", () => {
    const env = loadEnv({
      ...valid,
      LLM_API_KEY: "gateway-token",
      LLM_API_BASE: "https://llm.example.com/v1",
    });
    expect(env.OPENAI_API_KEY).toBe("gateway-token");
    expect(env.LLM_BASE_URL).toBe("https://llm.example.com/v1");
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() =>
      loadEnv({
        SESSION_SECRET: valid.SESSION_SECRET,
        APP_URL: valid.APP_URL,
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects a short SESSION_SECRET", () => {
    expect(() =>
      loadEnv({
        ...valid,
        SESSION_SECRET: "short",
      }),
    ).toThrow(/SESSION_SECRET/);
  });
});

describe("production secrets", () => {
  const production = {
    ...valid,
    NODE_ENV: "production",
    SESSION_SECRET: "a9c06b58f324d107e8625b40c79a3d16",
    REMINDER_JOB_SECRET: "19f346b705c82ad6e49a7320bc185d6f",
  };
  it("accepts separate production secrets", () => {
    expect(() => loadEnv(production)).not.toThrow();
  });
  it.each([undefined, "local-reminder-job-secret", "a".repeat(32)])(
    "rejects missing and weak worker secrets",
    (secret) => {
      expect(() => loadEnv({ ...production, REMINDER_JOB_SECRET: secret })).toThrow(
        /REMINDER_JOB_SECRET/,
      );
    },
  );
  it("rejects the development session secret and shared secrets", () => {
    expect(() =>
      loadEnv({ ...production, SESSION_SECRET: valid.SESSION_SECRET }),
    ).toThrow(/SESSION_SECRET/);
    expect(() =>
      loadEnv({ ...production, SESSION_SECRET: production.REMINDER_JOB_SECRET }),
    ).toThrow(/SESSION_SECRET/);
  });
});
