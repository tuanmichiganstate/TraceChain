# Stage 5 repair — settled design

Stage 5 asks the learner to correct a dispatch manifest that declared 1000 kg
for a 100 kg batch. **That manifest was never implemented.** `seedTransactions`
is empty, nothing on the ledger ever says 1000, and the correction currently
targets the learner's own receipt. `timeline.ts`, `quantity-rules.ts` and the
stage UI all describe the manifest; only the ledger disagrees, and only the
ledger is authoritative.

M3's acceptance is reopened as a result: its exit condition asserted that the
scenario ran headless, which it did — over data the scenario claims exists and
does not.

## The model

The manifest is an **`ANCHOR_DOCUMENT`**, never a `DISPATCH_BATCH`. A dispatch
moves custody and location, which collides with stage 4's handover and stage 5's
receipt; a document records a claim and moves nothing. `DocumentType.SHIPPING_MANIFEST`
already exists, unused.

It carries a declared quantity that no rule checks against the asset, and that
is the lesson rather than an oversight: the network can confirm who filed the
paperwork and that it is well formed, but nothing on a ledger can establish what
was physically loaded onto a truck.

Threading `declaredQuantity` through the command, the `DOCUMENT_ANCHORED` event,
the `DocumentAnchor` model and **`calculateTransactionHash`'s canonical payload**
is required. Omitting the last one leaves the declared value outside the hash,
which silently voids the integrity lesson the stage exists to teach.

Prefer typed document metadata (a discriminated union) over optional fields
sprayed onto every anchor. `DocumentAnchor` is not persisted — it is rebuilt by
replay — so its shape can change with no migration.

## Injection

Trigger on the **committed custody transfer**, not on stage completion:

```
if (custody transfer is committed && no shipping manifest exists) {
    submit ANCHOR_DOCUMENT as ACT_SHIPPING_CLERK
}
```

Keying on the prerequisite transaction rather than the stage number is what
makes the timestamp work. The manifest is dated between the custody transfer and
the sensor reading; a stage-completion trigger fires after the sensor reading and
the ledger rejects the backdated transaction. The existence check is the
idempotency guard — replay, refresh and resume must not duplicate it.

## Correction

`RECORD_CORRECTION` today handles exactly one field:

```ts
event.fieldName === "quantity" ? { ...asset, quantity: Number(...) } : asset
```

Every other field name is a silent no-op. So a correction targeting
`declaredQuantity` records and commits but changes nothing, and an
effective-value resolver is mandatory rather than optional.

**Do not use `fieldName: "quantity"` as a shortcut.** It would hit the reducer
branch and appear to work, because the asset is already 100 — correcting the
batch's inventory instead of the manifest's declaration, coinciding only by
accident.

Required:

- a typed correction target — `ASSET_FIELD` vs `DOCUMENT_METADATA_FIELD` — so
  invalid combinations are unrepresentable
- typed correction values carrying unit, since `"1000"` cannot distinguish
  1000 KG from 1000 UNIT
- successive corrections allowed, resolved in ledger order, each stating the
  effective value immediately before it
- scenario values (1000, KG, 100) stay in the scenario and its tests, never in
  the generic rule engine

## Completion condition — do not touch

```ts
{ conditionType: "TRANSACTION_COMMITTED", transactionType: RECORD_CORRECTION }
```

Already monotonic and already correct. Do **not** replace it with a predicate
over the effective manifest value: a later correction would flip it false and
un-complete a finished stage — the defect that broke three stages in M3.

Do not narrow it to `DECISION_RECORDED` either. `recordActionOutcome` fires on
rejected submissions too, and `DECISION_RECORDED` only checks `attemptCount > 0`,
so a **rejected** correction would complete the stage.

> Progression depends on successful, immutable historical facts — not attempts,
> scoring side effects, or mutable derived values.

## Not to be reused

`wip/stage5-failed-dispatch-approach` (`a7414f41`) holds the abandoned
`DISPATCH_BATCH` attempt. **Reference only — do not merge or cherry-pick.** Its
one useful file imported the wrong command builder and cannot be lifted cleanly;
the trigger pattern above is the part worth keeping, and it is written out
here so the branch is not needed at all.

## Sequence

1. SCORM boundary (4095/4096/4097), codec grammar and adapter parity tests
2. Correction-domain support
3. Stage 5 repair
4. Scenario-contract audit — every `DECISION_RECORDED` usage, every milestone
   promise without ledger evidence, plus two contract tests: an unrelated
   correction must not complete stage 5, and a later correction must not
   un-complete it
5. Re-run the baseline, rebuild the package, re-accept M3
