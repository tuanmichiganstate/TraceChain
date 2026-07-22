<?php
define('CLI_SCRIPT', true);
require('/opt/bitnami/moodle/config.php');
require_once($CFG->dirroot.'/mod/scorm/lib.php');
require_once($CFG->dirroot.'/mod/scorm/locallib.php');
require_once($CFG->libdir.'/gradelib.php');

$cmid = 2;
[$course, $cm] = get_course_and_cm_from_cmid($cmid, 'scorm');
$scorm = $DB->get_record('scorm', ['id' => $cm->instance], '*', MUST_EXIST);
$user = get_admin();

// Remove the synthetic attempts written by the acceptance run.
$attempts = $DB->get_records('scorm_attempt', ['scormid' => $scorm->id, 'userid' => $user->id]);
foreach ($attempts as $a) {
    $DB->delete_records('scorm_scoes_value', ['attemptid' => $a->id]);
    $DB->delete_records('scorm_attempt', ['id' => $a->id]);
}
echo "removed " . count($attempts) . " synthetic attempt(s)\n";

scorm_update_grades($scorm, $user->id);
$grades = grade_get_grades($course->id, 'mod', 'scorm', $scorm->id, $user->id);
$g = $grades->items[0]->grades[$user->id] ?? null;
printf("gradebook now: %s\n", $g && $g->grade !== null ? $g->grade : '(none)');
$remaining = $DB->count_records('scorm_attempt', [
    'scormid' => $scorm->id,
    'userid' => $user->id,
]);
printf("remaining synthetic attempts for acceptance user: %d\n", $remaining);
if ($g && $g->grade !== null) { throw new RuntimeException('synthetic gradebook value remains after cleanup'); }
if ($remaining !== 0) { throw new RuntimeException('synthetic SCORM attempts remain for acceptance user after cleanup'); }
echo "MOODLE CLEANUP VERIFIED\n";
