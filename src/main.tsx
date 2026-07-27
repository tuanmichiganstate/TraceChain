import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app";
import { LocaleProvider } from "./app/providers/locale-provider";
import { ScenarioProvider } from "./app/providers/scenario-provider";
import { SimulationProvider } from "./app/providers/simulation-provider";
import { ConfigurationProvider } from "./app/providers/configuration-provider";
import { NotificationProvider } from "./app/providers/notification-provider";
import {
  loadEmbeddedConfiguration,
  loadRuntimePackage,
} from "./config/runtime-loader";
import { loadAuditRuntimePackage } from "./config/audit-runtime-loader";
import { isAuditSimulationConfiguration } from "./config/types";
import { initializeRuntimeAttempt } from "./config/runtime-bootstrap";
import {
  createTranslator,
  type LocaleCode,
} from "./localization/i18n";
import { InstructorReviewScreen } from "./platform/instructor/instructor-review-screen";
import { ScenarioAuthorScreen } from "./platform/author/scenario-author-screen";
import { HostedLearnerScreen } from "./platform/learner/hosted-learner-screen";
import { HostedPortalScreen } from "./platform/portal/hosted-portal-screen";
import { ApplicationAccessScreen } from "./platform/admin/application-access-screen";
import { AuditScormApp } from "./platform/audit/audit-scorm-app";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Root element #root is missing from index.html");
}

const root = createRoot(container);

function hostedInterfaceLocale(): LocaleCode {
  return new URLSearchParams(window.location.search).get("locale") === "en"
    ? "en"
    : "vi";
}

if (
  import.meta.env.DEV &&
  /^\/workspace-prototypes\/?$/u.test(window.location.pathname)
) {
  const locale = hostedInterfaceLocale();
  document.documentElement.lang = locale;
  void import("./prototypes/workspace-architecture-prototype-screen").then(
    ({ WorkspaceArchitecturePrototypeScreen }) => {
      root.render(
        <StrictMode>
          <LocaleProvider locale={locale}>
            <NotificationProvider>
              <WorkspaceArchitecturePrototypeScreen />
            </NotificationProvider>
          </LocaleProvider>
        </StrictMode>,
      );
    },
  );
} else if (
  /^\/(?:platform|instructor|author|learner|admin)\/?$/u.test(
    window.location.pathname,
  )
) {
  const locale = hostedInterfaceLocale();
  document.documentElement.lang = locale;
  root.render(
    <StrictMode>
      <LocaleProvider locale={locale}>
        <NotificationProvider>
          {/^\/platform\/?$/u.test(window.location.pathname) ? (
            <HostedPortalScreen />
          ) : /^\/admin\/?$/u.test(window.location.pathname) ? (
            <ApplicationAccessScreen />
          ) : /^\/author\/?$/u.test(window.location.pathname) ? (
            <ScenarioAuthorScreen />
          ) : /^\/learner\/?$/u.test(window.location.pathname) ? (
            <HostedLearnerScreen />
          ) : (
            <InstructorReviewScreen />
          )}
        </NotificationProvider>
      </LocaleProvider>
    </StrictMode>,
  );
} else {
  const fetchRuntime = (path: string) => fetch(path);
  void loadEmbeddedConfiguration(fetchRuntime)
    .then(async (embedded) => {
      if (isAuditSimulationConfiguration(embedded.configuration)) {
        const runtime = await loadAuditRuntimePackage(fetchRuntime);
        document.documentElement.lang = runtime.configuration.locale;
        root.render(
          <StrictMode>
            <LocaleProvider locale={runtime.configuration.locale}>
              <NotificationProvider>
                <AuditScormApp runtime={runtime} />
              </NotificationProvider>
            </LocaleProvider>
          </StrictMode>,
        );
        return null;
      }
      return loadRuntimePackage(fetchRuntime).then((runtime) =>
        initializeRuntimeAttempt(runtime),
      );
    })
    .then(
      (runtime) => {
        if (runtime === null) return;
        document.documentElement.lang = runtime.configuration.locale;
        root.render(
          <StrictMode>
            <ConfigurationProvider
              configuration={runtime.configuration}
              configurationHash={runtime.configurationHash}
              cryptographicRuntime={runtime.cryptographicRuntime}
              variantBank={runtime.variantBank}
            >
              <LocaleProvider locale={runtime.configuration.locale}>
                <NotificationProvider>
                  <ScenarioProvider scenario={runtime.scenario}>
                    <SimulationProvider
                      platformBootstrap={runtime.platformBootstrap}
                    >
                      <App />
                    </SimulationProvider>
                  </ScenarioProvider>
                </NotificationProvider>
              </LocaleProvider>
            </ConfigurationProvider>
          </StrictMode>,
        );
      },
      (error: unknown) => {
        const t = createTranslator("vi");
        console.error(error);
        root.render(
          <StrictMode>
            <main className="start" id="main-content">
              <div className="start__inner">
                <section className="card">
                  <h1>{t("errors.packageConfigurationHeading")}</h1>
                  <p>{t("errors.packageConfiguration")}</p>
                </section>
              </div>
            </main>
          </StrictMode>,
        );
      },
    );
}
