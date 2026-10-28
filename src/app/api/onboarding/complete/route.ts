import { canDeferSetup, SETUP_DEFER_COOKIE } from "@/lib/auth/setup-deferral";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { hashToken } from "@/lib/auth/password";
import { cookieSecure } from "@/lib/http";
import { requiresAccountSetup } from "@/lib/auth/local-security-deferral";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { publicOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await requireUser({ allowIncompleteOnboarding: true });
  const origin = publicOrigin(request);
  const form = await request.formData();
  if (form.get("intent") === "skip") {
    if (!canDeferSetup())
      return NextResponse.json({ error: "Kurulum atlanamaz." }, { status: 403 });
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.redirect(new URL("/login", origin), 303);
    const response = NextResponse.redirect(new URL("/queue", origin), 303);
    response.cookies.set(SETUP_DEFER_COOKIE, hashToken(token), {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure(),
      path: "/",
      maxAge: 86400,
    });
    // Keep verification, MFA and completion fields unchanged.
    return response;
  }
  if ((await requiresAccountSetup(user)) || !user.phone)
    return NextResponse.redirect(
      new URL(
        "/onboarding?securityError=Önce%20e-posta%20ve%20telefon%20adımlarını%20tamamlayın.",
        origin,
      ),
      303,
    );
  if (user.role === "THERAPIST") {
    const connection = await prisma.calendarConnection.findUnique({
      where: { userId: user.id },
    });
    if (!connection) {
      return NextResponse.redirect(
        new URL("/onboarding?error=calendar_required", origin),
        303,
      );
    }
  }
  await prisma.user.updateMany({
    where: { id: user.id, onboardingCompletedAt: null },
    data: { onboardingCompletedAt: new Date() },
  });
  return NextResponse.redirect(
    new URL(user.onboardingCompletedAt ? "/queue" : "/queue?guide=welcome", origin),
    303,
  );
}
