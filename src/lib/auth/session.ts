import { canDeferSetup, SETUP_DEFER_COOKIE } from "@/lib/auth/setup-deferral";
import { requiresAccountSetup } from "@/lib/auth/local-security-deferral";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createToken, hashToken } from "@/lib/auth/password";
import type { Actor } from "@/lib/auth/rbac";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { cookieSecure } from "@/lib/http";

const SESSION_DAYS = 7;

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecure(),
    path: "/",
    expires: expiresAt,
  };
}

export async function issueSession(userId: string) {
  const token = createToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export async function createSession(userId: string) {
  const { token, expiresAt } = await issueSession(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { therapistProfile: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) {
    return null;
  }
  return session.user;
}

export function toActor(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
): Actor {
  return {
    userId: user.id,
    role: user.role,
    therapistProfileId: user.therapistProfile?.id ?? null,
  };
}

export async function isSetupDeferred() {
  if (!canDeferSetup()) return false;
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return Boolean(token && jar.get(SETUP_DEFER_COOKIE)?.value === hashToken(token));
}

export async function requireUser(options?: { allowIncompleteOnboarding?: boolean }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (
    !options?.allowIncompleteOnboarding &&
    !(await isSetupDeferred()) &&
    (!user.onboardingCompletedAt || (await requiresAccountSetup(user)))
  ) {
    redirect("/onboarding");
  }
  return user;
}
