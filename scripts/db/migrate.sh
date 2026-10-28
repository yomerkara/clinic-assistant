#!/bin/sh
set -eu
# Reject a misconfigured administrator URL before making any schema changes.
node -e 'const u=new URL(process.env.DATABASE_URL || ""); if(decodeURIComponent(u.username)!=="santa_migrate") throw new Error("DATABASE_URL must use santa_migrate")'
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/prisma db execute --schema prisma/schema.prisma --file prisma/runtime-grants.sql
