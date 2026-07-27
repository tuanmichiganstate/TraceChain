
## Deploying to the demo instance

Build all packages and deploy them into separate activities:

    ./docker-moodle/deploy.sh              # build, verify, deploy, reset all
    ./docker-moodle/deploy.sh --no-build   # deploy current packages, reset all

The first run adopts the existing activity as `TraceChain Guided` and creates
`TraceChain Practice`, `TraceChain Challenge`, `TraceChain Assessment`,
`TraceChain Audit Guided`, `TraceChain Audit Practice`,
`TraceChain Audit Challenge`, `TraceChain Audit Assessment`, and
`TraceChain Technical Laboratory` beside it. Later runs update those nine
stable activities. Each deployment clears attempts,
grades, and completion state for all activities, then goes through
`scorm_parse()` to
extract each package and bump its cache revision. Every ZIP entry is checked
against Moodle's content area, so partial extraction fails immediately.

The deployment only manages those nine named activities. It will not guess when
several unnamed SCORM activities already exist.

## Moodle acceptance pass

Exercises all activities with codec-shaped payloads (TC3 for Operations, TA1
for Audit, and TL1 for Technical Laboratory): suspend-data round trip, gradebook write,
relaunch-without-clobbering, the 4096-character boundary, and verified cleanup.

    ./docker-moodle/run-acceptance.sh

The cleanup trap removes synthetic attempts and verifies that the attempt
table and gradebook are clean. Its forced-failure regression path must exit
nonzero while still passing cleanup:

    TRACECHAIN_ACCEPTANCE_FORCE_FAILURE=1 ./docker-moodle/run-acceptance.sh

Always `--user daemon`. Running as root leaves root-owned files in moodledata
that Apache cannot write, and Moodle then fails with "Invalid permissions
detected when trying to create a directory".
