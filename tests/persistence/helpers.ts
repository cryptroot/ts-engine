import type { Saveable, WebStorageLike } from '../../src/persistence/index.ts';

export class TestSaveable implements Saveable<unknown> {
  readonly saveKey: string;
  readonly schemaVersion: number;
  value: unknown;
  restoreCalls = 0;

  constructor(saveKey: string, schemaVersion: number, value: unknown) {
    this.saveKey = saveKey;
    this.schemaVersion = schemaVersion;
    this.value = value;
  }

  snapshot(): unknown {
    return this.value;
  }

  restore(snapshot: unknown): void {
    this.restoreCalls += 1;
    this.value = snapshot;
  }
}

export class FakeWebStorage implements WebStorageLike {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

export function withField(
  snapshot: unknown,
  field: string,
  value: unknown,
): Record<string, unknown> {
  if (typeof snapshot !== 'object' || snapshot === null) {
    throw new Error('expected an object snapshot');
  }
  return { ...snapshot, [field]: value };
}

export function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected the function to throw');
}

export function envelope(entries: Record<string, unknown>): string {
  return JSON.stringify({ format: 'tsge-save', formatVersion: 1, savedAt: 1, entries });
}
