import { EngineError } from '../core/errors';
import type { Schema, ValidationIssue, ValidationResult } from './schema';

export type MigrationStep = {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(doc: Record<string, unknown>): Record<string, unknown>;
};

export interface ContentLoadOptions<T> {
  readonly schema: Schema<T>;
  readonly currentVersion: number;
  readonly migrations?: readonly MigrationStep[];
}

const ROOT_PATH = '$';
const VERSION_PATH = '$.schemaVersion';
const VERSION_KEY = 'schemaVersion';

export function loadContent<T>(json: unknown, options: ContentLoadOptions<T>): ValidationResult<T> {
  if (!isRecord(json)) return issue(ROOT_PATH, 'expected object document');

  const version = json[VERSION_KEY];
  if (version === undefined) return issue(VERSION_PATH, 'is required');
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return issue(VERSION_PATH, 'must be an integer');
  }
  if (version > options.currentVersion) {
    return issue(
      VERSION_PATH,
      `version ${version} is newer than supported version ${options.currentVersion}`,
    );
  }

  // Migrations receive a private copy, so the caller's input is never mutated.
  let doc = cloneRecord(json);
  let current = version;
  while (current < options.currentVersion) {
    const from = current;
    const target = options.currentVersion;
    const step = (options.migrations ?? []).find(
      (candidate) =>
        candidate.fromVersion === from &&
        candidate.toVersion > from &&
        candidate.toVersion <= target,
    );
    if (step === undefined) {
      return issue(
        VERSION_PATH,
        `missing migration from version ${from} to version ${options.currentVersion}`,
      );
    }
    doc = { ...step.migrate(doc), [VERSION_KEY]: step.toVersion };
    current = step.toVersion;
  }

  // schemaVersion is consumed by the loader, so content schemas never need to declare it.
  const content = Object.fromEntries(Object.entries(doc).filter(([key]) => key !== VERSION_KEY));
  return options.schema.parse(content);
}

export function parseContent<T>(text: string, options: ContentLoadOptions<T>): ValidationResult<T> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return issue(ROOT_PATH, `invalid JSON: ${reason}`);
  }
  return loadContent(json, options);
}

export function assertValidContent<T>(result: ValidationResult<T>): T {
  if (result.ok) return result.value;
  const details = result.errors.map((error) => `${error.path}: ${error.message}`).join('; ');
  throw new EngineError('INVALID_CONTENT', `Invalid content: ${details}`);
}

export function loadContentOrThrow<T>(json: unknown, options: ContentLoadOptions<T>): T {
  return assertValidContent(loadContent(json, options));
}

function issue(path: string, message: string): { ok: false; errors: ValidationIssue[] } {
  return { ok: false, errors: [{ path, message }] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item));
  if (isRecord(value)) return cloneRecord(value);
  return value;
}

function cloneRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]): [string, unknown] => [key, cloneValue(entry)]),
  );
}
