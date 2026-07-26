# Scenario authoring V1

## Scope

The authenticated `/author` workspace is the Phase 6 authoring boundary. It
uses the same `ScenarioPackV1`, validator, content hash, and D1 repository as
the command-line validator and hosted run APIs.

The first release supports:

- JSON, YAML, and bounded ZIP import;
- a built-in pharmaceutical cold-chain starter and transfer case;
- editing draft identity, bilingual titles, and workflow destinations;
- path-specific schema and semantic validation;
- deterministic role-and-mode preview;
- exact-version comparison;
- immutable publication; and
- retirement metadata that does not alter published content.

It deliberately does not contain arbitrary expressions, uploaded executable
code, a generic policy language editor, collaborative authoring, or a second
scenario format.

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

## Starter pack

`scenario-packs/pharmaceutical-cold-chain/tracechain.pack.json` is a
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
temperature excursion. After calibration and stability evidence is released,
they choose a proportionate disposition. Both submissions capture bounded
evidence citations, a policy citation, confidence, and an adverse-event risk
estimate. The case has its own rubric and declarative evidence rules.

Course and program outcome mappings deliberately do not live in this pack.
The repository's independent demonstration overlays reference the pack's exact
`PHARMA_COLD_CHAIN` framework version and remain owned, adopted, validated, and
versioned separately. They do not calculate attainment or add another score.

The starter was the first scenario exercised by the generic hosted
runtime. Once published, it can be assigned and completed through its authored
`BRIEFING`, `EVIDENCE_RELEASE`, `DECISION`, `CONSEQUENCE`, `FEEDBACK`, and
`COMPLETION` nodes. The runtime uses the pack's embedded localization,
role-visible evidence, mode configuration, deterministic outcome model,
decision schema, evidence rule, and rubric references. Consequences are shown
as part of the run; authored feedback follows the assignment's existing
instructor-release boundary. The complete coffee journey uses its registered
native `tracechain-coffee-v2` runtime profile.

These are deliberately bounded runtime contracts, not a claim that every V1
node type is executable. A scenario is assignable through the generic runtime
only when it has no native domain runtime profile and every node belongs to the
six-node subset above. Its transitions must use `ALWAYS` or
`DECISION_OPTION_SELECTED`; policy-result and event-history transitions are not
yet part of this runtime. Unsupported nodes or transitions remain valid
authoring content but are excluded from assignment options until their runtime
behavior exists.

## Import safety

The browser accepts at most 2 MiB before and after ZIP expansion. A ZIP must
contain an unambiguous `tracechain.pack.json` or one unambiguous JSON/YAML
candidate. The validator rejects executable property names, invalid
references, unreachable nodes, dead ends, localization gaps, unsupported
modes, and nondeterministic outcome configuration.

Imported drafts remain mutable. Publication creates a deterministic content
hash and makes that exact version immutable. Retirement changes repository
metadata only; existing assignments and replay retain the original content.

## Repository validation

```bash
npm run validate:platform-pack
```

With no arguments, the command recursively validates every
`scenario-packs/**/tracechain.pack.json`. A path may be supplied to validate
one candidate.
