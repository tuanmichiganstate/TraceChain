import { JSON_SCHEMA, load as loadYaml } from "js-yaml";
import auditPackTemplate from "../../../scenario-packs/challenge-coffee-audit/tracechain.pack.json";
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
import type {
  LtiLaunchType,
  LtiLearningContextV2,
} from "../contracts/lti";
import type { ApplicationRole } from "../contracts/run-events";
import type {
  ScenarioPackComparisonV1,
  ScenarioPackListItemV1,
  ScenarioPreviewTransitionV1,
  ScenarioPackValidationReportV1,
  ScenarioRolePreviewV1,
} from "../contracts/scenario-authoring";
import type {
  HostedRunMode,
  ScenarioImageAssetV2,
  ScenarioImagePurposeV2,
  ScenarioPackV2,
} from "../contracts/scenario-pack";
import { EvidenceAssessmentCatalog } from "../components/evidence-assessment-catalog";
import { createScenarioBuilderStarter } from "./scenario-builder-model";
import {
  ScenarioBuilder,
  type ScenarioBuilderImageUpload,
  type ScenarioBuilderStep,
} from "./scenario-builder";
import {
  createScenarioPackBundle,
  MAXIMUM_SCENARIO_BUNDLE_BYTES,
  parseScenarioPackBundle,
  scenarioPackBundleFilename,
} from "../scenario-packs/scenario-pack-bundle";

const MAXIMUM_IMPORT_BYTES = 2 * 1024 * 1024;
const AUTHOR_DRAFT_SCHEMA_VERSION = "1";

interface StoredAuthorDraftV1 {
  readonly schemaVersion: "1";
  readonly savedAt: string;
  readonly pack: ScenarioPackV2;
}

function authorDraftStorageKey(userId: string): string {
  return `tracechain.scenario-author.draft.v1:${userId}`;
}

function parseStoredAuthorDraft(
  raw: string,
): StoredAuthorDraftV1 | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const record = parsed as Readonly<Record<string, unknown>>;
    if (
      record.schemaVersion !== AUTHOR_DRAFT_SCHEMA_VERSION ||
      typeof record.savedAt !== "string" ||
      !isEditableScenarioPack(record.pack)
    ) {
      return null;
    }
    return {
      schemaVersion: "1",
      savedAt: record.savedAt,
      pack: record.pack,
    };
  } catch {
    return null;
  }
}

function builderStepForValidationPath(
  path: string,
): ScenarioBuilderStep {
  if (
    /\.(?:modeConfigurations|supportedModes)(?:\.|\[|$)/u.test(
      path,
    )
  ) {
    return "delivery";
  }
  if (
    /\.(?:organizations|roles|initialState|assetTypes|staffProfiles)(?:\.|\[|$)/u.test(
      path,
    )
  ) {
    return "participants";
  }
  if (/\.(?:imageAssets|image|portraitAssetId)(?:\.|\[|$)/u.test(path)) {
    return "media";
  }
  if (
    /\.(?:policies|evidenceItems|instructorIncidents)(?:\.|\[|$)/u.test(
      path,
    )
  ) {
    return "evidence";
  }
  if (/\.(?:nodes|entryNodeId)(?:\.|\[|$)/u.test(path)) {
    return "workflow";
  }
  if (
    /\.(?:competencyFrameworks|competencyTargets|rubrics|rubricIds|evidenceRules|evidenceRuleIds|outcomeModels|counterfactual|auditVariantBanks|auditCase)(?:\.|\[|$)/u.test(
      path,
    )
  ) {
    return "assessment";
  }
  return path.includes(".manifest") ||
    /\.(?:packId|version|status|scenarioId|title)(?:\.|\[|$)/u.test(
      path,
    )
    ? "identity"
    : "review";
}

interface AuthorSession {
  readonly userId: string;
  readonly email?: string;
  readonly displayName?: string;
  readonly roles: readonly ApplicationRole[];
  readonly authenticationSource?: "sites" | "lti";
  readonly ltiLaunchType?: LtiLaunchType;
  readonly learningContext?: LtiLearningContextV2;
}

export interface ScenarioAuthoringApi {
  loadSession(): Promise<AuthorSession>;
  logoutSession?(): Promise<void>;
  listPacks(): Promise<readonly ScenarioPackListItemV1[]>;
  validatePack(candidate: unknown): Promise<ScenarioPackValidationReportV1>;
  importPack(candidate: unknown): Promise<ScenarioPackValidationReportV1>;
  uploadImage?(
    file: File,
    purpose: ScenarioImagePurposeV2,
  ): Promise<ScenarioBuilderImageUpload>;
  loadImage?(image: ScenarioImageAssetV2): Promise<Uint8Array>;
  loadPack(packId: string, version: string): Promise<ScenarioPackV2>;
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
    async logoutSession() {
      const response = await fetcher("/api/lti/v1/logout", {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        throw new ScenarioAuthoringApiError("LTI_LOGOUT_FAILED");
      }
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
    async uploadImage(file, purpose) {
      const parameters = new URLSearchParams({
        fileName: file.name,
        purpose,
      });
      const response = await fetcher(
        `/api/v1/scenario-assets?${parameters.toString()}`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": file.type || "application/octet-stream",
          },
          body: await file.arrayBuffer(),
        },
      );
      const body = (await response.json()) as {
        readonly image?: ScenarioBuilderImageUpload;
        readonly error?: { readonly code?: string };
      };
      if (!response.ok || body.image === undefined) {
        throw new ScenarioAuthoringApiError(
          body.error?.code ?? "SCENARIO_IMAGE_UPLOAD_FAILED",
        );
      }
      return body.image;
    },
    async loadImage(image) {
      const parameters = new URLSearchParams({
        path: image.filePath,
        fileName: image.originalFileName,
      });
      const response = await fetcher(
        `/api/v1/scenario-assets/${encodeURIComponent(image.sha256)}?${parameters.toString()}`,
        { headers: { accept: image.mimeType } },
      );
      if (!response.ok) {
        throw new ScenarioAuthoringApiError(
          "SCENARIO_IMAGE_DOWNLOAD_FAILED",
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    async loadPack(packId, version) {
      return (
        await apiJson<{ readonly pack: ScenarioPackV2 }>(
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
): candidate is ScenarioPackV2 {
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

export interface ParsedScenarioPackImport {
  readonly pack: unknown;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}

export function parseScenarioPackBytes(
  name: string,
  bytes: Uint8Array,
): ParsedScenarioPackImport {
  const isZip = name.toLowerCase().endsWith(".zip");
  if (
    bytes.byteLength >
    (isZip ? MAXIMUM_SCENARIO_BUNDLE_BYTES : MAXIMUM_IMPORT_BYTES)
  ) {
    throw new ScenarioAuthoringApiError("IMPORT_FILE_TOO_LARGE");
  }
  if (isZip) {
    const parsed = parseScenarioPackBundle(bytes);
    return { pack: parsed.pack, assets: parsed.assets };
  }
  return {
    pack: parseText(
      name,
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ),
    assets: new Map(),
  };
}

async function parseScenarioPackFile(
  file: File,
): Promise<ParsedScenarioPackImport> {
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
  const [selected, setSelected] = useState<ScenarioPackV2 | null>(null);
  const [preview, setPreview] = useState<ScenarioRolePreviewV1 | null>(null);
  const [comparison, setComparison] =
    useState<ScenarioPackComparisonV1 | null>(null);
  const [fromVersion, setFromVersion] = useState("");
  const [toVersion, setToVersion] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [isSigningOut, setSigningOut] = useState(false);
  const [messageKey, setMessageKey] = useState<string | null>(null);
  const [recoverableDraft, setRecoverableDraft] =
    useState<StoredAuthorDraftV1 | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const [builderFocusRequest, setBuilderFocusRequest] = useState<{
    readonly step: ScenarioBuilderStep;
    readonly requestId: number;
  }>();
  const [builderInstanceId, setBuilderInstanceId] = useState(0);

  const mayAuthor =
    session?.roles.some((role) =>
      role === "scenario-author" || role === "administrator"
    ) ?? false;
  const mayBrowse =
    session?.roles.some((role) =>
      ["instructor", "scenario-author", "administrator"].includes(role)
    ) ?? false;
  const accountLabel =
    session?.email ??
    session?.displayName ??
    session?.userId ??
    "";
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

  function clearStoredDraft(userId = session?.userId): void {
    if (userId === undefined) return;
    try {
      window.localStorage.removeItem(authorDraftStorageKey(userId));
    } catch {
      // A storage-denied browser still permits authoring without recovery.
    }
    setRecoverableDraft(null);
    setDraftSaved(false);
    setDraftSaveFailed(false);
  }

  function beginCandidate(value: unknown, name: string): void {
    clearStoredDraft();
    setCandidate(value);
    setFileName(name);
    setReport(null);
    setMessageKey(null);
    setBuilderFocusRequest(undefined);
    setBuilderInstanceId((current) => current + 1);
  }

  function restoreDraft(): void {
    if (recoverableDraft === null) return;
    setCandidate(structuredClone(recoverableDraft.pack));
    setFileName(t("scenarioAuthor.draft.restoredName"));
    setReport(null);
    setMessageKey(null);
    setRecoverableDraft(null);
    setDraftSaved(true);
    setBuilderInstanceId((current) => current + 1);
  }

  function openValidationIssue(path: string): void {
    const step = builderStepForValidationPath(path);
    setBuilderFocusRequest((current) => ({
      step,
      requestId: (current?.requestId ?? 0) + 1,
    }));
    window.setTimeout(() => {
      document.querySelector<HTMLElement>("#scenario-builder")?.focus();
    });
  }

  async function signOutFromLti(): Promise<void> {
    if (
      session?.authenticationSource !== "lti" ||
      resolvedApi.logoutSession === undefined
    ) {
      return;
    }
    setSigningOut(true);
    try {
      await resolvedApi.logoutSession();
      window.location.assign(
        session.learningContext?.returnUrl ?? "/author",
      );
    } catch {
      setMessageKey("instructorReview.lti.logoutFailed");
      setSigningOut(false);
    }
  }

  useEffect(() => {
    let active = true;
    void resolvedApi
      .loadSession()
      .then(async (loaded) => {
        if (!active) return;
        setSession(loaded);
        try {
          const storageKey = authorDraftStorageKey(loaded.userId);
          const raw = window.localStorage.getItem(storageKey);
          if (raw !== null) {
            const stored = parseStoredAuthorDraft(raw);
            if (stored === null) {
              window.localStorage.removeItem(storageKey);
            } else {
              setRecoverableDraft(stored);
            }
          }
        } catch {
          setDraftSaveFailed(true);
        }
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

  useEffect(() => {
    if (session === null || !isEditableScenarioPack(candidate)) {
      return;
    }
    const saveTimer = window.setTimeout(() => {
      const stored: StoredAuthorDraftV1 = {
        schemaVersion: "1",
        savedAt: new Date().toISOString(),
        pack: candidate,
      };
      try {
        window.localStorage.setItem(
          authorDraftStorageKey(session.userId),
          JSON.stringify(stored),
        );
        setDraftSaved(true);
        setDraftSaveFailed(false);
      } catch {
        setDraftSaveFailed(true);
      }
    }, 200);
    return () => window.clearTimeout(saveTimer);
  }, [candidate, session]);

  useEffect(() => {
    if (!isEditableScenarioPack(candidate) || draftSaved) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () =>
      window.removeEventListener(
        "beforeunload",
        warnBeforeLeaving,
      );
  }, [candidate, draftSaved]);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    setReport(null);
    setMessageKey(null);
    try {
      const imported = await parseScenarioPackFile(file);
      if (imported.assets.size > 0) {
        if (
          !isEditableScenarioPack(imported.pack) ||
          resolvedApi.uploadImage === undefined
        ) {
          throw new ScenarioAuthoringApiError(
            "SCENARIO_IMAGE_UPLOAD_FAILED",
          );
        }
        for (const image of imported.pack.imageAssets) {
          const bytes = imported.assets.get(image.filePath);
          if (bytes === undefined) {
            throw new ScenarioAuthoringApiError(
              "SCENARIO_IMAGE_UPLOAD_FAILED",
            );
          }
          const uploaded = await resolvedApi.uploadImage(
            new File([Uint8Array.from(bytes)], image.originalFileName, {
              type: image.mimeType,
            }),
            image.purpose,
          );
          if (
            uploaded.sha256 !== image.sha256 ||
            uploaded.filePath !== image.filePath
          ) {
            throw new ScenarioAuthoringApiError(
              "SCENARIO_IMAGE_UPLOAD_FAILED",
            );
          }
        }
      }
      beginCandidate(imported.pack, file.name);
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
    beginCandidate(
      structuredClone(pharmaceuticalPackTemplate),
      t("scenarioAuthor.template.pharmaceuticalColdChain"),
    );
  }

  function startNewScenario() {
    beginCandidate(
      createScenarioBuilderStarter(
        structuredClone(
          pharmaceuticalPackTemplate,
        ) as ScenarioPackV2,
      ),
      t("scenarioAuthor.builder.starterName"),
    );
  }

  function loadAuditStarter() {
    beginCandidate(
      structuredClone(auditPackTemplate),
      t("scenarioAuthor.template.auditCaseBank"),
    );
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
        clearStoredDraft();
        setCandidate(undefined);
        setFileName("");
      }
    } catch {
      setMessageKey("scenarioAuthor.error.import");
    } finally {
      setBusy(false);
    }
  }

  async function downloadCandidate(): Promise<void> {
    if (
      !isEditableScenarioPack(candidate) ||
      resolvedApi.loadImage === undefined
    ) {
      return;
    }
    setBusy(true);
    setMessageKey(null);
    try {
      const assets = new Map<string, Uint8Array>();
      for (const image of candidate.imageAssets) {
        assets.set(
          image.filePath,
          await resolvedApi.loadImage(image),
        );
      }
      const bytes = createScenarioPackBundle(candidate, assets);
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(bytes)], { type: "application/zip" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = scenarioPackBundleFilename(candidate);
      anchor.click();
      URL.revokeObjectURL(url);
      setMessageKey("scenarioAuthor.bundleDownloaded");
    } catch {
      setMessageKey("scenarioAuthor.error.bundleDownload");
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

  async function editPack(packId: string, version: string) {
    setBusy(true);
    setMessageKey(null);
    try {
      const loaded = await resolvedApi.loadPack(packId, version);
      if (
        loaded.status !== "draft" &&
        loaded.status !== "validated"
      ) {
        setMessageKey("scenarioAuthor.error.editImmutable");
        return;
      }
      beginCandidate(
        structuredClone(loaded),
        t("scenarioAuthor.draft.editingName", {
          packId,
          version,
        }),
      );
      setSelected(null);
      setPreview(null);
      setComparison(null);
      window.setTimeout(() => {
        document
          .querySelector<HTMLElement>("#scenario-builder")
          ?.focus();
      });
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
    <main className="start instructor-review" id="main-content">
      <div className="start__inner">
        <header className="instructor-review__header">
          <p className="eyebrow">{t("scenarioAuthor.eyebrow")}</p>
          <h1>{t("scenarioAuthor.title")}</h1>
          <p className="start__subtitle">{t("scenarioAuthor.subtitle")}</p>
        </header>

        {session === null ? (
          <p role="status">{t("scenarioAuthor.loading")}</p>
        ) : (
          <section className="card card--reference instructor-review__session-card">
            <h2>{t("scenarioAuthor.account")}</h2>
            <dl className="instructor-review__facts">
              <div>
                <dt>{t("instructorReview.account")}</dt>
                <dd>{accountLabel}</dd>
              </div>
              <div>
                <dt>{t("instructorReview.roles")}</dt>
                <dd>
                  {session.roles
                    .map((role) => t(`adminAccess.role.${role}`))
                    .join(", ")}
                </dd>
              </div>
              {session.authenticationSource === "lti" &&
              session.learningContext !== undefined ? (
                <>
                  <div>
                    <dt>{t("instructorReview.lti.connection")}</dt>
                    <dd>{t("instructorReview.lti.connected")}</dd>
                  </div>
                  <div>
                    <dt>{t("instructorReview.lti.course")}</dt>
                    <dd>
                      {session.learningContext.contextTitle ??
                        session.learningContext.contextLabel ??
                        session.learningContext.contextId}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            {session.authenticationSource === "lti" ? (
              <div className="instructor-review__form-actions">
                {session.learningContext?.returnUrl === undefined ? null : (
                  <a
                    className="button button--secondary"
                    href={session.learningContext.returnUrl}
                  >
                    {t("instructorReview.lti.returnToMoodle")}
                  </a>
                )}
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={isSigningOut}
                  onClick={() => void signOutFromLti()}
                >
                  {isSigningOut
                    ? t("instructorReview.lti.signingOut")
                    : t("instructorReview.lti.signOut")}
                </button>
              </div>
            ) : null}
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
            {recoverableDraft === null ? null : (
              <section
                className="notice notice--standalone"
                aria-labelledby="scenario-author-recovery-heading"
              >
                <h3 id="scenario-author-recovery-heading">
                  {t("scenarioAuthor.draft.recoveryHeading")}
                </h3>
                <p>{t("scenarioAuthor.draft.recoveryHelp")}</p>
                <div className="start__actions">
                  <button
                    className="button button--primary"
                    type="button"
                    onClick={restoreDraft}
                  >
                    {t("scenarioAuthor.draft.restore")}
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => clearStoredDraft()}
                  >
                    {t("scenarioAuthor.draft.discard")}
                  </button>
                </div>
              </section>
            )}
            <div className="start__actions">
              <button
                className="button button--primary"
                type="button"
                disabled={busy || recoverableDraft !== null}
                onClick={startNewScenario}
              >
                {t("scenarioAuthor.builder.start")}
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={busy || recoverableDraft !== null}
                onClick={loadPharmaceuticalStarter}
              >
                {t("scenarioAuthor.loadTemplate")}
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={busy || recoverableDraft !== null}
                onClick={loadAuditStarter}
              >
                {t("scenarioAuthor.loadAuditTemplate")}
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
                disabled={busy || recoverableDraft !== null}
                onChange={(event) => void selectFile(event)}
              />
              {fileName.length === 0 ? null : <span>{fileName}</span>}
            </div>
            {isEditableScenarioPack(candidate) ? (
              <p role="status">
                {draftSaveFailed
                  ? t("scenarioAuthor.draft.saveFailed")
                  : draftSaved
                    ? t("scenarioAuthor.draft.saved")
                    : t("scenarioAuthor.draft.saving")}
              </p>
            ) : null}
            {isEditableScenarioPack(candidate) ? (
              <>
                <ScenarioBuilder
                  key={builderInstanceId}
                  pack={candidate}
                  initialStep={builderFocusRequest?.step}
                  focusRequestId={builderFocusRequest?.requestId}
                  {...(resolvedApi.uploadImage === undefined
                    ? {}
                    : { onUploadImage: resolvedApi.uploadImage })}
                  imageUrl={(image) =>
                    `/api/v1/scenario-assets/${encodeURIComponent(image.sha256)}?${new URLSearchParams({ path: image.filePath, fileName: image.originalFileName }).toString()}`
                  }
                  onChange={(updated) => {
                    setCandidate(updated);
                    setReport(null);
                    setDraftSaved(false);
                    setDraftSaveFailed(false);
                  }}
                />
                <AuditAuthoringSummary pack={candidate} />
              </>
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
              <button
                className="button button--secondary"
                type="button"
                disabled={
                  !isEditableScenarioPack(candidate) ||
                  busy ||
                  resolvedApi.loadImage === undefined
                }
                onClick={() => void downloadCandidate()}
              >
                {t("scenarioAuthor.downloadBundle")}
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
                      <code>{issue.code}</code>{" "}
                      {isEditableScenarioPack(candidate) ? (
                        <button
                          className="button button--quiet"
                          type="button"
                          onClick={() =>
                            openValidationIssue(issue.path)
                          }
                        >
                          {t(
                            "scenarioAuthor.validationOpenSection",
                          )}
                        </button>
                      ) : null}
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
            {isEditableScenarioPack(candidate) ||
            recoverableDraft !== null ? (
              <p>{t("scenarioAuthor.editBlockedByWorkingDraft")}</p>
            ) : null}
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
                            {t("scenarioAuthor.previewPack")}
                          </button>
                          <a
                            className="button button--secondary"
                            href={`/api/v1/scenario-packs/${encodeURIComponent(pack.packId)}/versions/${encodeURIComponent(pack.version)}/bundle`}
                            download
                          >
                            {t("scenarioAuthor.downloadBundle")}
                          </a>
                          {mayAuthor &&
                          (pack.status === "draft" ||
                            pack.status === "validated") ? (
                            <button
                              className="button button--secondary"
                              type="button"
                              disabled={
                                busy ||
                                isEditableScenarioPack(candidate) ||
                                recoverableDraft !== null
                              }
                              onClick={() =>
                                void editPack(pack.packId, pack.version)
                              }
                            >
                              {t("scenarioAuthor.editDraft")}
                            </button>
                          ) : null}
                          {mayAuthor &&
                          (pack.status === "draft" ||
                            pack.status === "validated") ? (
                            <button
                              className="button button--secondary"
                              type="button"
                              disabled={
                                busy ||
                                isEditableScenarioPack(candidate) ||
                                recoverableDraft !== null
                              }
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
              className="instructor-review__form-grid scenario-author__preview-form"
              onSubmit={(event) => void requestPreview(event)}
            >
              <PreviewFields
                key={`${selected.packId}@${selected.version}`}
                pack={selected}
              />
              <div className="instructor-review__form-actions scenario-author__preview-actions">
                <button className="button button--primary" disabled={busy}>
                  {t("scenarioAuthor.preview")}
                </button>
              </div>
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
                <PreviewWorkflow
                  preview={preview}
                  specializedRuntimeId={
                    selected.scenarios.find(
                      (scenario) =>
                        scenario.scenarioId === preview.scenarioId &&
                        scenario.version === preview.scenarioVersion,
                    )?.hostedRuntime?.runtimeId
                  }
                />
                <EvidenceAssessmentCatalog
                  evidenceDefinitions={
                    preview.evidenceDefinitions
                  }
                  packId={preview.packId}
                  packVersion={preview.packVersion}
                  scenarioId={preview.scenarioId}
                  scenarioVersion={preview.scenarioVersion}
                />
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

function AuditAuthoringSummary({
  pack,
}: {
  readonly pack: ScenarioPackV2;
}): ReactNode {
  const t = useTranslator();
  const cases = pack.scenarios.flatMap((scenario) =>
    scenario.auditCase === undefined
      ? []
      : [
          {
            scenarioId: scenario.scenarioId,
            auditCase: scenario.auditCase,
          },
        ],
  );
  if (cases.length === 0 && pack.auditVariantBanks.length === 0) {
    return null;
  }
  return (
    <section
      className="instructor-review__mode-settings"
      aria-labelledby="audit-authoring-summary-heading"
    >
      <h3 id="audit-authoring-summary-heading">
        {t("scenarioAuthor.auditSummaryHeading")}
      </h3>
      <p>{t("scenarioAuthor.auditSummaryHelp")}</p>
      {cases.length === 0 ? null : (
        <>
          <h4>{t("scenarioAuthor.auditCasesHeading")}</h4>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t("scenarioAuthor.auditCase")}</th>
                  <th scope="col">{t("scenarioAuthor.auditSupport")}</th>
                  <th scope="col">{t("scenarioAuthor.auditFindings")}</th>
                  <th scope="col">{t("scenarioAuthor.auditDecoys")}</th>
                  <th scope="col">{t("scenarioAuthor.auditEvidence")}</th>
                  <th scope="col">{t("scenarioAuthor.auditPolicies")}</th>
                  <th scope="col">{t("scenarioAuthor.auditScoring")}</th>
                </tr>
              </thead>
              <tbody>
                {cases.map(({ scenarioId, auditCase }) => (
                  <tr key={`${scenarioId}:${auditCase.auditCaseId}`}>
                    <td>
                      <code>
                        {auditCase.auditCaseId}@{auditCase.version}
                      </code>
                      <br />
                      <code>{scenarioId}</code>
                    </td>
                    <td>{auditCase.supportProfiles.join(", ")}</td>
                    <td>{auditCase.findingDefinitions.length}</td>
                    <td>{auditCase.decoyDefinitions.length}</td>
                    <td>{auditCase.evidenceItemIds.length}</td>
                    <td>{auditCase.policyIds.length}</td>
                    <td>
                      <code>
                        {auditCase.scoringBlueprint.scoringBlueprintId}
                      </code>
                      <br />
                      {t("scenarioAuthor.auditScoreValue", {
                        maximum:
                          auditCase.scoringBlueprint.maximumScore,
                        pass: auditCase.scoringBlueprint.passScore,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {pack.auditVariantBanks.length === 0 ? (
        <p>{t("scenarioAuthor.auditNoVariantBank")}</p>
      ) : (
        <>
          <h4>{t("scenarioAuthor.auditBanksHeading")}</h4>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t("scenarioAuthor.auditBank")}</th>
                  <th scope="col">{t("scenarioAuthor.auditBankStatus")}</th>
                  <th scope="col">{t("scenarioAuthor.auditVariants")}</th>
                  <th scope="col">{t("scenarioAuthor.auditBlueprint")}</th>
                </tr>
              </thead>
              <tbody>
                {pack.auditVariantBanks.map((bank) => (
                  <tr key={`${bank.bankId}:${bank.bankVersion}`}>
                    <td>
                      <code>
                        {bank.bankId}@{bank.bankVersion}
                      </code>
                    </td>
                    <td>{bank.status}</td>
                    <td>{bank.variants.length}</td>
                    <td>
                      {t("scenarioAuthor.auditBlueprintValue", {
                        findings:
                          `${bank.blueprint.materialFindingCount.minimum}–${bank.blueprint.materialFindingCount.maximum}`,
                        decoys:
                          `${bank.blueprint.decoyCount.minimum}–${bank.blueprint.decoyCount.maximum}`,
                        evidence:
                          `${bank.blueprint.evidenceItemCount.minimum}–${bank.blueprint.evidenceItemCount.maximum}`,
                        policies:
                          `${bank.blueprint.policyCount.minimum}–${bank.blueprint.policyCount.maximum}`,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pack.auditVariantBanks.some(
            (bank) => bank.status === "DRAFT",
          ) ? (
            <p className="notice notice--standalone">
              {t("scenarioAuthor.auditCalibrationWarning")}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function PreviewWorkflow({
  preview,
  specializedRuntimeId,
}: {
  readonly preview: ScenarioRolePreviewV1;
  readonly specializedRuntimeId: string | undefined;
}): ReactNode {
  const t = useTranslator();
  const nodeById = new Map(
    preview.nodes.map((node) => [node.nodeId, node]),
  );
  const incomingByNodeId = new Map<
    string,
    ScenarioPreviewTransitionV1[]
  >();
  for (const node of preview.nodes) {
    for (const transition of node.transitions) {
      incomingByNodeId.set(transition.toNodeId, [
        ...(incomingByNodeId.get(transition.toNodeId) ?? []),
        transition,
      ]);
    }
  }
  const conditionText = (
    transition: ScenarioPreviewTransitionV1,
  ): string => {
    const condition = transition.condition;
    switch (condition.kind) {
      case "ALWAYS":
        return t("scenarioAuthor.previewCondition.always");
      case "DECISION_OPTION_SELECTED":
        return condition.optionLabel;
      case "POLICY_RESULT":
        return t("scenarioAuthor.previewCondition.policyResult", {
          policyId: condition.policyId,
          outcome: t(
            `scenarioAuthor.previewCondition.outcome.${condition.outcome}`,
          ),
        });
      case "EVENT_OCCURRED":
        return t("scenarioAuthor.previewCondition.eventOccurred", {
          eventType: condition.eventType,
        });
    }
  };

  return (
    <section
      className="scenario-author__preview-flow"
      aria-labelledby="scenario-author-preview-flow-heading"
    >
      <h4 id="scenario-author-preview-flow-heading">
        {t("scenarioAuthor.previewFlowHeading")}
      </h4>
      <p>{t("scenarioAuthor.previewFlowHelp")}</p>
      {specializedRuntimeId === "tracechain-audit-v1" ? (
        <p className="notice notice--standalone">
          {t("scenarioAuthor.previewAuditRuntimeHelp")}
        </p>
      ) : null}
      <ol className="scenario-author__preview-node-list">
        {preview.nodes.map((node) => {
          const incoming = incomingByNodeId.get(node.nodeId) ?? [];
          const conditionalIncoming = incoming.filter(
            (transition) => transition.condition.kind !== "ALWAYS",
          );
          return (
            <li
              className="scenario-author__preview-node"
              key={node.nodeId}
            >
              <div className="scenario-author__preview-node-heading">
                <h5>{node.title}</h5>
                <code>{node.nodeId}</code>
              </div>
              <p className="scenario-author__preview-node-type">
                <code>{node.nodeType}</code>
              </p>
              {conditionalIncoming.length === 1 ? (
                <p>
                  {t("scenarioAuthor.previewReachedWhen")}{" "}
                  <strong>
                    {conditionText(conditionalIncoming[0]!)}
                  </strong>
                </p>
              ) : null}
              {incoming.length > 1 ? (
                <p>
                  {t("scenarioAuthor.previewRejoins", {
                    count: incoming.length,
                  })}
                </p>
              ) : null}
              {node.visibleEvidenceIds.length === 0 ? null : (
                <p>
                  {t("scenarioAuthor.visibleEvidence", {
                    count: node.visibleEvidenceIds.length,
                  })}
                </p>
              )}
              {node.transitions.length === 0 ? (
                <p>{t("scenarioAuthor.previewPathEnds")}</p>
              ) : (
                <div className="scenario-author__preview-transitions">
                  <p>
                    <strong>
                      {node.transitions.length > 1
                        ? t(
                            "scenarioAuthor.previewAlternativeBranches",
                          )
                        : t("scenarioAuthor.previewNextNode")}
                    </strong>
                  </p>
                  <ul>
                    {node.transitions.map((transition) => {
                      const target = nodeById.get(
                        transition.toNodeId,
                      );
                      return (
                        <li key={transition.transitionId}>
                          <span className="scenario-author__preview-condition">
                            {conditionText(transition)}
                          </span>
                          <span aria-hidden="true">→</span>
                          <span>
                            <strong>
                              {target?.title ?? transition.toNodeId}
                            </strong>{" "}
                            <code>{transition.toNodeId}</code>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function scenarioReference(
  scenario: ScenarioPackV2["scenarios"][number] | undefined,
): string {
  return scenario === undefined
    ? ""
    : JSON.stringify({
        scenarioId: scenario.scenarioId,
        scenarioVersion: scenario.version,
      });
}

function PreviewFields({
  pack,
}: {
  readonly pack: ScenarioPackV2;
}): ReactNode {
  const t = useTranslator();
  const firstScenario = pack.scenarios[0];
  const [selectedScenarioReference, setScenarioReference] =
    useState(scenarioReference(firstScenario));
  const [selectedRoleId, setRoleId] = useState(
    firstScenario?.roles[0]?.roleId ?? "",
  );
  const [selectedLocale, setLocale] = useState(
    pack.supportedLocales[0] ?? "",
  );
  const scenario =
    pack.scenarios.find(
      (candidate) =>
        scenarioReference(candidate) === selectedScenarioReference,
    ) ?? firstScenario;
  if (scenario === undefined) return null;
  const localizedLabel = (localizationKey: string): string =>
    pack.localizationCatalogs?.[selectedLocale]?.[localizationKey] ??
    t(localizationKey);
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
          value={selectedScenarioReference}
          onChange={(event) => {
            const reference = event.target.value;
            const nextScenario = pack.scenarios.find(
              (candidate) =>
                scenarioReference(candidate) === reference,
            );
            setScenarioReference(reference);
            setRoleId(nextScenario?.roles[0]?.roleId ?? "");
          }}
        >
          {pack.scenarios.map((candidate) => (
            <option
              key={`${candidate.scenarioId}@${candidate.version}`}
              value={scenarioReference(candidate)}
            >
              {localizedLabel(candidate.title.localizationKey)}
            </option>
          ))}
        </select>
        <span className="field__hint scenario-author__identifier">
          <code>
            {scenario.scenarioId}@{scenario.version}
          </code>
        </span>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="preview-role">
          {t("scenarioAuthor.role")}
        </label>
        <select
          className="field__control"
          id="preview-role"
          name="roleId"
          value={selectedRoleId}
          onChange={(event) => setRoleId(event.target.value)}
        >
          {scenario.roles.map((role) => (
            <option key={role.roleId} value={role.roleId}>
              {localizedLabel(role.displayName.localizationKey)}
            </option>
          ))}
        </select>
        <span className="field__hint scenario-author__identifier">
          <code>{selectedRoleId}</code>
        </span>
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
          value={selectedLocale}
          onChange={(event) => setLocale(event.target.value)}
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
