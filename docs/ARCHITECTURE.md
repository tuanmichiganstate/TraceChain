# Architecture

## Layering

```
Presentation (React)
    ↓  commands only, never direct state mutation
Application services (session reducer, providers)
    ↓
Domain model and rule engine          ← pure, synchronous, no React
    ↓
Ledger adapter (SimulatedLedger)      ← the seam for Tier 2 and Tier 3
    ↓
Persistence adapter
    ↓
SCORM 1.2 / standalone storage
```

## Invariants

These are load-bearing. Breaking one breaks replay, testing, or both.

**The domain reducer is pure and synchronous.** `reduce(state, event) => state`
never hashes, never reads a clock, never imports React. This is why attempt
replay is deterministic and why every domain test is a plain function call.

**Hashes are metadata, never inputs to state transitions.** They are computed
*after* the reducer runs, at the ledger commit boundary, behind an injected
`HashFunction`. Nothing in the reducer depends on a digest.

**Time comes from the scenario clock, never the system clock.** Domain events
take their timestamps from `SCENARIO_TIMELINE`. A learner in Hanoi and a
learner in Berlin produce byte-identical hashes. System time is used only for
SCORM session time and elapsed-time analytics.

**Nothing is persisted that can be recomputed.** No asset snapshots, no
transaction bodies, no hashes, no blocks. Only the learner's decisions.

**Components depend on the adapter interface, not on arrays.** That is what
lets `ServerLedgerAdapter` and `FabricLedgerAdapter` drop in later.

---

## Deviations from the specification

Each of these is deliberate. The reasoning is recorded so a future maintainer
can re-litigate it with the facts rather than guess.

### 1. Vendored synchronous SHA-256 instead of `crypto.subtle` (§15.1)

`crypto.subtle.digest` was rejected for two reasons:

- It is **asynchronous**. Hashing is reachable from the commit path, from replay
  on load, and from integrity verification. Making it async forces `await`
  through all of those and into every test, for no behavioural gain.
- It is **undefined outside a secure context**. A Moodle instance served over
  plain HTTP — common on university intranets — would lose the entire ledger
  with no recovery path, and §15.1 forbids shipping the fallback in production.

`src/infrastructure/hashing/sha256.ts` produces byte-identical output and is
verified against the published FIPS 180-4 vectors *and* differentially against
Node's OpenSSL-backed implementation across block boundaries and multi-byte
UTF-8. `TextEncoder`, unlike `crypto.subtle`, has no secure-context requirement.

### 2. Nine stages instead of ten (§8)

Original stages 4 and 5 are merged into `STG_04_SHIP_AND_MONITOR`. Both are
logistics, and the custody handoff *is* the moment transport begins. All twelve
learning objectives in §2.2 survive; what was cut is repetition, to protect the
30–45 minute budget in §2.4.

### 3. `ORDERED` and `COMMITTED` given distinct meanings (§12, §15.6)

The specification left these in conflict: `STAGE_BOUNDARY` commit mode means
blocks form when a stage ends, yet §8.2 says the first transaction's commit
creates block 1 immediately. And `maxTransactionsPerBlock: 2` had no stated
flush algorithm for a stage emitting three or more transactions.

- `ORDERED` — accepted by the ordering service, in the pending queue. The event
  has been applied to world state, because the outcome is already determined.
- `COMMITTED` — sealed into a block, hash-linked to its predecessor.

At a stage boundary the queue drains into blocks of at most
`maxTransactionsPerBlock`, in order. Stage 2 seals immediately, because watching
a block form is that stage's entire purpose. The pending queue is shown to the
learner rather than hidden — ordering and commitment really are separate steps.

### 4. `VERIFY_PRODUCT` removed from `TransactionType` (§11)

Reading the ledger is a query, not a state change. Writing a transaction per
consumer scan had no corresponding past-tense event in §11, contradicted the
data-governance lesson in §25, and would pollute the ledger the learner is about
to inspect. Stage 8 verification is a read-only projection.

### 5. `learnerReference` not persisted (§21.3)

`hash(studentId + attemptId + scenarioId)` is a pseudonym, not anonymization —
student IDs are low-entropy and brute-forcible — and the LMS already knows
exactly who the learner is. Persisting it would spend 64 of 4096 suspend-data
characters for no benefit. The rule that matters, *no student identity on the
ledger*, is unchanged and is asserted by a test.

### 6. Corrections to blocking defects

| Defect | Correction |
|---|---|
| `RULE_TRANSFORMATION_OUTPUT_NOT_GREATER_THAN_INPUT` compared raw numbers, so packaging 82 KG into 820 UNIT failed (`820 > 82`) and blocked stage 7 | `src/domain/units/convert.ts` normalizes to grams; `packageSizeGrams` added to `SupplyChainAsset` |
| §8.3 named `RULE_AUTHORIZED_CERTIFIER_REQUIRED`, §13.3 named `RULE_CERTIFIER_AUTHORIZED` for the same rule | Kept `RULE_CERTIFIER_AUTHORIZED` |
| §8.4 required rejecting a custody transfer that also moves ownership, but no rule existed to do it | `RULE_OWNERSHIP_UNCHANGED_ON_CUSTODY_TRANSFER` added (implemented in Milestone 2) |
| No `Location` entity despite `currentLocationId` and `RecallLocation` | `Location` model + `LOC_` prefix + five seeded locations |
| No scenario timeline, though three rules depend on ordered times | `src/scenarios/coffee-traceability/timeline.ts`, checked by `npm run validate:scenario` |
| `ScenarioDefinition` had only `seedAssets`, insufficient for the pre-committed dispatch error and for distractor provenance chains | `seedTransactions` planned for Milestone 3; seeds replay through the real pipeline |

### 7. Additions the specification did not require

- **Review-mode guard.** `cmi.core.lesson_mode` and `cmi.core.credit` are read
  at initialization; all writes are suppressed in review or no-credit mode.
  Without this, relaunching a completed activity overwrites a good grade.
- **Mock SCORM API** (`test/scorm-mock/`) enforcing the real 4096-character
  `suspend_data` ceiling, the 255-character `lesson_location` limit, the
  `lesson_status` vocabulary, and the session-time format. A suspend-data
  overflow fails CI rather than surfacing in front of a class.
- **Suspend-data budget test.** A pessimistic full attempt must encode to under
  3800 characters. Currently ~180.
- **One `aria-live` announcement per transaction**, not seven. The animated
  pipeline indicator is `aria-hidden`; the steps are a static ordered list.

---

## Dependencies

Zero runtime dependencies beyond `react` and `react-dom`. Each omission is
deliberate (§36 requires every major dependency to be justified):

| Need | Decision |
|---|---|
| i18n | ~40-line `t()` over a flat JSON map |
| State | `useReducer` + context; the domain is already a reducer |
| Graph rendering | Semantic HTML + CSS — §18.9 says avoid a graph library |
| Dates | Fixed ISO strings + `Intl.DateTimeFormat` |
| Hashing | Vendored SHA-256, ~150 lines |
| Fonts | System stack; renders Vietnamese correctly at zero bundle cost |
| SCORM ZIP | `adm-zip`, dev-only |
