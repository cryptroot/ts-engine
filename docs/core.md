# Core

Framework-free primitives used by the other modules: errors, points, a grid, a seeded random
generator, a deterministic scheduler, and a typed event emitter.

Import from `ts-engine/core`.

## Errors

`EngineError extends Error` carries a stable `code` string. Every error the engine throws is an
`EngineError`, so match on `code` rather than on the message.

```ts
class EngineError extends Error {
  readonly code: string;
  constructor(code: string, message: string);
}
```

## Points

```ts
interface Point {
  readonly x: number;
  readonly y: number;
}

function point(x: number, y: number): Point;
function pointsEqual(a: Point, b: Point): boolean;
function addPoints(a: Point, b: Point): Point;

const DIRECTIONS_4: readonly Point[]; // orthogonal offsets
const DIRECTIONS_8: readonly Point[]; // orthogonal and diagonal offsets
```

## Grid

A fixed-size 2D grid of `T | null`. Coordinates are `Point` values with `x` as the column and `y`
as the row, starting at `(0, 0)`.

```ts
class Grid<T> {
  readonly width: number;
  readonly height: number;
  constructor(width: number, height: number);
  static fromArray<T>(width: number, height: number, cells: ReadonlyArray<T | null>): Grid<T>;
  isInside(p: Point): boolean;
  get(p: Point): T | null;
  set(p: Point, value: T | null): void;
  isEmpty(p: Point): boolean;
  count(): number;
  entries(): Array<[Point, T]>;
  clear(): void;
  toArray(): Array<T | null>;
}
```

Errors: `INVALID_GRID_SIZE` (non-positive or non-integer size), `INVALID_CELLS_LENGTH` (`fromArray`
length does not match `width * height`), `OUT_OF_BOUNDS` (`get`/`set` outside the grid).

## Random

A seeded generator (mulberry32). The same seed always produces the same sequence.

```ts
class Random {
  constructor(seed: number);
  get state(): number;
  next(): number; // float in [0, 1)
  int(minInclusive: number, maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[]; // returns a shuffled copy
}
```

Errors: `INVALID_SEED` (seed is not an integer), `INVALID_RANGE` (`int` bounds are not integers
with `max > min`), `EMPTY_COLLECTION` (`pick` on an empty array).

## Scheduler

A manual clock. Time advances only when `tick` is called, so timers are deterministic and testable.

```ts
type TimerHandle = number;

class Scheduler {
  get now(): number;
  get pendingCount(): number;
  schedule(delayMs: number, callback: () => void): TimerHandle;
  cancel(handle: TimerHandle): boolean;
  tick(deltaMs: number): void;
  clear(): void;
}
```

Errors: `INVALID_DELAY` (`delayMs` is not a finite number >= 0), `INVALID_DELTA` (`deltaMs` is not a
finite number >= 0), `TIMER_LOOP` (more than 10,000 timers fire in one `tick`, usually because a
timer reschedules itself with no delay).

## EventEmitter

A typed publish/subscribe emitter. Each event name maps to a payload type.

```ts
type EventMap = { [K in string]: unknown };

class EventEmitter<TEvents extends EventMap> {
  on<K extends keyof TEvents>(event: K, listener: (payload: TEvents[K]) => void): () => void;
  once<K extends keyof TEvents>(event: K, listener: (payload: TEvents[K]) => void): () => void;
  off<K extends keyof TEvents>(event: K, listener: (payload: TEvents[K]) => void): void;
  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void;
  listenerCount<K extends keyof TEvents>(event: K): number;
  clear(): void;
}
```

`on` and `once` return an unsubscribe function. The emitter throws no engine errors.

## Example

```ts
import { Random, Scheduler, EventEmitter } from 'ts-engine/core';

const random = new Random(42);
const roll = random.int(1, 7); // 1..6

const scheduler = new Scheduler();
scheduler.schedule(500, () => console.log('ready'));
scheduler.tick(500); // prints "ready"

const events = new EventEmitter<{ rolled: number }>();
const unsubscribe = events.on('rolled', (value) => console.log(value));
events.emit('rolled', roll);
unsubscribe();
```
