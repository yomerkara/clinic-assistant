import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
// Bound memory use while keeping these onboarding requests off the event loop.
let active = 0;
function derive(password: string, salt: string, upgraded: boolean): Promise<Buffer> {
  if (active >= 2) return Promise.reject(new Error("Password service busy"));
  active++;
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      upgraded ? { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } : {},
      (error, key) => {
        active--;
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}
export async function hashPasswordAsync(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt2:${salt}:${(await derive(password, salt, true)).toString("hex")}`;
}
export async function verifyPasswordAsync(password: string, stored: string) {
  if (password.length > 128) return false;
  const upgraded = stored.startsWith("scrypt2:");
  const [salt, hash] = (upgraded ? stored.slice(8) : stored).split(":");
  if (!/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(hash ?? ""))
    return false;
  return timingSafeEqual(
    Buffer.from(hash, "hex"),
    await derive(password, salt, upgraded),
  );
}
