#!/usr/bin/env node
// Converts an HTML mockup to Figma layer data via the code.to.design API.
// Does NOT write into an existing Figma file — no such API exists. The result must be
// imported into Figma manually via the html.to.design plugin (clipboard/plugin mode).

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const API_URL = "https://api.to.design/html";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--width") args.width = Number(argv[++i]);
    else if (a === "--height") args.height = Number(argv[++i]);
    else if (a === "--theme") args.theme = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else args._.push(a);
  }
  return args;
}

async function loadFigmaConfig(projectRoot) {
  try {
    const raw = await readFile(path.join(projectRoot, "design-agent.config.json"), "utf8");
    return JSON.parse(raw).figma ?? {};
  } catch {
    return {};
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const htmlPath = args._[0];

  if (!htmlPath) {
    console.error("Usage: push-to-figma.mjs <html-file> [--width N] [--height N] [--theme light|dark] [--out path]");
    process.exit(1);
  }

  const apiKey = process.env.CODE_TO_DESIGN_API_KEY;
  if (!apiKey) {
    console.error(
      "CODE_TO_DESIGN_API_KEY is not set. Figma output isn't configured yet — " +
      "add it to .env (see .env.design-agent.example), or use output_mode \"html\" instead."
    );
    process.exit(1);
  }

  let html;
  try {
    html = await readFile(htmlPath, "utf8");
  } catch (err) {
    console.error(`Could not read ${htmlPath}: ${err.message}`);
    process.exit(1);
  }

  const config = await loadFigmaConfig(process.cwd());
  const body = {
    html,
    width: args.width ?? config.width ?? 1280,
    height: args.height ?? config.height ?? 720,
    theme: args.theme ?? config.theme ?? "light",
  };

  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`Request to code.to.design failed: ${err.message}`);
    process.exit(1);
  }

  if (response.status === 429) {
    console.error("code.to.design rate limit hit (HTTP 429). Try again later.");
    process.exit(1);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(`code.to.design returned HTTP ${response.status}: ${text}`);
    process.exit(1);
  }

  const result = await response.text();
  const outPath = args.out ?? `${htmlPath.replace(/\.html?$/, "")}.figma.json`;
  await writeFile(outPath, result, "utf8");

  console.log(`Conversion succeeded. Result saved to ${outPath}.`);
  console.log("Open the html.to.design plugin in Figma to import this result — it was not written into any Figma file directly.");
}

main();
