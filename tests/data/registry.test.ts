import { describe, expect, it } from 'vitest';
import { EngineError } from '../../src/core/index.ts';
import { ContentRegistry } from '../../src/data/index.ts';

interface Item {
  readonly id: string;
  readonly name: string;
}

const sword: Item = { id: 'sword', name: 'Sword' };
const shield: Item = { id: 'shield', name: 'Shield' };

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('expected action to throw');
}

describe('ContentRegistry', () => {
  it('registers and retrieves items by reference', () => {
    const registry = new ContentRegistry<Item>();
    registry.register(sword);
    expect(registry.get('sword')).toBe(sword);
    expect(registry.tryGet('sword')).toBe(sword);
    expect(registry.has('sword')).toBe(true);
    expect(registry.size).toBe(1);
  });

  it('keeps insertion order for ids and items', () => {
    const registry = new ContentRegistry<Item>();
    registry.registerAll([shield, sword]);
    registry.register({ id: 'bow', name: 'Bow' });
    expect(registry.ids()).toEqual(['shield', 'sword', 'bow']);
    expect(registry.all().map((item) => item.id)).toEqual(['shield', 'sword', 'bow']);
  });

  it('throws DUPLICATE_CONTENT_ID on duplicate registration', () => {
    const registry = new ContentRegistry<Item>();
    registry.register(sword);
    const error = captureError(() => registry.register({ id: 'sword', name: 'Other' }));
    expect(error).toBeInstanceOf(EngineError);
    expect(error).toMatchObject({ code: 'DUPLICATE_CONTENT_ID' });
    expect(registry.get('sword')).toBe(sword);
    expect(registry.size).toBe(1);
  });

  it('registerAll is atomic: a duplicate inside the batch registers nothing', () => {
    const registry = new ContentRegistry<Item>();
    registry.register(sword);
    const batch = [shield, { id: 'shield', name: 'Dupe' }];
    expect(() => registry.registerAll(batch)).toThrow(EngineError);
    expect(registry.ids()).toEqual(['sword']);
  });

  it('registerAll rejects ids already present in the registry', () => {
    const registry = new ContentRegistry<Item>();
    registry.register(sword);
    const error = captureError(() => registry.registerAll([shield, sword]));
    expect(error).toMatchObject({ code: 'DUPLICATE_CONTENT_ID' });
    expect(registry.ids()).toEqual(['sword']);
  });

  it('throws UNKNOWN_CONTENT_ID from get and returns undefined from tryGet', () => {
    const registry = new ContentRegistry<Item>();
    expect(captureError(() => registry.get('missing'))).toMatchObject({
      code: 'UNKNOWN_CONTENT_ID',
    });
    expect(registry.tryGet('missing')).toBeUndefined();
    expect(registry.has('missing')).toBe(false);
  });

  it('returns a fresh array from all() and ids() so callers cannot mutate internal state', () => {
    const registry = new ContentRegistry<Item>();
    registry.register(sword);
    registry.all().push(shield);
    registry.ids().push('shield');
    expect(registry.size).toBe(1);
    expect(registry.ids()).toEqual(['sword']);
  });

  it('does not mutate the registered items', () => {
    const frozen = Object.freeze({ id: 'gem', name: 'Gem' });
    const registry = new ContentRegistry<Item>();
    registry.register(frozen);
    expect(registry.get('gem')).toEqual({ id: 'gem', name: 'Gem' });
    expect(Object.isFrozen(registry.get('gem'))).toBe(true);
  });
});
