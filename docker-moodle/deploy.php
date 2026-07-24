<?php
/**
 * Deploy the current Guided and Challenge packages into two demo activities.
 *
 * The first run adopts the existing TraceChain activity as Guided and
 * duplicates it once for Challenge. Later runs find both activities by their
 * stable names. Every deployment clears attempts, grades, and completion state
 * before replacing both packages.
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

const TRACECHAIN_ACTIVITY_GUIDED = 'TraceChain Guided';
const TRACECHAIN_ACTIVITY_CHALLENGE = 'TraceChain Challenge';

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
        ['name' => TRACECHAIN_ACTIVITY_GUIDED],
        '*',
        IGNORE_MISSING
    );
    $challenge = $DB->get_record(
        'scorm',
        ['name' => TRACECHAIN_ACTIVITY_CHALLENGE],
        '*',
        IGNORE_MISSING
    );

    if ($guided === false) {
        $candidates = [];
        foreach ($DB->get_records('scorm', [], 'id ASC') as $candidate) {
            if ($candidate->name !== TRACECHAIN_ACTIVITY_CHALLENGE) {
                $candidates[] = $candidate;
            }
        }
        if (count($candidates) !== 1) {
            fail(
                'could not identify one existing TraceChain activity to adopt as Guided'
            );
        }
        $guided = rename_activity($candidates[0], TRACECHAIN_ACTIVITY_GUIDED);
        $guidedcm = get_coursemodule_from_instance(
            'scorm',
            $guided->id,
            $guided->course,
            false,
            MUST_EXIST
        );
        echo "adopted:  cmid={$guidedcm->id} as \"".TRACECHAIN_ACTIVITY_GUIDED."\"\n";
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
            TRACECHAIN_ACTIVITY_CHALLENGE
        );
        $challengecm = get_coursemodule_from_instance(
            'scorm',
            $challenge->id,
            $challenge->course,
            false,
            MUST_EXIST
        );
        echo "created:  cmid={$challengecm->id} as \"".TRACECHAIN_ACTIVITY_CHALLENGE."\"\n";
    }

    if ((int)$guided->course !== (int)$challenge->course) {
        fail('Guided and Challenge activities must be in the same course');
    }

    return [
        'guided' => $guided,
        'challenge' => $challenge,
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
    'guided' => package_from_environment('TRACECHAIN_GUIDED_PACKAGE'),
    'challenge' => package_from_environment('TRACECHAIN_CHALLENGE_PACKAGE'),
];
$activities = ensure_managed_activities();

deploy_package($activities['guided'], $packages['guided']);
deploy_package($activities['challenge'], $packages['challenge']);

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
