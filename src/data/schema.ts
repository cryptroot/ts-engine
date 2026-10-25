export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: ValidationIssue[] };

export interface Schema<T> {
  parse(value: unknown, path?: string): ValidationResult<T>;
}

export interface OptionalSchema<T> extends Schema<T> {
  readonly optional: true;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

export type Shape = { readonly [key: string]: Schema<unknown> };

type OptionalKeys<S extends Shape> = {
  [K in keyof S]: S[K] extends OptionalSchema<unknown> ? K : never;
}[keyof S];

type RequiredKeys<S extends Shape> = Exclude<keyof S, OptionalKeys<S>>;

type Flatten<T> = { [K in keyof T]: T[K] };

export type ObjectOutput<S extends Shape> = Flatten<
  { [K in RequiredKeys<S>]: Infer<S[K]> } & { [K in OptionalKeys<S>]?: Infer<S[K]> }
>;

export interface ObjectOptions {
  readonly passthrough?: boolean;
}

const ROOT_PATH = '$';

const success = <T>(value: T): ValidationResult<T> => ({ ok: true, value });

const failure = (errors: ValidationIssue[]): { ok: false; errors: ValidationIssue[] } => ({
  ok: false,
  errors,
});

const issue = (path: string, message: string): { ok: false; errors: ValidationIssue[] } =>
  failure([{ path, message }]);

const typeMismatch = (path: string, expected: string, value: unknown): ValidationResult<never> =>
  issue(path, `expected ${expected}, received ${describeType(value)}`);

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ownValue(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function isOptional<T>(member: Schema<T>): member is OptionalSchema<T> {
  return 'optional' in member && member.optional === true;
}

function joinKey(path: string, key: string): string {
  return `${path}.${key}`;
}

function defineSchema<T>(check: (value: unknown, path: string) => ValidationResult<T>): Schema<T> {
  return { parse: (value, path = ROOT_PATH) => check(value, path) };
}

function literalDescription(value: string | number | boolean): string {
  return JSON.stringify(value);
}

export interface StringOptions {
  readonly minLength?: number;
  readonly pattern?: RegExp;
}

export interface NumberOptions {
  readonly integer?: boolean;
  readonly min?: number;
  readonly max?: number;
}

export const schema = {
  string(options: StringOptions = {}): Schema<string> {
    return defineSchema((value, path) => {
      if (typeof value !== 'string') return typeMismatch(path, 'string', value);
      if (options.minLength !== undefined && value.length < options.minLength) {
        return issue(path, `must have at least ${options.minLength} characters`);
      }
      // String.search ignores the regex's lastIndex, so a global flag cannot make this stateful.
      if (options.pattern !== undefined && value.search(options.pattern) < 0) {
        return issue(path, `must match ${options.pattern.toString()}`);
      }
      return success(value);
    });
  },

  number(options: NumberOptions = {}): Schema<number> {
    return defineSchema((value, path) => {
      if (typeof value !== 'number') return typeMismatch(path, 'number', value);
      if (!Number.isFinite(value)) return issue(path, 'must be a finite number');
      if (options.integer === true && !Number.isInteger(value)) {
        return issue(path, 'must be an integer');
      }
      if (options.min !== undefined && value < options.min) {
        return issue(path, `must be >= ${options.min}`);
      }
      if (options.max !== undefined && value > options.max) {
        return issue(path, `must be <= ${options.max}`);
      }
      return success(value);
    });
  },

  boolean(): Schema<boolean> {
    return defineSchema((value, path) =>
      typeof value === 'boolean' ? success(value) : typeMismatch(path, 'boolean', value),
    );
  },

  literal<const V extends string | number | boolean>(expected: V): Schema<V> {
    return defineSchema((value, path) =>
      value === expected
        ? success(expected)
        : issue(path, `expected ${literalDescription(expected)}`),
    );
  },

  enumOf<const V extends readonly string[]>(values: V): Schema<V[number]> {
    const described = values.map(literalDescription).join(', ');
    return defineSchema((value, path) => {
      const match = values.find((candidate) => candidate === value);
      return match !== undefined ? success(match) : issue(path, `expected one of ${described}`);
    });
  },

  array<T>(item: Schema<T>): Schema<T[]> {
    return defineSchema((value, path) => {
      if (!Array.isArray(value)) return typeMismatch(path, 'array', value);
      const items: T[] = [];
      const errors: ValidationIssue[] = [];
      for (const [index, element] of value.entries()) {
        const result = item.parse(element, `${path}[${index}]`);
        if (result.ok) items.push(result.value);
        else errors.push(...result.errors);
      }
      return errors.length > 0 ? failure(errors) : success(items);
    });
  },

  record<T>(value: Schema<T>): Schema<Record<string, T>> {
    return defineSchema((input, path) => {
      if (!isRecord(input)) return typeMismatch(path, 'object', input);
      const entries: [string, T][] = [];
      const errors: ValidationIssue[] = [];
      for (const [key, entry] of Object.entries(input)) {
        const result = value.parse(entry, joinKey(path, key));
        if (result.ok) entries.push([key, result.value]);
        else errors.push(...result.errors);
      }
      return errors.length > 0 ? failure(errors) : success(Object.fromEntries(entries));
    });
  },

  optional<T>(member: Schema<T>): OptionalSchema<T> {
    return {
      parse: (value, path) => member.parse(value, path),
      optional: true,
    };
  },

  object<S extends Shape>(shape: S, options: ObjectOptions = {}): Schema<ObjectOutput<S>> {
    const declaredKeys = new Set(Object.keys(shape));
    return defineSchema((value, path) => {
      if (!isRecord(value)) return typeMismatch(path, 'object', value);
      const entries: [string, unknown][] = [];
      const errors: ValidationIssue[] = [];

      for (const [key, field] of Object.entries(shape)) {
        const childPath = joinKey(path, key);
        const raw = ownValue(value, key);
        if (raw === undefined) {
          if (!isOptional(field)) errors.push({ path: childPath, message: 'is required' });
          continue;
        }
        const result = field.parse(raw, childPath);
        if (result.ok) entries.push([key, result.value]);
        else errors.push(...result.errors);
      }

      for (const key of Object.keys(value)) {
        if (declaredKeys.has(key)) continue;
        if (options.passthrough === true) entries.push([key, ownValue(value, key)]);
        else errors.push({ path: joinKey(path, key), message: 'unknown key' });
      }

      if (errors.length > 0) return failure(errors);
      return success(Object.fromEntries(entries) as ObjectOutput<S>);
    });
  },

  union<S extends [Schema<unknown>, Schema<unknown>, ...Schema<unknown>[]]>(
    ...members: S
  ): Schema<Infer<S[number]>> {
    return defineSchema((value, path) => {
      // Report the closest member's issues: the one with the fewest failures is usually the intended shape.
      let closest: ValidationIssue[] | undefined;
      for (const member of members) {
        const result = member.parse(value, path);
        if (result.ok) return result as ValidationResult<Infer<S[number]>>;
        if (closest === undefined || result.errors.length < closest.length) {
          closest = result.errors;
        }
      }
      return failure(closest ?? [{ path, message: 'matches no union member' }]);
    });
  },

  refine<T>(base: Schema<T>, predicate: (value: T) => boolean, message: string): Schema<T> {
    return defineSchema((value, path) => {
      const result = base.parse(value, path);
      if (!result.ok) return result;
      return predicate(result.value) ? result : issue(path, message);
    });
  },
};
