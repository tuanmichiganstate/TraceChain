# SimuLedger Guided SCORM: Annotated Instructor Walkthrough

> **Instructor copy — contains the complete answer path and final report.**
>
> This is not a learner handout. It reveals the evidence, correct decisions,
> transaction sequence, and causal outcomes of the Guided case.

## 1. What this document records

This walkthrough was produced by completing the deployed **SimuLedger Guided**
SCORM activity in the local Moodle demo, not by reconstructing screens from
source code. Every screenshot and value below came from one continuous Moodle
attempt completed on 28 July 2026.

| Run property | Observed value |
|---|---|
| Moodle activity | SimuLedger Guided |
| Preset | Guided |
| Locale | Vietnamese |
| Scenario | `SCN_COFFEE_001@2.3.0` |
| Scenario seed | `guided-standard-v1` |
| Variation policy | Fixed case; fixed option order; stable within the attempt |
| Configuration hash | `c7c3c3236c7a2dae18aa8499dcef70df0a1a460b0a74e9bccec5f48490942a40` |
| Estimated duration | 40 minutes |
| Passing score | 70/100 |
| Completed result | 100/100, passed |
| Hints opened | 0 |
| Accepted ledger transactions | 14 |
| Blocks | 14 |
| Ledger transactions rejected | 0 |
| Records requiring manual recall review | 0 |
| Moodle result | Attempt 1, grade 100%, reported grade 100% |

The run used the strongest authored path so that the screenshots form a clean
reference. The guide explains meaningful error paths where they are part of the
learning design, but it did not deliberately reduce the final score.

![Start screen, learning outcomes, scoring, and simulation disclosure](00-start-and-learning-objectives.png)

## 2. How an instructor can use the walkthrough

The document supports four practical uses:

1. **Pre-class preparation.** Review the evidence and likely misconceptions
   before assigning the activity.
2. **Live facilitation.** Pause at the suggested debrief questions without
   revealing the next answer.
3. **Post-activity debrief.** Compare learner reasoning with the causal chain
   shown here.
4. **Technical explanation.** Use the actual transaction, hash, signature,
   endorsement, state-version, and provenance evidence to explain what is real
   and what remains simulated.

The case is intentionally business-first. A learner is not asked to handle
private keys, choose an algorithm, mine a block, or operate a node. The learner
makes supply-chain and governance decisions; SimuLedger exposes the technical
evidence needed to understand why a decision is accepted or rejected.

## 3. The conceptual model behind the screens

### 3.1 Four different kinds of state

The case becomes much easier to teach when four concepts remain separate.

| Concept | Meaning in this case |
|---|---|
| Physical reality | The coffee, measured quantity, sensor reading, certificate content, and contamination exist outside the ledger. |
| Business state | Who owns or holds a lot, whether it is saleable, consumed, under review, or recalled. |
| Ledger history | Append-only accepted transactions and blocks, including the original erroneous manifest and its later correction. |
| Information state | What the current role is permitted to see at that moment. |

Blockchain integrity does not make the first column truthful. It gives the
participants stronger evidence about who approved particular digital content,
when it was recorded, how it changed, and whether later tampering is detectable.

### 3.2 The transaction path

The visible transaction workflow corresponds to this conceptual sequence:

```text
Business decision
→ command under trusted actor context
→ canonical proposal and digest
→ Ed25519 signature verification
→ identity and authorization evaluation
→ endorsement-policy evaluation, where required
→ state-version and business-rule validation
→ ordering
→ block commitment
→ projected current state
```

No React control can declare itself verified or authorized. The learner may
request a scenario-permitted role handoff, but cannot type an organization or
role into the command payload.

### 3.3 What is cryptographically real

Real computations in the package include:

- SHA-256 transaction, block, asset-state, and document-content hashes
- canonical serialization
- block-to-block hash chaining
- Ed25519 signing and signature verification
- signatures by multiple educational organizations over the same proposal
- endorsement-policy evaluation
- explicit state-version validation

Explicit educational simulations include:

- organizational identity issuance and recognition
- custody of the bundled educational private keys
- certificate authority and certificate issuance infrastructure
- network communication, nodes, ordering service, and consensus

There is no proof of work, mining, cryptocurrency, or Merkle tree in the main
coffee ledger.

### 3.4 Signature validity is not authorization or truth

The trust summary deliberately separates:

```text
Signature valid?
Identity recognized?
Key active?
Organization and role authorized?
Endorsement policy satisfied?
Business statement true?
```

A transporter can create a genuine, valid Ed25519 signature and still be
unauthorized to issue a quality certificate. Even a valid, authorized signature
does not prove that the signed claim was factually true.

## 4. Scoring and hint contract

The published score remains exactly 100 points:

- **39 operational points** across eight required business actions
- **61 knowledge points** across nine scored questions
- one additional orientation question worth 0 points

### 4.1 Operational items: 39 points

| Scorable item | Action | Points | Item-scoped hint |
|---|---|---:|---|
| `INT_CREATE_BATCH` | Create the initial green-coffee lot | 4 | Create-batch fields |
| `INT_RECEIVE_BATCH` | Receive the lot at the processor | 3 | None |
| `INT_CORRECTION_RECORDED` | Commit the append-only quantity correction | 10 | Correction mechanism |
| `INT_TRANSFORM_BATCH` | Transform green coffee into roasted coffee | 4 | Transformation yield |
| `INT_PACKAGE_BATCH` | Package the roasted coffee | 3 | None |
| `INT_OWNERSHIP_TRANSFER_SCOPE` | Transfer ownership without falsely changing custody | 5 | None |
| `INT_DISPATCH_BATCH` | Deliver the packaged lot | 5 | None |
| `INT_RECALL_COMMITTED` | Commit an authorized recall | 5 | None |
| **Total** |  | **39** |  |

### 4.2 Knowledge items: 61 points

| Scorable item | Judgment | Points | Item-scoped hint |
|---|---|---:|---|
| `INT_CERTIFICATE_STORAGE_CHOICE` | Full document off chain, hash on chain | 5 | Certificate storage |
| `INT_CERTIFICATE_ISSUER_CHECK` | Recognition and authorization of issuer | 5 | None |
| `INT_CUSTODY_TRANSFER_SCOPE` | Custody changes while ownership remains | 6 | Custody versus ownership |
| `INT_TRANSPORT_CONDITION` | Respond proportionately to sensor exceedance | 5 | None |
| `INT_TRANSFORMATION_PROVENANCE` | New asset linked to, rather than replacing, input | 8 | None |
| `INT_TAMPER_DEMONSTRATION` | Tamper evidence versus prevention | 7 | None |
| `INT_DATA_GOVERNANCE_CLASSIFICATION` | On-chain, off-chain, restricted, or not collected | 5 | None |
| `INT_RECALL_SCOPE` | Select only provenance descendants | 15 | Recall provenance |
| `INT_BLOCKCHAIN_NECESSITY` | Identify the appropriate multi-organization use case | 5 | None |
| **Total** |  | **61** |  |

Opening a hint caps only its declared target item, normally at 70%. It does not
penalize an entire stage. The interface calculates and discloses the current
points at risk before the learner opens the hint. Mitigation cannot restore
points removed by the hint ceiling.

The final report regroups the same 100 points into six competency-oriented
components:

| Final report component | Maximum |
|---|---:|
| Transaction accuracy | 25 |
| Traceability completeness | 20 |
| Data governance | 15 |
| Compliance and correction | 15 |
| Recall performance | 20 |
| Conceptual understanding | 5 |

## 5. The reference workspace

The **Bảng tra cứu** reference workspace remains available throughout the
simulation. It has five tabs.

### 5.1 Current state

Current state is a projection of the accepted event history. It is convenient,
but it is not a substitute for the history that produced it. Each mutable asset
has an explicit version; the version increases when accepted transactions alter
that asset.

![Initial current-state cards](03-reference-current-state-initial.png)

The scenario includes distractor assets from the start. They are important in
Stage 9 because similarity of name, date, producer, or factory does not establish
provenance.

Initial distractor chain:

```text
BAT_GREEN_COFFEE_002, 120 kg
→ BAT_ROASTED_COFFEE_002, 98 kg
→ BAT_PACKAGED_COFFEE_002, 980 packages
```

Another unrelated distractor is
`BAT_PACKAGED_COFFEE_003`, Robusta Đắk Lắk 200 g, 400 packages.

### 5.2 Transaction history

At the beginning, the learner has not created any new transaction.

![Empty attempt transaction history at the beginning](04-reference-history-initial.png)

At the end, the history contains 14 accepted transactions.

![Final transaction-history table](59-reference-final-transaction-history.png)

### 5.3 Ledger

The ledger tab displays blocks, transactions, previous-block hashes, block
hashes, and integrity status. The displayed SHA-256 values are computed in the
browser from the actual records.

![Initial ledger view](05-reference-ledger-initial.png)

![Final ledger with recall block 14](60-reference-final-ledger-block-14.png)

### 5.4 Provenance

Provenance expresses how one asset was transformed or packaged into another.
The arrows run from oldest to newest.

![Initial distractor provenance chain](06-reference-provenance-initial-distractor.png)

### 5.5 Glossary

The glossary defines transaction, block, hash, ledger, world state, smart
contract, ownership, custody, provenance, endorsement, ordering service, oracle,
and permissioned blockchain.

![Reference glossary](07-reference-glossary.png)

## 6. Stage-by-stage walkthrough

## Stage 1 — Orientation to the simulated network

### Learner task

The learner meets the organizations and establishes a baseline understanding of
what blockchain evidence can and cannot prove.

Organizations visible in the case:

- Hợp tác xã Cà phê Cao nguyên
- Trung tâm Chứng nhận Nông sản
- Công ty Vận tải Liên Việt
- Nhà máy Rang xay An Việt
- Nhà phân phối Thành Công
- Siêu thị Việt Market

![Stage 1 orientation and baseline truthfulness question](01-stage-1-orientation-and-truthfulness-check.png)

### Correct reasoning

The correct baseline statement is that the ledger can help identify:

- who recorded a statement
- when it was recorded
- whether the recorded content later changed

It cannot prove that the first statement was true. This item is diagnostic and
worth 0 points.

![Stage 1 explanation of integrity versus truth](02-stage-1-feedback.png)

### Theory to emphasize

“Garbage in, garbage out” still applies. A tamper-evident record of a false
claim is still a false claim. SimuLedger therefore treats source documents,
role authority, sensor evidence, physical measurements, and investigation as
part of the decision rather than treating the ledger as an oracle of truth.

### Debrief prompt

> If three organizations agree that an incorrect number was entered, has
> agreement made the number true? What evidence would be needed to correct it?

## Stage 2 — Create the green-coffee lot

### Role and evidence

The learner acts as **Nguyễn Thị Mai**, farm production manager for Hợp tác xã
Cà phê Cao nguyên.

The business data submitted are:

| Field | Value |
|---|---|
| Asset ID | `BAT_GREEN_COFFEE_001` |
| Product | Arabica green coffee |
| Origin | Lâm Đồng |
| Quantity | 100 kg |
| Owner | Hợp tác xã Cà phê Cao nguyên |
| Custodian | Hợp tác xã Cà phê Cao nguyên |

![Stage 2 create-batch form and source evidence](08-stage-2-create-batch.png)

### What the engine checks

The proposal is signed with the active organization’s fixed educational key.
The compact trust summary and transaction pipeline show that a valid signature
is only one part of acceptance.

![Stage 2 signature, authorization, and business-rule validation](09-stage-2-signature-and-validation.png)

Observed rule checks include:

- `RULE_ACTOR_AUTHORIZED`
- `RULE_ORGANIZATION_ACTIVE`
- `RULE_ASSET_ID_UNIQUE`
- `RULE_VALID_QUANTITY`
- `RULE_UNIT_COMPATIBLE`
- `RULE_TIMESTAMP_SEQUENCE_VALID`

### Accepted result

- transaction: `TX_000001`
- block: `BLK_000001`
- ordered at: 09:00, 10 December 2025
- resulting asset version: 1
- transaction SHA-256:
  `058d40c47f0c387e7b6dd4fb0625fe8fe8dac84e0059df6ff290dc6dd2771fac`
- block SHA-256:
  `8332cf18d8363ded1174b1b2cd484c5ae4542ce2ef77466149adc495e9553ca3`

![First committed block and transaction](10-stage-2-first-block.png)

### Theory to emphasize

An asset identifier refers to the digital representation of a physical lot.
Uniqueness, units, timestamps, and actor authority are business rules. The hash
protects the integrity of the accepted digital record; it does not weigh the
coffee.

## Stage 3 — Record and evaluate the quality certificate

This is the principal signature, authorization, document-governance, and
consequential-decision lesson.

### Role

The learner acts as **Trần Minh Anh**, certificate specialist at Trung tâm
Chứng nhận Nông sản.

### Source document

| Field | Actual case value |
|---|---|
| Lot | `BAT_GREEN_COFFEE_001` |
| Filename | `giay-chung-nhan-chat-luong-001.pdf` |
| Issuer | Trung tâm Chứng nhận Nông sản |
| Issue/review time | `2026-01-15T03:00:00.000Z` |
| Expiry | `2027-01-15T03:00:00.000Z` |
| Document SHA-256 | `8641384af29fce9efb2a58cf7e87cf374e6216ef0a50a1633e3b08cf8a11ff5a` |

The network organization registry identifies
`ORG_CERTIFICATION_BODY` as recognized, active, and authorized to issue quality
certificates under network policy version 2.3.0.

![Certificate content and network organization registry](11-stage-3-certificate-evidence-and-registry.png)

### Atomic consequential decision

The learner commits one structured decision containing all judgments:

- certificate content: valid
- issuer: recognized and authorized
- storage: full document off chain, SHA-256 hash on chain
- lot disposition: continue

![Atomic certificate decision before selection](12-stage-3-atomic-certificate-decision.png)

![Selected certificate decision](13-stage-3-selected-certificate-decision.png)

After submission the initial controls become read-only. The history is not
rewritten by subsequent mitigation.

![Immutable initial certificate-decision record](14-stage-3-immutable-decision-record.png)

### Why the storage choice matters

Storing the full document on every consortium copy creates confidentiality,
retention, and correction problems. Storing the document in an appropriate
off-chain repository while recording its SHA-256 digest gives later users a way
to test whether the retrieved file is the same file that was approved.

### Valid signature, unauthorized action

The stage deliberately demonstrates a transporter signing a certificate action.
The Ed25519 signature is genuine and valid, and the organization is recognized,
but the transporter has no authority to issue a quality certificate.

![Valid signature by a recognized but unauthorized transporter](16-stage-3-valid-signature-but-unauthorized.png)

This failed submission is retained as attempt-audit evidence. It does not:

- enter a block
- change an asset version
- alter transaction or block hashes
- appear as an accepted business transaction
- reduce into current asset state

### Authorized certificate commitment

Under the trusted certifier role, the signature, identity, active key, and
authorization all pass.

![Authorized certificate signature and transaction checks](17-stage-3-authorized-certificate-signature.png)

Accepted records:

- `TX_000002` / `BLK_000002`: document record
- `TX_000003` / `BLK_000003`: certificate issuance
- document record ID: `DOC_QUALITY_CERTIFICATE_001`

The original business decision later affects recall evidence. In this run the
certificate can be used without extra manual review.

### Theory to emphasize

Ask learners to state each conclusion separately:

1. The signature is valid.
2. The signer’s educational identity is recognized.
3. The signing key is active.
4. The role is or is not authorized for this action.
5. None of the above proves that the original certificate claim is true.

## Stage 4 — Transfer custody and monitor transport

### Starting state and role handoff

At the beginning of the stage:

- asset: `BAT_GREEN_COFFEE_001`
- quantity: 100 kg
- version: 3
- lifecycle: certified
- owner and custodian: Hợp tác xã Cà phê Cao nguyên

The scenario hands work from **Nguyễn Thị Mai** at the cooperative to
**Phạm Quốc Huy**, logistics coordinator at Công ty Vận tải Liên Việt.

![Stage 4 lot state and business handoff](18-stage-4-custody-and-sensor-briefing.png)

### Custody versus ownership

The correct judgment is:

- custody transfers to the transporter
- ownership remains with the cooperative

This is enforced by `RULE_OWNERSHIP_UNCHANGED_ON_CUSTODY_TRANSFER`.

### Endorsement policy

The custody-transfer proposal requires:

```text
Current custodian AND receiving custodian
```

The cooperative first signs the exact proposal. A trusted role handoff then
allows the transporter to inspect and sign the same proposal digest and expected
state version. One organization cannot satisfy both sides by signing twice.

The policy teaches a business principle: a unilateral sender claim is not enough
to prove that a receiver accepted custody.

Accepted result:

- `TX_000004` / `BLK_000004`
- owner: cooperative
- custodian: transporter
- location: Bảo Lộc transfer station
- status: in transit

### Sensor evidence and oracle limitation

The observed humidity reading is **72%**, above the authored threshold of
**70%**.

The proportionate action is:

- record the exceedance
- mark the lot as needing inspection
- retain the full sensor dataset off chain
- place its hash on chain

The exceedance is evidence requiring investigation. It is not proof of spoilage.
An oracle brings external data into the transaction system; the blockchain
itself does not measure humidity or prove the sensor was calibrated.

Accepted transport-condition result:

- `TX_000006` / `BLK_000006`
- organization: Công ty Vận tải Liên Việt
- compliance state: needs inspection

The manifest generated during the stage is:

- `TX_000005` / `BLK_000005`
- organization: Hợp tác xã Cà phê Cao nguyên

### Debrief prompt

> What additional evidence would distinguish a real cold-chain or humidity
> failure from a faulty sensor, poor calibration, or data-entry error?

## Stage 5 — Receive the lot and correct the quantity discrepancy

### Role and discrepancy

The learner acts as **Lê Thu Hà**, factory receiving manager at Nhà máy Rang
xay An Việt.

The ledger manifest says **1,000 kg**; the physical lot weighs **100 kg**.

![Stage 5 discrepancy overview](22-stage-5-discrepancy-overview.png)

Relevant evidence:

- original document: `DOC_SHIPPING_MANIFEST_001`
- original transaction: `TX_000005`
- original recorder: Bùi Gia Linh, transport documents staff
- source weighing slip: 100 kg
- entry log: 1,000 kg
- both records use kg, so this is not a unit-conversion error
- seal is intact
- factory scale confirms 100 kg
- no evidence presently indicates loss or fraud

![Investigation evidence for the 1,000 kg versus 100 kg discrepancy](23-stage-5-investigation-evidence.png)

### Correct initial consequential decision

The strongest authored choice is:

```text
Investigate, then append a linked correction
Cause: typing error
```

The learner must not delete, overwrite, or silently replace the original record.

The submitted correction is:

| Field | Value |
|---|---|
| Target | `DOC_SHIPPING_MANIFEST_001.declaredQuantity` |
| Referenced transaction | `TX_000005` |
| Original value | 1,000 kg |
| Corrected value | 100 kg |
| Reason | “Cân lại tại nhà máy cho kết quả 100 kg, không phải 1000 kg như trên vận đơn.” |
| Maximum persisted rationale | 240 UTF-8 bytes |

![Append-only correction proposal](24-stage-5-append-only-correction-proposal.png)

### Correction endorsement

The policy requires:

```text
Producer AND Processor
```

The factory proposes and signs the correction. The cooperative then reviews and
endorses the exact same digest and expected state version. If either party signs
different content, the policy is not satisfied.

![Correction policy with one organization signed](25-stage-5-correction-endorsement-one-of-two.png)

![Correction policy satisfied by producer and processor](26-stage-5-correction-endorsement-satisfied.png)

### Accepted result

- `TX_000007` / `BLK_000007`: receive batch
- `TX_000008` / `BLK_000008`: transfer ownership to processor
- `TX_000009` / `BLK_000009`: append-only correction

The history remains:

```text
Original declared quantity: 1,000 kg
Later correction: 100 kg
Effective declared quantity: 100 kg
```

![Original value, correction transaction, and effective value](27-stage-5-append-only-history-and-effective-value.png)

After the stage, the green lot is held and owned by the factory. Its effective
quantity is 100 kg, and the original error remains auditable.

### Theory to emphasize

Immutability does not mean “errors can never be corrected.” It means accepted
history is not silently rewritten. A correction is a later, linked event that
changes the effective value while retaining the original assertion and its
provenance.

## Stage 6 — Transform green coffee into roasted coffee

### Mass-balance evidence

The learner records:

```text
100 kg green coffee
→ 82 kg roasted coffee
→ 18 kg roasting loss
```

The transaction validates mass balance in compatible base units and requires
output not to exceed available input.

![Transformation and mass-balance evidence](28-stage-6-transformation-mass-balance.png)

### Accepted result

- input: `BAT_GREEN_COFFEE_001`
- output: `BAT_ROASTED_COFFEE_001`
- `TX_000010` / `BLK_000010`

The input asset is not deleted. It becomes consumed, and the new roasted asset
is linked to it by provenance.

![Provenance after transformation](29-stage-6-provenance-after-transformation.png)

### Theory to emphasize

Traceability depends on preserving the relation between input and output. If an
application simply renamed the green lot as roasted coffee, it would lose the
fact that a transformation occurred and could not support reliable forward or
backward tracing.

## Stage 7 — Package, transfer ownership, and deliver

### Packaging calculation

```text
82 kg = 82,000 g
82,000 g ÷ 100 g per package = 820 packages
```

The output asset is:

- `BAT_PACKAGED_COFFEE_001`
- Cà phê Arabica Lâm Đồng 100 g
- 820 packages

### Business sequence

1. Package the roasted lot.
2. Transfer ownership to Nhà phân phối Thành Công while custody remains at the
   factory.
3. Deliver to Siêu thị Việt Market in Quận 1, changing custody and ownership as
   authored.

![Stage 7 packaging, ownership, and delivery flow](30-stage-7-packaging-ownership-and-delivery.png)

Accepted transactions:

- `TX_000011` / `BLK_000011`: packaging
- `TX_000012` / `BLK_000012`: ownership transfer
- `TX_000013` / `BLK_000013`: delivery

Before the recall incident, the packaged lot is:

- owner: Siêu thị Việt Market
- custodian: Siêu thị Việt Market
- location: Quận 1
- lifecycle: saleable
- quantity: 820 packages
- version: 3
- compliance note inherited from the transport evidence: needs inspection

![Retail-ready current state before recall](31-stage-7-retail-ready-current-state.png)

### Reference evidence after distribution

![Transaction history through delivery](32-reference-history-after-distribution.png)

![Ledger through block 13](33-reference-ledger-after-distribution.png)

![Main-lot provenance through the packaged product](34-reference-provenance-main-lot-after-distribution.png)

### Theory to emphasize

Ownership, custody, location, and lifecycle are separate attributes. A product
can be owned by one organization and physically held by another. Treating these
as interchangeable weakens accountability during loss, inspection, and recall.

## Stage 8 — Verify provenance, detect tampering, and govern data

### Ledger integrity inspection

The learner sees all 13 blocks as hash-chain consistent. The ledger explains
that its SHA-256 values are calculated from the records rather than displayed as
prewritten examples.

### Controlled transaction-and-block tamper demonstration

The experiment operates on a copy and does not alter the learner’s ledger.

1. Change `TX_000001` quantity from 100 to 1. The transaction no longer matches
   its own digest.
2. Recalculate the transaction digest. The transaction now appears internally
   consistent, but `BLK_000001` still commits to the old transaction digest.
3. Recalculate the first block. The next block still contains the old previous
   hash, so the chain link breaks.

![Three-layer transaction, block, and chain-link tamper escalation](36-stage-8-tamper-escalation.png)

Correct conclusion:

> Blockchain does not prevent someone from editing a copy. The edit makes the
> hash chain inconsistent and can be detected by an integrity check.

### Signature-tamper demonstration

The optional Ed25519 demonstration verifies an original signed proposal, changes
one character, recomputes its proposal digest, and tests the modified content
against the original signature.

Observed digests:

- original proposal:
  `4f29b16189c3060e49b23e2784ca47866df18b1f2da1df5d0c554fad178edd1c`
- modified proposal:
  `5b188d04db50b9f7ad4558544ea3055116441aa93c361274aa6e8879038039ba`

The original signature is valid for the first digest and does not verify against
the second.

![Original valid signature and modified proposal mismatch](37-stage-8-signature-tamper-demonstration.png)

### Data-governance classification

The authored consortium rules say:

- stable shared identifiers and statuses needed by all members belong on chain
- source files and large datasets stay off chain, with SHA-256 hashes on chain
- necessary commercially sensitive data are shared only with authorized parties
- unnecessary personal data are not collected

Correct classifications:

| Data item | Treatment |
|---|---|
| Batch ID | On chain |
| Recall status | On chain |
| Full certificate PDF | Off chain; hash on chain |
| Full sensor dataset | Off chain; hash on chain |
| Wholesale price | Authorized parties only |
| Consumer home address | Do not collect for this purpose |

![Selected governance classifications](38-stage-8-governance-classification.png)

![Context-specific governance feedback](39-stage-8-governance-feedback.png)

### Theory to emphasize

A shared ledger does not imply that every member should read every field.
Integrity, confidentiality, data minimization, and access control solve different
problems. “Put everything on chain” is not a sound governance policy.

## Stage 9 — Trace and recall affected products

### Incident

A laboratory detects pesticide residue above the permitted threshold in
`BAT_GREEN_COFFEE_001`.

The learner initially acts as **Võ Thanh Nam**, retail operations manager at
Siêu thị Việt Market.

![Recall incident briefing](40-stage-9-recall-incident-briefing.png)

### Evidence at the decision point

| Evidence | Value |
|---|---|
| Contaminated source lot | `BAT_GREEN_COFFEE_001` |
| Consumer risk | High; finished product is at retail |
| Initial recall-evidence strength | Medium |
| Organization handling incident | Siêu thị Việt Market |
| Provenance descendants | 2 |
| Roasted descendant | `BAT_ROASTED_COFFEE_001`, 82 kg |
| Packaged descendant | `BAT_PACKAGED_COFFEE_001`, 820 packages |

![Recall command center and forward provenance](41-stage-9-recall-command-center-and-provenance.png)

### Correct scope

Select:

- `BAT_ROASTED_COFFEE_001`
- `BAT_PACKAGED_COFFEE_001`

Do not select:

- `BAT_PACKAGED_COFFEE_002`, despite its similar product, producer, roasting
  date, and factory
- `BAT_PACKAGED_COFFEE_003`, the unrelated Robusta product

![Selected recall descendants](42-stage-9-selected-recall-scope.png)

![Explanation of the correct provenance-defined scope](43-stage-9-correct-scope-feedback.png)

The critical distinction is:

```text
Similarity is not provenance.
```

Recalling too narrowly leaves affected product available to consumers. Recalling
too broadly destroys unaffected product and creates unnecessary operational
cost.

### Trusted authorization handoff

The retailer may identify and propose the scope, but it is not authorized to
commit the regulatory recall. The scenario offers an explicit handoff from Võ
Thanh Nam to **Đặng Ngọc Lan**, recall specialist at Cơ quan Quản lý An toàn
Thực phẩm.

![Scenario-controlled handoff required before commitment](44-stage-9-authority-handoff-required.png)

![Active trusted regulator context](45-stage-9-regulator-trusted-context.png)

The command does not contain learner-entered identity. The orchestrator derives
actor, organization, and role metadata from the active trusted context.

![Authorized recall proposal](46-stage-9-authorized-recall-proposal.png)

If the learner submits while still acting as the retailer, the system creates an
attempt-audit event and no ledger mutation. The scope and evidence can still be
scored and discussed; the learner must then complete the regulator handoff and
authorized resubmission before the stage can finish.

### Signature, validation, and commitment

Under the regulator context:

- Ed25519 signature: valid
- signer: Cơ quan Quản lý An toàn Thực phẩm
- identity: recognized
- key: active
- action: authorized
- endorsement policy: not applicable

![Valid and authorized regulator signature](47-stage-9-valid-authorized-recall-signature.png)

The proposal passes authorization, organization, asset-existence, and timestamp
rules, is ordered, and then requires a separate **Ghi giao dịch vào khối**
commit action.

![Recall validation and ordering](48-stage-9-recall-validation-and-ordering.png)

Earlier decisions are reconstructed rather than copied as contradictory derived
values:

- recall evidence strength: strong
- records needing manual review: 0

![Recall evidence reconstructed from earlier decisions](49-stage-9-reconstructed-recall-evidence.png)

After commitment:

- `TX_000014`
- `BLK_000014`
- ordered at 11:00, 5 July 2026
- organization: `ORG_REGULATOR`
- transaction SHA-256:
  `39262492fe519166b526f812108b11c9744cbc7a51104011ffe21bcdff739cd5`
- previous-block SHA-256:
  `fb0f07ac852d8f22f9a115ed23d8361bfcbcbf957f48d9dc7f47295785bbd1c2`
- recall-block SHA-256:
  `e51682adfa6201c0a97c84e7e202b639ff4845320b9a9840c6625cd5eb621f0c`

![Recall committed and affected lineage marked recalled](50-stage-9-recall-committed.png)

### Final conceptual question

Blockchain has a clearer justification than a conventional centralized database
when:

> multiple independent organizations need to share records but do not want one
> organization to control the entire system.

If only one organization owns and controls the data, a conventional database is
often simpler, faster, and cheaper. Blockchain also does not guarantee that
submitted data are true.

## 7. The complete accepted ledger

| Time | Transaction | Organization | Action | Block |
|---|---|---|---|---|
| 09:00 10/12/2025 | `TX_000001` | Hợp tác xã Cà phê Cao nguyên | Create lot | `BLK_000001` |
| 10:00 15/01/2026 | `TX_000002` | Trung tâm Chứng nhận Nông sản | Record document | `BLK_000002` |
| 10:00 15/01/2026 | `TX_000003` | Trung tâm Chứng nhận Nông sản | Issue certificate | `BLK_000003` |
| 08:00 16/06/2026 | `TX_000004` | Hợp tác xã Cà phê Cao nguyên | Transfer custody | `BLK_000004` |
| 09:00 16/06/2026 | `TX_000005` | Hợp tác xã Cà phê Cao nguyên | Record manifest | `BLK_000005` |
| 16:30 16/06/2026 | `TX_000006` | Công ty Vận tải Liên Việt | Record transport condition | `BLK_000006` |
| 09:00 17/06/2026 | `TX_000007` | Nhà máy Rang xay An Việt | Receive lot | `BLK_000007` |
| 09:00 17/06/2026 | `TX_000008` | Hợp tác xã Cà phê Cao nguyên | Transfer ownership | `BLK_000008` |
| 10:00 17/06/2026 | `TX_000009` | Nhà máy Rang xay An Việt | Append correction | `BLK_000009` |
| 08:00 18/06/2026 | `TX_000010` | Nhà máy Rang xay An Việt | Transform lot | `BLK_000010` |
| 09:00 19/06/2026 | `TX_000011` | Nhà máy Rang xay An Việt | Package | `BLK_000011` |
| 10:00 20/06/2026 | `TX_000012` | Nhà máy Rang xay An Việt | Transfer ownership | `BLK_000012` |
| 08:00 22/06/2026 | `TX_000013` | Nhà phân phối Thành Công | Deliver | `BLK_000013` |
| 11:00 05/07/2026 | `TX_000014` | Cơ quan Quản lý An toàn Thực phẩm | Recall | `BLK_000014` |

Only accepted ledger-mutation events appear in this table. Proposal collection,
endorsement steps, role handoffs, decisions, and rejected audit attempts remain
available to replay and reporting without pretending to be ledger transactions.

## 8. Final current state

The three assets in the affected lineage are all recalled and not saleable:

| Asset | Quantity | Owner / custodian | Final lifecycle | Final version |
|---|---:|---|---|---:|
| `BAT_GREEN_COFFEE_001` | 100 kg | Nhà máy Rang xay An Việt | Recalled | 10 |
| `BAT_ROASTED_COFFEE_001` | 82 kg | Nhà máy Rang xay An Việt | Recalled | 3 |
| `BAT_PACKAGED_COFFEE_001` | 820 packages | Siêu thị Việt Market | Recalled | 4 |

The distractor assets remain unaffected and saleable where authored.

![Final current-state projection, including affected and distractor assets](62-reference-final-current-state.png)

This is an important state-version example: one accepted recall command affects
several existing assets, and each affected asset increments exactly once.

## 9. Final report and causal interpretation

### Academic result

![Final total score](56-final-total-score.png)

![Final score breakdown](57-final-score-breakdown.png)

The original 1,000 kg manifest remains visible alongside the effective 100 kg
corrected value.

![Final append-only correction history](58-final-correction-history.png)

### Diagnostic dimensions

These explain the effects of decisions. They do not create a competing second
grade.

| Dimension | Result |
|---|---:|
| Traceability | 100/100 |
| Data integrity | 100/100 |
| Compliance | 100/100 |
| Consumer safety | 100/100 |
| Operational efficiency | 100/100 |
| Governance quality | 100/100 |
| Recall-evidence strength | Strong |

![Final diagnostic dimensions](52-final-diagnostic-dimensions.png)

### Causal explanations generated from the run

The final report states that:

1. Stage 3 certificate and issuer verification, with the document off chain and
   its hash on chain, made the evidence reusable in Stage 9 without additional
   review.
2. The Stage 3 valid-but-unauthorized transporter signature created audit
   evidence only.
3. Certificate commitment occurred only after signature, identity, key status,
   and role authorization were checked.
4. Recall commitment occurred only after regulator signature and authority were
   verified.
5. Custody transfer required both current and receiving custodians to endorse
   the same proposal and state version.
6. Quantity correction required processor and producer to endorse the same
   append-only correction.
7. The Stage 5 evidence-supported correction preserved both the original and
   effective manifest values for audit.
8. The Stage 9 recall followed provenance and avoided both missed affected lots
   and unnecessary recall.
9. The recall committed under the trusted authorized context without an
   authorization retry.

![Decision-to-consequence explanations](53-final-decision-to-consequence-explanations.png)

Run summary:

- hints: 0
- rejected ledger transactions: 0
- accepted transactions: 14
- blocks: 14
- manual-review records: 0
- scenario: `SCN_COFFEE_001@2.3.0`
- configuration:
  `c7c3c3236c7a2dae18aa8499dcef70df0a1a460b0a74e9bccec5f48490942a40`

![Final run summary and version identifiers](54-final-run-summary-and-identifiers.png)

![Result sent successfully to the learning system](55-result-sent-to-lms.png)

![Moodle attempt and reported grade confirmation](61-moodle-attempt-grade-confirmation.png)

## 10. Suggested classroom debrief

### Integrity versus truth

- Which Stage 3 checks support integrity?
- Which evidence supports the truth of the certificate?
- If a recognized certifier signs false content, which checks still pass?

### Authentication versus authorization

- Why did the transporter’s genuine signature fail?
- What would be dangerous about letting a learner type the signer organization
  into the command?
- Why is key activity a separate question from organizational authority?

### Endorsement

- What dispute does sender-and-receiver endorsement prevent?
- Why must both organizations sign the same digest?
- Could a satisfied endorsement policy still fail at commitment because the
  asset version changed?

### Corrections and auditability

- Why is overwriting the manifest attractive operationally?
- What evidence is lost by overwrite?
- How does an append-only correction distinguish “what was asserted then” from
  “what is effective now”?

### Provenance and recall

- Why is `BAT_PACKAGED_COFFEE_002` a strong distractor?
- What is the cost of an overly broad recall?
- What is the safety consequence of an overly narrow recall?
- Which earlier decisions made the final scope easier to defend?

### Appropriate use of blockchain

- Which case relationships justify a shared permissioned ledger?
- Which data would be better kept in a conventional database or document store?
- If the consortium had only one organization, which parts of the architecture
  would no longer be justified?

## 11. Instructor cautions

- Do not present the perfect path as the only professional discussion. The
  simulation intentionally supports bounded mistakes and mitigation.
- Do not say that blockchain prevents editing. It makes unauthorized changes
  detectable when participants verify integrity.
- Do not say that a signature proves truth. It binds an educational key to exact
  content.
- Do not call endorsement “network consensus.” It is a business approval policy
  over one proposal.
- Do not imply that every datum belongs on chain.
- Do not infer contamination from the Stage 4 humidity exceedance alone.
- Do not identify affected products by similar names or dates; use provenance.
- Keep the original and effective manifest values visible during debrief.

## 12. Capture and verification notes

- The walkthrough used a real Chromium browser and the deployed Moodle SCORM
  player at `http://localhost:8080`.
- The result was committed to Moodle and the activity page reported attempt 1
  and grade 100%.
- Screenshots were cropped only to remove empty browser canvas; their visible UI
  content was not redrawn or synthesized.
- The only browser console error was a Moodle theme request for
  `theme/yui_image.php?.../arrows.png` returning 404. No SimuLedger application
  error was observed during the complete attempt.
- The directory contains 63 screenshots, including intermediate states not all
  embedded in this narrative.
