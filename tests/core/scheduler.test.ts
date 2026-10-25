import { describe, expect, it, vi } from 'vitest';
import { Scheduler } from '../../src/core/index.ts';
import { engineErrorCode } from './helpers.ts';

describe('Scheduler', () => {
  it('stops a zero-delay timer that reschedules itself forever with an error', () => {
    const scheduler = new Scheduler();
    let runs = 0;
    const again = (): void => {
      runs += 1;
      scheduler.schedule(0, again);
    };
    scheduler.schedule(0, again);

    expect(engineErrorCode(() => scheduler.tick(1))).toBe('TIMER_LOOP');
    expect(runs).toBeGreaterThan(1);
  });

  it('fires callbacks when their due time is reached', () => {
    const scheduler = new Scheduler();
    const callback = vi.fn();
    scheduler.schedule(100, callback);

    scheduler.tick(99);
    expect(callback).not.toHaveBeenCalled();
    expect(scheduler.now).toBe(99);

    scheduler.tick(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(scheduler.now).toBe(100);
    expect(scheduler.pendingCount).toBe(0);
  });

  it('fires in due-time order, then insertion order', () => {
    const scheduler = new Scheduler();
    const calls: string[] = [];
    scheduler.schedule(50, () => calls.push('late'));
    scheduler.schedule(10, () => calls.push('early-a'));
    scheduler.schedule(10, () => calls.push('early-b'));
    scheduler.schedule(30, () => calls.push('middle'));

    scheduler.tick(100);
    expect(calls).toEqual(['early-a', 'early-b', 'middle', 'late']);
  });

  it('fires timers scheduled from a callback relative to the due time', () => {
    const scheduler = new Scheduler();
    const calls: number[] = [];
    scheduler.schedule(10, () => {
      calls.push(scheduler.now);
      scheduler.schedule(5, () => calls.push(scheduler.now));
    });

    scheduler.tick(12);
    expect(calls).toEqual([10]);
    scheduler.tick(3);
    expect(calls).toEqual([10, 15]);
  });

  it('fires zero-delay timers in the same tick', () => {
    const scheduler = new Scheduler();
    const calls: string[] = [];
    scheduler.schedule(0, () => {
      calls.push('outer');
      scheduler.schedule(0, () => calls.push('inner'));
    });
    scheduler.tick(0);
    expect(calls).toEqual(['outer', 'inner']);
  });

  it('cancels pending timers', () => {
    const scheduler = new Scheduler();
    const callback = vi.fn();
    const handle = scheduler.schedule(10, callback);
    expect(scheduler.cancel(handle)).toBe(true);
    expect(scheduler.cancel(handle)).toBe(false);
    expect(scheduler.pendingCount).toBe(0);

    scheduler.tick(20);
    expect(callback).not.toHaveBeenCalled();
  });

  it('returns false when cancelling a timer that already fired', () => {
    const scheduler = new Scheduler();
    const handle = scheduler.schedule(5, () => undefined);
    scheduler.tick(5);
    expect(scheduler.cancel(handle)).toBe(false);
  });

  it('cancels a timer from another callback in the same tick', () => {
    const scheduler = new Scheduler();
    const callback = vi.fn();
    let victim = 0;
    scheduler.schedule(10, () => scheduler.cancel(victim));
    victim = scheduler.schedule(20, callback);
    scheduler.tick(30);
    expect(callback).not.toHaveBeenCalled();
  });

  it('rejects invalid delays', () => {
    const scheduler = new Scheduler();
    const noop = (): void => undefined;
    expect(engineErrorCode(() => scheduler.schedule(-1, noop))).toBe('INVALID_DELAY');
    expect(engineErrorCode(() => scheduler.schedule(Number.NaN, noop))).toBe('INVALID_DELAY');
    expect(engineErrorCode(() => scheduler.schedule(Number.POSITIVE_INFINITY, noop))).toBe(
      'INVALID_DELAY',
    );
    expect(scheduler.pendingCount).toBe(0);
  });

  it('rejects negative or non-finite ticks', () => {
    const scheduler = new Scheduler();
    expect(engineErrorCode(() => scheduler.tick(-1))).toBe('INVALID_DELTA');
    expect(engineErrorCode(() => scheduler.tick(Number.NaN))).toBe('INVALID_DELTA');
  });

  it('clears pending timers without resetting time', () => {
    const scheduler = new Scheduler();
    const callback = vi.fn();
    scheduler.schedule(10, callback);
    scheduler.tick(5);
    scheduler.clear();
    expect(scheduler.pendingCount).toBe(0);
    scheduler.tick(10);
    expect(callback).not.toHaveBeenCalled();
    expect(scheduler.now).toBe(15);
  });
});
