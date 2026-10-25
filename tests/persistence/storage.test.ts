import { describe, expect, it } from 'vitest';
import { MemorySaveStorage, SaveManager, WebStorageAdapter } from '../../src/persistence/index.ts';
import { FakeWebStorage, TestSaveable } from './helpers.ts';

describe('MemorySaveStorage', () => {
  it('reads, writes and removes items', async () => {
    const storage = new MemorySaveStorage({ 'tsge/a': '1' });
    expect(await storage.getItem('tsge/a')).toBe('1');
    expect(await storage.getItem('tsge/missing')).toBeNull();

    await storage.setItem('tsge/b', '2');
    expect(await storage.getItem('tsge/b')).toBe('2');

    await storage.removeItem('tsge/a');
    expect(await storage.getItem('tsge/a')).toBeNull();
  });

  it('lists keys matching a prefix', async () => {
    const storage = new MemorySaveStorage({ 'tsge/a': '1', 'tsge/b': '2', 'other/c': '3' });
    expect((await storage.keys('tsge/')).sort()).toEqual(['tsge/a', 'tsge/b']);
    expect(await storage.keys('nothing/')).toEqual([]);
  });
});

describe('WebStorageAdapter', () => {
  it('delegates reads, writes and removals to the wrapped storage', async () => {
    const backing = new FakeWebStorage();
    const storage = new WebStorageAdapter(backing);

    await storage.setItem('tsge/a', 'value');
    expect(backing.getItem('tsge/a')).toBe('value');
    expect(await storage.getItem('tsge/a')).toBe('value');

    await storage.removeItem('tsge/a');
    expect(backing.getItem('tsge/a')).toBeNull();
    expect(await storage.getItem('tsge/a')).toBeNull();
  });

  it('enumerates keys by prefix using the indexed key API', async () => {
    const backing = new FakeWebStorage();
    backing.setItem('tsge/one', '1');
    backing.setItem('other/x', 'x');
    backing.setItem('tsge/two', '2');
    const storage = new WebStorageAdapter(backing);

    expect((await storage.keys('tsge/')).sort()).toEqual(['tsge/one', 'tsge/two']);
  });

  it('works as the backing store of a SaveManager', async () => {
    const backing = new FakeWebStorage();
    const writer = new SaveManager({ storage: new WebStorageAdapter(backing), now: () => 5 });
    const player = new TestSaveable('player', 1, { hp: 3 });
    writer.register(player);
    await writer.save('slot1');
    expect(await writer.listSlots()).toEqual(['slot1']);

    const reader = new SaveManager({ storage: new WebStorageAdapter(backing) });
    const restored = new TestSaveable('player', 1, { hp: 0 });
    reader.register(restored);
    await reader.load('slot1');
    expect(restored.value).toEqual({ hp: 3 });
  });
});
