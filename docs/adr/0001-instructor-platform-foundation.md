# ADR 0001: Instructor-platform foundation

Status: superseded by the native-runtime pre-release policy
Date: 24 July 2026

Post-decision implementation note: cryptographic endorsement Increment B was
subsequently completed for the Guided and Challenge SCORM engine. The original
decision below records the foundation baseline and prevented the platform work
from claiming that capability before its acceptance gate was met.

## Context

The instructor-ready roadmap expands SimuLedger from portable learner packages
to a hosted, authenticated, server-authoritative platform. The repository audit
found a mature browser/SCORM simulation core, no application backend or
database, and an existing Cloudflare Sites project.

The roadmap recommends PostgreSQL unless the repository provides a stronger
deployment fit. It also states that real endorsement policies are complete,
although the repository currently implements real signatures and authorization
only.

## Decisions

### Use the existing Sites deployment for the first hosted vertical slice

The first structured persistence adapter will use D1 behind repository ports.
R2 will be introduced only when evidence uploads or generated export files need
blob storage.

The domain and application services will not import D1 types. A future
PostgreSQL adapter can implement the same repository and event-store ports.

### Register the current engine as a native runtime profile

The working coffee command, event, ledger, scoring, and replay services remain
authoritative for the coffee experience. A versioned scenario-pack envelope
selects the registered native coffee runtime profile.

Generic nodes are added for new packs. Coffee rules are not copied into a new
generic implementation merely to satisfy a folder structure.

### Keep delivery presets and hosted run behavior distinct

`guided`, `challenge`, `assessment`, and `technical-lab` remain package
delivery modes. Hosted runs add `tutorial`, `standard`, `sandbox`, and
`configured` behavior as a separate configuration field.

This avoids reinterpreting existing package configuration and SL1 state.

### Treat the server as authoritative only for hosted runs

Hosted actual state remains server-side and learner APIs receive role-filtered
projections. SCORM remains an offline, client-executed package. SCORM content
must not promise that bundled hidden facts are secret.

### Do not claim endorsement completion

System-generated simulated endorsement results remain accurately labelled and
do not satisfy cryptographic endorsement requirements. The approved
endorsement Increment B remains a Phase 3 prerequisite.

### Do not implement application passwords

The hosted architecture uses deployment-provided authenticated identity or an
institutional managed identity provider. Application-role authorization is
server-side. SimuLedger will not implement password storage.

## Consequences

- The first hosted deployment is aligned with the repository's connected
  hosting environment.
- Storage services remain portable, while the current fresh-install SQL schema
  targets D1.
- Coffee functionality stays stable while the platform schema evolves.
- New packs can use generic nodes while coffee remains a first-class native
  runtime profile.
- Hosted and SCORM security claims remain honest.
- Phase 3 cannot be marked complete until real endorsement policies pass their
  existing acceptance plan.
