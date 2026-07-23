#!/usr/bin/env bash
# Build the SCORM package and put it into the local Docker Moodle, replacing
# whatever is there. One command for the edit-build-look loop; see deploy.php
# for why the revision bump matters.
#
#   ./docker-moodle/deploy.sh              build, package, verify, deploy
#   ./docker-moodle/deploy.sh --no-build   deploy the package already on disk
#
# Set TRACECHAIN_SCORM_CMID if the demo ever holds more than one SCORM activity.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
compose=(docker compose -f "$here/compose.yml")

build=1
for arg in "$@"; do
  case "$arg" in
    --no-build) build=0 ;;
    *) echo "usage: $0 [--no-build]" >&2; exit 2 ;;
  esac
done

if [ "$build" -eq 1 ]; then
  echo "--- build ---"
  npm --prefix "$root" run build
  npm --prefix "$root" run build:scorm
  npm --prefix "$root" run verify:scorm
fi

# Named from package.json exactly as build-scorm.mjs names it, rather than
# globbed: a stale zip from an older version sitting in the root must not make
# the deploy either ambiguous or wrong.
version="$(node -p "require('$root/package.json').version")"
package="$root/tracechain-scorm-v${version}_NON_RELEASE.zip"
if [ ! -f "$package" ]; then
  echo "no package at $package -- run without --no-build" >&2
  exit 1
fi

"${compose[@]}" up -d

echo "--- waiting for Moodle ---"
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null http://localhost:8080/login/index.php; then break; fi
  sleep 2
done
curl -fsS -o /dev/null http://localhost:8080/login/index.php

# Clear any package left by an earlier run, so the glob in deploy.php stays
# unambiguous when the version number changes.
"${compose[@]}" exec -T --user root moodle sh -c 'rm -f /tmp/tracechain-scorm-*.zip /tmp/deploy.php'
"${compose[@]}" cp "$package" "moodle:/tmp/$(basename "$package")"
"${compose[@]}" cp "$here/deploy.php" moodle:/tmp/deploy.php
"${compose[@]}" exec -T --user root moodle chmod 644 "/tmp/$(basename "$package")" /tmp/deploy.php

echo "--- deploy ---"
# Always --user daemon: root leaves root-owned files in moodledata that Apache
# cannot write, and Moodle then fails with "Invalid permissions detected".
"${compose[@]}" exec -T --user daemon \
  -e TRACECHAIN_SCORM_CMID="${TRACECHAIN_SCORM_CMID:-}" \
  moodle /opt/bitnami/php/bin/php /tmp/deploy.php

"${compose[@]}" exec -T --user root moodle sh -c 'rm -f /tmp/tracechain-scorm-*.zip /tmp/deploy.php'
echo "--- done: http://localhost:8080 ---"
