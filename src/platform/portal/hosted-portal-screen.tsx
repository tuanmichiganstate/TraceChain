import { useEffect, useState, type ReactNode } from "react";
import { useTranslator } from "../../app/providers/locale-provider";
import type { ApplicationRole } from "../contracts/run-events";

interface PortalSession {
  readonly userId: string;
  readonly email: string;
  readonly roles: readonly ApplicationRole[];
}

export interface HostedPortalApi {
  loadSession(): Promise<PortalSession>;
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function createHostedPortalApi(
  fetcher: FetchLike = globalThis.fetch.bind(globalThis),
): HostedPortalApi {
  return {
    async loadSession() {
      const response = await fetcher("/api/v1/session", {
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("HOSTED_SESSION_UNAVAILABLE");
      return response.json() as Promise<PortalSession>;
    },
  };
}

const browserApi = createHostedPortalApi();

export function HostedPortalScreen({
  api = browserApi,
}: {
  readonly api?: HostedPortalApi;
}): ReactNode {
  const t = useTranslator();
  const [session, setSession] = useState<PortalSession | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void api.loadSession().then(
      (loaded) => {
        if (active) setSession(loaded);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [api]);

  const roles = session?.roles ?? [];
  const mayLearn = roles.includes("learner");
  const mayReview = roles.some((role) =>
    ["instructor", "rater", "administrator"].includes(role)
  );
  const mayManageAuthor = roles.some((role) =>
    ["scenario-author", "administrator"].includes(role)
  );
  const mayBrowseScenarios =
    mayManageAuthor || roles.includes("instructor");

  return (
    <>
      <a className="skip-link" href="#main-content">
        {t("navigation.skip")}
      </a>
      <main className="start" id="main-content">
        <div className="start__inner">
          <header className="instructor-review__header">
            <p className="eyebrow">{t("hostedPortal.eyebrow")}</p>
            <h1>{t("hostedPortal.title")}</h1>
            <p className="start__subtitle">
              {t("hostedPortal.subtitle")}
            </p>
          </header>
          {failed ? (
            <p className="notice notice--standalone" role="alert">
              {t("hostedPortal.error")}
            </p>
          ) : session === null ? (
            <p role="status">{t("hostedPortal.loading")}</p>
          ) : (
            <>
              <section className="card card--reference">
                <h2>{t("hostedPortal.account")}</h2>
                <p>{session.email}</p>
              </section>
              <section className="card card--work">
                <h2>{t("hostedPortal.workspaces")}</h2>
                <div className="instructor-review__form-grid">
                  {mayLearn ? (
                    <WorkspaceLink
                      href="/learner"
                      title={t("hostedPortal.learner.title")}
                      description={t(
                        "hostedPortal.learner.description",
                      )}
                      action={t("hostedPortal.open")}
                    />
                  ) : null}
                  {mayReview ? (
                    <WorkspaceLink
                      href="/instructor"
                      title={t("hostedPortal.instructor.title")}
                      description={t(
                        "hostedPortal.instructor.description",
                      )}
                      action={t("hostedPortal.open")}
                    />
                  ) : null}
                  {mayBrowseScenarios ? (
                    <WorkspaceLink
                      href="/author"
                      title={t(
                        mayManageAuthor
                          ? "hostedPortal.author.title"
                          : "hostedPortal.library.title",
                      )}
                      description={t(
                        mayManageAuthor
                          ? "hostedPortal.author.description"
                          : "hostedPortal.library.description",
                      )}
                      action={t("hostedPortal.open")}
                    />
                  ) : null}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}

function WorkspaceLink({
  href,
  title,
  description,
  action,
}: {
  readonly href: string;
  readonly title: string;
  readonly description: string;
  readonly action: string;
}): ReactNode {
  return (
    <article className="card card--reference">
      <h3>{title}</h3>
      <p>{description}</p>
      <a className="button button--secondary" href={href}>
        {action}
      </a>
    </article>
  );
}
