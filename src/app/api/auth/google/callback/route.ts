import { googleCallbackUrl } from "@/lib/auth/google-callback";
import { requestMfa } from "@/lib/auth/mfa";
import { requiresAccountSetup } from "@/lib/auth/local-security-deferral";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueSession, sessionCookieOptions } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { publicOrigin } from "@/lib/http";

type GoogleProfile = { email?: string; name?: string; email_verified?: boolean };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicOrigin(request);
  const state = request.headers
    .get("cookie")
    ?.match(/(?:^|; )santa_google_state=([^;]+)/)?.[1];
  if (!state || state !== url.searchParams.get("state")) {
    return NextResponse.redirect(new URL("/login?error=google", origin));
  }
  const code = url.searchParams.get("code");
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!code || !clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?error=google_config", origin));
  }
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleCallbackUrl("auth"),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new Error("token exchange failed");
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) throw new Error("missing access token");
    const profileResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
      },
    );
    const profile = (await profileResponse.json()) as GoogleProfile;
    if (!profile.email || profile.email_verified !== true)
      throw new Error("unverified email");
    const email = profile.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) {
      return NextResponse.redirect(new URL("/login?error=unknown_user", origin));
    }
    if (user.mfaEnabledAt) {
      const response = await requestMfa(user.id, request);
      response.cookies.set("santa_google_state", "", { path: "/", maxAge: 0 });
      return response;
    }
    const session = await issueSession(user.id);
    const response = NextResponse.redirect(
      new URL(
        user.onboardingCompletedAt && !(await requiresAccountSetup(user))
          ? "/queue"
          : "/onboarding",
        origin,
      ),
    );
    response.cookies.set(
      SESSION_COOKIE,
      session.token,
      sessionCookieOptions(session.expiresAt),
    );
    response.cookies.set("santa_google_state", "", { path: "/", maxAge: 0 });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=google", origin));
  }
}
