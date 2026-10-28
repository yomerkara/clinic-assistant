// Captures each screen as the roles that can reach it, at desktop and phone
// widths, and measures the layout facts a design review needs: section rhythm,
// tap-target sizes, text contrast against the real painted background, and
// whether the page has any content at all.
import fs from "node:fs";
import { chromium } from "../screenshot/node_modules/playwright/index.mjs";

const origin = process.env.UI_ORIGIN || "http://localhost:3100";
const statePrefix = process.env.UI_STATE_PREFIX || "/tmp/santa-local-";
const out = process.env.UI_PAGES_OUT || "artifacts/ui-pages-20261028";
fs.mkdirSync(out + "/screens", { recursive: true });
const ids = JSON.parse(fs.readFileSync("artifacts/e2e-audit-20261026/ids.json", "utf8"));

const pages = [
  ["queue", "/queue", ["ADMIN", "INTERN", "THERAPIST"]],
  ["queue-detail", `/queue/${ids.ar.id}`, ["ADMIN"]],
  ["conversations", "/conversations", ["ADMIN", "INTERN"]],
  ["conversation-detail", `/conversations/${ids.conv.id}`, ["ADMIN"]],
  ["patients", "/patients", ["ADMIN", "INTERN"]],
  ["patient-detail", `/patients/${ids.pat.id}`, ["ADMIN"]],
  ["calendar", "/calendar", ["ADMIN", "THERAPIST"]],
  ["requests", "/requests", ["ADMIN", "INTERN"]],
  ["invoices", "/invoices", ["ADMIN", "INTERN"]],
  ["usage", "/usage", ["ADMIN", "THERAPIST"]],
  ["settings", "/settings", ["ADMIN", "THERAPIST"]],
  ["settings-account", "/settings/account", ["ADMIN"]],
  ["settings-simulator", "/settings/simulator", ["ADMIN"]],
  ["demo", "/demo", ["ADMIN"]],
  ["login", "/login", ["ANON"]],
];
const roleState = {
  ADMIN: statePrefix + "user_admin.json",
  INTERN: statePrefix + "user_intern.json",
  THERAPIST: statePrefix + "user_baris.json",
};

function luminance([r, g, b]) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const results = [];
const browser = await chromium.launch();
for (const [name, path, roles] of pages) {
  for (const role of roles) {
    for (const viewport of [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "phone", width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: viewport.width, height: viewport.height },
        ...(role === "ANON" ? {} : { storageState: roleState[role] }),
      });
      const page = await context.newPage();
      page.setDefaultTimeout(25000);
      const record = { name, path, role, viewport: viewport.name };
      try {
        const response = await page.goto(origin + path, { waitUntil: "domcontentloaded" });
        record.status = response?.status() ?? null;
        await page.waitForTimeout(1200);
        record.finalPath = new URL(page.url()).pathname;
        Object.assign(
          record,
          await page.evaluate(() => {
            const parse = (value) =>
              (value.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
            const painted = (el) => {
              let node = el;
              while (node) {
                const bg = getComputedStyle(node).backgroundColor;
                const rgba = parse(bg);
                const alpha = bg.startsWith("rgba") ? Number(bg.split(",")[3]) : 1;
                if (rgba.length >= 3 && alpha > 0.5) return rgba;
                node = node.parentElement;
              }
              return [255, 255, 255];
            };
            const visible = (el) => {
              const rect = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.visibility !== "hidden" &&
                style.display !== "none" &&
                Number(style.opacity) > 0.1
              );
            };
            const small = [...document.querySelectorAll("button, a[href], summary, input, select")]
              .filter(visible)
              .filter((el) => {
                const rect = el.getBoundingClientRect();
                return rect.height < 44 && rect.width < 320 && el.textContent.trim().length < 40;
              })
              .map((el) => {
                const rect = el.getBoundingClientRect();
                return `${el.tagName.toLowerCase()}:${(el.textContent.trim() || el.getAttribute("aria-label") || "").slice(0, 24)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
              });
            const texts = [...document.querySelectorAll("p, span, small, li, td, dd, dt, b, em, label, h1, h2, h3, h4, button, a")]
              .filter(visible)
              .filter((el) => el.textContent.trim().length > 2 && el.children.length === 0)
              .slice(0, 400)
              .map((el) => {
                const style = getComputedStyle(el);
                return {
                  text: el.textContent.trim().slice(0, 40),
                  size: Math.round(parseFloat(style.fontSize)),
                  weight: style.fontWeight,
                  color: (style.color.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number),
                  bg: painted(el),
                };
              });
            const headings = [...document.querySelectorAll("h1, h2, h3")]
              .filter(visible)
              .map((h) => `${h.tagName}:${h.textContent.trim().slice(0, 40)}`);
            return {
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth,
              smallTargets: [...new Set(small)].slice(0, 12),
              texts,
              headings,
              textLength: document.body.innerText.trim().length,
              emptyState: /Henüz|bulunmuyor|yok\b|boş/i.test(document.body.innerText),
            };
          }),
        );
        record.horizontalOverflow = record.scrollWidth > record.clientWidth + 1;
        record.lowContrast = [
          ...new Set(
            record.texts
              .map((t) => {
                const l1 = luminance(t.color);
                const l2 = luminance(t.bg);
                const ratio =
                  (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
                const large = t.size >= 24 || (t.size >= 19 && Number(t.weight) >= 600);
                return ratio < (large ? 3 : 4.5)
                  ? `${t.text} (${ratio.toFixed(2)}:1, ${t.size}px)`
                  : null;
              })
              .filter(Boolean),
          ),
        ].slice(0, 12);
        record.tinyText = [
          ...new Set(record.texts.filter((t) => t.size < 12).map((t) => `${t.text} (${t.size}px)`)),
        ].slice(0, 8);
        delete record.texts;
        await page.screenshot({
          path: `${out}/screens/${name}-${role}-${viewport.name}.png`,
          fullPage: true,
        });
      } catch (error) {
        record.error = String(error).slice(0, 200);
      }
      results.push(record);
      console.log(
        `${name} ${role} ${viewport.name} -> ${record.status} overflow=${record.horizontalOverflow} lowContrast=${record.lowContrast?.length ?? "-"} tiny=${record.tinyText?.length ?? "-"} small=${record.smallTargets?.length ?? "-"}`,
      );
      await context.close();
    }
  }
}
await browser.close();
fs.writeFileSync(out + "/pages.json", JSON.stringify(results, null, 2));
