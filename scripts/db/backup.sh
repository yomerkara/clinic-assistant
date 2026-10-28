#!/bin/sh
set -eu
umask 077
: "${PGHOST:?Set PGHOST}"
: "${PGDATABASE:?Set PGDATABASE}"
: "${PGUSER:?Set PGUSER}"
: "${PGPASSWORD:?Set PGPASSWORD}"
: "${PGSSLROOTCERT:?Set PGSSLROOTCERT}"
export PGSSLMODE=verify-full PGCONNECT_TIMEOUT=10
[ "$#" -eq 1 ] || { echo 'Usage: backup.sh NEW_BACKUP_DIRECTORY' >&2; exit 1; }
# Each backup gets a new private directory. Only a completed backup has SHA256SUMS.
mkdir "$1"
chmod 700 "$1"
pg_dump --format=custom --no-owner --no-acl --file="$1/database.dump.partial"
mv "$1/database.dump.partial" "$1/database.dump"
(cd "$1" && sha256sum database.dump > SHA256SUMS)
printf 'Backup completed and checksummed.\n'
