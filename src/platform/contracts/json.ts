export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
