import { prisma } from "@/lib/prisma";
import { canDeferSetup } from "./setup-deferral";
export const LOCAL_ADMIN_EMAIL = "admin@santa.local";
export function canDeferAdminEmail(
  user: { role: string; email: string },
  source: Record<string, string | undefined> = process.env,
) {
  return (
    canDeferSetup(source) && user.role === "ADMIN" && user.email === LOCAL_ADMIN_EMAIL
  );
}
export async function hasLocalEmailDeferral(user: {
  id: string;
  role: string;
  email: string;
}) {
  if (!canDeferAdminEmail(user)) return false;
  return Boolean(
    await prisma.auditEvent.findFirst({
      where: {
        actorId: user.id,
        action: "account.local_email_deferred",
        entityType: "User",
        entityId: user.id,
      },
      select: { id: true },
    }),
  );
}
