export const NON_RELEASE_FILENAME_SUFFIX = "_NON_RELEASE";

/** Release classification kept separate so the dirty-tree contract is testable. */
export function classifyPackageBuild({ dirty, allowDirty }) {
  if (dirty && !allowDirty) {
    throw new Error(
      "Release packaging requires a clean working tree. Commit or stash all " +
        "changes, or pass --allow-dirty for explicitly non-release local output.",
    );
  }
  return {
    releaseBuild: !allowDirty && !dirty,
    reproducibleSource: !allowDirty && !dirty,
  };
}

/** Make local-development archives impossible to mistake for release output. */
export function classifyPackageFileName(releaseFileName, releaseBuild) {
  if (!releaseFileName.endsWith(".zip")) {
    throw new Error("SCORM package filename must end in .zip");
  }
  return releaseBuild
    ? releaseFileName
    : `${releaseFileName.slice(0, -4)}${NON_RELEASE_FILENAME_SUFFIX}.zip`;
}
