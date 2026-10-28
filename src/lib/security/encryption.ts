import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const encoded = process.env.DATA_ENCRYPTION_KEY ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(encoded))
    throw new Error("DATA_ENCRYPTION_KEY must be a 32-byte hex key");
  return Buffer.from(encoded, "hex");
}
export function encryptSecret(value: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "enc1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}
export function decryptSecret(value: string, context: string) {
  const [version, iv, tag, ciphertext] = value.split(":");
  if (version !== "enc1" || !iv || !tag || ciphertext === undefined)
    throw new Error("Secret must be migrated or reconnected");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
