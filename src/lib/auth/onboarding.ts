import { needsAccountSetup } from "./policy";
export const setupSteps = ["E-posta", "Telefon", "Google takvimi"] as const;
export type SetupUser = Parameters<typeof needsAccountSetup>[0] & {
  phone?: string | null;
  role: string;
};
export function passwordSetupNeeded(user: SetupUser, now = new Date()) {
  return (
    !user.username ||
    Boolean(user.mustChangePassword) ||
    Boolean(user.passwordExpiresAt && user.passwordExpiresAt <= now)
  );
}
export function normalizeSetupPhone(value: string) {
  if (value.length > 40 || /[^\d+\s().-]/.test(value)) return null;
  let phone = value.replace(/[\s().-]/g, "");
  if (/^05\d{9}$/.test(phone)) phone = `+9${phone}`;
  if (/^5\d{9}$/.test(phone)) phone = `+90${phone}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
export function firstSetupStep(
  user: SetupUser,
  _calendarConnected: boolean,
  emailDeferred = false,
) {
  if (!user.emailVerifiedAt && !emailDeferred) return 0;
  if (!user.phone) return 1;
  return 2;
}
export function visibleSetupStep(
  user: SetupUser,
  calendarConnected: boolean,
  requested?: string,
  emailDeferred = false,
) {
  const first = firstSetupStep(user, calendarConnected, emailDeferred);
  if (requested === undefined || !/^[0-2]$/.test(requested)) return first;
  return Math.min(Number(requested), first);
}
