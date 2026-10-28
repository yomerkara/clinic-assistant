import { requestMfa } from "@/lib/auth/mfa";
import { requiresAccountSetup } from "@/lib/auth/local-security-deferral";
import { allowAuthAttempt } from "@/lib/auth/rate-limit";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { issueSession, sessionCookieOptions } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { publicOrigin } from "@/lib/http";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("identifier") ?? form.get("email") ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 254);
  const origin = publicOrigin(request);
  if (!(await allowAuthAttempt("login", email)))
    return NextResponse.redirect(new URL("/login?error=rate", origin), 303);
  const password = String(form.get("password") ?? "");
  const user = await prisma.user.findFirst({
    where: { OR: [{ email }, { username: email }] },
  });
  const valid = verifyPassword(
    password,
    user?.passwordHash ?? `scrypt2:${"0".repeat(32)}:${"0".repeat(128)}`,
  );
  if (!user || !user.active || !valid) {
    return NextResponse.redirect(new URL("/login?error=1", origin), 303);
  }
  if (user.mfaEnabledAt) return requestMfa(user.id, request);
  const { token, expiresAt } = await issueSession(user.id);
  const response = NextResponse.redirect(
    new URL(
      user.onboardingCompletedAt && !(await requiresAccountSetup(user))
        ? "/queue"
        : "/onboarding",
      origin,
    ),
    303,
  );
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return response;
}
