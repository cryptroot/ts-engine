# Persistence

Saves named slots made of snapshots from registered `Saveable` objects. Storage is pluggable: an
in-memory store for tests and servers, or an adapter for browser `localStorage`/`sessionStorage`.

Import from `ts-engine/persistence`.

## Saveable

Any object with a stable `saveKey` can be saved.

```ts
interface Saveable<TSnapshot = unknown> {
  readonly saveKey: string; // unique per registered object
  readonly schemaVersion: number; // integer, starting at 1
  snapshot(): TSnapshot;
  restore(snapshot: TSnapshot): void;
}
```

## Storage

```ts
interface SaveStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

class MemorySaveStorage implements SaveStorage {
  constructor(initial?: Record<string, string>);
  // ...implements SaveStorage
}

interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

class WebStorageAdapter implements SaveStorage {
  constructor(storage: WebStorageLike); // for example window.localStorage
  // ...implements SaveStorage
}
```

## SaveManager

```ts
interface SaveManagerOptions {
  storage: SaveStorage;
  namespace?: string; // default "tsge"
  now?: () => number; // default Date.now, used for savedAt
  migrations?: Record<string, readonly SaveMigration[]>; // keyed by saveKey
}

interface SaveMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(snapshot: unknown): unknown;
}

interface SaveSummary {
  slot: string;
  savedAt: number;
  saveKeys: string[];
}

interface LoadReport {
  restored: string[]; // saveKeys restored from the slot
  missing: string[]; // registered saveKeys absent from the slot
  unknown: string[]; // saved keys with no registered saveable
}

class SaveManager {
  constructor(options: SaveManagerOptions);
  register(saveable: Saveable<unknown>): void;
  unregister(saveKey: string): void;
  save(slot: string): Promise<SaveSummary>;
  load(slot: string): Promise<LoadReport>;
  exists(slot: string): Promise<boolean>;
  deleteSave(slot: string): Promise<void>;
  listSlots(): Promise<string[]>;
}
```

- A slot is stored under `namespace/slot`. Slot names must be non-empty and must not contain `/`.
- `save` writes one JSON envelope with every registered saveable:
  `{ format: "tsge-save", formatVersion: 1, savedAt, entries: { [saveKey]: { schemaVersion, data } } }`.
- `load` validates the whole slot first, then restores. If a restore fails, the saveables already
  restored are rolled back, and the error is rethrown.
- Missing and unknown keys are reported in `LoadReport`; they do not throw.
- Older entries are upgraded with the `migrations` for their `saveKey`, one step at a time.

## Error codes

| Code                                              | Thrown by                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `DUPLICATE_SAVE_KEY`                              | `register`                                                                            |
| `INVALID_MIGRATION`                               | constructor: a step does not increase the version, or two steps share a `fromVersion` |
| `INVALID_SLOT`                                    | `save`, `load`, `exists`, `deleteSave`                                                |
| `SAVE_NOT_FOUND`                                  | `load`                                                                                |
| `CORRUPT_SAVE`                                    | `load`: the stored text is not a valid save envelope                                  |
| `SAVE_FROM_NEWER_VERSION`                         | `load`: an entry is newer than the registered `schemaVersion`                         |
| `MISSING_MIGRATION`                               | `load`: no migration path from the stored version to the current one                  |
| `INVALID_SNAPSHOT`, `INVALID_OPTIONS`, and others | `load`, from a saveable's own `restore` (see that module's guide)                     |

## Example

```ts
import { MemorySaveStorage, SaveManager } from 'ts-engine/persistence';

const counter = {
  saveKey: 'counter',
  schemaVersion: 1,
  value: 0,
  snapshot() {
    return { value: this.value };
  },
  restore(snapshot: { value: number }) {
    this.value = snapshot.value;
  },
};

const manager = new SaveManager({ storage: new MemorySaveStorage() });
manager.register(counter);

counter.value = 5;
await manager.save('slot-1');

counter.value = 0;
const report = await manager.load('slot-1'); // report.restored === ['counter']
console.log(counter.value); // 5
```
