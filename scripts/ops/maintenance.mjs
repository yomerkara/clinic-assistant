import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(root);
const dir = path.join(root, ".local/backups");
const lock = path.join(dir, "maintenance.lock");
const verifier = `santa-restore-check-${Date.now()}`;
const image = "whatsappassistant-encrypted-backup";
const status = {
  startedAt: new Date().toISOString(),
  success: false,
  offsite: "deferred",
};
let log = "";
function docker(args, extra = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 300000,
    ...extra,
  });
  log += (result.stdout ?? "") + (result.stderr ?? "");
  if (result.status !== 0)
    throw new Error(`Docker ${args[0]} failed; see private .local/backups/last-run.log`);
  return result.stdout.trim();
}
function restic(args) {
  return docker([
    "run",
    "--rm",
    "-v",
    `${dir}/repository:/repository`,
    "-v",
    `${dir}/password:/password:ro`,
    "-e",
    "RESTIC_REPOSITORY=/repository",
    "-e",
    "RESTIC_PASSWORD_FILE=/password",
    "restic/restic:0.18.1",
    "--no-cache",
    ...args,
  ]);
}
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
// A stale lock requires inspection, never silently overlaps a running backup.
fs.mkdirSync(lock, { mode: 0o700 });
try {
  // Compare with the database being backed up, not unapplied files in a checkout.
  const expected = Number(
    docker([
      "compose",
      "exec",
      "-T",
      "db",
      "psql",
      "-X",
      "-At",
      "-U",
      "santa",
      "-d",
      "santa",
      "-c",
      'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    ]),
  );
  if (!Number.isSafeInteger(expected) || expected < 1)
    throw new Error("Source migration history unavailable");
  status.sourceMigrations = expected;
  docker(["compose", "run", "--rm", "--no-deps", "encrypted-backup"]);
  const snapshots = JSON.parse(
    restic(["snapshots", "--json", "--tag", "database", "--host", "santa-local"]),
  );
  const latest = snapshots.sort((a, b) => a.time.localeCompare(b.time)).at(-1);
  if (!latest) throw new Error("No database snapshot found");
  status.snapshot = latest.id;
  // Restore actual encrypted bytes in a network-isolated, disposable DB.
  docker(
    [
      "run",
      "--rm",
      "-d",
      "--name",
      verifier,
      "--network",
      "none",
      "--tmpfs",
      "/var/lib/postgresql/data",
      "--tmpfs",
      "/restore:mode=0700",
      "-v",
      `${dir}/repository:/repository:ro`,
      "-v",
      `${dir}/password:/password:ro`,
      "-e",
      "RESTIC_REPOSITORY=/repository",
      "-e",
      "RESTIC_PASSWORD_FILE=/password",
      "-e",
      "POSTGRES_USER=santa",
      "-e",
      "POSTGRES_DB=santa",
      "-e",
      "POSTGRES_PASSWORD",
      "--entrypoint",
      "/usr/local/bin/docker-entrypoint.sh",
      image,
      "postgres",
    ],
    {
      env: { ...process.env, POSTGRES_PASSWORD: randomBytes(32).toString("hex") },
    },
  );
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const r = spawnSync(
      "docker",
      ["exec", verifier, "pg_isready", "-h", "127.0.0.1", "-U", "santa", "-d", "santa"],
      { stdio: "ignore" },
    );
    if (r.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("Restore verifier failed readiness");
  docker([
    "exec",
    verifier,
    "restic",
    "--no-cache",
    "--no-lock",
    "restore",
    latest.id,
    "--target",
    "/restore",
    "--include",
    "/snapshot/database.dump",
    "--include",
    "/snapshot/SHA256SUMS",
  ]);
  docker(["exec", "-w", "/restore/snapshot", verifier, "sha256sum", "-c", "SHA256SUMS"]);
  docker([
    "exec",
    verifier,
    "pg_restore",
    "-U",
    "santa",
    "-d",
    "santa",
    "--no-owner",
    "--no-acl",
    "--exit-on-error",
    "--single-transaction",
    "/restore/snapshot/database.dump",
  ]);
  const migrations = Number(
    docker([
      "exec",
      verifier,
      "psql",
      "-X",
      "-At",
      "-U",
      "santa",
      "-d",
      "santa",
      "-c",
      'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    ]),
  );

  if (migrations !== expected)
    throw new Error("Restored migration history differs from source version");
  status.restoredMigrations = migrations;
  status.restoreVerified = true;
  // Keep all existing snapshots. Deletion/retention requires a separate decision.
  const cert = spawnSync(
    "openssl",
    [
      "x509",
      "-checkend",
      String(14 * 86400),
      "-noout",
      "-in",
      ".local/db-tls/server.crt",
    ],
    { stdio: "ignore" },
  );
  status.databaseCertificateNeedsRenewal = cert.status !== 0;
  status.success = true;
} catch (error) {
  status.error = error instanceof Error ? error.message : "Maintenance failed";
  process.exitCode = 1;
} finally {
  spawnSync("docker", ["rm", "-f", verifier], { stdio: "ignore" });
  status.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(dir, "last-run.log"), log, { mode: 0o600 });
  fs.writeFileSync(
    path.join(dir, "status.json"),
    JSON.stringify(status, null, 2) + "\n",
    { mode: 0o600 },
  );
  fs.rmdirSync(lock);
}
console.log(JSON.stringify(status));
