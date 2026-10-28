#!/bin/sh
set -eu
umask 077
dest=${1:-.local/https-authority}
mkdir -p "$(dirname "$dest")"
mkdir "$dest"
cat > "$dest/root.cnf" <<'CONFIG'
[req]
prompt = no
distinguished_name = dn
x509_extensions = ca
[dn]
CN = Santa Development Localhost CA
[ca]
basicConstraints = critical,CA:TRUE,pathlen:1
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
nameConstraints = critical,permitted;DNS:localhost,permitted;IP:127.0.0.1/255.255.255.255,permitted;IP:0:0:0:0:0:0:0:1/ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
CONFIG
openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 3650 -config "$dest/root.cnf" -keyout "$dest/root.key" -out "$dest/root.crt" >/dev/null 2>&1
chmod 644 "$dest/root.crt"
rm "$dest/root.cnf"
printf 'Local HTTPS authority created; certificate names constrained to localhost and loopback.\n'
