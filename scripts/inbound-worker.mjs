const appUrl = process.env.APP_URL ?? "http://app:3000";
const secret = process.env.REMINDER_JOB_SECRET?.trim();
if (!secret || secret.length < 32 || /^(.)\1+$/.test(secret)) {
  throw new Error(
    "REMINDER_JOB_SECRET requires a random secret of at least 32 characters",
  );
}

async function tick() {
  try {
    const response = await fetch(`${appUrl}/api/jobs/inbound`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(240000),
    });
    if (!response.ok) console.error(`Inbound worker HTTP ${response.status}`);
  } catch {
    console.error("Inbound worker request failed; persisted messages will retry.");
  }
  setTimeout(tick, 1000);
}
await tick();
