import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
export async function allowAuthAttempt(
  bucket: string,
  identity: string,
  maximum = 8,
  seconds = 900,
) {
  const key = createHash("sha256")
    .update(`${bucket}:${identity.toLowerCase()}`)
    .digest("hex");
  const expiresAt = new Date(Date.now() + seconds * 1000);
  const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "AuthRateLimit" ("key", "count", "expiresAt") VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "AuthRateLimit"."expiresAt" < NOW() THEN 1 ELSE "AuthRateLimit"."count" + 1 END,
      "expiresAt" = CASE WHEN "AuthRateLimit"."expiresAt" < NOW() THEN ${expiresAt} ELSE "AuthRateLimit"."expiresAt" END
    RETURNING "count"`;
  return Boolean(row && row.count <= maximum);
}
