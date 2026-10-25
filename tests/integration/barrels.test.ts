import { describe, expect, it } from 'vitest';
import * as root from '../../src/index.ts';
import * as core from '../../src/core/index.ts';
import * as data from '../../src/data/index.ts';
import * as persistence from '../../src/persistence/index.ts';

describe('barrel smoke tests', () => {
  it('core exposes the engine primitives', () => {
    expect(typeof core.EngineError).toBe('function');
    expect(typeof core.EventEmitter).toBe('function');
    expect(typeof core.point).toBe('function');
    expect(typeof core.Scheduler).toBe('function');
  });

  it('data exposes schema and loader helpers', () => {
    expect(typeof data.schema).toBe('object');
    expect(typeof data.loadContent).toBe('function');
    expect(typeof data.ContentRegistry).toBe('function');
  });

  it('persistence exposes SaveManager and storage adapters', () => {
    expect(typeof persistence.SaveManager).toBe('function');
    expect(typeof persistence.MemorySaveStorage).toBe('function');
  });

  it('root re-exports every module without losing names', () => {
    expect(root.SaveManager).toBe(persistence.SaveManager);
    expect(root.EngineError).toBe(core.EngineError);
    expect(root.schema).toBe(data.schema);
  });
});
