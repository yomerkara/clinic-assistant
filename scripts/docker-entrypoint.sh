#!/bin/sh
set -e
cd /app
if [ "$#" -gt 0 ]; then
  exec "$@"
fi
exec node server.js
