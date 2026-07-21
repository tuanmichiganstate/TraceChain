# Domain model

## The shape of a state change

```
Learner action
   → Command          intent; may be rejected
   → Validation       every applicable rule, no short-circuit
   → Event            a fact; applying it cannot fail
   → reduce()         pure, synchronous
   → Hashing          metadata, computed after the reducer
   → Block            sealed, linked to its predecessor
```

A command is a *request*. Only an event changes world state, and only the
reducer applies one. No component mutates state directly.

## Core entities

| Type | Identifier prefix | Notes |
|---|---|---|
| `Organization` | `ORG_` | Holds `authorizedActions`; a logistics provider deliberately cannot create a batch |
| `Actor` | `ACT_` | Belongs to one organization |
| `Location` | `LOC_` | Added to close a specification gap — `currentLocationId` was referenced but never defined |
| `SupplyChainAsset` | `BAT_` | Carries `packageSizeGrams`, without which packaging cannot be validated |
| `LedgerTransaction` | `TX_` | Deterministic sequence, never a random UUID |
| `LedgerBlock` | `BLK_` | Links to its predecessor's digest |
| `ProvenanceEdge` | `EDGE_` | Directed; what recall traverses |
| `DocumentAnchor` | `DOC_` | Off-chain content, on-chain hash |

## Ownership versus custody

The single most important distinction in the simulation, and the one most
easily lost:

- **`currentOwnerId`** — who owns the goods.
- **`currentCustodianId`** — who is physically holding them.

They move independently. Stage 4 moves custody while ownership stays put; stage
7 does the exact reverse. `RULE_OWNERSHIP_UNCHANGED_ON_CUSTODY_TRANSFER` rejects
a custody transfer that also moves ownership — that rejection *is* the lesson,
and the specification required it without ever defining the rule.

The asset card renders them as two separate rows for the same reason. Collapsing
them into one "holder" row would quietly undo the teaching.

## Quantity and units

`quantity` alone is not comparable across units. Roasting produces
`100 KG → 82 KG`; packaging produces `82 KG → 820 UNIT`. A raw numeric
comparison sees `820 > 82` and rejects a perfectly valid operation.

Everything normalizes to grams before comparison:

```
82 KG                    → 82 000 g
820 UNIT × 100 g/unit    → 82 000 g      equal, so the rule passes
900 UNIT × 100 g/unit    → 90 000 g      excess, so the rule still fails
```

`packageSizeGrams` is required on any asset measured in `UNIT`; the scenario
validator enforces it.

## Transaction lifecycle

```
DRAFT → SIGNED → SUBMITTED → VALIDATED → ENDORSED → ORDERED → COMMITTED
                      ↓
                  REJECTED
```

**`ORDERED` and `COMMITTED` are genuinely different states**, which the
specification left in conflict:

- `ORDERED` — accepted by the ordering service, sitting in the pending queue.
  The event has already been applied to world state, because the outcome is
  determined.
- `COMMITTED` — sealed into a block, hash-linked to its predecessor.

At a stage boundary the queue drains into blocks of at most
`maxTransactionsPerBlock`, in order. The pending queue is shown to the learner
rather than hidden: ordering and commitment really are separate steps, and stage
2 exists to let you watch the second one happen.

A rejected transaction is still recorded — the learner must be able to see why
it failed — but it never touches world state.

## Validation

Rules are pure functions of a command and a context. They never import React,
never read a clock, never mutate. Evaluation **does not short-circuit**: a
learner who has made three mistakes sees all three at once, not one per
submission.

Every failure carries a localization key and explains the *business* reason.
Showing a bare "invalid transaction" is forbidden by section 18.4, and rightly:
a learner who cannot tell which rule they broke learns nothing from the
rejection.

## Hashing

Hashes are **metadata, never inputs to state transitions**. The reducer runs
first and synchronously; digests are computed afterwards at the ledger commit
boundary, behind an injected `HashFunction`.

That boundary is what makes replay deterministic and every domain test a plain
function call. It is also why the vendored synchronous SHA-256 replaced
`crypto.subtle` — see `ARCHITECTURE.md` for that reasoning.

Three digests exist:

- **Asset state hash** — the canonical form of an asset, including its version.
- **Transaction hash** — id, type, payload, proposer, timestamp, and the asset
  state before and after.
- **Block hash** — id, number, previous block hash, transaction hashes,
  timestamp, orderer.

Each payload is an explicit typed object that structurally cannot contain the
field being calculated. A block cannot commit to its own digest.

## Integrity

`verifyIntegrity` recomputes every transaction and block digest, checks every
previous-block link, verifies block numbering is sequential, and confirms no
transaction appears in two blocks.

It demonstrates tamper **evidence**, not tamper prevention. Nothing here stops
someone editing a record; it only makes the edit impossible to hide. The debrief
says so explicitly.

The stage 8 demonstration operates on a structural clone, and a test asserts the
real ledger's chain fingerprint is byte-identical before and after — a learner
who breaks the chain to see what happens must be able to carry on afterwards.

## Time

Domain timestamps come from the scenario clock, never the system clock. A
learner in Hanoi and a learner in Berlin produce identical hashes for identical
actions, and a test run in March matches one run in November.

`eventSequence` strictly orders two events the narrative places at the same
instant. System time is used only for attempt start and end, elapsed learning
time, and SCORM session time — none of which enter a hash.
