#!/usr/bin/env bash
# Exercise Moodle storage and gradebook APIs for both managed activities.
# Cleanup runs after each mode and on failure, so no fabricated attempt or
# grade remains in the demo.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose=(docker compose -f "$here/compose.yml")
active_mode=""

run_as_daemon() {
  "${compose[@]}" exec -T --user daemon \
    -e TRACECHAIN_SCORM_MODE="$active_mode" \
    moodle /opt/bitnami/php/bin/php "$1"
}

cleanup_on_exit() {
  local original_status=$?
  local cleanup_status
  trap - EXIT
  if [ -n "$active_mode" ]; then
    echo "--- cleanup $active_mode ---"
    set +e
    run_as_daemon /tmp/acceptance-cleanup.php
    cleanup_status=$?
    set -e
    if [ "$cleanup_status" -ne 0 ]; then
      echo "cleanup failed for $active_mode; check the gradebook by hand" >&2
      exit "$cleanup_status"
    fi
  fi
  exit "$original_status"
}

"${compose[@]}" up -d

echo "--- waiting for Moodle ---"
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null http://localhost:8080/login/index.php; then break; fi
  sleep 2
done
curl -fsS -o /dev/null http://localhost:8080/login/index.php

if [ -n "${TRACECHAIN_ACCEPTANCE_FORCE_FAILURE:-}" ]; then
  echo "--- forcing acceptance failure (TRACECHAIN_ACCEPTANCE_FORCE_FAILURE set) ---"
  "${compose[@]}" cp "$here/acceptance-force-failure.php" moodle:/tmp/acceptance.php
else
  "${compose[@]}" cp "$here/acceptance.php" moodle:/tmp/acceptance.php
fi
"${compose[@]}" cp "$here/acceptance-cleanup.php" moodle:/tmp/acceptance-cleanup.php
"${compose[@]}" exec -T --user root moodle chmod 644 \
  /tmp/acceptance.php /tmp/acceptance-cleanup.php

trap cleanup_on_exit EXIT
for active_mode in guided challenge; do
  echo "--- acceptance $active_mode ---"
  run_as_daemon /tmp/acceptance.php
  echo "--- cleanup $active_mode ---"
  run_as_daemon /tmp/acceptance-cleanup.php
  active_mode=""
done
trap - EXIT
echo "MOODLE GUIDED + CHALLENGE ACCEPTANCE PASSED"
