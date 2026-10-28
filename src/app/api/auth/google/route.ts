import { googleCallbackUrl } from "@/lib/auth/google-callback";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/http";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const origin = publicOrigin(request);
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET?.trim())
    return NextResponse.redirect(new URL("/login?error=google_config", origin));
  const state = randomBytes(24).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleCallbackUrl("auth"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  const response = NextResponse.redirect(url);
  response.cookies.set("santa_google_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 600,
  });
  return response;
}
