import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/http";

// Self-service registration is not offered: staff accounts are created by the
// clinic administrator. The route stays so that a posted sign-up form lands on
// the login screen instead of an unhandled error.
export async function POST(request: Request) {
  return NextResponse.redirect(new URL("/login?error=1", publicOrigin(request)), 303);
}
