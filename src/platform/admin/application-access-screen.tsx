import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslator } from "../../app/providers/locale-provider";
import type {
  ApplicationAccessAuditRecordV1,
  ApplicationUserAccessV1,
  ApplicationUserStatus,
  UpsertApplicationUserAccessRequest,
  UpsertApplicationUserAccessResult,
} from "../contracts/access-administration";
import type { ApplicationRole } from "../contracts/run-events";

const APPLICATION_ROLES: readonly ApplicationRole[] = [
  "learner",
  "instructor",
  "scenario-author",
  "rater",
  "administrator",
];

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class ApplicationAccessApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ApplicationAccessApiError";
  }
}

export interface ApplicationAccessApi {
  loadUsers(): Promise<readonly ApplicationUserAccessV1[]>;
  loadAudit(): Promise<readonly ApplicationAccessAuditRecordV1[]>;
  saveUser(
    request: UpsertApplicationUserAccessRequest,
  ): Promise<UpsertApplicationUserAccessResult>;
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
    throw new ApplicationAccessApiError(
      body.error?.code ?? "APPLICATION_ACCESS_REQUEST_FAILED",
    );
  }
  return body;
}

export function createApplicationAccessApi(
  fetcher: FetchLike = globalThis.fetch.bind(globalThis),
): ApplicationAccessApi {
  return {
    async loadUsers() {
      return (
        await apiJson<{
          readonly users: readonly ApplicationUserAccessV1[];
        }>(fetcher, "/api/v1/admin/users")
      ).users;
    },
    async loadAudit() {
      return (
        await apiJson<{
          readonly audit: readonly ApplicationAccessAuditRecordV1[];
        }>(fetcher, "/api/v1/admin/access-audit")
      ).audit;
    },
    saveUser(request) {
      return apiJson<UpsertApplicationUserAccessResult>(
        fetcher,
        "/api/v1/admin/users",
        {
          method: "POST",
          body: JSON.stringify(request),
        },
      );
    },
  };
}

const browserApi = createApplicationAccessApi();

function commandId(): string {
  return `COMMAND_ACCESS_${crypto.randomUUID()}`;
}

function sortedUsers(
  users: readonly ApplicationUserAccessV1[],
): readonly ApplicationUserAccessV1[] {
  return [...users].sort((left, right) =>
    left.email.localeCompare(right.email),
  );
}

export function ApplicationAccessScreen({
  api = browserApi,
}: {
  readonly api?: ApplicationAccessApi;
}): ReactNode {
  const t = useTranslator();
  const [users, setUsers] =
    useState<readonly ApplicationUserAccessV1[] | null>(null);
  const [audit, setAudit] =
    useState<readonly ApplicationAccessAuditRecordV1[] | null>(
      null,
    );
  const [auditError, setAuditError] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] =
    useState<ApplicationUserStatus>("active");
  const [roles, setRoles] = useState<readonly ApplicationRole[]>([
    "learner",
  ]);
  const [editingUserId, setEditingUserId] =
    useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [savedEmail, setSavedEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api.loadUsers().then(
      (loaded) => {
        if (active) setUsers(sortedUsers(loaded));
      },
      (error: unknown) => {
        if (active) {
          setErrorCode(
            error instanceof ApplicationAccessApiError
              ? error.code
              : "APPLICATION_ACCESS_REQUEST_FAILED",
          );
        }
      },
    );
    void api.loadAudit().then(
      (loaded) => {
        if (active) {
          setAudit(loaded);
          setAuditError(false);
        }
      },
      () => {
        if (active) setAuditError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [api]);

  function resetForm(): void {
    setEmail("");
    setStatus("active");
    setRoles(["learner"]);
    setEditingUserId(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (roles.length === 0) return;
    setBusy(true);
    setErrorCode(null);
    setSavedEmail(null);
    try {
      const result = await api.saveUser({
        commandId: commandId(),
        email,
        status,
        roles,
      });
      setUsers((current) =>
        sortedUsers([
          ...(current ?? []).filter(
            (user) => user.userId !== result.user.userId,
          ),
          result.user,
        ]),
      );
      setSavedEmail(result.user.email);
      resetForm();
      void api.loadAudit().then(
        (loaded) => {
          setAudit(loaded);
          setAuditError(false);
        },
        () => setAuditError(true),
      );
    } catch (error: unknown) {
      setErrorCode(
        error instanceof ApplicationAccessApiError
          ? error.code
          : "APPLICATION_ACCESS_REQUEST_FAILED",
      );
    } finally {
      setBusy(false);
    }
  }

  function editUser(user: ApplicationUserAccessV1): void {
    setEditingUserId(user.userId);
    setEmail(user.email);
    setStatus(user.status);
    setRoles(user.roles);
    setErrorCode(null);
    setSavedEmail(null);
  }

  function toggleRole(role: ApplicationRole): void {
    setRoles((current) =>
      current.includes(role)
        ? current.filter((candidate) => candidate !== role)
        : [...current, role],
    );
  }

  const errorKey =
    errorCode === "SELF_ADMINISTRATION_FORBIDDEN"
      ? "adminAccess.error.self"
      : errorCode === "ACCESS_COMMAND_CONFLICT"
        ? "adminAccess.error.conflict"
        : "adminAccess.error.generic";

  return (
    <>
      <a className="skip-link" href="#main-content">
        {t("navigation.skip")}
      </a>
      <main className="start" id="main-content">
        <div className="start__inner">
          <header className="instructor-review__header">
            <p className="eyebrow">{t("adminAccess.eyebrow")}</p>
            <h1>{t("adminAccess.title")}</h1>
            <p className="start__subtitle">
              {t("adminAccess.subtitle")}
            </p>
          </header>

          <section className="card card--work">
            <h2>
              {editingUserId === null
                ? t("adminAccess.provision")
                : t("adminAccess.update")}
            </h2>
            <form
              className="instructor-review__form-grid"
              onSubmit={(event) => void submit(event)}
            >
              <label>
                <span>{t("adminAccess.email")}</span>
                <input
                  type="email"
                  value={email}
                  readOnly={editingUserId !== null}
                  required
                  maxLength={320}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label>
                <span>{t("adminAccess.status")}</span>
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(
                      event.target.value as ApplicationUserStatus,
                    )
                  }
                >
                  <option value="active">
                    {t("adminAccess.status.active")}
                  </option>
                  <option value="disabled">
                    {t("adminAccess.status.disabled")}
                  </option>
                </select>
              </label>
              <fieldset>
                <legend>{t("adminAccess.roles")}</legend>
                {APPLICATION_ROLES.map((role) => (
                  <label key={role}>
                    <input
                      type="checkbox"
                      checked={roles.includes(role)}
                      onChange={() => toggleRole(role)}
                    />{" "}
                    {t(`adminAccess.role.${role}`)}
                  </label>
                ))}
              </fieldset>
              {roles.length === 0 ? (
                <p className="notice" role="alert">
                  {t("adminAccess.rolesRequired")}
                </p>
              ) : null}
              <div>
                <button
                  className="button button--primary"
                  type="submit"
                  disabled={busy || roles.length === 0}
                >
                  {busy
                    ? t("adminAccess.saving")
                    : t("adminAccess.save")}
                </button>
                {editingUserId === null ? null : (
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={resetForm}
                  >
                    {t("adminAccess.cancel")}
                  </button>
                )}
              </div>
            </form>
            {errorCode === null ? null : (
              <p className="notice notice--standalone" role="alert">
                {t(errorKey)}
              </p>
            )}
            {savedEmail === null ? null : (
              <p role="status">
                {t("adminAccess.saved", { email: savedEmail })}
              </p>
            )}
          </section>

          <section className="card card--reference">
            <h2>{t("adminAccess.users")}</h2>
            {users === null ? (
              <p role="status">{t("adminAccess.loading")}</p>
            ) : users.length === 0 ? (
              <p>{t("adminAccess.empty")}</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">{t("adminAccess.email")}</th>
                      <th scope="col">{t("adminAccess.status")}</th>
                      <th scope="col">{t("adminAccess.roles")}</th>
                      <th scope="col">{t("adminAccess.action")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.userId}>
                        <td>{user.email}</td>
                        <td>
                          {t(`adminAccess.status.${user.status}`)}
                        </td>
                        <td>
                          {user.roles
                            .map((role) =>
                              t(`adminAccess.role.${role}`),
                            )
                            .join(", ")}
                        </td>
                        <td>
                          <button
                            className="button button--secondary"
                            type="button"
                            aria-label={t("adminAccess.editUser", {
                              email: user.email,
                            })}
                            onClick={() => editUser(user)}
                          >
                            {t("adminAccess.edit")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card card--reference">
            <h2>{t("adminAccess.audit")}</h2>
            <p>{t("adminAccess.auditDescription")}</p>
            {auditError ? (
              <p className="notice notice--standalone" role="alert">
                {t("adminAccess.auditError")}
              </p>
            ) : audit === null ? (
              <p role="status">{t("adminAccess.auditLoading")}</p>
            ) : audit.length === 0 ? (
              <p>{t("adminAccess.auditEmpty")}</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        {t("adminAccess.performedAt")}
                      </th>
                      <th scope="col">
                        {t("adminAccess.performedBy")}
                      </th>
                      <th scope="col">{t("adminAccess.target")}</th>
                      <th scope="col">{t("adminAccess.status")}</th>
                      <th scope="col">{t("adminAccess.roles")}</th>
                      <th scope="col">{t("adminAccess.command")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((record) => (
                      <tr key={record.commandId}>
                        <td>
                          <time dateTime={record.performedAt}>
                            {record.performedAt}
                          </time>
                        </td>
                        <td>{record.performedByEmail}</td>
                        <td>{record.targetEmail}</td>
                        <td>
                          {t(`adminAccess.status.${record.status}`)}
                        </td>
                        <td>
                          {record.roles
                            .map((role) =>
                              t(`adminAccess.role.${role}`),
                            )
                            .join(", ")}
                        </td>
                        <td>
                          <code>{record.commandId}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
