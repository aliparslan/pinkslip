interface LiveSearchInput {
  value: string;
}

interface SnapshotSearchInput {
  setAttribute(name: string, value: string): void;
}

/**
 * `cloneNode()` carries an input's live value as DOM state, but serializing the
 * clone with `outerHTML` only retains its value attribute. Copy search values
 * into that attribute so iOS back-navigation snapshots match the retained
 * screen instead of briefly showing an empty field.
 */
export function synchronizeSnapshotSearchValues(
  liveInputs: readonly LiveSearchInput[],
  snapshotInputs: readonly SnapshotSearchInput[],
): void {
  const count = Math.min(liveInputs.length, snapshotInputs.length);
  for (let index = 0; index < count; index += 1) {
    snapshotInputs[index]?.setAttribute("value", liveInputs[index]?.value ?? "");
  }
}
