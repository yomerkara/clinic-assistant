#!/bin/sh
# Restore into a NEW database only. Never replaces or drops an existing database.
set -eu
: "${PGHOST:?Set PGHOST}"
: "${PGDATABASE:?Set PGDATABASE to an existing source database}"
: "${PGSSLROOTCERT:?Set PGSSLROOTCERT}"
: "${POSTGRES_ADMIN_PASSWORD:?Set POSTGRES_ADMIN_PASSWORD}"
: "${MIGRATION_DATABASE_PASSWORD:?Set MIGRATION_DATABASE_PASSWORD}"
: "${APP_DATABASE_PASSWORD:?Set APP_DATABASE_PASSWORD}"
[ "$#" -eq 2 ] || { echo 'Usage: restore-test.sh BACKUP_DIRECTORY restore_NAME' >&2; exit 1; }
case "$2" in restore_*) ;; *) echo 'Target must start with restore_' >&2; exit 1;; esac
case "$2" in *[!a-z0-9_]*) echo 'Target must contain only lowercase letters, digits and underscores' >&2; exit 1;; esac
[ "${#2}" -le 63 ] || { echo 'Target name is too long' >&2; exit 1; }
export PGSSLMODE=verify-full PGCONNECT_TIMEOUT=10
# Verify the fixed dump filename, never accept arbitrary paths from a manifest.
expected=$(awk '$2 == "database.dump" && length($1) == 64 { print $1 }' "$1/SHA256SUMS")
actual=$(sha256sum "$1/database.dump" | cut -d ' ' -f 1)
[ "$expected" = "$actual" ] || { echo 'Backup checksum mismatch' >&2; exit 1; }
# Roles are shared across databases. Require the existing credentials to match
# before provisioning the new database; never rotate another database's passwords.
PGUSER=santa_app PGPASSWORD="$APP_DATABASE_PASSWORD" psql -X -q -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null
PGUSER=santa_migrate PGPASSWORD="$MIGRATION_DATABASE_PASSWORD" psql -X -q -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null
export PGUSER=${PGADMIN_USER:-santa} PGPASSWORD="$POSTGRES_ADMIN_PASSWORD"
createdb --maintenance-db=postgres --template=template0 "$2"
export PGDATABASE="$2"
sh "$(dirname "$0")/provision.sh"
export PGUSER=santa_migrate PGPASSWORD="$MIGRATION_DATABASE_PASSWORD"
pg_restore --dbname="$PGDATABASE" --no-owner --no-acl --exit-on-error --single-transaction "$1/database.dump"
psql -X -q -v ON_ERROR_STOP=1 -f "$(dirname "$0")/../../prisma/runtime-grants.sql"
printf 'Restore completed in %s. Validate data before any cutover; target is retained for inspection.\n' "$PGDATABASE"
