import { expect, it } from "vitest";
import {
  encodeBase32,
  totpCode,
  verifyTotp,
  newRecoveryCodes,
  recoveryHash,
} from "./totp";
it("matches RFC 6238 SHA1 test vectors", () => {
  const secret = encodeBase32(Buffer.from("12345678901234567890"));
  expect(totpCode(secret, Math.floor(59 / 30), 8)).toBe("94287082");
  expect(totpCode(secret, Math.floor(1111111109 / 30), 8)).toBe("07081804");
  expect(totpCode(secret, Math.floor(2000000000 / 30), 8)).toBe("69279037");
});
it("accepts bounded clock drift and rejects replay", () => {
  const secret = encodeBase32(Buffer.from("12345678901234567890"));
  const now = 180000;
  const code = totpCode(secret, 6);
  expect(verifyTotp(secret, code, null, now)).toBe(6);
  expect(verifyTotp(secret, code, 6, now)).toBe(null);
  expect(verifyTotp(secret, totpCode(secret, 3), null, now)).toBe(null);
  expect(verifyTotp(secret, "123", null, now)).toBe(null);
  const codes = newRecoveryCodes();
  expect(new Set(codes).size).toBe(10);
  expect(recoveryHash(codes[0]!)).toBe(
    recoveryHash(codes[0]!.replaceAll("-", "").toUpperCase()),
  );
});
