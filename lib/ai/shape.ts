// A small check that a parsed answer matches its JSON schema, for the subset of
// JSON schema our answer formats use: object, array, string, number, integer,
// boolean, null, enum and anyOf. Structured outputs should already guarantee
// the shape; this turns a surprise into a short error instead of a crash.

type Schema = {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: unknown[];
  anyOf?: Schema[];
};

/** null when `value` matches `schema`; otherwise the short error for the first mismatch. */
export function shapeError(value: unknown, schema: Schema, path = ""): string | null {
  if (schema.anyOf) {
    return schema.anyOf.some((option) => shapeError(value, option, path) === null) ? null : wrong(path);
  }
  if (schema.enum && !schema.enum.includes(value)) return wrong(path);
  switch (schema.type) {
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return wrong(path);
      const record = value as Record<string, unknown>;
      for (const key of schema.required ?? []) {
        if (!(key in record)) return `Answer is missing ${join(path, key)}`;
      }
      for (const [key, property] of Object.entries(schema.properties ?? {})) {
        const error = key in record ? shapeError(record[key], property, join(path, key)) : null;
        if (error) return error;
      }
      return null;
    }
    case "array": {
      if (!Array.isArray(value)) return wrong(path);
      for (const [i, item] of value.entries()) {
        const error = schema.items ? shapeError(item, schema.items, `${path}[${i}]`) : null;
        if (error) return error;
      }
      return null;
    }
    case "string":
    case "boolean":
      return typeof value === schema.type ? null : wrong(path);
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : wrong(path);
    case "integer":
      return Number.isInteger(value) ? null : wrong(path);
    case "null":
      return value === null ? null : wrong(path);
    default:
      return null;
  }
}

const join = (path: string, key: string) => (path ? `${path}.${key}` : key);
const wrong = (path: string) => `Answer has a wrong ${path || "shape"}`;
