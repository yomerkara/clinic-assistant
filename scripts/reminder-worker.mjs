const appUrl = process.env.APP_URL ?? "http://app:3000";
const secret = process.env.REMINDER_JOB_SECRET?.trim();
if (!secret || secret.length < 32 || /^(.)\1+$/.test(secret)) {
  throw new Error(
    "REMINDER_JOB_SECRET requires a random secret of at least 32 characters",
  );
}
const intervalMs = Math.max(60_000, Number(process.env.REMINDER_INTERVAL_MS ?? 60_000));

async function run() {
  try {
    const response = await fetch(`${appUrl}/api/jobs/reminders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) process.stderr.write(`reminder job failed: ${response.status}\n`);
    else {
      const result = await response.json();
      if (result.failed || result.lifecycle?.failed)
        process.stderr.write(`reminder deliveries pending retry: ${(result.failed ?? 0) + (result.lifecycle?.failed ?? 0)}\n`);
    }
  } catch (error) {
    process.stderr.write(
      `reminder job error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  } finally {
    setTimeout(() => void run(), intervalMs);
  }
}

await run();
