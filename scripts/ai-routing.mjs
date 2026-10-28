import { readFileSync, writeFileSync } from "node:fs";
const mode = process.argv[2];
const understandingModel = process.argv[3] || "claude-sonnet-4-5";
if (!["claude-sonnet-4-5", "claude-haiku-5-5"].includes(understandingModel)) {
  throw new Error("Supported understanding models: claude-sonnet-4-5, claude-haiku-5-5");
}
if (!["active", "shadow", "direct"].includes(mode)) {
  console.error(
    "Usage: node scripts/ai-routing.mjs active|shadow|direct [claude-sonnet-4-5|claude-haiku-5-5]",
  );
  process.exit(1);
}
const values =
  mode !== "direct"
    ? {
        AI_GATEWAY: "litellm",
        AI_GATEWAY_URL: "http://127.0.0.1:4001/v1",
        AI_UNDERSTAND_MODE: mode,
        AI_UNDERSTAND_MODEL: understandingModel,
        AI_ANSWER_MODEL: "qwen-3.6-35b-sovereign",
        AI_REVIEW_MODEL: "qwen-3.6-35b-sovereign",
      }
    : {
        AI_GATEWAY: "direct",
        AI_UNDERSTAND_MODE: "off",
        AI_UNDERSTAND_MODEL: "",
        AI_ANSWER_MODEL: "",
        AI_REVIEW_MODEL: "",
      };
const lines = readFileSync(".env", "utf8")
  .split(/\r?\n/)
  .filter((line) => !Object.keys(values).some((key) => line.startsWith(`${key}=`)));
while (lines.at(-1) === "") lines.pop();
writeFileSync(
  ".env",
  [...lines, ...Object.entries(values).map(([key, value]) => `${key}=${value}`), ""].join(
    "\n",
  ),
);
console.log(
  `AI routing: ${mode}, understanding: ${mode === "direct" ? "off" : understandingModel}. Restart app to apply. Gateway service must be running for active/shadow.`,
);
