import { EngineError } from '../core/errors';

export class ContentRegistry<T extends { id: string }> {
  private readonly items = new Map<string, T>();

  get size(): number {
    return this.items.size;
  }

  register(item: T): void {
    this.assertUnique(item.id);
    this.items.set(item.id, item);
  }

  // Validates the whole batch before inserting, so a duplicate leaves the registry unchanged.
  registerAll(items: readonly T[]): void {
    const batchIds = new Set<string>();
    for (const item of items) {
      this.assertUnique(item.id);
      if (batchIds.has(item.id)) throw duplicateError(item.id);
      batchIds.add(item.id);
    }
    for (const item of items) this.items.set(item.id, item);
  }

  get(id: string): T {
    const item = this.items.get(id);
    if (item === undefined) {
      throw new EngineError('UNKNOWN_CONTENT_ID', `Unknown content id "${id}"`);
    }
    return item;
  }

  tryGet(id: string): T | undefined {
    return this.items.get(id);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  ids(): string[] {
    return [...this.items.keys()];
  }

  all(): T[] {
    return [...this.items.values()];
  }

  private assertUnique(id: string): void {
    if (this.items.has(id)) throw duplicateError(id);
  }
}

function duplicateError(id: string): EngineError {
  return new EngineError('DUPLICATE_CONTENT_ID', `Duplicate content id "${id}"`);
}
