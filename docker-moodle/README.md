
## Moodle acceptance pass

Exercises Moodle's own storage and gradebook with current TC2 payloads —
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
