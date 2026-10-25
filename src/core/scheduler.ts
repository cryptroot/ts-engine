import { EngineError } from './errors';

export type TimerHandle = number;

// Bounds zero-delay chains, which would otherwise keep a single tick from ever returning.
const MAX_FIRINGS_PER_TICK = 10_000;

interface Timer {
  readonly handle: TimerHandle;
  readonly dueAt: number;
  readonly callback: () => void;
}

export class Scheduler {
  private currentTime = 0;
  private nextHandle = 1;
  private timers: Timer[] = [];

  get now(): number {
    return this.currentTime;
  }

  get pendingCount(): number {
    return this.timers.length;
  }

  schedule(delayMs: number, callback: () => void): TimerHandle {
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new EngineError('INVALID_DELAY', `Delay must be a finite number >= 0, got ${delayMs}`);
    }
    const handle = this.nextHandle++;
    this.timers.push({ handle, dueAt: this.currentTime + delayMs, callback });
    return handle;
  }

  cancel(handle: TimerHandle): boolean {
    const index = this.timers.findIndex((timer) => timer.handle === handle);
    if (index === -1) return false;
    this.timers.splice(index, 1);
    return true;
  }

  tick(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new EngineError('INVALID_DELTA', `Delta must be a finite number >= 0, got ${deltaMs}`);
    }
    const target = this.currentTime + deltaMs;
    let firings = 0;
    // Callbacks see the time they were due, so timers they schedule are relative to that moment.
    for (let timer = this.takeNextDue(target); timer; timer = this.takeNextDue(target)) {
      if (++firings > MAX_FIRINGS_PER_TICK) {
        throw new EngineError(
          'TIMER_LOOP',
          `More than ${MAX_FIRINGS_PER_TICK} timers fired in one tick; a timer may be rescheduling itself`,
        );
      }
      this.currentTime = Math.max(this.currentTime, timer.dueAt);
      timer.callback();
    }
    this.currentTime = target;
  }

  clear(): void {
    this.timers = [];
  }

  private takeNextDue(until: number): Timer | undefined {
    let best: { timer: Timer; index: number } | undefined;
    for (const [index, timer] of this.timers.entries()) {
      if (timer.dueAt <= until && (best === undefined || timer.dueAt < best.timer.dueAt)) {
        best = { timer, index };
      }
    }
    if (best === undefined) return undefined;
    this.timers.splice(best.index, 1);
    return best.timer;
  }
}
