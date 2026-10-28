import { prisma } from "@/lib/prisma";
import { canDeferSetup } from "./setup-deferral";
import { hasLocalEmailDeferral } from "./local-email-deferral";
import { needsAccountSetup } from "./policy";
export async function hasLocalSecurityDeferral(user: { id: string }) {
  if (!canDeferSetup()) return false;
  const latest = await prisma.auditEvent.findFirst({
    where: {
      actorId: user.id,
      entityId: user.id,
      entityType: "User",
      action: {
        in: ["account.local_security_deferred", "account.local_security_resumed"],
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { action: true },
  });
  return latest?.action === "account.local_security_deferred";
}
export async function requiresAccountSetup(
  user: Parameters<typeof needsAccountSetup>[0] & {
    id: string;
    role: string;
    email: string;
  },
) {
  // Security configuration is optional and managed from account settings.
  // Existing MFA challenges during login remain enforced separately.
  return !user.emailVerifiedAt && !(await hasLocalEmailDeferral(user));
}
