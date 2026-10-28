/** Explicit local-only preview switch; production origins always enforce setup. */
export function canDeferSetup(source: Record<string, string | undefined> = process.env) {
  if (source.ALLOW_LOCAL_SETUP_SKIP !== "true") return false;
  try {
    const url = new URL(source.APP_URL ?? "");
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}
export const SETUP_DEFER_COOKIE = "santa_setup_deferred";
