import { describe, it, expect, vi, afterEach } from "vitest";
import { encryptSecret, decryptSecret } from "./encryption";
afterEach(() => vi.unstubAllEnvs());
describe("authenticated secret storage", () => {
  it("binds ciphertext to its owner and purpose", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "1".repeat(64));
    const cipher = encryptSecret("oauth-secret", "alice:access");
    expect(cipher).not.toContain("oauth-secret");
    expect(decryptSecret(cipher, "alice:access")).toBe("oauth-secret");
    expect(() => decryptSecret(cipher, "bob:access")).toThrow();
    expect(() => decryptSecret(cipher, "alice:refresh")).toThrow();
    expect(() => decryptSecret("plaintext", "alice:access")).toThrow();
  });
  it("fails closed without an encryption key", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "");
    expect(() => encryptSecret("token", "owner")).toThrow();
  });
});
