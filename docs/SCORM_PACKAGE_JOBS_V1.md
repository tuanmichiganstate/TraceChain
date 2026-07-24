# Hosted SCORM package jobs V1

## Boundary

The `/instructor` graphical builder exposes only the accepted `guided` and
`challenge` presets. It does not reimplement the Node package generator.

One site build:

1. builds the static application once;
2. invokes the existing multi-preset SCORM generator;
3. verifies both ZIPs and their shared application digest;
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

Guided and Challenge entries must carry the same static application-build hash.
Their external runtime configuration and scenario files differ intentionally.

Local dirty builds remain non-release artifacts and retain the
`_NON_RELEASE` filename suffix. The hosted flow does not convert them into
release artifacts.

## Current presets

Guided and Challenge are available because both have accepted content and
existing SCORM verification. Assessment and Technical Laboratory remain
hidden until their separate content is complete and accepted. No empty or
placeholder package is generated.
