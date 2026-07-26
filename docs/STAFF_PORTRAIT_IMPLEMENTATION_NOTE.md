# Scenario-driven staff portraits and role presence

## Status

Implemented for the versioned coffee Guided, Challenge, and Assessment
scenarios, the hosted learner workspace, historical instructor replay, and
scenario-author preview. The active coffee scenario is `2.3.0`; Challenge A is
`1.2.0`; the hosted coffee pack is `1.11.0` with scenario `1.9.0`.

## Why the feature is bounded

The portraits help a learner recognize which professional and organization are
present at a consequential point. They are contextual evidence, not decoration
spread across the product. The first release therefore places identity only
where a role, evidence source, or trusted handoff matters:

- Stage 2: farm production manager;
- Stage 3: certification officer;
- Stage 4: producer-to-logistics custody handoff;
- Stage 5: receiving manager plus the clerk who prepared the manifest;
- Stage 9: retailer context and the regulator after the authored handoff;
- hosted learner run: the role reconstructed from the exact scenario version;
- instructor replay: the historical professional identity for the replayed
  node.

The orientation, routine knowledge checks, ledger rows, generic report tables,
final causal report, instructor lists, and administration screens deliberately
have no portrait. The final report is not a staff gallery.

## Model and trust boundary

`ScenarioStaffProfile` links a fictional person to an existing actor, role,
organization, optional location, localized text, and one approved portrait
asset. `ScenarioPortraitAsset` records source type, approval reference,
fictional status, local path, SHA-256, dimensions, format, and placeholder
status. Evidence attribution is a separate scenario relationship.

The visible human profile never supplies trusted command metadata. The
orchestrator still derives actor, organization, and role from the scenario's
active trusted context. Signature validity, key identity, authorization, and
endorsement remain in the cryptographic evidence components. A portrait is not
proof of any of them.

## Runtime and package integrity

Portraits live under `media/staff/` and are copied into the offline build.
`media-manifest.json` binds the selected scenario to the exact set of portrait
paths and digests. SCORM generation verifies source bytes before packaging;
the parameterized verifier checks:

- scenario and media-manifest identity;
- safe local paths with no external URL or parent traversal;
- approved fictional source and non-placeholder status;
- exact file presence and SHA-256;
- WebP encoding and intrinsic dimensions;
- staff-to-asset and evidence-to-staff references;
- bilingual localization keys.

Portraits are scenario runtime content and are excluded from the static
application hash. Guided and Challenge can therefore carry different versioned
media while reusing identical JavaScript and CSS.

The seven optimized runtime images total 172,658 bytes. Against the immediately
preceding local non-release packages, the complete ZIP grew by 182,179 bytes
for Guided, 182,215 bytes for Challenge, and 182,194 bytes for Assessment
(177.9 KiB, or 17.8%, in each case). The new non-release packages are
approximately 1.204 MB each. These measurements include the profile schema,
media manifest, package metadata, styles, and images; they are development
comparisons rather than final release hashes.

## Accessibility and failure behavior

The adjacent text supplies the person's name, role, organization, and, where
appropriate, responsibility. The image is decorative in that context and uses
an empty alternative string, preventing duplicate announcements. Cards use a
logical document order and status meaning remains textual.

Intrinsic width and height reserve layout space. At narrow widths, the card and
handoff stack without hiding controls. If an image fails at runtime, an
initials tile replaces it while the full textual identity remains present.
Development logs the missing path; package verification treats a missing file
as a build failure.

## Authoring and replacement

The hosted author preview exposes the scenario's approved staff roster and
local asset choices. It does not accept arbitrary URLs or perform image
generation/editing. Replacing a portrait requires a new approved asset digest
and a scenario-version update. Asset provenance and the initial visual briefs
are recorded in [STAFF_PORTRAIT_ASSET_BRIEFS.md](STAFF_PORTRAIT_ASSET_BRIEFS.md).

The learner start screen contains one bilingual disclosure that the people and
images are fictional and do not represent real employees.
