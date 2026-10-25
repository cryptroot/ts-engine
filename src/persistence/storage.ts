export interface SaveStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

export class MemorySaveStorage implements SaveStorage {
  private readonly items: Map<string, string>;

  constructor(initial: Record<string, string> = {}) {
    this.items = new Map(Object.entries(initial));
  }

  async getItem(key: string): Promise<string | null> {
    return this.items.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.items.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.items.delete(key);
  }

  async keys(prefix: string): Promise<string[]> {
    return [...this.items.keys()].filter((key) => key.startsWith(prefix));
  }
}

/** Structural subset of the DOM `Storage` interface, so `localStorage` or any compatible object can be passed in. */
export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export class WebStorageAdapter implements SaveStorage {
  private readonly storage: WebStorageLike;

  constructor(storage: WebStorageLike) {
    this.storage = storage;
  }

  async getItem(key: string): Promise<string | null> {
    return this.storage.getItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    this.storage.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.storage.removeItem(key);
  }

  async keys(prefix: string): Promise<string[]> {
    const found: string[] = [];
    for (let index = 0; index < this.storage.length; index++) {
      const key = this.storage.key(index);
      if (key !== null && key.startsWith(prefix)) {
        found.push(key);
      }
    }
    return found;
  }
}
