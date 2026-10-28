import { timingSafeEqual } from "node:crypto";

export function isStrongJobSecret(value: string | undefined): value is string {
  return Boolean(value && value.trim().length >= 32 && !/^(.)\1+$/.test(value.trim()));
}

export function authorizeJob(
  request: Request,
  secret = process.env.REMINDER_JOB_SECRET,
): boolean {
  if (!isStrongJobSecret(secret)) return false;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret.trim()}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
