import { requiresAccountSetup } from "@/lib/auth/local-security-deferral";
import { googleCallbackUrl } from "@/lib/auth/google-callback";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { cookieSecure, publicOrigin } from "@/lib/http";
import { getEnv } from "@/lib/env";
import { GOOGLE_CALENDAR_SCOPES } from "@/lib/calendar/google";
import { canConnectCalendar } from "@/lib/auth/rbac";

export async function GET(request: Request) {
  const user = await requireUser({ allowIncompleteOnboarding: true });
  if (!user.onboardingCompletedAt && ((await requiresAccountSetup(user)) || !user.phone))
    return NextResponse.redirect(new URL("/onboarding", publicOrigin(request)));
  const env = getEnv();
  const origin = publicOrigin(request);
  const requestUrl = new URL(request.url);
  const returnTo =
    requestUrl.searchParams.get("returnTo") === "onboarding"
      ? "/onboarding"
      : "/settings";
  if (!canConnectCalendar(user.role)) {
    return NextResponse.redirect(
      new URL(`${returnTo}?error=calendar_not_allowed`, origin),
    );
  }
  if (!env.GOOGLE_CLIENT_ID?.trim() || !env.GOOGLE_CLIENT_SECRET?.trim()) {
    return NextResponse.redirect(new URL(`${returnTo}?error=google_config`, origin));
  }
  const state = randomBytes(24).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", googleCallbackUrl("calendar"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  const response = NextResponse.redirect(url);
  response.cookies.set("santa_google_cal_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: 600,
  });
  response.cookies.set("santa_google_cal_return", returnTo, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: 600,
  });
  return response;
}

export async function DELETE() {
  const user = await requireUser({ allowIncompleteOnboarding: true });
  if (!canConnectCalendar(user.role)) {
    return NextResponse.json({ error: "Bu hesap takvim bağlayamaz." }, { status: 403 });
  }
  const { prisma } = await import("@/lib/prisma");
  await prisma.calendarConnection.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}
