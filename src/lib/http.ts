import { getEnv } from "@/lib/env";

export function resolvePublicOrigin(_request: Request, appUrl: string): string {
  // Redirects and OAuth callbacks must use the configured origin, not Host input.
  return new URL(appUrl).origin;
}

export function publicOrigin(request: Request): string {
  return resolvePublicOrigin(request, process.env.APP_URL ?? "http://localhost:3000");
}

export function cookieSecure(appUrl = getEnv().APP_URL): boolean {
  return appUrl.startsWith("https://");
}
