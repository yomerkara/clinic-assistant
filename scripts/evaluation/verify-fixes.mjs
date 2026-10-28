// Re-verifies the fixes from this change set against the deployed application:
// hydration (clinic clock), the content security policy, the real calendar
// connection status in Settings, and the simulator request boundaries.
import fs from "node:fs";
import { chromium } from "../screenshot/node_modules/playwright/index.mjs";

const origin = process.env.VERIFY_ORIGIN || "https://localhost";
const out = process.env.VERIFY_OUT || "artifacts/fix-verification-20261028";
fs.mkdirSync(out, { recursive: true });
const statePath = (id) => `${process.env.VERIFY_STATE_PREFIX || "/tmp/santa-audit-"}${id}.json`;
const cookies = (id) =>
  JSON.parse(fs.readFileSync(statePath(id), "utf8"))
    .cookies.map((c) => `${c.name}=${c.value}`)
    .join("; ");
const admin = cookies("user_admin");
const results = [];
const record = (check, passed, detail) => {
  results.push({ check, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${check}${detail ? ` — ${detail}` : ""}`);
};

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// 1. Security headers, including the new policy.
const page = await fetch(`${origin}/queue`, { headers: { cookie: admin } });
const policy = page.headers.get("content-security-policy") ?? "";
record(
  "csp-nonce-script-src",
  /script-src 'self' 'nonce-[a-f0-9]+' 'strict-dynamic'/.test(policy),
  policy.slice(0, 120),
);
for (const directive of [
  "default-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "style-src-attr 'unsafe-inline'",
])
  record(`csp-has:${directive}`, policy.includes(directive));
record("csp-no-unsafe-inline-script", !/script-src[^;]*'unsafe-inline'/.test(policy));

// 2. Simulator request boundaries (audit item F08).
const simulator = async (body) =>
  (
    await fetch(`${origin}/api/simulator`, {
      method: "POST",
      headers: { cookie: admin, "content-type": "application/json", origin },
      body,
    })
  ).status;
record("simulator-malformed-json-400", (await simulator('{"intent":')) === 400);
record("simulator-non-object-400", (await simulator('"merhaba"')) === 400);
record(
  "simulator-bad-scenario-400",
  (await simulator(
    JSON.stringify({ intent: "conditions", conditions: { scenario: "not-a-scenario" } }),
  )) === 400,
);
record(
  "simulator-oversized-message-400",
  (await simulator(JSON.stringify({ text: "a".repeat(4001) }))) === 400,
);

// 3. Registration post lands on the login screen instead of failing.
const register = await fetch(`${origin}/api/auth/register`, {
  method: "POST",
  headers: { cookie: admin, origin },
  redirect: "manual",
});
record(
  "register-redirects-to-login",
  register.status === 303 && (register.headers.get("location") ?? "").endsWith("/login?error=1"),
  `${register.status} ${register.headers.get("location")}`,
);

// 4. Hydration: the pages that rendered a UTC clock on the server.
const browser = await chromium.launch();
for (const [name, path] of [
  ["demo", "/demo"],
  ["simulator", "/settings/simulator"],
  ["queue", "/queue"],
  ["calendar", "/calendar"],
  ["settings", "/settings"],
]) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: statePath("user_admin"),
    viewport: { width: 1440, height: 1000 },
  });
  const tab = await context.newPage();
  const errors = [];
  tab.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  tab.on("pageerror", (e) => errors.push(String(e)));
  await tab.goto(origin + path, { waitUntil: "domcontentloaded" });
  await tab.waitForTimeout(1500);
  const hydration = errors.filter((e) => /#418|#423|#425|Hydration/i.test(e));
  record(`no-hydration-error:${name}`, hydration.length === 0, hydration[0]?.slice(0, 120));
  const blocked = errors.filter((e) => /Content Security Policy|Refused to/i.test(e));
  record(`no-csp-violation:${name}`, blocked.length === 0, blocked[0]?.slice(0, 160));
  if (name === "settings") {
    const text = await tab.locator("body").innerText();
    record(
      "settings-reports-real-calendar-health",
      /Yeniden bağlantı gerekli|Takvim yetkisi geçersiz|Doğrulanamadı|Bağlı/.test(text),
      (text.match(/Yeniden bağlantı gerekli|Takvim yetkisi geçersiz|Doğrulanamadı|Bağlı/) ?? [])[0],
    );
  }
  await tab.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await context.close();
}
await browser.close();

fs.writeFileSync(out + "/results.json", JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exitCode = 1;
