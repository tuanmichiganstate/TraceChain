# Scenario flow

**Hành trình lô cà phê Arabica Lâm Đồng** — nine stages, roughly 40 minutes.

Nine rather than the specification's ten: the original stages 4 and 5 are merged,
because both are logistics and the custody handoff *is* the moment transport
begins. All twelve learning objectives survive; what was cut is repetition.

---

## The chain

```
Hợp tác xã sản xuất → Đơn vị chứng nhận → Đơn vị vận chuyển
   → Nhà máy chế biến → Nhà phân phối → Nhà bán lẻ
   → Người tiêu dùng và cơ quan quản lý
```

## The stages

| # | Stage | Role | What happens | Concept |
|---|---|---|---|---|
| 1 | Orientation | — (observing) | Supply chain, organizations, one diagnostic question | Blockchain does not prove input truth |
| 2 | Create batch | Producer | `CREATE_BATCH`, then seal block 1 | Physical goods → digital asset; ordering ≠ commitment |
| 3 | Anchor certificate | Certifier | Store off-chain, hash on-chain; reject an unauthorized issuer | On-chain vs off-chain; issuer authority |
| 4 | Ship and monitor | Producer → Carrier | Custody moves, ownership stays; humidity 72% vs 70% limit | **Ownership ≠ custody**; oracles |
| 5 | Receive and correct | Processor | Weigh 100 kg against a manifest saying 1000 kg; book in and buy | **Correction, not deletion**; receipt ≠ purchase |
| 6 | Transform | Processor | 100 kg green → 82 kg roasted | Provenance; transformation yield |
| 7 | Package and distribute | Processor → Distributor | 82 kg → 820 × 100 g; ownership moves while custody stays | Ownership ≠ custody, mirrored |
| 8 | Verify and tamper | Retail | Public QR view; alter an old record on a clone | Hash-chain integrity |
| 9 | Recall and debrief | Regulator | Trace forward from the contaminated batch | Recall scope from provenance |

## Quantities

```
100 kg green coffee
  → 82 kg roasted        (18% mass lost to moisture — a real roasting yield)
  → 820 packages × 100 g (82 000 g, exactly conserved)
```

## Timeline

Green coffee is warehoused for months before shipment, so a December harvest
reaching the roaster the following June is ordinary rather than anomalous.

| Event | Scenario time |
|---|---|
| Harvest / batch created | 2025-12-10 |
| Certificate issued (expires 2027-01-15) | 2026-01-15 |
| **Dispatch manifest filed — with the 1000 kg error** | 2026-06-15 |
| Custody → carrier | 2026-06-16 01:00 |
| Sensor reading, humidity 72% | 2026-06-16 09:30 |
| Receipt by processor | 2026-06-17 |
| Correction recorded | 2026-06-17 |
| Roasting | 2026-06-18 |
| Packaging | 2026-06-19 |
| Ownership → distributor | 2026-06-20 |
| Dispatch → retailer | 2026-06-22 |
| Laboratory result → recall | 2026-07-05 |

All UTC. `TIMELINE_ORDERING_CONSTRAINTS` in `timeline.ts` encodes the required
orderings, and `npm run validate:scenario` enforces them.

---

## Receipt and purchase are separate events

Stage 5 emits three transactions, not two. Booking goods in moves **custody** to
the processor; buying them moves **ownership**. They are proposed by different
organizations — the processor books in, the co-operative sells.

This was found by a test rather than by design. Stage 7 has the processor
selling the packaged lot to the distributor, and it failed with
`currentOwnerRequired`: the processor had never acquired ownership, because
nothing in the scenario transferred it. The batch was still owned by the
co-operative all the way through roasting.

The fix is also better teaching. It applies the ownership/custody distinction a
third time, in the one place learners most expect the two to be the same event.

## Two design decisions worth understanding

### The stage 5 error arrives already committed

The specification pre-filled a wrong quantity and hoped the learner would spot
it. But a learner who spots it simply corrects the field and commits — and never
issues a correction transaction, which is the entire point of the stage. Roughly
half the cohort would miss the mechanic, along with 15 score points and a
Definition-of-Done item.

So the erroneous dispatch manifest is filed by the co-operative's shipping clerk
— a non-learner actor — and sealed in a block *before* the learner's shift
begins. The learner never had a chance to enter it, so there is no railroading;
and it models the realistic case, where the error arrives from another
organization.

Every learner meets the correction mechanic.

### The distractor lots are a near miss, not an obvious mismatch

Section 31.2 requires recall to use provenance "rather than simple keyword
matching". Two obviously-different background lots do not achieve that — a
learner separates them by reading the label, scores full marks, and learns
nothing.

So:

- **`BAT_PACKAGED_COFFEE_002`** — same co-operative, harvested one day later,
  roasted at the same plant **on the same day**, packaged the next day under a
  near-identical name. Nothing on its label distinguishes it. Only the absence
  of a provenance edge does.
- **`BAT_PACKAGED_COFFEE_003`** — Robusta from Đắk Lắk. Obviously unrelated, so
  a learner who over-recalls everything in sight is caught too.

A learner who recalls `_002` has pattern-matched. A learner who excludes it has
followed the graph.

---

## Stage completion

Stages complete when their `completionConditions` are satisfied — data, not
code. Condition shapes: `TRANSACTION_COMMITTED`, `KNOWLEDGE_CHECK_ANSWERED`,
`ASSET_EXISTS`, `ASSET_LIFECYCLE_STATUS`, `DECISION_RECORDED`.

The scenario validator confirms that every asset a condition names is either
seeded or declared by some stage's `producesAssetIds`. Without that check, a
typo produces a stage that can never report itself complete, and the cause is
three layers away.

## Implementation status

Stages 1 and 2 are playable. Stages 3–9 have their metadata, roles, completion
conditions and save-format slots declared, but no interface yet — the router
shows a placeholder and progress still saves. Their content arrives with
Milestone 3, alongside the domain rules that give it meaning.
