/**
 * Canonical serialization for hash inputs (specification section 15.2).
 *
 * `JSON.stringify` is not usable directly: its key order follows insertion
 * order, so two structurally identical payloads built by different code paths
 * would hash differently. It also silently converts `NaN` and `Infinity` to
 * `null`, which would corrupt a hash input without any error.
 *
 * The output is valid JSON with recursively sorted keys, which keeps it
 * readable in developer diagnostics.
 *
 * On excluding calculated hash fields: rather than filtering keys by name --
 * which would be ambiguous, since `previousBlockHash` and `contentHash` are
 * legitimate *inputs* -- the payload builders in hash-payloads.ts construct
 * explicit typed objects that simply never contain the field being calculated.
 * Tests assert that property directly.
 */

export class CanonicalizationError extends Error {
  constructor(message: string, readonly path: string) {
    super(`${message} (at ${path || "root"})`);
    this.name = "CanonicalizationError";
  }
}

function describePath(path: readonly string[]): string {
  return path.join(".");
}

function isDate(value: object): value is Date {
  return Object.prototype.toString.call(value) === "[object Date]";
}

function serialize(value: unknown, path: string[], seen: Set<object>): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";

    case "number":
      if (!Number.isFinite(value)) {
        throw new CanonicalizationError(
          `Non-finite number cannot be canonicalized: ${String(value)}`,
          describePath(path),
        );
      }
      // JSON.stringify uses the ECMA-262 shortest round-trip representation,
      // which is deterministic across conforming engines. It also renders -0
      // as "0", which is the behaviour we want for hashing.
      return JSON.stringify(value);

    case "string":
      return JSON.stringify(value);

    case "undefined":
      // Reachable only inside arrays; object properties are filtered earlier.
      throw new CanonicalizationError(
        "undefined cannot be canonicalized inside an array",
        describePath(path),
      );

    case "bigint":
      throw new CanonicalizationError("bigint cannot be canonicalized", describePath(path));

    case "function":
      throw new CanonicalizationError("function cannot be canonicalized", describePath(path));

    case "symbol":
      throw new CanonicalizationError("symbol cannot be canonicalized", describePath(path));

    case "object":
      break;

    default:
      throw new CanonicalizationError(
        `Unsupported value type: ${typeof value}`,
        describePath(path),
      );
  }

  const objectValue = value as object;

  if (seen.has(objectValue)) {
    throw new CanonicalizationError(
      "Circular reference cannot be canonicalized",
      describePath(path),
    );
  }

  if (isDate(objectValue)) {
    const time = objectValue.getTime();
    if (Number.isNaN(time)) {
      throw new CanonicalizationError("Invalid Date cannot be canonicalized", describePath(path));
    }
    return JSON.stringify(objectValue.toISOString());
  }

  seen.add(objectValue);
  try {
    if (Array.isArray(objectValue)) {
      // Array order is meaningful and is preserved exactly.
      const items = objectValue.map((item, index) =>
        serialize(item, [...path, String(index)], seen),
      );
      return `[${items.join(",")}]`;
    }

    const record = objectValue as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const entries: string[] = [];
    for (const key of keys) {
      const propertyValue = record[key];
      // Undefined properties are excluded entirely rather than serialized as
      // null, so that an absent field and an explicitly-undefined field hash
      // identically.
      if (propertyValue === undefined) {
        continue;
      }
      entries.push(`${JSON.stringify(key)}:${serialize(propertyValue, [...path, key], seen)}`);
    }
    return `{${entries.join(",")}}`;
  } finally {
    seen.delete(objectValue);
  }
}

/**
 * Produce the canonical string form of a value, suitable as a hash input.
 * Throws {@link CanonicalizationError} rather than silently emitting a value
 * that would produce a misleading hash.
 */
export function canonicalize(value: unknown): string {
  return serialize(value, [], new Set<object>());
}
