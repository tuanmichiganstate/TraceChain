import type { ReactNode } from "react";
import { useTranslator } from "../../app/providers/locale-provider";
import { organizations } from "../../scenarios/coffee-traceability/organizations";
import coffeeJourneyImage from "../../assets/illustrations/coffee-journey.webp";

/**
 * The physical supply chain.
 *
 * Built from semantic HTML rather than an SVG graph, so it is keyboard
 * reachable, reflows at 320 px, and needs no separate text alternative -- the
 * accessible version *is* the visible version (specification section 18.9).
 * A graph library would have added weight for no benefit at this size.
 */
export function SupplyChainDiagram(): ReactNode {
  const t = useTranslator();
  // The regulator observes rather than sitting in the physical flow.
  const flow = organizations.filter(
    (organization) =>
      organization.isActive && organization.organizationId !== "ORG_REGULATOR",
  );

  return (
    <figure className="supply-chain">
      <div className="supply-chain__image-wrap">
        <img
          className="supply-chain__image"
          src={coffeeJourneyImage}
          width={1672}
          height={941}
          loading="lazy"
          decoding="async"
          alt=""
        />
        <p className="supply-chain__image-caption">{t("stage.orientation.journeyCaption")}</p>
      </div>
      <figcaption className="supply-chain__caption">
        {t("stage.orientation.supplyChainAlt")}
      </figcaption>
      <div className="supply-chain__flow-scroll">
        <ol className="supply-chain__flow">
          {flow.map((organization, index) => (
            <li key={organization.organizationId} className="supply-chain__node">
              <span className="supply-chain__step" aria-hidden="true">
                {index + 1}
              </span>
              <span className="supply-chain__name">{t(organization.displayNameKey)}</span>
              {index < flow.length - 1 ? (
                <span className="supply-chain__arrow" aria-hidden="true">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
}
