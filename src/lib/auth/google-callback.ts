/** Keep an already registered localhost OAuth callback during local HTTPS migration.
 * Caddy redirects that loopback-only HTTP callback to HTTPS before the app reads it.
 * Public deployments always use their configured HTTPS origin.
 */
export function googleCallbackUrl(
  kind: "auth" | "calendar",
  appUrl = process.env.APP_URL ?? "http://localhost:3000",
  localRelay = process.env.GOOGLE_LOCAL_OAUTH_ORIGIN,
) {
  const app = new URL(appUrl);
  let origin = app.origin;
  if (localRelay?.trim()) {
    if (app.hostname !== "localhost" || localRelay.trim() !== "http://localhost:3000") {
      throw new Error("Google local OAuth relay is only supported on localhost:3000");
    }
    origin = "http://localhost:3000";
  }
  return `${origin}/api/${kind}/google/callback`;
}
