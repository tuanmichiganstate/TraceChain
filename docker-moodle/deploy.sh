#!/usr/bin/env bash
# Build all SCORM packages and deploy them into separate, reset Moodle
# activities. See deploy.php for the revision, verification, and reset logic.
#
#   ./docker-moodle/deploy.sh              build, package, verify, deploy all
#   ./docker-moodle/deploy.sh --no-build   deploy current packages on disk
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

guided_package="$(find_current_package guided 'SimuLedger_Guided_*_NON_RELEASE.zip')"
practice_package="$(find_current_package practice 'SimuLedger_Practice_*_NON_RELEASE.zip')"
challenge_package="$(find_current_package challenge 'SimuLedger_Challenge_*_NON_RELEASE.zip')"
assessment_package="$(find_current_package assessment 'SimuLedger_Assessment_*_NON_RELEASE.zip')"
audit_guided_package="$(find_current_package audit-guided 'SimuLedger_AuditGuided_*_NON_RELEASE.zip')"
audit_practice_package="$(find_current_package audit-practice 'SimuLedger_AuditPractice_*_NON_RELEASE.zip')"
audit_challenge_package="$(find_current_package audit-challenge 'SimuLedger_AuditChallenge_*_NON_RELEASE.zip')"
audit_assessment_package="$(find_current_package audit-assessment 'SimuLedger_AuditAssessment_*_NON_RELEASE.zip')"
technical_lab_package="$(find_current_package technical-lab 'SimuLedger_TechnicalLab_*_NON_RELEASE.zip')"

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
  'rm -f /tmp/SimuLedger_Guided_*_NON_RELEASE.zip /tmp/SimuLedger_Practice_*_NON_RELEASE.zip /tmp/SimuLedger_Challenge_*_NON_RELEASE.zip /tmp/SimuLedger_Assessment_*_NON_RELEASE.zip /tmp/SimuLedger_AuditGuided_*_NON_RELEASE.zip /tmp/SimuLedger_AuditPractice_*_NON_RELEASE.zip /tmp/SimuLedger_AuditChallenge_*_NON_RELEASE.zip /tmp/SimuLedger_AuditAssessment_*_NON_RELEASE.zip /tmp/SimuLedger_TechnicalLab_*_NON_RELEASE.zip /tmp/deploy.php'
"${compose[@]}" cp "$guided_package" "moodle:/tmp/$(basename "$guided_package")"
"${compose[@]}" cp "$practice_package" "moodle:/tmp/$(basename "$practice_package")"
"${compose[@]}" cp "$challenge_package" "moodle:/tmp/$(basename "$challenge_package")"
"${compose[@]}" cp "$assessment_package" "moodle:/tmp/$(basename "$assessment_package")"
"${compose[@]}" cp "$audit_guided_package" "moodle:/tmp/$(basename "$audit_guided_package")"
"${compose[@]}" cp "$audit_practice_package" "moodle:/tmp/$(basename "$audit_practice_package")"
"${compose[@]}" cp "$audit_challenge_package" "moodle:/tmp/$(basename "$audit_challenge_package")"
"${compose[@]}" cp "$audit_assessment_package" "moodle:/tmp/$(basename "$audit_assessment_package")"
"${compose[@]}" cp "$technical_lab_package" "moodle:/tmp/$(basename "$technical_lab_package")"
"${compose[@]}" cp "$here/deploy.php" moodle:/tmp/deploy.php
"${compose[@]}" exec -T --user root moodle chmod 644 \
  "/tmp/$(basename "$guided_package")" \
  "/tmp/$(basename "$practice_package")" \
  "/tmp/$(basename "$challenge_package")" \
  "/tmp/$(basename "$assessment_package")" \
  "/tmp/$(basename "$audit_guided_package")" \
  "/tmp/$(basename "$audit_practice_package")" \
  "/tmp/$(basename "$audit_challenge_package")" \
  "/tmp/$(basename "$audit_assessment_package")" \
  "/tmp/$(basename "$technical_lab_package")" \
  /tmp/deploy.php

echo "--- deploy and reset all SimuLedger activities ---"
"${compose[@]}" exec -T --user daemon \
  -e SIMULEDGER_GUIDED_PACKAGE="/tmp/$(basename "$guided_package")" \
  -e SIMULEDGER_PRACTICE_PACKAGE="/tmp/$(basename "$practice_package")" \
  -e SIMULEDGER_CHALLENGE_PACKAGE="/tmp/$(basename "$challenge_package")" \
  -e SIMULEDGER_ASSESSMENT_PACKAGE="/tmp/$(basename "$assessment_package")" \
  -e SIMULEDGER_AUDIT_GUIDED_PACKAGE="/tmp/$(basename "$audit_guided_package")" \
  -e SIMULEDGER_AUDIT_PRACTICE_PACKAGE="/tmp/$(basename "$audit_practice_package")" \
  -e SIMULEDGER_AUDIT_CHALLENGE_PACKAGE="/tmp/$(basename "$audit_challenge_package")" \
  -e SIMULEDGER_AUDIT_ASSESSMENT_PACKAGE="/tmp/$(basename "$audit_assessment_package")" \
  -e SIMULEDGER_TECHNICAL_LAB_PACKAGE="/tmp/$(basename "$technical_lab_package")" \
  moodle /opt/bitnami/php/bin/php /tmp/deploy.php

"${compose[@]}" exec -T --user root moodle sh -c \
  'rm -f /tmp/SimuLedger_Guided_*_NON_RELEASE.zip /tmp/SimuLedger_Practice_*_NON_RELEASE.zip /tmp/SimuLedger_Challenge_*_NON_RELEASE.zip /tmp/SimuLedger_Assessment_*_NON_RELEASE.zip /tmp/SimuLedger_AuditGuided_*_NON_RELEASE.zip /tmp/SimuLedger_AuditPractice_*_NON_RELEASE.zip /tmp/SimuLedger_AuditChallenge_*_NON_RELEASE.zip /tmp/SimuLedger_AuditAssessment_*_NON_RELEASE.zip /tmp/SimuLedger_TechnicalLab_*_NON_RELEASE.zip /tmp/deploy.php'
echo "--- done: http://localhost:8080 ---"
