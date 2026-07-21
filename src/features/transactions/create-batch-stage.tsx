import { useState, type ReactNode } from "react";
import {
  AssetType,
  QuantityUnit,
  ScenarioStageId,
  TransactionStatus,
  TransactionType,
} from "../../domain/types/enums";
import type { CreateBatchCommand } from "../../domain/commands/commands";
import { useTranslator } from "../../app/providers/locale-provider";
import { useScenario } from "../../app/providers/scenario-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { TransactionPipeline } from "../../components/transaction-pipeline";
import { ValidationResults } from "../../components/validation-results";
import { AssetCard } from "../../components/asset-card";
import { LedgerExplorer } from "../../components/ledger-explorer";
import {
  ActorId,
  LocationId,
  OrganizationId,
} from "../../scenarios/coffee-traceability/organizations";
import { GREEN_COFFEE_BATCH_ID } from "../../scenarios/coffee-traceability/stages";

const DECISION_ID = "INT_CREATE_BATCH";

/**
 * Stage 2. The learner records the harvested batch, watches it move through the
 * transaction lifecycle, and seals the first block.
 *
 * Most fields are fixed scenario facts rather than free input. The learning
 * objective here is the *lifecycle* -- propose, validate, endorse, order,
 * commit -- not data entry, and an eight-section form repeated across fifteen
 * transactions is where the session time budget disappears.
 *
 * The block is sealed by an explicit action rather than automatically. The
 * ledger runs in STAGE_BOUNDARY mode, so a transaction sits ORDERED in the
 * pending queue until something seals it. Making that a button the learner
 * presses is the point of this stage: ordering and commitment are separate
 * steps, and here you can watch the second one happen.
 */
export function CreateBatchStage(): ReactNode {
  const t = useTranslator();
  const { scenario } = useScenario();
  const { state, submitCommand, sealPendingBlock, recordDecision, completeStage } =
    useSimulation();
  const [quantity, setQuantity] = useState("100");
  const [transactionId, setTransactionId] = useState<string | null>(null);

  // Derived from live state rather than captured at submit time, so the
  // pipeline reflects the transaction's real status after sealing.
  const transaction =
    transactionId === null ? undefined : state.domain.transactionsById[transactionId];
  const asset = state.domain.assetsById[GREEN_COFFEE_BATCH_ID];
  const producer = scenario.organizations.find(
    (organization) => organization.organizationId === OrganizationId.PRODUCER_COOP,
  );

  const isOrdered = transaction?.transactionStatus === TransactionStatus.ORDERED;
  const isCommitted = transaction?.transactionStatus === TransactionStatus.COMMITTED;
  const isRejected = transaction?.transactionStatus === TransactionStatus.REJECTED;

  const handleSubmit = (): void => {
    const command: CreateBatchCommand = {
      commandType: TransactionType.CREATE_BATCH,
      assetId: GREEN_COFFEE_BATCH_ID,
      assetType: AssetType.GREEN_COFFEE_BATCH,
      productName: "Arabica green coffee",
      originLocation: "Lam Dong",
      productionDate: scenario.timeline["batchCreated"] as string,
      quantity: Number(quantity),
      quantityUnit: QuantityUnit.KG,
      packageSizeGrams: null,
      producerOrganizationId: OrganizationId.PRODUCER_COOP,
      locationId: LocationId.PRODUCER_FARM,
      initiatedByActorId: ActorId.PRODUCER_MANAGER,
      // From the scenario clock, never the learner's system clock, so the
      // resulting hashes are identical on every machine.
      scenarioTimestamp: scenario.timeline["batchCreated"] as string,
    };

    const outcome = submitCommand(command, {
      actorId: ActorId.PRODUCER_MANAGER,
      organizationId: OrganizationId.PRODUCER_COOP,
    });

    recordDecision(DECISION_ID, outcome.isAccepted ? 1 : 0);
    setTransactionId(outcome.transaction.transactionId);
  };

  return (
    <div className="stage stack">
      <header>
        <h2>{t("stage.createBatch.title")}</h2>
        <p>{t("stage.createBatch.instruction")}</p>
      </header>

      <section className="card">
        <h3>{t("stage.createBatch.formHeading")}</h3>

        <dl className="asset-card__grid">
          <div className="asset-card__row">
            <dt>{t("field.assetId")}</dt>
            <dd>
              <code>{GREEN_COFFEE_BATCH_ID}</code>
            </dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("field.productName")}</dt>
            <dd>Arabica</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("field.originLocation")}</dt>
            <dd>{t("locations.producerFarm.name")}</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("field.owner")}</dt>
            <dd>{producer === undefined ? "" : t(producer.displayNameKey)}</dd>
          </div>
        </dl>

        <div className="field">
          <label className="field__label" htmlFor="quantity-input">
            {t("field.quantity")} ({t("unit.KG")})
          </label>
          <input
            id="quantity-input"
            className="field__control"
            type="number"
            inputMode="decimal"
            min="0"
            value={quantity}
            disabled={transaction !== undefined && !isRejected}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </div>

        <p className="muted">{t("transaction.signatureNotice")}</p>

        {transaction === undefined ? (
          <button type="button" className="button button--primary" onClick={handleSubmit}>
            {t("transaction.submit")}
          </button>
        ) : null}
      </section>

      {transaction !== undefined ? (
        <section className="card">
          <TransactionPipeline
            status={transaction.transactionStatus}
            blockId={transaction.blockId}
            failureCount={
              transaction.validationResults.filter((result) => result.status === "FAILED").length
            }
          />
          <ValidationResults
            results={transaction.validationResults}
            isValid={!isRejected}
          />

          {transaction.endorsementResults.length > 0 ? (
            <section className="endorsements">
              <h3>{t("endorsement.heading")}</h3>
              <ul>
                {transaction.endorsementResults.map((endorsement) => {
                  const organization = scenario.organizations.find(
                    (candidate) =>
                      candidate.organizationId === endorsement.endorsingOrganizationId,
                  );
                  const name =
                    organization === undefined
                      ? endorsement.endorsingOrganizationId
                      : t(organization.displayNameKey);
                  return (
                    <li key={endorsement.endorsingOrganizationId}>
                      {t(
                        endorsement.isSimulatedCounterparty
                          ? "endorsement.simulatedCounterparty"
                          : "endorsement.byOrganization",
                        { organization: name },
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="muted">{t("endorsement.notice")}</p>
            </section>
          ) : null}

          {isRejected ? (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setTransactionId(null)}
            >
              {t("transaction.edit")}
            </button>
          ) : null}
        </section>
      ) : null}

      {asset !== undefined ? (
        <section>
          <h3>{t("state.title")}</h3>
          <AssetCard asset={asset} />
        </section>
      ) : null}

      {/*
        The transaction is ordered but not yet in a block. This is the moment
        the stage exists to show, so it is an explicit action rather than
        something that happens invisibly.
      */}
      {isOrdered ? (
        <section className="card">
          <div className="notice">
            <p>{t("stage.createBatch.sealBlockHelp")}</p>
          </div>
          <button
            type="button"
            className="button button--primary"
            onClick={() => sealPendingBlock(scenario.timeline["batchCreated"] as string)}
          >
            {t("stage.createBatch.sealBlock")}
          </button>
        </section>
      ) : null}

      {isCommitted ? (
        <>
          <LedgerExplorer state={state.domain} />
          <button
            type="button"
            className="button button--primary"
            onClick={() => completeStage(ScenarioStageId.CREATE_BATCH)}
          >
            {t("navigation.continue")}
          </button>
        </>
      ) : null}
    </div>
  );
}
