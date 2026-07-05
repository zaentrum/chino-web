#!/bin/sh
# Runtime BASE_PATH wiring for the chino-web SPA.
#
# The image is built ONCE with a `/__BASE__/` placeholder base (see
# vite.config.ts). At container start — before nginx boots — the
# nginx-unprivileged image runs every /docker-entrypoint.d/*.sh as UID
# 101. This script:
#   1. Copies the staged build (/app) into the html root under the
#      requested BASE_PATH sub-path.
#   2. Rewrites `/__BASE__/` -> the real BASE_PATH in the copied files.
#   3. Generates the nginx server block for that base.
#
# BASE_PATH="/"       -> mounted at site root (neutral self-host)
# BASE_PATH="/chino/" -> mounted at /chino/ (the demo path-route)
set -eu

# Normalize BASE_PATH: leading slash + exactly one trailing slash.
BASE_PATH="${BASE_PATH:-/}"
case "$BASE_PATH" in
  /*) : ;;             # already has a leading slash
  *) BASE_PATH="/$BASE_PATH" ;;
esac
# Collapse to a single trailing slash (strip all trailing slashes, add one).
BASE_PATH="$(printf '%s' "$BASE_PATH" | sed 's#/*$##')/"

# SUB is the base with both slashes stripped: "chino" or "" for root.
SUB="${BASE_PATH#/}"
SUB="${SUB%/}"

HTML=/usr/share/nginx/html

# Lay the build down under the base sub-path.
rm -rf "$HTML"/*
mkdir -p "$HTML/$SUB"
cp -a /app/. "$HTML/$SUB/"

# Rewrite the placeholder base to the real one in every emitted asset.
find "$HTML/$SUB" -type f \
  \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.webmanifest' -o -name '*.map' \) \
  -exec sed -i "s#/__BASE__/#${BASE_PATH}#g" {} +

# Generate the nginx server block. `\$uri` is escaped so the shell does
# NOT expand it — nginx must see the literal `$uri` variable.
cat > /etc/nginx/conf.d/default.conf <<EOF
server {
  listen 8080 default_server;
  server_name _;

  root ${HTML};
  index index.html;

  # Liveness for the OpenShift readiness probe. KEEP at site root — the
  # probe hits /healthz regardless of BASE_PATH.
  location = /healthz {
    access_log off;
    add_header Content-Type text/plain;
    return 200 "ok\n";
  }

  # Cache the hashed Vite assets aggressively.
  location ${BASE_PATH}assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files \$uri =404;
  }

  # SPA fallback: any unknown path serves the app's index.html under the
  # base so client-side routing works.
  location / {
    try_files \$uri \$uri/ ${BASE_PATH}index.html;
  }

  gzip on;
  gzip_types text/plain text/css application/javascript application/json image/svg+xml;
  gzip_min_length 1024;
}
EOF

echo "chino-web: BASE_PATH=${BASE_PATH}"
