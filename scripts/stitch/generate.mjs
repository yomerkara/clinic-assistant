#!/usr/bin/env node
// Generates a screen via Google Stitch using the official SDK's low-level callTool()
// interface directly — not the high-level stitch.project()/generate() convenience wrappers
// (those only exist on the bare `stitch` singleton, not on an explicitly-constructed
// StitchToolClient, which we need for the custom timeout below), and not Claude Code's MCP
// tool (found to time out on real generations — observed ~75s, no client-side lever to
// extend it there).
//
// Confirmed response shape (from a real successful call, not documentation): the
// generate_screen_from_text response has an `outputComponents` array; the item with a
// `.design` key holds `.design.screens[0]`, whose `.htmlCode.downloadUrl` is a plain,
// unauthenticated-fetchable URL to the actual generated HTML (not the HTML itself — it
// must be fetched). `.screenshot.downloadUrl` is the same shape for a preview image.

import { StitchToolClient } from "@google/stitch-sdk";
import { readFile, writeFile } from "node:fs/promises";

const TIMEOUT_MS = 300_000; // 5 minutes — comfortably above the ~75s observed in practice.

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--prompt-file") args.promptFile = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--project-id") args.projectId = argv[++i];
    else if (a === "--title") args.title = argv[++i];
    else if (a === "--device-type") args.deviceType = argv[++i];
  }
  return args;
}

function extractScreen(genResult) {
  const designComponent = genResult?.outputComponents?.find((c) => c.design);
  const screen = designComponent?.design?.screens?.[0];
  if (!screen?.htmlCode?.downloadUrl) {
    throw new Error(
      `Could not find a screen with htmlCode.downloadUrl in the response. ` +
      `Raw response: ${JSON.stringify(genResult)}`
    );
  }
  return screen;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.STITCH_API_KEY) {
    console.error(
      "STITCH_API_KEY is not set. Stitch rendering isn't available — the caller should " +
      "fall back to the handwritten process."
    );
    process.exit(1);
  }

  if (!args.promptFile || !args.out) {
    console.error("Usage: generate.mjs --prompt-file <path> --out <path> [--project-id <id>] [--title <title>] [--device-type MOBILE|DESKTOP|TABLET|AGNOSTIC]");
    process.exit(1);
  }

  let prompt;
  try {
    prompt = await readFile(args.promptFile, "utf8");
  } catch (err) {
    console.error(`Could not read prompt file ${args.promptFile}: ${err.message}`);
    process.exit(1);
  }

  const client = new StitchToolClient({
    apiKey: process.env.STITCH_API_KEY,
    timeout: TIMEOUT_MS,
  });

  try {
    let projectId = args.projectId;
    if (!projectId) {
      const created = await client.callTool("create_project", {
        title: args.title ?? "design-pipeline",
      });
      // Google resource-name convention: name is "projects/{id}", not a bare id field.
      const nameMatch = typeof created?.name === "string" ? created.name.match(/^projects\/(.+)$/) : null;
      projectId = created?.projectId ?? created?.id ?? created?.project_id ?? nameMatch?.[1];
      if (!projectId) {
        throw new Error(`create_project did not return a recognizable project id: ${JSON.stringify(created)}`);
      }
      console.log(`Created new Stitch project: ${projectId}`);
    }

    const deviceType = args.deviceType ?? "DESKTOP";
    const genResult = await client.callTool("generate_screen_from_text", {
      projectId,
      prompt,
      deviceType,
    });

    const screen = extractScreen(genResult);

    const response = await fetch(screen.htmlCode.downloadUrl);
    if (!response.ok) {
      throw new Error(`Fetching generated HTML failed: HTTP ${response.status}`);
    }
    const html = await response.text();

    await writeFile(args.out, html, "utf8");
    console.log(
      `SUCCESS. project=${projectId} screen=${screen.id} -> ${args.out} (${html.length} chars)`
    );
  } catch (err) {
    const code = err?.code ? ` [${err.code}]` : "";
    console.error(`Stitch generation failed${code}: ${err.message ?? err}`);
    process.exit(1);
  }
}

main();
