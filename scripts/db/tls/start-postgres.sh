#!/bin/sh
set -eu
# Docker bind mount permissions differ between hosts; copy the server key privately.
install -d -m 700 -o postgres -g postgres /var/lib/postgresql/tls
install -m 600 -o postgres -g postgres /certs/server.key /var/lib/postgresql/tls/server.key
install -m 644 -o postgres -g postgres /certs/server.crt /var/lib/postgresql/tls/server.crt
exec /usr/local/bin/docker-entrypoint.sh postgres \
  -c ssl=on -c ssl_min_protocol_version=TLSv1.2 \
  -c ssl_cert_file=/var/lib/postgresql/tls/server.crt \
  -c ssl_key_file=/var/lib/postgresql/tls/server.key \
  -c hba_file=/tls-config/pg_hba.conf
