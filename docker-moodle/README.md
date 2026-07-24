
## Deploying to the demo instance

Build both packages and deploy them into separate activities:

    ./docker-moodle/deploy.sh              # build, verify, deploy, reset both
    ./docker-moodle/deploy.sh --no-build   # deploy current packages, reset both

The first run adopts the existing activity as `TraceChain Guided` and creates
`TraceChain Challenge` beside it. Later runs update those two stable activities.
Each deployment clears attempts, grades, and completion state for both
activities, then goes through `scorm_parse()` to extract each package and bump
its cache revision. Every ZIP entry is checked against Moodle's content area,
so partial extraction fails immediately.

The deployment only manages those two named activities. It will not guess when
several unnamed SCORM activities already exist.

## Moodle acceptance pass

Exercises both activities with TC3-shaped payloads: suspend-data round trip,
gradebook write, relaunch-without-clobbering, the 4096-character boundary, and
verified cleanup.

    ./docker-moodle/run-acceptance.sh

The cleanup trap removes synthetic attempts and verifies that both the attempt
table and gradebook are clean. Its forced-failure regression path must exit
nonzero while still passing cleanup:

    TRACECHAIN_ACCEPTANCE_FORCE_FAILURE=1 ./docker-moodle/run-acceptance.sh

Always `--user daemon`. Running as root leaves root-owned files in moodledata
that Apache cannot write, and Moodle then fails with "Invalid permissions
detected when trying to create a directory".
