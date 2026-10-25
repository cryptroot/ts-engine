import { describe, expect, it } from 'vitest';
import { Random } from '../../src/core/index.ts';
import { engineErrorCode } from './helpers.ts';

function sequence(random: Random, count: number): number[] {
  return Array.from({ length: count }, () => random.next());
}

describe('Random', () => {
  it('matches the reference mulberry32 output', () => {
    const random = new Random(1);
    expect(random.next()).toBeCloseTo(0.6270739405881613, 15);
    expect(random.next()).toBeCloseTo(0.002735721180215478, 15);
  });

  it('produces identical sequences for the same seed', () => {
    expect(sequence(new Random(42), 20)).toEqual(sequence(new Random(42), 20));
  });

  it('returns floats in [0, 1)', () => {
    const random = new Random(7);
    for (const value of sequence(random, 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('continues identically when recreated from state', () => {
    const original = new Random(123);
    sequence(original, 5);
    const restored = new Random(original.state);
    expect(sequence(restored, 10)).toEqual(sequence(original, 10));
  });

  it('rejects non-integer seeds', () => {
    expect(engineErrorCode(() => new Random(1.5))).toBe('INVALID_SEED');
    expect(engineErrorCode(() => new Random(Number.NaN))).toBe('INVALID_SEED');
  });

  it('returns integers within [min, max)', () => {
    const random = new Random(99);
    for (let i = 0; i < 500; i++) {
      const value = random.int(-3, 4);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThan(4);
    }
  });

  it('rejects empty or non-integer ranges', () => {
    const random = new Random(1);
    expect(engineErrorCode(() => random.int(5, 5))).toBe('INVALID_RANGE');
    expect(engineErrorCode(() => random.int(5, 1))).toBe('INVALID_RANGE');
    expect(engineErrorCode(() => random.int(0.5, 3))).toBe('INVALID_RANGE');
  });

  it('picks items from the collection', () => {
    const random = new Random(5);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 50; i++) {
      expect(items).toContain(random.pick(items));
    }
  });

  it('throws EMPTY_COLLECTION when picking from an empty collection', () => {
    expect(engineErrorCode(() => new Random(1).pick([]))).toBe('EMPTY_COLLECTION');
  });

  it('shuffles into a new array with the same elements', () => {
    const random = new Random(2024);
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = random.shuffle(items);
    expect(shuffled).not.toBe(items);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('shuffles deterministically for the same state', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const first = new Random(77).shuffle(items);
    const second = new Random(77).shuffle(items);
    expect(first).toEqual(second);
  });
});
