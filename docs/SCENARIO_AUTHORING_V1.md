# Scenario authoring V1

## Scope

The authenticated `/author` workspace is the Phase 6 authoring boundary. It
uses the same `ScenarioPackV1`, validator, content hash, and D1 repository as
the command-line validator and hosted run APIs.

The first release supports:

- JSON, YAML, and bounded ZIP import;
- a built-in pharmaceutical cold-chain starter;
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

The standard coffee compatibility pack continues to use the application
catalogues. This preserves the existing SCORM localization contract while
allowing new disciplinary authoring packs to be self-contained.

## Starter pack

`scenario-packs/pharmaceutical-cold-chain/tracechain.pack.json` is a small,
fully validated authoring starter. It proves:

- a disciplinary competency namespace (`PHARMA.COLD_CHAIN`);
- embedded English and Vietnamese catalogues;
- evidence visibility by role;
- four hosted mode configurations;
- a deterministic weighted outcome model;
- one structured decision, rubric, and evidence rule; and
- a complete, reachable workflow.

The starter is intentionally not advertised as a production hosted run. The
current authoritative hosted command adapter implements the complete coffee
journey. Publishing another pack is supported; assigning it requires a
compatible hosted runtime adapter.

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
