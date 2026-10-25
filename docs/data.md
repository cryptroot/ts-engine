# Data

Schema validation for JSON content, with versioned migrations and an id-keyed registry. Validation
returns results instead of throwing, except for the explicit `*OrThrow` and registry helpers.

Import from `ts-engine/data`. The `schema` builder is also exported from the root entry.

## Schema builder

`schema` builds validators. Each validator has `parse(value, path?)`, which returns a
`ValidationResult<T>`.

```ts
type ValidationIssue = { readonly path: string; readonly message: string };
type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: ValidationIssue[] };

interface Schema<T> {
  parse(value: unknown, path?: string): ValidationResult<T>;
}

const schema: {
  string(options?: { minLength?: number; pattern?: RegExp }): Schema<string>;
  number(options?: { integer?: boolean; min?: number; max?: number }): Schema<number>;
  boolean(): Schema<boolean>;
  literal<const V extends string | number | boolean>(expected: V): Schema<V>;
  enumOf<const V extends readonly string[]>(values: V): Schema<V[number]>;
  array<T>(item: Schema<T>): Schema<T[]>;
  record<T>(value: Schema<T>): Schema<Record<string, T>>;
  optional<T>(member: Schema<T>): OptionalSchema<T>;
  object<S extends Shape>(shape: S, options?: { passthrough?: boolean }): Schema<ObjectOutput<S>>;
  union<S extends [Schema<unknown>, Schema<unknown>, ...Schema<unknown>[]]>(
    ...members: S
  ): Schema<Infer<S[number]>>;
  refine<T>(base: Schema<T>, predicate: (value: T) => boolean, message: string): Schema<T>;
};
```

`object` rejects unknown keys unless `passthrough: true`. `optional` marks a key as not required
inside `object`. `Infer<S>` extracts the value type of a schema.

## Loading documents

A content document is a JSON object with an integer `schemaVersion`. The loader removes
`schemaVersion` before running the content schema, so the schema never declares it. Migrations
move older documents forward one step at a time.

```ts
interface ContentLoadOptions<T> {
  readonly schema: Schema<T>;
  readonly currentVersion: number;
  readonly migrations?: readonly MigrationStep[];
}

type MigrationStep = {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(doc: Record<string, unknown>): Record<string, unknown>;
};

function loadContent<T>(json: unknown, options: ContentLoadOptions<T>): ValidationResult<T>;
function parseContent<T>(text: string, options: ContentLoadOptions<T>): ValidationResult<T>;
function assertValidContent<T>(result: ValidationResult<T>): T;
function loadContentOrThrow<T>(json: unknown, options: ContentLoadOptions<T>): T;
```

- `loadContent` never throws. Problems come back as issues, for example at `$.schemaVersion` for a
  missing, non-integer, or too-new version, or when a migration step is missing.
- `parseContent` reads JSON text. Invalid JSON becomes one issue at `$`.
- `assertValidContent` and `loadContentOrThrow` throw on failure.

## Registry

```ts
class ContentRegistry<T extends { id: string }> {
  get size(): number;
  register(item: T): void;
  registerAll(items: readonly T[]): void; // all-or-nothing
  get(id: string): T;
  tryGet(id: string): T | undefined;
  has(id: string): boolean;
  ids(): string[];
  all(): T[];
}
```

`registerAll` validates the whole batch first, so a duplicate leaves the registry unchanged.

## Error codes

| Code                   | Thrown by                                  |
| ---------------------- | ------------------------------------------ |
| `INVALID_CONTENT`      | `assertValidContent`, `loadContentOrThrow` |
| `DUPLICATE_CONTENT_ID` | `register`, `registerAll`                  |
| `UNKNOWN_CONTENT_ID`   | `get`                                      |

## Example

```ts
import { ContentRegistry, loadContentOrThrow, schema } from 'ts-engine/data';

const itemSchema = schema.object({
  id: schema.string({ minLength: 1 }),
  price: schema.number({ integer: true, min: 0 }),
  tags: schema.optional(schema.array(schema.string())),
});

const catalogue = loadContentOrThrow(
  { schemaVersion: 1, items: [{ id: 'apple', price: 2 }] },
  { schema: schema.object({ items: schema.array(itemSchema) }), currentVersion: 1 },
);

const registry = new ContentRegistry<(typeof catalogue.items)[number]>();
registry.registerAll(catalogue.items);
registry.get('apple').price; // 2
```
