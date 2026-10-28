# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Runs once before the app; the web image never contains the Prisma CLI.
FROM deps AS migrator
ENV NODE_ENV=production
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
COPY prisma/runtime-grants.sql ./prisma/runtime-grants.sql
COPY scripts/db/migrate.sh ./scripts/db/migrate.sh
USER node
ENTRYPOINT ["sh", "./scripts/db/migrate.sh"]

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Build-only values are ephemeral; runtime secrets must be supplied on startup.
RUN node -e 'const {spawnSync}=require("node:child_process"); const {randomBytes}=require("node:crypto"); const r=spawnSync("npm",["run","build"],{stdio:"inherit",env:{...process.env,APP_URL:"http://localhost:3000",SESSION_SECRET:randomBytes(32).toString("hex"),REMINDER_JOB_SECRET:randomBytes(32).toString("hex")}}); process.exit(r.status??1)'

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --chown=nextjs:nodejs scripts/docker-entrypoint.sh scripts/reminder-worker.mjs scripts/inbound-worker.mjs ./scripts/
RUN chmod +x ./scripts/docker-entrypoint.sh \
  && node -e 'const fs=require("node:fs"); for(const name of ["vitest","@vitest/mocker","eslint","eslint-config-next","prisma","@prisma/config","braces","typescript"]){if(fs.existsSync("node_modules/"+name)) throw new Error("Development package leaked into runner: "+name)}' 

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e 'fetch("http://127.0.0.1:3000/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
