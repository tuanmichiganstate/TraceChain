/**
 * The scenario timeline (closes a gap in specification section 17.3).
 *
 * Three validation rules -- RULE_TIMESTAMP_SEQUENCE_VALID,
 * RULE_SHIPMENT_BEFORE_RECEIPT and RULE_CERTIFICATE_NOT_EXPIRED -- all depend on
 * ordered scenario times, but the specification contained exactly one concrete
 * timestamp: the humidity sensor reading. Every other date is fixed here.
 *
 * All values are UTC. The learner's system clock and timezone never enter a
 * domain event, so hashes are identical on every machine (section 17.3).
 *
 * On the dates: Lam Dong Arabica is harvested around December, and green coffee
 * is warehoused for months before shipment. A December harvest reaching the
 * roaster the following June is the ordinary case, not an anomaly.
 */

export const SCENARIO_TIMELINE = {
  /** Stage 2 -- the co-operative records the harvested batch. */
  batchCreated: "2025-12-10T02:00:00.000Z",

  /** Stage 3 -- quality certificate, valid for one year. */
  certificateIssued: "2026-01-15T03:00:00.000Z",
  certificateExpires: "2027-01-15T03:00:00.000Z",

  /**
   * Stage 4 -- the shipping clerk files the dispatch manifest. This record
   * carries the 1000 kg transcription error, and it is committed before the
   * learner's shift begins, so every learner meets the correction mechanic in
   * stage 5 rather than only those who fail to spot a typo.
   */
  dispatchManifestFiled: "2026-06-15T23:00:00.000Z",

  /** Stage 4 -- custody moves to the carrier; ownership does not. */
  custodyTransferred: "2026-06-16T01:00:00.000Z",

  /** Stage 4 -- humidity 72% against a 70% limit. Fixed by the specification. */
  sensorReading: "2026-06-16T09:30:00.000Z",

  /** Stage 5 -- the processor weighs the delivery and finds 100 kg, not 1000. */
  batchReceived: "2026-06-17T02:00:00.000Z",
  correctionRecorded: "2026-06-17T03:00:00.000Z",

  /** Stage 6 -- 100 kg green becomes 82 kg roasted. */
  batchRoasted: "2026-06-18T01:00:00.000Z",

  /** Stage 7 -- 82 kg becomes 820 packages of 100 g, then moves downstream. */
  batchPackaged: "2026-06-19T02:00:00.000Z",
  ownershipTransferred: "2026-06-20T03:00:00.000Z",
  batchDispatched: "2026-06-22T01:00:00.000Z",

  /** Stage 9 -- the laboratory result that triggers the recall. */
  laboratoryResult: "2026-07-05T04:00:00.000Z",

  /*
   * The near-miss distractor chain (see seed-assets.ts). Every date here is
   * deliberately adjacent to the learner's own batch: harvested one day later,
   * roasted the *same* day, packaged the same day. A learner filtering by date
   * rather than following provenance sweeps this lot up by mistake.
   */
  distractorBatchHarvested: "2025-12-11T02:00:00.000Z",
  distractorBatchRoasted: "2026-06-18T05:00:00.000Z",
  distractorBatchPackaged: "2026-06-19T06:00:00.000Z",

  /** The unrelated control lot: different variety, different region. */
  unrelatedLotPackaged: "2026-05-02T03:00:00.000Z",
} as const;

export type ScenarioTimelineKey = keyof typeof SCENARIO_TIMELINE;

/**
 * Ordering constraints the scenario must satisfy, checked at build time by
 * `npm run validate:scenario` so a content author cannot introduce a timeline
 * that makes a stage unreachable.
 */
export const TIMELINE_ORDERING_CONSTRAINTS: ReadonlyArray<
  readonly [ScenarioTimelineKey, ScenarioTimelineKey, string]
> = [
  ["batchCreated", "certificateIssued", "A batch must exist before it can be certified"],
  [
    "certificateIssued",
    "dispatchManifestFiled",
    "Certification precedes dispatch in this scenario",
  ],
  [
    "dispatchManifestFiled",
    "custodyTransferred",
    "The manifest is filed before the carrier takes custody",
  ],
  [
    "custodyTransferred",
    "sensorReading",
    "Transport conditions are recorded while the carrier holds the batch",
  ],
  ["sensorReading", "batchReceived", "Shipment must precede receipt"],
  ["batchReceived", "correctionRecorded", "A receipt must exist before it can be corrected"],
  ["correctionRecorded", "batchRoasted", "Transformation happens after receipt"],
  ["batchRoasted", "batchPackaged", "Roasted coffee must exist before it is packaged"],
  ["batchPackaged", "ownershipTransferred", "The packaged lot must exist before it is sold"],
  ["ownershipTransferred", "batchDispatched", "Ownership transfers before dispatch"],
  ["batchDispatched", "laboratoryResult", "The recall is discovered after distribution"],
  [
    "batchCreated",
    "certificateExpires",
    "The certificate must not expire before the batch exists",
  ],

  // The distractor chain must itself be internally coherent, or the recall
  // exercise rests on data that could not have happened.
  [
    "distractorBatchHarvested",
    "distractorBatchRoasted",
    "The distractor batch must be harvested before it is roasted",
  ],
  [
    "distractorBatchRoasted",
    "distractorBatchPackaged",
    "The distractor batch must be roasted before it is packaged",
  ],
  [
    "distractorBatchPackaged",
    "laboratoryResult",
    "The distractor lot must be on the shelf before the recall is investigated",
  ],
];
