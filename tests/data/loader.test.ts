import { describe, expect, it } from 'vitest';
import { EngineError } from '../../src/core/index.ts';
import {
  assertValidContent,
  loadContent,
  loadContentOrThrow,
  parseContent,
  schema,
} from '../../src/data/index.ts';
import type { MigrationStep, ValidationResult } from '../../src/data/index.ts';

const itemSchema = schema.object({
  items: schema.array(
    schema.object({
      id: schema.string(),
      chain: schema.optional(schema.string()),
      weight: schema.number(),
    }),
  ),
});

const renameWeight: MigrationStep = {
  fromVersion: 1,
  toVersion: 2,
  migrate(doc) {
    const items = Array.isArray(doc.items) ? doc.items : [];
    return {
      ...doc,
      items: items.map((item: Record<string, unknown>) => ({
        id: item.id,
        weight: item.mass,
      })),
    };
  },
};

const addChain: MigrationStep = {
  fromVersion: 2,
  toVersion: 3,
  migrate(doc) {
    const items = Array.isArray(doc.items) ? doc.items : [];
    return {
      ...doc,
      items: items.map((item: Record<string, unknown>) => ({ ...item, chain: 'main' })),
    };
  },
};

function errorsOf<T>(result: ValidationResult<T>): { path: string; message: string }[] {
  if (result.ok) throw new Error('expected validation to fail');
  return result.errors;
}

function valueOf<T>(result: ValidationResult<T>): T {
  if (!result.ok) throw new Error(`expected validation to pass: ${JSON.stringify(result.errors)}`);
  return result.value;
}

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('expected action to throw');
}

describe('loadContent schemaVersion handling', () => {
  const options = { schema: itemSchema, currentVersion: 3 };

  it('rejects a missing schemaVersion at $.schemaVersion', () => {
    expect(errorsOf(loadContent({ items: [] }, options))).toEqual([
      { path: '$.schemaVersion', message: 'is required' },
    ]);
  });

  it('rejects non-integer schemaVersion values at $.schemaVersion', () => {
    for (const schemaVersion of ['3', 2.5, null, true]) {
      expect(errorsOf(loadContent({ schemaVersion, items: [] }, options))).toEqual([
        { path: '$.schemaVersion', message: 'must be an integer' },
      ]);
    }
  });

  it('rejects a non-object document at $', () => {
    expect(errorsOf(loadContent([], options))).toEqual([
      { path: '$', message: 'expected object document' },
    ]);
    expect(errorsOf(loadContent(null, options))[0]?.path).toBe('$');
  });

  it('reports a newer-than-supported version as an issue instead of throwing', () => {
    const result = loadContent({ schemaVersion: 4, items: [] }, options);
    expect(errorsOf(result)).toEqual([
      {
        path: '$.schemaVersion',
        message: 'version 4 is newer than supported version 3',
      },
    ]);
  });

  it('validates current-version documents directly and strips schemaVersion', () => {
    const result = loadContent(
      { schemaVersion: 3, items: [{ id: 'a', weight: 1, chain: 'x' }] },
      options,
    );
    expect(valueOf(result)).toEqual({ items: [{ id: 'a', weight: 1, chain: 'x' }] });
  });

  it('reports schema issues from the migrated content with their paths', () => {
    const result = loadContent({ schemaVersion: 3, items: [{ id: 'a' }] }, options);
    expect(errorsOf(result)).toEqual([{ path: '$.items[0].weight', message: 'is required' }]);
  });
});

describe('loadContent migrations', () => {
  const options = {
    schema: itemSchema,
    currentVersion: 3,
    migrations: [renameWeight, addChain],
  };

  it('chains steps from the document version up to the current version', () => {
    const result = loadContent({ schemaVersion: 1, items: [{ id: 'a', mass: 5 }] }, options);
    expect(valueOf(result)).toEqual({ items: [{ id: 'a', weight: 5, chain: 'main' }] });
  });

  it('applies only the steps after the document version', () => {
    const result = loadContent({ schemaVersion: 2, items: [{ id: 'a', weight: 2 }] }, options);
    expect(valueOf(result)).toEqual({ items: [{ id: 'a', weight: 2, chain: 'main' }] });
  });

  it('passes each step a document whose schemaVersion matches the step input', () => {
    const seen: unknown[] = [];
    const recorder: MigrationStep = {
      fromVersion: 1,
      toVersion: 2,
      migrate(doc) {
        seen.push(doc.schemaVersion);
        return { ...doc, items: [] };
      },
    };
    const followUp: MigrationStep = {
      fromVersion: 2,
      toVersion: 3,
      migrate(doc) {
        seen.push(doc.schemaVersion);
        return { ...doc, items: [] };
      },
    };
    loadContent(
      { schemaVersion: 1, items: [] },
      { schema: itemSchema, currentVersion: 3, migrations: [recorder, followUp] },
    );
    expect(seen).toEqual([1, 2]);
  });

  it('accepts steps that skip intermediate versions', () => {
    const skip: MigrationStep = {
      fromVersion: 1,
      toVersion: 3,
      migrate: (doc) => ({ ...doc, items: [{ id: 'skipped', weight: 0, chain: 'z' }] }),
    };
    const result = loadContent(
      { schemaVersion: 1, items: [] },
      { schema: itemSchema, currentVersion: 3, migrations: [skip] },
    );
    expect(valueOf(result)).toEqual({ items: [{ id: 'skipped', weight: 0, chain: 'z' }] });
  });

  it('reports a missing migration step instead of throwing', () => {
    const result = loadContent(
      { schemaVersion: 1, items: [] },
      { schema: itemSchema, currentVersion: 3, migrations: [addChain] },
    );
    expect(errorsOf(result)).toEqual([
      {
        path: '$.schemaVersion',
        message: 'missing migration from version 1 to version 3',
      },
    ]);
  });

  it('reports a missing migration when no steps are provided', () => {
    const result = loadContent(
      { schemaVersion: 2, items: [] },
      { schema: itemSchema, currentVersion: 3 },
    );
    expect(errorsOf(result)).toEqual([
      {
        path: '$.schemaVersion',
        message: 'missing migration from version 2 to version 3',
      },
    ]);
  });

  it('ignores steps that would not advance toward the current version', () => {
    const backwards: MigrationStep = {
      fromVersion: 1,
      toVersion: 1,
      migrate: (doc) => doc,
    };
    const result = loadContent(
      { schemaVersion: 1, items: [] },
      { schema: itemSchema, currentVersion: 2, migrations: [backwards] },
    );
    expect(errorsOf(result)[0]?.message).toBe('missing migration from version 1 to version 2');
  });

  it('does not mutate the input document, even when migrations mutate their argument', () => {
    const input = { schemaVersion: 1, items: [{ id: 'a', mass: 5 }] };
    const snapshot = JSON.parse(JSON.stringify(input)) as unknown;
    const mutating: MigrationStep = {
      fromVersion: 1,
      toVersion: 2,
      migrate(doc) {
        const items = doc.items as Record<string, unknown>[];
        items[0] = { id: 'changed', weight: 9 };
        doc.extra = true;
        return { ...doc, items: [{ id: 'a', weight: 5 }] };
      },
    };
    loadContent(input, { schema: itemSchema, currentVersion: 2, migrations: [mutating] });
    expect(input).toEqual(snapshot);
  });

  it('does not share nested objects between the result and the input', () => {
    const input = { schemaVersion: 2, items: [{ id: 'a', weight: 2 }] };
    const result = valueOf(loadContent(input, { schema: itemSchema, currentVersion: 2 }));
    result.items[0] = { id: 'other', weight: 0 };
    expect(input.items[0]).toEqual({ id: 'a', weight: 2 });
  });
});

describe('parseContent', () => {
  const options = { schema: itemSchema, currentVersion: 1 };

  it('parses JSON text and validates the document', () => {
    const result = parseContent('{"schemaVersion":1,"items":[{"id":"a","weight":1}]}', options);
    expect(valueOf(result)).toEqual({ items: [{ id: 'a', weight: 1 }] });
  });

  it('returns a $ issue for invalid JSON instead of throwing', () => {
    const result = parseContent('{"schemaVersion": 1,', options);
    const errors = errorsOf(result);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe('$');
    expect(errors[0]?.message).toMatch(/^invalid JSON: /);
  });

  it('forwards validation issues from the parsed document', () => {
    const result = parseContent('{"schemaVersion":1,"items":"nope"}', options);
    expect(errorsOf(result)).toEqual([
      { path: '$.items', message: 'expected array, received string' },
    ]);
  });
});

describe('assertValidContent and loadContentOrThrow', () => {
  it('returns the value for valid results', () => {
    expect(assertValidContent({ ok: true, value: 7 })).toBe(7);
  });

  it('throws INVALID_CONTENT listing every issue as path: message', () => {
    const error = captureError(() =>
      assertValidContent({
        ok: false,
        errors: [
          { path: '$.items[0].id', message: 'is required' },
          { path: '$.schemaVersion', message: 'must be an integer' },
        ],
      }),
    );
    expect(error).toBeInstanceOf(EngineError);
    expect(error).toMatchObject({ code: 'INVALID_CONTENT' });
    expect((error as Error).message).toBe(
      'Invalid content: $.items[0].id: is required; $.schemaVersion: must be an integer',
    );
  });

  it('loadContentOrThrow returns typed content when valid', () => {
    const content = loadContentOrThrow(
      { schemaVersion: 1, items: [{ id: 'a', weight: 1 }] },
      { schema: itemSchema, currentVersion: 1 },
    );
    expect(content.items[0]?.id).toBe('a');
  });

  it('loadContentOrThrow throws INVALID_CONTENT with the loader issues', () => {
    const error = captureError(() =>
      loadContentOrThrow({ items: [] }, { schema: itemSchema, currentVersion: 1 }),
    );
    expect(error).toMatchObject({ code: 'INVALID_CONTENT' });
    expect((error as Error).message).toBe('Invalid content: $.schemaVersion: is required');
  });
});
