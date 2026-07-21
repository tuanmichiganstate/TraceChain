
## Moodle acceptance pass

Exercises Moodle's own storage and gradebook with real encoded payloads —
suspend_data round trip, gradebook write, and relaunch-without-clobbering.

    docker compose cp acceptance.php moodle:/tmp/acceptance.php
    docker compose exec -T --user root moodle chmod 644 /tmp/acceptance.php
    docker compose exec -T --user daemon moodle /opt/bitnami/php/bin/php /tmp/acceptance.php

Run `acceptance-cleanup.php` the same way afterwards; it removes the synthetic
attempts so the demo instance starts clean.

Always `--user daemon`. Running as root leaves root-owned files in moodledata
that Apache cannot write, and Moodle then fails with "Invalid permissions
detected when trying to create a directory".
