import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { publicOrigin } from "@/lib/http";

// Nonce-based policy per node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
// Next.js reads the nonce from the request header and applies it to its own
// framework and page scripts, so no tag needs it by hand. Inline style
// attributes cannot carry a nonce, so they keep a narrower attribute-only
// allowance instead of opening style-src as a whole. All assets are local.
function contentSecurityPolicy(nonce: string) {
  const development = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const isPublic =
    pathname === "/login" ||
    [
      "/api/jobs/inbound",
      "/api/jobs/reminders",
      "/mfa",
      "/api/auth/mfa/verify",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
    ].includes(pathname) ||
    pathname.startsWith("/api/health") ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/google" ||
    pathname === "/api/auth/google/callback" ||
    pathname === "/";

  const origin = publicOrigin(request);
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    !pathname.startsWith("/api/jobs/")
  ) {
    const source = request.headers.get("origin");
    if (
      !source ||
      source !== origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    ) {
      return NextResponse.json(
        { error: "İstek kaynağı doğrulanamadı." },
        { status: 403 },
      );
    }
  }

  if (!session && !isPublic && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const nonce = crypto.randomUUID().replaceAll("-", "");
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
