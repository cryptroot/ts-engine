import { EngineError } from './errors';
import { type Point, point } from './geometry';

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export class Grid<T> {
  readonly width: number;
  readonly height: number;
  private readonly cells: Array<T | null>;

  constructor(width: number, height: number) {
    if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
      throw new EngineError(
        'INVALID_GRID_SIZE',
        `Grid size must be positive integers, got ${width}x${height}`,
      );
    }
    this.width = width;
    this.height = height;
    this.cells = new Array<T | null>(width * height).fill(null);
  }

  static fromArray<T>(width: number, height: number, cells: ReadonlyArray<T | null>): Grid<T> {
    const grid = new Grid<T>(width, height);
    if (cells.length !== width * height) {
      throw new EngineError(
        'INVALID_CELLS_LENGTH',
        `Expected ${width * height} cells for a ${width}x${height} grid, got ${cells.length}`,
      );
    }
    for (let index = 0; index < cells.length; index++) {
      grid.cells[index] = cells[index] ?? null;
    }
    return grid;
  }

  isInside(p: Point): boolean {
    return (
      Number.isInteger(p.x) &&
      Number.isInteger(p.y) &&
      p.x >= 0 &&
      p.y >= 0 &&
      p.x < this.width &&
      p.y < this.height
    );
  }

  get(p: Point): T | null {
    return this.cells[this.indexOf(p)] ?? null;
  }

  set(p: Point, value: T | null): void {
    this.cells[this.indexOf(p)] = value;
  }

  isEmpty(p: Point): boolean {
    return this.get(p) === null;
  }

  count(): number {
    let total = 0;
    for (const cell of this.cells) {
      if (cell !== null) total++;
    }
    return total;
  }

  entries(): Array<[Point, T]> {
    const result: Array<[Point, T]> = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const value = this.cells[y * this.width + x] ?? null;
        if (value !== null) result.push([point(x, y), value]);
      }
    }
    return result;
  }

  clear(): void {
    this.cells.fill(null);
  }

  toArray(): Array<T | null> {
    return this.cells.slice();
  }

  private indexOf(p: Point): number {
    if (!this.isInside(p)) {
      throw new EngineError(
        'OUT_OF_BOUNDS',
        `Point (${p.x}, ${p.y}) is outside a ${this.width}x${this.height} grid`,
      );
    }
    return p.y * this.width + p.x;
  }
}
