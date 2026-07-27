# Hosted SCORM package jobs V1

## Boundary

The `/instructor` graphical builder exposes all nine accepted Operations,
Audit, and Technical Laboratory presets. Instructors select professional
activity, support profile, delivery purpose, and outcome strategy; the
interface resolves only a complete accepted preset and previews its feedback,
hints, exact content, scoring, and grade use. Audit Challenge and Audit
Assessment remain visibly labelled calibration candidates. The workspace does
not reimplement the Node package generator.

One site build:

1. builds the static application once;
2. invokes the existing multi-preset SCORM generator;
3. verifies all nine ZIPs and their shared application digest;
4. writes a content-addressed package catalogue; and
5. copies the exact verified ZIP bytes into the hosted static artifact set.

The worker reads that catalogue, verifies size and SHA-256 again, stores the
exact bytes in the `ARTIFACTS` R2 binding, and records an idempotent completed
job in D1. It never assembles a ZIP in the request path.

## API

All paths use `/api/v1`.

| Method and path | Role | Result |
|---|---|---|
| `GET /scorm-package-jobs` | instructor or administrator | Jobs created by that user; administrators may inspect all |
| `POST /scorm-package-jobs` | instructor or administrator | Idempotently materialize one accepted preset artifact |
| `GET /scorm-package-jobs/:jobId` | owner or administrator | Exact job metadata and download URL |
| `GET /scorm-package-jobs/:jobId/download` | owner or administrator | Exact verified ZIP bytes |

The request contains a bounded command ID, job ID, and preset ID. Configuration
and scenario identity come from the generated catalogue, not learner or
instructor claims.

## Identity and integrity

Each job records:

- generator schema version;
- preset, title, scenario ID, and scenario version;
- configuration hash;
- source commit and deterministic generated timestamp;
- release and dirty status;
- static application-build hash;
- ZIP filename, size, and SHA-256; and
- the content-addressed object key.

All nine entries must carry the same static
application-build hash. Their external runtime configuration and content files
differ intentionally.

Local dirty builds remain non-release artifacts and retain the
`_NON_RELEASE` filename suffix. The hosted flow does not convert them into
release artifacts.

## Current presets

Guided, Practice, Challenge, Assessment, Audit Guided, Audit Practice, Audit
Challenge, Audit Assessment, and Technical Laboratory are available in the
graphical workspace.
Operations Practice uses one curated bridge case. Audit Practice uses one
curated, reduced-guidance workpaper case. Audit Challenge and Assessment carry
an explicit calibration warning; exposing their package artifacts is not an
expert-equivalence or high-stakes-use claim. Technical Laboratory resolves to
the fixed Permissioned Blockchain Foundations tutorial and its separate
40/40/20 scoring contract. No empty or placeholder package is generated.
