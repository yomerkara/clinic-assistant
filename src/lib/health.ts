export type HealthResult = { ok: true } | { ok: false };

export async function checkHealth(ping: () => Promise<unknown>): Promise<HealthResult> {
  try {
    await ping();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
