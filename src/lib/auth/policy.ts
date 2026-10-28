export const PASSWORD_MIN_LENGTH = 15;
export function passwordPolicyError(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > 128)
    return "Şifreniz 15–128 karakter olmalı.";
  if (
    /^(.)\1+$/.test(password) ||
    /^(password|sifre|şifre|123456|qwerty|santa)[\W\d]*$/i.test(password)
  )
    return "Kolay tahmin edilen bir şifre yerine uzun ve benzersiz bir şifre seçin.";
  return null;
}
export function passwordExpiry(now = new Date()) {
  const months = Number(process.env.PASSWORD_ROTATION_MONTHS ?? "6");
  if (!Number.isInteger(months) || months < 1 || months > 12)
    throw new Error("Invalid password rotation policy");
  const next = new Date(now);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}
export function needsAccountSetup(
  user: {
    username?: string | null;
    emailVerifiedAt?: Date | null;
    mustChangePassword?: boolean;
    passwordExpiresAt?: Date | null;
    mfaEnabledAt?: Date | null;
  },
  now = new Date(),
  emailDeferred = false,
  securityDeferred = false,
) {
  return (
    (!user.emailVerifiedAt && !emailDeferred) ||
    (!securityDeferred &&
      (!user.mfaEnabledAt ||
        !user.username ||
        Boolean(user.mustChangePassword) ||
        Boolean(user.passwordExpiresAt && user.passwordExpiresAt <= now)))
  );
}
export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}
export function validUsername(value: string) {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(value);
}
