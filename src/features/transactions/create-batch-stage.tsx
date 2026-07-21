import { useState, type ReactNode } from "react";
import {
  AssetType,
  QuantityUnit,
  ScenarioStageId,
  TransactionStatus,
  TransactionType,
} from "../../domain/types/enums";
import type { CreateBatchCommand } from "../../domain/commands/commands";
import type { LedgerTransaction } from "../../domain/types/models";
import { useTranslator } from "../../app/providers/locale-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { TransactionPipeline } from "../../components/transaction-pipeline";
import { ValidationResults } from "../../components/validation-results";
import { AssetCard } from "../../components/asset-card";
import { LedgerExplorer } from "../../components/ledger-explorer";
import {
  ActorId,
  LocationId,
  OrganizationId,
  organizationsById,
} from "../../scenarios/coffee-traceability/organizations";
import { SCENARIO_TIMELINE } from "../../scenarios/coffee-traceability/timeline";

const DECISION_ID = "INT_CREATE_BATCH";
const ASSET_ID = "BAT_GREEN_COFFEE_001";

/**
 * Stage 2. The learner records the harvested batch, watches it move through the
 * transaction lifecycle, and sees the first block form.
 *
 * Most fields are fixed scenario facts rather than free input. The learning
 * objective here is the *lifecycle* -- propose, validate, endorse, order,
 * commit -- not data entry, and an eight-field form repeated across fifteen
 * transactions is where the session time budget disappears.
 */
export function CreateBatchStage(): ReactNode {
  const t = useTranslator();
  const { state, submitCommand, recordDecision, completeStage } = useSimulation();
  const [quantity, setQuantity] = useState("100");
  const [result, setResult] = useState<{
    transaction: LedgerTransaction;
    isValid: boolean;
  } | null>(null);

  const asset = state.domain.assetsById[ASSET_ID];
  const producer = organizationsById[OrganizationId.PRODUCER_COOP];

  const handleSubmit = (): void => {
    const command: CreateBatchCommand = {
      commandType: TransactionType.CREATE_BATCH,
      assetId: ASSET_ID,
      assetType: AssetType.GREEN_COFFEE_BATCH,
      productName: "Arabica green coffee",
      originLocation: "Lam Dong",
      productionDate: SCENARIO_TIMELINE.batchCreated,
      quantity: Number(quantity),
      quantityUnit: QuantityUnit.KG,
      packageSizeGrams: null,
      producerOrganizationId: OrganizationId.PRODUCER_COOP,
      locationId: LocationId.PRODUCER_FARM,
      initiatedByActorId: ActorId.PRODUCER_MANAGER,
      // From the scenario clock, never the learner's system clock, so the
      // resulting hashes are identical on every machine.
      scenarioTimestamp: SCENARIO_TIMELINE.batchCreated,
    };

    const outcome = submitCommand(command, {
      actorId: ActorId.PRODUCER_MANAGER,
      organizationId: OrganizationId.PRODUCER_COOP,
    });

    recordDecision(DECISION_ID, outcome.isAccepted ? 1 : 0);
    setResult({ transaction: outcome.transaction, isValid: outcome.isAccepted });
  };

  const isCommitted = result?.transaction.transactionStatus === TransactionStatus.COMMITTED;

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
              <code>{ASSET_ID}</code>
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
            disabled={result !== null}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </div>

        <p className="muted">{t("transaction.signatureNotice")}</p>

        {result === null ? (
          <button type="button" className="button button--primary" onClick={handleSubmit}>
            {t("transaction.submit")}
          </button>
        ) : null}
      </section>

      {result !== null ? (
        <section className="card">
          <TransactionPipeline
            status={result.transaction.transactionStatus}
            blockId={result.transaction.blockId}
            failureCount={result.transaction.validationResults.filter((r) => r.status === "FAILED").length}
          />
          <ValidationResults
            results={result.transaction.validationResults}
            isValid={result.isValid}
          />

          {result.transaction.endorsementResults.length > 0 ? (
            <section className="endorsements">
              <h3>{t("endorsement.heading")}</h3>
              <ul>
                {result.transaction.endorsementResults.map((endorsement) => {
                  const organization = organizationsById[endorsement.endorsingOrganizationId];
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

          {!result.isValid ? (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setResult(null)}
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

      {isCommitted ? (
        <>
          <LedgerExplorer state={state.domain} />
          <div className="notice">
            <p>{t("stage.createBatch.sealBlockHelp")}</p>
          </div>
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
