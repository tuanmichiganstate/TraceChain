<?php
define('CLI_SCRIPT', true);
require('/opt/bitnami/moodle/config.php');
require_once($CFG->dirroot.'/mod/scorm/lib.php');
require_once($CFG->dirroot.'/mod/scorm/locallib.php');
require_once($CFG->libdir.'/gradelib.php');
require_once($CFG->libdir.'/enrollib.php');

$mode = getenv('SIMULEDGER_SCORM_MODE') ?: 'guided';
$activitynames = [
    'guided' => 'SimuLedger Guided',
    'practice' => 'SimuLedger Practice',
    'challenge' => 'SimuLedger Challenge',
    'assessment' => 'SimuLedger Assessment',
    'audit-guided' => 'SimuLedger Audit Guided',
    'audit-practice' => 'SimuLedger Audit Practice',
    'audit-challenge' => 'SimuLedger Audit Challenge',
    'audit-assessment' => 'SimuLedger Audit Assessment',
    'technical-lab' => 'SimuLedger Technical Laboratory',
];
if (!isset($activitynames[$mode])) {
    throw new RuntimeException("unknown SIMULEDGER_SCORM_MODE: $mode");
}
$isaudit = str_starts_with($mode, 'audit-');
$istechnicallab = $mode === 'technical-lab';
// These exercise Moodle storage boundaries, not the player decoder. Their
// framing and sizes represent the package's compact codec while remaining
// independent of content hashes that change between packages.
$prefix = $istechnicallab ? 'TL1.' : ($isaudit ? 'TA1.' : 'SL1.');
$FULL = $prefix . str_repeat('A', 512) . '.00000000';
$MID  = $prefix . str_repeat('B', 220) . '.00000000';
$midlocation = $isaudit
    ? 'AUDIT_WORKPAPER'
    : ($istechnicallab ? 'TL4' : 'STG_03_ANCHOR_CERTIFICATE');
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
$sco = $DB->get_records('scorm_scoes', ['scorm' => $scorm->id, 'scormtype' => 'sco'], 'id', '*', 0, 1);
$sco = reset($sco);
$user = get_admin();                       // existing account; nothing created

echo "activity: $mode, cmid={$cm->id}, \"{$scorm->name}\"\n";

function require_true($condition, $message) {
    if (!$condition) { throw new RuntimeException($message); }
}

// Enrol as a student so tracking and the gradebook behave like a real learner.
$context = context_course::instance($course->id);
if (!is_enrolled($context, $user->id)) {
    $plugin = enrol_get_plugin('manual');
    $inst = $DB->get_record('enrol', ['courseid'=>$course->id, 'enrol'=>'manual'], '*', IGNORE_MISSING);
    if (!$inst) { $plugin->add_instance($course); $inst = $DB->get_record('enrol', ['courseid'=>$course->id,'enrol'=>'manual']); }
    $studentrole = $DB->get_record('role', ['shortname'=>'student'], '*', MUST_EXIST);
    $plugin->enrol_user($inst, $user->id, $studentrole->id);
    echo "enrolled admin as student\n";
} else { echo "already enrolled\n"; }

function track($userid,$scormid,$scoid,$attempt,$el,$val){ return scorm_insert_track($userid,$scormid,$scoid,$attempt,$el,$val); }
function readback($scoid,$userid,$attempt,$el){
    $t = scorm_get_tracks($scoid,$userid,$attempt);
    return isset($t->$el) ? $t->$el : null;
}

echo "--- 1. mid-attempt save ---\n";
track($user->id,$scorm->id,$sco->id,1,'cmi.core.lesson_status','incomplete');
track($user->id,$scorm->id,$sco->id,1,'cmi.suspend_data',$MID);
track($user->id,$scorm->id,$sco->id,1,'cmi.core.lesson_location',$midlocation);
$got = readback($sco->id,$user->id,1,'cmi.suspend_data');
printf("  suspend_data round trip: %s (len %d)\n", $got === $MID ? 'BYTE-IDENTICAL' : 'MISMATCH', strlen((string)$got));
printf("  lesson_location: %s\n", readback($sco->id,$user->id,1,'cmi.core.lesson_location'));
require_true($got === $MID, 'mid-attempt suspend_data did not round-trip byte-identically');
require_true(readback($sco->id,$user->id,1,'cmi.core.lesson_location') === $midlocation, 'lesson_location did not persist');

echo "--- 2. resume: overwrite with a completed attempt ---\n";
track($user->id,$scorm->id,$sco->id,1,'cmi.suspend_data',$FULL);
track($user->id,$scorm->id,$sco->id,1,'cmi.core.score.raw','100');
track($user->id,$scorm->id,$sco->id,1,'cmi.core.score.min','0');
track($user->id,$scorm->id,$sco->id,1,'cmi.core.score.max','100');
track($user->id,$scorm->id,$sco->id,1,'cmi.core.lesson_status','passed');
$got = readback($sco->id,$user->id,1,'cmi.suspend_data');
printf("  suspend_data round trip: %s (len %d)\n", $got === $FULL ? 'BYTE-IDENTICAL' : 'MISMATCH', strlen((string)$got));
printf("  status: %s  score: %s\n", readback($sco->id,$user->id,1,'cmi.core.lesson_status'), readback($sco->id,$user->id,1,'cmi.core.score.raw'));
require_true($got === $FULL, 'completed suspend_data did not round-trip byte-identically');
require_true(readback($sco->id,$user->id,1,'cmi.core.lesson_status') === 'passed', 'passed status did not persist');
require_true((float)readback($sco->id,$user->id,1,'cmi.core.score.raw') === 100.0, 'score 100 did not persist');

echo "--- 3. gradebook ---\n";
scorm_update_grades($scorm, $user->id);
$grades = grade_get_grades($course->id, 'mod', 'scorm', $scorm->id, $user->id);
$g = $grades->items[0]->grades[$user->id] ?? null;
printf("  gradebook grade: %s / %s\n", $g && $g->grade !== null ? $g->grade : '(none)', $grades->items[0]->grademax ?? '?');
require_true($g && $g->grade !== null && (float)$g->grade === 100.0, 'gradebook did not receive 100');

echo "--- 4. relaunch must not clobber: a second attempt scoring lower ---\n";
track($user->id,$scorm->id,$sco->id,2,'cmi.core.score.raw','41');
track($user->id,$scorm->id,$sco->id,2,'cmi.core.lesson_status','completed');
scorm_update_grades($scorm, $user->id);
$grades = grade_get_grades($course->id, 'mod', 'scorm', $scorm->id, $user->id);
$g = $grades->items[0]->grades[$user->id] ?? null;
printf("  grademethod=%d (1 = highest attempt)\n", $scorm->grademethod);
printf("  gradebook after a worse second attempt: %s\n", $g && $g->grade !== null ? $g->grade : '(none)');
require_true((int)$scorm->grademethod === 1, 'SCORM activity is not configured for highest-attempt grading');
require_true($g && $g->grade !== null && (float)$g->grade === 100.0, 'worse relaunch attempt clobbered the grade');

echo "--- 5. long payload at the boundary ---\n";
$long = $prefix . str_repeat('a', 4096 - strlen($prefix));
track($user->id,$scorm->id,$sco->id,3,'cmi.suspend_data',$long);
$got = readback($sco->id,$user->id,3,'cmi.suspend_data');
printf("  4096 chars stored: %s (len %d)\n", $got === $long ? 'BYTE-IDENTICAL' : 'MISMATCH', strlen((string)$got));
require_true($got === $long, '4096-character suspend_data did not round-trip byte-identically');
echo "MOODLE ACCEPTANCE PASSED\n";
