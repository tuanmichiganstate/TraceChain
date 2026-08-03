<?php
/**
 * Deploy all current Operations, Audit, and Technical Laboratory packages.
 *
 * The first run adopts the existing SimuLedger activity as Guided and
 * duplicates it for the other managed presets. Later runs find all activities
 * by their stable names. Every deployment clears attempts, grades, and
 * completion state before replacing all packages.
 *
 * `scorm_parse()` rebuilds the extracted content and bumps `revision`. The
 * revision change prevents Moodle from serving a cached previous build.
 */

define('CLI_SCRIPT', true);
require('/bitnami/moodle/config.php');
require_once($CFG->dirroot.'/course/lib.php');
require_once($CFG->dirroot.'/mod/scorm/lib.php');
require_once($CFG->dirroot.'/mod/scorm/locallib.php');
require_once($CFG->libdir.'/completionlib.php');

const SIMULEDGER_ACTIVITY_GUIDED = 'SimuLedger Guided';
const SIMULEDGER_ACTIVITY_PRACTICE = 'SimuLedger Practice';
const SIMULEDGER_ACTIVITY_CHALLENGE = 'SimuLedger Challenge';
const SIMULEDGER_ACTIVITY_ASSESSMENT = 'SimuLedger Assessment';
const SIMULEDGER_ACTIVITY_AUDIT_GUIDED = 'SimuLedger Audit Guided';
const SIMULEDGER_ACTIVITY_AUDIT_PRACTICE = 'SimuLedger Audit Practice';
const SIMULEDGER_ACTIVITY_AUDIT_CHALLENGE = 'SimuLedger Audit Challenge';
const SIMULEDGER_ACTIVITY_AUDIT_ASSESSMENT = 'SimuLedger Audit Assessment';
const SIMULEDGER_ACTIVITY_TECHNICAL_LAB = 'SimuLedger Technical Laboratory';

function fail(string $message): void {
    fwrite(STDERR, "deploy: $message\n");
    exit(1);
}

function package_from_environment(string $variable): string {
    $path = getenv($variable);
    if ($path === false || $path === '') {
        fail("$variable is required");
    }
    if (dirname($path) !== '/tmp' || !is_file($path)) {
        fail("$variable must name an existing package in /tmp");
    }
    return $path;
}

function rename_activity(object $scorm, string $name): object {
    global $DB;

    $cm = get_coursemodule_from_instance(
        'scorm',
        $scorm->id,
        $scorm->course,
        false,
        MUST_EXIST
    );
    if (!set_coursemodule_name($cm->id, $name)) {
        fail("could not rename cmid={$cm->id} to \"$name\"");
    }
    rebuild_course_cache($scorm->course, true);
    return $DB->get_record('scorm', ['id' => $scorm->id], '*', MUST_EXIST);
}

function ensure_managed_activities(): array {
    global $DB;

    $guided = $DB->get_record(
        'scorm',
        ['name' => SIMULEDGER_ACTIVITY_GUIDED],
        '*',
        IGNORE_MISSING
    );
    $challenge = $DB->get_record(
        'scorm',
        ['name' => SIMULEDGER_ACTIVITY_CHALLENGE],
        '*',
        IGNORE_MISSING
    );
    $practice = $DB->get_record(
        'scorm',
        ['name' => SIMULEDGER_ACTIVITY_PRACTICE],
        '*',
        IGNORE_MISSING
    );
    $assessment = $DB->get_record(
        'scorm',
        ['name' => SIMULEDGER_ACTIVITY_ASSESSMENT],
        '*',
        IGNORE_MISSING
    );
    $auditguided = $DB->get_record(
        'scorm',
        ['name' => SIMULEDGER_ACTIVITY_AUDIT_GUIDED],
        '*',
        IGNORE_MISSING
    );
    $auditpractice = $DB->get_record(
        'scorm',
        ['name' => SIMULEDGER_ACTIVITY_AUDIT_PRACTICE],
        '*',
        IGNORE_MISSING
    );
    $auditchallenge = $DB->get_record(
        'scorm',
        ['name' => SIMULEDGER_ACTIVITY_AUDIT_CHALLENGE],
        '*',
        IGNORE_MISSING
    );
    $auditassessment = $DB->get_record(
        'scorm',
        ['name' => SIMULEDGER_ACTIVITY_AUDIT_ASSESSMENT],
        '*',
        IGNORE_MISSING
    );
    $technicallab = $DB->get_record(
        'scorm',
        ['name' => SIMULEDGER_ACTIVITY_TECHNICAL_LAB],
        '*',
        IGNORE_MISSING
    );

    if ($guided === false) {
        $candidates = [];
        foreach ($DB->get_records('scorm', [], 'id ASC') as $candidate) {
            if (
                $candidate->name !== SIMULEDGER_ACTIVITY_CHALLENGE &&
                $candidate->name !== SIMULEDGER_ACTIVITY_PRACTICE &&
                $candidate->name !== SIMULEDGER_ACTIVITY_ASSESSMENT &&
                $candidate->name !== SIMULEDGER_ACTIVITY_AUDIT_GUIDED &&
                $candidate->name !== SIMULEDGER_ACTIVITY_AUDIT_PRACTICE &&
                $candidate->name !== SIMULEDGER_ACTIVITY_AUDIT_CHALLENGE &&
                $candidate->name !== SIMULEDGER_ACTIVITY_AUDIT_ASSESSMENT &&
                $candidate->name !== SIMULEDGER_ACTIVITY_TECHNICAL_LAB
            ) {
                $candidates[] = $candidate;
            }
        }
        if (count($candidates) !== 1) {
            fail(
                'could not identify one existing SimuLedger activity to adopt as Guided'
            );
        }
        $guided = rename_activity($candidates[0], SIMULEDGER_ACTIVITY_GUIDED);
        $guidedcm = get_coursemodule_from_instance(
            'scorm',
            $guided->id,
            $guided->course,
            false,
            MUST_EXIST
        );
        echo "adopted:  cmid={$guidedcm->id} as \"".SIMULEDGER_ACTIVITY_GUIDED."\"\n";
    }

    if ($practice === false) {
        $course = get_course($guided->course);
        $guidedcm = get_coursemodule_from_instance(
            'scorm',
            $guided->id,
            $guided->course,
            false,
            MUST_EXIST
        );
        $newcm = duplicate_module($course, $guidedcm, null, false);
        if ($newcm === null) {
            fail('Moodle could not duplicate the Guided activity for Practice');
        }
        $practice = $DB->get_record(
            'scorm',
            ['id' => $newcm->instance],
            '*',
            MUST_EXIST
        );
        $practice = rename_activity(
            $practice,
            SIMULEDGER_ACTIVITY_PRACTICE
        );
        $practicecm = get_coursemodule_from_instance(
            'scorm',
            $practice->id,
            $practice->course,
            false,
            MUST_EXIST
        );
        echo "created:  cmid={$practicecm->id} as \"".SIMULEDGER_ACTIVITY_PRACTICE."\"\n";
    }

    if ($challenge === false) {
        $course = get_course($guided->course);
        $guidedcm = get_coursemodule_from_instance(
            'scorm',
            $guided->id,
            $guided->course,
            false,
            MUST_EXIST
        );
        $newcm = duplicate_module($course, $guidedcm, null, false);
        if ($newcm === null) {
            fail('Moodle could not duplicate the Guided activity for Challenge');
        }
        $challenge = $DB->get_record(
            'scorm',
            ['id' => $newcm->instance],
            '*',
            MUST_EXIST
        );
        $challenge = rename_activity(
            $challenge,
            SIMULEDGER_ACTIVITY_CHALLENGE
        );
        $challengecm = get_coursemodule_from_instance(
            'scorm',
            $challenge->id,
            $challenge->course,
            false,
            MUST_EXIST
        );
        echo "created:  cmid={$challengecm->id} as \"".SIMULEDGER_ACTIVITY_CHALLENGE."\"\n";
    }

    if ($assessment === false) {
        $course = get_course($guided->course);
        $guidedcm = get_coursemodule_from_instance(
            'scorm',
            $guided->id,
            $guided->course,
            false,
            MUST_EXIST
        );
        $newcm = duplicate_module($course, $guidedcm, null, false);
        if ($newcm === null) {
            fail('Moodle could not duplicate the Guided activity for Assessment');
        }
        $assessment = $DB->get_record(
            'scorm',
            ['id' => $newcm->instance],
            '*',
            MUST_EXIST
        );
        $assessment = rename_activity(
            $assessment,
            SIMULEDGER_ACTIVITY_ASSESSMENT
        );
        $assessmentcm = get_coursemodule_from_instance(
            'scorm',
            $assessment->id,
            $assessment->course,
            false,
            MUST_EXIST
        );
        echo "created:  cmid={$assessmentcm->id} as \"".SIMULEDGER_ACTIVITY_ASSESSMENT."\"\n";
    }

    if ($auditguided === false) {
        $course = get_course($guided->course);
        $guidedcm = get_coursemodule_from_instance(
            'scorm',
            $guided->id,
            $guided->course,
            false,
            MUST_EXIST
        );
        $newcm = duplicate_module($course, $guidedcm, null, false);
        if ($newcm === null) {
            fail('Moodle could not duplicate the Guided activity for Audit Guided');
        }
        $auditguided = $DB->get_record(
            'scorm',
            ['id' => $newcm->instance],
            '*',
            MUST_EXIST
        );
        $auditguided = rename_activity(
            $auditguided,
            SIMULEDGER_ACTIVITY_AUDIT_GUIDED
        );
        $auditguidedcm = get_coursemodule_from_instance(
            'scorm',
            $auditguided->id,
            $auditguided->course,
            false,
            MUST_EXIST
        );
        echo "created:  cmid={$auditguidedcm->id} as \"".SIMULEDGER_ACTIVITY_AUDIT_GUIDED."\"\n";
    }

    if ($auditpractice === false) {
        $course = get_course($guided->course);
        $guidedcm = get_coursemodule_from_instance(
            'scorm',
            $guided->id,
            $guided->course,
            false,
            MUST_EXIST
        );
        $newcm = duplicate_module($course, $guidedcm, null, false);
        if ($newcm === null) {
            fail('Moodle could not duplicate the Guided activity for Audit Practice');
        }
        $auditpractice = $DB->get_record(
            'scorm',
            ['id' => $newcm->instance],
            '*',
            MUST_EXIST
        );
        $auditpractice = rename_activity(
            $auditpractice,
            SIMULEDGER_ACTIVITY_AUDIT_PRACTICE
        );
        $auditpracticecm = get_coursemodule_from_instance(
            'scorm',
            $auditpractice->id,
            $auditpractice->course,
            false,
            MUST_EXIST
        );
        echo "created:  cmid={$auditpracticecm->id} as \"".SIMULEDGER_ACTIVITY_AUDIT_PRACTICE."\"\n";
    }

    if ($auditchallenge === false) {
        $course = get_course($guided->course);
        $guidedcm = get_coursemodule_from_instance(
            'scorm',
            $guided->id,
            $guided->course,
            false,
            MUST_EXIST
        );
        $newcm = duplicate_module($course, $guidedcm, null, false);
        if ($newcm === null) {
            fail('Moodle could not duplicate the Guided activity for Audit Challenge');
        }
        $auditchallenge = $DB->get_record(
            'scorm',
            ['id' => $newcm->instance],
            '*',
            MUST_EXIST
        );
        $auditchallenge = rename_activity(
            $auditchallenge,
            SIMULEDGER_ACTIVITY_AUDIT_CHALLENGE
        );
        $auditchallengecm = get_coursemodule_from_instance(
            'scorm',
            $auditchallenge->id,
            $auditchallenge->course,
            false,
            MUST_EXIST
        );
        echo "created:  cmid={$auditchallengecm->id} as \"".SIMULEDGER_ACTIVITY_AUDIT_CHALLENGE."\"\n";
    }

    if ($auditassessment === false) {
        $course = get_course($guided->course);
        $guidedcm = get_coursemodule_from_instance(
            'scorm',
            $guided->id,
            $guided->course,
            false,
            MUST_EXIST
        );
        $newcm = duplicate_module($course, $guidedcm, null, false);
        if ($newcm === null) {
            fail('Moodle could not duplicate the Guided activity for Audit Assessment');
        }
        $auditassessment = $DB->get_record(
            'scorm',
            ['id' => $newcm->instance],
            '*',
            MUST_EXIST
        );
        $auditassessment = rename_activity(
            $auditassessment,
            SIMULEDGER_ACTIVITY_AUDIT_ASSESSMENT
        );
        $auditassessmentcm = get_coursemodule_from_instance(
            'scorm',
            $auditassessment->id,
            $auditassessment->course,
            false,
            MUST_EXIST
        );
        echo "created:  cmid={$auditassessmentcm->id} as \"".SIMULEDGER_ACTIVITY_AUDIT_ASSESSMENT."\"\n";
    }

    if ($technicallab === false) {
        $course = get_course($guided->course);
        $guidedcm = get_coursemodule_from_instance(
            'scorm',
            $guided->id,
            $guided->course,
            false,
            MUST_EXIST
        );
        $newcm = duplicate_module($course, $guidedcm, null, false);
        if ($newcm === null) {
            fail('Moodle could not duplicate the Guided activity for Technical Laboratory');
        }
        $technicallab = $DB->get_record(
            'scorm',
            ['id' => $newcm->instance],
            '*',
            MUST_EXIST
        );
        $technicallab = rename_activity(
            $technicallab,
            SIMULEDGER_ACTIVITY_TECHNICAL_LAB
        );
        $technicallabcm = get_coursemodule_from_instance(
            'scorm',
            $technicallab->id,
            $technicallab->course,
            false,
            MUST_EXIST
        );
        echo "created:  cmid={$technicallabcm->id} as \"".SIMULEDGER_ACTIVITY_TECHNICAL_LAB."\"\n";
    }

    if (
        (int)$guided->course !== (int)$practice->course ||
        (int)$guided->course !== (int)$challenge->course ||
        (int)$guided->course !== (int)$assessment->course ||
        (int)$guided->course !== (int)$auditguided->course ||
        (int)$guided->course !== (int)$auditpractice->course ||
        (int)$guided->course !== (int)$auditchallenge->course ||
        (int)$guided->course !== (int)$auditassessment->course ||
        (int)$guided->course !== (int)$technicallab->course
    ) {
        fail('Managed SimuLedger activities must be in the same course');
    }

    return [
        'guided' => $guided,
        'practice' => $practice,
        'challenge' => $challenge,
        'assessment' => $assessment,
        'audit-guided' => $auditguided,
        'audit-practice' => $auditpractice,
        'audit-challenge' => $auditchallenge,
        'audit-assessment' => $auditassessment,
        'technical-lab' => $technicallab,
    ];
}

function reset_activity(object $scorm, object $cm): void {
    global $DB;

    $attemptsbefore = $DB->count_records(
        'scorm_attempt',
        ['scormid' => $scorm->id]
    );
    scorm_delete_tracks($scorm->id);
    scorm_grade_item_update($scorm, 'reset');

    $completion = new completion_info(get_course($scorm->course));
    $completion->delete_all_state($cm);

    $attemptsafter = $DB->count_records(
        'scorm_attempt',
        ['scormid' => $scorm->id]
    );
    if ($attemptsafter !== 0) {
        fail("cmid={$cm->id} still has $attemptsafter attempt(s) after reset");
    }
    echo "reset:     removed $attemptsbefore attempt(s), grades, and completion state\n";
}

function deploy_package(object $scorm, string $zip): void {
    global $DB;

    $cm = get_coursemodule_from_instance(
        'scorm',
        $scorm->id,
        $scorm->course,
        false,
        MUST_EXIST
    );
    if ($scorm->scormtype !== SCORM_TYPE_LOCAL) {
        fail(
            "activity cmid={$cm->id} is not a locally uploaded package ".
            "(scormtype={$scorm->scormtype})"
        );
    }

    $context = context_module::instance($cm->id);
    $fs = get_file_storage();
    $name = basename($zip);

    echo "activity:  cmid={$cm->id} \"{$scorm->name}\" in course {$scorm->course}\n";
    echo "before:    revision={$scorm->revision} version={$scorm->version} sha1={$scorm->sha1hash}\n";

    reset_activity($scorm, $cm);

    // Read before parsing: Moodle mutates the object passed to scorm_parse().
    $revisionbefore = (int)$scorm->revision;

    $fs->delete_area_files($context->id, 'mod_scorm', 'package');
    $fs->create_file_from_pathname([
        'contextid' => $context->id,
        'component' => 'mod_scorm',
        'filearea' => 'package',
        'itemid' => 0,
        'filepath' => '/',
        'filename' => $name,
    ], $zip);

    $scorm->reference = $name;
    $scorm->cmid = $cm->id;
    // Force byte-identical rebuilds to advance the cache revision too.
    scorm_parse($scorm, true);

    $after = $DB->get_record('scorm', ['id' => $scorm->id], '*', MUST_EXIST);
    echo "after:     revision={$after->revision} version={$after->version} sha1={$after->sha1hash}\n";

    if ($after->version === 'ERROR') {
        fail(
            "Moodle could not parse $name; re-upload this activity by hand"
        );
    }
    if ((int)$after->revision <= $revisionbefore) {
        fail("cmid={$cm->id} revision did not advance");
    }

    // Every archive entry must exist in Moodle's extracted content at the same
    // size. This catches partial extraction and stale content immediately.
    $packer = get_file_packer('application/zip');
    $entries = $packer->list_files($zip);
    if ($entries === false) {
        fail("could not read $zip");
    }
    $missing = [];
    $mismatched = [];
    $checked = 0;
    foreach ($entries as $entry) {
        if ($entry->is_directory) {
            continue;
        }
        $checked++;
        $path = '/'.ltrim($entry->pathname, '/');
        $dir = rtrim(substr($path, 0, strrpos($path, '/')), '/').'/';
        $stored = $fs->get_file(
            $context->id,
            'mod_scorm',
            'content',
            0,
            $dir,
            basename($path)
        );
        if ($stored === false) {
            $missing[] = $path;
        } else if ((int)$stored->get_filesize() !== (int)$entry->size) {
            $mismatched[] = sprintf(
                '%s (%d in package, %d stored)',
                $path,
                $entry->size,
                $stored->get_filesize()
            );
        }
    }
    if ($missing !== [] || $mismatched !== []) {
        foreach ($missing as $path) {
            fwrite(STDERR, "  missing: $path\n");
        }
        foreach ($mismatched as $detail) {
            fwrite(STDERR, "  wrong size: $detail\n");
        }
        fail("cmid={$cm->id} extracted content does not match $name");
    }

    if (
        $fs->get_file(
            $context->id,
            'mod_scorm',
            'content',
            0,
            '/',
            'imsmanifest.xml'
        ) === false
    ) {
        fail("cmid={$cm->id} has no imsmanifest.xml in its content area");
    }
    $launch = $DB->get_record('scorm_scoes', ['id' => $after->launch]);
    if ($launch === false) {
        fail("launch SCO {$after->launch} does not exist");
    }

    echo "launch:    sco {$after->launch} -> {$launch->launch}\n";
    echo "deployed:  $name, $checked file(s) verified\n";
}

\core\session\manager::set_user(get_admin());

$packages = [
    'guided' => package_from_environment('SIMULEDGER_GUIDED_PACKAGE'),
    'practice' => package_from_environment('SIMULEDGER_PRACTICE_PACKAGE'),
    'challenge' => package_from_environment('SIMULEDGER_CHALLENGE_PACKAGE'),
    'assessment' => package_from_environment('SIMULEDGER_ASSESSMENT_PACKAGE'),
    'audit-guided' => package_from_environment('SIMULEDGER_AUDIT_GUIDED_PACKAGE'),
    'audit-practice' => package_from_environment('SIMULEDGER_AUDIT_PRACTICE_PACKAGE'),
    'audit-challenge' => package_from_environment('SIMULEDGER_AUDIT_CHALLENGE_PACKAGE'),
    'audit-assessment' => package_from_environment('SIMULEDGER_AUDIT_ASSESSMENT_PACKAGE'),
    'technical-lab' => package_from_environment('SIMULEDGER_TECHNICAL_LAB_PACKAGE'),
];
$activities = ensure_managed_activities();

deploy_package($activities['guided'], $packages['guided']);
deploy_package($activities['practice'], $packages['practice']);
deploy_package($activities['challenge'], $packages['challenge']);
deploy_package($activities['assessment'], $packages['assessment']);
deploy_package($activities['audit-guided'], $packages['audit-guided']);
deploy_package($activities['audit-practice'], $packages['audit-practice']);
deploy_package($activities['audit-challenge'], $packages['audit-challenge']);
deploy_package($activities['audit-assessment'], $packages['audit-assessment']);
deploy_package($activities['technical-lab'], $packages['technical-lab']);

echo "managed activities are ready and empty:\n";
foreach ($activities as $mode => $activity) {
    $cm = get_coursemodule_from_instance(
        'scorm',
        $activity->id,
        $activity->course,
        false,
        MUST_EXIST
    );
    echo "  $mode: cmid={$cm->id} \"{$activity->name}\"\n";
}
