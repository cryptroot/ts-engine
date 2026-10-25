# ts-engine

A headless, renderer-agnostic, game-agnostic TypeScript engine. It provides core primitives, content
data loading and validation, and save persistence. It has no rendering, audio, or input layer. The
host renders the state the engine produces.

Game modules are not part of this package. They live in their own projects and depend on `ts-engine`.

## Requirements

- Node.js 18 or later.
- ESM package with CJS output. It has zero runtime dependencies.

## Install

Install it as a git dependency in your project's `package.json`:

```json
{
  "dependencies": {
    "ts-engine": "github:cryptroot/ts-engine"
  }
}
```

Or run `npm install github:cryptroot/ts-engine`. Installing from git runs the `prepare` script, which
builds `dist/`.

To build a tarball from this repository instead:

```sh
npm install
npm run build
npm pack   # creates ts-engine-0.1.0.tgz
npm install /path/to/ts-engine-0.1.0.tgz
```

## Modules

| Module        | Import                  | Purpose                                                        |
| ------------- | ----------------------- | -------------------------------------------------------------- |
| `core`        | `ts-engine/core`        | Errors, points, grid, seeded random, scheduler, event emitter  |
| `data`        | `ts-engine/data`        | Schema validation, versioned content loading, content registry |
| `persistence` | `ts-engine/persistence` | Save slots, saveable objects, storage adapters                 |

## Subpath imports

Each module has its own subpath export, so you can import only what you use. The root entry
`ts-engine` re-exports every module:

```ts
import { EngineError, EventEmitter, Scheduler } from 'ts-engine/core';
import { ContentRegistry, schema } from 'ts-engine/data';
import { MemorySaveStorage, SaveManager } from 'ts-engine/persistence';
```

Both `import` (ESM) and `require` (CJS) are supported through the `exports` map.

## Development

```sh
npm install
npm run check     # typecheck, lint, format check, tests, and build
```

| Script                 | Action                                                 |
| ---------------------- | ------------------------------------------------------ |
| `npm run build`        | Bundle `src/` to `dist/` (ESM, CJS, and declarations)  |
| `npm run typecheck`    | Run `tsc --noEmit`                                     |
| `npm run test`         | Run the Vitest suite once (`test:watch` runs in watch) |
| `npm run lint`         | Run ESLint                                             |
| `npm run format`       | Format the repository with Prettier                    |
| `npm run format:check` | Check formatting without writing                       |
| `npm run check`        | Run typecheck, lint, format check, tests, and build    |

The Node.js version used for development is in `.nvmrc`.

## Project layout

- `src/`: engine source, one folder per module.
- `tests/`: Vitest unit and integration tests.
- `docs/`: module guides. Start at [docs/README.md](docs/README.md).

## Documentation

See [docs/README.md](docs/README.md) for a guide per module, with the API, error codes, and an
example for each.

## License

This package is licensed under the GNU General Public License v3.0 only. See [LICENSE](LICENSE).
