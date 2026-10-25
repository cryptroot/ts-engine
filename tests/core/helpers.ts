import { EngineError } from '../../src/core/index.ts';

export function engineErrorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof EngineError ? error.code : undefined;
  }
  return undefined;
}
