#!/bin/sh
set -eu
# Values are read by psql from the environment, not passed as CLI arguments.
: "${POSTGRES_ADMIN_PASSWORD:?POSTGRES_ADMIN_PASSWORD is required}"
: "${APP_DATABASE_PASSWORD:?APP_DATABASE_PASSWORD is required}"
: "${MIGRATION_DATABASE_PASSWORD:?MIGRATION_DATABASE_PASSWORD is required}"
for secret in "$APP_DATABASE_PASSWORD" "$MIGRATION_DATABASE_PASSWORD"; do
  case "$secret" in *[!a-fA-F0-9]*) echo "Database passwords must be 64 hex characters" >&2; exit 1;; esac
  [ "${#secret}" -eq 64 ] || { echo "Database passwords must be 64 hex characters" >&2; exit 1; }
done
if [ "$APP_DATABASE_PASSWORD" = "$MIGRATION_DATABASE_PASSWORD" ] || [ "$APP_DATABASE_PASSWORD" = "$POSTGRES_ADMIN_PASSWORD" ] || [ "$MIGRATION_DATABASE_PASSWORD" = "$POSTGRES_ADMIN_PASSWORD" ]; then
  echo "Database accounts require different passwords" >&2
  exit 1
fi
export PGPASSWORD="$POSTGRES_ADMIN_PASSWORD"
exec psql -X -q --set=ON_ERROR_STOP=1 --file="$(dirname "$0")/provision.sql"
