import { readFileSync, writeFileSync } from "node:fs";
const mode = process.argv[2];
if (!["legacy", "simple"].includes(mode))
  throw new Error("Usage: node scripts/conversation-flow.mjs legacy|simple");
const file = new URL("../.env", import.meta.url);
const original = readFileSync(file, "utf8");
const updated = /^CONVERSATION_FLOW=.*$/m.test(original)
  ? original.replace(/^CONVERSATION_FLOW=.*$/m, `CONVERSATION_FLOW=${mode}`)
  : `${original.trimEnd()}\nCONVERSATION_FLOW=${mode}\n`;
writeFileSync(file, updated, { mode: 0o600 });
console.log(
  `CONVERSATION_FLOW=${mode}. Restart the app to apply; database records are unchanged.`,
);
