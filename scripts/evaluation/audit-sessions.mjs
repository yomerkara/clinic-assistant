// Mints a database session for one user per role and writes Playwright storage states.
// Local development only: it reads the running app container's Prisma client.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { chromium } from "../screenshot/node_modules/playwright/index.mjs";

const code = `const {PrismaClient}=require('@prisma/client');const {randomBytes,scryptSync}=require('crypto');const p=new PrismaClient();
(async()=>{const out={};
for (const id of ['user_admin','user_intern','user_baris']) {
  const u=await p.user.findUniqueOrThrow({where:{id}});
  const token=randomBytes(32).toString('hex');
  const hash=scryptSync(token,'session',32).toString('hex');
  await p.session.create({data:{userId:u.id,tokenHash:hash,expiresAt:new Date(Date.now()+86400000)}});
  out[id]={token,hash,role:u.role};
}
console.log(JSON.stringify(out));})().finally(()=>p.$disconnect());`;

const sessions = JSON.parse(
  execFileSync("docker", ["compose", "exec", "-T", "app", "node", "-e", code], {
    encoding: "utf8",
  }).trim().split("\n").pop(),
);
const browser = await chromium.launch();
for (const [id, { token, hash, role }] of Object.entries(sessions)) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.addCookies([
    { name: "santa_session", value: token, url: "https://localhost", httpOnly: true, secure: true, sameSite: "Lax" },
    { name: "santa_setup_deferred", value: hash, url: "https://localhost", httpOnly: true, secure: true, sameSite: "Lax" },
  ]);
  const path = `/tmp/santa-audit-${id}.json`;
  await context.storageState({ path });
  fs.chmodSync(path, 0o600);
  await context.close();
  console.log(`${role} ${id} -> ${path}`);
}
await browser.close();
