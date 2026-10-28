export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("@/lib/env");
    getEnv();
    if (process.env.NODE_ENV === "production") {
      const { prisma } = await import("@/lib/prisma");
      const { assertRuntimeDatabaseRole } = await import("@/lib/security/database-role");
      await assertRuntimeDatabaseRole(prisma);
    }
  }
}
