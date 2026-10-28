/** Run with tsx after setting DATA_ENCRYPTION_KEY. Prints counts, never tokens. */
import { PrismaClient } from "@prisma/client";
import { encryptSecret } from "../src/lib/security/encryption";
const prisma = new PrismaClient();
async function main() {
  let migrated = 0;
  for (const row of await prisma.calendarConnection.findMany()) {
    if (row.accessToken.startsWith("enc1:") && row.refreshToken.startsWith("enc1:"))
      continue;
    await prisma.calendarConnection.update({
      where: { id: row.id },
      data: {
        accessToken: row.accessToken.startsWith("enc1:")
          ? row.accessToken
          : encryptSecret(row.accessToken, `${row.userId}:access`),
        refreshToken: row.refreshToken.startsWith("enc1:")
          ? row.refreshToken
          : encryptSecret(row.refreshToken, `${row.userId}:refresh`),
      },
    });
    migrated++;
  }
  console.log(`Encrypted ${migrated} calendar connections.`);
}
main().finally(() => prisma.$disconnect());
