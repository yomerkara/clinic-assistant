#!/bin/sh
# Local development CA only. Supply managed certificates for a real deployment.
set -eu
umask 077
dest=${1:-.local/db-tls}
mkdir -p "$(dirname "$dest")"
mkdir "$dest" # Refuse to overwrite existing keys.
cat > "$dest/server.cnf" <<'CONFIG'
[req]
prompt = no
distinguished_name = dn
req_extensions = ext
[dn]
CN = db
[ext]
subjectAltName = DNS:db,DNS:localhost,IP:127.0.0.1
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
CONFIG
openssl req -x509 -newkey rsa:3072 -nodes -days 365 -subj '/CN=Santa local database CA' -keyout "$dest/ca.key" -out "$dest/ca.crt" >/dev/null 2>&1
openssl req -new -newkey rsa:3072 -nodes -config "$dest/server.cnf" -keyout "$dest/server.key" -out "$dest/server.csr" >/dev/null 2>&1
openssl x509 -req -in "$dest/server.csr" -CA "$dest/ca.crt" -CAkey "$dest/ca.key" -CAcreateserial -days 90 -extfile "$dest/server.cnf" -extensions ext -out "$dest/server.crt" >/dev/null 2>&1
chmod 644 "$dest/ca.crt" "$dest/server.crt"
rm "$dest/server.csr" "$dest/server.cnf" "$dest/ca.srl"
printf 'Local certificates created in %s (server validity: 90 days). Keep ca.key offline.\n' "$dest"
