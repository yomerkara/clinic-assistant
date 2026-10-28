import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function encodeBase32(bytes: Buffer) {
  let value = 0,
    bits = 0,
    output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
function decodeBase32(text: string) {
  let value = 0,
    bits = 0;
  const bytes: number[] = [];
  for (const char of text.replace(/=+$/, "").toUpperCase()) {
    const n = alphabet.indexOf(char);
    if (n < 0) throw new Error("Invalid base32");
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
export function newTotpSecret() {
  return encodeBase32(randomBytes(20));
}
export function totpCode(secret: string, counter: number, digits = 6) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = hash[hash.length - 1]! & 15;
  const code = (hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, "0");
}
export function verifyTotp(
  secret: string,
  code: string,
  lastCounter: number | null = null,
  now = Date.now(),
) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const counter of [current, current - 1, current + 1]) {
    if (counter < 0 || (lastCounter != null && counter <= lastCounter)) continue;
    if (timingSafeEqual(Buffer.from(totpCode(secret, counter)), Buffer.from(code)))
      return counter;
  }
  return null;
}
export function recoveryHash(value: string) {
  return createHash("sha256")
    .update(value.replace(/[-\s]/g, "").toLowerCase())
    .digest("hex");
}
export function newRecoveryCodes() {
  return Array.from({ length: 10 }, () =>
    randomBytes(12)
      .toString("hex")
      .match(/.{1,6}/g)!
      .join("-"),
  );
}
