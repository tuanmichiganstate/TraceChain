<?php
/**
 * Replace the demo instance's SCORM package with the one just built.
 *
 * `scorm_parse()` does the real work: it clears the content area, extracts the
 * new zip into it, re-reads imsmanifest.xml, and bumps `revision`. That bump
 * matters -- extracted content is served from a URL containing the revision, so
 * without it a browser keeps showing the previous build from cache. Doing this
 * by hand instead of through the Moodle UI keeps the edit-build-look loop to
 * one command.
 *
 * The activity is found rather than hardcoded. One SCORM activity in the demo
 * is the normal case; more than one is ambiguous, so it asks instead of
 * guessing which one to overwrite.
 */

define('CLI_SCRIPT', true);
require('/bitnami/moodle/config.php');
require_once($CFG->dirroot.'/mod/scorm/lib.php');
require_once($CFG->dirroot.'/mod/scorm/locallib.php');

function fail(string $message): void {
    fwrite(STDERR, "deploy: $message\n");
    exit(1);
}

// The shell side copies in exactly one package and keeps its real filename,
// because that name becomes $scorm->reference and shows in the Moodle UI.
$candidates = glob('/tmp/tracechain-scorm-*.zip');
if (count($candidates) !== 1) {
    fail('expected exactly one /tmp/tracechain-scorm-*.zip, found '.count($candidates));
}
$zip = $candidates[0];
$name = basename($zip);

$wanted = getenv('TRACECHAIN_SCORM_CMID');
if ($wanted !== false && $wanted !== '') {
    $cm = get_coursemodule_from_id('scorm', (int)$wanted, 0, false, MUST_EXIST);
    $scorm = $DB->get_record('scorm', ['id' => $cm->instance], '*', MUST_EXIST);
} else {
    $all = $DB->get_records('scorm');
    if (count($all) === 0) {
        fail('no SCORM activity in this Moodle -- add one, then re-run');
    }
    if (count($all) > 1) {
        $ids = [];
        foreach ($all as $candidate) {
            $candidatecm = get_coursemodule_from_instance('scorm', $candidate->id, $candidate->course);
            $ids[] = "cmid={$candidatecm->id} ({$candidate->name})";
        }
        fail('several SCORM activities; set TRACECHAIN_SCORM_CMID to one of: '.implode(', ', $ids));
    }
    $scorm = reset($all);
    $cm = get_coursemodule_from_instance('scorm', $scorm->id, $scorm->course, false, MUST_EXIST);
}

if ($scorm->scormtype !== SCORM_TYPE_LOCAL) {
    fail("activity cmid={$cm->id} is not a locally uploaded package (scormtype={$scorm->scormtype})");
}

$context = context_module::instance($cm->id);
$fs = get_file_storage();

echo "activity: cmid={$cm->id} \"{$scorm->name}\" in course {$scorm->course}\n";
echo "before:   revision={$scorm->revision} version={$scorm->version} sha1={$scorm->sha1hash}\n";

// Read before the call, not after: PHP hands objects over by handle, and
// scorm_parse increments $scorm->revision on the very object passed to it.
$revisionbefore = (int)$scorm->revision;

// Only the package area is ours to clear -- scorm_parse rebuilds the content
// area itself, and doing it here as well would just hide a failure to do so.
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
// Forced: the hash differs on any real change, but a rebuild that happens to
// be byte-identical should still redeploy rather than silently do nothing.
scorm_parse($scorm, true);

$after = $DB->get_record('scorm', ['id' => $scorm->id], '*', MUST_EXIST);
echo "after:    revision={$after->revision} version={$after->version} sha1={$after->sha1hash}\n";

if ($after->version === 'ERROR') {
    fail('Moodle could not parse the manifest -- the activity is now broken, re-upload by hand');
}
if ((int)$after->revision <= $revisionbefore) {
    fail('revision did not advance, so browsers would keep serving the previous build');
}

// Every entry in the zip must have landed in the content area at the same
// size. Comparing against the archive rather than a hardcoded list keeps this
// honest across builds, whose asset filenames change on every content change.
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
    $stored = $fs->get_file($context->id, 'mod_scorm', 'content', 0, $dir, basename($path));
    if ($stored === false) {
        $missing[] = $path;
    } else if ((int)$stored->get_filesize() !== (int)$entry->size) {
        $mismatched[] = sprintf('%s (%d in package, %d stored)', $path, $entry->size, $stored->get_filesize());
    }
}
if ($missing !== [] || $mismatched !== []) {
    foreach ($missing as $path) {
        fwrite(STDERR, "  missing: $path\n");
    }
    foreach ($mismatched as $detail) {
        fwrite(STDERR, "  wrong size: $detail\n");
    }
    fail('the extracted content does not match the package');
}

if ($fs->get_file($context->id, 'mod_scorm', 'content', 0, '/', 'imsmanifest.xml') === false) {
    fail('no imsmanifest.xml in the content area');
}
$launch = $DB->get_record('scorm_scoes', ['id' => $after->launch]);
if ($launch === false) {
    fail("launch sco {$after->launch} does not exist");
}

echo "launch:   sco {$after->launch} -> {$launch->launch}\n";
echo "deployed: $name, $checked file(s) verified against the package\n";
