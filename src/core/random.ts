import { EngineError } from './errors';

const TWO_POW_32 = 4294967296;

export class Random {
  private current: number;

  constructor(seed: number) {
    if (!Number.isInteger(seed)) {
      throw new EngineError('INVALID_SEED', `Seed must be an integer, got ${seed}`);
    }
    this.current = seed >>> 0;
  }

  get state(): number {
    return this.current;
  }

  next(): number {
    this.current = (this.current + 0x6d2b79f5) >>> 0;
    let t = this.current;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / TWO_POW_32;
  }

  int(minInclusive: number, maxExclusive: number): number {
    if (
      !Number.isInteger(minInclusive) ||
      !Number.isInteger(maxExclusive) ||
      maxExclusive <= minInclusive
    ) {
      throw new EngineError(
        'INVALID_RANGE',
        `Expected integer range with max > min, got [${minInclusive}, ${maxExclusive})`,
      );
    }
    return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new EngineError('EMPTY_COLLECTION', 'Cannot pick from an empty collection');
    }
    return items[this.int(0, items.length)] as T;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      const current = result[i] as T;
      result[i] = result[j] as T;
      result[j] = current;
    }
    return result;
  }
}
