import { unzipSync, strFromU8 } from "fflate";
import { JSON_SCHEMA, load as loadYaml } from "js-yaml";
import pharmaceuticalPackTemplate from "../../../scenario-packs/pharmaceutical-cold-chain/tracechain.pack.json";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslator } from "../../app/providers/locale-provider";
import type { LocaleCode } from "../../localization/i18n";
import type { ApplicationRole } from "../contracts/run-events";
import type {
  ScenarioPackComparisonV1,
  ScenarioPackListItemV1,
  ScenarioPackValidationReportV1,
  ScenarioRolePreviewV1,
} from "../contracts/scenario-authoring";
import type {
  HostedRunMode,
  ScenarioPackV1,
} from "../contracts/scenario-pack";

const MAXIMUM_IMPORT_BYTES = 2 * 1024 * 1024;

interface AuthorSession {
  readonly userId: string;
  readonly email: string;
  readonly roles: readonly ApplicationRole[];
}

export interface ScenarioAuthoringApi {
  loadSession(): Promise<AuthorSession>;
  listPacks(): Promise<readonly ScenarioPackListItemV1[]>;
  validatePack(candidate: unknown): Promise<ScenarioPackValidationReportV1>;
  importPack(candidate: unknown): Promise<ScenarioPackValidationReportV1>;
  loadPack(packId: string, version: string): Promise<ScenarioPackV1>;
  preview(options: {
    readonly packId: string;
    readonly version: string;
    readonly scenarioId: string;
    readonly scenarioVersion: string;
    readonly locale: LocaleCode;
    readonly mode: HostedRunMode;
    readonly roleId: string;
  }): Promise<ScenarioRolePreviewV1>;
  compare(
    packId: string,
    fromVersion: string,
    toVersion: string,
  ): Promise<ScenarioPackComparisonV1>;
  publish(packId: string, version: string): Promise<void>;
  retire(packId: string, version: string): Promise<void>;
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class ScenarioAuthoringApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ScenarioAuthoringApiError";
  }
}

async function apiJson<T>(
  fetcher: FetchLike,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(path, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  const body = (await response.json()) as T & {
    readonly error?: { readonly code?: string };
  };
  if (!response.ok) {
    throw new ScenarioAuthoringApiError(
      body.error?.code ?? "SCENARIO_AUTHORING_REQUEST_FAILED",
    );
  }
  return body;
}

function mutation(
  fetcher: FetchLike,
  path: string,
  body: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  return apiJson(fetcher, path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createScenarioAuthoringApi(
  fetcher: FetchLike = globalThis.fetch.bind(globalThis),
): ScenarioAuthoringApi {
  return {
    async loadSession() {
      return apiJson<AuthorSession>(fetcher, "/api/v1/session");
    },
    async listPacks() {
      return (
        await apiJson<{ readonly packs: readonly ScenarioPackListItemV1[] }>(
          fetcher,
          "/api/v1/scenario-packs",
        )
      ).packs;
    },
    async validatePack(pack) {
      return (
        await apiJson<{ readonly report: ScenarioPackValidationReportV1 }>(
          fetcher,
          "/api/v1/scenario-packs/validate",
          {
            method: "POST",
            body: JSON.stringify({ pack }),
          },
        )
      ).report;
    },
    async importPack(pack) {
      return (
        await apiJson<{ readonly report: ScenarioPackValidationReportV1 }>(
          fetcher,
          "/api/v1/scenario-packs/import",
          {
            method: "POST",
            body: JSON.stringify({ pack }),
          },
        )
      ).report;
    },
    async loadPack(packId, version) {
      return (
        await apiJson<{ readonly pack: ScenarioPackV1 }>(
          fetcher,
          `/api/v1/scenario-packs/${encodeURIComponent(packId)}/versions/${encodeURIComponent(version)}`,
        )
      ).pack;
    },
    async preview(options) {
      const parameters = new URLSearchParams({
        scenarioId: options.scenarioId,
        scenarioVersion: options.scenarioVersion,
        locale: options.locale,
        mode: options.mode,
        roleId: options.roleId,
      });
      return (
        await apiJson<{ readonly preview: ScenarioRolePreviewV1 }>(
          fetcher,
          `/api/v1/scenario-packs/${encodeURIComponent(options.packId)}/versions/${encodeURIComponent(options.version)}/preview?${parameters.toString()}`,
        )
      ).preview;
    },
    async compare(packId, fromVersion, toVersion) {
      const parameters = new URLSearchParams({
        fromVersion,
        toVersion,
      });
      return (
        await apiJson<{ readonly comparison: ScenarioPackComparisonV1 }>(
          fetcher,
          `/api/v1/scenario-packs/${encodeURIComponent(packId)}/compare?${parameters.toString()}`,
        )
      ).comparison;
    },
    async publish(packId, version) {
      await mutation(
        fetcher,
        `/api/v1/scenario-packs/${encodeURIComponent(packId)}/versions/${encodeURIComponent(version)}/publish`,
        {},
      );
    },
    async retire(packId, version) {
      await mutation(
        fetcher,
        `/api/v1/scenario-packs/${encodeURIComponent(packId)}/versions/${encodeURIComponent(version)}/retire`,
        { commandId: `CMD_RETIRE_PACK_${crypto.randomUUID()}` },
      );
    },
  };
}

function parseText(name: string, text: string): unknown {
  if (name.toLowerCase().endsWith(".json")) {
    return JSON.parse(text) as unknown;
  }
  return loadYaml(text, {
    filename: name,
    json: false,
    schema: JSON_SCHEMA,
  });
}

function isEditableScenarioPack(
  candidate: unknown,
): candidate is ScenarioPackV1 {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    return false;
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  return (
    typeof record.packId === "string" &&
    typeof record.version === "string" &&
    Array.isArray(record.scenarios) &&
    record.scenarios.length > 0
  );
}

export function parseScenarioPackBytes(
  name: string,
  bytes: Uint8Array,
): unknown {
  if (bytes.byteLength > MAXIMUM_IMPORT_BYTES) {
    throw new ScenarioAuthoringApiError("IMPORT_FILE_TOO_LARGE");
  }
  if (!name.toLowerCase().endsWith(".zip")) {
    return parseText(
      name,
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  }
  let expandedBytes = 0;
  const archive = unzipSync(bytes, {
    filter(file) {
      expandedBytes += Number.isFinite(file.originalSize)
        ? file.originalSize
        : file.size;
      return expandedBytes <= MAXIMUM_IMPORT_BYTES;
    },
  });
  if (expandedBytes > MAXIMUM_IMPORT_BYTES) {
    throw new ScenarioAuthoringApiError("IMPORT_FILE_TOO_LARGE");
  }
  const entries = Object.entries(archive).filter(([path]) => {
    const basename = path.split("/").at(-1)?.toLowerCase() ?? "";
    return (
      basename === "tracechain.pack.json" ||
      /\.(?:json|ya?ml)$/u.test(basename)
    );
  });
  const preferred =
    entries.find(
      ([path]) =>
        path.split("/").at(-1)?.toLowerCase() ===
        "tracechain.pack.json",
    ) ??
    (entries.length === 1 ? entries[0] : undefined);
  if (preferred === undefined) {
    throw new ScenarioAuthoringApiError("IMPORT_ARCHIVE_AMBIGUOUS");
  }
  return parseText(preferred[0], strFromU8(preferred[1]));
}

async function parseScenarioPackFile(file: File): Promise<unknown> {
  return parseScenarioPackBytes(
    file.name,
    new Uint8Array(await file.arrayBuffer()),
  );
}

const modes: readonly HostedRunMode[] = [
  "tutorial",
  "standard",
  "sandbox",
  "configured",
];

export function ScenarioAuthorScreen({
  api,
}: {
  readonly api?: ScenarioAuthoringApi;
}): ReactNode {
  const t = useTranslator();
  const resolvedApi = useMemo(
    () => api ?? createScenarioAuthoringApi(),
    [api],
  );
  const [session, setSession] = useState<AuthorSession | null>(null);
  const [packs, setPacks] = useState<readonly ScenarioPackListItemV1[]>([]);
  const [candidate, setCandidate] = useState<unknown>();
  const [fileName, setFileName] = useState("");
  const [report, setReport] =
    useState<ScenarioPackValidationReportV1 | null>(null);
  const [selected, setSelected] = useState<ScenarioPackV1 | null>(null);
  const [preview, setPreview] = useState<ScenarioRolePreviewV1 | null>(null);
  const [comparison, setComparison] =
    useState<ScenarioPackComparisonV1 | null>(null);
  const [fromVersion, setFromVersion] = useState("");
  const [toVersion, setToVersion] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [messageKey, setMessageKey] = useState<string | null>(null);

  const mayAuthor =
    session?.roles.some((role) =>
      role === "scenario-author" || role === "administrator"
    ) ?? false;
  const mayBrowse =
    session?.roles.some((role) =>
      ["instructor", "scenario-author", "administrator"].includes(role)
    ) ?? false;
  const visiblePacks = useMemo(
    () =>
      statusFilter === "all"
        ? packs
        : packs.filter((pack) => pack.status === statusFilter),
    [packs, statusFilter],
  );

  async function refresh() {
    setPacks(await resolvedApi.listPacks());
  }

  useEffect(() => {
    let active = true;
    void resolvedApi
      .loadSession()
      .then(async (loaded) => {
        if (!active) return;
        setSession(loaded);
        if (
          loaded.roles.some((role) =>
            ["instructor", "scenario-author", "administrator"].includes(role)
          )
        ) {
          const listed = await resolvedApi.listPacks();
          if (active) setPacks(listed);
        }
      })
      .catch(() => {
        if (active) setMessageKey("scenarioAuthor.error.generic");
      });
    return () => {
      active = false;
    };
  }, [resolvedApi]);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    setReport(null);
    setMessageKey(null);
    try {
      setCandidate(await parseScenarioPackFile(file));
      setFileName(file.name);
    } catch (error) {
      setCandidate(undefined);
      setFileName("");
      setMessageKey(
        error instanceof ScenarioAuthoringApiError &&
          error.code === "IMPORT_FILE_TOO_LARGE"
          ? "scenarioAuthor.error.fileTooLarge"
          : "scenarioAuthor.error.parse",
      );
    }
  }

  function loadPharmaceuticalStarter() {
    setCandidate(structuredClone(pharmaceuticalPackTemplate));
    setFileName(t("scenarioAuthor.template.pharmaceuticalColdChain"));
    setReport(null);
    setMessageKey(null);
  }

  async function validate() {
    if (candidate === undefined) return;
    setBusy(true);
    setMessageKey(null);
    try {
      setReport(await resolvedApi.validatePack(candidate));
    } catch {
      setMessageKey("scenarioAuthor.error.generic");
    } finally {
      setBusy(false);
    }
  }

  async function importCandidate() {
    if (candidate === undefined) return;
    setBusy(true);
    setMessageKey(null);
    try {
      const result = await resolvedApi.importPack(candidate);
      setReport(result);
      if (result.valid) {
        await refresh();
        setMessageKey("scenarioAuthor.imported");
      }
    } catch {
      setMessageKey("scenarioAuthor.error.import");
    } finally {
      setBusy(false);
    }
  }

  async function mutate(
    action: () => Promise<void>,
    successKey: string,
  ) {
    setBusy(true);
    setMessageKey(null);
    try {
      await action();
      await refresh();
      setMessageKey(successKey);
    } catch {
      setMessageKey("scenarioAuthor.error.lifecycle");
    } finally {
      setBusy(false);
    }
  }

  async function loadPack(packId: string, version: string) {
    setBusy(true);
    setMessageKey(null);
    try {
      const loaded = await resolvedApi.loadPack(packId, version);
      setSelected(loaded);
      setFromVersion(version);
      setPreview(null);
      setComparison(null);
    } catch {
      setMessageKey("scenarioAuthor.error.generic");
    } finally {
      setBusy(false);
    }
  }

  async function requestPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected === null) return;
    const form = new FormData(event.currentTarget);
    const scenarioReference = JSON.parse(
      String(form.get("scenarioReference")),
    ) as { readonly scenarioId: string; readonly scenarioVersion: string };
    setBusy(true);
    try {
      setPreview(
        await resolvedApi.preview({
          packId: selected.packId,
          version: selected.version,
          scenarioId: scenarioReference.scenarioId,
          scenarioVersion: scenarioReference.scenarioVersion,
          locale: String(form.get("locale")) as LocaleCode,
          mode: String(form.get("mode")) as HostedRunMode,
          roleId: String(form.get("roleId")),
        }),
      );
    } catch {
      setMessageKey("scenarioAuthor.error.preview");
    } finally {
      setBusy(false);
    }
  }

  async function requestComparison(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected === null) return;
    setBusy(true);
    try {
      setComparison(
        await resolvedApi.compare(selected.packId, fromVersion, toVersion),
      );
    } catch {
      setMessageKey("scenarioAuthor.error.compare");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="start" id="main-content">
      <div className="start__inner">
        <header className="instructor-review__header">
          <p className="eyebrow">{t("scenarioAuthor.eyebrow")}</p>
          <h1>{t("scenarioAuthor.title")}</h1>
          <p className="start__subtitle">{t("scenarioAuthor.subtitle")}</p>
        </header>

        {session === null ? (
          <p role="status">{t("scenarioAuthor.loading")}</p>
        ) : (
          <section className="card card--reference">
            <h2>{t("scenarioAuthor.account")}</h2>
            <p>{session.email}</p>
            <p>{session.roles.join(", ")}</p>
          </section>
        )}

        {session !== null && !mayBrowse ? (
          <p className="notice notice--standalone" role="alert">
            {t("scenarioAuthor.error.notAuthorized")}
          </p>
        ) : null}

        {mayAuthor ? (
          <section className="card card--work">
            <h2>{t("scenarioAuthor.importHeading")}</h2>
            <p>{t("scenarioAuthor.importHelp")}</p>
            <div className="start__actions">
              <button
                className="button button--secondary"
                type="button"
                disabled={busy}
                onClick={loadPharmaceuticalStarter}
              >
                {t("scenarioAuthor.loadTemplate")}
              </button>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="scenario-pack-file">
                {t("scenarioAuthor.file")}
              </label>
              <input
                className="field__control"
                id="scenario-pack-file"
                type="file"
                accept=".json,.yaml,.yml,.zip,application/json,application/zip"
                onChange={(event) => void selectFile(event)}
              />
              {fileName.length === 0 ? null : <span>{fileName}</span>}
            </div>
            {isEditableScenarioPack(candidate) ? (
              <ScenarioDraftEditor
                pack={candidate}
                onChange={(updated) => {
                  setCandidate(updated);
                  setReport(null);
                }}
              />
            ) : null}
            <div className="start__actions">
              <button
                className="button button--secondary"
                type="button"
                disabled={candidate === undefined || busy}
                onClick={() => void validate()}
              >
                {t("scenarioAuthor.validate")}
              </button>
              <button
                className="button button--primary"
                type="button"
                disabled={candidate === undefined || busy}
                onClick={() => void importCandidate()}
              >
                {t("scenarioAuthor.import")}
              </button>
            </div>
            {report === null ? null : (
              <div aria-live="polite">
                <h3>
                  {report.valid
                    ? t("scenarioAuthor.validationValid")
                    : t("scenarioAuthor.validationInvalid")}
                </h3>
                <p>
                  {t("scenarioAuthor.validationChecks", {
                    count: report.checkedCount,
                  })}
                </p>
                <ul>
                  {report.issues.map((issue) => (
                    <li key={`${issue.code}:${issue.path}`}>
                      <code>{issue.path}</code>: {issue.message}{" "}
                      <code>{issue.code}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : null}

        {session === null || !mayBrowse ? null : (
          <section className="card card--reference">
            <h2>{t("scenarioAuthor.libraryHeading")}</h2>
            <div className="field">
              <label className="field__label" htmlFor="pack-status-filter">
                {t("scenarioAuthor.statusFilter")}
              </label>
              <select
                className="field__control"
                id="pack-status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {["all", "draft", "validated", "published", "retired"].map(
                  (status) => (
                    <option key={status} value={status}>
                      {t(`scenarioAuthor.status.${status}`)}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">{t("scenarioAuthor.pack")}</th>
                    <th scope="col">{t("scenarioAuthor.version")}</th>
                    <th scope="col">{t("scenarioAuthor.status")}</th>
                    <th scope="col">{t("scenarioAuthor.domain")}</th>
                    <th scope="col">{t("scenarioAuthor.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePacks.map((pack) => (
                    <tr key={`${pack.packId}@${pack.version}`}>
                      <td><code>{pack.packId}</code></td>
                      <td><code>{pack.version}</code></td>
                      <td>{t(`scenarioAuthor.status.${pack.status}`)}</td>
                      <td>{pack.domain}</td>
                      <td>
                        <div className="instructor-review__export-actions">
                          <button
                            className="button button--secondary"
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void loadPack(pack.packId, pack.version)
                            }
                          >
                            {t("scenarioAuthor.open")}
                          </button>
                          {mayAuthor &&
                          (pack.status === "draft" ||
                            pack.status === "validated") ? (
                            <button
                              className="button button--secondary"
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void mutate(
                                  () =>
                                    resolvedApi.publish(pack.packId, pack.version),
                                  "scenarioAuthor.published",
                                )
                              }
                            >
                              {t("scenarioAuthor.publish")}
                            </button>
                          ) : null}
                          {mayAuthor && pack.status === "published" ? (
                            <button
                              className="button button--secondary"
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void mutate(
                                  () =>
                                    resolvedApi.retire(pack.packId, pack.version),
                                  "scenarioAuthor.retired",
                                )
                              }
                            >
                              {t("scenarioAuthor.retire")}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {selected === null ? null : (
          <section className="card card--work">
            <h2>
              {t("scenarioAuthor.previewHeading", {
                packId: selected.packId,
                version: selected.version,
              })}
            </h2>
            <form
              className="instructor-review__form-grid"
              onSubmit={(event) => void requestPreview(event)}
            >
              <PreviewFields pack={selected} />
              <button className="button button--primary" disabled={busy}>
                {t("scenarioAuthor.preview")}
              </button>
            </form>
            {preview === null ? null : (
              <div aria-live="polite">
                <h3>{preview.scenarioTitle}</h3>
                <p>
                  {t("scenarioAuthor.previewSummary", {
                    roleId: preview.roleId,
                    mode: preview.mode,
                    count: preview.nodes.length,
                  })}
                </p>
                <ol>
                  {preview.nodes.map((node) => (
                    <li key={node.nodeId}>
                      <strong>{node.title}</strong>{" "}
                      <code>{node.nodeId}</code>
                      {node.visibleEvidenceIds.length === 0 ? null : (
                        <span>
                          {" "}
                          {t("scenarioAuthor.visibleEvidence", {
                            count: node.visibleEvidenceIds.length,
                          })}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <h3>{t("scenarioAuthor.compareHeading")}</h3>
            <form
              className="instructor-review__inline-form"
              onSubmit={(event) => void requestComparison(event)}
            >
              <VersionField
                id="compare-from"
                label={t("scenarioAuthor.fromVersion")}
                value={fromVersion}
                onChange={setFromVersion}
              />
              <VersionField
                id="compare-to"
                label={t("scenarioAuthor.toVersion")}
                value={toVersion}
                onChange={setToVersion}
              />
              <button className="button button--secondary" disabled={busy}>
                {t("scenarioAuthor.compare")}
              </button>
            </form>
            {comparison === null ? null : (
              <div aria-live="polite">
                <p>
                  {t("scenarioAuthor.compareSummary", {
                    changed: comparison.changedPaths.length,
                    added: comparison.addedPaths.length,
                    removed: comparison.removedPaths.length,
                  })}
                </p>
                <ul>
                  {comparison.changedPaths.map((path) => (
                    <li key={path}><code>{path}</code></li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {messageKey === null ? null : (
          <p className="notice notice--standalone" role="status">
            {t(messageKey)}
          </p>
        )}
      </div>
    </main>
  );
}

function PreviewFields({
  pack,
}: {
  readonly pack: ScenarioPackV1;
}): ReactNode {
  const t = useTranslator();
  const scenario = pack.scenarios[0];
  if (scenario === undefined) return null;
  return (
    <>
      <div className="field">
        <label className="field__label" htmlFor="preview-scenario">
          {t("scenarioAuthor.scenario")}
        </label>
        <select
          className="field__control"
          id="preview-scenario"
          name="scenarioReference"
        >
          {pack.scenarios.map((candidate) => (
            <option
              key={`${candidate.scenarioId}@${candidate.version}`}
              value={JSON.stringify({
                scenarioId: candidate.scenarioId,
                scenarioVersion: candidate.version,
              })}
            >
              {candidate.scenarioId}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="preview-role">
          {t("scenarioAuthor.role")}
        </label>
        <select
          className="field__control"
          id="preview-role"
          name="roleId"
        >
          {scenario.roles.map((role) => (
            <option key={role.roleId} value={role.roleId}>
              {role.roleId}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="preview-mode">
          {t("scenarioAuthor.mode")}
        </label>
        <select
          className="field__control"
          id="preview-mode"
          name="mode"
        >
          {modes.map((mode) => (
            <option key={mode} value={mode}>
              {t(`scenarioAuthor.mode.${mode}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="preview-locale">
          {t("scenarioAuthor.locale")}
        </label>
        <select
          className="field__control"
          id="preview-locale"
          name="locale"
        >
          {pack.supportedLocales.map((locale) => (
            <option key={locale} value={locale}>{locale}</option>
          ))}
        </select>
      </div>
    </>
  );
}

function VersionField({
  id,
  label,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <input
        className="field__control"
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </div>
  );
}

interface MutableAuthoringNode {
  nodeId: string;
  nodeType: string;
  title: { localizationKey: string };
  transitions: {
    transitionId: string;
    toNodeId: string;
  }[];
}

interface MutableAuthoringPack {
  packId: string;
  version: string;
  manifest: { domain: string };
  portraitAssets: {
    assetId: string;
    filePath: string;
  }[];
  localizationCatalogs?: Record<string, Record<string, string>>;
  scenarios: {
    scenarioId: string;
    version: string;
    title: { localizationKey: string };
    staffProfiles: {
      staffProfileId: string;
      roleId: string;
      displayName: { localizationKey: string };
      roleTitle: { localizationKey: string };
      portraitAssetId: string;
    }[];
    nodes: MutableAuthoringNode[];
  }[];
}

function mutablePack(pack: ScenarioPackV1): MutableAuthoringPack {
  return structuredClone(pack) as unknown as MutableAuthoringPack;
}

function ScenarioDraftEditor({
  pack,
  onChange,
}: {
  readonly pack: ScenarioPackV1;
  readonly onChange: (pack: ScenarioPackV1) => void;
}): ReactNode {
  const t = useTranslator();
  const scenario = pack.scenarios[0];
  if (scenario === undefined) return null;

  function updateMetadata(
    field:
      | "packId"
      | "packVersion"
      | "domain"
      | "scenarioId"
      | "scenarioVersion",
    value: string,
  ) {
    const next = mutablePack(pack);
    const firstScenario = next.scenarios[0];
    if (firstScenario === undefined) return;
    if (field === "packId") next.packId = value;
    if (field === "packVersion") next.version = value;
    if (field === "domain") next.manifest.domain = value;
    if (field === "scenarioId") firstScenario.scenarioId = value;
    if (field === "scenarioVersion") firstScenario.version = value;
    onChange(next as unknown as ScenarioPackV1);
  }

  function updateLocalizedText(
    locale: string,
    localizationKey: string,
    value: string,
  ) {
    const next = mutablePack(pack);
    const catalog = next.localizationCatalogs?.[locale];
    if (catalog === undefined) return;
    catalog[localizationKey] = value;
    onChange(next as unknown as ScenarioPackV1);
  }

  function updateTransition(
    nodeIndex: number,
    transitionIndex: number,
    toNodeId: string,
  ) {
    const next = mutablePack(pack);
    const transition =
      next.scenarios[0]?.nodes[nodeIndex]?.transitions[transitionIndex];
    if (transition === undefined) return;
    transition.toNodeId = toNodeId;
    onChange(next as unknown as ScenarioPackV1);
  }

  function updateStaffPortrait(
    staffProfileIndex: number,
    portraitAssetId: string,
  ) {
    const next = mutablePack(pack);
    const profile =
      next.scenarios[0]?.staffProfiles[staffProfileIndex];
    if (profile === undefined) return;
    profile.portraitAssetId = portraitAssetId;
    onChange(next as unknown as ScenarioPackV1);
  }

  return (
    <fieldset className="scenario-author__draft-editor">
      <legend>{t("scenarioAuthor.editorHeading")}</legend>
      <p>{t("scenarioAuthor.editorHelp")}</p>
      <div className="instructor-review__form-grid">
        <DraftTextField
          id="draft-pack-id"
          label={t("scenarioAuthor.editor.packId")}
          value={pack.packId}
          onChange={(value) => updateMetadata("packId", value)}
        />
        <DraftTextField
          id="draft-pack-version"
          label={t("scenarioAuthor.editor.packVersion")}
          value={pack.version}
          onChange={(value) => updateMetadata("packVersion", value)}
        />
        <DraftTextField
          id="draft-domain"
          label={t("scenarioAuthor.editor.domain")}
          value={pack.manifest.domain}
          onChange={(value) => updateMetadata("domain", value)}
        />
        <DraftTextField
          id="draft-scenario-id"
          label={t("scenarioAuthor.editor.scenarioId")}
          value={scenario.scenarioId}
          onChange={(value) => updateMetadata("scenarioId", value)}
        />
        <DraftTextField
          id="draft-scenario-version"
          label={t("scenarioAuthor.editor.scenarioVersion")}
          value={scenario.version}
          onChange={(value) =>
            updateMetadata("scenarioVersion", value)
          }
        />
      </div>
      {pack.localizationCatalogs === undefined ? null : (
        <div className="instructor-review__form-grid">
          {pack.supportedLocales.map((locale) => (
            <DraftTextField
              key={locale}
              id={`draft-scenario-title-${locale}`}
              label={t("scenarioAuthor.editor.scenarioTitle", {
                locale,
              })}
              value={
                pack.localizationCatalogs?.[locale]?.[
                  scenario.title.localizationKey
                ] ?? ""
              }
              onChange={(value) =>
                updateLocalizedText(
                  locale,
                  scenario.title.localizationKey,
                  value,
                )
              }
            />
          ))}
        </div>
      )}
      {scenario.staffProfiles.length === 0 ? null : (
        <>
          <h4>{t("scenarioAuthor.editor.staffProfiles")}</h4>
          <p>{t("scenarioAuthor.editor.staffProfilesHelp")}</p>
          <div className="scenario-author__staff-grid">
            {scenario.staffProfiles.map((profile, profileIndex) => {
              const portrait = pack.portraitAssets.find(
                (candidate) =>
                  candidate.assetId === profile.portraitAssetId,
              );
              return (
                <article
                  className="staff-identity staff-identity--compact"
                  key={profile.staffProfileId}
                >
                  {portrait === undefined ? (
                    <span
                      className="staff-portrait staff-portrait--compact staff-portrait--fallback"
                      aria-hidden="true"
                    >
                      ?
                    </span>
                  ) : (
                    <img
                      className="staff-portrait staff-portrait--compact"
                      src={`./${portrait.filePath}`}
                      width={48}
                      height={60}
                      alt=""
                    />
                  )}
                  <div className="staff-identity__body">
                    <h5 className="staff-identity__name">
                      {t(profile.displayName.localizationKey)}
                    </h5>
                    <p className="staff-identity__role">
                      {t(profile.roleTitle.localizationKey)}
                    </p>
                    <label
                      className="field__label"
                      htmlFor={`staff-portrait-${profile.staffProfileId}`}
                    >
                      {t("scenarioAuthor.editor.approvedPortrait")}
                    </label>
                    <select
                      className="field__control"
                      id={`staff-portrait-${profile.staffProfileId}`}
                      value={profile.portraitAssetId}
                      onChange={(event) =>
                        updateStaffPortrait(
                          profileIndex,
                          event.target.value,
                        )
                      }
                    >
                      {pack.portraitAssets.map((asset) => (
                        <option key={asset.assetId} value={asset.assetId}>
                          {asset.assetId}
                        </option>
                      ))}
                    </select>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
      <h4>{t("scenarioAuthor.editor.workflow")}</h4>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t("scenarioAuthor.editor.node")}</th>
              <th scope="col">{t("scenarioAuthor.editor.type")}</th>
              <th scope="col">{t("scenarioAuthor.editor.title")}</th>
              <th scope="col">{t("scenarioAuthor.editor.transitions")}</th>
            </tr>
          </thead>
          <tbody>
            {scenario.nodes.map((node, nodeIndex) => (
              <tr key={node.nodeId}>
                <td><code>{node.nodeId}</code></td>
                <td>{node.nodeType}</td>
                <td>
                  {pack.localizationCatalogs === undefined
                    ? <code>{node.title.localizationKey}</code>
                    : pack.supportedLocales.map((locale) => (
                        <DraftTextField
                          key={locale}
                          id={`draft-node-title-${String(nodeIndex)}-${locale}`}
                          label={locale}
                          value={
                            pack.localizationCatalogs?.[locale]?.[
                              node.title.localizationKey
                            ] ?? ""
                          }
                          onChange={(value) =>
                            updateLocalizedText(
                              locale,
                              node.title.localizationKey,
                              value,
                            )
                          }
                        />
                      ))}
                </td>
                <td>
                  {node.transitions.length === 0
                    ? t("scenarioAuthor.editor.terminal")
                    : node.transitions.map((transition, transitionIndex) => (
                        <div
                          className="field"
                          key={transition.transitionId}
                        >
                          <label
                            className="field__label"
                            htmlFor={`draft-transition-${String(nodeIndex)}-${String(transitionIndex)}`}
                          >
                            {transition.transitionId}
                          </label>
                          <select
                            className="field__control"
                            id={`draft-transition-${String(nodeIndex)}-${String(transitionIndex)}`}
                            value={transition.toNodeId}
                            onChange={(event) =>
                              updateTransition(
                                nodeIndex,
                                transitionIndex,
                                event.target.value,
                              )
                            }
                          >
                            {scenario.nodes.map((target) => (
                              <option
                                key={target.nodeId}
                                value={target.nodeId}
                              >
                                {target.nodeId}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}

function DraftTextField({
  id,
  label,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <input
        className="field__control"
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
