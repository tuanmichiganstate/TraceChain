import type { ApplicationRole } from "../contracts/run-events";
import type { ApplicationPrincipal } from "../hosted/access";
import type { D1DatabaseLike } from "./d1-types";

const SELECT_PRINCIPAL = `SELECT
    users.user_id,
    users.email,
    roles.application_role
  FROM application_users AS users
  JOIN application_role_assignments AS roles
    ON roles.user_id = users.user_id
  WHERE users.email = ? COLLATE NOCASE
    AND users.status = 'active'
  ORDER BY roles.application_role ASC`;

const APPLICATION_ROLES = new Set<ApplicationRole>([
  "learner",
  "instructor",
  "scenario-author",
  "administrator",
  "rater",
]);

interface PrincipalRow {
  readonly user_id: string;
  readonly email: string;
  readonly application_role: string;
}

export class D1PrincipalRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "D1PrincipalRepositoryError";
  }
}

export class D1ApplicationPrincipalRepository {
  constructor(private readonly database: D1DatabaseLike) {}

  async findActiveByVerifiedEmail(
    verifiedEmail: string,
  ): Promise<ApplicationPrincipal | null> {
    const normalizedEmail = verifiedEmail.trim().toLowerCase();
    if (
      normalizedEmail.length === 0 ||
      normalizedEmail.length > 320
    ) {
      return null;
    }
    const result = await this.database
      .prepare(SELECT_PRINCIPAL)
      .bind(normalizedEmail)
      .all<PrincipalRow>();
    if (!result.success) {
      throw new D1PrincipalRepositoryError(
        result.error ?? "Could not resolve authenticated user.",
      );
    }
    if (result.results.length === 0) return null;
    const first = result.results[0];
    if (first === undefined) return null;
    const roles: ApplicationRole[] = [];
    for (const row of result.results) {
      if (
        row.user_id !== first.user_id ||
        row.email.toLowerCase() !== first.email.toLowerCase() ||
        !APPLICATION_ROLES.has(
          row.application_role as ApplicationRole,
        )
      ) {
        throw new D1PrincipalRepositoryError(
          "Application-role rows are inconsistent or invalid.",
        );
      }
      roles.push(row.application_role as ApplicationRole);
    }
    return {
      userId: first.user_id,
      email: first.email,
      roles: [...new Set(roles)].sort(),
    };
  }
}
