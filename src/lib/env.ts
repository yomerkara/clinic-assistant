import { z } from "zod";
import { isStrongJobSecret } from "./security/job-auth";

const optionalUrl = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  })
  .pipe(z.string().url().optional());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  APP_URL: z.string().url("APP_URL must be a valid URL"),
  APP_TIMEZONE: z.string().min(1).default("Europe/Istanbul"),
  OPENAI_API_KEY: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  LLM_MODEL: z.string().min(1).default("gpt-4o-mini"),
  LLM_BASE_URL: optionalUrl,
  GOOGLE_CLIENT_ID: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  GOOGLE_CLIENT_SECRET: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  CLINIC_EMERGENCY_TEXT: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
});

export type AppEnv = z.infer<typeof envSchema>;

function firstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

export function loadEnv(source: Record<string, string | undefined>): AppEnv {
  if (source.NODE_ENV === "production") {
    if (!isStrongJobSecret(source.REMINDER_JOB_SECRET)) {
      throw new Error(
        "REMINDER_JOB_SECRET must be a separate random secret of at least 32 characters in production",
      );
    }
    if (
      !isStrongJobSecret(source.SESSION_SECRET) ||
      source.SESSION_SECRET?.trim() === source.REMINDER_JOB_SECRET?.trim()
    ) {
      throw new Error(
        "SESSION_SECRET must be a separate random secret of at least 32 characters in production",
      );
    }
  }
  return envSchema.parse({
    ...source,
    OPENAI_API_KEY: firstNonEmpty(source.OPENAI_API_KEY, source.LLM_API_KEY),
    LLM_BASE_URL: firstNonEmpty(source.LLM_BASE_URL, source.LLM_API_BASE),
  });
}

let cached: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (!cached) {
    cached = loadEnv(process.env);
  }
  return cached;
}
