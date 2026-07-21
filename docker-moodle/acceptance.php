<?php
define('CLI_SCRIPT', true);
require('/opt/bitnami/moodle/config.php');
require_once($CFG->dirroot.'/mod/scorm/lib.php');
require_once($CFG->dirroot.'/mod/scorm/locallib.php');
require_once($CFG->libdir.'/gradelib.php');
require_once($CFG->libdir.'/enrollib.php');

$FULL = 'TC1.8e7.001100220033004100520063007100120023003100420053006100720013002100320043.1r.3.3d89569c';
$MID  = 'TC1.207.002100000000000000000000000000000000000000000000000000000000000000000000.0.0.9a497d56';

$cmid = 2;
[$course, $cm] = get_course_and_cm_from_cmid($cmid, 'scorm');
$scorm = $DB->get_record('scorm', ['id' => $cm->instance], '*', MUST_EXIST);
$sco = $DB->get_records('scorm_scoes', ['scorm' => $scorm->id, 'scormtype' => 'sco'], 'id', '*', 0, 1);
$sco = reset($sco);
$user = get_admin();                       // existing account; nothing created

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
track($user->id,$scorm->id,$sco->id,1,'cmi.core.lesson_location','STG_03_ANCHOR_CERTIFICATE');
$got = readback($sco->id,$user->id,1,'cmi.suspend_data');
printf("  suspend_data round trip: %s (len %d)\n", $got === $MID ? 'BYTE-IDENTICAL' : 'MISMATCH', strlen((string)$got));
printf("  lesson_location: %s\n", readback($sco->id,$user->id,1,'cmi.core.lesson_location'));

echo "--- 2. resume: overwrite with a completed attempt ---\n";
track($user->id,$scorm->id,$sco->id,1,'cmi.suspend_data',$FULL);
track($user->id,$scorm->id,$sco->id,1,'cmi.core.score.raw','100');
track($user->id,$scorm->id,$sco->id,1,'cmi.core.score.min','0');
track($user->id,$scorm->id,$sco->id,1,'cmi.core.score.max','100');
track($user->id,$scorm->id,$sco->id,1,'cmi.core.lesson_status','passed');
$got = readback($sco->id,$user->id,1,'cmi.suspend_data');
printf("  suspend_data round trip: %s (len %d)\n", $got === $FULL ? 'BYTE-IDENTICAL' : 'MISMATCH', strlen((string)$got));
printf("  status: %s  score: %s\n", readback($sco->id,$user->id,1,'cmi.core.lesson_status'), readback($sco->id,$user->id,1,'cmi.core.score.raw'));

echo "--- 3. gradebook ---\n";
scorm_update_grades($scorm, $user->id);
$grades = grade_get_grades($course->id, 'mod', 'scorm', $scorm->id, $user->id);
$g = $grades->items[0]->grades[$user->id] ?? null;
printf("  gradebook grade: %s / %s\n", $g && $g->grade !== null ? $g->grade : '(none)', $grades->items[0]->grademax ?? '?');

echo "--- 4. relaunch must not clobber: a second attempt scoring lower ---\n";
track($user->id,$scorm->id,$sco->id,2,'cmi.core.score.raw','41');
track($user->id,$scorm->id,$sco->id,2,'cmi.core.lesson_status','completed');
scorm_update_grades($scorm, $user->id);
$grades = grade_get_grades($course->id, 'mod', 'scorm', $scorm->id, $user->id);
$g = $grades->items[0]->grades[$user->id] ?? null;
printf("  grademethod=%d (1 = highest attempt)\n", $scorm->grademethod);
printf("  gradebook after a worse second attempt: %s\n", $g && $g->grade !== null ? $g->grade : '(none)');

echo "--- 5. long payload at the boundary ---\n";
$long = 'TC1.' . str_repeat('a', 4096 - 4);
track($user->id,$scorm->id,$sco->id,3,'cmi.suspend_data',$long);
$got = readback($sco->id,$user->id,3,'cmi.suspend_data');
printf("  4096 chars stored: %s (len %d)\n", $got === $long ? 'BYTE-IDENTICAL' : 'MISMATCH', strlen((string)$got));
