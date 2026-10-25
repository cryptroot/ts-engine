import { EngineError } from '../core/errors';
import type { Saveable } from './saveable';
import type { SaveStorage } from './storage';

const FORMAT = 'tsge-save';
const FORMAT_VERSION = 1;

export interface SaveMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(snapshot: unknown): unknown;
}

export interface SaveManagerOptions {
  storage: SaveStorage;
  namespace?: string;
  now?: () => number;
  migrations?: Record<string, readonly SaveMigration[]>;
}

export interface SaveSummary {
  slot: string;
  savedAt: number;
  saveKeys: string[];
}

export interface LoadReport {
  restored: string[];
  missing: string[];
  unknown: string[];
}

interface SaveEntry {
  readonly schemaVersion: number;
  readonly data: unknown;
}

export class SaveManager {
  private readonly storage: SaveStorage;
  private readonly namespace: string;
  private readonly now: () => number;
  private readonly migrations: Map<string, readonly SaveMigration[]>;
  private readonly saveables = new Map<string, Saveable<unknown>>();

  constructor(options: SaveManagerOptions) {
    this.storage = options.storage;
    this.namespace = options.namespace ?? 'tsge';
    this.now = options.now ?? Date.now;
    this.migrations = new Map(Object.entries(options.migrations ?? {}));
    validateMigrations(this.migrations);
  }

  register(saveable: Saveable<unknown>): void {
    if (this.saveables.has(saveable.saveKey)) {
      throw new EngineError(
        'DUPLICATE_SAVE_KEY',
        `A saveable with saveKey "${saveable.saveKey}" is already registered`,
      );
    }
    this.saveables.set(saveable.saveKey, saveable);
  }

  unregister(saveKey: string): void {
    this.saveables.delete(saveKey);
  }

  async save(slot: string): Promise<SaveSummary> {
    assertValidSlot(slot);
    const savedAt = this.now();
    const entries: Record<string, SaveEntry> = {};
    for (const saveable of this.saveables.values()) {
      entries[saveable.saveKey] = {
        schemaVersion: saveable.schemaVersion,
        data: saveable.snapshot(),
      };
    }
    const envelope = { format: FORMAT, formatVersion: FORMAT_VERSION, savedAt, entries };
    await this.storage.setItem(this.storageKey(slot), JSON.stringify(envelope));
    return { slot, savedAt, saveKeys: Object.keys(entries) };
  }

  async load(slot: string): Promise<LoadReport> {
    assertValidSlot(slot);
    const raw = await this.storage.getItem(this.storageKey(slot));
    if (raw === null) {
      throw new EngineError('SAVE_NOT_FOUND', `No save found in slot "${slot}"`);
    }
    const entries = parseEnvelope(slot, raw);

    // Plan every restore before mutating anything, so a failure leaves all saveables untouched.
    const plan: Array<{ saveable: Saveable<unknown>; snapshot: unknown }> = [];
    const missing: string[] = [];
    for (const saveable of this.saveables.values()) {
      const entry = entries.get(saveable.saveKey);
      if (entry === undefined) {
        missing.push(saveable.saveKey);
        continue;
      }
      if (entry.schemaVersion > saveable.schemaVersion) {
        throw new EngineError(
          'SAVE_FROM_NEWER_VERSION',
          `Save entry "${saveable.saveKey}" has schema version ${entry.schemaVersion}, ` +
            `but this build only supports up to ${saveable.schemaVersion}`,
        );
      }
      plan.push({
        saveable,
        snapshot: this.migrateData(saveable.saveKey, entry, saveable.schemaVersion),
      });
    }

    const unknown = [...entries.keys()].filter((key) => !this.saveables.has(key));
    // A restore can still fail after validation, so roll back what was already applied.
    const applied: Array<{ saveable: Saveable<unknown>; previous: unknown }> = [];
    try {
      for (const { saveable, snapshot } of plan) {
        const previous = saveable.snapshot();
        saveable.restore(snapshot);
        applied.push({ saveable, previous });
      }
    } catch (error) {
      for (const { saveable, previous } of applied.reverse()) {
        saveable.restore(previous);
      }
      throw error;
    }
    return {
      restored: plan.map(({ saveable }) => saveable.saveKey),
      missing,
      unknown,
    };
  }

  async exists(slot: string): Promise<boolean> {
    assertValidSlot(slot);
    return (await this.storage.getItem(this.storageKey(slot))) !== null;
  }

  async deleteSave(slot: string): Promise<void> {
    assertValidSlot(slot);
    await this.storage.removeItem(this.storageKey(slot));
  }

  async listSlots(): Promise<string[]> {
    const prefix = `${this.namespace}/`;
    const keys = await this.storage.keys(prefix);
    return keys.map((key) => key.slice(prefix.length)).sort();
  }

  private storageKey(slot: string): string {
    return `${this.namespace}/${slot}`;
  }

  private migrateData(saveKey: string, entry: SaveEntry, target: number): unknown {
    const steps = this.migrations.get(saveKey) ?? [];
    let version = entry.schemaVersion;
    let data = entry.data;
    while (version < target) {
      const from = version;
      const step = steps.find(
        (candidate) => candidate.fromVersion === from && candidate.toVersion <= target,
      );
      if (step === undefined) {
        throw new EngineError(
          'MISSING_MIGRATION',
          `No migration for "${saveKey}" from schema version ${from} to ${target}`,
        );
      }
      data = step.migrate(data);
      version = step.toVersion;
    }
    return data;
  }
}

function assertValidSlot(slot: string): void {
  if (slot.length === 0 || slot.includes('/')) {
    throw new EngineError(
      'INVALID_SLOT',
      `Invalid save slot "${slot}": slot names must be non-empty and must not contain "/"`,
    );
  }
}

function validateMigrations(migrations: Map<string, readonly SaveMigration[]>): void {
  for (const [saveKey, steps] of migrations) {
    const seenFrom = new Set<number>();
    for (const step of steps) {
      if (step.toVersion <= step.fromVersion || seenFrom.has(step.fromVersion)) {
        throw new EngineError(
          'INVALID_MIGRATION',
          `Invalid migration for "${saveKey}" from ${step.fromVersion} to ${step.toVersion}: ` +
            'each step must increase the version, and only one step may start at each version',
        );
      }
      seenFrom.add(step.fromVersion);
    }
  }
}

function parseEnvelope(slot: string, raw: string): Map<string, SaveEntry> {
  const corrupt = (detail: string): EngineError =>
    new EngineError('CORRUPT_SAVE', `Save slot "${slot}" is corrupt: ${detail}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw corrupt('not valid JSON');
  }
  if (!isRecord(parsed)) {
    throw corrupt('envelope must be an object');
  }
  if (parsed.format !== FORMAT) {
    throw corrupt(`format must be "${FORMAT}"`);
  }
  if (parsed.formatVersion !== FORMAT_VERSION) {
    throw corrupt(`formatVersion must be ${FORMAT_VERSION}, got ${String(parsed.formatVersion)}`);
  }
  if (!isFiniteNumber(parsed.savedAt)) {
    throw corrupt('savedAt must be a finite number');
  }
  const rawEntries = parsed.entries;
  if (!isRecord(rawEntries)) {
    throw corrupt('entries must be an object');
  }

  const entries = new Map<string, SaveEntry>();
  for (const [saveKey, value] of Object.entries(rawEntries)) {
    const path = `entries.${saveKey}`;
    if (!isRecord(value)) {
      throw corrupt(`${path} must be an object`);
    }
    const schemaVersion = value.schemaVersion;
    if (
      typeof schemaVersion !== 'number' ||
      !Number.isInteger(schemaVersion) ||
      schemaVersion < 0
    ) {
      throw corrupt(`${path}.schemaVersion must be a non-negative integer`);
    }
    if (!('data' in value)) {
      throw corrupt(`${path}.data is missing`);
    }
    entries.set(saveKey, { schemaVersion, data: value.data });
  }
  return entries;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
