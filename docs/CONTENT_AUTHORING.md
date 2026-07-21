# Content authoring

How to change the activity — or write a completely different one — without
touching the ledger engine, the rule engine, or any React component.

Everything that makes the coffee activity *the coffee activity* is data in
`src/scenarios/coffee-traceability/`, conforming to the types in
`src/domain/types/scenario.ts`.

---

## The files

| File | What it holds |
|---|---|
| `scenario.ts` | Assembles the whole thing. The object exported here is the activity. |
| `organizations.ts` | Organizations, actors, locations, and who may do what |
| `stages.ts` | The nine stages: titles, roles, required actions, completion conditions, hints, knowledge checks |
| `timeline.ts` | Every scenario timestamp, plus the ordering constraints between them |
| `seed-assets.ts` | Background lots and their provenance |
| `scoring.ts` | Point allocation and the deduction ladder |
| `decisions.ts` | The positional key for the save format |

## Making a change

1. Edit the data.
2. Add any new localization keys to **both** `src/locales/vi.json` and `en.json`.
3. Run `npm run validate:scenario && npm run validate:locales`.
4. Run `npm run quality`.

The validators catch the mistakes that are otherwise invisible: a completion
condition naming an asset no stage creates, a knowledge check missing from the
save format, points that don't sum to 100, a timeline where receipt precedes
dispatch. None of those crash — they produce a stage a learner silently cannot
finish, or an answer that silently isn't saved.

---

## Three rules you cannot break

### 1. `DECISION_IDS` and `HINT_IDS` are append-only

The save format stores a learner's answers by their **index** in these arrays,
never by name. That is what keeps a full attempt under 300 characters instead of
several thousand — and SCORM 1.2 gives us 4096 characters, total.

Reordering or deleting an entry silently reinterprets the saved progress of
every learner mid-attempt. Their stage 6 answer becomes their stage 4 answer.

Appending is safe. Anything else needs a schema version bump and a migration.

The same applies to `SCENARIO_STAGE_ORDER` in `src/domain/types/enums.ts`.

### 2. Every knowledge check must appear in `DECISION_IDS`

Otherwise the answer is collected, displayed, scored — and then lost on resume,
because the save format has no slot for it. The validator makes this an error.

### 3. No learner-facing text outside `src/locales/`

Scenario files hold *keys*, never sentences. `npm run validate:locales` fails
the build if Vietnamese appears anywhere in `src/` outside the locale files.

The exception is ledger data — `productName`, `originLocation` — which is
deliberately not translated. A ledger value must not change when the interface
language changes, or the hash would change with it.

---

## Common edits

**Change how long a stage takes to unlock**
Edit `completionConditions` in `stages.ts`. The available shapes are
`TRANSACTION_COMMITTED`, `KNOWLEDGE_CHECK_ANSWERED`, `ASSET_EXISTS`,
`ASSET_LIFECYCLE_STATUS`, and `DECISION_RECORDED`.

**Add a knowledge check**
Add it to a stage's `knowledgeChecks`, add its id to the **end** of
`DECISION_IDS`, and add the question, options and feedback keys to both locales.
Set `isScored: false` for anything diagnostic — section 8.1 of the specification
requires the orientation question be unscored, because penalising a starting
assumption teaches defensive guessing rather than honest self-assessment.

**Change the passing score or point allocation**
`scoring.ts`. Component points must sum to `maxScore`; the validator checks it.

**Move a date**
`timeline.ts`. Add an ordering constraint alongside it — the constraints are
what stop a scenario shipping with receipt before dispatch.

**Add a stage**
Add it to `ScenarioStageId` and `SCENARIO_STAGE_ORDER` (append only), add a
`ScenarioStageDefinition` to `stages.ts`, and register a component in
`src/features/stage-registry.ts`. Set `isImplemented: false` until the component
exists; the router shows a placeholder and the learner's progress still saves.

---

## Writing a different scenario

Say mango cold-chain traceability.

1. Create `src/scenarios/mango-cold-chain/` with the same file set.
2. Export a `ScenarioDefinition`.
3. Change the prop at the application root:
   ```tsx
   <ScenarioProvider scenario={mangoScenario}>
   ```

What you do **not** touch: the ledger engine, the rule engine, the hashing, the
state codec, the SCORM adapter, or any component. `validateScenario` runs
against your scenario at startup exactly as it does against the coffee one.

What you *will* need to extend, if your domain differs: `AssetType`,
`TransactionType` and its event mapping, and any validation rules specific to
your product. Those live in `src/domain/` because they are engine concerns, not
content — a cold chain has temperature-excursion rules that coffee does not.

---

## What the stage component still owns

The registry maps a stage to a React component. The component decides layout and
interaction; the scenario decides everything else — order, title, active role,
what must happen, what counts as done.

If you find yourself hard-coding a batch identifier, a date, a role, or a
Vietnamese sentence inside a component, it belongs in the scenario instead.
