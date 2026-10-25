import { describe, expect, expectTypeOf, it } from 'vitest';
import { schema } from '../../src/data/index.ts';
import type { Infer, Schema, ValidationResult } from '../../src/data/index.ts';

function errorsOf<T>(result: ValidationResult<T>): { path: string; message: string }[] {
  if (result.ok) throw new Error('expected validation to fail');
  return result.errors;
}

function valueOf<T>(result: ValidationResult<T>): T {
  if (!result.ok) throw new Error(`expected validation to pass: ${JSON.stringify(result.errors)}`);
  return result.value;
}

describe('schema.string', () => {
  it('accepts strings and rejects other types at the root path', () => {
    const s = schema.string();
    expect(valueOf(s.parse('hi'))).toBe('hi');
    expect(errorsOf(s.parse(3))).toEqual([
      { path: '$', message: 'expected string, received number' },
    ]);
    expect(errorsOf(s.parse(null))[0]?.message).toBe('expected string, received null');
  });

  it('enforces minLength and pattern', () => {
    const s = schema.string({ minLength: 2, pattern: /^[a-z]+$/ });
    expect(valueOf(s.parse('ab'))).toBe('ab');
    expect(errorsOf(s.parse('a'))[0]?.message).toBe('must have at least 2 characters');
    expect(errorsOf(s.parse('A1'))[0]?.message).toBe('must match /^[a-z]+$/');
  });

  it('keeps pattern checks stateless for global regexes', () => {
    const s = schema.string({ pattern: /a/g });
    expect(valueOf(s.parse('a'))).toBe('a');
    expect(valueOf(s.parse('a'))).toBe('a');
  });
});

describe('schema.number', () => {
  it('rejects non-numbers and non-finite values', () => {
    const s = schema.number();
    expect(valueOf(s.parse(1.5))).toBe(1.5);
    expect(errorsOf(s.parse('1'))[0]?.message).toBe('expected number, received string');
    expect(errorsOf(s.parse(Number.NaN))[0]?.message).toBe('must be a finite number');
  });

  it('enforces integer, min and max', () => {
    const s = schema.number({ integer: true, min: 1, max: 5 });
    expect(valueOf(s.parse(3))).toBe(3);
    expect(errorsOf(s.parse(2.5))[0]?.message).toBe('must be an integer');
    expect(errorsOf(s.parse(0))[0]?.message).toBe('must be >= 1');
    expect(errorsOf(s.parse(6))[0]?.message).toBe('must be <= 5');
  });
});

describe('schema.boolean and schema.literal', () => {
  it('validates booleans', () => {
    expect(valueOf(schema.boolean().parse(false))).toBe(false);
    expect(errorsOf(schema.boolean().parse(0))[0]?.message).toBe(
      'expected boolean, received number',
    );
  });

  it('matches exact literal values of any primitive kind', () => {
    expect(valueOf(schema.literal('quest').parse('quest'))).toBe('quest');
    expect(valueOf(schema.literal(2).parse(2))).toBe(2);
    expect(valueOf(schema.literal(true).parse(true))).toBe(true);
    expect(errorsOf(schema.literal('quest').parse('item'))[0]?.message).toBe('expected "quest"');
    expect(errorsOf(schema.literal(2).parse('2'))[0]?.message).toBe('expected 2');
  });
});

describe('schema.enumOf', () => {
  it('accepts listed values and lists alternatives in errors', () => {
    const s = schema.enumOf(['north', 'south']);
    expect(valueOf(s.parse('south'))).toBe('south');
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<'north' | 'south'>();
    expect(errorsOf(s.parse('west'))).toEqual([
      { path: '$', message: 'expected one of "north", "south"' },
    ]);
    expect(errorsOf(s.parse(1))[0]?.message).toBe('expected one of "north", "south"');
  });
});

describe('schema.array', () => {
  const s = schema.array(schema.number());

  it('accepts arrays whose items match', () => {
    expect(valueOf(s.parse([1, 2]))).toEqual([1, 2]);
    expect(valueOf(s.parse([]))).toEqual([]);
  });

  it('rejects non-arrays and reports item paths', () => {
    expect(errorsOf(s.parse({}))[0]?.message).toBe('expected array, received object');
    expect(errorsOf(s.parse([1, 'x', 3]))).toEqual([
      { path: '$[1]', message: 'expected number, received string' },
    ]);
  });
});

describe('schema.record', () => {
  const s = schema.record(schema.boolean());

  it('accepts string-keyed maps', () => {
    expect(valueOf(s.parse({ a: true, b: false }))).toEqual({ a: true, b: false });
  });

  it('rejects arrays, null and bad entries with key paths', () => {
    expect(errorsOf(s.parse([]))[0]?.message).toBe('expected object, received array');
    expect(errorsOf(s.parse(null))[0]?.message).toBe('expected object, received null');
    expect(errorsOf(s.parse({ ok: true, bad: 1 }))).toEqual([
      { path: '$.bad', message: 'expected boolean, received number' },
    ]);
  });

  it('stores a __proto__ key as own data instead of changing the prototype', () => {
    const parsed = valueOf(s.parse(JSON.parse('{"__proto__": true}')));
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(Object.keys(parsed)).toEqual(['__proto__']);
  });
});

describe('schema.object', () => {
  const hero = schema.object({
    id: schema.string({ minLength: 1 }),
    level: schema.number({ integer: true }),
    tags: schema.optional(schema.array(schema.string())),
  });

  it('accepts valid objects and omits absent optional fields', () => {
    expect(valueOf(hero.parse({ id: 'mira', level: 3 }))).toEqual({ id: 'mira', level: 3 });
    expect(valueOf(hero.parse({ id: 'mira', level: 3, tags: ['a'] }))).toEqual({
      id: 'mira',
      level: 3,
      tags: ['a'],
    });
  });

  it('reports required fields and nested paths', () => {
    expect(errorsOf(hero.parse({ level: 3 }))).toEqual([{ path: '$.id', message: 'is required' }]);
    expect(errorsOf(hero.parse({ id: 'mira', level: 1.5 }))).toEqual([
      { path: '$.level', message: 'must be an integer' },
    ]);
    expect(errorsOf(hero.parse({ id: 'mira', level: 1, tags: [1] }))).toEqual([
      { path: '$.tags[0]', message: 'expected string, received number' },
    ]);
  });

  it('treats an explicit undefined optional value as absent', () => {
    expect(valueOf(hero.parse({ id: 'mira', level: 3, tags: undefined }))).toEqual({
      id: 'mira',
      level: 3,
    });
  });

  it('rejects non-object roots', () => {
    expect(errorsOf(hero.parse(['mira']))).toEqual([
      { path: '$', message: 'expected object, received array' },
    ]);
  });

  it('rejects unknown keys by default', () => {
    expect(errorsOf(hero.parse({ id: 'mira', level: 1, extra: true }))).toEqual([
      { path: '$.extra', message: 'unknown key' },
    ]);
  });

  it('keeps unknown keys when passthrough is enabled', () => {
    const open = schema.object({ id: schema.string() }, { passthrough: true });
    expect(valueOf(open.parse({ id: 'x', note: 'kept' }))).toEqual({ id: 'x', note: 'kept' });
  });

  it('does not treat inherited properties as declared fields', () => {
    const constructorShape = schema.object({ constructor: schema.string() });
    expect(errorsOf(constructorShape.parse({}))).toEqual([
      { path: '$.constructor', message: 'is required' },
    ]);
  });

  it('infers optional fields as optional properties', () => {
    expectTypeOf<Infer<typeof hero>>().toEqualTypeOf<{
      id: string;
      level: number;
      tags?: string[];
    }>();

    const shape = schema.object({
      a: schema.string(),
      b: schema.optional(schema.number()),
    });
    expectTypeOf(shape.parse).returns.toEqualTypeOf<ValidationResult<{ a: string; b?: number }>>();

    const optionalNumber = schema.optional(schema.number());
    expectTypeOf(optionalNumber.parse).returns.toEqualTypeOf<ValidationResult<number>>();
  });
});

describe('schema.union', () => {
  const s = schema.union(schema.literal('auto'), schema.number({ min: 0 }));

  it('accepts a value matching any member', () => {
    expect(valueOf(s.parse('auto'))).toBe('auto');
    expect(valueOf(s.parse(4))).toBe(4);
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<'auto' | number>();
  });

  it('rejects values matching no member, reporting the first closest member on ties', () => {
    expect(errorsOf(s.parse(-1))).toEqual([{ path: '$', message: 'expected "auto"' }]);
  });

  it('reports the issues of the closest member when none match', () => {
    const shapes = schema.union(
      schema.object({ kind: schema.literal('a'), a: schema.number() }),
      schema.object({ kind: schema.literal('b'), b: schema.string(), c: schema.boolean() }),
    );
    expect(errorsOf(shapes.parse({ kind: 'b', b: 'x', c: 'no' }))).toEqual([
      { path: '$.c', message: 'expected boolean, received string' },
    ]);
  });
});

describe('schema.refine', () => {
  it('applies the predicate after the base schema passes', () => {
    const even = schema.refine(
      schema.number({ integer: true }),
      (n) => n % 2 === 0,
      'must be even',
    );
    expect(valueOf(even.parse(4))).toBe(4);
    expect(errorsOf(even.parse(3))).toEqual([{ path: '$', message: 'must be even' }]);
    expect(errorsOf(even.parse('4'))[0]?.message).toBe('expected number, received string');
  });

  it('reports refinement issues at nested paths', () => {
    const shape = schema.object({
      min: schema.number(),
      max: schema.number(),
    });
    const ordered = schema.refine(shape, (v) => v.min <= v.max, 'min must not exceed max');
    const range = schema.object({ range: ordered });
    expect(errorsOf(range.parse({ range: { min: 5, max: 1 } }))).toEqual([
      { path: '$.range', message: 'min must not exceed max' },
    ]);
  });
});

describe('error accumulation', () => {
  it('collects issues from every sibling field instead of stopping at the first', () => {
    const s = schema.object({
      name: schema.string(),
      count: schema.number({ integer: true }),
      enabled: schema.boolean(),
    });
    expect(errorsOf(s.parse({ name: 1, count: 'x', enabled: 'yes', extra: 1 }))).toEqual([
      { path: '$.name', message: 'expected string, received number' },
      { path: '$.count', message: 'expected number, received string' },
      { path: '$.enabled', message: 'expected boolean, received string' },
      { path: '$.extra', message: 'unknown key' },
    ]);
  });

  it('collects issues from every array item', () => {
    const s = schema.array(schema.object({ chain: schema.string() }));
    expect(errorsOf(s.parse([{ chain: 'ok' }, {}, { chain: 3 }]))).toEqual([
      { path: '$[1].chain', message: 'is required' },
      { path: '$[2].chain', message: 'expected string, received number' },
    ]);
  });
});

describe('schema path handling and inference', () => {
  it('prefixes issues with a provided base path', () => {
    const s: Schema<number> = schema.number();
    expect(errorsOf(s.parse('x', '$.items[2].chain'))).toEqual([
      { path: '$.items[2].chain', message: 'expected number, received string' },
    ]);
  });

  it('infers the output type of nested compound builders', () => {
    const s = schema.object({
      items: schema.array(
        schema.object({ id: schema.string(), weight: schema.optional(schema.number()) }),
      ),
      meta: schema.record(schema.literal(1)),
    });
    expectTypeOf(s.parse).returns.toEqualTypeOf<
      ValidationResult<{
        items: { id: string; weight?: number }[];
        meta: Record<string, 1>;
      }>
    >();
  });
});
