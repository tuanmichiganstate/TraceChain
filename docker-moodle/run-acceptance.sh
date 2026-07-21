#!/usr/bin/env bash
# Moodle acceptance pass: exercises Moodle's own storage and gradebook APIs with
# real encoded payloads. Cleanup runs even on failure, so a failed run never
# leaves a fabricated grade behind in the demo instance.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose=(docker compose -f "$here/compose.yml")

run_as_daemon() {
  "${compose[@]}" exec -T --user daemon moodle /opt/bitnami/php/bin/php "$1"
}

cleanup() {
  echo "--- cleanup ---"
  run_as_daemon /tmp/acceptance-cleanup.php || echo "cleanup failed; check the gradebook by hand"
}

"${compose[@]}" up -d

echo "--- waiting for Moodle ---"
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null http://localhost:8080/login/index.php; then break; fi
  sleep 2
done

"${compose[@]}" cp "$here/acceptance.php" moodle:/tmp/acceptance.php
"${compose[@]}" cp "$here/acceptance-cleanup.php" moodle:/tmp/acceptance-cleanup.php
"${compose[@]}" exec -T --user root moodle chmod 644 /tmp/acceptance.php /tmp/acceptance-cleanup.php

trap cleanup EXIT
echo "--- acceptance ---"
run_as_daemon /tmp/acceptance.php
