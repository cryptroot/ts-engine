import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from '../../src/core/index.ts';

type Events = {
  damage: number;
  message: string;
};

describe('EventEmitter', () => {
  it('calls listeners in subscription order with the payload', () => {
    const emitter = new EventEmitter<Events>();
    const calls: string[] = [];
    emitter.on('damage', (amount) => calls.push(`a:${amount}`));
    emitter.on('damage', (amount) => calls.push(`b:${amount}`));
    emitter.emit('damage', 3);
    expect(calls).toEqual(['a:3', 'b:3']);
  });

  it('stops calling a listener after its unsubscribe function runs', () => {
    const emitter = new EventEmitter<Events>();
    const listener = vi.fn();
    const unsubscribe = emitter.on('damage', listener);
    unsubscribe();
    unsubscribe();
    emitter.emit('damage', 1);
    expect(listener).not.toHaveBeenCalled();
    expect(emitter.listenerCount('damage')).toBe(0);
  });

  it('keeps iterating when a listener unsubscribes during emit', () => {
    const emitter = new EventEmitter<Events>();
    const calls: string[] = [];
    const unsubscribeFirst = emitter.on('damage', () => {
      calls.push('first');
      unsubscribeFirst();
    });
    emitter.on('damage', () => calls.push('second'));

    emitter.emit('damage', 1);
    emitter.emit('damage', 1);
    expect(calls).toEqual(['first', 'second', 'second']);
  });

  it('does not call a listener removed by an earlier listener in the same emit', () => {
    const emitter = new EventEmitter<Events>();
    const calls: string[] = [];
    const second = (): void => {
      calls.push('second');
    };
    emitter.on('damage', () => {
      emitter.off('damage', second);
    });
    emitter.on('damage', second);

    emitter.emit('damage', 1);
    expect(calls).toEqual([]);
  });

  it('calls once-listeners exactly once', () => {
    const emitter = new EventEmitter<Events>();
    const listener = vi.fn();
    emitter.once('message', listener);
    expect(emitter.listenerCount('message')).toBe(1);

    emitter.emit('message', 'hi');
    emitter.emit('message', 'again');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('hi');
    expect(emitter.listenerCount('message')).toBe(0);
  });

  it('removes once-listeners through off and their unsubscribe function', () => {
    const emitter = new EventEmitter<Events>();
    const listener = vi.fn();
    const unsubscribe = emitter.once('message', listener);
    unsubscribe();
    emitter.emit('message', 'hi');
    expect(listener).not.toHaveBeenCalled();

    const other = vi.fn();
    emitter.once('message', other);
    emitter.off('message', other);
    emitter.emit('message', 'hi');
    expect(other).not.toHaveBeenCalled();
  });

  it('removes only one subscription per off call', () => {
    const emitter = new EventEmitter<Events>();
    const listener = vi.fn();
    emitter.on('damage', listener);
    emitter.on('damage', listener);
    emitter.off('damage', listener);
    expect(emitter.listenerCount('damage')).toBe(1);
  });

  it('propagates listener errors', () => {
    const emitter = new EventEmitter<Events>();
    emitter.on('damage', () => {
      throw new Error('boom');
    });
    expect(() => emitter.emit('damage', 1)).toThrow('boom');
  });

  it('clear removes all listeners and disables existing unsubscribe functions', () => {
    const emitter = new EventEmitter<Events>();
    const listener = vi.fn();
    const unsubscribe = emitter.on('damage', listener);
    emitter.on('message', listener);
    emitter.clear();
    expect(emitter.listenerCount('damage')).toBe(0);
    expect(emitter.listenerCount('message')).toBe(0);

    unsubscribe();
    emitter.emit('damage', 1);
    expect(listener).not.toHaveBeenCalled();
  });
});
