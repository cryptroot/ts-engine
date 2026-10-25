# ts-engine documentation

Guides for each module in ts-engine. Each guide covers the API, error codes, and examples.

| Guide                            | Subpath import          | Covers                                                      |
| -------------------------------- | ----------------------- | ----------------------------------------------------------- |
| [core.md](core.md)               | `ts-engine/core`        | Errors, points, grid, seeded random, scheduler, events      |
| [data.md](data.md)               | `ts-engine/data`        | Schema builder, versioned content loading, content registry |
| [persistence.md](persistence.md) | `ts-engine/persistence` | Saveable objects, save slots, storage adapters              |

The root entry `ts-engine` re-exports every module.

Game-specific guides are not part of this package. The merge and visual novel guides live in their
own project repositories: `hv-merge` and `vn-studio`.
