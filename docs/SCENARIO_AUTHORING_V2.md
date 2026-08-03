# Scenario authoring V2

## Scope

The authenticated `/author` workspace is the scenario-authoring boundary. It
uses the same `ScenarioPackV2`, validator, content hash, and D1 repository as
the command-line validator and hosted run APIs.

The first release supports:

- an eight-step no-code Scenario Builder using the canonical pack contract;
- JSON and YAML manifest import plus complete bounded scenario-bundle import;
- a built-in pharmaceutical cold-chain starter and transfer case;
- bilingual pack and scenario identity;
- delivery-mode, deterministic outcome, participant, role, and initial-state
  configuration;
- policies, evidence, instructor incidents, all workflow node types,
  transitions, competencies, rubrics, and evidence-rule configuration;
- structured advanced editing for optional pack and scenario sections;
- path-specific schema and semantic validation;
- deterministic role-and-mode preview;
- upload, rights documentation, bilingual alternative text, preview, and
  assignment of approved staff, scene, and evidence images;
- deterministic, self-contained scenario-bundle ZIP export;
- exact-version comparison;
- immutable publication; and
- retirement metadata that does not alter published content.

It deliberately does not contain arbitrary expressions, uploaded executable
code, collaborative authoring, or a second scenario format. Specialized
runtime bindings and Audit contracts remain optional advanced sections; the
Audit starter supplies their complete schema-shaped examples.

## Scenario Builder

The builder edits `ScenarioPackV2` directly. It does not translate a simpler
wizard format into the pack later and does not create a parallel runtime. Its
eight steps are:

1. identity and bilingual description;
2. delivery modes and deterministic outcome models;
3. organizations, trusted roles, and actual, business, ledger, and information
   state;
4. approved media, provenance, rights, bilingual alternative text, and image
   assignment;
5. policies, evidence metadata and content, and instructor incidents;
6. the complete workflow-node union and conditional transitions;
7. competency targets, frameworks, analytic rubrics, and automated evidence
   rules; and
8. localization, reachability, coverage, and advanced schema review.

Authors may add, remove, and reorder workflow content without writing source
code. New nodes enter the simple path before completion, while authors retain
explicit control of every transition. Fixed delivery modes bind visibly to an
outcome model and authored outcome code. Assessment definitions use dedicated
competency, indicator, rubric, criterion, and evidence-rule forms rather than
schema-shaped value editors.

The review step runs the complete scenario-pack validator locally and reports
each failing path and rule before import. The server repeats the same validator
as the enforcement boundary, so a changed or stale client draft cannot bypass
referential-integrity, execution-path, localization, scoring, or publication
checks.

## Portable localization

A pack may define:

```json
{
  "supportedLocales": ["en", "vi"],
  "localizationCatalogs": {
    "en": {
      "example.title": "Example"
    },
    "vi": {
      "example.title": "Ví dụ"
    }
  }
}
```

Every supported locale must have a catalogue. Keys must use the same bounded
identifier form as application catalogue keys, and every value must be a
non-empty string. Embedded values are part of the immutable pack content hash.
They override application catalogue values only for that pack preview.

The standard coffee native pack uses the application catalogues. This preserves
the existing SCORM localization contract while
allowing new disciplinary authoring packs to be self-contained.

## Image authoring

The Media step accepts bounded WebP, PNG, and JPEG uploads. SimuLedger inspects
the actual bytes, derives the SHA-256 digest, dimensions, byte length, MIME
type, and content-addressed package path, and stores the bytes outside the
JavaScript bundle. The author must select the image purpose and source type,
declare how identifiable people are handled, record a licence or approval
reference, and provide alternative text for every supported locale.

The pack-level `imageAssets` registry supports three purposes:

```text
STAFF_PORTRAIT
SCENE_ILLUSTRATION
EVIDENCE_IMAGE
```

Staff profiles may select only staff portraits, workflow nodes may select only
scene illustrations, and evidence records may select only evidence images.
The Builder previews the media library and prevents deletion while an asset is
referenced. It accepts no remote image URL and never trusts author-entered
dimensions, MIME types, or digests.

Human presence is presentation data. It does not modify the active trusted
role, cryptographic signer, authorization result, or endorsement policy. A
scene image does not reveal hidden state. An evidence image is projected only
when the evidence itself is released and appears only after the learner
inspects that record. A published replacement requires a new versioned pack
rather than mutating an existing historical run.

## Starter pack

`scenario-packs/pharmaceutical-cold-chain/simuledger.pack.json` is a
self-contained, fully validated disciplinary pack. Its starter proves:

- a disciplinary competency namespace (`PHARMA.COLD_CHAIN`);
- embedded English and Vietnamese catalogues;
- evidence visibility by role;
- four hosted mode configurations;
- a deterministic weighted outcome model;
- one structured decision, rubric, and evidence rule; and
- a complete, reachable workflow.

The second scenario, `SCN_PHARMA_COLD_CHAIN_TRANSFER`, adds a two-decision
transfer case without adding a domain adapter. Learners first decide whether
an intact signed custody record is enough to release a vaccine shipment with a
temperature excursion. The calibration record is then released, while the
manufacturer's stability assessment is available only through the bounded
evidence-request workflow. The request records a 45-minute simulated delay and
two cost units before the learner chooses a proportionate disposition. Both
decision submissions capture bounded evidence citations, a consulted-policy
citation, confidence, and an adverse-event risk estimate. The learner must
consult the investigation rule before the triage decision and the disposition
rule before the final decision; those append-only events become process
evidence without changing the score. Released records expose only their
learner-visible attributes until a contextual inspection is durably recorded;
only inspected records may then be cited. The case has its own rubric and
declarative evidence rules.

Course and program outcome mappings deliberately do not live in this pack.
The repository's independent demonstration overlays reference the pack's exact
`PHARMA_COLD_CHAIN` framework version and remain owned, adopted, validated, and
versioned separately. They do not calculate attainment or add another score.

The starter was the first scenario exercised by the generic hosted runtime.
Published scenarios without a native profile can now be assigned and completed
through the complete Builder vocabulary: `BRIEFING`, `EVIDENCE_RELEASE`,
`DECISION`, `TRANSACTION_PROPOSAL`, `ENDORSEMENT`, `POLICY_CHECK`,
`COMMUNICATION`, `STOCHASTIC_EVENT`, `CONSEQUENCE`, `FEEDBACK`, `REFLECTION`,
and `COMPLETION`. All four declarative transition conditions are executable.
The runtime uses the pack's embedded localization, role-visible evidence, mode
configuration, deterministic outcome model, decision schema, evidence rule,
and rubric references. Consequences are shown as part of the run; authored
feedback follows the assignment's existing instructor-release boundary. The
complete coffee journey still uses its registered native
`simuledger-coffee-v2` runtime profile.

Every supported hosted mode is resolved into its complete experience
configuration during author validation and again before publication. In
particular, the generic `standard` mode is an assessment profile and therefore
requires final feedback and disabled hints. The Builder supplies compatible
defaults. A mode that cannot resolve is reported against its exact
`modeConfigurations` entry and cannot be newly published. The instructor
catalogue independently resolves each mode so one incompatible definition
cannot hide another mode that remains runnable.

Generic transaction proposals bind the exact source decision, run, scenario,
policy references, trusted organization and role, and current run version in a
canonical SHA-256 digest. They do not mutate the ledger. An `ENDORSEMENT` node
records a scenario-controlled organizational approval after handing execution
to the first authored permitted role; it is explicitly not represented as a
cryptographic signature. Scenarios that teach genuine Ed25519 evidence must
use a native signing runtime and its educational identity fixtures.

`POLICY_CHECK` is passive and deterministic. It evaluates proposal presence,
the proposal's policy references, every matching authored endorsement node,
and these optional declarative policy-configuration fields:

```text
result
requiredDecisionOptionIds
prohibitedDecisionOptionIds
minimumEndorsements
requiredEndorsementRoleIds
requiredPolicyConsultation
authorizedRoleId
authorizedOrganizationId
```

Authorization policies fail closed when they do not declare a supported
trusted role or organization. `STOCHASTIC_EVENT` nodes use a named seeded draw;
the same source inputs reproduce the same outcome and event hash.
`COMMUNICATION` acknowledges an authored role-visible message, and
`REFLECTION` stores one bounded response. Policy and stochastic nodes advance
inside the same prospective durable event batch. No advanced generic node
silently changes ledger state.

## Import, export, and bundle safety

A JSON or YAML import is a manifest-only authoring input and is limited to
2 MiB. A ZIP import is a canonical scenario bundle: it contains exactly one
root `simuledger.pack.json` plus every byte named by `assetHashes`. A bundle is
limited to 30 MiB compressed and expanded, each image to 5 MiB, the image
collection to 25 MiB, and the pack to 60 images. Paths are relative, bounded,
and cannot contain parent traversal, absolute paths, schemes, or backslashes.

For every bundle image, import recomputes and verifies the image format,
dimensions, byte length, MIME type, and SHA-256 digest. Missing, undeclared,
malformed, or mismatched assets fail the complete import; learner data is
never silently truncated. Export produces the same canonical structure with
sorted entries and normalized ZIP timestamps, so identical pack content and
image bytes produce byte-identical ZIPs.

The validator also rejects executable property names, invalid references,
unreachable nodes, dead ends, localization gaps, unsupported modes, and
nondeterministic outcome configuration.

Imported drafts remain mutable. Publication creates a deterministic content
hash and makes that exact version immutable. Retirement changes repository
metadata only; existing assignments and replay retain the original content.

The scenario-bundle ZIP is hosted-platform content, not a SCORM package. It is
ready to import into another SimuLedger Scenario Author workspace. SCORM
generation remains a separate packaging workflow.

## Repository validation

```bash
npm run validate:platform-pack
```

With no arguments, the command recursively validates every
`scenario-packs/**/simuledger.pack.json`. A path may be supplied to validate
one candidate.
