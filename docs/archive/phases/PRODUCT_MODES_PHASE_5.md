# Product modes Phase 5: Practice Audit and SCORM delivery

## Decision

Phase 5 completes the first approved product-modes release. SimuLedger now
ships:

- Guided and Practice Operations;
- Challenge and Assessment Operations;
- Guided Audit; and
- Practice Audit.

Audit remains a distinct professional activity. Guided and Practice remain
support profiles. The implementation uses one application build, package
generator, configuration resolver, Audit command service, scoring engine, and
report projection.

Audit Challenge and Audit Assessment remain deferred.

## Practice Audit case

`scenario-packs/practice-coffee-audit/simuledger.pack.json` defines one curated
coffee-control review. It presents three supported findings:

1. a recognized transporter produced a valid signature but was not authorized
   to certify quality;
2. a custody transfer attempt lacked the receiver's endorsement and therefore
   remained rejected audit history outside the ledger; and
3. the processor and producer signed different correction proposal digests, so
   no common endorsed correction could commit.

It also presents two defensible decoys:

1. an authorized regulator recall; and
2. a documented 25 kg variance inside an authored 30 kg tolerance.

Practice provides a concise scope, no direct anomaly highlighting, on-request
hints, required evidence and policy citations, immediate finding feedback,
append-only amendments, and a required conclusion. It uses the same
`AUDIT_COFFEE_100@1.0.0` scoring blueprint as Guided Audit.

## Active schema

The pre-release scenario-pack contract was upgraded directly from `1.7.0` to
`1.8.0`. Audit-case schema was upgraded directly from `1.0.0` to `2.0.0`.
There is no migration reader, compatibility alias, or dual-format path.

Audit-case `2.0.0` adds:

- exactly one `GUIDED` or `PRACTICE` support profile;
- scenario-authored hints;
- one saved-draft record;
- a bounded number of finding records;
- UTF-8 byte limits for every persisted text field; and
- evidence- and policy-citation limits.

The validator rejects missing bounds, unknown references, unsupported
profiles, invalid scoring totals, and learner-visible content without complete
English and Vietnamese localization.

## Audit SCORM runtime

Audit packages use application compatibility `ta1-v1` and persistence format
TA1. The compact journal stores replay inputs, not derived events, state,
scores, feedback, or reports.

The ordered journal supports:

```text
view scope
inspect or bookmark evidence
inspect a source record
view an authored hint
save one bounded draft
submit, amend, or withdraw a finding
submit one conclusion
```

Every command is replayed through `AuditHostedRunService` with a fixed clock,
deterministic identifiers, and a trusted SCORM learner context. Live and
resumed attempts therefore regenerate the same:

- accepted Audit events;
- source-ledger projection;
- workpaper state;
- finding feedback;
- score;
- competency evidence; and
- final report.

Rejected source attempts never enter the ledger projection. Learner Audit
actions never mutate the immutable source process.

## Transactional persistence

For each action, the player:

1. constructs the prospective TA1 journal;
2. validates and encodes it;
3. replays it through the Audit service;
4. saves suspend data, location, score, and completion;
5. commits the platform adapter; and
6. only then publishes the new UI state.

An LMS rejection of authoritative suspend-data storage is an error. The UI
does not advance as though an unsaved command had committed.

Exact configuration hash, pack content hash, scenario ID and version, and
Audit case ID and version are compatibility boundaries. Incompatible progress
is not migrated or silently cleared.

## TA1 size budget

TA1 retains one bounded ordered command journal:

| Section | Authored maximum |
|---|---:|
| Identity header | one exact configuration, pack, scenario, and case identity |
| Scope review | 1 record |
| Evidence interactions | 2 per evidence item |
| Source-record inspections | 1 per source record |
| Hints | 1 per authored hint |
| Saved drafts | 1 record |
| Submitted/amended/withdrawn findings | 6 records |
| Conclusion | 1 record |
| Finding title | 48 UTF-8 bytes |
| Finding observation | 120 UTF-8 bytes |
| Finding recommendation | 120 UTF-8 bytes |
| Each conclusion field | 96 UTF-8 bytes |
| Evidence citations per finding | 4 |
| Policy citations per finding | 2 |

Option indexes and compact opcodes replace repeated authored identifiers.
Duplicate interactions and excess records are rejected. Learner text is never
silently truncated.

The actual worst-case Guided and Practice journals are tested with every
permitted record and maximum-length incompressible strings. The measured
maximum is 3,290 characters. The regression budget is 3,300 characters and the
hard internal ceiling remains 3,800, leaving 500 characters of budget margin
and 796 characters below the SCORM 1.2 field limit.

## Package generation and verification

The generator builds the application once and emits six packages:

```text
guided
practice
challenge
assessment
audit-guided
audit-practice
```

Audit packages add external `audit-scenario-pack.json` and omit
Operations-only scenario, variant, media, identity, key, authorization, and
endorsement files. Runtime content remains outside the JavaScript bundle.

The verifier checks:

- manifest title, launch, mastery score, and inventory;
- exact embedded configuration;
- Audit pack byte hash and immutable content hash;
- scenario and case identity;
- TA1 metadata and authored bounds;
- source attempt/ledger separation;
- absence of Operations-only runtime files from Audit packages;
- absence of educational private keys from learner-facing static assets; and
- one identical static application build across all six packages.

The graphical instructor builder selects the same six preset IDs and uses the
same generated package catalogue. It does not contain a second generator.

## Moodle demo boundary

The Docker deployment tooling manages six stable, separately reset activities:

```text
SimuLedger Guided
SimuLedger Practice
SimuLedger Challenge
SimuLedger Assessment
SimuLedger Audit Guided
SimuLedger Audit Practice
```

Its storage acceptance uses SL1-shaped data for Operations and TA1-shaped data
for Audit. Deployment and live Moodle acceptance are operational actions and
are run only when explicitly requested.

## Verification contract

Automated acceptance covers:

- Guided and Practice hosted configuration identity;
- reduced Practice guidance and on-request hints;
- source immutability and rejected-attempt separation;
- exact Audit replay;
- one-record draft and bounded finding history;
- TA1 encode/decode, incompatibility, and worst-case size;
- transactional standalone and SCORM persistence behavior;
- Audit package inventory and hashes;
- shared static application bytes; and
- locale, schema, content, accessibility, build, and package gates.

Real screen-reader review, Vietnamese subject-expert review, and live Moodle
acceptance remain human or operational gates as described in `AGENTS.md`.

## Deferred scope

Phase 5 does not add:

- Audit Challenge;
- Audit Assessment;
- an Audit variant bank;
- new academic points;
- source-ledger mutation from findings;
- unrestricted randomness;
- collaboration;
- AI;
- Merkle trees;
- proof of work;
- cryptocurrency; or
- a separate Audit application or package generator.
