import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, {
    N: 131072,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  }).toString("hex");
  return `scrypt2:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (password.length > 128) return false;
  const upgraded = stored.startsWith("scrypt2:");
  const [salt, hash] = (upgraded ? stored.slice(8) : stored).split(":");
  if (!salt || !/^[a-f0-9]{32}$/.test(salt) || !hash || !/^[a-f0-9]{128}$/.test(hash))
    return false;
  const next = upgraded
    ? scryptSync(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 })
    : scryptSync(password, salt, 64);
  return timingSafeEqual(Buffer.from(hash, "hex"), next);
}

export function hashToken(token: string): string {
  return scryptSync(token, "session", 32).toString("hex");
}

export function createToken(): string {
  return randomBytes(32).toString("hex");
}
