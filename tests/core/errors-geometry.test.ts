import { describe, expect, it } from 'vitest';
import {
  DIRECTIONS_4,
  DIRECTIONS_8,
  EngineError,
  addPoints,
  point,
  pointsEqual,
} from '../../src/core/index.ts';

describe('EngineError', () => {
  it('carries a code and message and is an Error', () => {
    const error = new EngineError('SOME_CODE', 'something failed');
    expect(error).toBeInstanceOf(EngineError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('SOME_CODE');
    expect(error.message).toBe('something failed');
    expect(error.name).toBe('EngineError');
  });

  it('keeps instanceof for subclasses', () => {
    class SaveError extends EngineError {}
    const error = new SaveError('SAVE_FAILED', 'nope');
    expect(error).toBeInstanceOf(SaveError);
    expect(error).toBeInstanceOf(EngineError);
    expect(error.code).toBe('SAVE_FAILED');
  });
});

describe('geometry', () => {
  it('compares and adds points without mutating inputs', () => {
    const a = point(1, 2);
    const b = point(3, -1);
    expect(pointsEqual(a, point(1, 2))).toBe(true);
    expect(pointsEqual(a, b)).toBe(false);
    expect(addPoints(a, b)).toEqual({ x: 4, y: 1 });
    expect(a).toEqual({ x: 1, y: 2 });
  });

  it('defines unit direction vectors in 4 and 8 directions', () => {
    expect(DIRECTIONS_4).toHaveLength(4);
    expect(DIRECTIONS_8).toHaveLength(8);
    for (const direction of DIRECTIONS_8) {
      expect(Math.abs(direction.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(direction.y)).toBeLessThanOrEqual(1);
      expect(direction.x !== 0 || direction.y !== 0).toBe(true);
    }
    expect(DIRECTIONS_8.slice(0, 4)).toEqual(DIRECTIONS_4);
  });
});
