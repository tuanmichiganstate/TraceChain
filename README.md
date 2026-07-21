# TraceChain

A simulated permissioned blockchain for teaching supply-chain traceability,
delivered as a self-contained SCORM 1.2 package for Moodle.

Learners follow a batch of Arabica coffee from a Lâm Đồng co-operative to a
retail shelf, and then through a recall investigation — creating assets,
transferring custody and ownership separately, anchoring documents off-chain,
correcting a committed error without deleting it, transforming and packaging,
and tracing provenance forwards and backwards.

The learner interface is **Vietnamese**. All code, identifiers, comments, tests
and documentation are **English**.

**It is a simulation.** No blockchain node, no network, no cryptocurrency, no
mining. The interface says so on every screen.

---

## Status

Milestones 0 and 1 complete: the SCORM vertical slice, and the scenario
foundation.

| | |
|---|---|
| Stages playable | 1–2 of 9 (all nine declared as data) |
| Tests | 200 passing |
| SCORM package | builds and verifies (18/18 checks) |
| Scenario | validated at build time and startup (192 checks) |
| Moodle staging | **not yet tested — this is the next step** |

Milestone 0 retired the deployment unknowns before the expensive build started:
the `suspend_data` budget, the API discovery paths, the status vocabulary, and
the review-mode score-clobbering risk.

Milestone 1 made the activity data. Stage order, roles, completion conditions,
knowledge checks, hints, seeds and scoring all live in a `ScenarioDefinition`;
routing reads from it rather than from a switch statement. A second scenario is
a new data file and one changed prop — see `docs/CONTENT_AUTHORING.md`.

See `docs/MOODLE_TESTING.md` for the acceptance checklist to run now.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm run quality      # lint, typecheck, test, validators, build, package, verify
```

`npm run quality` must pass before any commit.

## Building the SCORM package

```bash
npm run build && npm run build:scorm && npm run verify:scorm
```

Produces `tracechain-scorm-v1.0.0.zip`. Upload it to Moodle as a SCORM package
activity — see `docs/MOODLE_TESTING.md` for the recommended settings.

## Developer mode

Append `?debug=true` to show a diagnostics panel: platform mode, current stage,
block count, and every SCORM diagnostic collected. It never alters scoring or
domain behaviour, and is never visible to an ordinary learner.

---

## Layout

```
src/
├── domain/            pure, synchronous, no React
│   ├── commands/      learner intent
│   ├── events/        committed outcomes
│   ├── ledger/        reducer, engine, integrity verification
│   ├── rules/         one file per rule + registry
│   ├── scenario/      scenario validation
│   ├── units/         gram normalization
│   └── types/         enums, models, rule ids, scenario schema, scoring
├── infrastructure/
│   ├── hashing/       vendored SHA-256, canonical serialization
│   ├── persistence/   compact state codec, standalone adapter
│   ├── scorm/         API discovery, SCORM 1.2 adapter
│   └── time/          deterministic scenario clock
├── scenarios/coffee-traceability/
├── features/          one folder per stage + the stage registry
├── components/        shared UI
├── locales/           vi.json (production), en.json (scaffold)
└── styles/

test/
├── scorm-mock/        strict in-memory SCORM 1.2 API
└── support/           domain fixtures

scripts/               locale + scenario validators, SCORM build + verify
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Static production build |
| `npm test` | Unit, component and integration tests |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm run validate:locales` | Key parity, placeholders, no stray Vietnamese in source |
| `npm run validate:scenario` | Timeline ordering, referential integrity, ID conventions |
| `npm run build:scorm` | Assemble and zip the package |
| `npm run verify:scorm` | 18 checks on the built package |
| `npm run quality` | All of the above, in order |

## Documentation

- `docs/ARCHITECTURE.md` — layering, invariants, and every deviation from the
  specification with its reasoning
- `docs/DOMAIN_MODEL.md` — entities, the transaction lifecycle, hashing, time
- `docs/SCENARIO_FLOW.md` — the nine stages and the two non-obvious design calls
- `docs/CONTENT_AUTHORING.md` — changing the activity, or writing a new one
- `docs/LOCALIZATION_GUIDE.md` — Vietnamese conventions and the audit rules
- `docs/MOODLE_TESTING.md` — the Moodle acceptance checklist
- `CHANGELOG.md`

## Constraints worth knowing before you change anything

- **`DECISION_IDS` and `HINT_IDS` are append-only.** The compact state codec
  stores decisions by index, not by name. Reordering silently reinterprets every
  learner's saved progress.
- **`SCENARIO_STAGE_ORDER` is append-only** for the same reason.
- **Every knowledge check must appear in `DECISION_IDS`**, or its answer is
  collected, scored, and then silently lost on resume.
- **No learner-facing string may live outside `src/locales/`.**
  `validate:locales` fails the build otherwise.
- **No student identity may reach the ledger** — not an asset, transaction,
  block, hash, or suspend-data value.
- **`cmi.suspend_data` is capped at 4096 characters.** A test asserts a
  worst-case attempt stays under 3800.
