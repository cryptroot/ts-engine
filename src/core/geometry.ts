export interface Point {
  readonly x: number;
  readonly y: number;
}

export function point(x: number, y: number): Point {
  return { x, y };
}

export function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

export function addPoints(a: Point, b: Point): Point {
  return point(a.x + b.x, a.y + b.y);
}

export const DIRECTIONS_4: readonly Point[] = Object.freeze([
  Object.freeze(point(0, -1)),
  Object.freeze(point(1, 0)),
  Object.freeze(point(0, 1)),
  Object.freeze(point(-1, 0)),
]);

export const DIRECTIONS_8: readonly Point[] = Object.freeze([
  ...DIRECTIONS_4,
  Object.freeze(point(1, -1)),
  Object.freeze(point(1, 1)),
  Object.freeze(point(-1, 1)),
  Object.freeze(point(-1, -1)),
]);
