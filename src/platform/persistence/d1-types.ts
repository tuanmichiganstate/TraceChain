export interface D1ResultLike {
  readonly success: boolean;
  readonly error?: string;
  readonly meta?: {
    readonly changes?: number;
  };
}

export interface D1AllResultLike<Row> extends D1ResultLike {
  readonly results: readonly Row[];
}

export interface D1PreparedStatementLike {
  bind(...values: readonly unknown[]): D1PreparedStatementLike;
  first<Row = Record<string, unknown>>(): Promise<Row | null>;
  all<Row = Record<string, unknown>>(): Promise<D1AllResultLike<Row>>;
  run(): Promise<D1ResultLike>;
}

/**
 * Structural subset of Cloudflare's D1Database API.
 *
 * Platform services depend on this port instead of importing deployment SDK
 * types. The native D1 binding satisfies it structurally.
 */
export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch(
    statements: readonly D1PreparedStatementLike[],
  ): Promise<readonly D1ResultLike[]>;
}
