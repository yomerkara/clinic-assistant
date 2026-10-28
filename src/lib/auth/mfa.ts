import { NextResponse } from "next/server";
import { createToken } from "./password";
import { digestToken } from "./tokens";
import { prisma } from "@/lib/prisma";
import { cookieSecure, publicOrigin } from "@/lib/http";
export const MFA_COOKIE = "santa_mfa_challenge";
export async function requestMfa(userId: string, request: Request) {
  const token = createToken();
  await prisma.securityToken.create({
    data: {
      userId,
      kind: "mfa-login",
      tokenHash: digestToken(token),
      expiresAt: new Date(Date.now() + 5 * 60000),
    },
  });
  const response = NextResponse.redirect(new URL("/mfa", publicOrigin(request)), 303);
  response.cookies.set(MFA_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  return response;
}
