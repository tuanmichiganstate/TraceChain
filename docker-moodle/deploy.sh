#!/usr/bin/env bash
# Build both SCORM packages and deploy them into separate, reset Moodle
# activities. See deploy.php for the revision, verification, and reset logic.
#
#   ./docker-moodle/deploy.sh              build, package, verify, deploy both
#   ./docker-moodle/deploy.sh --no-build   deploy the current packages on disk
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

find_current_package() {
  local mode=$1
  local filename_pattern=$2
  local expected="$root/dist-scorm/$mode/build-info.json"
  local matches=()

  if [ ! -f "$expected" ]; then
    echo "missing $expected -- run without --no-build" >&2
    return 1
  fi

  for candidate in "$root"/$filename_pattern; do
    [ -f "$candidate" ] || continue
    if unzip -p "$candidate" build-info.json | cmp -s - "$expected"; then
      matches+=("$candidate")
    fi
  done

  if [ "${#matches[@]}" -ne 1 ]; then
    echo "expected one current $mode package, found ${#matches[@]} -- run without --no-build" >&2
    return 1
  fi
  printf '%s\n' "${matches[0]}"
}

guided_package="$(find_current_package guided 'TraceChain_Guided_*_NON_RELEASE.zip')"
challenge_package="$(find_current_package challenge 'TraceChain_Challenge_*_NON_RELEASE.zip')"

"${compose[@]}" up -d

echo "--- waiting for Moodle ---"
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null http://localhost:8080/login/index.php; then break; fi
  sleep 2
done
curl -fsS -o /dev/null http://localhost:8080/login/index.php

# Clear only temporary deployment inputs. Activity content and learner data are
# reset through Moodle APIs in deploy.php.
"${compose[@]}" exec -T --user root moodle sh -c \
  'rm -f /tmp/TraceChain_Guided_*_NON_RELEASE.zip /tmp/TraceChain_Challenge_*_NON_RELEASE.zip /tmp/deploy.php'
"${compose[@]}" cp "$guided_package" "moodle:/tmp/$(basename "$guided_package")"
"${compose[@]}" cp "$challenge_package" "moodle:/tmp/$(basename "$challenge_package")"
"${compose[@]}" cp "$here/deploy.php" moodle:/tmp/deploy.php
"${compose[@]}" exec -T --user root moodle chmod 644 \
  "/tmp/$(basename "$guided_package")" \
  "/tmp/$(basename "$challenge_package")" \
  /tmp/deploy.php

echo "--- deploy and reset Guided + Challenge ---"
"${compose[@]}" exec -T --user daemon \
  -e TRACECHAIN_GUIDED_PACKAGE="/tmp/$(basename "$guided_package")" \
  -e TRACECHAIN_CHALLENGE_PACKAGE="/tmp/$(basename "$challenge_package")" \
  moodle /opt/bitnami/php/bin/php /tmp/deploy.php

"${compose[@]}" exec -T --user root moodle sh -c \
  'rm -f /tmp/TraceChain_Guided_*_NON_RELEASE.zip /tmp/TraceChain_Challenge_*_NON_RELEASE.zip /tmp/deploy.php'
echo "--- done: http://localhost:8080 ---"
