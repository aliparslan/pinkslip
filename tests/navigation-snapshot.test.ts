import { describe, expect, test } from "bun:test";
import { synchronizeSnapshotSearchValues } from "../packages/client/src/lib/navigation-snapshot";

describe("iOS navigation snapshots", () => {
  test("serializes live search values before the snapshot becomes HTML", () => {
    const written: Array<[string, string]> = [];

    synchronizeSnapshotSearchValues(
      [{ value: "distributed systems" }, { value: "Apple" }],
      [
        { setAttribute: (name: string, value: string) => written.push([name, value]) },
        { setAttribute: (name: string, value: string) => written.push([name, value]) },
      ],
    );

    expect(written).toEqual([
      ["value", "distributed systems"],
      ["value", "Apple"],
    ]);
  });

  test("only pairs controls present in both the live screen and snapshot", () => {
    const written: string[] = [];

    synchronizeSnapshotSearchValues(
      [{ value: "kept" }, { value: "not copied" }],
      [{ setAttribute: (_name: string, value: string) => written.push(value) }],
    );

    expect(written).toEqual(["kept"]);
  });
});
