import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { publicOrigin } from "@/lib/http";

export async function POST(request: Request) {
  await destroySession();
  const response = NextResponse.redirect(new URL("/login", publicOrigin(request)), 303);
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
