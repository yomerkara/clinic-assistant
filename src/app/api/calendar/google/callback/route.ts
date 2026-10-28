import { googleCallbackUrl } from "@/lib/auth/google-callback";
import { encryptSecret } from "@/lib/security/encryption";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { publicOrigin } from "@/lib/http";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { canConnectCalendar } from "@/lib/auth/rbac";

export async function GET(request: Request) {
  const user = await requireUser({ allowIncompleteOnboarding: true });
  const url = new URL(request.url);
  const origin = publicOrigin(request);
  if (!canConnectCalendar(user.role)) {
    return NextResponse.redirect(new URL("/settings?error=calendar_not_allowed", origin));
  }
  const cookieHeader = request.headers.get("cookie") ?? "";
  const state = cookieHeader.match(/(?:^|; )santa_google_cal_state=([^;]+)/)?.[1];
  const returnCookie = cookieHeader.match(/(?:^|; )santa_google_cal_return=([^;]+)/)?.[1];
  const returnTo =
    decodeURIComponent(returnCookie ?? "") === "/onboarding"
      ? "/onboarding"
      : "/settings";
  if (!state || state !== url.searchParams.get("state")) {
    return NextResponse.redirect(new URL(`${returnTo}?error=google`, origin));
  }
  const code = url.searchParams.get("code");
  const env = getEnv();
  if (!code || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(new URL(`${returnTo}?error=google_config`, origin));
  }
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: googleCallbackUrl("calendar"),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new Error("token exchange failed");
    const token = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!token.access_token) throw new Error("missing access token");
    const existing = await prisma.calendarConnection.findUnique({
      where: { userId: user.id },
    });
    if (!token.refresh_token && !existing?.refreshToken?.startsWith("enc1:"))
      throw new Error("Reconnect required");
    await prisma.calendarConnection.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        accessToken: encryptSecret(token.access_token, `${user.id}:access`),
        refreshToken: token.refresh_token
          ? encryptSecret(token.refresh_token, `${user.id}:refresh`)
          : (existing?.refreshToken ?? ""),
        expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
        calendarId: "primary",
      },
      update: {
        accessToken: encryptSecret(token.access_token, `${user.id}:access`),
        refreshToken: token.refresh_token
          ? encryptSecret(token.refresh_token, `${user.id}:refresh`)
          : existing?.refreshToken,
        expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
      },
    });
    const response = NextResponse.redirect(
      new URL(`${returnTo}?calendar=connected`, origin),
    );
    response.cookies.set("santa_google_cal_state", "", { path: "/", maxAge: 0 });
    response.cookies.set("santa_google_cal_return", "", { path: "/", maxAge: 0 });
    return response;
  } catch {
    return NextResponse.redirect(new URL(`${returnTo}?error=google`, origin));
  }
}
