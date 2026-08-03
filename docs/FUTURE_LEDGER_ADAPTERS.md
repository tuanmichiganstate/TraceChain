# Future ledger adapters

SimuLedger's ledger is reachable only through one interface,
`src/domain/ledger/ledger-adapter.ts`. This document records what that buys and
what it costs, so a later tier can be built without re-deriving the reasoning.

**Nothing here is implemented.** Tiers 2 and 3 are out of scope for this
release, and adding them without explicit approval would be scope creep.

| Tier | Implementation | Ledger | Learners |
|---|---|---|---|
| **1 — shipped** | `SimulatedLedgerAdapter` | In browser memory | One, alone |
| 2 | `ServerLedgerAdapter` | Shared server | A class, together |
| 3 | `FabricLedgerAdapter` | Hyperledger Fabric | A class, on a real network |

---

## What must not change

If a later tier forces a change to any of these, the seam has failed and the
change should be questioned rather than absorbed.

- **Scenario definitions.** `ScenarioDefinition` and everything under
  `src/scenarios/`.
- **Domain commands and events.** The two unions in `src/domain/commands/` and
  `src/domain/events/`.
- **Validation result format.** `ValidationResult`, and the rule identifiers.
- **React components.** They already depend only on `LedgerAdapter`.
- **The scoring engine and the interaction record.**
- **Localization keys.**
- **The SCORM reporting layer**, or a future LTI equivalent.

## What each tier replaces

Only the implementation behind the interface, plus configuration.

```
Presentation ─────────────────────┐   unchanged
Application services ─────────────┤   unchanged
Domain model and rule engine ─────┤   unchanged
                                  │
LedgerAdapter  ◄──── the seam ────┤
                                  │
SimulatedLedgerAdapter            │   Tier 1  ← replaced
ServerLedgerAdapter               │   Tier 2
FabricLedgerAdapter               │   Tier 3
```

---

## Tier 2 — `ServerLedgerAdapter`

A shared ledger so a class can act as different organizations on the same
supply chain, which is where a permissioned network starts to mean something.

**Already true and reusable**

- Every adapter method is `Promise`-based, even though Tier 1 is synchronous.
  That was deliberate — a network-backed adapter cannot be synchronous, and
  changing the signatures later would touch every call site.
- Commands are plain serializable objects. They are already the wire format.
- The rule engine is pure and has no browser dependency, so the same code can
  run server-side and produce identical results.
- Hashing is a pure function of canonical serialization, so a client can verify
  what a server computed.

**Genuinely new work**

- *Authority.* Tier 1 trusts the client because the client is the only party.
  Tier 2 must run validation server-side and treat the client as untrusted.
  Client-side validation stays, but only as fast feedback.
- *Identity.* `CommandContext` carries an actor identifier the client currently
  chooses. Tier 2 must bind it to an authenticated session, or a learner can
  act as the regulator.
- *Concurrency.* Two learners transferring the same batch at once. Fabric solves
  this with MVCC read-write sets; a simple server needs optimistic concurrency
  on `stateVersion`, which the asset model already carries.
- *Live updates.* Polling or a WebSocket, plus a way for the interface to
  reflect state changed by someone else.
- *Scenario instances.* One ledger per class group, not one per learner.

**The awkward part:** the pending-transaction queue is currently a teaching
device the learner controls, by pressing "seal the block". With several
learners it must become time- or size-driven, and the ORDERED/COMMITTED
distinction has to be taught differently.

---

## Tier 3 — `FabricLedgerAdapter`

Against a real Hyperledger Fabric network.

**Maps almost directly**

| SimuLedger | Fabric |
|---|---|
| Organization | MSP |
| Actor | Certificate identity |
| Command | Chaincode invocation |
| Validation rule | Chaincode logic |
| Endorsement policy | Endorsement policy |
| Ordering service | Orderer |
| World state | World state |
| Block, previous hash | Block, previous hash |

The command and event model was designed against this vocabulary, which is why
the mapping is close.

**Genuinely new work**

- *Chaincode.* The rule engine must be reimplemented in Go or Node chaincode.
  The rules are pure functions with no browser dependency, so this is a port
  rather than a redesign — but it is a real port, and the two implementations
  must then be kept in agreement.
- *Identity and certificates.* Real X.509 per organization. The simulated
  signature is explicitly not this, and the interface says so.
- *Network topology.* Peers, channels, orderers, an MSP per organization.
- *Query patterns.* Provenance traversal currently walks an in-memory edge
  list. Fabric needs composite keys or CouchDB rich queries; a naive port would
  be badly slow.
- *Failure modes.* Endorsement mismatch, MVCC conflicts, timeouts. Tier 1 has
  none of these, and the learner-facing error vocabulary would need extending.

**The honest caveat:** a real network makes the plumbing real, not the *data*.
The central lesson — that a blockchain records who claimed what and when, but
cannot make a claim true — is unchanged by Tier 3, and arguably harder to teach
once the machinery looks impressive.

---

## Adding an adapter

1. Implement `LedgerAdapter`.
2. Inject it where `SimulatedLedgerAdapter` is constructed
   (`src/app/providers/simulation-provider.tsx`).
3. Run the existing domain suite against it. `scenario-walkthrough.test.ts`
   drives the whole scenario through the adapter interface and asserts on
   outcomes, not internals — it should pass unchanged, and if it does not, that
   is a real behavioural difference worth understanding rather than a test to
   adjust.

That last point is the practical payoff of the seam: the acceptance criteria for
a new tier already exist, and they are executable.
