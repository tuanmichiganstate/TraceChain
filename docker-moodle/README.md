
## Deploying to the demo instance

Build the package and replace whatever the demo currently holds:

    ./docker-moodle/deploy.sh              # build, package, verify, deploy
    ./docker-moodle/deploy.sh --no-build   # deploy the package already on disk

It goes through `scorm_parse()`, which clears the content area, re-extracts,
re-reads the manifest, and bumps `revision`. That bump is the point: extracted
content is served from a URL containing the revision, so without it the browser
keeps showing the previous build. Afterwards every file in the zip is checked
against what actually landed in the content area, so a half-extracted package
fails the script rather than surfacing later as a blank activity.

It finds the SCORM activity itself. If the demo ever holds more than one, it
says so and stops; set `TRACECHAIN_SCORM_CMID` to choose.

Learner attempts are untouched — a redeploy replaces content, not tracking
data. Suspend data written by an older build is still read by the new one, so
a resumed attempt exercises the compact codec's compatibility rules.

## Moodle acceptance pass

Exercises Moodle's own storage and gradebook with TC3-shaped payloads —
suspend_data round trip, gradebook write, relaunch-without-clobbering, the
4096-character boundary, and verified cleanup.

    ./docker-moodle/run-acceptance.sh

The cleanup trap removes synthetic attempts and verifies that both the attempt
table and gradebook are clean. Its forced-failure regression path must exit
nonzero while still passing cleanup:

    TRACECHAIN_ACCEPTANCE_FORCE_FAILURE=1 ./docker-moodle/run-acceptance.sh

Always `--user daemon`. Running as root leaves root-owned files in moodledata
that Apache cannot write, and Moodle then fails with "Invalid permissions
detected when trying to create a directory".
