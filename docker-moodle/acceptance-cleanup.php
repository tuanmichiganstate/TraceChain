<?php
define('CLI_SCRIPT', true);
require('/opt/bitnami/moodle/config.php');
require_once($CFG->dirroot.'/mod/scorm/lib.php');
require_once($CFG->dirroot.'/mod/scorm/locallib.php');
require_once($CFG->libdir.'/gradelib.php');

$mode = getenv('TRACECHAIN_SCORM_MODE') ?: 'guided';
$activitynames = [
    'guided' => 'TraceChain Guided',
    'practice' => 'TraceChain Practice',
    'challenge' => 'TraceChain Challenge',
    'assessment' => 'TraceChain Assessment',
];
if (!isset($activitynames[$mode])) {
    throw new RuntimeException("unknown TRACECHAIN_SCORM_MODE: $mode");
}
$scorm = $DB->get_record(
    'scorm',
    ['name' => $activitynames[$mode]],
    '*',
    MUST_EXIST
);
$cm = get_coursemodule_from_instance(
    'scorm',
    $scorm->id,
    $scorm->course,
    false,
    MUST_EXIST
);
$course = get_course($scorm->course);
$scorm = $DB->get_record('scorm', ['id' => $cm->instance], '*', MUST_EXIST);
$user = get_admin();

echo "activity: $mode, cmid={$cm->id}, \"{$scorm->name}\"\n";

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
