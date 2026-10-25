import { describe, expect, it } from 'vitest';
import { EngineError, Grid, point } from '../../src/core/index.ts';
import { engineErrorCode } from './helpers.ts';

describe('Grid', () => {
  it('starts empty with the given dimensions', () => {
    const grid = new Grid<string>(3, 2);
    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);
    expect(grid.count()).toBe(0);
    expect(grid.toArray()).toHaveLength(6);
  });

  it('rejects non-positive or non-integer dimensions', () => {
    const sizes = [
      [0, 1],
      [1, 0],
      [-1, 2],
      [1.5, 2],
      [Number.NaN, 2],
    ];
    for (const [width = 0, height = 0] of sizes) {
      expect(engineErrorCode(() => new Grid(width, height))).toBe('INVALID_GRID_SIZE');
    }
  });

  it('checks bounds', () => {
    const grid = new Grid<number>(2, 2);
    expect(grid.isInside(point(0, 0))).toBe(true);
    expect(grid.isInside(point(1, 1))).toBe(true);
    expect(grid.isInside(point(2, 0))).toBe(false);
    expect(grid.isInside(point(0, -1))).toBe(false);
    expect(grid.isInside(point(0.5, 0))).toBe(false);
  });

  it('returns null for empty cells and stored values otherwise', () => {
    const grid = new Grid<string>(2, 2);
    expect(grid.get(point(1, 0))).toBeNull();
    expect(grid.isEmpty(point(1, 0))).toBe(true);

    grid.set(point(1, 0), 'a');
    expect(grid.get(point(1, 0))).toBe('a');
    expect(grid.isEmpty(point(1, 0))).toBe(false);

    grid.set(point(1, 0), null);
    expect(grid.get(point(1, 0))).toBeNull();
    expect(grid.count()).toBe(0);
  });

  it('throws OUT_OF_BOUNDS for get, set and isEmpty outside the grid', () => {
    const grid = new Grid<number>(2, 2);
    expect(engineErrorCode(() => grid.get(point(2, 0)))).toBe('OUT_OF_BOUNDS');
    expect(engineErrorCode(() => grid.set(point(0, 2), 1))).toBe('OUT_OF_BOUNDS');
    expect(engineErrorCode(() => grid.isEmpty(point(-1, 0)))).toBe('OUT_OF_BOUNDS');
  });

  it('returns non-null entries in row-major order with fresh points', () => {
    const grid = new Grid<string>(3, 2);
    grid.set(point(2, 1), 'd');
    grid.set(point(0, 0), 'a');
    grid.set(point(1, 1), 'c');
    grid.set(point(1, 0), 'b');

    const entries = grid.entries();
    expect(entries.map(([, value]) => value)).toEqual(['a', 'b', 'c', 'd']);
    expect(entries.map(([p]) => [p.x, p.y])).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ]);

    const callerPoint = point(0, 0);
    grid.set(callerPoint, 'z');
    const returned = grid.entries().find(([, value]) => value === 'z')?.[0];
    expect(returned).toEqual(callerPoint);
    expect(returned).not.toBe(callerPoint);
  });

  it('clears all cells', () => {
    const grid = new Grid<number>(2, 2);
    grid.set(point(0, 0), 1);
    grid.set(point(1, 1), 2);
    grid.clear();
    expect(grid.count()).toBe(0);
    expect(grid.toArray()).toEqual([null, null, null, null]);
  });

  it('round-trips through toArray and fromArray in row-major order', () => {
    const grid = Grid.fromArray<number>(2, 2, [1, null, null, 4]);
    expect(grid.get(point(0, 0))).toBe(1);
    expect(grid.get(point(1, 1))).toBe(4);
    expect(grid.toArray()).toEqual([1, null, null, 4]);

    const copy = Grid.fromArray(grid.width, grid.height, grid.toArray());
    expect(copy.entries()).toEqual(grid.entries());
  });

  it('validates sizes and lengths in fromArray', () => {
    expect(engineErrorCode(() => Grid.fromArray<number>(2, 2, [1, 2, 3]))).toBe(
      'INVALID_CELLS_LENGTH',
    );
    expect(engineErrorCode(() => Grid.fromArray<number>(0, 2, []))).toBe('INVALID_GRID_SIZE');
  });

  it('does not alias the caller array', () => {
    const cells: Array<number | null> = [1, null];
    const grid = Grid.fromArray<number>(2, 1, cells);
    cells[1] = 9;
    expect(grid.get(point(1, 0))).toBeNull();
  });

  it('throws EngineError instances', () => {
    expect(() => new Grid(0, 0)).toThrow(EngineError);
  });
});
