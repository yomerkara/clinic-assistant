// Visits every application route as each role in a real browser and records the
// HTTP status, final URL, console/page errors, failed requests and mobile overflow.
import fs from "node:fs";
import { chromium } from "../screenshot/node_modules/playwright/index.mjs";

const origin = "https://localhost";
const out = "artifacts/e2e-audit-20261026";
fs.mkdirSync(out + "/screens", { recursive: true });

const ids = JSON.parse(fs.readFileSync(out + "/ids.json", "utf8"));
const routes = [
  ["home", "/"],
  ["queue", "/queue"],
  ["queue-detail", `/queue/${ids.ar.id}`],
  ["conversations", "/conversations"],
  ["conversation-detail", `/conversations/${ids.conv.id}`],
  ["patients", "/patients"],
  ["patient-detail", `/patients/${ids.pat.id}`],
  ["patient-detail-foreign", `/patients/${ids.otherPat.id}`],
  ["calendar", "/calendar"],
  ["requests", "/requests"],
  ["invoices", "/invoices"],
  ["usage", "/usage"],
  ["usage-conversation", `/usage/conversations/${ids.conv.id}`],
  ["settings", "/settings"],
  ["settings-account", "/settings/account"],
  ["settings-simulator", "/settings/simulator"],
  ["demo", "/demo"],
  ["onboarding", "/onboarding"],
];
const roles = [
  ["ADMIN", "/tmp/santa-audit-user_admin.json"],
  ["INTERN", "/tmp/santa-audit-user_intern.json"],
  ["THERAPIST", "/tmp/santa-audit-user_baris.json"],
];
const results = [];
const browser = await chromium.launch();
for (const [role, storageState] of roles) {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState,
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    for (const [name, path] of routes) {
      const record = {
        role,
        viewport: viewport.name,
        name,
        path,
        console: [],
        pageErrors: [],
        failedRequests: [],
      };
      const onConsole = (msg) => {
        if (msg.type() === "error") record.console.push(msg.text().slice(0, 300));
      };
      const onPageError = (err) => record.pageErrors.push(String(err).slice(0, 300));
      const onFailed = (req) =>
        record.failedRequests.push(`${req.method()} ${req.url().slice(0, 160)}`);
      const onResponse = (res) => {
        if (res.status() >= 400 && res.request().resourceType() !== "image")
          record.failedRequests.push(`${res.status()} ${res.url().slice(0, 160)}`);
      };
      page.on("console", onConsole);
      page.on("pageerror", onPageError);
      page.on("requestfailed", onFailed);
      page.on("response", onResponse);
      try {
        const response = await page.goto(origin + path, { waitUntil: "domcontentloaded" });
        record.status = response?.status() ?? null;
        await page.waitForTimeout(900);
        record.finalPath = new URL(page.url()).pathname;
        record.title = (await page.title()).slice(0, 120);
        const metrics = await page.evaluate(() => {
          const doc = document.documentElement;
          const overflowing = [...document.querySelectorAll("*")]
            .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
            .slice(0, 6)
            .map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 40)}`);
          const unnamedButtons = [...document.querySelectorAll("button")].filter(
            (b) => !b.textContent.trim() && !b.getAttribute("aria-label") && !b.title,
          ).length;
          const imagesWithoutAlt = [...document.querySelectorAll("img")].filter(
            (i) => i.getAttribute("alt") === null,
          ).length;
          const tabs = [...document.querySelectorAll('[role="tab"]')].length;
          const tablists = [...document.querySelectorAll('[role="tablist"]')].length;
          return {
            scrollWidth: doc.scrollWidth,
            clientWidth: doc.clientWidth,
            overflowing,
            unnamedButtons,
            imagesWithoutAlt,
            tabs,
            tablists,
            textLength: document.body.innerText.trim().length,
            heading: document.querySelector("h1,h2")?.textContent?.trim().slice(0, 100) ?? null,
          };
        });
        Object.assign(record, metrics);
        record.horizontalOverflow = metrics.scrollWidth > metrics.clientWidth + 1;
        if (viewport.name === "desktop" || record.horizontalOverflow)
          await page.screenshot({
            path: `${out}/screens/${role}-${viewport.name}-${name}.png`,
            fullPage: true,
          });
      } catch (error) {
        record.error = String(error).slice(0, 300);
      }
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("requestfailed", onFailed);
      page.off("response", onResponse);
      results.push(record);
      console.log(
        `${role} ${viewport.name} ${name} -> ${record.status} ${record.finalPath ?? record.error ?? ""}`,
      );
    }
    await context.close();
  }
}
await browser.close();
fs.writeFileSync(out + "/routes.json", JSON.stringify(results, null, 2));
