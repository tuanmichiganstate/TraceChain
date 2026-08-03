<?php
/**
 * Fixture for SIMULEDGER_ACCEPTANCE_FORCE_FAILURE.
 *
 * Connects to Moodle exactly as the real acceptance script does, then exits
 * non-zero, so the runner's cleanup trap and exit propagation can be exercised
 * without editing committed code.
 */
define('CLI_SCRIPT', true);
require('/opt/bitnami/moodle/config.php');
fwrite(STDERR, "acceptance failure forced by SIMULEDGER_ACCEPTANCE_FORCE_FAILURE\n");
exit(1);
