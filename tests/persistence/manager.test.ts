import { describe, expect, it } from 'vitest';
import { EngineError } from '../../src/core/index.ts';
import {
  MemorySaveStorage,
  SaveManager,
  type SaveMigration,
  type SaveStorage,
} from '../../src/persistence/index.ts';
import { TestSaveable, captureError, envelope, withField } from './helpers.ts';

function setup(
  options: { namespace?: string; migrations?: Record<string, readonly SaveMigration[]> } = {},
): { storage: SaveStorage; manager: SaveManager } {
  const storage = new MemorySaveStorage();
  const manager = new SaveManager({ storage, now: () => 1234, ...options });
  return { storage, manager };
}

describe('SaveManager round trip', () => {
  it('restores registered state saved to a slot', async () => {
    const { manager } = setup();
    const player = new TestSaveable('player', 1, { hp: 5 });
    const flags = new TestSaveable('flags', 1, { met: true });
    manager.register(player);
    manager.register(flags);

    const summary = await manager.save('slot1');
    expect(summary).toEqual({ slot: 'slot1', savedAt: 1234, saveKeys: ['player', 'flags'] });

    player.value = { hp: 0 };
    flags.value = { met: false };
    const report = await manager.load('slot1');

    expect(report).toEqual({ restored: ['player', 'flags'], missing: [], unknown: [] });
    expect(player.value).toEqual({ hp: 5 });
    expect(flags.value).toEqual({ met: true });
  });

  it('writes a versioned JSON envelope under the namespaced key', async () => {
    const { storage, manager } = setup({ namespace: 'game' });
    manager.register(new TestSaveable('player', 2, { hp: 5 }));
    await manager.save('auto');

    const raw = await storage.getItem('game/auto');
    expect(JSON.parse(raw ?? 'null')).toEqual({
      format: 'tsge-save',
      formatVersion: 1,
      savedAt: 1234,
      entries: { player: { schemaVersion: 2, data: { hp: 5 } } },
    });
  });

  it('rejects snapshots that cannot be serialized to JSON', async () => {
    const { manager } = setup();
    manager.register(new TestSaveable('bad', 1, { big: BigInt(1) }));
    await expect(manager.save('slot1')).rejects.toBeInstanceOf(TypeError);
  });
});

describe('SaveManager slot handling', () => {
  it.each(['', 'a/b', '/leading'])('rejects invalid slot name %j', async (slot) => {
    const { manager } = setup();
    await expect(manager.save(slot)).rejects.toMatchObject({ code: 'INVALID_SLOT' });
    await expect(manager.load(slot)).rejects.toMatchObject({ code: 'INVALID_SLOT' });
    await expect(manager.exists(slot)).rejects.toMatchObject({ code: 'INVALID_SLOT' });
    await expect(manager.deleteSave(slot)).rejects.toMatchObject({ code: 'INVALID_SLOT' });
  });

  it('reports SAVE_NOT_FOUND for a slot that was never written', async () => {
    const { manager } = setup();
    manager.register(new TestSaveable('player', 1, {}));
    await expect(manager.load('nope')).rejects.toMatchObject({ code: 'SAVE_NOT_FOUND' });
  });

  it('lists, checks and deletes slots without touching other namespaces', async () => {
    const { storage, manager } = setup();
    manager.register(new TestSaveable('player', 1, {}));
    await manager.save('beta');
    await manager.save('alpha');
    await storage.setItem('other/gamma', '{}');

    expect(await manager.listSlots()).toEqual(['alpha', 'beta']);
    expect(await manager.exists('alpha')).toBe(true);
    expect(await manager.exists('gamma')).toBe(false);

    await manager.deleteSave('alpha');
    expect(await manager.exists('alpha')).toBe(false);
    expect(await manager.listSlots()).toEqual(['beta']);
    expect(await storage.getItem('other/gamma')).toBe('{}');
  });
});

describe('SaveManager envelope validation', () => {
  it('rejects unparseable JSON as CORRUPT_SAVE', async () => {
    const { storage, manager } = setup();
    manager.register(new TestSaveable('player', 1, {}));
    await storage.setItem('tsge/slot1', '{"format":');
    await expect(manager.load('slot1')).rejects.toMatchObject({
      code: 'CORRUPT_SAVE',
      message: expect.stringContaining('not valid JSON') as unknown,
    });
  });

  it.each([
    ['wrong format', { format: 'other', formatVersion: 1, savedAt: 1, entries: {} }, 'format'],
    [
      'wrong formatVersion',
      { format: 'tsge-save', formatVersion: 2, savedAt: 1, entries: {} },
      'formatVersion',
    ],
    ['non-object envelope', [1, 2, 3], 'envelope'],
    ['missing savedAt', { format: 'tsge-save', formatVersion: 1, entries: {} }, 'savedAt'],
    [
      'non-object entries',
      { format: 'tsge-save', formatVersion: 1, savedAt: 1, entries: [] },
      'entries',
    ],
  ])('rejects a %s envelope', async (_label, body, detail) => {
    const { storage, manager } = setup();
    manager.register(new TestSaveable('player', 1, {}));
    await storage.setItem('tsge/slot1', JSON.stringify(body));
    await expect(manager.load('slot1')).rejects.toMatchObject({
      code: 'CORRUPT_SAVE',
      message: expect.stringContaining(detail) as unknown,
    });
  });

  it('points at the malformed entry field in the error message', async () => {
    const { storage, manager } = setup();
    manager.register(new TestSaveable('player', 1, {}));

    await storage.setItem('tsge/slot1', envelope({ player: { schemaVersion: 1.5, data: {} } }));
    await expect(manager.load('slot1')).rejects.toThrow('entries.player.schemaVersion');

    await storage.setItem('tsge/slot1', envelope({ player: { schemaVersion: 1 } }));
    await expect(manager.load('slot1')).rejects.toThrow('entries.player.data is missing');

    await storage.setItem('tsge/slot1', envelope({ player: 'nope' }));
    await expect(manager.load('slot1')).rejects.toThrow('entries.player must be an object');
  });
});

describe('SaveManager versioning and migrations', () => {
  it('rejects entries written by a newer schema version', async () => {
    const { storage, manager } = setup();
    const player = new TestSaveable('player', 1, { hp: 1 });
    manager.register(player);
    await storage.setItem('tsge/slot1', envelope({ player: { schemaVersion: 2, data: {} } }));

    await expect(manager.load('slot1')).rejects.toMatchObject({
      code: 'SAVE_FROM_NEWER_VERSION',
    });
    expect(player.restoreCalls).toBe(0);
  });

  it('chains migrations from the saved version up to the current one', async () => {
    const seen: string[] = [];
    const { storage, manager } = setup({
      migrations: {
        player: [
          {
            fromVersion: 1,
            toVersion: 2,
            migrate: (snapshot) => {
              seen.push('1->2');
              return withField(snapshot, 'mana', 0);
            },
          },
          {
            fromVersion: 2,
            toVersion: 3,
            migrate: (snapshot) => {
              seen.push('2->3');
              return withField(snapshot, 'level', 1);
            },
          },
        ],
      },
    });
    const player = new TestSaveable('player', 3, { hp: 5, mana: 0, level: 1 });
    manager.register(player);
    await storage.setItem(
      'tsge/slot1',
      envelope({ player: { schemaVersion: 1, data: { hp: 5 } } }),
    );

    const report = await manager.load('slot1');

    expect(report.restored).toEqual(['player']);
    expect(seen).toEqual(['1->2', '2->3']);
    expect(player.value).toEqual({ hp: 5, mana: 0, level: 1 });
  });

  it('reports MISSING_MIGRATION naming the save key and version', async () => {
    const { storage, manager } = setup({
      migrations: {
        player: [{ fromVersion: 1, toVersion: 2, migrate: (snapshot) => snapshot }],
      },
    });
    const player = new TestSaveable('player', 3, {});
    manager.register(player);
    await storage.setItem('tsge/slot1', envelope({ player: { schemaVersion: 1, data: {} } }));

    await expect(manager.load('slot1')).rejects.toThrow(
      'No migration for "player" from schema version 2 to 3',
    );
    await expect(manager.load('slot1')).rejects.toBeInstanceOf(EngineError);
    expect(player.restoreCalls).toBe(0);
  });

  it('rejects malformed migration tables at construction', () => {
    const storage = new MemorySaveStorage();
    const noop = (snapshot: unknown): unknown => snapshot;
    const nonIncreasing = captureError(
      () =>
        new SaveManager({
          storage,
          migrations: { player: [{ fromVersion: 2, toVersion: 2, migrate: noop }] },
        }),
    );
    expect(nonIncreasing).toBeInstanceOf(EngineError);
    expect(nonIncreasing).toMatchObject({ code: 'INVALID_MIGRATION' });

    const duplicateFrom = captureError(
      () =>
        new SaveManager({
          storage,
          migrations: {
            player: [
              { fromVersion: 1, toVersion: 2, migrate: noop },
              { fromVersion: 1, toVersion: 3, migrate: noop },
            ],
          },
        }),
    );
    expect(duplicateFrom).toMatchObject({ code: 'INVALID_MIGRATION' });
  });
});

class FailingRestoreSaveable extends TestSaveable {
  override restore(): void {
    this.restoreCalls += 1;
    throw new EngineError('RESTORE_FAILED', 'restore rejected the snapshot');
  }
}

describe('SaveManager atomic restore', () => {
  it('rolls back earlier restores when a later restore throws', async () => {
    const { storage, manager } = setup();
    const first = new TestSaveable('first', 1, { value: 'before' });
    const second = new FailingRestoreSaveable('second', 1, { value: 'before' });
    manager.register(first);
    manager.register(second);
    await storage.setItem(
      'tsge/slot1',
      envelope({
        first: { schemaVersion: 1, data: { value: 'saved' } },
        second: { schemaVersion: 1, data: { value: 'saved' } },
      }),
    );

    await expect(manager.load('slot1')).rejects.toMatchObject({ code: 'RESTORE_FAILED' });
    expect(first.value).toEqual({ value: 'before' });
    expect(first.restoreCalls).toBe(2);
  });

  it('leaves earlier saveables untouched when a later entry fails validation', async () => {
    const { storage, manager } = setup();
    const first = new TestSaveable('first', 1, { value: 'before' });
    const second = new TestSaveable('second', 1, { value: 'before' });
    manager.register(first);
    manager.register(second);
    await storage.setItem(
      'tsge/slot1',
      envelope({
        first: { schemaVersion: 1, data: { value: 'saved' } },
        second: { schemaVersion: 9, data: { value: 'saved' } },
      }),
    );

    await expect(manager.load('slot1')).rejects.toMatchObject({
      code: 'SAVE_FROM_NEWER_VERSION',
    });
    expect(first.restoreCalls).toBe(0);
    expect(first.value).toEqual({ value: 'before' });
  });

  it('leaves earlier saveables untouched when a later migration throws', async () => {
    const { storage, manager } = setup({
      migrations: {
        second: [
          {
            fromVersion: 1,
            toVersion: 2,
            migrate: () => {
              throw new Error('migration exploded');
            },
          },
        ],
      },
    });
    const first = new TestSaveable('first', 1, { value: 'before' });
    const second = new TestSaveable('second', 2, { value: 'before' });
    manager.register(first);
    manager.register(second);
    await storage.setItem(
      'tsge/slot1',
      envelope({
        first: { schemaVersion: 1, data: { value: 'saved' } },
        second: { schemaVersion: 1, data: { value: 'saved' } },
      }),
    );

    await expect(manager.load('slot1')).rejects.toThrow('migration exploded');
    expect(first.restoreCalls).toBe(0);
    expect(first.value).toEqual({ value: 'before' });
  });
});

describe('SaveManager registration and reporting', () => {
  it('reports missing and unknown entries without failing', async () => {
    const { storage, manager } = setup();
    const player = new TestSaveable('player', 1, { hp: 1 });
    const quest = new TestSaveable('quest', 1, { done: false });
    manager.register(player);
    manager.register(quest);
    await storage.setItem(
      'tsge/slot1',
      envelope({
        player: { schemaVersion: 1, data: { hp: 7 } },
        removedFeature: { schemaVersion: 1, data: {} },
      }),
    );

    const report = await manager.load('slot1');

    expect(report).toEqual({
      restored: ['player'],
      missing: ['quest'],
      unknown: ['removedFeature'],
    });
    expect(player.value).toEqual({ hp: 7 });
    expect(quest.restoreCalls).toBe(0);
  });

  it('rejects duplicate saveKeys', () => {
    const { manager } = setup();
    manager.register(new TestSaveable('player', 1, {}));
    const error = captureError(() => manager.register(new TestSaveable('player', 1, {})));
    expect(error).toMatchObject({ code: 'DUPLICATE_SAVE_KEY' });
  });

  it('stops saving and restoring a saveable after unregister', async () => {
    const { manager } = setup();
    const player = new TestSaveable('player', 1, { hp: 1 });
    manager.register(player);
    manager.unregister('player');

    expect((await manager.save('slot1')).saveKeys).toEqual([]);

    manager.register(new TestSaveable('player', 1, { hp: 2 }));
    expect((await manager.save('slot2')).saveKeys).toEqual(['player']);
  });
});
