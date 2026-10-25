/**
 * A game object whose state can be saved and restored.
 *
 * `saveKey` names the object's slot in a save file and must stay unique per object.
 * `schemaVersion` is bumped whenever the snapshot shape changes so older saves can be detected.
 * Snapshots must be JSON-serializable.
 */
export interface Saveable<TSnapshot = unknown> {
  readonly saveKey: string;
  readonly schemaVersion: number;
  snapshot(): TSnapshot;
  restore(snapshot: TSnapshot): void;
}
