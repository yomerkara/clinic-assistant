#!/usr/bin/env node
// Renders one or more local HTML files with a real headless browser and screenshots them,
// so ux-reviewer can actually SEE the page (margins, overlap, alignment) instead of only
// reasoning about markup/CSS classes from source. Requires `npx playwright install
// chromium` to have been run once (setup.sh does this).

import { chromium } from "playwright";
import path from "node:path";
import { mkdir } from "node:fs/promises";

function parseArgs(argv) {
  const args = { files: [], width: 1440, height: 1024 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out-dir") args.outDir = argv[++i];
    else if (a === "--width") args.width = Number(argv[++i]);
    else if (a === "--height") args.height = Number(argv[++i]);
    else args.files.push(a);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.files.length || !args.outDir) {
    console.error("Usage: capture.mjs <file1.html> [file2.html ...] --out-dir <dir> [--width N] [--height N]");
    process.exit(1);
  }

  await mkdir(args.outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: args.width, height: args.height } });

  let failed = 0;
  for (const file of args.files) {
    const absPath = path.resolve(file);
    const outPath = path.join(args.outDir, path.basename(file).replace(/\.html?$/, ".png"));
    try {
      await page.goto("file://" + absPath, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: outPath, fullPage: true });
      console.log(`OK: ${file} -> ${outPath}`);
    } catch (err) {
      failed++;
      console.error(`FAILED: ${file}: ${err.message}`);
    }
  }

  await browser.close();
  if (failed > 0) process.exit(1);
}

main();
