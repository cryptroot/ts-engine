export class EngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
