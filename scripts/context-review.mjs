import { readFileSync, writeFileSync } from "node:fs";
const mode = process.argv[2];
if (!["off", "shadow"].includes(mode)) {
  console.error("Usage: node scripts/context-review.mjs off|shadow");
  process.exit(1);
}
const lines = readFileSync(".env", "utf8").split(/\r?\n/).filter(line => !line.startsWith("CONTEXT_REVIEW="));
while (lines.at(-1) === "") lines.pop();
writeFileSync(".env", [...lines, `CONTEXT_REVIEW=${mode}`, ""].join("\n"));
console.log(`Context review: ${mode}. Restart app to apply.`);
