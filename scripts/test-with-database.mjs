import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
if (!process.env.POSTGRES_ADMIN_PASSWORD) {
  throw new Error("POSTGRES_ADMIN_PASSWORD is required for the local test database.");
}
// A fresh database, never the application's configured DATABASE_URL.
const database = `santa_test_${randomBytes(8).toString("hex")}`;
const url = new URL(`postgresql://santa@127.0.0.1:55432/${database}?sslmode=require`);
url.password = process.env.POSTGRES_ADMIN_PASSWORD;
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}
run("docker", ["compose", "exec", "-T", "db", "createdb", "-U", "santa", database]);
try {
  // db push omits SQL triggers; production migrations are required for fidelity.
  run("./node_modules/.bin/prisma", ["migrate", "deploy"], {
    ...process.env,
    DATABASE_URL: url.href,
  });
  run("./node_modules/.bin/vitest", ["run", "--no-file-parallelism", ...process.argv.slice(2)], {
    ...process.env,
    TEST_DATABASE_URL: url.href,
  });
} finally {
  run("docker", ["compose", "exec", "-T", "db", "dropdb", "-U", "santa", database]);
}
