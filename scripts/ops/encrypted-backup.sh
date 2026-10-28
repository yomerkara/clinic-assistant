#!/bin/sh
set -eu
umask 077
: "${PGHOST:?Set PGHOST}"
: "${PGDATABASE:?Set PGDATABASE}"
: "${PGUSER:?Set PGUSER}"
: "${PGPASSWORD:?Set PGPASSWORD}"
: "${PGSSLROOTCERT:?Set PGSSLROOTCERT}"
: "${RESTIC_REPOSITORY:?Set RESTIC_REPOSITORY}"
: "${RESTIC_PASSWORD_FILE:?Set RESTIC_PASSWORD_FILE}"
export PGSSLMODE=verify-full PGCONNECT_TIMEOUT=10
# /snapshot is tmpfs: no plaintext database dump is left on the host disk.
pg_dump --format=custom --no-owner --no-acl --file=/snapshot/database.dump
(cd /snapshot && sha256sum database.dump > SHA256SUMS)
# Read recovery files through ordinary I/O before Restic (macOS Docker mounts
# can reject Restic's direct source reads). The copy stays in private tmpfs.
mkdir /snapshot/recovery
cp -R /recovery/. /snapshot/recovery/
restic --no-cache backup --host santa-local --tag database --tag scheduled /snapshot
restic --no-cache check --read-data
printf 'Encrypted database and recovery configuration backup verified.\n'
