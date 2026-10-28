import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MFA_COOKIE } from "@/lib/auth/mfa";
import { digestToken } from "@/lib/auth/tokens";
import { allowAuthAttempt } from "@/lib/auth/rate-limit";
import { verifyTotp, recoveryHash } from "@/lib/auth/totp";
import { decryptSecret } from "@/lib/security/encryption";
import { issueSession, sessionCookieOptions } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { requiresAccountSetup } from "@/lib/auth/local-security-deferral";
import { publicOrigin } from "@/lib/http";
export async function POST(request: Request) {
  const token = (await cookies()).get(MFA_COOKIE)?.value ?? "";
  const form = await request.formData();
  const code = String(form.get("code") ?? "").trim();
  const fail = () =>
    NextResponse.redirect(new URL("/mfa?error=1", publicOrigin(request)), 303);
  if (!/^[a-f0-9]{64}$/.test(token)) return fail();
  const challenge = await prisma.securityToken.findUnique({
    where: { tokenHash: digestToken(token) },
  });
  if (
    !challenge ||
    challenge.kind !== "mfa-login" ||
    challenge.expiresAt < new Date() ||
    !(await allowAuthAttempt("mfa-login", challenge.userId, 8))
  )
    return fail();
  try {
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${challenge.userId}))`;
      const current = await tx.user.findUniqueOrThrow({
        where: { id: challenge.userId },
      });
      if (!current.active || !current.mfaEnabledAt || !current.totpSecretEncrypted)
        throw new Error("MFA unavailable");
      const counter = verifyTotp(
        decryptSecret(current.totpSecretEncrypted, `${current.id}:totp`),
        code,
        current.totpLastCounter,
      );
      const recovery = /^[a-f0-9\-]{24,27}$/i.test(code) ? recoveryHash(code) : null;
      if (
        counter === null &&
        (!recovery || !current.recoveryCodeHashes.includes(recovery))
      )
        throw new Error("Invalid code");
      const consumed = await tx.securityToken.deleteMany({
        where: { id: challenge.id, expiresAt: { gt: new Date() } },
      });
      if (consumed.count !== 1) throw new Error("Used challenge");
      await tx.user.update({
        where: { id: current.id },
        data:
          counter !== null
            ? { totpLastCounter: counter }
            : {
                recoveryCodeHashes: current.recoveryCodeHashes.filter(
                  (h) => h !== recovery,
                ),
              },
      });
      await tx.auditEvent.create({
        data: {
          actorId: current.id,
          action: counter !== null ? "account.mfa_login" : "account.recovery_code_used",
          entityType: "User",
          entityId: current.id,
          metadata: {},
        },
      });
      return current;
    });
    const session = await issueSession(user.id);
    const response = NextResponse.redirect(
      new URL(
        user.onboardingCompletedAt && !(await requiresAccountSetup(user))
          ? "/queue"
          : "/onboarding",
        publicOrigin(request),
      ),
      303,
    );
    response.cookies.set(
      SESSION_COOKIE,
      session.token,
      sessionCookieOptions(session.expiresAt),
    );
    response.cookies.set(MFA_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  } catch {
    return fail();
  }
}
